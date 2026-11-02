import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRootDefault = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const nodeArchive = 'https://nodejs.org/dist/v24.22.2/node-v24.22.2-linux-x64.tar.gz';
const nodeSha256 = '361718c444e49af2ca5a110c83ba6a8901143f23ab285ebbef0341f391f482a9';
const ubuntuIndexDigest = 'sha256:6a06111c3b0a8600feadb270aec771dc239bf407b25625f93f44ab00e11f4d3c';
const ubuntuAmd64ManifestDigest = 'sha256:157dc3d6e4a3e4f2c68d12df9df9ed6e808b59af6d4c3757b432b4f519916725';

export const serviceScenarios = Object.freeze({
  proxy: Object.freeze({ role: 'proxy', target: 'proxy', base: `ubuntu:resolute@${ubuntuIndexDigest}`, indexDigest: ubuntuIndexDigest, platformManifestDigest: ubuntuAmd64ManifestDigest, platform: 'linux/amd64', image: 'standalone-browser-services:proxy' }),
  gateway: Object.freeze({ role: 'gateway', target: 'gateway', base: `ubuntu:resolute@${ubuntuIndexDigest}`, indexDigest: ubuntuIndexDigest, platformManifestDigest: ubuntuAmd64ManifestDigest, platform: 'linux/amd64', image: 'standalone-browser-services:gateway' }),
  fixture: Object.freeze({ role: 'fixture', target: 'fixture', base: `ubuntu:resolute@${ubuntuIndexDigest}`, indexDigest: ubuntuIndexDigest, platformManifestDigest: ubuntuAmd64ManifestDigest, platform: 'linux/amd64', image: 'standalone-browser-services:fixture' }),
});

export function serviceBuildArgs(service, sourceRevision, packageLockSha256, projectRoot = projectRootDefault) {
  const scenario = serviceScenarios[service];
  if (!scenario) throw new Error(`Unknown Resolute service: ${service}`);
  return [
    'docker', 'build', '--pull', '--platform', scenario.platform, '--tag', scenario.image,
    '--file', resolve(projectRoot, 'standalone/browser/compare/Dockerfile.services.resolute'),
    '--target', scenario.target,
    '--build-arg', `SOURCE_REVISION=${sourceRevision}`,
    '--build-arg', `PACKAGE_LOCK_SHA256=${packageLockSha256}`,
    '--build-arg', 'NODE_VERSION=24.22.2',
    resolve(projectRoot, 'standalone/browser'),
  ];
}

export function serviceScanArgs(image, outputPath) {
  return [
    'trivy', 'image', '--exit-code', '1', '--scanners', 'vuln', '--vuln-type', 'os,library',
    '--severity', 'HIGH,CRITICAL', '--ignore-unfixed=false', '--list-all-pkgs', '--format', 'json',
    '--output', outputPath, image,
  ];
}

function countFindings(scanJson) {
  if (!scanJson || !Array.isArray(scanJson.Results)) throw new Error('Trivy report has no Results array.');
  const vulnerabilities = scanJson.Results.flatMap((result) => (result.Vulnerabilities ?? []).map((vulnerability) => ({ target: result.Target, type: result.Type, ...vulnerability })));
  return {
    total: vulnerabilities.length,
    bySeverity: Object.fromEntries(['CRITICAL', 'HIGH'].map((severity) => [severity, vulnerabilities.filter((item) => item.Severity === severity).length])),
    fixed: vulnerabilities.filter((item) => Boolean(item.FixedVersion)).length,
    unfixed: vulnerabilities.filter((item) => !item.FixedVersion).length,
    packages: scanJson.Results.reduce((sum, result) => sum + (Array.isArray(result.Packages) ? result.Packages.length : 0), 0),
  };
}

export async function runServiceScenario({ service, projectRoot = projectRootDefault, outputDir, env = process.env, execute = spawnSync }) {
  const scenario = serviceScenarios[service];
  if (!scenario) throw new Error(`Unknown Resolute service: ${service}`);
  const output = resolve(outputDir || env.COMPARE_OUTPUT || `standalone-browser-services-results/${service}`);
  mkdirSync(output, { recursive: true });
  const sourceRevision = env.GITHUB_SHA || env.SOURCE_REVISION || 'local-uncommitted';
  const packageLockPath = resolve(projectRoot, 'standalone/browser/package-lock.json');
  const packageLockBytes = readFileSync(packageLockPath);
  const packageLockSha256 = createHash('sha256').update(packageLockBytes).digest('hex');
  const report = {
    schemaVersion: 1,
    service,
    role: scenario.role,
    result: 'failed-or-incomplete',
    sourceRevision,
    source: {
      repository: 'https://github.com/404404/AI-Bots',
      dockerfile: 'standalone/browser/compare/Dockerfile.services.resolute',
      packageLock: 'standalone/browser/package-lock.json',
      packageLockSha256,
      node: { version: '24.22.2', source: nodeArchive, sha256: nodeSha256, license: 'MIT' },
      base: { reference: scenario.base, indexDigest: scenario.indexDigest, platformManifestDigest: scenario.platformManifestDigest, platform: scenario.platform, os: 'Ubuntu 26.04 Resolute', provenance: 'https://github.com/docker-library/repo-info/blob/master/repos/ubuntu/remote/resolute.md' },
    },
    nodeCoreVulnerabilityCoverage: {
      status: 'uncovered',
      component: 'official Node.js 24.22.2 runtime binary',
      reason: 'Trivy image scanning does not establish complete vulnerability coverage for the official Node.js binary.',
    },
    build: { status: 'not-run', command: null, exitCode: null },
    image: null,
    scan: { status: 'not-run', severity: ['HIGH', 'CRITICAL'], vulnTypes: ['os', 'library'], ignoreUnfixed: false, outputFile: 'trivy-vulnerabilities.json', startedAt: null, completedAt: null, findings: null },
    sbom: { status: 'not-run', format: 'CycloneDX JSON', path: 'sbom.cdx.json' },
    trivy: { status: 'not-run', expectedVersion: '0.70.0', version: null, vulnerabilityDatabase: null, observedAt: null },
    diagnostics: [],
  };
  let failed = true; // Node core vulnerability coverage is deliberately uncovered.
  let runnerError;

  function save(file, content) {
    writeFileSync(resolve(output, file), content);
  }

  function run(args, { allowFailure = false } = {}) {
    let result;
    try {
      result = execute(args[0], args.slice(1), { cwd: projectRoot, encoding: 'utf8', stdio: 'pipe', maxBuffer: 8 * 1024 * 1024, env });
    } catch (error) {
      result = { status: null, stdout: '', stderr: '', error };
    }
    const exitCode = result.status ?? (result.error ? null : 127);
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    const entry = { command: args.map((part) => part.includes('TOKEN') ? '[REDACTED]' : part).join(' '), exitCode, stdout, stderr };
    if (result.error) entry.error = { code: result.error.code ?? null, message: result.error.message ?? String(result.error) };
    report.diagnostics.push(entry);
    if (!allowFailure && exitCode !== 0) throw new Error(result.error?.message || `${args[0]} exited ${exitCode}`);
    return { status: exitCode, stdout, stderr, error: result.error };
  }

  try {
    const buildArgs = serviceBuildArgs(service, sourceRevision, packageLockSha256, projectRoot);
    report.build.command = buildArgs;
    const build = run(buildArgs, { allowFailure: true });
    report.build.exitCode = build.status;
    if (build.status !== 0) {
      report.build.status = 'failed';
      report.build.stderr = build.stderr;
      throw new Error(build.error?.message || `Docker build exited ${build.status}.`);
    }
    report.build.status = 'passed';

    const inspected = JSON.parse(run(['docker', 'image', 'inspect', scenario.image]).stdout)[0];
    const history = run(['docker', 'history', '--no-trunc', '--format', '{{.ID}} {{.CreatedBy}}', scenario.image]).stdout;
    report.image = {
      reference: scenario.image,
      imageId: inspected.Id,
      repoDigests: inspected.RepoDigests ?? [],
      rootfsLayers: inspected.RootFS?.Layers ?? [],
      history: history.trim().split('\n').filter(Boolean),
      labels: inspected.Config?.Labels ?? {},
      os: inspected.Os,
      architecture: inspected.Architecture,
      expectedArchitecture: 'amd64',
    };
    if (report.image.os !== 'linux' || report.image.architecture !== 'amd64') throw new Error('Built service image platform does not match linux/amd64.');
    const expectedLabels = {
      'org.opencontainers.image.revision': sourceRevision,
      'org.opencontainers.image.base.digest': scenario.indexDigest,
      'org.opencontainers.image.base.platform.manifest.digest': scenario.platformManifestDigest,
      'io.404404.platform': scenario.platform,
      'io.404404.runtime.node.version': '24.22.2',
      'io.404404.package-lock.sha256': packageLockSha256,
      'io.404404.scan.node-core.coverage': 'uncovered',
      'io.404404.role': service,
    };
    const mismatchedLabels = Object.entries(expectedLabels).filter(([key, value]) => report.image.labels[key] !== value).map(([key]) => key);
    report.image.labelValidation = { status: mismatchedLabels.length === 0 ? 'passed' : 'failed', expectedLabels, mismatchedLabels };
    save('image-identity.json', `${JSON.stringify(report.image, null, 2)}\n`);
    if (mismatchedLabels.length) throw new Error(`Built service image provenance labels do not match expected values: ${mismatchedLabels.join(', ')}.`);

    const vulnerabilityPath = resolve(output, 'trivy-vulnerabilities.json');
    report.scan.startedAt = new Date().toISOString();
    const scan = run(serviceScanArgs(scenario.image, vulnerabilityPath), { allowFailure: true });
    report.scan.completedAt = new Date().toISOString();
    report.scan.exitCode = scan.status;
    report.scan.stderr = scan.stderr;
    try {
      if (!existsSync(vulnerabilityPath)) throw new Error('Trivy did not write trivy-vulnerabilities.json.');
      const scanRaw = readFileSync(vulnerabilityPath, 'utf8');
      report.scan.outputFile = 'trivy-vulnerabilities.json';
      report.scan.outputBytes = Buffer.byteLength(scanRaw);
      report.scan.outputSha256 = createHash('sha256').update(scanRaw).digest('hex');
      report.scan.findings = countFindings(JSON.parse(scanRaw));
    } catch (error) {
      report.scan.parseError = error.message ?? String(error);
    }
    if (scan.status === 0 && report.scan.findings && report.scan.findings.total === 0) report.scan.status = 'passed-no-high-critical';
    else if (scan.status === 1 && report.scan.findings && report.scan.findings.total > 0) report.scan.status = 'high-critical-findings';
    else report.scan.status = 'incomplete';
    if (report.scan.status !== 'passed-no-high-critical') failed = true;

    const sbom = run(['trivy', 'image', '--format', 'cyclonedx', '--output', resolve(output, report.sbom.path), scenario.image], { allowFailure: true });
    report.sbom.exitCode = sbom.status;
    report.sbom.stderr = sbom.stderr;
    try {
      if (sbom.status !== 0 || !existsSync(resolve(output, report.sbom.path))) throw new Error('Trivy did not write a successful CycloneDX SBOM.');
      const sbomRaw = readFileSync(resolve(output, report.sbom.path));
      const sbomJson = JSON.parse(sbomRaw.toString('utf8'));
      if (sbomJson.bomFormat !== 'CycloneDX' || !Array.isArray(sbomJson.components)) throw new Error('Trivy SBOM is not a CycloneDX document with a components array.');
      report.sbom.status = 'passed';
      report.sbom.componentCount = sbomJson.components.length;
      report.sbom.outputBytes = sbomRaw.byteLength;
      report.sbom.outputSha256 = createHash('sha256').update(sbomRaw).digest('hex');
    } catch (error) {
      report.sbom.status = 'incomplete';
      report.sbom.error = error.message ?? String(error);
      failed = true;
    }

    const observedAt = new Date().toISOString();
    report.trivy.observedAt = observedAt;
    const version = run(['trivy', 'version', '--format', 'json'], { allowFailure: true });
    report.trivy.versionExitCode = version.status;
    report.trivy.rawOutput = version.stdout;
    report.trivy.stderr = version.stderr;
    if (version.status === 0) {
      save('trivy-version.json', `${version.stdout.trim()}\n`);
      try {
        const versionData = JSON.parse(version.stdout);
        const database = versionData.VulnerabilityDB;
        const valid = typeof versionData.Version === 'string' && versionData.Version.trim().length > 0
          && database && Number.isInteger(database.Version) && database.Version > 0
          && typeof database.UpdatedAt === 'string' && Number.isFinite(Date.parse(database.UpdatedAt));
        if (valid) {
          report.trivy.version = versionData.Version;
          report.trivy.vulnerabilityDatabase = database;
          report.trivy.status = versionData.Version === report.trivy.expectedVersion ? 'recorded' : 'unexpected-version';
        } else {
          report.trivy.status = 'incomplete';
          report.trivy.validationError = 'Trivy version or VulnerabilityDB metadata is missing or invalid.';
        }
      } catch (error) {
        report.trivy.status = 'incomplete';
        report.trivy.validationError = error.message ?? String(error);
      }
    } else {
      report.trivy.status = 'unavailable';
      report.trivy.error = version.error?.message || version.stderr;
    }
    if (report.trivy.status !== 'recorded') failed = true;
  } catch (error) {
    failed = true;
    runnerError = error.message ?? String(error);
  } finally {
    if (runnerError) report.error = runnerError;
    if (report.scan.status === 'not-run') report.scan.status = 'blocked';
    if (report.sbom.status === 'not-run') report.sbom.status = 'blocked';
    if (report.trivy.status === 'not-run') report.trivy.status = 'not-run-after-earlier-failure';
    report.result = failed ? 'failed-or-incomplete' : 'all-gates-passed';
    save('diagnostics.log', `${report.diagnostics.map((entry) => `$ ${entry.command}\n${entry.stdout}${entry.stderr}${entry.error ? `${JSON.stringify(entry.error)}\n` : ''}`).join('\n')}\n`);
    save('report.json', `${JSON.stringify(report, null, 2)}\n`);
    save('report.md', [
      `# Resolute ${service} image comparison`, '',
      `- Result: **${report.result}**`,
      `- Base: \`${scenario.base}\` (${scenario.platform})`,
      `- Image ID: \`${report.image?.imageId ?? 'unavailable'}\``,
      `- Trivy: ${report.trivy.version ?? report.trivy.status}; scan: ${report.scan.status}; SBOM: ${report.sbom.status}.`,
      `- Node core vulnerability coverage: **${report.nodeCoreVulnerabilityCoverage.status}**.`,
      '- This is a diagnostic-only image. No image is published; Node core coverage remains uncovered.', '',
    ].join('\n'));
  }
  return { report, exitCode: failed ? 1 : 0 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const service = process.argv[2];
  const outputDir = process.env.COMPARE_OUTPUT || `standalone-browser-services-results/${service}`;
  try {
    const { report, exitCode } = await runServiceScenario({ service, outputDir });
    console.log(`service comparison ${service}: ${report.result}`);
    process.exitCode = exitCode;
  } catch (error) {
    mkdirSync(resolve(outputDir), { recursive: true });
    const partial = { schemaVersion: 1, service: service ?? 'unknown', result: 'failed-or-incomplete', error: String(error.message ?? error), nodeCoreVulnerabilityCoverage: { status: 'uncovered' } };
    writeFileSync(resolve(outputDir, 'report.json'), `${JSON.stringify(partial, null, 2)}\n`);
    writeFileSync(resolve(outputDir, 'report.md'), `# Resolute service comparison failed\n\n${partial.error}\n`);
    writeFileSync(resolve(outputDir, 'diagnostics.log'), `${partial.error}\n`);
    console.error(partial.error);
    process.exitCode = 1;
  }
}
