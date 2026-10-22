import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { startLoopbackHostProxy } from './loopback-host-proxy.mjs';

test('forwards authenticated CLI HTTP to the private DSH Host through loopback only', async () => {
  let observed;
  const host = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    observed = {
      method: request.method,
      host: request.headers.host,
      url: request.url,
      authorization: request.headers.authorization,
      body: Buffer.concat(chunks).toString('utf8'),
    };
    response.writeHead(200, {
      'content-type': 'application/json',
      'set-cookie': 'authority=signed; HttpOnly',
    });
    response.end(JSON.stringify({ ok: true }));
  });
  host.listen(0, '127.0.0.1');
  await once(host, 'listening');
  const address = host.address();
  assert.ok(address && typeof address !== 'string');
  const target = `http://127.0.0.1:${address.port}`;
  const proxy = await startLoopbackHostProxy(target);

  try {
    const response = await fetch(`${proxy.origin}/api/botharness/list?token=private`, {
      method: 'POST',
      headers: { authorization: 'Bearer private', 'content-type': 'application/json' },
      body: '{"limit":5}',
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(response.headers.get('set-cookie'), 'authority=signed; HttpOnly');
    assert.deepEqual(observed, {
      method: 'POST',
      host: `127.0.0.1:${address.port}`,
      url: '/api/botharness/list?token=private',
      authorization: 'Bearer private',
      body: '{"limit":5}',
    });
    assert.equal(new URL(proxy.origin).hostname, '127.0.0.1');
  } finally {
    await proxy.close();
    host.closeAllConnections();
    await new Promise((resolve) => host.close(resolve));
  }
});

test('rejects non-HTTP or non-origin upstream targets', async () => {
  await assert.rejects(startLoopbackHostProxy('https://127.0.0.1:3080'), /HTTP origin/u);
  await assert.rejects(startLoopbackHostProxy('http://127.0.0.1:3080/path'), /HTTP origin/u);
});
