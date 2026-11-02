import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { startServer } from '../src/server.ts';

const roots = [];
const directory = () => {
  const root = mkdtempSync(join(tmpdir(), 'standalone-static-assets-'));
  roots.push(root);
  return root;
};
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test('HTTP serves the onboarding module imported by app.js with JavaScript MIME type', async () => {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const runtime = await startServer({ dataDir: directory(), port, host: '127.0.0.1', publicUrl: base });
  try {
    const appResponse = await fetch(`${base}/app.js`);
    assert.equal(appResponse.status, 200);
    assert.match(await appResponse.text(), /from ['"]\.\/onboarding-state\.js['"]/u);

    const moduleResponse = await fetch(`${base}/onboarding-state.js`);
    assert.equal(moduleResponse.status, 200);
    assert.equal(moduleResponse.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.match(await moduleResponse.text(), /export class OnboardingRequestCoordinator/u);
  } finally {
    await runtime.close();
  }
});
