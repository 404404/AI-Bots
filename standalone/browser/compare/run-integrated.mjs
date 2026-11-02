import { spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScenario } from './run-scenario.mjs';
import { runServiceScenario, serviceScenarios } from './run-services.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const services = ['proxy', 'gateway', 'fixture'];
const outputNames = {
  worker: 'standalone-browser-compare:resolute',
  proxy: 'standalone-browser-services:proxy',
  gateway: 'standalone-browser-services:gateway',
  fixture: 'standalone-browser-services:fixture',
  e2eRunner: 'standalone-browser-services:e2e-runner',
};
export function integratedBuildArgs(target, sourceRevision, lockSha256, projectRoot = root) {
  if (!['e2e-runner'].includes(target)) throw new Error(`Unknown integrated target: ${target}`);
  const scenario = serviceScenarios.gateway;
  return ['docker', 'build', '--pull', '--platform', scenario.platform, '--tag', outputNames.e2eRunner,
    '--file', resolve(projectRoot, 'standalone/browser/compare/Dockerfile.services.resolute'), '--target', target,
    '--build-arg', `SOURCE_REVISION=${sourceRevision}`, '--build-arg', `PACKAGE_LOCK_SHA256=${lockSha256}`,
    '--build-arg', 'NODE_VERSION=24.22.2', resolve(projectRoot, 'standalone/browser')];
}

export function integratedImageScanArgs(image, outputPath) {
  return ['trivy', 'image', '--exit-code', '1', '--scanners', 'vuln', '--vuln-type', 'os,library',
    '--severity', 'HIGH,CRITICAL', '--ignore-unfixed=false', '--list-all-pkgs', '--format', 'json', '--output', outputPath, image];
}

export function composeProjectName(env) {
  if (env.GITHUB_ACTIONS !== 'true' || !/^\d+$/u.test(env.GITHUB_RUN_ID ?? '') || !/^\d+$/u.test(env.GITHUB_RUN_ATTEMPT ?? '')) {
    throw new Error('Integrated Compose E2E requires a GitHub Actions runner with numeric GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT.');
  }
  return `browser-compare-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
}

export function validateComposeContainerImages(containers, expectedImages) {
  if (!Array.isArray(containers)) throw new Error('Docker inspect did not return a container array.');
  const actual = {};
  for (const container of containers) {
    const serviceName = container.Config?.Labels?.['com.docker.compose.service'];
    if (!serviceName) continue;
    if (actual[serviceName]) throw new Error(`Compose returned duplicate containers for ${serviceName}.`);
    actual[serviceName] = { containerId: container.Id, image: container.Image, configuredImage: container.Config.Image };
  }
  for (const [serviceName, imageId] of Object.entries(expectedImages)) {
    if (actual[serviceName]?.image !== imageId) throw new Error(`Container ${serviceName} ran image ${actual[serviceName]?.image ?? 'missing'}, expected ${imageId}.`);
  }
  return actual;
}

function scrub(value, env) {
  let result = String(value ?? '');
  for (const key of ['BROWSER_CONTROL_TOKEN', 'BROWSER_PROXY_ADMIN_TOKEN']) if (env[key]) result = result.replaceAll(env[key], '[REDACTED]');
  return result.replace(/(authorization:\s*bearer\s+)\S+/giu, '$1[REDACTED]');
}

export async function runIntegrated({ projectRoot = root, outputDir, env = process.env, execute = spawnSync, runWorker = runScenario, runService = runServiceScenario } = {}) {
  const output = resolve(outputDir || env.COMPARE_OUTPUT || 'standalone-browser-integrated-results');
  mkdirSync(output, { recursive: true });
  const sourceRevision = env.GITHUB_SHA || env.SOURCE_REVISION || 'local-uncommitted';
  const lockBytes = readFileSync(resolve(projectRoot, 'standalone/browser/package-lock.json'));
  const lockSha256 = createHash('sha256').update(lockBytes).digest('hex');
  const report = {
    schemaVersion: 1, result: 'failed-or-incomplete', sourceRevision, packageLockSha256: lockSha256,
    nodeCoreVulnerabilityCoverage: { status: 'uncovered', component: 'official Node.js 24.22.2 runtime binary', reason: 'Trivy and the known-advisory auxiliary audit do not establish complete Node.js core vulnerability coverage.' },
    images: {}, scans: {}, e2e: { status: 'not-run' }, diagnostics: [],
  };
  let failed = true;
  const run = (args, commandEnv = env) => {
    let result;
    try { result = execute(args[0], args.slice(1), { cwd: projectRoot, encoding: 'utf8', stdio: 'pipe', maxBuffer: 16 * 1024 * 1024, env: commandEnv }); }
    catch (error) { result = { status: null, stdout: '', stderr: '', error }; }
    const status = result.status ?? (result.error ? null : 127);
    const entry = { command: args.join(' '), exitCode: status, stdout: scrub(result.stdout, commandEnv), stderr: scrub(result.stderr, commandEnv) };
    if (result.error) entry.error = { code: result.error.code ?? null, message: scrub(result.error.message, commandEnv) };
    report.diagnostics.push(entry);
    return { status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error };
  };
  const inspectId = (image) => {
    const inspected = run(['docker', 'image', 'inspect', image]);
    if (inspected.status !== 0) throw new Error(`Could not inspect ${image}: ${scrub(inspected.stderr, env)}`);
    const data = JSON.parse(inspected.stdout)[0];
    if (!/^sha256:[a-f0-9]{64}$/u.test(data.Id ?? '')) throw new Error(`Invalid image config ID for ${image}.`);
    return data.Id;
  };
  const recordScan = (name, image, imageId) => {
    const dir = resolve(output, name);
    mkdirSync(dir, { recursive: true });
    const jsonPath = resolve(dir, 'trivy-vulnerabilities.json');
    const scan = run(integratedImageScanArgs(imageId, jsonPath));
    let findings = null;
    let parseError = null;
    try {
      if (!existsSync(jsonPath)) throw new Error('Trivy JSON report missing.');
      const raw = readFileSync(jsonPath);
      const parsed = JSON.parse(raw.toString('utf8'));
      if (!Array.isArray(parsed.Results)) throw new Error('Trivy Results array missing.');
      const all = parsed.Results.flatMap((entry) => (entry.Vulnerabilities ?? []).map((v) => ({ severity: v.Severity, fixed: Boolean(v.FixedVersion) })));
      findings = { total: all.length, high: all.filter((v) => v.severity === 'HIGH').length, critical: all.filter((v) => v.severity === 'CRITICAL').length, fixed: all.filter((v) => v.fixed).length, unfixed: all.filter((v) => !v.fixed).length, sha256: createHash('sha256').update(raw).digest('hex') };
    } catch (error) { parseError = String(error.message ?? error); }
    const sbomPath = resolve(dir, 'sbom.cdx.json');
    const sbomResult = run(['trivy', 'image', '--format', 'cyclonedx', '--output', sbomPath, imageId]);
    let sbom = { status: 'incomplete' };
    try {
      if (sbomResult.status !== 0 || !existsSync(sbomPath)) throw new Error('CycloneDX SBOM missing or Trivy failed.');
      const raw = readFileSync(sbomPath);
      const doc = JSON.parse(raw.toString('utf8'));
      if (doc.bomFormat !== 'CycloneDX' || !Array.isArray(doc.components)) throw new Error('Invalid CycloneDX document.');
      sbom = { status: 'recorded', components: doc.components.length, sha256: createHash('sha256').update(raw).digest('hex') };
    } catch (error) { sbom.error = String(error.message ?? error); }
    const version = run(['trivy', 'version', '--format', 'json']);
    let trivy = { status: 'incomplete', observedAt: new Date().toISOString(), rawOutput: scrub(version.stdout, env), stderr: scrub(version.stderr, env) };
    try {
      const metadata = JSON.parse(version.stdout);
      const db = metadata.VulnerabilityDB;
      const valid = version.status === 0 && metadata.Version === '0.70.0' && db && Number.isInteger(db.Version) && db.Version > 0 && typeof db.UpdatedAt === 'string' && Number.isFinite(Date.parse(db.UpdatedAt));
      trivy = { status: valid ? 'recorded' : 'incomplete', version: metadata.Version ?? null, vulnerabilityDatabase: db ?? null, observedAt: new Date().toISOString(), rawOutput: scrub(version.stdout, env), stderr: scrub(version.stderr, env), ...(valid ? {} : { error: 'Trivy version or vulnerability database metadata is missing, invalid, or unexpected.' }) };
    } catch (error) { trivy.error = String(error.message ?? error); }
    report.scans[name] = { image, imageConfigId: imageId, status: scan.status === 0 && findings?.total === 0 ? 'passed' : scan.status === 1 && findings?.total ? 'findings' : 'incomplete', exitCode: scan.status, stderr: scrub(scan.stderr, env), findings, parseError, sbom, sbomExitCode: sbomResult.status, trivy };
    if (report.scans[name].status !== 'passed' || sbom.status !== 'recorded' || trivy.status !== 'recorded') failed = true;
  };

  try {
    const workerDir = resolve(output, 'worker');
    try {
      const worker = await runWorker({ name: 'resolute', projectRoot, outputDir: workerDir, env: { ...env, GITHUB_SHA: sourceRevision }, execute, runE2E: false });
      const workerImageId = worker.report.image?.imageId;
      report.images.worker = { image: outputNames.worker, imageConfigId: workerImageId, buildStatus: worker.report.build.status, runtimeStatus: worker.report.runtime.status, sourceReport: 'worker/report.json' };
      if (workerImageId) recordScan('worker', outputNames.worker, workerImageId);
      else { report.scans.worker = { status: 'blocked', reason: 'worker build did not produce a verified image config ID' }; failed = true; }
    } catch (error) {
      report.images.worker = { image: outputNames.worker, buildStatus: 'failed-or-incomplete', error: scrub(error.message ?? error, env), sourceReport: 'worker/report.json' };
      report.scans.worker = { status: 'blocked', reason: 'worker runner threw before it could provide a verified config ID' };
      failed = true;
    }

    for (const service of services) {
      const serviceDir = resolve(output, service);
      try {
        const result = await runService({ service, projectRoot, outputDir: serviceDir, env: { ...env, GITHUB_SHA: sourceRevision }, execute });
        report.images[service] = { image: outputNames[service], imageConfigId: result.report.image?.imageId ?? null, buildStatus: result.report.build.status, sourceReport: `${service}/report.json` };
        if (result.report.image?.imageId) recordScan(service, outputNames[service], result.report.image.imageId);
        else { report.scans[service] = { status: 'blocked', reason: 'service build did not produce a verified image config ID' }; failed = true; }
      } catch (error) {
        report.images[service] = { image: outputNames[service], buildStatus: 'failed', error: scrub(error.message ?? error, env) };
        report.scans[service] = { status: 'blocked', reason: 'service build failed' };
        failed = true;
      }
    }

    const e2eImage = outputNames.e2eRunner;
    const e2eBuild = run(integratedBuildArgs('e2e-runner', sourceRevision, lockSha256, projectRoot));
    report.images.e2eRunner = { image: e2eImage, buildStatus: e2eBuild.status === 0 ? 'passed' : 'failed', stderr: scrub(e2eBuild.stderr, env) };
    if (e2eBuild.status === 0) {
      try { report.images.e2eRunner.imageConfigId = inspectId(e2eImage); recordScan('e2eRunner', e2eImage, report.images.e2eRunner.imageConfigId); }
      catch (error) { report.images.e2eRunner.error = scrub(error.message ?? error, env); report.scans.e2eRunner = { status: 'incomplete' }; failed = true; }
    } else { report.scans.e2eRunner = { status: 'blocked', reason: 'E2E runner build failed' }; failed = true; }

    const requiredNames = ['worker', ...services, 'e2eRunner'];
    const built = requiredNames.every((name) => report.images[name]?.imageConfigId && report.images[name]?.buildStatus === 'passed');
    if (!built) {
      report.e2e = { status: 'blocked', reason: 'one or more required images were not successfully built and identified' };
    } else {
      const projectName = composeProjectName(env);
      const requiredConfigIds = {
        worker: report.images.worker.imageConfigId,
        proxy: report.images.proxy.imageConfigId,
        gateway: report.images.gateway.imageConfigId,
        fixture: report.images.fixture.imageConfigId,
        e2eRunner: report.images.e2eRunner.imageConfigId,
      };
      const overridePath = resolve(output, 'compose.e2e-override.yml');
      writeFileSync(overridePath, [
        'services:',
        `  worker:\n    image: ${requiredConfigIds.worker}`,
        `  egress:\n    image: ${requiredConfigIds.proxy}`,
        `  gateway:\n    image: ${requiredConfigIds.gateway}`,
        `  fixture:\n    image: ${requiredConfigIds.fixture}`,
        `  e2e:\n    image: ${requiredConfigIds.e2eRunner}`,
        '',
      ].join('\n'));
      const composeFile = resolve(projectRoot, 'standalone/browser/deploy/compose.example.yml');
      const composeEnv = { ...env, SOURCE_REVISION: sourceRevision,
        BROWSER_CONTROL_TOKEN: env.BROWSER_CONTROL_TOKEN || `compare-control-${randomBytes(32).toString('hex')}`,
        BROWSER_PROXY_ADMIN_TOKEN: env.BROWSER_PROXY_ADMIN_TOKEN || `compare-proxy-${randomBytes(32).toString('hex')}` };
      report.e2e.projectName = projectName;
      const prefix = ['docker', 'compose', '-p', projectName, '-f', composeFile, '-f', overridePath, '--profile', 'e2e'];
      const up = run([...prefix, 'up', '--no-build', '--abort-on-container-exit', '--exit-code-from', 'e2e'], composeEnv);
      const listed = run([...prefix, 'ps', '-a', '-q'], composeEnv);
      let containerImages = {};
      let containerInspectionError = null;
      try {
        if (listed.status !== 0) throw new Error(`Compose ps failed: ${listed.stderr}`);
        const containerIds = listed.stdout.trim().split(/\s+/u).filter(Boolean);
        if (!containerIds.length) throw new Error('Compose returned no containers to verify.');
        const inspectedContainers = run(['docker', 'inspect', ...containerIds], composeEnv);
        if (inspectedContainers.status !== 0) throw new Error(`docker inspect failed: ${inspectedContainers.stderr}`);
        const containers = JSON.parse(inspectedContainers.stdout);
        const expectedContainers = { worker: requiredConfigIds.worker, egress: requiredConfigIds.proxy, gateway: requiredConfigIds.gateway, fixture: requiredConfigIds.fixture, e2e: requiredConfigIds.e2eRunner };
        containerImages = validateComposeContainerImages(containers, expectedContainers);
      } catch (error) { containerInspectionError = scrub(error.message ?? error, composeEnv); }
      const down = run([...prefix, 'down', '-v', '--remove-orphans'], composeEnv);
      report.e2e = { status: up.status === 0 && down.status === 0 && !containerInspectionError ? 'passed' : 'failed', exitCode: up.status, cleanupExitCode: down.status, scannedImageConfigIds: requiredConfigIds, containers: containerImages, containerInspectionError, containerInspectionPhase: 'after-compose-up-before-cleanup', stderr: scrub(`${up.stderr}${down.stderr}`, composeEnv), projectName };
      if (report.e2e.status !== 'passed') failed = true;
    }
  } catch (error) {
    report.error = scrub(error.message ?? error, env);
    failed = true;
  } finally {
    report.result = failed ? 'failed-or-incomplete' : 'all-gates-passed';
    report.diagnostics = report.diagnostics.map((entry) => ({ ...entry, stdout: scrub(entry.stdout, env), stderr: scrub(entry.stderr, env) }));
    writeFileSync(resolve(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(resolve(output, 'diagnostics.log'), report.diagnostics.map((entry) => `$ ${entry.command} [${entry.exitCode}]\n${entry.stdout}${entry.stderr}${entry.error ? JSON.stringify(entry.error) : ''}`).join('\n'));
    writeFileSync(resolve(output, 'report.md'), [`# Resolute integrated image comparison`, '', `- Result: **${report.result}**`, `- Source revision: \`${sourceRevision}\``, `- Node core vulnerability coverage: **uncovered**.`, `- E2E: ${report.e2e.status}.`, `- Per-image strict Trivy scan and CycloneDX SBOM are recorded independently.`, '- Diagnostic only: no image is published; Node core coverage remains uncovered.', ''].join('\n'));
  }
  return { report, exitCode: failed ? 1 : 0 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputDir = process.env.COMPARE_OUTPUT || 'standalone-browser-integrated-results';
  try {
    const { report, exitCode } = await runIntegrated({ outputDir });
    console.log(`integrated comparison: ${report.result}`);
    process.exitCode = exitCode;
  } catch (error) {
    mkdirSync(resolve(outputDir), { recursive: true });
    writeFileSync(resolve(outputDir, 'report.json'), `${JSON.stringify({ schemaVersion: 1, result: 'failed-or-incomplete', error: String(error.message ?? error), nodeCoreVulnerabilityCoverage: { status: 'uncovered' } }, null, 2)}\n`);
    writeFileSync(resolve(outputDir, 'diagnostics.log'), `${String(error.message ?? error)}\n`);
    process.exitCode = 1;
  }
}
