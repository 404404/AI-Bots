import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { zstdDecompressSync } from 'node:zlib';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../src/storage.ts';
import { CodexAuth } from '../src/codex-auth.ts';
import { completeCodex } from '../src/codex-model.ts';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
class FakeWorker extends EventEmitter {
  postMessage(x) {
    this.answer = x;
  }
  terminate() {
    return Promise.resolve(0);
  }
}
const grant = (expires = Date.now() + 3600000) => ({
  type: 'oauth',
  access: 'synthetic-access-xyz',
  refresh: 'synthetic-refresh-xyz',
  expires,
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'codex-qa-'));
  const storage = new Storage(root);
  for (const id of ['a', 'b'])
    storage.db
      .prepare(
        'INSERT INTO bots(id,slug,name,persona,config,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(id, id, id, '', '{}', 'now', 'now');
  const workers = [],
    logs = [];
  const auth = new CodexAuth(
    storage,
    (...x) => logs.push(x),
    (data) => {
      const w = new FakeWorker();
      w.data = data;
      workers.push(w);
      return w;
    },
  );
  return { root, storage, auth, workers, logs };
}
function store(f, bot, g) {
  f.storage.db
    .prepare(
      'INSERT INTO oauth_credentials(bot_id,credential) VALUES(?,?) ON CONFLICT(bot_id) DO UPDATE SET credential=excluded.credential',
    )
    .run(bot, f.storage.encrypt(JSON.stringify(g)));
}

test('SB17: authorization state, encrypted grant, cancellation and failure redaction', async () => {
  const f = fixture();
  try {
    let status = f.auth.begin('a', '', 'device_code');
    assert.equal(status.attempt.phase, 'running');
    const w = f.workers[0];
    w.emit('message', {
      type: 'device-code',
      url: 'https://auth.openai.com/codex/device',
      userCode: 'TEST-CODE',
    });
    assert.equal(f.auth.status('a').attempt.userCode, 'TEST-CODE');
    w.emit('message', { type: 'authorized', credential: grant() });
    status = f.auth.status('a');
    assert.equal(status.signedIn, true);
    assert.equal(status.attempt.url, null);
    assert(!JSON.stringify(status).includes('synthetic-access'));
    assert(!readFileSync(join(f.root, 'bot.sqlite')).includes(Buffer.from('synthetic-refresh')));
    f.auth.logout('a');
    assert.equal(f.auth.status('a').signedIn, false);
    f.auth.begin('a', '', 'browser');
    const cancelled = f.workers.at(-1);
    f.auth.cancel('a');
    cancelled.emit('message', { type: 'authorized', credential: grant() });
    assert.equal(f.auth.status('a').signedIn, false);
    f.auth.begin('b', '', 'browser');
    const failed = f.workers.at(-1);
    failed.emit('message', { type: 'failed', code: 'codex-auth-forbidden', status: 403 });
    assert.equal(f.auth.status('b').attempt.errorCode, 'codex-auth-forbidden');
    assert(!JSON.stringify(f.logs).includes('synthetic-access'));
  } finally {
    await f.auth.close();
    f.storage.close();
  }
});

test('SB17: refresh is shared and logout prevents late refresh writing credentials', async () => {
  const f = fixture();
  try {
    store(f, 'a', grant(0));
    const signal = new AbortController().signal;
    const first = f.auth.access('a', '', signal);
    const second = f.auth.access('a', '', signal);
    assert.equal(f.workers.length, 1);
    f.workers[0].emit('message', { type: 'authorized', credential: grant() });
    assert.deepEqual(await first, await second);
    store(f, 'a', grant(0));
    const late = f.auth.access('a', '', signal);
    const worker = f.workers.at(-1);
    f.auth.logout('a');
    worker.emit('message', { type: 'authorized', credential: grant() });
    await assert.rejects(late, { code: 'codex-auth-changed' });
    assert.equal(f.auth.status('a').signedIn, false);
  } finally {
    await f.auth.close();
    f.storage.close();
  }
});

test('SB17: locked SDK emits scoped SSE request and combines text', async () => {
  const model = openaiCodexProvider().getModels()[0].id;
  const payload = Buffer.from(
    JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-account' } }),
  ).toString('base64url');
  const token = `e30.${payload}.signature`;
  let seen;
  const item = {
    id: 'm1',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'output_text', text: 'mock reply' }],
  };
  const events = [
    { type: 'response.created', response: { id: 'r1' } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
    { type: 'response.output_text.delta', output_index: 0, delta: 'mock ' },
    { type: 'response.output_text.delta', output_index: 0, delta: 'reply' },
    { type: 'response.output_item.done', output_index: 0, item },
    {
      type: 'response.completed',
      response: {
        id: 'r1',
        status: 'completed',
        usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
      },
    },
  ];
  const result = await completeCodex(
    model,
    token,
    [
      { role: 'system', content: 'persona' },
      { role: 'user', content: 'hello' },
    ],
    '',
    'session-qa',
    new AbortController().signal,
    {
      request: async (url, init) => {
        seen = { url: String(url), init };
        return new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), {
          headers: { 'content-type': 'text/event-stream' },
        });
      },
    },
  );
  assert.equal(result, 'mock reply');
  assert.equal(seen.url, 'https://chatgpt.com/backend-api/codex/responses');
  assert.equal(seen.init.redirect, 'error');
  assert(seen.init.dispatcher);
  const body = JSON.parse(
    typeof seen.init.body === 'string'
      ? seen.init.body
      : zstdDecompressSync(seen.init.body).toString(),
  );
  assert.equal(body.model, model);
  assert.equal(body.stream, true);
  assert(JSON.stringify(body).includes('hello'));
  const headers = new Headers(seen.init.headers);
  assert.equal(headers.get('chatgpt-account-id'), 'synthetic-account');
  assert.equal(headers.get('authorization'), `Bearer ${token}`);
});

test('SB17: cancelling one refresh waiter does not cancel another Bot run', async () => {
  const f = fixture();
  try {
    store(f, 'a', grant(0));
    const a = new AbortController(),
      b = new AbortController();
    const first = f.auth.access('a', '', a.signal);
    const second = f.auth.access('a', '', b.signal);
    a.abort();
    f.workers[0].emit('message', { type: 'authorized', credential: grant() });
    await assert.rejects(first, { code: 'cancelled' });
    assert.equal((await second).access, grant().access);
  } finally {
    await f.auth.close();
    f.storage.close();
  }
});

test('SB17: model 403 yields bounded error without upstream body or retries', async () => {
  const model = openaiCodexProvider().getModels()[0].id;
  const payload = Buffer.from(
    JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-account' } }),
  ).toString('base64url');
  let calls = 0;
  await assert.rejects(
    completeCodex(
      model,
      `e30.${payload}.signature`,
      [{ role: 'user', content: 'hello' }],
      '',
      's',
      new AbortController().signal,
      {
        request: async () => {
          calls++;
          return new Response('synthetic-sensitive-upstream-body', { status: 403 });
        },
      },
    ),
    (e) =>
      e.code === 'model-forbidden' &&
      e.upstreamStatus === 403 &&
      !String(e.message).includes('synthetic-sensitive'),
  );
  assert.equal(calls, 1);
});

test('SB17: later waiter can cancel independently; pre-cancelled call starts no worker', async () => {
  const f = fixture();
  try {
    store(f, 'a', grant(0));
    const cancelled = new AbortController();
    cancelled.abort();
    await assert.rejects(f.auth.access('a', '', cancelled.signal), { code: 'cancelled' });
    assert.equal(f.workers.length, 0);
    const first = new AbortController(),
      second = new AbortController();
    const one = f.auth.access('a', '', first.signal);
    const two = f.auth.access('a', '', second.signal);
    second.abort();
    await assert.rejects(two, { code: 'cancelled' });
    assert.equal(f.workers.length, 1);
    f.workers[0].emit('message', { type: 'authorized', credential: grant() });
    assert.equal((await one).access, grant().access);
  } finally {
    await f.auth.close();
    f.storage.close();
  }
});
