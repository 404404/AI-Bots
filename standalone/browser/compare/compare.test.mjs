import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { parse } from 'yaml';
import { getScenario, scenarios } from './scenarios.mjs';
import { buildArgs, runScenario, runtimeProbeScript } from './run-scenario.mjs';

const root = new URL('../../../', import.meta.url);
const lock = JSON.parse(readFileSync(new URL('standalone/browser/package-lock.json', root), 'utf8'));
const workflow = readFileSync(new URL('.github/workflows/standalone-browser-compare.yml', root), 'utf8');
const composeText = readFileSync(new URL('standalone/browser/deploy/compose.example.yml', root), 'utf8');
const compose = parse(composeText);
const candidateDockerfiles = ['noble', 'resolute'].map((name) => readFileSync(new URL(`standalone/browser/compare/Dockerfile.${name}`, root), 'utf8'));
const runner = readFileSync(new URL('./run-scenario.mjs', import.meta.url), 'utf8');

test('comparison pins all requested official immutable indexes and the unchanged Trixie worker baseline', () => {
  assert.equal(scenarios.trixie.base, 'node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66');
  assert.equal(scenarios.trixie.nodeVersion, '24.21.0');
  assert.equal(scenarios.noble.nodeVersion, '24.22.2');
  assert.equal(scenarios.resolute.nodeVersion, '24.22.2');
  assert.equal(scenarios.noble.base, 'mcr.microsoft.com/playwright:v1.64.1-noble@sha256:2f05f8a734509a7b3f26a912639488ee08f58a7b292d14d62271bcff9038768f');
  assert.equal(scenarios.resolute.base, 'mcr.microsoft.com/playwright:v1.64.1-resolute@sha256:f76885029244e5a384243a930ff283cef67d90653978ee27a77dd4cff8882fb4');
  assert.equal(lock.packages[''].dependencies['playwright-core'], '1.64.1');
  assert.equal(lock.packages['node_modules/playwright-core'].version, '1.64.1');
  assert.throws(() => getScenario('latest'));
});

test('Playwright candidates use checksummed official Node 24.22.2 and update their Ubuntu packages', () => {
  const nodeSource = 'https://nodejs.org/dist/v24.22.2/node-v24.22.2-linux-x64.tar.gz';
  const nodeSha256 = '361718c444e49af2ca5a110c83ba6a8901143f23ab285ebbef0341f391f482a9';
  for (const dockerfile of candidateDockerfiles) {
    assert.ok(dockerfile.includes(`ADD --checksum=sha256:${nodeSha256}`));
    assert.ok(dockerfile.includes(nodeSource));
    assert.ok(dockerfile.includes(`io.404404.runtime.node.version="24.22.2"`));
    assert.ok(dockerfile.includes(`io.404404.runtime.node.sha256="${nodeSha256}"`));
    assert.match(dockerfile, /io\.404404\.runtime\.node\.license="MIT"/u);
    assert.match(dockerfile, /org\.opencontainers\.image\.licenses="MIT AND Apache-2\.0"/u);
    assert.match(dockerfile, /apt-get upgrade -y --no-install-recommends/u);
    assert.match(dockerfile, /apt-get purge -y nodejs/u);
    assert.match(dockerfile, /tar -xzf \/tmp\/node-v24\.22\.2-linux-x64\.tar\.gz -C \/opt/u);
    assert.match(dockerfile, /test -s \/opt\/node-v24\.22\.2-linux-x64\/LICENSE/u);
    assert.match(dockerfile, /ENV PATH="\/opt\/node-v24\.22\.2-linux-x64\/bin:\$\{PATH\}"/u);
  }
});

test('candidate runtime stages keep only Node and locked production dependencies while recording uncovered Node core scan', () => {
  const bases = [scenarios.noble.base, scenarios.resolute.base];
  for (const [index, dockerfile] of candidateDockerfiles.entries()) {
    const base = bases[index];
    assert.equal(dockerfile.split(`FROM ${base} AS `).length - 1, 2);
    assert.match(dockerfile, /FROM .* AS dependencies/u);
    assert.match(dockerfile, /FROM .* AS worker/u);
    assert.match(dockerfile, /COPY package\.json package-lock\.json \.\//u);
    assert.match(dockerfile, /npm ci --omit=dev --ignore-scripts --no-audit --no-fund/u);
    assert.match(dockerfile, /COPY --from=dependencies --chown=10001:10001 \/opt\/browser\/node_modules \.\/node_modules/u);
    assert.match(dockerfile, /COPY --from=dependencies \/opt\/node-v24\.22\.2-linux-x64\/bin\/node \/opt\/node-v24\/bin\/node/u);
    assert.match(dockerfile, /COPY --from=dependencies \/opt\/node-v24\.22\.2-linux-x64\/LICENSE \/usr\/share\/doc\/nodejs\/LICENSE/u);
    const copiedNodeFiles = dockerfile.split('\n').filter((line) => line.startsWith('COPY --from=dependencies /opt/node-v24.22.2-linux-x64/'));
    assert.deepEqual(copiedNodeFiles, [
      'COPY --from=dependencies /opt/node-v24.22.2-linux-x64/bin/node /opt/node-v24/bin/node',
      'COPY --from=dependencies /opt/node-v24.22.2-linux-x64/LICENSE /usr/share/doc/nodejs/LICENSE',
    ]);
    assert.doesNotMatch(dockerfile, /COPY --from=dependencies [^\n]*node_modules\/npm/u);
    assert.match(dockerfile, /io\.404404\.scan\.node-core\.coverage="uncovered"/u);
    assert.match(dockerfile, /io\.404404\.scan\.node-core\.reason=/u);
    assert.match(dockerfile, /COPY LICENSE NOTICE\.md \.\//u);
  }
  assert.match(runner, /nodeCoreVulnerabilityCoverage: \{\s*status: 'uncovered'/u);
});

test('workflow isolates each base in a non-publishing manual matrix and keeps evidence after failure', () => {
  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /matrix:\n\s+scenario: \[trixie, noble, resolute\]/u);
  assert.match(workflow, /fail-fast: false/u);
  assert.match(workflow, /contents: read/u);
  assert.match(workflow, /aquasecurity\/setup-trivy@3fb12ec12f41e471780db15c232d5dd185dcb514/u);
  assert.match(workflow, /if: always\(\)/u);
  assert.match(workflow, /upload-artifact/u);
  assert.doesNotMatch(workflow, /docker\/login|docker\/build-push-action|ghcr\.io|docker push/iu);
  assert.match(runner, /--severity', 'HIGH,CRITICAL'/u);
  assert.match(runner, /--ignore-unfixed=false/u);
  assert.match(runner, /trivy', 'version', '--format', 'json'/u);
  assert.match(runner, /vulnerabilityDatabase/u);
  assert.match(runner, /--vuln-type', 'os,library'/u);
  assert.match(runner, /--list-all-pkgs/u);
  assert.match(runner, /--format', 'cyclonedx'/u);
  assert.match(runner, /--network', 'none'/u);
  assert.match(runner, /--cap-drop', 'ALL'/u);
  assert.match(runner, /seccomp=standalone\/browser\/deploy\/chromium-userns-seccomp\.json/u);
  assert.match(runner, /--user', '10001:10001'/u);
  assert.match(workflow, /if-no-files-found: error/u);
});

test('push trigger is restricted to the feature branch and comparison-only paths', () => {
  const config = parse(workflow);
  assert.deepEqual(config.on.push.branches, ['feature/gui-container-codex-prototype']);
  assert.deepEqual(config.on.push.paths, [
    '.github/workflows/standalone-browser-compare.yml',
    'standalone/browser/compare/**',
  ]);
  assert.ok(Object.hasOwn(config.on, 'workflow_dispatch'));
});

test('comparison Compose keeps all five tmpfs mounts as one quoted entry with existing size and mode options', () => {
  const expected = {
    fixture: '/tmp:size=8m,mode=1777',
    egress: '/tmp:size=8m,mode=1777',
    worker: '/tmp:size=384m,mode=0700,uid=10001,gid=10001',
    gateway: '/tmp:size=8m,mode=1777',
    e2e: '/tmp:size=8m,mode=1777',
  };
  for (const [serviceName, tmpfsEntry] of Object.entries(expected)) {
    assert.deepEqual(compose.services[serviceName].tmpfs, [tmpfsEntry], `${serviceName} tmpfs must remain one complete list item`);
    const escapedEntry = tmpfsEntry.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    assert.match(composeText, new RegExp(`^\\s+tmpfs: \\["${escapedEntry}"\\]$`, 'mu'), `${serviceName} tmpfs must be quoted as a whole item`);
  }
  assert.equal(Object.keys(expected).length, 5);
});

test('build args target the production worker and runtime probe prefers CHROMIUM_PATH with strict version checks', () => {
  const rootPath = '/repo';
  const trixie = buildArgs(getScenario('trixie'), 'abc123', rootPath);
  assert.ok(trixie.includes('--target'));
  assert.ok(trixie.includes('worker'));
  assert.equal(trixie.at(-1), '/repo/standalone/browser');
  const noble = buildArgs(getScenario('noble'), 'abc123', rootPath);
  assert.ok(!noble.includes('--target'));

  const probe = runtimeProbeScript();
  assert.match(probe, /process\.env\.CHROMIUM_PATH\|\|pw\.chromium\.executablePath\(\)/u);
  assert.match(probe, /assert\.match\(process\.version,\/\^v24/u);
  assert.match(probe, /NODE_EXPECTED_VERSION/u);
  assert.match(probe, /PLAYWRIGHT_EXPECTED_VERSION/u);
  assert.match(probe, /fs\.existsSync\(executable\)/u);
  assert.doesNotMatch(probe, /`|\$\{/u);
});

test('actual CLI records build failure, stderr, redaction, and a partial report', (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'browser-compare-test-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const callsFile = join(temp, 'calls.log');
  const bin = join(temp, 'bin');
  const output = join(temp, 'output');
  const runnerPath = new URL('./run-scenario.mjs', import.meta.url).pathname;
  const nodePath = process.execPath;
  const dockerPath = join(temp, 'docker');
  const trivyPath = join(temp, 'trivy');
  writeFileSync(dockerPath, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$FAKE_CALLS"\necho "build diagnostic token=$BROWSER_CONTROL_TOKEN" >&2\nexit 17\n');
  writeFileSync(trivyPath, '#!/bin/sh\nprintf \'{"Version":"0.70.0","VulnerabilityDB":{"UpdatedAt":"2026-11-02T00:00:00Z"}}\\n\'\n');
  chmodSync(dockerPath, 0o755);
  chmodSync(trivyPath, 0o755);
  const env = {
    ...process.env,
    PATH: `${temp}:${process.env.PATH}`,
    FAKE_CALLS: callsFile,
    COMPARE_OUTPUT: output,
    BROWSER_CONTROL_TOKEN: 'test-secret-value',
    SOURCE_REVISION: 'abc123',
  };
  const execution = spawnSync(nodePath, [runnerPath, 'trixie'], { cwd: root, env, encoding: 'utf8' });
  assert.equal(execution.status, 1, execution.stdout + execution.stderr);
  const report = JSON.parse(readFileSync(join(output, 'report.json'), 'utf8'));
  assert.equal(report.build.status, 'failed');
  assert.equal(report.build.exitCode, 17);
  assert.match(report.build.command.join(' '), /--target worker/u);
  assert.match(report.build.stderr, /token=\[REDACTED\]/u);
  assert.equal(report.trivy.version, '0.70.0');
  assert.equal(report.result, 'failed-or-incomplete');
  assert.match(readFileSync(join(output, 'diagnostics.log'), 'utf8'), /build diagnostic/u);
  assert.doesNotMatch(readFileSync(join(output, 'diagnostics.log'), 'utf8'), /test-secret-value/u);
  const calls = readFileSync(callsFile, 'utf8');
  assert.match(calls, /--target worker/u);
  assert.match(calls, /standalone\/browser\/Dockerfile/u);
});

test('workflow setup writes a valid fallback artifact before any tool action can fail', (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'browser-compare-fallback-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const parsed = parse(workflow);
  const step = parsed.jobs.compare.steps.find((item) => item.name === 'Prepare fallback evidence before tool installation');
  assert.ok(step);
  const outputDir = join(temp, 'artifacts', 'trixie');
  const execution = spawnSync('/bin/bash', ['-ec', step.run], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SCENARIO: 'trixie', COMPARE_OUTPUT: outputDir },
  });
  assert.equal(execution.status, 0, execution.stderr);
  const report = JSON.parse(readFileSync(join(outputDir, 'report.json'), 'utf8'));
  assert.equal(report.scenario, 'trixie');
  assert.equal(report.phase, 'workflow-setup');
  assert.equal(report.nodeCoreVulnerabilityCoverage.status, 'uncovered');
  assert.equal(report.nodeCoreVulnerabilityCoverage.component, 'official Node.js 24.21.0 runtime binary');
  assert.equal(readFileSync(join(outputDir, 'diagnostics.log'), 'utf8').trim(), 'No scenario commands have run.');
});

test('generated Compose tokens are redacted from command diagnostics and every report artifact', async (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'browser-compare-redaction-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const outputDir = join(temp, 'output');
  const env = { SOURCE_REVISION: 'abc123' };
  const composeTokens = [];
  let runtimeArgs;
  const execute = (command, args, options) => {
    if (command === 'docker' && args[0] === 'image' && args[1] === 'inspect') {
      return { status: 0, stdout: JSON.stringify([{ Id: 'sha256:image', RootFS: { Layers: [] }, Config: { Labels: {} }, Os: 'linux', Architecture: 'amd64' }]), stderr: '' };
    }
    if (command === 'docker' && args[0] === 'history') return { status: 0, stdout: 'sha256:layer\n', stderr: '' };
    if (command === 'docker' && args[0] === 'run') {
      runtimeArgs = args;
      return { status: 0, stdout: 'v24.21.0\n1.64.1\nChromium 140.0\n', stderr: '' };
    }
    if (command === 'docker' && args[0] === 'compose') {
      const control = options.env.BROWSER_CONTROL_TOKEN;
      const proxy = options.env.BROWSER_PROXY_ADMIN_TOKEN;
      composeTokens.push(control, proxy);
      return { status: 0, stdout: `compose stdout ${control}`, stderr: `compose stderr ${proxy}` };
    }
    if (command === 'trivy' && args[0] === 'image' && args.includes('--output')) {
      const path = args[args.indexOf('--output') + 1];
      writeFileSync(path, args.includes('cyclonedx') ? '{"bomFormat":"CycloneDX"}' : '{"Results":[]}');
      return { status: 0, stdout: '', stderr: '' };
    }
    if (command === 'trivy' && args[0] === 'version') {
      return { status: 0, stdout: JSON.stringify({ Version: '0.70.0', VulnerabilityDB: { Version: 2, UpdatedAt: '2026-11-02T00:00:00Z' } }), stderr: '' };
    }
    return { status: 0, stdout: '', stderr: '' };
  };
  const { report, exitCode } = await runScenario({ name: 'trixie', projectRoot: root.pathname, outputDir, env, execute });
  assert.equal(exitCode, 1);
  assert.equal(report.e2e.status, 'passed');
  assert.equal(report.nodeCoreVulnerabilityCoverage.status, 'uncovered');
  assert.equal(report.nodeCoreVulnerabilityCoverage.component, 'official Node.js 24.21.0 runtime binary');
  assert.ok(runtimeArgs.includes('NODE_EXPECTED_VERSION=24.21.0'));
  assert.equal(report.result, 'failed-or-incomplete');
  assert.equal(composeTokens.length, 4);
  const artifacts = readFileSync(join(outputDir, 'diagnostics.log'), 'utf8')
    + readFileSync(join(outputDir, 'report.json'), 'utf8')
    + readFileSync(join(outputDir, 'report.md'), 'utf8')
    + JSON.stringify(report);
  for (const token of new Set(composeTokens)) assert.ok(!artifacts.includes(token), `token leaked: ${token}`);
  assert.match(artifacts, /\[REDACTED\]/u);
});

test('missing or invalid Trivy DB metadata fails the run and preserves raw version output', async (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'browser-compare-db-metadata-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  for (const [index, output] of ['{"Version":"0.70.0"}', '{broken json'].entries()) {
    const outputDir = join(temp, String(index));
    const execute = (command, args) => {
      if (command === 'docker' && args[0] === 'build') return { status: 17, stdout: '', stderr: 'synthetic build failure' };
      if (command === 'trivy' && args[0] === 'version') return { status: 0, stdout: output, stderr: '' };
      return { status: 0, stdout: '', stderr: '' };
    };
    const { report, exitCode } = await runScenario({ name: 'trixie', projectRoot: root.pathname, outputDir, env: {}, execute });
    assert.equal(exitCode, 1);
    assert.ok(['incomplete', 'error'].includes(report.trivy.status));
    assert.equal(report.trivy.observedAfterScan, false);
    assert.equal(report.result, 'failed-or-incomplete');
    assert.equal(report.trivy.rawOutput, output);
  }
});

test('Trivy DB version must be a positive integer', async (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'browser-compare-db-version-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  for (const [index, invalidVersion] of [null, '', 0, -1, '2', 2.5].entries()) {
    const outputDir = join(temp, String(index));
    const versionOutput = JSON.stringify({
      Version: '0.70.0',
      VulnerabilityDB: { Version: invalidVersion, UpdatedAt: '2026-11-02T00:00:00Z' },
    });
    const execute = (command, args) => {
      if (command === 'docker' && args[0] === 'build') return { status: 17, stdout: '', stderr: 'synthetic build failure' };
      if (command === 'trivy' && args[0] === 'version') return { status: 0, stdout: versionOutput, stderr: '' };
      return { status: 0, stdout: '', stderr: '' };
    };
    const { report, exitCode } = await runScenario({ name: 'trixie', projectRoot: root.pathname, outputDir, env: {}, execute });
    assert.equal(exitCode, 1);
    assert.equal(report.trivy.status, 'incomplete');
    assert.equal(report.trivy.vulnerabilityDatabase.Version, invalidVersion);
    assert.equal(report.trivy.rawOutput, versionOutput);
  }
});
