import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
function loadWorkflow(path = process.env.BROWSER_WORKFLOW_PATH || new URL('../../../.github/workflows/standalone-browser.yml', import.meta.url)) {
  return readFileSync(path, 'utf8');
}
const workflow = loadWorkflow();
const compose = readFileSync(new URL('../deploy/compose.example.yml', import.meta.url), 'utf8');
const candidateRecord = readFileSync(new URL('../scripts/candidate-record.mjs', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const seccomp = readFileSync(new URL('../deploy/chromium-userns-seccomp.json', import.meta.url));
const base = 'node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66';

function jobBlocks(source) {
  const lines = source.split(/\r?\n/u);
  const jobsLine = lines.findIndex((line) => /^jobs:\s*$/u.test(line));
  assert.notEqual(jobsLine, -1, 'workflow must declare jobs');
  const starts = [];
  for (let i = jobsLine + 1; i < lines.length; i += 1) {
    const match = /^  ([\w-]+):\s*$/u.exec(lines[i]);
    if (match) starts.push({ name: match[1], index: i });
    else if (lines[i] && !/^\s/u.test(lines[i])) break;
  }
  return new Map(starts.map(({ name, index }, position) => {
    const end = starts[position + 1]?.index ?? lines.length;
    return [name, lines.slice(index, end).join('\n')];
  }));
}

function jobNeeds(block) {
  const match = /^    needs:\s*(.*)$/mu.exec(block);
  if (!match) return [];
  const value = match[1].trim();
  if (value.startsWith('[') && value.endsWith(']')) return value.slice(1, -1).split(',').map((item) => item.trim());
  return value ? [value] : [];
}

function assertNoGateBypass(block, label) {
  assert.doesNotMatch(block, /^\s+continue-on-error\s*:/mu, `${label} must not use continue-on-error`);
  assert.doesNotMatch(block, /^\s+if:.*\balways\s*\(/mu, `${label} must not run after a failed dependency`);
}

function jobSteps(block) {
  const lines = block.split('\n');
  const starts = [];
  for (let i = 0; i < lines.length; i += 1) if (/^      - /u.test(lines[i])) starts.push(i);
  return starts.map((index, position) => lines.slice(index, starts[position + 1] ?? lines.length).join('\n'));
}

function requiredStep(steps, pattern, label) {
  const step = steps.find((candidate) => pattern.test(candidate));
  assert.ok(step, `missing ${label} step`);
  assert.doesNotMatch(step, /^        if\s*:/mu, `${label} step must not be conditionally skipped`);
  assert.doesNotMatch(step, /^        continue-on-error\s*:/mu, `${label} step must not allow errors`);
  return step;
}

function assertWorkflowGateStructure(source) {
  const jobs = jobBlocks(source);
  const build = jobs.get('build');
  const scan = jobs.get('scan');
  const e2e = jobs.get('chromium-e2e');
  const candidate = jobs.get('archive-candidate');
  for (const [name, block] of Object.entries({ build, scan, e2e, candidate })) assert.ok(block, `missing ${name} job`);

  assert.deepEqual(jobNeeds(candidate), ['build', 'scan', 'chromium-e2e'], 'candidate archive must wait for every gate');
  const authorizedJobCondition = "if: github.repository == '404404/AI-Bots' && github.ref == 'refs/heads/feature/gui-container-codex-prototype'";
  for (const [label, block] of [['build job', build], ['scan gate', scan], ['Chromium E2E gate', e2e], ['candidate archive', candidate]]) {
    assertNoGateBypass(block, label);
    assert.ok(block.includes(`    ${authorizedJobCondition}`), `${label} must retain its authorized repository/ref condition`);
  }
  assert.match(scan, /^      fail-fast: false$/mu, 'all image scans must report independently');
  assert.match(scan, /^        target: \[worker, proxy, gateway, fixture\]$/mu, 'scan matrix must contain all four images');
  assert.deepEqual(jobNeeds(scan), ['build']);
  assert.deepEqual(jobNeeds(e2e), ['build'], 'real E2E must run independently of scan results');

  const buildSteps = jobSteps(build);
  requiredStep(buildSteps, /name: Browser module tests and syntax checks on pinned Node image/u, 'browser tests and syntax checks');
  const imageBuild = requiredStep(buildSteps, /name: Build fixed-revision images once for all gates/u, 'fixed-revision image build');
  assert.match(imageBuild, /docker save standalone-browser-worker:candidate standalone-browser-proxy:candidate standalone-browser-gateway:candidate standalone-browser-fixture:candidate -o standalone-browser-images\.tar/u);
  assert.match(imageBuild, /sha256sum standalone-browser-images\.tar > standalone-browser-images\.tar\.sha256/u);
  const buildUpload = requiredStep(buildSteps, /uses: actions\/upload-artifact@/u, 'intermediate image artifact upload');
  assert.match(buildUpload, /name: standalone-browser-images-\$\{\{ github\.sha \}\}/u);
  assert.match(buildUpload, /standalone-browser-images\.tar\.sha256/u);

  const scanSteps = jobSteps(scan);
  const scanDownload = requiredStep(scanSteps, /uses: actions\/download-artifact@/u, 'scan artifact download');
  assert.match(scanDownload, /name: standalone-browser-images-\$\{\{ github\.sha \}\}/u);
  const scanLoad = requiredStep(scanSteps, /name: Verify and load exact build artifact/u, 'scan checksum and image load');
  assert.match(scanLoad, /sha256sum --check standalone-browser-images\.tar\.sha256/u);
  assert.match(scanLoad, /docker load --input standalone-browser-images\.tar/u);
  const scanAction = requiredStep(scanSteps, /name: Scan \$\{\{ matrix\.target \}\} image/u, 'Trivy image scan');
  assert.match(scanAction, /^        uses: aquasecurity\/trivy-action@/mu);
  assert.match(scanAction, /^          image-ref: standalone-browser-\$\{\{ matrix\.target \}\}:candidate$/mu);
  assert.match(scanAction, /^          exit-code: '1'$/mu);
  assert.match(scanAction, /^          ignore-unfixed: false$/mu);
  assert.match(scanAction, /^          vuln-type: os,library$/mu);
  assert.match(scanAction, /^          severity: CRITICAL,HIGH$/mu);

  const e2eSteps = jobSteps(e2e);
  const e2eDownload = requiredStep(e2eSteps, /uses: actions\/download-artifact@/u, 'E2E artifact download');
  assert.match(e2eDownload, /name: standalone-browser-images-\$\{\{ github\.sha \}\}/u);
  const e2eRun = requiredStep(e2eSteps, /name: Run real Chromium sandbox and fixture E2E gates/u, 'real Chromium and fixture E2E');
  assert.match(e2eRun, /sha256sum --check standalone-browser-images\.tar\.sha256/u);
  assert.match(e2eRun, /docker load --input standalone-browser-images\.tar/u);
  assert.match(e2eRun, /docker compose -f standalone\/browser\/deploy\/compose\.example\.yml --profile e2e up --no-build --abort-on-container-exit --exit-code-from e2e/u);
  assert.match(e2eRun, /trap 'docker compose[^\n]+down -v --remove-orphans' EXIT/u);

  const candidateSteps = jobSteps(candidate);
  const candidateDownload = requiredStep(candidateSteps, /uses: actions\/download-artifact@/u, 'candidate artifact download');
  assert.match(candidateDownload, /name: standalone-browser-images-\$\{\{ github\.sha \}\}/u);
  const candidateRecord = requiredStep(candidateSteps, /name: Create candidate identity record from gated image bytes/u, 'candidate identity record');
  assert.match(candidateRecord, /sha256sum --check standalone-browser-images\.tar\.sha256/u);
  assert.match(candidateRecord, /mv standalone-browser-images\.tar standalone-browser-candidate\.tar/u);
  assert.match(candidateRecord, /docker load --input standalone-browser-candidate\.tar/u);
  const candidateUpload = requiredStep(candidateSteps, /uses: actions\/upload-artifact@/u, 'candidate archive upload');
  assert.match(candidateUpload, /name: standalone-browser-candidate-\$\{\{ github\.sha \}\}/u, 'only candidate job should publish candidate artifact');
}

test('missing explicitly configured workflow fixture fails closed', () => {
  assert.throws(() => loadWorkflow('/tmp/standalone-browser-workflow-fixture-missing.yml'), { code: 'ENOENT' });
});

test('container targets and isolated Node tests share the fixed official Node 24.21 Trixie base', () => {
  assert.ok(dockerfile.split('\n').includes(`FROM ${base} AS base`));
  assert.match(dockerfile, /RUN apt-get update \\\n\s+&& apt-get upgrade -y --no-install-recommends/u);
  assert.match(dockerfile, /FROM base AS worker/u);
  assert.match(dockerfile, /FROM base AS proxy/u);
  assert.match(dockerfile, /FROM base AS gateway/u);
  assert.match(dockerfile, /FROM base AS fixture/u);

  const workflowBaseRefs = workflow.match(/node:24\.21\.0-[^\s]+/gu) ?? [];
  assert.deepEqual(workflowBaseRefs, [base, base]);
  assert.match(workflow, /--network none --cap-drop ALL --security-opt no-new-privileges:true/u);
});

test('source identity and security gates remain fixed while the OS base changes', () => {
  const source = 'https://github.com/404404/AI-Bots';
  assert.ok(dockerfile.includes(`org.opencontainers.image.source="${source}"`));
  assert.ok(candidateRecord.includes(`source !== '${source}'`));
  assert.ok(dockerfile.includes(`org.opencontainers.image.base.name="${base.split('@')[0]}"`));
  assert.ok(dockerfile.includes(`org.opencontainers.image.base.digest="${base.split('@')[1]}"`));
  assert.ok(candidateRecord.includes('baseDigest !== expectedBaseDigest'));
  assert.ok(candidateRecord.includes('baseName, baseDigest, configDigest'));
  assert.match(dockerfile, /org\.opencontainers\.image\.revision="\$\{SOURCE_REVISION\}"/u);
  assert.ok(readme.includes(base.split('@')[1]));
  assert.ok(readme.includes('sha256:c83040f7e24bacea68e58a0b96a484ba430bf24abb2973eab7ba4701144b7b63'));
  assert.ok(readme.includes('not evidence of a passing Trivy scan'));

  assertWorkflowGateStructure(workflow);

  const worker = compose.split('  worker:\n')[1]?.split('\n  gateway:')[0] ?? '';
  assert.match(worker, /network_mode: none/u);
  assert.match(worker, /cap_drop: \[ALL\]/u);
  assert.match(worker, /seccomp=\.\/chromium-userns-seccomp\.json/u);
  assert.equal(createHash('sha256').update(seccomp).digest('hex'), 'a8ec691e2b21a15ccc4ab1d1af7284f900a334887936403ff3b4b51beead1ee4');
});


test('workflow gate structure rejects bypass mutations in fixture variants', () => {
  assert.doesNotThrow(() => assertWorkflowGateStructure(workflow));
  const mutations = [
    ['candidate omits real E2E dependency', 'needs: [build, scan, chromium-e2e]', 'needs: [build, scan]'],
    ['scan severity is weakened', 'severity: CRITICAL,HIGH', 'severity: CRITICAL'],
    ['scan permits errors', 'image-ref: standalone-browser-${{ matrix.target }}:candidate', 'image-ref: standalone-browser-${{ matrix.target }}:candidate\n          continue-on-error: true'],
    ['scan matrix omits a target', 'target: [worker, proxy, gateway, fixture]', 'target: [worker, proxy, gateway]'],
    ['E2E waits for scans instead of running independently', '  chromium-e2e:\n    if: github.repository == \'404404/AI-Bots\' && github.ref == \'refs/heads/feature/gui-container-codex-prototype\'\n    needs: build', '  chromium-e2e:\n    if: github.repository == \'404404/AI-Bots\' && github.ref == \'refs/heads/feature/gui-container-codex-prototype\'\n    needs: [build, scan]'],
    ['candidate uses always', '  archive-candidate:\n    if: github.repository == \'404404/AI-Bots\' && github.ref == \'refs/heads/feature/gui-container-codex-prototype\'', '  archive-candidate:\n    if: always()'],
    ['candidate job allows errors', '    needs: [build, scan, chromium-e2e]\n    runs-on: ubuntu-latest', '    needs: [build, scan, chromium-e2e]\n    continue-on-error: true\n    runs-on: ubuntu-latest'],
    ['build job allows errors', '  build:\n    if: github.repository == \'404404/AI-Bots\' && github.ref == \'refs/heads/feature/gui-container-codex-prototype\'\n    runs-on: ubuntu-latest', '  build:\n    if: github.repository == \'404404/AI-Bots\' && github.ref == \'refs/heads/feature/gui-container-codex-prototype\'\n    continue-on-error: true\n    runs-on: ubuntu-latest'],
    ['scan step can be skipped', '      - name: Scan ${{ matrix.target }} image\n        uses:', '      - name: Scan ${{ matrix.target }} image\n        if: false\n        uses:'],
    ['E2E step can be skipped', '      - name: Run real Chromium sandbox and fixture E2E gates\n        env:', '      - name: Run real Chromium sandbox and fixture E2E gates\n        if: false\n        env:'],
    ['scan omits checksum verification', '          sha256sum --check standalone-browser-images.tar.sha256\n          docker load --input standalone-browser-images.tar', '          docker load --input standalone-browser-images.tar'],
    ['E2E downloads a different artifact', 'persist-credentials: false\n      - uses: actions/download-artifact@634f93cb2916e3fdff6788551b99b062d0335ce0\n        with:\n          name: standalone-browser-images-${{ github.sha }}', 'persist-credentials: false\n      - uses: actions/download-artifact@634f93cb2916e3fdff6788551b99b062d0335ce0\n        with:\n          name: standalone-browser-other-${{ github.sha }}'],
    ['candidate loads unverified artifact bytes', '          docker load --input standalone-browser-candidate.tar', '          docker load --input standalone-browser-images.tar'],
    ['scan job can be skipped', "  scan:\n    if: github.repository == '404404/AI-Bots' && github.ref == 'refs/heads/feature/gui-container-codex-prototype'", '  scan:\n    if: false'],
    ['E2E job can be skipped', "  chromium-e2e:\n    if: github.repository == '404404/AI-Bots' && github.ref == 'refs/heads/feature/gui-container-codex-prototype'", '  chromium-e2e:\n    if: false'],
    ['build tests can be skipped', '      - name: Browser module tests and syntax checks on pinned Node image\n        run:', '      - name: Browser module tests and syntax checks on pinned Node image\n        if: false\n        run:'],
    ['E2E omits checksum verification', '          sha256sum --check standalone-browser-images.tar.sha256\n          docker load --input standalone-browser-images.tar\n          export BROWSER_CONTROL_TOKEN=', '          docker load --input standalone-browser-images.tar\n          export BROWSER_CONTROL_TOKEN='],
  ];

  for (const [label, before, after] of mutations) {
    assert.ok(workflow.includes(before), `fixture source for mutation is missing: ${label}`);
    const fixture = workflow.replace(before, after);
    assert.throws(() => assertWorkflowGateStructure(fixture), undefined, label);
  }
});
