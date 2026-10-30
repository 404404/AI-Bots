import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
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
  const main = (await owner(app, 'main.get')).bot;
  const source = await owner(app, 'bots.create', { slug: 'connection-owner', name: '模型来源' });
  const worker = await owner(app, 'bots.create', { slug: 'private-worker', name: '员工甲' });
  await owner(app, 'bots.update', { botId: source.id,
    model: { provider: 'compatible', baseUrl: `http://127.0.0.1:${upstream.address().port}`, model: 'mock-v1', keyless: false },
    apiKey: 'synthetic-private-key-731' });
  const grant = await owner(app, 'delegation.grant', { workerBotId: worker.id, sourceBotId: source.id });
  return { app, main, source, worker, grant, upstream, requests,
    async close() { await app.close(); upstream.closeAllConnections(); await new Promise((resolve) => upstream.close(resolve)); } };
}

test('DE01 work Bot private chat resolves its existing delegated reference without copying credentials', async () => {
  const f = await fixture();
  try {
    const opened = await owner(f.app, 'private-chat.open', { botId: f.worker.id });
    assert.equal(opened.botId, f.worker.id);
    assert.equal(opened.conversation.botId, f.worker.id);
    assert.deepEqual(opened.selection, { kind: 'connection', connectionId: f.grant.connectionId, modelId: 'mock-v1' });
    const models = await owner(f.app, 'private-chat.models', { botId: f.worker.id });
    assert.equal(models.items.length, 1);
    assert.equal(models.items[0].label, '模型来源 · compatible · mock-v1');
    assert(!JSON.stringify(models).includes('synthetic-private-key-731'));
    const request = { botId: f.worker.id, conversationId: opened.conversation.id, idempotencyKey: 'employee-private-1',
      content: '合成私聊输入', selection: opened.selection };
    const run = await owner(f.app, 'runs.submit', request);
    await wait(() => f.requests.length === 1 && f.app.storage.db.prepare("SELECT status FROM runs WHERE id=?").get(run.id)?.status === 'completed');
    assert.equal(f.requests[0].model, 'mock-v1');
    const saved = await owner(f.app, 'runs.get', { botId: f.worker.id, runId: run.id });
    assert.deepEqual(saved.configSnapshot.selection, opened.selection);
    assert.equal(saved.configSnapshot.connection.sourceBotId, f.source.id);
    assert(!JSON.stringify(saved).includes('synthetic-private-key-731'));
    assert.equal((await owner(f.app, 'bots.get', { botId: f.worker.id })).credentialConfigured, false);
  } finally { await f.close(); }
});

test('local models require an explicit request or saved selection before transport', async () => {
  const f = await fixture();
  try {
    const bot = await owner(f.app, 'bots.create', { slug: 'explicit-local', name: '本地员工' });
    await owner(f.app, 'bots.update', { botId: bot.id,
      model: { provider: 'compatible', baseUrl: `http://127.0.0.1:${f.upstream.address().port}`, model: 'mock-v1', keyless: true } });
    const opened = await owner(f.app, 'private-chat.open', { botId: bot.id });
    assert.equal(opened.selection, null);
    await assert.rejects(owner(f.app, 'runs.submit', { botId: bot.id, conversationId: opened.conversation.id,
      idempotencyKey: 'requires-choice', content: 'must not transport' }), { code: 'model-selection-required' });
    assert.equal(f.requests.length, 0);
    const selection = { kind: 'local', modelId: 'mock-v1' };
    await owner(f.app, 'private-chat.select-model', { botId: bot.id, selection });
    const run = await owner(f.app, 'runs.submit', { botId: bot.id, conversationId: opened.conversation.id,
      idempotencyKey: 'saved-choice', content: 'explicit saved choice' });
    await wait(() => f.requests.length === 1);
    assert.equal((await owner(f.app, 'runs.get', { botId: bot.id, runId: run.id })).configSnapshot.selection.kind, 'local');
    const explicit = await owner(f.app, 'runs.submit', { botId: bot.id, conversationId: opened.conversation.id,
      idempotencyKey: 'request-choice', content: 'request choice', selection });
    await wait(() => f.requests.length === 2);
    assert.equal((await owner(f.app, 'runs.get', { botId: bot.id, runId: explicit.id })).configSnapshot.selection.modelId, 'mock-v1');
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
    await owner(f.app, 'bots.update', { botId: f.worker.id,
      model: { provider: 'compatible', baseUrl: `http://127.0.0.1:${f.upstream.address().port}`, model: 'mock-v1', keyless: true } });
    const firstRun = await owner(f.app, 'runs.submit', { botId: f.worker.id, conversationId: first.id,
      idempotencyKey: 'one-context-only', content: 'same', selection: { kind: 'local', modelId: 'mock-v1' } });
    await assert.rejects(owner(f.app, 'runs.submit', { botId: f.worker.id, conversationId: second.id,
      idempotencyKey: 'one-context-only', content: 'same', selection: { kind: 'local', modelId: 'mock-v1' } }),
    { code: 'idempotency-conflict' });
    assert.equal(f.app.storage.db.prepare('SELECT count(*) AS n FROM runs WHERE request_key=?').get('one-context-only').n, 1);
    await wait(() => f.requests.length === 1);
    assert.equal((await owner(f.app, 'runs.get', { botId: f.worker.id, runId: firstRun.id })).conversationId, first.id);
  } finally { await f.close(); }
});

test('DE06/DE10 default pointer and history paging are stable and preserve every Conversation', async () => {
  const f = await fixture();
  try {
    const first = await owner(f.app, 'conversations.create', { botId: f.worker.id, title: 'older' });
    const second = await owner(f.app, 'conversations.create', { botId: f.worker.id, title: 'newer' });
    f.app.storage.db.prepare('UPDATE conversations SET created_at=? WHERE id=?').run('2026-01-01T00:00:00.000Z', first.id);
    f.app.storage.db.prepare('UPDATE conversations SET created_at=? WHERE id=?').run('2026-02-01T00:00:00.000Z', second.id);
    assert.equal((await owner(f.app, 'private-chat.open', { botId: f.worker.id })).conversation.id, second.id);
    await owner(f.app, 'private-chat.select-conversation', { botId: f.worker.id, conversationId: first.id });
    assert.equal((await owner(f.app, 'private-chat.open', { botId: f.worker.id })).conversation.id, first.id);
    const page1 = await owner(f.app, 'private-chat.history', { botId: f.worker.id, limit: 1 });
    const page2 = await owner(f.app, 'private-chat.history', { botId: f.worker.id, limit: 1, cursor: page1.nextCursor });
    assert.notEqual(page1.items[0].id, page2.items[0].id);
    const all = await owner(f.app, 'conversations.list', { botId: f.worker.id });
    assert.equal(all.items.length, 2);
  } finally { await f.close(); }
});

test('DE03 revoked delegation and cross employee task lookup fail closed before transport', async () => {
  const f = await fixture();
  try {
    const opened = await owner(f.app, 'private-chat.open', { botId: f.worker.id });
    await owner(f.app, 'delegation.revoke', { workerBotId: f.worker.id });
    await assert.rejects(owner(f.app, 'runs.submit', { botId: f.worker.id, conversationId: opened.conversation.id,
      idempotencyKey: 'revoked-ref', content: 'must not send', selection: opened.selection }), { code: 'connection-not-found' });
    assert.equal(f.requests.length, 0);
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
    const source = await owner(app, 'bots.create', { slug: 'late-source', name: 'Late source' });
    const worker = await owner(app, 'bots.create', { slug: 'late-worker', name: 'Late worker' });
    await owner(app, 'bots.update', { botId: source.id,
      model: { provider: 'compatible', baseUrl: `http://127.0.0.1:${upstream.address().port}`, model: 'mock-v1', keyless: true } });
    await owner(app, 'delegation.grant', { workerBotId: worker.id, sourceBotId: source.id });
    const opened = await owner(app, 'private-chat.open', { botId: worker.id });
    const run = await owner(app, 'runs.submit', { botId: worker.id, conversationId: opened.conversation.id,
      idempotencyKey: 'revoke-in-flight', content: 'wait for revoke', selection: opened.selection });
    await responseReady;
    await owner(app, 'delegation.revoke', { workerBotId: worker.id });
    release();
    await wait(() => app.storage.db.prepare('SELECT status FROM runs WHERE id=?').get(run.id)?.status === 'failed');
    const failed = await owner(app, 'runs.get', { botId: worker.id, runId: run.id });
    assert.equal(failed.errorCode, 'connection-not-found');
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
    const child = 'f183bb0d-c854-495d-a71b-31c42fb8728f';
    f.app.storage.db.prepare(`INSERT INTO tasks(id,root_id,parent_id,initiator_bot_id,executor_bot_id,request_key,input_hash,input,status,result,connection_id,config_revision,created_at,finished_at,deadline_at,config_snapshot,memory_snapshot)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(child, root, root, f.main.id, f.worker.id, 'timeline-child', 'synthetic-hash',
      'child input', 'completed', 'child result', f.grant.connectionId, 1, userMessage.created_at, userMessage.created_at,
      '2999-01-01T00:00:00.000Z', JSON.stringify({ sourceBotId: f.source.id, name: '员工甲', persona: '' }), '[]');
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
