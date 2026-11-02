import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getScenario } from './scenarios.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export function buildArgs(scenario, sourceRevision, projectRoot = root) {
  const args = [
    'build', '--pull', '--platform', 'linux/amd64', '--build-arg', `SOURCE_REVISION=${sourceRevision}`,
    '--tag', scenario.image, '--file', resolve(projectRoot, scenario.dockerfile),
  ];
  if (scenario.target) args.push('--target', scenario.target);
  args.push(resolve(projectRoot, 'standalone/browser'));
  return ['docker', ...args];
}

export function runtimeProbeScript() {
  return [
    'node --input-type=commonjs -e',
    JSON.stringify([
      'const assert=require("node:assert/strict"),fs=require("node:fs"),cp=require("node:child_process"),pw=require("playwright-core");',
      'assert.match(process.version,/^v24\\./,"Node 24 is required");',
      'assert.equal(process.version,"v"+process.env.NODE_EXPECTED_VERSION,"Node version must match the scenario baseline");',
      'const version=require("playwright-core/package.json").version;',
      'assert.equal(version,process.env.PLAYWRIGHT_EXPECTED_VERSION,"playwright-core must match package-lock.json");',
      'const executable=process.env.CHROMIUM_PATH||pw.chromium.executablePath();',
      'assert(fs.existsSync(executable),"Chromium executable missing: "+executable);',
      'const result=cp.spawnSync(executable,["--version"],{encoding:"utf8"});',
      'assert.equal(result.status,0,"Chromium version probe failed: "+(result.error||result.stderr));',
      'console.log(process.version);console.log(version);console.log(result.stdout.trim());',
    ].join(' ')),
  ].join(' ');
}

function redact(value, env) {
  let output = String(value ?? '');
  for (const key of ['BROWSER_CONTROL_TOKEN', 'BROWSER_PROXY_ADMIN_TOKEN']) {
    if (env[key]) output = output.replaceAll(env[key], '[REDACTED]');
  }
  return output.replace(/(authorization:\s*bearer\s+)\S+/giu, '$1[REDACTED]');
}

export async function runScenario({ name, projectRoot = root, outputDir, env = process.env, execute = spawnSync }) {
  const scenario = getScenario(name);
  const out = resolve(outputDir || env.COMPARE_OUTPUT || 'standalone-browser-compare-results');
  mkdirSync(out, { recursive: true });
  const sourceRevision = env.GITHUB_SHA || env.SOURCE_REVISION || 'local-uncommitted';
  const lockPath = resolve(projectRoot, 'standalone/browser/package-lock.json');
  const lockBytes = readFileSync(lockPath);
  const lock = JSON.parse(lockBytes.toString('utf8'));
  const expectedPlaywright = lock.packages[''].dependencies['playwright-core'];
  const report = {
    schemaVersion: 1,
    scenario: name,
    role: scenario.role,
    base: scenario.base,
    sourceRevision,
    dependencyLockSha256: createHash('sha256').update(lockBytes).digest('hex'),
    build: { status: 'not-run', command: buildArgs(scenario, sourceRevision, projectRoot) },
    image: null,
    trivy: { status: 'not-run', version: null, vulnerabilityDatabase: null },
    scan: { status: 'not-run', severity: ['HIGH', 'CRITICAL'], ignoreUnfixed: false, vulnTypes: ['os', 'library'] },
    nodeCoreVulnerabilityCoverage: {
      status: 'uncovered',
      component: `official Node.js ${scenario.nodeVersion} runtime binary`,
      reason: 'Trivy image scanning does not establish coverage of the official Node binary; no complete severity-aware upstream core advisory feed is available.',
    },
    sbom: { status: 'not-run', format: 'CycloneDX JSON' },
    runtime: { status: 'not-run', node: null, playwrightCore: null, chromium: null, user: '10001:10001', sandboxRequired: true },
    e2e: { status: 'not-run' },
    notes: [
      'Diagnostic comparison only; this image is not a release or deployable candidate.',
      'No CVE ignore list, VEX suppression, unfixed-vulnerability suppression, or security relaxation is applied.',
      'Container E2E uses the existing network_mode:none worker, cap_drop:ALL, no-new-privileges, and unchanged Chromium user-namespace seccomp profile.',
    ],
  };
  // Diagnostic comparisons cannot be promotable until Node core binary coverage is established.
  let failed = true;
  let trivyVersionAttempted = false;
  const diagnostics = [];

  function run(args, { allowFailure = false, cwd = projectRoot, commandEnv = env } = {}) {
    let result;
    try {
      result = execute(args[0], args.slice(1), { cwd, encoding: 'utf8', stdio: 'pipe', env: commandEnv });
    } catch (error) {
      result = { status: null, stdout: '', stderr: '', error };
    }
    const status = result.status ?? 127;
    const entry = { command: args.map((part) => part.includes('TOKEN') ? '[REDACTED]' : part).join(' '), exitCode: status };
    if (result.error) entry.error = redact(result.error.message, commandEnv);
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    if (output) diagnostics.push(`$ ${entry.command}\n${redact(output, commandEnv)}`);
    if (!allowFailure && status !== 0) throw new Error(entry.error || `${args[0]} exited ${status}`);
    return { status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error?.message };
  }

  function save(file, content) {
    writeFileSync(resolve(out, file), content);
  }

  function recordTrivyVersion() {
    trivyVersionAttempted = true;
    const observedAt = new Date().toISOString();
    let rawOutput = '';
    try {
      const version = run(['trivy', 'version', '--format', 'json'], { allowFailure: true });
      rawOutput = redact(version.stdout, env);
      if (version.status !== 0) {
        report.trivy = {
          status: 'unavailable',
          observedAt,
          observedAfterScan: report.scan.status !== 'not-run',
          error: redact(version.error || version.stderr, env).trim(),
          rawOutput,
        };
        failed = true;
        return;
      }
      const versionJson = JSON.parse(version.stdout);
      const database = versionJson.VulnerabilityDB;
      const valid = typeof versionJson.Version === 'string'
        && versionJson.Version.trim().length > 0
        && database && Number.isInteger(database.Version) && database.Version > 0
        && typeof database.UpdatedAt === 'string'
        && Number.isFinite(Date.parse(database.UpdatedAt));
      if (!valid) {
        report.trivy = {
          status: 'incomplete',
          observedAt,
          observedAfterScan: report.scan.status !== 'not-run',
          version: versionJson.Version ?? null,
          vulnerabilityDatabase: database ?? null,
          validationError: 'Trivy version or VulnerabilityDB version/update timestamp is missing or invalid.',
          rawOutput,
        };
        failed = true;
        return;
      }
      report.trivy = {
        status: 'recorded',
        observedAt,
        observedAfterScan: report.scan.status !== 'not-run',
        version: versionJson.Version,
        vulnerabilityDatabase: database,
        output: versionJson,
      };
      save('trivy-version.json', `${JSON.stringify(versionJson, null, 2)}\n`);
    } catch (error) {
      report.trivy = {
        status: 'error',
        observedAt,
        observedAfterScan: report.scan.status !== 'not-run',
        error: redact(error.message ?? error, env),
        rawOutput,
      };
      failed = true;
    }
  }

  function inspectImage() {
    const inspected = JSON.parse(run(['docker', 'image', 'inspect', scenario.image]).stdout)[0];
    const history = run(['docker', 'history', '--no-trunc', '--format', '{{.ID}} {{.CreatedBy}}', scenario.image]).stdout;
    report.image = {
      imageId: inspected.Id,
      repoDigests: inspected.RepoDigests ?? [],
      rootfsLayers: inspected.RootFS?.Layers ?? [],
      history: history.trim().split('\n').filter(Boolean),
      labels: inspected.Config?.Labels ?? {},
      os: inspected.Os,
      architecture: inspected.Architecture,
    };
    save('image-identity.json', `${JSON.stringify(report.image, null, 2)}\n`);
  }

  try {
    const build = run(report.build.command, { allowFailure: true });
    report.build.status = build.status === 0 ? 'passed' : 'failed';
    report.build.exitCode = build.status;
    report.build.stdout = redact(build.stdout, env);
    report.build.stderr = redact(build.stderr, env);
    if (build.error) report.build.error = redact(build.error, env);
    if (build.status !== 0) throw new Error(report.build.error || `image build exited ${build.status}`);
    inspectImage();

    const probe = runtimeProbeScript();
    const runtime = run([
      'docker', 'run', '--rm', '--network', 'none', '--read-only', '--tmpfs', '/tmp:size=384m,mode=0700,uid=10001,gid=10001',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
      '--security-opt', 'seccomp=standalone/browser/deploy/chromium-userns-seccomp.json',
      '--user', '10001:10001', '-e', `PLAYWRIGHT_EXPECTED_VERSION=${expectedPlaywright}`, '-e', `NODE_EXPECTED_VERSION=${scenario.nodeVersion}`,
      scenario.image, 'sh', '-ec', probe,
    ], { allowFailure: true });
    report.runtime.output = redact(runtime.stdout, env).trim();
    report.runtime.stderr = redact(runtime.stderr, env).trim();
    report.runtime.exitCode = runtime.status;
    if (runtime.status === 0) {
      const [node, playwrightCore, chromium] = runtime.stdout.trim().split('\n');
      Object.assign(report.runtime, { status: 'passed', node, playwrightCore, chromium });
    } else {
      report.runtime.status = 'failed';
      failed = true;
    }

    report.scan.startedAt = new Date().toISOString();
    const scan = run([
      'trivy', 'image', '--exit-code', '1', '--scanners', 'vuln', '--vuln-type', 'os,library',
      '--severity', 'HIGH,CRITICAL', '--ignore-unfixed=false', '--list-all-pkgs', '--format', 'json',
      '--output', resolve(out, 'trivy-vulnerabilities.json'), scenario.image,
    ], { allowFailure: true });
    report.scan.completedAt = new Date().toISOString();
    report.scan.exitCode = scan.status;
    report.scan.stderr = redact(scan.stderr, env).trim();
    let vulnerabilities = [];
    try {
      const scanJson = JSON.parse(readFileSync(resolve(out, 'trivy-vulnerabilities.json'), 'utf8'));
      vulnerabilities = (scanJson.Results ?? []).flatMap((result) => (result.Vulnerabilities ?? []).map((vulnerability) => ({ target: result.Target, type: result.Type, ...vulnerability })));
      report.scan.findings = {
        total: vulnerabilities.length,
        bySeverity: Object.fromEntries(['CRITICAL', 'HIGH'].map((severity) => [severity, vulnerabilities.filter((item) => item.Severity === severity).length])),
        fixed: vulnerabilities.filter((item) => item.FixedVersion).length,
        unfixed: vulnerabilities.filter((item) => !item.FixedVersion).length,
      };
    } catch (error) {
      report.scan.parseError = redact(error.message, env);
    }
    report.scan.status = scan.status === 0 && !report.scan.parseError ? 'passed' : vulnerabilities.length ? 'findings' : 'error';
    if (report.scan.status !== 'passed') failed = true;
    recordTrivyVersion();

    const sbom = run(['trivy', 'image', '--format', 'cyclonedx', '--output', resolve(out, 'sbom.cdx.json'), scenario.image], { allowFailure: true });
    report.sbom.status = sbom.status === 0 ? 'passed' : 'failed';
    report.sbom.exitCode = sbom.status;
    report.sbom.stderr = redact(sbom.stderr, env).trim();
    if (sbom.status !== 0) failed = true;

    if (runtime.status === 0) {
      let supportFailed = false;
      for (const target of ['proxy', 'gateway', 'fixture']) {
        const tag = `standalone-browser-${target}:candidate`;
        const support = run(['docker', 'build', '--pull', '--platform', 'linux/amd64', '--build-arg', `SOURCE_REVISION=${sourceRevision}`, '--tag', tag, '--file', resolve(projectRoot, 'standalone/browser/Dockerfile'), '--target', target, resolve(projectRoot, 'standalone/browser')], { allowFailure: true });
        if (support.status !== 0) {
          report.e2e = { status: 'failed', phase: `build-${target}`, exitCode: support.status, stderr: redact(support.stderr, env).trim() };
          supportFailed = true;
          failed = true;
          break;
        }
      }
      if (!supportFailed) {
        const tagged = run(['docker', 'tag', scenario.image, 'standalone-browser-worker:candidate'], { allowFailure: true });
        if (tagged.status !== 0) {
          report.e2e = { status: 'failed', phase: 'tag-worker', exitCode: tagged.status, stderr: redact(tagged.stderr, env).trim() };
          failed = true;
        } else {
          const composeFile = resolve(projectRoot, 'standalone/browser/deploy/compose.example.yml');
          const composeEnv = {
            ...env,
            SOURCE_REVISION: sourceRevision,
            BROWSER_CONTROL_TOKEN: env.BROWSER_CONTROL_TOKEN || `compare-only-control-${'c'.repeat(48)}`,
            BROWSER_PROXY_ADMIN_TOKEN: env.BROWSER_PROXY_ADMIN_TOKEN || `compare-only-proxy-${'p'.repeat(48)}`,
          };
          const up = run(['docker', 'compose', '-f', composeFile, '--profile', 'e2e', 'up', '--no-build', '--abort-on-container-exit', '--exit-code-from', 'e2e'], { allowFailure: true, cwd: projectRoot, commandEnv: composeEnv });
          const down = run(['docker', 'compose', '-f', composeFile, '--profile', 'e2e', 'down', '-v', '--remove-orphans'], { allowFailure: true, cwd: projectRoot, commandEnv: composeEnv });
          report.e2e = { status: up.status === 0 && down.status === 0 ? 'passed' : 'failed', exitCode: up.status, cleanupExitCode: down.status, stderr: redact(`${up.stderr}${down.stderr}`, composeEnv).trim() };
          if (report.e2e.status !== 'passed') failed = true;
        }
      }
    } else {
      report.e2e = { status: 'blocked', reason: 'runtime probe did not pass; sandbox E2E cannot be claimed' };
      failed = true;
    }
  } catch (error) {
    failed = true;
    report.runnerError = redact(error.message ?? error, env);
    if (report.build.status === 'not-run') report.build.status = 'failed';
  } finally {
    if (!trivyVersionAttempted) recordTrivyVersion();
    report.result = failed ? 'failed-or-incomplete' : 'all-gates-passed';
    save('diagnostics.log', diagnostics.join('\n\n') + '\n');
    save('report.json', `${JSON.stringify(report, null, 2)}\n`);
    save('report.md', [
      `# ${scenario.role} comparison`, '',
      `- Result: **${report.result}**`, `- Base: \`${scenario.base}\``, `- Source revision: \`${sourceRevision}\``,
      `- Lock SHA-256: \`${report.dependencyLockSha256}\``,
      `- Build / runtime / strict scan / SBOM / fixture E2E: ${report.build.status} / ${report.runtime.status} / ${report.scan.status} / ${report.sbom.status} / ${report.e2e.status}.`,
      `- Node core binary vulnerability coverage: **${report.nodeCoreVulnerabilityCoverage.status}** — ${report.nodeCoreVulnerabilityCoverage.reason}`,
      `- Trivy: ${report.trivy.version ?? report.trivy.status}; DB metadata: \`${JSON.stringify(report.trivy.vulnerabilityDatabase)}\`.`,
      '- Scan policy: OS and library vulnerabilities, HIGH and CRITICAL, `ignore-unfixed=false`; no exceptions.',
      '- Image identity, full package/vulnerability JSON, CycloneDX SBOM, Trivy version/DB metadata and diagnostics are attached when available.', '',
      'This is diagnostic evidence only. Selection requires a passing strict scan, Node core binary vulnerability coverage, and real Chromium sandbox plus fixture E2E; no image was published.', '',
    ].join('\n'));
  }
  return { report, exitCode: failed ? 1 : 0 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const name = process.argv[2];
  const outputDir = process.env.COMPARE_OUTPUT || 'standalone-browser-compare-results';
  let nodeVersion = 'unknown';
  try { nodeVersion = getScenario(name).nodeVersion; } catch {}
  try {
    const { report, exitCode } = await runScenario({ name, outputDir });
    console.log(`comparison ${name}: ${report.result}`);
    process.exitCode = exitCode;
  } catch (error) {
    mkdirSync(resolve(outputDir), { recursive: true });
    const partial = {
      schemaVersion: 1,
      scenario: name ?? 'unknown',
      result: 'failed-or-incomplete',
      runnerError: String(error.message ?? error),
      build: { status: 'not-run' },
      runtime: { status: 'not-run' },
      scan: { status: 'not-run' },
      nodeCoreVulnerabilityCoverage: {
        status: 'uncovered',
        component: `official Node.js ${nodeVersion} runtime binary`,
        reason: 'Trivy image scanning does not establish coverage of the official Node binary; no complete severity-aware upstream core advisory feed is available.',
      },
      sbom: { status: 'not-run' },
      e2e: { status: 'not-run' },
      trivy: { status: 'not-run' },
    };
    writeFileSync(resolve(outputDir, 'report.json'), `${JSON.stringify(partial, null, 2)}\n`);
    writeFileSync(resolve(outputDir, 'report.md'), `# Comparison failed\n\nRunner failed before it could initialize a scenario report: ${partial.runnerError}\n`);
    writeFileSync(resolve(outputDir, 'diagnostics.log'), `${partial.runnerError}\n`);
    console.error(partial.runnerError);
    process.exitCode = 1;
  }
}
