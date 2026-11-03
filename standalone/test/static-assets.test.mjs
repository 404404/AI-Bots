import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { startServer } from '../src/server.ts';

const roots = [];
const directory = () => {
  const root = mkdtempSync(join(tmpdir(), 'standalone-static-assets-'));
  roots.push(root);
  return root;
};
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

const freePort = async () => {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
};

const assertGroupModuleServed = async (base) => {
  const response = await fetch(`${base}/group-ui-state.js`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.match(await response.text(), /export class GroupRefreshGate/u);
};

const assertInboxUiModuleServed = async (base) => {
  const response = await fetch(`${base}/inbox-ui-state.js`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.match(await response.text(), /export class SelectionEpoch/u);
};

test('HTTP serves imported UI modules with JavaScript MIME type from source and built assets', async () => {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const runtime = await startServer({ dataDir: directory(), port, host: '127.0.0.1', publicUrl: base });
  try {
    const appResponse = await fetch(`${base}/app.js`);
    assert.equal(appResponse.status, 200);
    assert.match(await appResponse.text(), /from ['"]\.\/onboarding-state\.js['"]/u);
    assert.match(await (await fetch(`${base}/app.js`)).text(), /from ['"]\.\/group-ui-state\.js['"]/u);
    assert.match(await (await fetch(`${base}/app.js`)).text(), /from ['"]\.\/inbox-ui-state\.js['"]/u);

    const onboarding = await fetch(`${base}/onboarding-state.js`);
    assert.equal(onboarding.status, 200);
    assert.equal(onboarding.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.match(await onboarding.text(), /export class OnboardingRequestCoordinator/u);
    await assertGroupModuleServed(base);
    await assertInboxUiModuleServed(base);
  } finally {
    await runtime.close();
  }

  const standaloneRoot = fileURLToPath(new URL('..', import.meta.url));
  execFileSync(process.execPath, [join(standaloneRoot, 'scripts/build.mjs')], { cwd: standaloneRoot });
  const { startServer: startBuiltServer } = await import(new URL('../dist/server.ts?static-assets-build-test', import.meta.url));
  const builtPort = await freePort();
  const builtBase = `http://127.0.0.1:${builtPort}`;
  const builtRuntime = await startBuiltServer({ dataDir: directory(), port: builtPort, host: '127.0.0.1', publicUrl: builtBase });
  try {
    await assertGroupModuleServed(builtBase);
    await assertInboxUiModuleServed(builtBase);
    const builtOnboarding = await fetch(`${builtBase}/onboarding-state.js`);
    assert.equal(builtOnboarding.status, 200);
    assert.equal(builtOnboarding.headers.get('content-type'), 'text/javascript; charset=utf-8');
  } finally {
    await builtRuntime.close();
  }
});
