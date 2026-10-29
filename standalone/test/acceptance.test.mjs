import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { BotApplication } from '../src/application.ts';
import { startServer, allowedAddress } from '../src/server.ts';

const dir = () => mkdtempSync(join(tmpdir(), 'standalone-qa-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    const x = await fn();
    if (x) return x;
    await sleep(20);
  }
  throw Error('timed out');
}
async function fixture() {
  let calls = 0,
    pending = [];
  const model = createServer(async (req, res) => {
    calls++;
    for await (const _ of req) {
    }
    pending.push(res);
  });
  await new Promise((r) => model.listen(0, '127.0.0.1', r));
  const app = new BotApplication(dir());
  const bot = await app.execute('bots.create', { slug: 'qa-bot', name: 'QA' });
  await app.execute('bots.update', {
    botId: bot.id,
    model: { baseUrl: `http://127.0.0.1:${model.address().port}`, model: 'mock', keyless: true },
  });
  const conversation = await app.execute('conversations.create', { botId: bot.id });
  return {
    app,
    bot,
    conversation,
    get calls() {
      return calls;
    },
    pending,
    async close() {
      await app.close();
      model.closeAllConnections();
      await new Promise((r) => model.close(r));
    },
  };
}
const respond = (res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { content: 'mock reply' } }] }));
};

test('SB08/09/10: replay, lost response, busy conversation, cancellation and late completion', async () => {
  const f = await fixture();
  try {
    const p = {
      botId: f.bot.id,
      conversationId: f.conversation.id,
      idempotencyKey: 'same-key',
      content: 'hello',
    };
    const [a, b] = await Promise.all([
      f.app.execute('runs.submit', p),
      f.app.execute('runs.submit', p),
    ]);
    assert.equal(a.id, b.id);
    assert.equal(b.replayed, true);
    await until(() => f.calls === 1);
    const retry = await f.app.execute('runs.submit', p);
    assert.equal(retry.id, a.id);
    await assert.rejects(f.app.execute('runs.submit', { ...p, content: 'changed' }), {
      code: 'idempotency-conflict',
    });
    await assert.rejects(f.app.execute('runs.submit', { ...p, idempotencyKey: 'other' }), {
      code: 'conversation-busy',
    });
    await f.app.execute('runs.cancel', { botId: f.bot.id, runId: a.id });
    respond(f.pending[0]);
    await sleep(80);
    const run = await f.app.execute('runs.get', { botId: f.bot.id, runId: a.id });
    assert.equal(run.status, 'cancelled');
    const messages = await f.app.execute('messages.list', p);
    assert.deepEqual(
      messages.items.map((x) => x.role),
      ['user'],
    );
    assert.equal(f.calls, 1);
  } finally {
    await f.close();
  }
});

test('SB07/11: recovery, exclusive owner, scoped records, memory paths and revisions', async () => {
  const f = await fixture();
  const root = f.app.storage.root;
  let closed = false;
  try {
    assert.throws(() => new BotApplication(root), { code: 'data-directory-in-use' });
    const other = await f.app.execute('bots.create', { slug: 'other', name: 'Other' });
    await assert.rejects(
      f.app.execute('messages.list', { botId: other.id, conversationId: f.conversation.id }),
      { code: 'not-found' },
    );
    const saved = await f.app.execute('memory.write', {
      botId: f.bot.id,
      path: 'note.md',
      body: 'first',
      expectedRevision: null,
    });
    await assert.rejects(
      f.app.execute('memory.write', {
        botId: f.bot.id,
        path: 'note.md',
        body: 'second',
        expectedRevision: null,
      }),
      { code: 'memory-revision-conflict' },
    );
    assert.equal(
      (await f.app.execute('memory.read', { botId: f.bot.id, path: 'note.md' })).revision,
      saved.revision,
    );
    for (const path of ['../outside.md', '%2e%2e.md', '.git', 'x/y.md'])
      await assert.rejects(f.app.execute('memory.read', { botId: f.bot.id, path }));
    await assert.rejects(
      f.app.execute('memory.write', { botId: f.bot.id, path: 'big.md', body: 'x'.repeat(8193) }),
    );
    const target = join(root, 'outside');
    writeFileSync(target, 'outside');
    symlinkSync(target, join(root, 'bots', f.bot.id, 'memory', 'link.md'));
    await assert.rejects(f.app.execute('memory.read', { botId: f.bot.id, path: 'link.md' }), {
      code: 'unsafe-memory-path',
    });
    unlinkSync(join(root, 'bots', f.bot.id, 'memory', 'link.md'));
    const run = await f.app.execute('runs.submit', {
      botId: f.bot.id,
      conversationId: f.conversation.id,
      idempotencyKey: 'recovery',
      content: 'wait',
    });
    await until(() => f.calls === 1);
    await f.close();
    closed = true;
    const recovered = new BotApplication(root);
    try {
      assert.equal(
        (await recovered.execute('runs.get', { botId: f.bot.id, runId: run.id })).status,
        'interrupted',
      );
      assert.equal(f.calls, 1);
    } finally {
      await recovered.close();
    }
  } finally {
    if (!closed) await f.close();
  }
});

test('SB02/04/14: HTTP auth, origin, secret storage and live CLI', async () => {
  const root = dir();
  const portServer = createServer();
  await new Promise((r) => portServer.listen(0, '127.0.0.1', r));
  const port = portServer.address().port;
  await new Promise((r) => portServer.close(r));
  const base = `http://127.0.0.1:${port}`;
  const runtime = await startServer({ dataDir: root, port, host: '127.0.0.1', publicUrl: base });
  const post = (path, data, headers = {}) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(data),
    });
  try {
    assert.equal((await post('/api/v1/command', { command: 'bots.list' })).status, 401);
    assert.equal(
      (await post('/api/v1/session', { code: 'invalid' }, { origin: 'http://evil.invalid' }))
        .status,
      403,
    );
    assert.equal(
      (await post('/api/v1/session', { code: 'invalid' }, { 'sec-fetch-site': 'cross-site' }))
        .status,
      403,
    );
    assert.equal(allowedAddress('192.168.69.1'), false);
    assert.equal(allowedAddress('192.168.68.11'), true);
    const code = readFileSync(join(root, 'secrets', 'access-code'), 'utf8').trim();
    const login = await post('/api/v1/session', { code });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    const session = cookie.split(';')[0];
    const command = async (command, params = {}) => {
      const r = await post('/api/v1/command', { command, params }, { cookie: session });
      return { status: r.status, body: await r.json() };
    };
    const bot = (await command('bots.create', { slug: 'http-qa', name: 'QA' })).body.result;
    const secret = 'synthetic-test-secret-9dfcf';
    const updated = await command('bots.update', {
      botId: bot.id,
      apiKey: secret,
      model: { baseUrl: 'http://127.0.0.1:9', model: 'mock' },
    });
    assert.equal(updated.body.result.credentialConfigured, true);
    assert(!JSON.stringify(updated).includes(secret));
    assert(!readFileSync(join(root, 'bot.sqlite')).includes(Buffer.from(secret)));
    assert.equal(statSync(join(root, 'secrets', 'master.key')).mode & 0o777, 0o600);
    const sessionFile = join(root, 'cli-session');
    writeFileSync(sessionFile, session, { mode: 0o600 });
    const cli = spawn(process.execPath, ['--experimental-strip-types', 'src/cli.ts', 'bots.list'], {
      cwd: process.cwd(),
      env: { ...process.env, BOT_URL: base, BOT_SESSION_FILE: sessionFile },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    cli.stdin.end('{}');
    let out = '';
    cli.stdout.on('data', (x) => (out += x));
    const exit = await new Promise((r) => cli.on('exit', r));
    assert.equal(exit, 0);
    assert.equal(JSON.parse(out).result.items[0].id, bot.id);
    assert(!out.includes(secret));
    const bad = await command('bots.list', { cursor: 'invalid' });
    assert.equal(bad.body.error.code, 'invalid-cursor');
    assert.equal((await post('/api/v1/logout', {}, { cookie: session })).status, 200);
    assert.equal((await command('bots.list')).status, 401);
  } finally {
    await runtime.close();
  }
});

test('SB12: explicit CONNECT proxy carries model request and failure has no direct fallback', async () => {
  const { connect } = await import('node:net');
  let modelCalls = 0,
    tunnels = 0;
  const model = createServer(async (req, res) => {
    modelCalls++;
    for await (const _ of req) {
    }
    respond(res);
  });
  await new Promise((r) => model.listen(0, '127.0.0.1', r));
  const proxy = createServer();
  proxy.on('connect', (req, client, head) => {
    tunnels++;
    const upstream = connect(model.address().port, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
  });
  await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
  const app = new BotApplication(dir());
  try {
    const bot = await app.execute('bots.create', { slug: 'proxy-qa', name: 'QA' });
    const conversation = await app.execute('conversations.create', { botId: bot.id });
    const config = {
      baseUrl: `http://127.0.0.1:${model.address().port}`,
      model: 'mock',
      keyless: true,
      proxyUrl: `http://127.0.0.1:${proxy.address().port}`,
    };
    await app.execute('bots.update', { botId: bot.id, model: config });
    const run = await app.execute('runs.submit', {
      botId: bot.id,
      conversationId: conversation.id,
      idempotencyKey: 'proxied',
      content: 'test',
    });
    const done = await until(async () => {
      const x = await app.execute('runs.get', { botId: bot.id, runId: run.id });
      return x.status === 'completed' && x;
    });
    assert.equal(done.status, 'completed');
    assert.equal(tunnels, 1);
    assert.equal(modelCalls, 1);
    proxy.closeAllConnections();
    await new Promise((r) => proxy.close(r));
    const failed = await app.execute('runs.submit', {
      botId: bot.id,
      conversationId: conversation.id,
      idempotencyKey: 'proxy-down',
      content: 'test',
    });
    const result = await until(async () => {
      const x = await app.execute('runs.get', { botId: bot.id, runId: failed.id });
      return x.status === 'failed' && x;
    });
    assert.equal(result.errorCode, 'model-proxy-unreachable');
    assert.equal(modelCalls, 1);
  } finally {
    await app.close();
    proxy.closeAllConnections();
    model.closeAllConnections();
    if (proxy.listening) await new Promise((r) => proxy.close(r));
    await new Promise((r) => model.close(r));
  }
});

test('mapped public port accepts loopback Host while refusing wrong Host and cross-origin', async () => {
  const { request } = await import('node:http');
  const probe = createServer();
  await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const runtime = await startServer({
    dataDir: dir(),
    port,
    host: '127.0.0.1',
    publicUrl: 'http://192.168.68.11:22443',
  });
  const send = (host, origin) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          path: origin ? '/api/v1/session' : '/healthz',
          method: origin ? 'POST' : 'GET',
          headers: { host, ...(origin ? { origin, 'content-type': 'application/json' } : {}) },
        },
        (res) => {
          let body = '';
          res.on('data', (x) => (body += x));
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
        },
      );
      req.on('error', reject);
      req.end(origin ? JSON.stringify({ code: 'synthetic' }) : undefined);
    });
  try {
    for (const host of ['127.0.0.1:22443', 'localhost:22443', '192.168.68.11:22443'])
      assert.equal((await send(host)).status, 200, host);
    for (const host of ['127.0.0.1:22444', 'localhost:22444', 'evil.invalid:22443'])
      assert.equal((await send(host)).status, 403, host);
    const r = await send('127.0.0.1:22443', 'http://evil.invalid');
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'origin-not-allowed');
  } finally {
    await runtime.close();
  }
});
