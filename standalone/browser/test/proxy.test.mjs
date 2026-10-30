import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { connect as tcpConnect, createServer as createTcpServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createRestrictedProxy, parseConnectAuthority } from '../src/proxy.mjs';
import { createLoopbackProxyRelay } from '../src/worker.mjs';
import { createFixtureServer } from '../fixture/server.mjs';

const origin = 'http://fixture.test:8081';
const rules = { [origin]: { addresses: ['172.31.240.10'], allowPrivate: true } };
const adminToken = 'admin-token-for-proxy-test-is-not-a-real-secret-0001';
const sessionId = '123e4567-e89b-42d3-a456-426614174000';
const secret = 'per-session-proxy-secret-for-test-000000000000';

test('CONNECT accepts explicit HTTPS port 443 after URL normalization', () => {
  const parsed = parseConnectAuthority('fixture.test:443');
  assert.equal(parsed.url.origin, 'https://fixture.test');
  assert.equal(parsed.url.port, '');
  assert.equal(parsed.port, 443);
});

function proxyRequest(port, options) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, ...options }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('proxy lease control is authenticated and requests revalidate DNS before connecting', async (t) => {
  const logged = [];
  const service = createRestrictedProxy({ rawRules: rules, adminToken, lookup: async () => [{ address: '172.31.240.11', family: 4 }], logger: (entry) => logged.push(entry) });
  await service.listen({ proxyPort: 0, adminPort: 0, host: '127.0.0.1' });
  const proxyPort = service.proxy.address().port;
  const adminPort = service.admin.address().port;
  t.after(() => service.close());

  const noAuth = await proxyRequest(proxyPort, { path: `${origin}/`, headers: { host: 'fixture.test:8081' } });
  assert.equal(noAuth.status, 407);

  const badAdmin = await fetch(`http://127.0.0.1:${adminPort}/internal/leases`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-proxy-admin-token': 'wrong-token' },
    body: JSON.stringify({ sessionId, secret, expiresAt: Date.now() + 60_000, origins: [origin] }),
  });
  assert.equal(badAdmin.status, 403);

  const registered = await fetch(`http://127.0.0.1:${adminPort}/internal/leases`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-proxy-admin-token': adminToken },
    body: JSON.stringify({ sessionId, secret, expiresAt: Date.now() + 60_000, origins: [origin] }),
  });
  assert.equal(registered.status, 201);

  const auth = `Basic ${Buffer.from(`${sessionId}:${secret}`).toString('base64')}`;
  const denied = await proxyRequest(proxyPort, { path: `${origin}/`, headers: { host: 'fixture.test:8081', 'proxy-authorization': auth } });
  assert.equal(denied.status, 403);
  assert.equal(JSON.parse(denied.body).error.code, 'target-address-changed');
  assert.equal(logged.at(-1).code, 'target-address-changed');
  assert.equal(JSON.stringify(logged).includes(secret), false);
});

test('proxy rejects an origin not covered by the lease before DNS or connection', async (t) => {
  let lookedUp = false;
  const service = createRestrictedProxy({ rawRules: rules, adminToken, lookup: async () => { lookedUp = true; return []; } });
  await service.listen({ proxyPort: 0, adminPort: 0, host: '127.0.0.1' });
  const proxyPort = service.proxy.address().port, adminPort = service.admin.address().port;
  t.after(() => service.close());
  const registered = await fetch(`http://127.0.0.1:${adminPort}/internal/leases`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-proxy-admin-token': adminToken },
    body: JSON.stringify({ sessionId, secret, expiresAt: Date.now() + 60_000, origins: [origin] }),
  });
  assert.equal(registered.status, 201);
  const auth = `Basic ${Buffer.from(`${sessionId}:${secret}`).toString('base64')}`;
  const denied = await proxyRequest(proxyPort, { path: 'http://127.0.0.1:9/', headers: { host: '127.0.0.1:9', 'proxy-authorization': auth } });
  assert.equal(denied.status, 403);
  assert.equal(JSON.parse(denied.body).error.code, 'target-origin-denied');
  assert.equal(lookedUp, false);
});

test('proxy refuses an unapproved CONNECT destination before DNS or TCP connect', async (t) => {
  let lookedUp = false;
  const service = createRestrictedProxy({ rawRules: rules, adminToken, lookup: async () => { lookedUp = true; return []; } });
  await service.listen({ proxyPort: 0, adminPort: 0, host: '127.0.0.1' });
  const proxyPort = service.proxy.address().port, adminPort = service.admin.address().port;
  t.after(() => service.close());
  const registered = await fetch(`http://127.0.0.1:${adminPort}/internal/leases`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-proxy-admin-token': adminToken },
    body: JSON.stringify({ sessionId, secret, expiresAt: Date.now() + 60_000, origins: [origin] }),
  });
  assert.equal(registered.status, 201);
  const response = await new Promise((resolve, reject) => {
    const socket = tcpConnect(proxyPort, '127.0.0.1');
    let data = '';
    socket.once('connect', () => socket.write(`CONNECT 127.0.0.1:9 HTTP/1.1\r\nHost: 127.0.0.1:9\r\nProxy-Authorization: Basic ${Buffer.from(`${sessionId}:${secret}`).toString('base64')}\r\n\r\n`));
    socket.on('data', (chunk) => { data += chunk.toString('latin1'); if (data.includes('\r\n\r\n')) { socket.destroy(); resolve(data); } });
    socket.on('error', reject);
  });
  assert.match(response, /^HTTP\/1\.1 403/u);
  assert.equal(lookedUp, false);
});

test('proxy allows pinned HTTP fixture requests with Node all-address lookup semantics', async (t) => {
  let expectedHost;
  const fixture = createFixtureServer({ expectedHost: () => expectedHost });
  fixture.listen(0, '127.0.0.1');
  await new Promise((resolve) => fixture.once('listening', resolve));
  const fixturePort = fixture.address().port;
  expectedHost = `fixture.test:${fixturePort}`;
  const fixtureOrigin = `http://fixture.test:${fixturePort}`;
  const fixtureRules = { [fixtureOrigin]: { addresses: ['172.31.240.10'], allowPrivate: true } };
  const service = createRestrictedProxy({
    rawRules: fixtureRules,
    adminToken,
    lookup: async (_host, options) => {
      assert.equal(options.all, true);
      return [{ address: '172.31.240.10', family: 4 }];
    },
    httpRequestImpl(options, callback) {
      const lookup = (host, lookupOptions, done) => options.lookup(host, lookupOptions, (error, address) => {
        assert.ifError(error);
        const addresses = Array.isArray(address) ? address : [{ address, family: 4 }];
        assert.deepEqual(addresses, [{ address: '172.31.240.10', family: 4 }]);
        const mapped = Array.isArray(address) ? address.map((item) => ({ ...item, address: '127.0.0.1' })) : '127.0.0.1';
        done(null, mapped);
      });
      return httpRequest({ ...options, lookup }, callback);
    },
  });
  await service.listen({ proxyPort: 0, adminPort: 0, host: '127.0.0.1' });
  t.after(async () => {
    service.close();
    await new Promise((resolve) => fixture.close(resolve));
  });
  const registered = await fetch(`http://127.0.0.1:${service.admin.address().port}/internal/leases`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-proxy-admin-token': adminToken },
    body: JSON.stringify({ sessionId, secret, expiresAt: Date.now() + 60_000, origins: [fixtureOrigin] }),
  });
  assert.equal(registered.status, 201);
  const auth = `Basic ${Buffer.from(`${sessionId}:${secret}`).toString('base64')}`;
  const result = await proxyRequest(service.proxy.address().port, { path: `${fixtureOrigin}/count`, headers: { host: `fixture.test:${fixturePort}`, 'proxy-authorization': auth } });
  assert.equal(result.status, 200);
  assert.match(result.body, /Count: 0/u);
});

test('proxy opens an authorized CONNECT tunnel to the pinned address on effective port 443', async (t) => {
  const echo = createTcpServer((socket) => socket.on('data', (chunk) => socket.write(chunk)));
  echo.listen(0, '127.0.0.1');
  await new Promise((resolve) => echo.once('listening', resolve));
  let connectedPort;
  const secureOrigin = 'https://fixture.test';
  const service = createRestrictedProxy({
    rawRules: { [secureOrigin]: { addresses: ['172.31.240.10'], allowPrivate: true } },
    adminToken,
    lookup: async () => [{ address: '172.31.240.10', family: 4 }],
    tcpConnectImpl: ({ host, port }) => {
      assert.equal(host, '172.31.240.10');
      connectedPort = port;
      return tcpConnect(echo.address().port, '127.0.0.1');
    },
  });
  await service.listen({ proxyPort: 0, adminPort: 0, host: '127.0.0.1' });
  t.after(async () => {
    service.close();
    await new Promise((resolve) => echo.close(resolve));
  });
  const registered = await fetch(`http://127.0.0.1:${service.admin.address().port}/internal/leases`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-proxy-admin-token': adminToken },
    body: JSON.stringify({ sessionId, secret, expiresAt: Date.now() + 60_000, origins: [secureOrigin] }),
  });
  assert.equal(registered.status, 201);
  const response = await new Promise((resolve, reject) => {
    const socket = tcpConnect(service.proxy.address().port, '127.0.0.1');
    let received = Buffer.alloc(0), sentProbe = false;
    socket.once('connect', () => socket.write(`CONNECT fixture.test:443 HTTP/1.1\r\nHost: fixture.test:443\r\nProxy-Authorization: Basic ${Buffer.from(`${sessionId}:${secret}`).toString('base64')}\r\n\r\n`));
    socket.on('data', (chunk) => {
      received = Buffer.concat([received, chunk]);
      if (!sentProbe && received.includes(Buffer.from('\r\n\r\n'))) { sentProbe = true; socket.write('pinned-443'); }
      if (received.includes(Buffer.from('pinned-443'))) resolve({ received, socket });
    });
    socket.on('error', reject);
  });
  assert.match(response.received.toString('latin1'), /^HTTP\/1\.1 200 Connection Established/u);
  assert.equal(connectedPort, 443);
  const closed = new Promise((resolve) => response.socket.once('close', resolve));
  const revoked = await fetch(`http://127.0.0.1:${service.admin.address().port}/internal/leases/${sessionId}/close`, {
    method: 'POST', headers: { 'x-proxy-admin-token': adminToken }, body: '{}',
  });
  assert.equal(revoked.status, 200);
  await closed;
});

test('loopback relay carries HTTP proxy auth over the private proxy UDS', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'browser-proxy-uds-'));
  const proxyPath = join(dir, 'proxy.sock'), adminPath = join(dir, 'admin.sock');
  const service = createRestrictedProxy({ rawRules: rules, adminToken, lookup: async () => [{ address: '172.31.240.11', family: 4 }] });
  await service.listenUnix({ proxySocketPath: proxyPath, adminSocketPath: adminPath });
  const relay = createLoopbackProxyRelay(proxyPath);
  await new Promise((resolve, reject) => relay.once('error', reject).listen(0, '127.0.0.1', resolve));
  const relayPort = relay.address().port;
  t.after(async () => {
    await new Promise((resolve) => relay.close(resolve));
    service.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const registration = await new Promise((resolve, reject) => {
    const req = httpRequest({ socketPath: adminPath, path: '/internal/leases', method: 'POST', headers: { 'content-type': 'application/json', 'x-proxy-admin-token': adminToken } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    req.end(JSON.stringify({ sessionId, secret, expiresAt: Date.now() + 60_000, origins: [origin] }));
  });
  assert.equal(registration, 201);
  const auth = `Basic ${Buffer.from(`${sessionId}:${secret}`).toString('base64')}`;
  const result = await proxyRequest(relayPort, { path: `${origin}/`, headers: { host: 'fixture.test:8081', 'proxy-authorization': auth } });
  assert.equal(result.status, 403);
  assert.equal(JSON.parse(result.body).error.code, 'target-address-changed');
  const connectResponse = await new Promise((resolve, reject) => {
    const socket = tcpConnect(relayPort, '127.0.0.1');
    let data = Buffer.alloc(0);
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('CONNECT refusal was not closed.')); }, 1000);
    timer.unref();
    socket.once('connect', () => socket.write(`CONNECT 127.0.0.1:9 HTTP/1.1\r\nHost: 127.0.0.1:9\r\nProxy-Authorization: ${auth}\r\n\r\n`));
    socket.on('data', (chunk) => { data = Buffer.concat([data, chunk]); });
    socket.once('end', () => { clearTimeout(timer); resolve(data.toString('latin1')); });
    socket.on('error', reject);
  });
  assert.match(connectResponse, /^HTTP\/1\.1 403/u);
});

test('loopback relay closes its upstream CONNECT socket when the browser client disconnects', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'browser-relay-cancel-'));
  const proxyPath = join(dir, 'proxy.sock');
  const proxySockets = [];
  const proxySocketServer = createTcpServer((socket) => { proxySockets.push(socket); });
  proxySocketServer.listen(proxyPath);
  await new Promise((resolve) => proxySocketServer.once('listening', resolve));
  const relayEvents = [];
  const relay = createLoopbackProxyRelay(proxyPath, (entry) => relayEvents.push(entry));
  await new Promise((resolve, reject) => relay.once('error', reject).listen(0, '127.0.0.1', resolve));
  let relayClient;
  relay.once('connection', (socket) => { relayClient = socket; });
  t.after(async () => {
    for (const socket of proxySockets) socket.destroy();
    await new Promise((resolve) => relay.close(resolve));
    await new Promise((resolve) => proxySocketServer.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });
  const client = tcpConnect(relay.address().port, '127.0.0.1');
  await new Promise((resolve) => client.once('connect', resolve));
  client.write('CONNECT fixture.test:443 HTTP/1.1\r\nHost: fixture.test:443\r\n\r\n');
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('relay did not open its proxy UDS socket')), 1000);
    const poll = setInterval(() => {
      if (proxySockets[0]) {
        clearTimeout(timeout);
        clearInterval(poll);
        resolve();
      }
    }, 5);
  });
  const clientClosed = new Promise((resolve) => client.once('close', resolve));
  const relayClientEnded = new Promise((resolve) => relayClient.once('end', resolve));
  client.end();
  await Promise.race([clientClosed, new Promise((_, reject) => setTimeout(() => reject(new Error('browser test socket did not close')), 1000))]);
  await Promise.race([relayClientEnded, new Promise((_, reject) => setTimeout(() => reject(new Error('relay did not observe browser disconnect')), 1000))]);
  assert.ok(relayEvents.some((entry) => entry.event === 'relay-cleanup' && entry.upstreamSocketDestroyed));
});
