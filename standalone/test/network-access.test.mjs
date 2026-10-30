import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  configuredTrustedUrls,
  createNetworkAccessPolicy,
  isPrivateOrLoopbackAddress,
  normalizeIpAddress,
  trustedHost,
  trustedOrigin,
} from '../src/network-access.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request } from 'node:http';
import { startServer } from '../src/server.ts';

test('private IPv4, CGNAT, ULA and loopback are CIDR checked; public and transition IPv6 stay out', () => {
  for (const ip of [
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.255.255',
    '100.64.0.1',
    '100.127.255.254',
    '127.0.0.1',
    '::1',
    '0:0:0:0:0:0:0:1',
    'fc00::1',
    'fdff:ffff::1',
    '::ffff:192.168.68.11',
    '::ffff:127.0.0.1',
  ]) assert.equal(isPrivateOrLoopbackAddress(ip), true, ip);
  for (const ip of [
    '9.255.255.255',
    '172.15.255.255',
    '172.32.0.0',
    '192.167.255.255',
    '100.63.255.255',
    '100.128.0.0',
    '8.8.8.8',
    '2001:4860:4860::8888',
    '0:0:0:0:0:0:0:0',
    '2002:0808:0808::1',
    '64:ff9b::0808:0808',
    '::ffff:8.8.8.8',
    'not-an-ip',
  ]) assert.equal(isPrivateOrLoopbackAddress(ip), false, ip);
  assert.deepEqual(normalizeIpAddress('::ffff:192.168.68.11'), {
    version: 4,
    value: 0xc0a8440bn,
  });
});

test('trusted URL aliases match exact normalized hosts and origins only', () => {
  const policy = createNetworkAccessPolicy(
    'http://192.168.68.11:20443',
    ['http://192.168.68.12:20443', 'http://10.250.250.1:20443'],
    3080,
  );
  assert.equal(trustedHost('192.168.68.12:20443', policy), true);
  assert.equal(trustedHost('192.168.68.12:20444', policy), false);
  assert.equal(trustedHost('evil.invalid:20443', policy), false);
  assert.equal(trustedHost('user@192.168.68.12:20443', policy), false);
  assert.equal(trustedOrigin('http://10.250.250.1:20443', policy), true);
  assert.equal(trustedOrigin('http://10.250.250.1:20444', policy), false);
  assert.equal(trustedOrigin('https://192.168.68.11:20443', policy), false);
  assert.equal(trustedOrigin('null', policy), false);
  assert.deepEqual(configuredTrustedUrls('["http://10.250.250.1:20443"]'), [
    'http://10.250.250.1:20443',
  ]);
  assert.throws(() => createNetworkAccessPolicy('http://localhost:3080', ['*']), {
    code: 'invalid-trusted-url',
  });
  for (const alias of [' http://evil.invalid', 'http://*.invalid:3080', 'http://evil.invalid\n'])
    assert.throws(() => createNetworkAccessPolicy('http://localhost:3080', [alias]), {
      code: 'invalid-trusted-url',
    });
});

test('HTTP accepts configured LAN alias, rejects forged Host/Origin, and keeps API authentication', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'network-access-'));
  const probe = await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
  const port = Number(probe);
  const runtime = await startServer({
    dataDir,
    port,
    host: '127.0.0.1',
    publicUrl: `http://192.168.68.11:${port}`,
    trustedUrls: [`http://192.168.68.12:${port}`, `http://10.250.250.1:${port}`],
  });
  const send = (host, origin, path = '/api/v1/session', body = { code: 'invalid-synthetic-code' }) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          path,
          method: 'POST',
          headers: {
            host,
            origin,
            'content-type': 'application/json',
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
        },
      );
      req.on('error', reject);
      req.end(JSON.stringify(body));
    });
  try {
    for (const alias of ['192.168.68.12', '10.250.250.1']) {
      const allowed = await send(`${alias}:${port}`, `http://${alias}:${port}`);
      assert.equal(allowed.status, 401, 'trusted origin reaches credential check, remains authenticated');
    }
    assert.equal(
      (
        await send(
          `10.250.250.1:${port}`,
          `http://10.250.250.1:${port}`,
          '/api/v1/command',
          { command: 'bots.list' },
        )
      ).status,
      401,
      'trusted alias still requires a session',
    );
    assert.equal((await send(`evil.invalid:${port}`, `http://192.168.68.12:${port}`)).status, 403);
    assert.equal((await send(`192.168.68.12:${port}`, 'http://evil.invalid')).status, 403);
    assert.equal((await send(`192.168.68.12:${port}`, `http://192.168.68.12:${port}/path`)).status, 403);
  } finally {
    await runtime.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
