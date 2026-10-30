import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { test } from 'node:test';
import { createFixtureServer } from '../fixture/server.mjs';

function request(port, path, { method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method, headers: { host: 'fixture.test:8081', ...(body ? { 'content-type': 'application/x-www-form-urlencoded', 'content-length': Buffer.byteLength(body) } : {}) } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('isolated fixture serves a real form action and exposes a count result', async (t) => {
  const server = createFixtureServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const start = await request(port, '/');
  assert.equal(start.status, 200);
  assert.match(start.body, /id="increment"/u);
  const post = await request(port, '/increment', { method: 'POST', body: 'note=isolated' });
  assert.equal(post.status, 303);
  assert.equal(post.headers.location, '/count');
  const count = await request(port, '/count');
  assert.match(count.body, /Count: 1/u);
});
