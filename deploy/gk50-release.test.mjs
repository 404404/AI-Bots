import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  validateRelease,
  choosePort,
  guiReport,
  validateInstalledDeployment,
} from './gk50-release.mjs';
const compose = Buffer.from('compose');
const seccomp = Buffer.from('policy');
const digest = (value) => createHash('sha256').update(value).digest('hex');
const receipt = {
  schemaVersion: 1,
  repository: '404404/AI-Bots',
  runId: '123',
  commit: 'a'.repeat(40),
  imageRef: `ghcr.io/404404/ai-bots@sha256:${'b'.repeat(64)}`,
  imageId: `sha256:${'c'.repeat(64)}`,
  productionGate: 'passed',
  composeSha256: digest(compose),
  seccompSha256: digest(seccomp),
};
const run = {
  status: 'completed',
  conclusion: 'success',
  workflowName: 'GUI container',
  databaseId: 123,
  headSha: receipt.commit,
};
test('only the tested immutable image and matching deployment policy are accepted', () => {
  assert.equal(validateRelease(receipt, run, compose, seccomp), receipt);
  for (const bad of [
    { imageRef: 'ghcr.io/404404/ai-bots:latest' },
    { imageRef: `ghcr.io/other/ai-bots@sha256:${'b'.repeat(64)}` },
    { commit: 'd'.repeat(40) },
    { runId: '124' },
    { productionGate: 'failed' },
    { repository: 'other/repo' },
  ])
    assert.throws(() => validateRelease({ ...receipt, ...bad }, run, compose, seccomp));
  assert.throws(
    () => validateRelease(receipt, run, compose, Buffer.from('changed policy')),
    /config-mismatch/,
  );
  assert.throws(
    () => validateRelease(receipt, run, Buffer.from('changed mounts'), seccomp),
    /config-mismatch/,
  );
});
test('failed, cancelled, running or unrelated workflows cannot authorize deployment', () => {
  for (const bad of [
    { conclusion: 'failure' },
    { conclusion: 'cancelled' },
    { status: 'in_progress' },
    { workflowName: 'other' },
  ])
    assert.throws(
      () => validateRelease(receipt, { ...run, ...bad }, compose, seccomp),
      /not-passed/,
    );
});
const listener = (port, address = '127.0.0.1') => `LISTEN 0 4096 ${address}:${port} 0.0.0.0:*\n`;
test('ordered port selection respects LAN, wildcard and IPv6 listeners', () => {
  assert.equal(choosePort(listener(21443)), 20443);
  assert.equal(choosePort(listener(20443, '192.168.1.1')), 21443);
  assert.equal(choosePort(listener(20443, '*') + listener(21443, '[::]')), 22443);
  assert.throws(
    () => choosePort([20443, 21443, 22443].map((p) => listener(p)).join('')),
    /ports-occupied/,
  );
  assert.throws(() => choosePort(listener(1455)), /callback-port-occupied/);
});
const gui = {
  status: 'passed',
  namespaceSandbox: 'yes',
  seccompBpf: 'yes',
  chromiumNoSandboxFlag: false,
  sandboxedRenderer: true,
  browserTitleSeenByComputer: true,
  computerClickAndTypingObservedByBrowser: true,
  computerScreenshot: 'returned',
  chromiumRendererSandbox: {
    rendererProcessCount: 3,
    rendererSeccompFilterCount: 3,
    rendererSeccompUnfilteredCount: 0,
    rendererSeccompStatusMissingCount: 0,
    devtoolsRendererProcessCount: 3,
    devtoolsRendererProcessMatchedCount: 3,
  },
};
test('GUI acceptance requires actual interactions and both sandbox layers', () => {
  assert.deepEqual(guiReport('PASS: fixture ready\n' + JSON.stringify(gui)), gui);
  for (const key of Object.keys(gui)) {
    const value = { ...gui };
    delete value[key];
    assert.throws(() => guiReport(JSON.stringify(value)), /acceptance-failed|sandbox-incomplete/);
  }
  assert.throws(() => guiReport('PASS: container healthy'), /missing/);
});

test('one filtered renderer cannot hide unfiltered or unmatched renderers', () => {
  for (const bad of [
    { rendererSeccompFilterCount: 1 },
    { rendererSeccompUnfilteredCount: 1 },
    { devtoolsRendererProcessMatchedCount: 2 },
    { rendererSeccompStatusMissingCount: 1 },
  ]) {
    assert.throws(
      () =>
        guiReport(
          JSON.stringify({
            ...gui,
            chromiumRendererSandbox: { ...gui.chromiumRendererSandbox, ...bad },
          }),
        ),
      /sandbox-incomplete/,
    );
  }
});

const root = '/tmp/gui-owned';
const policyBytes = Buffer.from(JSON.stringify({ defaultAction: 'SCMP_ACT_ERRNO', syscalls: [] }));
const installedReceipt = { ...receipt, seccompSha256: digest(policyBytes) };
const environment = `IMAGE_REF=${receipt.imageRef}\nPUID=${process.getuid()}\nPGID=${process.getgid()}\nHOST_PORT=20443\nPUBLIC_URL=http://127.0.0.1:20443\nWORKSPACE_ID=deepseekbot-gui\nCODEX_CALLBACK_PORT=1455\n`;
const installed = {
  Image: receipt.imageId,
  Config: {
    User: `${process.getuid()}:${process.getgid()}`,
    Labels: {
      'com.docker.compose.project': 'deepseekbot-gui',
      'com.docker.compose.service': 'deepseekbot-gui',
      'com.docker.compose.project.working_dir': root,
      'com.docker.compose.project.config_files': `${root}/compose.yml`,
    },
  },
  HostConfig: {
    Privileged: false,
    NetworkMode: 'deepseekbot-gui_default',
    CapDrop: ['ALL'],
    CapAdd: null,
    SecurityOpt: ['no-new-privileges:true', `seccomp=${policyBytes}`],
    PortBindings: {
      '3080/tcp': [{ HostIp: '127.0.0.1', HostPort: '20443' }],
      '1455/tcp': [{ HostIp: '127.0.0.1', HostPort: '1455' }],
    },
  },
  Mounts: [{ Type: 'bind', Source: `${root}/data`, Destination: '/data/dsh' }],
};
test('separate acceptance only targets the exact installed Compose project', () => {
  assert.equal(
    validateInstalledDeployment(
      installedReceipt,
      installed,
      root,
      compose,
      policyBytes,
      environment,
    ),
    20443,
  );
  for (const alter of [
    (value) => {
      value.Image = `sha256:${'f'.repeat(64)}`;
    },
    (value) => {
      value.Config.User = '0:0';
    },
    (value) => {
      value.Config.Labels['com.docker.compose.project.working_dir'] = '/another';
    },
    (value) => {
      value.HostConfig.Privileged = true;
    },
    (value) => {
      value.HostConfig.CapAdd = ['SYS_ADMIN'];
    },
    (value) => {
      value.HostConfig.SecurityOpt = ['seccomp=unconfined'];
    },
    (value) => {
      value.HostConfig.PortBindings['3080/tcp'][0].HostIp = '0.0.0.0';
    },
    (value) => {
      value.Mounts.push({
        Type: 'bind',
        Source: '/var/run/docker.sock',
        Destination: '/var/run/docker.sock',
      });
    },
    (value) => {
      value.Mounts[0].Source = '/another/data';
    },
  ]) {
    const candidate = structuredClone(installed);
    alter(candidate);
    assert.throws(() =>
      validateInstalledDeployment(
        installedReceipt,
        candidate,
        root,
        compose,
        policyBytes,
        environment,
      ),
    );
  }
  assert.throws(
    () =>
      validateInstalledDeployment(
        installedReceipt,
        installed,
        root,
        compose,
        policyBytes,
        environment + 'HOST_PORT=22443\n',
      ),
    /environment-mismatch/,
  );
  assert.throws(
    () =>
      validateInstalledDeployment(
        installedReceipt,
        installed,
        root,
        compose,
        policyBytes,
        environment.replace('PUID=', 'UNKNOWN='),
      ),
    /environment-mismatch/,
  );
});
