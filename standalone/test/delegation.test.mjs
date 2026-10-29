import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { zstdDecompressSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { BotApplication } from '../src/application.ts';
import { validateToolCall } from '@earendil-works/pi-ai';
import { TaskStore } from '../src/task-store.ts';
import { delegateTool } from '../src/task-engine.ts';
import { completeCodex } from '../src/codex-model.ts';
import { completeCodexTurn } from '../src/model-runner.ts';
import { BotError } from '../src/errors.ts';

const dir = () => mkdtempSync(join(tmpdir(), 'delegation-qa-'));
const owner = (app, command, params = {}) => app.execute(command, params, { kind: 'owner' });
function codexToken() {
  const payload = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-account' } })).toString('base64url');
  return `e30.${payload}.signature`;
}
function sseToolCall(workerId) {
  const args = JSON.stringify({ workerId, task: '只返回约定标记 DELEGATE_OK' });
  const events = [
    { type: 'response.created', response: { id: 'root-r1' } },
    { type: 'response.output_item.added', output_index: 0, item: { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'delegate_to_worker', arguments: '' } },
    { type: 'response.function_call_arguments.delta', output_index: 0, delta: args },
    { type: 'response.function_call_arguments.done', output_index: 0, arguments: args },
    { type: 'response.output_item.done', output_index: 0, item: { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'delegate_to_worker', arguments: args } },
    { type: 'response.completed', response: { id: 'root-r1', status: 'completed', usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 } } },
  ];
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
}
function sseText(text) {
  const item = { id: 'm2', type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] };
  const events = [
    { type: 'response.created', response: { id: 'root-r2' } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
    { type: 'response.output_text.delta', output_index: 0, delta: text },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'root-r2', status: 'completed', usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 } } },
  ];
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
}

test('DG-01 protocol fixture dispatches real pi-ai toolCall, worker task, typed toolResult, and main follow-up', async () => {
  const workerRequests = [], rootRequests = [];
  let targetWorkerId;
  const workerServer = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    workerRequests.push({ body, authorization: req.headers.authorization });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: `DELEGATE_OK from worker synthetic-shared-key-724${'\u0001'.repeat(15000)}` } }] }));
  });
  await new Promise((resolve) => workerServer.listen(0, '127.0.0.1', resolve));
  const transport = { request: async (_url, init) => {
    const bytes = typeof init.body === 'string' ? Buffer.from(init.body) : Buffer.from(init.body);
    const headers = new Headers(init.headers);
    rootRequests.push(JSON.parse(headers.get('content-encoding') === 'zstd' ? zstdDecompressSync(bytes).toString() : bytes.toString()));
    const body = rootRequests.length === 1 ? sseToolCall(targetWorkerId) : sseText('Main summary: DELEGATE_OK');
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
  } };
  const app = new BotApplication(dir(), transport);
  try {
    const main = (await owner(app, 'main.get')).bot;
    const source = await owner(app, 'bots.create', { slug: 'connection-source', name: 'Main Codex source' });
    const workerSource = await owner(app, 'bots.create', { slug: 'worker-source', name: 'Worker source' });
    const worker = await owner(app, 'bots.create', { slug: 'delegated-worker', name: 'QA worker', persona: 'worker-only persona' });
    targetWorkerId = worker.id;
    const sourceUrl = `http://127.0.0.1:${workerServer.address().port}`;
    await owner(app, 'bots.update', { botId: source.id, model: { provider: 'openai-codex', model: 'gpt-5.5' } });
    await owner(app, 'bots.update', { botId: workerSource.id, model: { provider: 'compatible', baseUrl: sourceUrl, model: 'fixture-model', keyless: false }, apiKey: 'synthetic-shared-key-724' });
    app.storage.db.prepare('INSERT INTO oauth_credentials(bot_id,credential) VALUES(?,?)').run(source.id,
      app.storage.encrypt(JSON.stringify({ type: 'oauth', access: codexToken(), refresh: 'synthetic-refresh-724', expires: Date.now() + 3600000 })));
    await owner(app, 'connections.bind-main', { sourceBotId: source.id });
    const memoryRoot = join(app.storage.root, 'bots', worker.id, 'memory');
    mkdirSync(memoryRoot, { recursive: true });
    writeFileSync(join(memoryRoot, 'notes.md'), 'worker secret note');
    const granted = await owner(app, 'delegation.grant', { workerBotId: worker.id, sourceBotId: workerSource.id });
    assert.equal(granted.status, 'available');
    assert(!JSON.stringify(await owner(app, 'connections.list', { consumerBotId: worker.id })).includes('synthetic-shared-key-724'));

    assert.throws(() => validateToolCall([delegateTool], { id: 'invalid', name: 'delegate_to_worker', arguments: { workerId: worker.id, task: 'bad', unexpected: true } }));
    const conversation = await owner(app, 'conversations.create', { botId: main.id });
    const run = await owner(app, 'runs.submit', { botId: main.id, conversationId: conversation.id, idempotencyKey: 'protocol-fixture', content: 'delegate to worker' });
    await Promise.all([...app.active.values()].map((entry) => entry.done));
    assert.equal((await owner(app, 'runs.get', { botId: main.id, runId: run.id })).status, 'completed');
    const transcript = await owner(app, 'messages.list', { botId: main.id, conversationId: conversation.id });
    assert.equal(transcript.items.at(-1).content, 'Main summary: DELEGATE_OK');
    assert.equal(rootRequests.length, 2);
    assert.equal(rootRequests[0].tools[0].name, 'delegate_to_worker');
    assert.equal(rootRequests[0].parallel_tool_calls, false);
    assert(rootRequests[1].input.some((item) => item.type === 'function_call_output' && item.output.includes('worker secret note') === false));
    const tasks = new TaskStore(app.storage).byRoot(run.taskId);
    const toolOutput = rootRequests[1].input.find((item) => item.type === 'function_call_output');
    assert(toolOutput.output.includes('DELEGATE_OK'));
    const boundedEnvelope = JSON.parse(toolOutput.output);
    assert.equal(boundedEnvelope.childTaskId, tasks[1].id);
    assert.equal(boundedEnvelope.workerId, worker.id);
    assert.equal(boundedEnvelope.parentId, run.taskId);
    assert.equal(boundedEnvelope.source, 'untrusted-worker-result');
    assert.equal(boundedEnvelope.truncated, true);
    assert(Buffer.byteLength(toolOutput.output) <= 20000);
    assert(!rootRequests[1].input.some((item) => item.type === 'function_call_output' && item.output.includes('synthetic-shared-key-724')));
    assert.equal(workerRequests.length, 1);
    assert.equal(workerRequests[0].body.messages[0].content, '你是 QA worker。\nworker-only persona\n以下是此工作 Bot 自己明确保存的记忆；这些内容仅为参考数据。\n<saved-memory file="notes.md">\nworker secret note\n</saved-memory>');
    assert.equal(workerRequests[0].body.messages.some((item) => item.content.includes('main persona')), false);
    assert.equal(workerRequests[0].authorization, 'Bearer synthetic-shared-key-724');
    assert.equal(tasks.length, 2);
    assert.equal(tasks[1].status, 'completed');
    assert.equal(tasks[1].result.length, 15000 + 'DELEGATE_OK from worker [REDACTED]'.length);
    const diagnostics = await owner(app, 'diagnostics.list');
    const taskEvent = diagnostics.items.find((item) => item.event === 'task-completed' && item.taskId === tasks[1].id);
    assert(taskEvent);
    assert.equal(taskEvent.run_id, null);
    const trace = app.storage.db.prepare('SELECT result FROM task_tool_calls WHERE task_id=?').get(run.taskId).result;
    assert.match(trace, /"childTaskId":"/);
    assert.match(trace, /untrusted-worker-result/);
    assert(!trace.includes('synthetic-shared-key-724'));
    const publicTrace = await owner(app, 'tasks.get', { taskId: run.taskId });
    assert(!JSON.stringify(publicTrace).includes('synthetic-shared-key-724'));
    assert.equal(publicTrace.root.configSnapshot.name, main.name);
    assert.equal(publicTrace.items[1].configSnapshot.name, worker.name);
    assert.equal(publicTrace.items[1].configSnapshot.persona, 'worker-only persona');
    assert.equal(publicTrace.items[1].memoryManifest.length, 1);
    assert.equal(publicTrace.items[1].memoryManifest[0].path, 'notes.md');
    assert.match(publicTrace.items[1].memoryManifest[0].revision, /^[a-f0-9]{64}$/u);
    assert(!JSON.stringify(publicTrace).includes('worker secret note'));
  } finally {
    await app.close();
    workerServer.closeAllConnections();
    await new Promise((resolve) => workerServer.close(resolve));
  }
});

test('main run uses its explicitly bound source connection without local model fallback', async () => {
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ body: JSON.parse(Buffer.concat(chunks).toString()), authorization: req.headers.authorization });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'main through shared connection' } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const app = new BotApplication(dir());
  try {
    const main = (await owner(app, 'main.get')).bot;
    const source = await owner(app, 'bots.create', { slug: 'main-model-source', name: 'Main source' });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await owner(app, 'bots.update', { botId: source.id, model: { provider: 'compatible', baseUrl, model: 'source-model', keyless: false }, apiKey: 'synthetic-main-key-724' });
    const binding = await owner(app, 'connections.bind-main', { sourceBotId: source.id });
    const conversation = await owner(app, 'conversations.create', { botId: main.id });
    const run = await owner(app, 'runs.submit', { botId: main.id, conversationId: conversation.id, idempotencyKey: 'main-shared-source', content: 'hello main' });
    await Promise.all([...app.active.values()].map((entry) => entry.done));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.model, 'source-model');
    assert.equal(requests[0].authorization, 'Bearer synthetic-main-key-724');
    const record = await owner(app, 'runs.get', { botId: main.id, runId: run.id });
    assert.equal(record.status, 'completed');
    assert.equal(record.configSnapshot.connection.id, binding.connectionId);
    assert.equal(record.configSnapshot.connection.sourceBotId, source.id);
    assert(!JSON.stringify(record).includes('synthetic-main-key-724'));
    assert.equal((await owner(app, 'bots.get', { botId: main.id })).mainConnection.status, 'available');
    const catalog = await owner(app, 'main.catalog');
    assert.equal(catalog.items.find((item) => item.id === main.id).connectionStatus, 'available');
    assert.equal(catalog.items.find((item) => item.id === main.id).canShareOwnConnection, false);
    assert.equal(catalog.items.find((item) => item.id === main.id).modelConfigured, false);
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('binding changes increment main Bot config revision', async () => {
  const app = new BotApplication(dir());
  try {
    const main = (await owner(app, 'main.get')).bot;
    const source = await owner(app, 'bots.create', { slug: 'revision-source', name: 'Source' });
    await owner(app, 'bots.update', { botId: source.id, model: { provider: 'compatible', baseUrl: 'http://127.0.0.1:9', model: 'fixture', keyless: true } });
    const beforeBind = (await owner(app, 'bots.get', { botId: main.id })).configRevision;
    await owner(app, 'connections.bind-main', { sourceBotId: source.id });
    const afterBind = (await owner(app, 'bots.get', { botId: main.id })).configRevision;
    assert.equal(afterBind, beforeBind + 1);
    await owner(app, 'connections.unbind-main');
    assert.equal((await owner(app, 'bots.get', { botId: main.id })).configRevision, afterBind + 1);
  } finally { await app.close(); }
});

test('SDK request-boundary authorization errors retain their coded refusal without calling transport', async () => {
  const denial = new BotError('connection-changed', 'Synthetic revocation.', 409);
  for (const invoke of [
    (transport) => completeCodexTurn({ modelId: 'gpt-5.5', access: codexToken(), systemPrompt: 'test',
      messages: [{ role: 'user', content: 'hello', timestamp: Date.now() }], proxyUrl: '', sessionId: 'boundary-turn',
      signal: new AbortController().signal, transport, beforeRequest: () => { throw denial; } }),
    (transport) => completeCodex('gpt-5.5', codexToken(), [{ role: 'user', content: 'hello' }], '',
      'boundary-complete', new AbortController().signal, transport, () => { throw denial; }),
  ]) {
    let requests = 0;
    await assert.rejects(invoke({ request: async () => { requests++; return new Response(''); } }), { code: 'connection-changed' });
    assert.equal(requests, 0);
  }
});

test('shutdown persists task interruption and terminal tool-call status before releasing the database', async () => {
  const root = dir(), app = new BotApplication(root), store = new TaskStore(app.storage);
  const main = (await owner(app, 'main.get')).bot;
  const task = store.createRoot({ executorBotId: main.id, initiatorBotId: main.id, requestKey: 'shutdown-root',
    input: 'fixture', configRevision: main.configRevision, deadlineAt: new Date(Date.now() + 60000).toISOString(), at: new Date().toISOString() }).task;
  assert(store.begin(task.id, new Date().toISOString()));
  store.beginTool(task.id, 'call-shutdown', 'delegate_to_worker', JSON.stringify({ workerId: 'worker', task: 'fixture' }), new Date().toISOString());
  await app.close();
  const db = new DatabaseSync(join(root, 'bot.sqlite'));
  try {
    assert.equal(db.prepare('SELECT status FROM tasks WHERE id=?').get(task.id).status, 'interrupted');
    const tool = db.prepare('SELECT status,error_code FROM task_tool_calls WHERE task_id=?').get(task.id);
    assert.equal(tool.status, 'failed');
    assert.equal(tool.error_code, 'process-interrupted');
  } finally { db.close(); }
});

test('cancelling a worker child leaves the root active so the main model can receive cancellation', async () => {
  const app = new BotApplication(dir());
  try {
    const main = (await owner(app, 'main.get')).bot;
    const source = await owner(app, 'bots.create', { slug: 'cancel-source', name: 'Source' });
    const worker = await owner(app, 'bots.create', { slug: 'cancel-worker', name: 'Worker' });
    await owner(app, 'bots.update', { botId: source.id, model: { provider: 'compatible', baseUrl: 'http://127.0.0.1:9', model: 'fixture', keyless: true } });
    const grant = await owner(app, 'delegation.grant', { workerBotId: worker.id, sourceBotId: source.id });
    const store = new TaskStore(app.storage), at = new Date().toISOString();
    const root = store.createRoot({ executorBotId: main.id, initiatorBotId: main.id, requestKey: 'cancel-root', input: 'root', configRevision: main.configRevision,
      configSnapshot: JSON.stringify({ delegations: [{ workerBotId: worker.id, connectionId: grant.connectionId }] }), deadlineAt: new Date(Date.now() + 60000).toISOString(), at }).task;
    store.begin(root.id, at);
    const child = store.createChild({ rootId: root.id, parentId: root.id, initiatorBotId: main.id, executorBotId: worker.id,
      requestKey: 'cancel-call', input: 'child', connectionId: grant.connectionId, configRevision: worker.configRevision,
      configSnapshot: JSON.stringify({ sourceModelEpoch: 1 }), memorySnapshot: '[]', deadlineAt: new Date(Date.now() + 30000).toISOString(), at }).task;
    store.begin(child.id, at);
    const cancelled = await owner(app, 'tasks.cancel', { taskId: child.id });
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(store.get(root.id).status, 'running');
  } finally { await app.close(); }
});

test('a persisted worker deadline is terminal failed with task-deadline-exceeded', async () => {
  const server = createServer(() => {});
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const app = new BotApplication(dir());
  try {
    const main = (await owner(app, 'main.get')).bot;
    const source = await owner(app, 'bots.create', { slug: 'timeout-source', name: 'Source' });
    const worker = await owner(app, 'bots.create', { slug: 'timeout-worker', name: 'Worker', persona: 'bounded worker' });
    await owner(app, 'bots.update', { botId: source.id, model: {
      provider: 'compatible', baseUrl: `http://127.0.0.1:${server.address().port}`, model: 'fixture', keyless: true,
    } });
    const grant = await owner(app, 'delegation.grant', { workerBotId: worker.id, sourceBotId: source.id });
    const connection = app.connections.resolve(grant.connectionId, worker.id);
    const at = new Date().toISOString();
    const task = app.tasks.store.createRoot({ executorBotId: worker.id, initiatorBotId: main.id,
      requestKey: 'deadline-worker', input: 'wait until cancelled', connectionId: grant.connectionId,
      connectionEpoch: connection.sourceModelEpoch, configRevision: worker.configRevision,
      configSnapshot: JSON.stringify({ name: worker.name, persona: worker.persona }),
      deadlineAt: new Date(Date.now() + 100).toISOString(), at }).task;
    assert(app.tasks.store.begin(task.id, new Date().toISOString()));
    const controller = new AbortController();
    app.tasks.active.set(task.id, controller);
    await app.tasks.runDirect(task.id, worker, 'wait until cancelled', connection.config,
      connection.credential, source.id, [], controller);
    const completed = app.tasks.store.get(task.id);
    assert.equal(completed.status, 'failed');
    assert.equal(completed.error_code, 'task-deadline-exceeded');
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('connection listing has signed stable pages and main catalog exposes only current bindings', async () => {
  const app = new BotApplication(dir());
  try {
    const main = (await owner(app, 'main.get')).bot;
    const source = await owner(app, 'bots.create', { slug: 'connection-pages', name: 'Connection source' });
    await owner(app, 'bots.update', { botId: source.id, model: {
      provider: 'compatible', baseUrl: 'http://127.0.0.1:9', model: 'fixture', keyless: true,
    } });
    for (let index = 0; index < 102; index++) await owner(app, 'connections.bind-main', { sourceBotId: source.id });
    const catalog = await owner(app, 'main.catalog');
    assert.equal(catalog.connectionBindings.length, 1);
    assert.equal(catalog.connectionBindings[0].consumerBotId, main.id);
    assert.equal(catalog.connectionReferences, undefined);
    const first = await owner(app, 'connections.list');
    assert.equal(first.items.length, 100);
    assert.equal(first.hasMore, true);
    assert(first.nextCursor);
    assert(first.items[0].createdAt);
    assert(first.items[0].revokedAt);
    const nextA = await owner(app, 'connections.list', { cursor: first.nextCursor });
    const nextB = await owner(app, 'connections.list', { cursor: first.nextCursor });
    assert.deepEqual(nextA, nextB);
    assert.equal(nextA.items.length, 2);
    assert.equal(nextA.hasMore, false);
    await assert.rejects(owner(app, 'connections.list', { limit: 101 }), { code: 'invalid-limit' });
    await assert.rejects(owner(app, 'connections.list', { consumerBotId: source.id, cursor: first.nextCursor }), { code: 'invalid-cursor' });
  } finally { await app.close(); }
});

test('DG-04 changed model epoch refuses old reference; direct task idempotency cannot change target or connection', async () => {
  const server = createServer(async (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: 'worker done' } }] })); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const app = new BotApplication(dir());
  try {
    const main = (await owner(app, 'main.get')).bot;
    const source = await owner(app, 'bots.create', { slug: 'epoch-source', name: 'Source' });
    const worker = await owner(app, 'bots.create', { slug: 'epoch-worker', name: 'Worker' });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await owner(app, 'bots.update', { botId: source.id, model: { provider: 'compatible', baseUrl, model: 'fixture', keyless: true } });
    await owner(app, 'delegation.grant', { workerBotId: worker.id, sourceBotId: source.id });
    const first = await owner(app, 'tasks.create', { workerBotId: worker.id, idempotencyKey: 'direct-once', input: 'same task' });
    assert(first.id);
    assert.equal((await owner(app, 'tasks.get', { taskId: first.id })).root.id, first.id);
    const occupied = [];
    while (app.tasks.active.size < 2) {
      const key = `capacity-${occupied.length}`;
      app.tasks.active.set(key, new AbortController());
      occupied.push(key);
    }
    const replay = await owner(app, 'tasks.create', { workerBotId: worker.id, idempotencyKey: 'direct-once', input: 'same task' });
    assert.equal(replay.id, first.id);
    for (const key of occupied) app.tasks.active.delete(key);
    await assert.rejects(owner(app, 'tasks.create', { workerBotId: main.id, idempotencyKey: 'direct-once', input: 'same task' }), { code: 'idempotency-conflict' });
    await owner(app, 'bots.update', { botId: source.id, model: { provider: 'compatible', baseUrl, model: 'changed', keyless: true } });
    await assert.rejects(owner(app, 'tasks.create', { workerBotId: worker.id, idempotencyKey: 'direct-two', input: 'new task' }), { code: 'connection-changed' });
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
