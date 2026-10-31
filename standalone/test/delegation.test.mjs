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
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';

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
  const accessToken = codexToken();
  const refreshToken = 'synthetic-refresh-724';
  let targetWorkerId;
  let mainCalls = 0;
  const transport = { request: async (_url, init) => {
    const bytes = typeof init.body === 'string' ? Buffer.from(init.body) : Buffer.from(init.body);
    const headers = new Headers(init.headers);
    const request = JSON.parse(headers.get('content-encoding') === 'zstd' ? zstdDecompressSync(bytes).toString() : bytes.toString());
    if (request.tools?.length) {
      rootRequests.push(request);
      mainCalls++;
      const body = mainCalls === 1 ? sseToolCall(targetWorkerId) : sseText('Main summary: DELEGATE_OK');
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
    }
    workerRequests.push({ request, authorization: headers.get('authorization') });
    return new Response(sseText(`DELEGATE_OK from worker ${accessToken} ${refreshToken}${'\u0001'.repeat(15000)}`), { headers: { 'content-type': 'text/event-stream' } });
  } };
  const app = new BotApplication(dir(), transport);
  try {
    const main = await owner(app, 'bots.create', { slug: 'delegating-employee', name: 'Delegating employee', persona: 'main persona' });
    const worker = await owner(app, 'bots.create', { slug: 'delegated-worker', name: 'QA worker', persona: 'worker-only persona' });
    targetWorkerId = worker.id;
    const codexModel = openaiCodexProvider().getModels()[0].id;
    app.storage.db.prepare('UPDATE model_account SET oauth_credential=? WHERE singleton=1').run(
      app.storage.encrypt(JSON.stringify({ type: 'oauth', access: accessToken, refresh: refreshToken, expires: Date.now() + 3600000 })));
    await owner(app, 'model-account.update', { provider: 'openai-codex', model: codexModel, keyless: true });
    const memoryRoot = join(app.storage.root, 'bots', worker.id, 'memory');
    mkdirSync(memoryRoot, { recursive: true });
    writeFileSync(join(memoryRoot, 'notes.md'), 'worker secret note');
    assert.equal((await owner(app, 'bots.get', { botId: worker.id })).credentialConfigured, false);

    assert.throws(() => validateToolCall([delegateTool], { id: 'invalid', name: 'delegate_to_worker', arguments: { workerId: worker.id, task: 'bad', unexpected: true } }));
    const conversation = await owner(app, 'conversations.create', { botId: main.id });
    const selection = { kind: 'global', modelId: codexModel };
    const run = await owner(app, 'runs.submit', { botId: main.id, conversationId: conversation.id, idempotencyKey: 'protocol-fixture', content: 'delegate to worker', selection });
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
    assert(toolOutput.output.includes('DELEGATE_OK'), `worker task status=${tasks[1]?.status}; code=${tasks[1]?.error_code}`);
    const boundedEnvelope = JSON.parse(toolOutput.output);
    assert.equal(boundedEnvelope.childTaskId, tasks[1].id);
    assert.equal(boundedEnvelope.workerId, worker.id);
    assert.equal(boundedEnvelope.parentId, run.taskId);
    assert.equal(boundedEnvelope.source, 'untrusted-worker-result');
    assert.equal(boundedEnvelope.truncated, true);
    assert(Buffer.byteLength(toolOutput.output) <= 20000);
    assert(!rootRequests[1].input.some((item) => item.type === 'function_call_output' && (item.output.includes(accessToken) || item.output.includes(refreshToken))));
    assert.equal(workerRequests.length, 1);
    assert.equal(workerRequests[0].authorization === `Bearer ${accessToken}`, true);
    assert(JSON.stringify(workerRequests[0].request).includes('worker-only persona'));
    assert(JSON.stringify(workerRequests[0].request).includes('worker secret note'));
    assert.equal(JSON.stringify(workerRequests[0].request).includes('main persona'), false);
    assert.equal(tasks.length, 2);
    assert.equal(tasks[1].status, 'completed');
    assert(tasks[1].result.startsWith('DELEGATE_OK from worker [REDACTED] [REDACTED]'));
    assert(!JSON.stringify(tasks).includes(accessToken));
    assert(!JSON.stringify(tasks).includes(refreshToken));
    const diagnostics = await owner(app, 'diagnostics.list');
    const taskEvent = diagnostics.items.find((item) => item.event === 'task-completed' && item.taskId === tasks[1].id);
    assert(taskEvent);
    assert.equal(taskEvent.run_id, null);
    const trace = app.storage.db.prepare('SELECT result FROM task_tool_calls WHERE task_id=?').get(run.taskId).result;
    assert.match(trace, /"childTaskId":"/);
    assert.match(trace, /untrusted-worker-result/);
    assert(!trace.includes(accessToken));
    assert(!trace.includes(refreshToken));
    const publicTrace = await owner(app, 'tasks.get', { taskId: run.taskId });
    assert(!JSON.stringify(publicTrace).includes(accessToken));
    assert(!JSON.stringify(publicTrace).includes(refreshToken));
    assert.equal(publicTrace.root.configSnapshot.name, main.name);
    assert.equal(publicTrace.items[1].configSnapshot.name, worker.name);
    assert.equal(publicTrace.items[1].configSnapshot.persona, 'worker-only persona');
    assert.equal(publicTrace.items[1].memoryManifest.length, 1);
    assert.equal(publicTrace.items[1].memoryManifest[0].path, 'notes.md');
    assert.match(publicTrace.items[1].memoryManifest[0].revision, /^[a-f0-9]{64}$/u);
    assert(!JSON.stringify(publicTrace).includes('worker secret note'));
    assert(!JSON.stringify(diagnostics).includes(accessToken));
    assert(!JSON.stringify(diagnostics).includes(refreshToken));
  } finally { await app.close(); }
});

test('main run uses its explicitly selected global model without a per-Bot connection', async () => {
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
    const main = await owner(app, 'bots.create', { slug: 'global-model-employee', name: 'Global model employee' });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await owner(app, 'model-account.update', { provider: 'compatible', baseUrl, model: 'source-model', key: 'synthetic-main-key-724' });
    const conversation = await owner(app, 'conversations.create', { botId: main.id });
    const selection = { kind: 'global', modelId: 'source-model' };
    const run = await owner(app, 'runs.submit', { botId: main.id, conversationId: conversation.id, idempotencyKey: 'main-shared-source', content: 'hello main', selection });
    await Promise.all([...app.active.values()].map((entry) => entry.done));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.model, 'source-model');
    assert.equal(requests[0].authorization, 'Bearer synthetic-main-key-724');
    const record = await owner(app, 'runs.get', { botId: main.id, runId: run.id });
    assert.equal(record.status, 'completed');
    assert.deepEqual(record.configSnapshot.selection, selection);
    assert.equal(record.configSnapshot.sourceBotId, '@owner');
    assert(!JSON.stringify(record).includes('synthetic-main-key-724'));
    assert.deepEqual((await owner(app, 'bots.get', { botId: main.id })).model, {});
    assert.equal((await owner(app, 'bots.get', { botId: main.id })).credentialConfigured, false);
    assert.equal((await owner(app, 'model-account.get')).model, 'source-model');
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('global model account changes do not rewrite the main Bot identity revision', async () => {
  const app = new BotApplication(dir());
  try {
    const main = (await owner(app, 'main.get')).bot;
    const before = (await owner(app, 'main.get')).bot.configRevision;
    await owner(app, 'model-account.update', { provider: 'compatible', baseUrl: 'http://127.0.0.1:9', model: 'fixture', keyless: true });
    await owner(app, 'model-account.update', { provider: 'compatible', baseUrl: 'http://127.0.0.1:9', model: 'fixture-2', keyless: true });
    assert.equal((await owner(app, 'main.get')).bot.configRevision, before);
    assert.equal((await owner(app, 'model-account.get')).model, 'fixture-2');
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
    const worker = await owner(app, 'bots.create', { slug: 'cancel-worker', name: 'Worker' });
    const store = new TaskStore(app.storage), at = new Date().toISOString();
    const root = store.createRoot({ executorBotId: main.id, initiatorBotId: main.id, requestKey: 'cancel-root', input: 'root', configRevision: main.configRevision,
      configSnapshot: JSON.stringify({ selection: { kind: 'global', modelId: 'fixture' } }), deadlineAt: new Date(Date.now() + 60000).toISOString(), at }).task;
    store.begin(root.id, at);
    const child = store.createChild({ rootId: root.id, parentId: root.id, initiatorBotId: main.id, executorBotId: worker.id,
      requestKey: 'cancel-call', input: 'child', connectionId: null, configRevision: worker.configRevision,
      configSnapshot: JSON.stringify({ sourceBotId: '@owner', sourceModelEpoch: 1 }), memorySnapshot: '[]', deadlineAt: new Date(Date.now() + 30000).toISOString(), at }).task;
    store.begin(child.id, at);
    const cancelled = await owner(app, 'tasks.cancel', { taskId: child.id });
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(store.get(root.id).status, 'running');
  } finally { await app.close(); }
});

test('a persisted worker deadline is terminal failed with task-deadline-exceeded under the global account', async () => {
  const server = createServer(() => {});
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const app = new BotApplication(dir());
  try {
    const main = (await owner(app, 'main.get')).bot;
    const worker = await owner(app, 'bots.create', { slug: 'timeout-worker', name: 'Worker', persona: 'bounded worker' });
    await owner(app, 'model-account.update', { provider: 'compatible', baseUrl: `http://127.0.0.1:${server.address().port}`, model: 'fixture', keyless: true });
    const connection = app.privateChat.resolve(worker.id, { kind: 'global', modelId: 'fixture' });
    const at = new Date().toISOString();
    const task = app.tasks.store.createRoot({ executorBotId: worker.id, initiatorBotId: main.id,
      requestKey: 'deadline-worker', input: 'wait until cancelled', connectionId: null,
      connectionEpoch: connection.sourceModelEpoch, configRevision: worker.configRevision,
      configSnapshot: JSON.stringify({ name: worker.name, persona: worker.persona }),
      deadlineAt: new Date(Date.now() + 100).toISOString(), at }).task;
    assert(app.tasks.store.begin(task.id, new Date().toISOString()));
    const controller = new AbortController();
    app.tasks.active.set(task.id, controller);
    await app.tasks.runDirect(task.id, worker, 'wait until cancelled', connection.config,
      connection.credential, '@owner', [], controller);
    const completed = app.tasks.store.get(task.id);
    assert.equal(completed.status, 'failed');
    assert.equal(completed.error_code, 'task-deadline-exceeded');
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('one global model account is shared by employees without per-Bot credentials or grants', async () => {
  const app = new BotApplication(dir());
  try {
    const employee = await owner(app, 'bots.create', { slug: 'shared-account-employee', name: 'Shared account employee' });
    const second = await owner(app, 'bots.create', { slug: 'shared-account-employee-two', name: 'Another employee' });
    await owner(app, 'model-account.update', { provider: 'compatible', baseUrl: 'http://127.0.0.1:9', model: 'shared-model', key: 'synthetic-shared-secret-724' });
    await owner(app, 'contacts.set-primary', { employeeId: employee.id });
    const openedEmployee = await owner(app, 'private-chat.open', { botId: employee.id });
    const openedSecond = await owner(app, 'private-chat.open', { botId: second.id });
    assert.deepEqual(openedEmployee.selection, { kind: 'global', modelId: 'shared-model' });
    assert.deepEqual(openedSecond.selection, openedEmployee.selection);
    assert.equal((await owner(app, 'contacts.get')).primaryEmployeeId, employee.id);
    assert.equal((await owner(app, 'bots.get', { botId: employee.id })).credentialConfigured, false);
    const account = await owner(app, 'model-account.get');
    assert.equal(account.model, 'shared-model');
    assert(!JSON.stringify(account).includes('synthetic-shared-secret-724'));
    assert.equal(app.storage.db.prepare('SELECT count(*) n FROM connection_grants').get().n, 0);
  } finally { await app.close(); }
});

test('DG-04 direct task idempotency cannot change target or input and replays while capacity is full', async () => {
  const server = createServer(async (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: 'worker done' } }] })); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const app = new BotApplication(dir());
  try {
    const main = (await owner(app, 'main.get')).bot;
    const source = await owner(app, 'bots.create', { slug: 'epoch-source', name: 'Initiator' });
    const worker = await owner(app, 'bots.create', { slug: 'epoch-worker', name: 'Worker' });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await owner(app, 'model-account.update', { provider: 'compatible', baseUrl, model: 'fixture', keyless: true });
    await owner(app, 'contacts.set-primary', { employeeId: source.id });
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
    await assert.rejects(owner(app, 'tasks.create', { workerBotId: source.id, idempotencyKey: 'direct-once', input: 'same task' }), { code: 'idempotency-conflict' });
    await assert.rejects(owner(app, 'tasks.create', { workerBotId: worker.id, idempotencyKey: 'direct-once', input: 'changed input' }), { code: 'idempotency-conflict' });
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
