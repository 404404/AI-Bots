import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createGateway } from '../src/gateway.mjs';
import { BrowserWorker, createWorkerServer, listenUnix } from '../src/worker.mjs';
import { createRestrictedProxy } from '../src/proxy.mjs';
import { BrowserClient } from '../../src/browser-client.ts';

const token = 'gateway-test-token-that-is-not-a-production-secret-0001';

async function availablePort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('gateway requires bearer auth and forwards JSON over its private worker socket', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'browser-gateway-'));
  const socketPath = join(dir, 'worker.sock');
  const worker = createServer((req, res) => {
    assert.equal(req.headers['content-type'], 'application/json');
    assert.equal(req.url, '/v1/sessions');
    req.resume();
    req.on('end', () => {
      const body = Buffer.from(JSON.stringify({ sessionId: 'session-id' }));
      res.writeHead(201, { 'content-type': 'application/json', 'content-length': body.length });
      res.end(body);
    });
  });
  worker.listen(socketPath);
  await new Promise((resolve) => worker.once('listening', resolve));
  const gateway = createGateway({ socketPath, serviceToken: token });
  gateway.listen(0, '127.0.0.1');
  await new Promise((resolve) => gateway.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => gateway.close(resolve));
    await new Promise((resolve) => worker.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });

  const port = gateway.address().port;
  const denied = await fetch(`http://127.0.0.1:${port}/v1/sessions`, { method: 'POST', body: '{}' });
  assert.equal(denied.status, 401);
  const malformedScheme = await fetch(`http://127.0.0.1:${port}/v1/sessions`, { method: 'POST', headers: { authorization: token }, body: '{}' });
  assert.equal(malformedScheme.status, 401);

  const response = await fetch(`http://127.0.0.1:${port}/v1/sessions`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ botId: 'trusted-bot', taskId: 'trusted-task' }),
  });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { sessionId: 'session-id' });
});

test('gateway health separates its own availability from worker readiness', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'browser-gateway-health-'));
  const socketPath = join(dir, 'worker.sock');
  const worker = createServer((req, res) => {
    assert.equal(req.url, '/health');
  const body = Buffer.from(JSON.stringify({ ready: false, sandboxVerified: false, capabilities: { version: 1, queryPolicy: 'deny' } }));
    res.writeHead(503, { 'content-type': 'application/json', 'content-length': body.length });
    res.end(body);
  });
  worker.listen(socketPath);
  await new Promise((resolve) => worker.once('listening', resolve));
  const gateway = createGateway({ socketPath, serviceToken: token });
  gateway.listen(0, '127.0.0.1');
  await new Promise((resolve) => gateway.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => gateway.close(resolve));
    await new Promise((resolve) => worker.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/healthz`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { gatewayReady: true, workerReady: false, ready: false, sandboxVerified: false, capabilities: { version: 1, queryPolicy: 'deny' } });
});

test('gateway carries worker policy proof from health, session JSON and screenshot headers', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'browser-gateway-worker-e2e-'));
  const socketPath = join(dir, 'worker.sock');
  const dataRoot = join(dir, 'sessions');
  const origin = 'http://fixture.test:8081';
  const proxyToken = 'gateway-worker-test-token-not-production-0001';
  const rules = { [origin]: { addresses: ['172.31.240.10'], allowPrivate: true } };
  const proxy = createRestrictedProxy({ rawRules: rules, adminToken: proxyToken });
  const relayPort = await availablePort();
  const proxySocket = join(dir, 'proxy.sock');
  const proxyAdminSocket = join(dir, 'proxy-admin.sock');
  await proxy.listenUnix({ proxySocketPath: proxySocket, adminSocketPath: proxyAdminSocket });

  const sandbox = 'Layer 1 Sandbox Namespace\nPID namespaces Yes\nSeccomp-BPF sandbox Yes';
  const opened = [];
  const browser = {
    async newContext() {
      const context = {
        async newPage() {
          const state = { currentUrl: 'about:blank' };
          const page = {
            async goto(url) { state.currentUrl = url; },
            url() { return state.currentUrl; },
            locator() { return { async innerText() { return sandbox; }, async click() {}, async fill() {} }; },
            mouse: { async wheel() {} },
            async screenshot() { return Buffer.from('isolated fixture PNG bytes'); },
            on() {},
          };
          context.page = page;
          opened.push(context);
          return page;
        },
        setDefaultTimeout() {},
        setDefaultNavigationTimeout() {},
        route() {},
        routeWebSocket() {},
        on() {},
        async close() {},
      };
      return context;
    },
    async close() {},
  };
  const worker = new BrowserWorker({
    rules,
    queryPolicy: 'deny',
    proxyAdminSocket,
    proxyAdminToken: proxyToken,
    proxyServer: `http://127.0.0.1:${relayPort}`,
    proxySocket,
    loopbackProxyPort: relayPort,
    dataRoot,
    launcher: { async launch() { return browser; } },
    networkInspector: () => ({ lo: [{ internal: true, address: '127.0.0.1' }] }),
    bridgeGateway: '172.31.240.1',
    sensitivePorts: ['22'],
    bridgeProbe: async () => 'ENETUNREACH',
  });
  await worker.start();
  const workerServer = createWorkerServer(worker);
  await listenUnix(workerServer, socketPath);
  const gateway = createGateway({ socketPath, serviceToken: token });
  gateway.listen(0, '127.0.0.1');
  await new Promise((resolve) => gateway.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => gateway.close(resolve));
    await new Promise((resolve) => workerServer.close(resolve));
    await worker.stop();
    proxy.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${gateway.address().port}`;
  const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const directClient = new BrowserClient({ socketPath });
  assert.deepEqual((await directClient.health()).capabilities, { version: 1, queryPolicy: 'deny' });

  const directScope = { botId: 'direct-bot', taskId: 'direct-task' };
  const directCreate = await directClient.create({
    ...directScope, operationId: 'direct-create-policy-0001', leaseMs: 60_000, allowedOrigins: [origin], requiredPolicy: { version: 1, queryPolicy: 'deny' },
  });
  assert.deepEqual(directCreate.enforcedPolicy, { version: 1, queryPolicy: 'deny' });
  const directStep = await directClient.operate(directCreate.sessionId, {
    ...directScope, requiredPolicy: { version: 1, queryPolicy: 'deny' }, operationId: 'direct-screen-policy-001', sequence: 1, action: 'screenshot',
  });
  assert.deepEqual(directStep.enforcedPolicy, { version: 1, queryPolicy: 'deny' });
  const directPng = await directClient.screenshot(directCreate.sessionId, directStep.result.resourceId, directScope, undefined, { version: 1, queryPolicy: 'deny' });
  assert.equal(directPng.toString(), 'isolated fixture PNG bytes');
  assert.deepEqual((await directClient.close(directCreate.sessionId, directScope, undefined, { version: 1, queryPolicy: 'deny' })).enforcedPolicy, { version: 1, queryPolicy: 'deny' });

  const healthResponse = await fetch(`${base}/healthz`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), {
    gatewayReady: true, workerReady: true, ready: true, sandboxVerified: true,
    capabilities: { version: 1, queryPolicy: 'deny' },
  });

  const scope = { botId: 'trusted-bot', taskId: 'trusted-task', requiredPolicy: { version: 1, queryPolicy: 'deny' } };
  const createResponse = await fetch(`${base}/v1/sessions`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ ...scope, operationId: 'create-policy-e2e-0001', allowedOrigins: [origin] }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.deepEqual(created.enforcedPolicy, scope.requiredPolicy);

  const refusedResponse = await fetch(`${base}/v1/sessions/${created.sessionId}/operations`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ ...scope, sequence: 1, operationId: 'query-policy-e2e-0001', action: 'navigate', args: { url: `${origin}/?blocked=1` } }),
  });
  assert.equal(refusedResponse.status, 403);
  const refused = await refusedResponse.json();
  assert.equal(refused.error.code, 'target-query-denied');
  assert.deepEqual(refused.enforcedPolicy, scope.requiredPolicy);

  const screenshotOperation = await fetch(`${base}/v1/sessions/${created.sessionId}/operations`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ ...scope, sequence: 2, operationId: 'screen-policy-e2e-0001', action: 'screenshot' }),
  });
  const screenshotResult = await screenshotOperation.json();
  assert.equal(screenshotOperation.status, 200);
  assert.deepEqual(screenshotResult.enforcedPolicy, scope.requiredPolicy);
  const screenshotResponse = await fetch(`${base}/v1/sessions/${created.sessionId}/screenshots/${screenshotResult.result.resourceId}`, {
    method: 'POST', headers: auth, body: JSON.stringify(scope),
  });
  assert.equal(screenshotResponse.status, 200);
  assert.equal(screenshotResponse.headers.get('x-browser-policy-version'), '1');
  assert.equal(screenshotResponse.headers.get('x-browser-query-policy'), 'deny');

  const closeResponse = await fetch(`${base}/v1/sessions/${created.sessionId}/close`, { method: 'POST', headers: auth, body: JSON.stringify(scope) });
  assert.equal(closeResponse.status, 200);
  assert.deepEqual((await closeResponse.json()).enforcedPolicy, scope.requiredPolicy);

  const cancelCreate = await fetch(`${base}/v1/sessions`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ ...scope, operationId: 'cancel-policy-e2e-0001', allowedOrigins: [origin] }),
  });
  const cancelSession = await cancelCreate.json();
  const cancelResponse = await fetch(`${base}/v1/sessions/${cancelSession.sessionId}/cancel`, { method: 'POST', headers: auth, body: JSON.stringify(scope) });
  assert.equal(cancelResponse.status, 200);
  assert.deepEqual((await cancelResponse.json()).enforcedPolicy, scope.requiredPolicy);
});
