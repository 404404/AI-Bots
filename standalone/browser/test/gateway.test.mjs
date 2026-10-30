import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createGateway } from '../src/gateway.mjs';

const token = 'gateway-test-token-that-is-not-a-production-secret-0001';

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
    const body = Buffer.from(JSON.stringify({ ready: false, sandboxVerified: false }));
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
  assert.deepEqual(await response.json(), { gatewayReady: true, workerReady: false });
});
