import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { zstdDecompressSync } from 'node:zlib';
import { BotApplication } from '../src/application.ts';

const roots = [];
const dir = () => { const root = mkdtempSync(join(tmpdir(), 'private-chat-')); roots.push(root); return root; };
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const owner = (app, command, params = {}) => app.execute(command, params, { kind: 'owner' });
const wait = async (fn) => { for (let i = 0; i < 200; i++) { if (await fn()) return; await new Promise((resolve) => setTimeout(resolve, 10)); } throw new Error('fixture-timeout'); };

async function fixture() {
  const requests = [];
  const upstream = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'synthetic employee reply' } }] }));
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const app = new BotApplication(dir());
  const worker = await owner(app, 'bots.create', { slug: 'private-worker', name: '员工甲' });
  await owner(app, 'model-account.update', { provider: 'compatible', baseUrl: `http://127.0.0.1:${upstream.address().port}`, model: 'mock-v1', key: 'synthetic-private-key-731' });
  return { app, worker, upstream, requests,
    async close() { await app.close(); upstream.closeAllConnections(); await new Promise((resolve) => upstream.close(resolve)); } };
}

test('DE01 work Bot private chat resolves its existing delegated reference without copying credentials', async () => {
  const f = await fixture();
  try {
    const opened = await owner(f.app, 'private-chat.open', { botId: f.worker.id });
    assert.equal(opened.botId, f.worker.id);
    assert.equal(opened.conversation.botId, f.worker.id);
    assert.deepEqual(opened.selection, { kind: 'global', modelId: 'mock-v1' });
    const models = await owner(f.app, 'private-chat.models', { botId: f.worker.id });
    assert.equal(models.items.length, 1);
    assert.equal(models.items[0].label, '模型账户 · mock-v1');
    assert(!JSON.stringify(models).includes('synthetic-private-key-731'));
    const request = { botId: f.worker.id, conversationId: opened.conversation.id, idempotencyKey: 'employee-private-1',
      content: '合成私聊输入', selection: opened.selection };
    const run = await owner(f.app, 'runs.submit', request);
    await wait(() => f.requests.length === 1 && f.app.storage.db.prepare("SELECT status FROM runs WHERE id=?").get(run.id)?.status === 'completed');
    assert.equal(f.requests[0].model, 'mock-v1');
    const saved = await owner(f.app, 'runs.get', { botId: f.worker.id, runId: run.id });
    assert.deepEqual(saved.configSnapshot.selection, opened.selection);
    assert.equal(saved.configSnapshot.sourceModelEpoch > 0, true);
    assert(!JSON.stringify(saved).includes('synthetic-private-key-731'));
    assert.equal((await owner(f.app, 'bots.get', { botId: f.worker.id })).credentialConfigured, false);
  } finally { await f.close(); }
});

test('each Bot uses the shared global account selection without local model configuration', async () => {
  const f = await fixture();
  try {
    const bot = f.worker;
    const opened = await owner(f.app, 'private-chat.open', { botId: bot.id });
    assert.deepEqual(opened.selection, {kind:'global',modelId:'mock-v1'});
    await assert.rejects(owner(f.app, 'runs.submit', { botId: bot.id, conversationId: opened.conversation.id,
      idempotencyKey: 'requires-choice', content: 'must not transport', selection:{kind:'global',modelId:'unauthorized'} }), { code: 'model-not-authorized' });
    assert.equal(f.requests.length, 0);
    const selection = { kind: 'global', modelId: 'mock-v1' };
    await owner(f.app, 'private-chat.select-model', { botId: bot.id, selection });
    const run = await owner(f.app, 'runs.submit', { botId: bot.id, conversationId: opened.conversation.id,
      idempotencyKey: 'saved-choice', content: 'explicit saved choice' });
    await wait(() => f.requests.length === 1);
    assert.equal((await owner(f.app, 'runs.get', { botId: bot.id, runId: run.id })).configSnapshot.selection.kind, 'global');
    const explicit = await owner(f.app, 'runs.submit', { botId: bot.id, conversationId: opened.conversation.id,
      idempotencyKey: 'request-choice', content: 'request choice', selection });
    await wait(() => f.requests.length === 2);
    assert.equal((await owner(f.app, 'runs.get', { botId: bot.id, runId: explicit.id })).configSnapshot.selection.modelId, 'mock-v1');
  } finally { await f.close(); }
});

test('global Codex model candidates can be selected safely and account settings round-trip keyless', async () => {
  const f = await fixture();
  try {
    const catalog = f.app.auth.status('@owner').models;
    assert(catalog.length > 1, 'locked Codex SDK catalog should expose multiple model choices');
    const [defaultModel, alternateModel] = catalog;
    const at = Date.now();
    const payload = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-account' } })).toString('base64url');
    const oauth = f.app.storage.encrypt(JSON.stringify({ type: 'oauth', access: `e30.${payload}.signature`,
      refresh: 'synthetic-refresh-token', expires: at + 600_000 }));
    f.app.storage.db.prepare('UPDATE model_account SET oauth_credential=? WHERE singleton=1').run(oauth);
    await owner(f.app, 'model-account.update', { provider: 'openai-codex', model: defaultModel.id, keyless: true });

    const account = await owner(f.app, 'model-account.get');
    assert.equal(account.keyless, true);
    assert.equal(account.auth.signedIn, true);
    const models = await owner(f.app, 'private-chat.models', { botId: f.worker.id });
    const alternate = models.items.find((item) => item.model === alternateModel.id);
    assert.equal(alternate.status, 'candidate');
    const selected = { kind: 'global', modelId: alternateModel.id };
    const saved = await owner(f.app, 'private-chat.select-model', { botId: f.worker.id, selection: selected });
    assert.deepEqual(saved.selected, selected);
    const resolved = f.app.privateChat.resolve(f.worker.id, selected);
    assert.equal(resolved.config.model, alternateModel.id);
    assert.equal(resolved.sourceModelEpoch, account.epoch);

    let requestedModel;
    const item = { id: 'synthetic-message', type: 'message', role: 'assistant',
      content: [{ type: 'output_text', text: 'synthetic Codex reply' }] };
    const events = [
      { type: 'response.created', response: { id: 'synthetic-response' } },
      { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
      { type: 'response.output_text.delta', output_index: 0, delta: 'synthetic Codex reply' },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id: 'synthetic-response', status: 'completed',
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
    ];
    f.app.codexTransport = { request: async (_url, init) => {
      const body = typeof init.body === 'string' ? init.body : zstdDecompressSync(init.body).toString();
      requestedModel = JSON.parse(body).model;
      return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
        headers: { 'content-type': 'text/event-stream' },
      });
    } };
    const opened = await owner(f.app, 'private-chat.open', { botId: f.worker.id });
    const run = await owner(f.app, 'runs.submit', { botId: f.worker.id, conversationId: opened.conversation.id,
      idempotencyKey: 'candidate-model-request', content: 'synthetic request', selection: selected });
    await wait(() => f.app.storage.db.prepare('SELECT status FROM runs WHERE id=?').get(run.id)?.status === 'completed');
    assert.equal(requestedModel, alternateModel.id);
    assert.equal((await owner(f.app, 'model-account.get')).auth.models.find((model) => model.id === alternateModel.id).status, 'verified');
    await assert.rejects(owner(f.app, 'private-chat.select-model', { botId: f.worker.id,
      selection: { kind: 'global', modelId: 'not-in-sdk-catalog' } }), { code: 'model-not-authorized' });
    await assert.rejects(owner(f.app, 'private-chat.select-model', { botId: f.worker.id,
      selection: { kind: 'global', modelId: 'x'.repeat(161) } }), { code: 'invalid-input' });
  } finally { await f.close(); }
});

test('DE05 explicit model changes under the same idempotency key conflict; replay never reexecutes', async () => {
  const f = await fixture();
  try {
    const opened = await owner(f.app, 'private-chat.open', { botId: f.worker.id });
    const submission = { botId: f.worker.id, conversationId: opened.conversation.id,
      idempotencyKey: 'stable-private-key', content: 'same body', selection: opened.selection };
    const first = await owner(f.app, 'runs.submit', submission);
    await wait(() => f.requests.length === 1);
    const replay = await owner(f.app, 'runs.submit', submission);
    assert.equal(replay.id, first.id);
    assert.equal(replay.replayed, true);
    await assert.rejects(owner(f.app, 'runs.submit', { ...submission,
      selection: { ...opened.selection, modelId: 'other-model' } }), { code: 'idempotency-conflict' });
    assert.equal(f.requests.length, 1);
  } finally { await f.close(); }
});

test('DE05 a reused operation key cannot move to another Conversation', async () => {
  const f = await fixture();
  try {
    const first = await owner(f.app, 'conversations.create', { botId: f.worker.id, title: 'first context' });
    const second = await owner(f.app, 'conversations.create', { botId: f.worker.id, title: 'second context' });
    await owner(f.app, 'model-account.update', { provider: 'compatible', baseUrl: `http://127.0.0.1:${f.upstream.address().port}`, model: 'mock-v1', keyless: true });
    const firstRun = await owner(f.app, 'runs.submit', { botId: f.worker.id, conversationId: first.id,
      idempotencyKey: 'one-context-only', content: 'same', selection: { kind: 'global', modelId: 'mock-v1' } });
    await assert.rejects(owner(f.app, 'runs.submit', { botId: f.worker.id, conversationId: second.id,
      idempotencyKey: 'one-context-only', content: 'same', selection: { kind: 'global', modelId: 'mock-v1' } }),
    { code: 'idempotency-conflict' });
    assert.equal(f.app.storage.db.prepare('SELECT count(*) AS n FROM runs WHERE request_key=?').get('one-context-only').n, 1);
    await wait(() => f.requests.length === 1);
    assert.equal((await owner(f.app, 'runs.get', { botId: f.worker.id, runId: firstRun.id })).conversationId, first.id);
  } finally { await f.close(); }
});

test('DE06/DE10 default pointer and history paging are stable and preserve every Conversation', async () => {
  const f = await fixture();
  try {
    const defaultConversation = (await owner(f.app, 'private-chat.open', { botId: f.worker.id })).conversation.id;
    const first = await owner(f.app, 'conversations.create', { botId: f.worker.id, title: 'older' });
    const second = await owner(f.app, 'conversations.create', { botId: f.worker.id, title: 'newer' });
    f.app.storage.db.prepare('UPDATE conversations SET created_at=? WHERE id=?').run('2026-01-01T00:00:00.000Z', first.id);
    f.app.storage.db.prepare('UPDATE conversations SET created_at=? WHERE id=?').run('2026-02-01T00:00:00.000Z', second.id);
    assert.equal((await owner(f.app, 'private-chat.open', { botId: f.worker.id })).conversation.id, defaultConversation);
    await owner(f.app, 'private-chat.select-conversation', { botId: f.worker.id, conversationId: first.id });
    assert.equal((await owner(f.app, 'private-chat.open', { botId: f.worker.id })).conversation.id, first.id);
    const page1 = await owner(f.app, 'private-chat.history', { botId: f.worker.id, limit: 1 });
    const page2 = await owner(f.app, 'private-chat.history', { botId: f.worker.id, limit: 1, cursor: page1.nextCursor });
    assert.notEqual(page1.items[0].id, page2.items[0].id);
    const all = await owner(f.app, 'conversations.list', { botId: f.worker.id });
    assert.equal(all.items.length, 3);
  } finally { await f.close(); }
});

test('DE03 shared account is usable without per-employee delegation grants; cross employee task lookup stays scoped', async () => {
  const f = await fixture();
  try {
    const opened = await owner(f.app, 'private-chat.open', { botId: f.worker.id });
    const run = await owner(f.app, 'runs.submit', { botId: f.worker.id, conversationId: opened.conversation.id,
      idempotencyKey: 'shared-account', content: 'synthetic shared account', selection: opened.selection });
    await wait(() => f.requests.length === 1);
    assert.equal((await owner(f.app, 'runs.get', { botId: f.worker.id, runId: run.id })).configSnapshot.selection.kind, 'global');
    await assert.rejects(owner(f.app, 'private-chat.task-detail', { botId: f.worker.id,
      conversationId: opened.conversation.id, taskId: 'forged-task-id' }), { code: 'task-not-found' });
  } finally { await f.close(); }
});

test('revoking a delegated model while its request is in flight discards the late reply', async () => {
  let release;
  let received;
  const responseReady = new Promise((resolve) => { received = resolve; });
  const upstream = createServer(async (req, res) => {
    for await (const _chunk of req) { /* consume request */ }
    release = () => { res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'late synthetic reply' } }] })); };
    received();
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const app = new BotApplication(dir());
  try {
    const worker = await owner(app, 'bots.create', { slug: 'late-worker', name: 'Late worker' });
    await owner(app, 'model-account.update', { provider: 'compatible', baseUrl: `http://127.0.0.1:${upstream.address().port}`, model: 'mock-v1', keyless: true });
    const opened = await owner(app, 'private-chat.open', { botId: worker.id });
    const run = await owner(app, 'runs.submit', { botId: worker.id, conversationId: opened.conversation.id,
      idempotencyKey: 'revoke-in-flight', content: 'wait for revoke', selection: opened.selection });
    await responseReady;
    await owner(app, 'model-account.update', { provider: 'compatible', baseUrl: `http://127.0.0.1:${upstream.address().port}`, model: 'changed-model', keyless: true });
    release();
    await wait(() => app.storage.db.prepare('SELECT status FROM runs WHERE id=?').get(run.id)?.status === 'failed');
    const failed = await owner(app, 'runs.get', { botId: worker.id, runId: run.id });
    assert.equal(failed.errorCode, 'model-account-changed');
    assert.equal(app.storage.db.prepare("SELECT count(*) AS n FROM messages WHERE run_id=? AND role='assistant'").get(run.id).n, 0);
    assert.equal(app.storage.db.prepare('SELECT result FROM tasks WHERE id=?').get(run.taskId).result, null);
  } finally { await app.close(); upstream.closeAllConnections(); await new Promise((resolve) => upstream.close(resolve)); }
});

test('DE08/DE09/DE10 task timeline is stable, bidirectional, bounded, and detail stays conversation-scoped', async () => {
  const f = await fixture();
  try {
    const opened = await owner(f.app, 'private-chat.open', { botId: f.worker.id });
    const run = await owner(f.app, 'runs.submit', { botId: f.worker.id, conversationId: opened.conversation.id,
      idempotencyKey: 'timeline-run', content: 'timeline input', selection: opened.selection });
    await wait(() => f.requests.length === 1 && f.app.storage.db.prepare('SELECT status FROM runs WHERE id=?').get(run.id)?.status === 'completed');
    const userMessage = f.app.storage.db.prepare("SELECT id,created_at FROM messages WHERE run_id=? AND role='user'").get(run.id);
    const root = run.taskId;
    assert.equal(f.app.storage.db.prepare('SELECT id FROM tasks WHERE id=?').get(root)?.id, root);
    assert.equal(f.app.storage.db.prepare("SELECT id FROM bots WHERE id=? AND kind='employee'").get(f.worker.id)?.id, f.worker.id);
    const childTask = f.app.tasks.store.createChild({ rootId: root, parentId: root, initiatorBotId: f.worker.id,
      executorBotId: f.worker.id, requestKey: 'timeline-child', input: 'child input', connectionId: null,
      configRevision: 1, configSnapshot: JSON.stringify({ sourceBotId: '@owner', name: '员工甲', persona: '' }),
      memorySnapshot: '[]', deadlineAt: '2999-01-01T00:00:00.000Z', at: userMessage.created_at }).task;
    const child = childTask.id;
    f.app.tasks.store.finish(child, 'completed', 'child result', null, userMessage.created_at);
    const backward1 = await owner(f.app, 'private-chat.timeline', { botId: f.worker.id, conversationId: opened.conversation.id, direction: 'backward', limit: 1 });
    assert.equal(backward1.items.length, 1);
    assert(backward1.hasMore);
    const backward2 = await owner(f.app, 'private-chat.timeline', { botId: f.worker.id, conversationId: opened.conversation.id,
      direction: 'backward', limit: 1, cursor: backward1.nextCursor });
    assert.equal(backward2.items.length, 1);
    const forward1 = await owner(f.app, 'private-chat.timeline', { botId: f.worker.id, conversationId: opened.conversation.id, limit: 1 });
    assert(forward1.hasMore);
    await assert.rejects(owner(f.app, 'private-chat.timeline', { botId: f.worker.id, conversationId: opened.conversation.id,
      direction: 'backward', limit: 1, cursor: forward1.nextCursor }), { code: 'invalid-cursor' });
    const details = await owner(f.app, 'private-chat.task-detail', { botId: f.worker.id,
      conversationId: opened.conversation.id, taskId: child });
    assert.equal(details.root.id, root);
    assert.equal(details.items.find((item) => item.id === child).input, 'child input');
    assert.equal(details.items.find((item) => item.id === child).result, 'child result');
    const other = await owner(f.app, 'conversations.create', { botId: f.worker.id, title: 'other' });
    await assert.rejects(owner(f.app, 'private-chat.task-detail', { botId: f.worker.id,
      conversationId: other.id, taskId: child }), { code: 'task-not-found' });
  } finally { await f.close(); }
});
