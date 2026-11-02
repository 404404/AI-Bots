import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { grypeScanArgs, syftScanArgs } from './run-scenario.mjs';
import { summarizeNodeGrypeFindings, validateGrypeDatabase, validateNodeBinarySbom } from './node-binary-audit.mjs';

export const nodeAuditPolicy = Object.freeze({
  syftVersion: '1.55.0',
  grypeVersion: '0.121.0',
  maximumDatabaseAgeHours: 48,
  severities: ['HIGH', 'CRITICAL'],
  includesUnfixed: true,
  scope: 'Known NVD/CPE advisories matched by Grype to the single Syft-classified Node ELF; Syft may emit a wildcard Node CPE version, so the exact Syft artifact version is separately verified. This is not complete Node.js core coverage and cannot establish absence of unknown advisories.',
});

function redact(value, env) {
  let output = String(value ?? '');
  for (const tokenName of ['BROWSER_CONTROL_TOKEN', 'BROWSER_PROXY_ADMIN_TOKEN']) if (env[tokenName]) output = output.replaceAll(env[tokenName], '[REDACTED]');
  return output.replace(/(authorization:\s*bearer\s+)\S+/giu, '$1[REDACTED]');
}

export async function auditNodeImage({ name, imageId, expectedVersion, expectedPath, outputDir, projectRoot, env = process.env, execute }) {
  const out = resolve(outputDir);
  mkdirSync(out, { recursive: true });
  const report = {
    name, status: 'incomplete', imageConfigId: imageId, expected: { version: expectedVersion, path: expectedPath },
    scope: nodeAuditPolicy.scope, severities: nodeAuditPolicy.severities, includesUnfixed: true,
    syft: { status: 'not-run', expectedVersion: nodeAuditPolicy.syftVersion },
    grype: { status: 'not-run', expectedVersion: nodeAuditPolicy.grypeVersion },
    database: { status: 'not-run', maximumAgeHours: nodeAuditPolicy.maximumDatabaseAgeHours },
    artifact: null, findings: null, diagnostics: [],
  };
  let failed = false;
  const run = (args) => {
    let result;
    try { result = execute(args[0], args.slice(1), { cwd: projectRoot, encoding: 'utf8', stdio: 'pipe', maxBuffer: 16 * 1024 * 1024, env }); }
    catch (error) { result = { status: null, stdout: '', stderr: '', error }; }
    const status = result.status ?? (result.error ? null : 127);
    const diagnostic = { command: args.map((value) => value.includes('TOKEN') ? '[REDACTED]' : value).join(' '), exitCode: status, stdout: redact(result.stdout, env), stderr: redact(result.stderr, env) };
    if (result.error) diagnostic.error = { code: result.error.code ?? null, message: redact(result.error.message, env) };
    report.diagnostics.push(diagnostic);
    return { status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error };
  };
  const save = (name, data) => writeFileSync(resolve(out, name), data);
  const grypeConfigPath = resolve(out, 'grype-node-audit.yaml');
  save('grype-node-audit.yaml', [
    'db:', '  auto-update: false', '  validate-age: true', '  max-allowed-built-age: 48h',
    'only-fixed: false', 'only-notfixed: false', 'ignore-wontfix: ""', 'ignore: []', 'vex-documents: []', 'vex-add: []', '',
  ].join('\n'));
  try {
    const syftVersion = run(['syft', 'version', '-o', 'json']);
    report.syft.rawVersion = syftVersion.stdout;
    try {
      const parsed = JSON.parse(syftVersion.stdout);
      const actual = parsed.version ?? parsed.Version ?? parsed.application?.version;
      if (syftVersion.status !== 0 || actual !== nodeAuditPolicy.syftVersion) throw new Error(`Expected Syft ${nodeAuditPolicy.syftVersion}, observed ${actual ?? 'missing'}.`);
      report.syft.version = actual;
      const syftPath = resolve(out, 'node-binary-syft.json');
      const generated = run(syftScanArgs(imageId, syftPath));
      report.syft.exitCode = generated.status;
      report.syft.stderr = redact(generated.stderr, env);
      if (generated.status !== 0 || !existsSync(syftPath)) throw new Error('Syft image scan failed or did not write its JSON SBOM.');
      const raw = readFileSync(syftPath);
      report.syft.outputSha256 = createHash('sha256').update(raw).digest('hex');
      report.artifact = validateNodeBinarySbom(JSON.parse(raw.toString('utf8')), { expectedVersion, expectedPath });
      report.syft.status = 'passed';
    } catch (error) {
      report.syft.status = 'incomplete';
      report.syft.error = redact(error.message ?? error, env);
    }

    const grypeVersion = run(['grype', '--config', grypeConfigPath, 'version', '-o', 'json']);
    report.grype.rawVersion = grypeVersion.stdout;
    try {
      const parsed = JSON.parse(grypeVersion.stdout);
      const actual = parsed.version ?? parsed.Version ?? parsed.application?.version;
      if (grypeVersion.status !== 0 || actual !== nodeAuditPolicy.grypeVersion) throw new Error(`Expected Grype ${nodeAuditPolicy.grypeVersion}, observed ${actual ?? 'missing'}.`);
      report.grype.version = actual;
      const update = run(['grype', '--config', grypeConfigPath, 'db', 'update']);
      report.database.updateExitCode = update.status;
      report.database.updateOutput = redact(`${update.stdout}\n${update.stderr}`, env);
      if (update.status !== 0) throw new Error('Grype vulnerability database update failed.');
      const observedAt = new Date().toISOString();
      const dbStatus = run(['grype', '--config', grypeConfigPath, 'db', 'status', '-o', 'json']);
      report.database.rawOutput = dbStatus.stdout;
      report.database.stderr = redact(dbStatus.stderr, env);
      if (dbStatus.status !== 0) throw new Error('Grype vulnerability database status failed.');
      report.database.metadata = validateGrypeDatabase(JSON.parse(dbStatus.stdout), observedAt, nodeAuditPolicy.maximumDatabaseAgeHours);
      report.database.status = 'fresh';
      save('grype-db-status.json', `${JSON.stringify(JSON.parse(dbStatus.stdout), null, 2)}\n`);
      if (report.syft.status !== 'passed' || !report.artifact) throw new Error('Verified unique Node artifact is required before Grype evaluation.');
      const findingsPath = resolve(out, 'grype-node-binary-findings.json');
      const grype = run(grypeScanArgs(grypeConfigPath, resolve(out, 'node-binary-syft.json'), findingsPath));
      report.grype.exitCode = grype.status;
      report.grype.stderr = redact(grype.stderr, env);
      if (grype.status !== 0 || !existsSync(findingsPath)) throw new Error('Grype scan failed or did not write its complete JSON report.');
      const raw = readFileSync(findingsPath);
      report.grype.outputBytes = raw.byteLength;
      report.grype.outputSha256 = createHash('sha256').update(raw).digest('hex');
      report.findings = summarizeNodeGrypeFindings(JSON.parse(raw.toString('utf8')), report.artifact);
      report.grype.status = report.findings.highCriticalCount === 0 ? 'passed-no-high-critical' : 'high-critical-findings';
      failed = report.findings.highCriticalCount > 0;
    } catch (error) {
      report.grype.status = 'incomplete';
      report.grype.error = redact(error.message ?? error, env);
      failed = true;
    }
    if (report.syft.status !== 'passed') failed = true;
  } catch (error) {
    report.error = redact(error.message ?? error, env);
    failed = true;
  } finally {
    report.status = failed ? 'failed-or-incomplete' : 'passed-known-advisory-gate';
    save('report.json', `${JSON.stringify(report, null, 2)}\n`);
    save('diagnostics.log', report.diagnostics.map((entry) => `$ ${entry.command} [${entry.exitCode}]\n${entry.stdout}${entry.stderr}${entry.error ? JSON.stringify(entry.error) : ''}`).join('\n'));
  }
  return report;
}
