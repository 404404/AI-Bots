import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { zstdDecompressSync } from 'node:zlib';
import { BotApplication } from '../src/application.ts';
import { validateToolCall } from '@earendil-works/pi-ai';
import { createWorkerTool, updateWorkerTool, delegateTool } from '../src/task-engine.ts';
import { runMainTurn } from '../src/root-run.ts';

const roots = [];
const dir = () => { const value = mkdtempSync(join(tmpdir(), 'worker-management-')); roots.push(value); return value; };
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const owner = (app, command, params = {}) => app.execute(command, params, { kind: 'owner' });
const wait = async (fn) => { for (let i = 0; i < 150; i++) { if (await fn()) return; await new Promise((resolve) => setTimeout(resolve, 20)); } throw Error('fixture-timeout'); };
function codexToken() {
  const payload = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-management-account' } })).toString('base64url');
  return `e30.${payload}.signature`;
}
function sseToolCall(name, args, id) {
  const value = JSON.stringify(args);
  const events = [
    { type: 'response.created', response: { id: `root-${id}` } },
    { type: 'response.output_item.added', output_index: 0, item: { id: `fc_${id}`, type: 'function_call', call_id: id, name, arguments: '' } },
    { type: 'response.function_call_arguments.delta', output_index: 0, delta: value },
    { type: 'response.function_call_arguments.done', output_index: 0, arguments: value },
    { type: 'response.output_item.done', output_index: 0, item: { id: `fc_${id}`, type: 'function_call', call_id: id, name, arguments: value } },
    { type: 'response.completed', response: { id: `root-${id}`, status: 'completed', usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 } } },
  ];
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
}
function sseText(value) {
  const item = { id: 'root-final-message', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: value }] };
  return [
    { type: 'response.created', response: { id: 'root-final' } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
    { type: 'response.output_text.delta', output_index: 0, delta: value },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'root-final', status: 'completed', usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 } } },
  ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
}

test('schema 6 policy is owner-controlled, default-off, revisioned and restricts direct management receipts', async () => {
  const app = new BotApplication(dir());
  try {
    const main = (await owner(app, 'main.get')).bot;
    const source = await owner(app, 'bots.create', { slug: 'policy-source', name: 'Source' });
    await owner(app, 'bots.update', { botId: source.id,
      model: { provider: 'compatible', baseUrl: 'http://127.0.0.1:9/v1', model: 'source-model', keyless: false },
      apiKey: 'synthetic-policy-key-724' });
    const reference = await owner(app, 'connections.grant-main', { sourceBotId: source.id });
    const before = await owner(app, 'worker-policy.get');
    assert.equal(before.enabled, false);
    await assert.rejects(owner(app, 'workers.create', { operationId: 'before-enable', name: 'No', connectionId: reference.connectionId }),
      { code: 'worker-management-disabled' });
    const enabled = await owner(app, 'worker-policy.update', { enabled: true, allowCreation: true,
      allowedWorkerIds: [], allowedConnectionIds: [reference.connectionId], expectedRevision: before.revision });
    assert.equal(enabled.revision, before.revision + 1);
    const args = { operationId: 'create-once', name: 'Same name', persona: 'first persona', connectionId: reference.connectionId };
    const first = await owner(app, 'workers.create', args);
    const replay = await owner(app, 'workers.create', args);
    assert.equal(replay.id, first.id);
    assert.equal(first.role, 'work');
    assert.equal(app.connections.resolve(first.connectionId, first.id).sourceBotId, source.id);
    const rows = app.storage.db.prepare('SELECT id,credential FROM bots WHERE id IN (?,?)').all(source.id, first.id);
    assert.equal(rows.filter((row) => row.credential).length, 1);
    assert(!JSON.stringify(first).includes('synthetic-policy-key-724'));
    await assert.rejects(owner(app, 'workers.create', { ...args, name: 'changed' }), { code: 'idempotency-conflict' });
    const updated = await owner(app, 'workers.update', { operationId: 'rename-once', workerId: first.id, name: 'Renamed', persona: 'next persona' });
    assert.equal(updated.configRevision, 2);
    assert.equal((await owner(app, 'workers.update', { operationId: 'rename-once', workerId: first.id, name: 'Renamed', persona: 'next persona' })).configRevision, 2);
    await assert.rejects(owner(app, 'workers.update', { operationId: 'bad-fields', workerId: first.id, apiKey: 'forbidden-secret' }),
      { code: 'invalid-worker-fields' });
    await assert.rejects(owner(app, 'worker-policy.update', { enabled: false, allowedWorkerIds: [main.id] }),
      { code: 'worker-policy-target-invalid' });
  } finally { await app.close(); }
});

test('root tool budget persists invalid, denied and unknown attempts and refuses the ninth call', async () => {
  const app = new BotApplication(dir());
  try {
    const main = (await owner(app, 'main.get')).bot;
    const at = new Date().toISOString();
    const created = app.tasks.store.createRoot({ executorBotId: main.id, initiatorBotId: main.id,
      requestKey: 'budget-contract', input: 'budget', configRevision: main.configRevision,
      configSnapshot: JSON.stringify({ name: main.name, persona: main.persona,
        workerManagement: app.workerManagement.snapshot(), delegations: [] }),
      deadlineAt: new Date(Date.now() + 60_000).toISOString(), at });
    app.tasks.store.begin(created.task.id, at);
    const scope = app.tasks.scope(main.id, created.task.id);
    const calls = [
      { id: 'unknown-0', name: 'not_a_tool', arguments: { attempt: 0 } },
      { id: 'invalid-1', name: 'update_worker', arguments: { workerId: 'x', apiKey: 'forbidden' } },
      { id: 'denied-2', name: 'update_worker', arguments: { workerId: 'x', name: 'No' } },
      ...Array.from({ length: 5 }, (_, index) => ({ id: `unknown-${index + 3}`, name: 'not_a_tool', arguments: { attempt: index + 3 } })),
    ];
    for (const call of calls) {
      const result = await app.tasks.executeTool(scope, call, new AbortController().signal);
      assert.equal(result.isError, true);
    }
    assert.equal(app.tasks.store.toolError(created.task.id, 'unknown-0'), 'tool-not-allowed');
    assert.equal(app.tasks.store.toolError(created.task.id, 'invalid-1'), 'invalid-tool-call');
    assert.equal(app.tasks.store.toolError(created.task.id, 'denied-2'), 'worker-management-disabled');
    const overflow = { id: 'ninth', name: 'not_a_tool', arguments: { attempt: 9 } };
    const refused = await app.tasks.executeTool(scope, overflow, new AbortController().signal);
    assert.equal(app.tasks.store.toolError(created.task.id, overflow.id), 'tool-budget-exceeded');
    assert.equal(JSON.parse(refused.content[0].text).error, 'tool-budget-exceeded');
    const rows = app.storage.db.prepare('SELECT count(*) AS n FROM task_tool_calls WHERE task_id=?').get(created.task.id);
    assert.equal(rows.n, 9, 'eight charged calls plus one auditable overflow refusal');
    const conflict = await app.tasks.executeTool(scope, { ...overflow, arguments: { attempt: 10 } }, new AbortController().signal);
    assert.equal(JSON.parse(conflict.content[0].text).error, 'tool-call-id-conflict');
    assert.equal(app.storage.db.prepare('SELECT count(*) AS n FROM task_tool_calls WHERE task_id=?').get(created.task.id).n, 9);

    const policy = app.workerManagement.policy();
    app.workerManagement.updatePolicy({ enabled: true, allowCreation: true, expectedRevision: policy.revision });
    const batch = app.tasks.store.createRoot({ executorBotId: main.id, initiatorBotId: main.id,
      requestKey: 'budget-single-response', input: 'ten calls', configRevision: main.configRevision,
      configSnapshot: JSON.stringify({ workerManagement: app.workerManagement.snapshot(), delegations: [] }),
      deadlineAt: new Date(Date.now() + 60_000).toISOString(), at: new Date().toISOString() });
    app.tasks.store.begin(batch.task.id, new Date().toISOString());
    await assert.rejects(runMainTurn({ modelId: 'gpt-5.5', access: 'synthetic-access', systemPrompt: 'fixture', history: [],
      sessionId: 'task:batch', proxyUrl: '', signal: new AbortController().signal, engine: app.tasks,
      mainBotId: main.id, rootTaskId: batch.task.id,
      completeTurn: async () => ({ role: 'assistant', content: Array.from({ length: 12 }, (_, index) => ({
        type: 'toolCall', id: `many_${index}`, name: 'update_worker', arguments: { workerId: 'not-authorized', name: `Denied ${index}` },
      })) }) }), { code: 'tool-budget-exceeded' });
    assert.equal(app.storage.db.prepare('SELECT count(*) AS n FROM task_tool_calls WHERE task_id=?').get(batch.task.id).n, 9,
      'a single response cannot execute beyond the ninth auditable budget refusal');
    assert.equal(app.tasks.store.toolError(batch.task.id, 'many_8'), 'tool-budget-exceeded');
    assert.equal(app.tasks.store.toolError(batch.task.id, 'many_9'), null, 'remaining response calls are not executed');
  } finally { await app.close(); }
});

test('management retries are read-only: failed budgeted create and denied update cannot add side effects', async () => {
  const app = new BotApplication(dir());
  try {
    const main = (await owner(app, 'main.get')).bot;
    const source = await owner(app, 'bots.create', { slug: 'retry-source', name: 'Retry source' });
    await owner(app, 'bots.update', { botId: source.id, model: {
      provider: 'compatible', baseUrl: 'http://127.0.0.1:9/v1', model: 'retry-model', keyless: true,
    } });
    const reference = await owner(app, 'connections.grant-main', { sourceBotId: source.id });
    const beforePolicy = app.workerManagement.policy();
    app.workerManagement.updatePolicy({ enabled: true, allowCreation: true,
      allowedConnectionIds: [reference.connectionId], expectedRevision: beforePolicy.revision });
    const root = app.tasks.store.createRoot({ executorBotId: main.id, initiatorBotId: main.id,
      requestKey: 'management-retry-readonly', input: 'retry management calls', configRevision: main.configRevision,
      configSnapshot: JSON.stringify({ workerManagement: app.workerManagement.snapshot(), delegations: [] }),
      deadlineAt: new Date(Date.now() + 60_000).toISOString(), at: new Date().toISOString() });
    app.tasks.store.begin(root.task.id, new Date().toISOString());
    const scope = app.tasks.scope(main.id, root.task.id);
    const createCall = (id) => ({ id, name: 'create_worker', arguments: {
      name: `Created ${id}`, persona: 'scoped persona', connectionId: reference.connectionId,
    } });
    const firstCreateCall = createCall('create-1');
    const firstCreate = await app.tasks.executeTool(scope, firstCreateCall, new AbortController().signal);
    assert.equal(firstCreate.isError, false);
    const firstWorkerId = JSON.parse(firstCreate.content[0].text).id;
    const workerCountAfterCreate = Number(app.storage.db.prepare('SELECT count(*) AS n FROM bots').get().n);
    const firstCreateReplay = await app.tasks.executeTool(scope, firstCreateCall, new AbortController().signal);
    assert.equal(firstCreateReplay.isError, false);
    assert.equal(Number(app.storage.db.prepare('SELECT count(*) AS n FROM bots').get().n), workerCountAfterCreate,
      'successful create replay reads its receipt without creating another Bot');
    const updateCall = { id: 'update-success', name: 'update_worker', arguments: { workerId: firstWorkerId, name: 'Updated once' } };
    assert.equal((await app.tasks.executeTool(scope, updateCall, new AbortController().signal)).isError, false);
    assert.equal((await app.tasks.executeTool(scope, updateCall, new AbortController().signal)).isError, false);
    assert.equal((await owner(app, 'bots.get', { botId: firstWorkerId })).configRevision, 2,
      'successful update replay reads its receipt without incrementing config revision again');
    const secondCreate = await app.tasks.executeTool(scope, createCall('create-2'), new AbortController().signal);
    assert.equal(secondCreate.isError, false);
    const third = createCall('create-3');
    const refusedCreate = await app.tasks.executeTool(scope, third, new AbortController().signal);
    assert.equal(JSON.parse(refusedCreate.content[0].text).error, 'worker-create-budget-exceeded');
    const botsAfterRefusal = Number(app.storage.db.prepare('SELECT count(*) AS n FROM bots').get().n);
    const replayedCreate = await app.tasks.executeTool(scope, third, new AbortController().signal);
    assert.equal(JSON.parse(replayedCreate.content[0].text).error, 'worker-create-budget-exceeded');
    assert.equal(Number(app.storage.db.prepare('SELECT count(*) AS n FROM bots').get().n), botsAfterRefusal,
      'replaying a failed create never creates a third worker');
    assert.equal(app.storage.db.prepare('SELECT count(*) AS n FROM worker_management_operations WHERE root_task_id=? AND kind=\'create\'')
      .get(root.task.id).n, 2);

    const unmanaged = await owner(app, 'bots.create', { slug: 'not-in-scope', name: 'Outside scope' });
    const deniedUpdate = { id: 'update-denied', name: 'update_worker', arguments: { workerId: unmanaged.id, name: 'Should not change' } };
    const firstRefusal = await app.tasks.executeTool(scope, deniedUpdate, new AbortController().signal);
    assert.equal(JSON.parse(firstRefusal.content[0].text).error, 'worker-management-target-forbidden');
    const replayRefusal = await app.tasks.executeTool(scope, deniedUpdate, new AbortController().signal);
    assert.equal(JSON.parse(replayRefusal.content[0].text).error, 'worker-management-target-forbidden');
    const unchanged = await owner(app, 'bots.get', { botId: unmanaged.id });
    assert.equal(unchanged.name, 'Outside scope');
    assert.equal(unchanged.configRevision, 1);
  } finally { await app.close(); }
});

test('DG03 true SDK tools create, update by stable ID, delegate, and return the real worker result', async () => {
  assert.throws(() => validateToolCall([createWorkerTool], { id: 'invalid', name: 'create_worker', arguments: {
    name: 'Worker', persona: 'p', connectionId: 'ref', sourceBotId: 'forbidden',
  } }));
  assert.throws(() => validateToolCall([updateWorkerTool], { id: 'invalid', name: 'update_worker', arguments: {
    workerId: 'worker', name: 'Changed', apiKey: 'forbidden',
  } }));
  assert.doesNotThrow(() => validateToolCall([delegateTool], { id: 'valid', name: 'delegate_to_worker', arguments: {
    workerId: 'worker', task: 'do it',
  } }));

  const workerRequests = [], rootRequests = [];
  const workerServer = createServer(async (req, res) => {
    for await (const _chunk of req) { /* bounded fixture request */ }
    workerRequests.push({ authorization: req.headers.authorization });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'WORKER_MARKER_OK' } }] }));
  });
  await new Promise((resolve) => workerServer.listen(0, '127.0.0.1', resolve));
  let app, createReferenceId, createdWorkerId;
  const transport = { request: async (_url, init) => {
    const bodyBytes = Buffer.from(init.body);
    const request = JSON.parse(new Headers(init.headers).get('content-encoding') === 'zstd'
      ? zstdDecompressSync(bodyBytes).toString() : bodyBytes.toString());
    rootRequests.push(request);
    const step = rootRequests.length;
    if (step >= 2) createdWorkerId = app.storage.db.prepare('SELECT id FROM bots WHERE name IN (?,?) ORDER BY name DESC LIMIT 1')
      .get('Echo', 'Echo renamed')?.id;
    const body = step === 1
      ? sseToolCall('create_worker', { name: 'Echo', persona: 'original persona', connectionId: createReferenceId }, 'create_1')
      : step === 2
        ? sseToolCall('update_worker', { workerId: createdWorkerId, name: 'Echo renamed', persona: 'revised persona' }, 'update_1')
        : step === 3
          ? sseToolCall('delegate_to_worker', { workerId: createdWorkerId, task: 'return WORKER_MARKER_OK' }, 'delegate_1')
          : sseText('Main summary: WORKER_MARKER_OK');
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
  } };
  app = new BotApplication(dir(), transport);
  try {
    const main = (await owner(app, 'main.get')).bot;
    const mainSource = await owner(app, 'bots.create', { slug: 'root-codex-source', name: 'Root source' });
    const workerSource = await owner(app, 'bots.create', { slug: 'new-worker-source', name: 'Worker source' });
    await owner(app, 'bots.update', { botId: mainSource.id, model: { provider: 'openai-codex', model: 'gpt-5.5' } });
    const workerUrl = `http://127.0.0.1:${workerServer.address().port}`;
    await owner(app, 'bots.update', { botId: workerSource.id,
      model: { provider: 'compatible', baseUrl: workerUrl, model: 'fixture-worker-model', keyless: false }, apiKey: 'synthetic-worker-key-724' });
    app.storage.db.prepare('INSERT INTO oauth_credentials(bot_id,credential) VALUES(?,?)').run(mainSource.id,
      app.storage.encrypt(JSON.stringify({ type: 'oauth', access: codexToken(), refresh: 'synthetic-refresh-724', expires: Date.now() + 3600000 })));
    await owner(app, 'connections.bind-main', { sourceBotId: mainSource.id });
    const sourceReference = await owner(app, 'connections.grant-main', { sourceBotId: workerSource.id });
    createReferenceId = sourceReference.connectionId;
    const policy = await owner(app, 'worker-policy.get');
    await owner(app, 'worker-policy.update', { enabled: true, allowCreation: true,
      allowedWorkerIds: [], allowedConnectionIds: [createReferenceId], expectedRevision: policy.revision });

    const conversation = await owner(app, 'conversations.create', { botId: main.id });
    const run = await owner(app, 'runs.submit', { botId: main.id, conversationId: conversation.id,
      idempotencyKey: 'dg03-create-update-delegate', content: 'create, configure and use a worker' });
    await wait(() => rootRequests.length >= 2 && !!app.storage.db.prepare('SELECT id FROM bots WHERE name IN (?,?)').get('Echo', 'Echo renamed'));
    createdWorkerId = app.storage.db.prepare('SELECT id FROM bots WHERE name IN (?,?) ORDER BY name DESC LIMIT 1').get('Echo', 'Echo renamed').id;
    await Promise.all([...app.active.values()].map((active) => active.done));

    assert.equal((await owner(app, 'runs.get', { botId: main.id, runId: run.id })).status, 'completed');
    const transcript = await owner(app, 'messages.list', { botId: main.id, conversationId: conversation.id });
    assert.equal(transcript.items.at(-1).content, 'Main summary: WORKER_MARKER_OK');
    assert.equal(rootRequests.length, 4);
    const advertised = rootRequests[0].tools.map((tool) => tool.name);
    assert.deepEqual(new Set(advertised), new Set(['create_worker', 'update_worker', 'delegate_to_worker']));
    assert(JSON.stringify(rootRequests[0]).includes(createReferenceId));
    const worker = await owner(app, 'bots.get', { botId: createdWorkerId });
    assert.equal(worker.name, 'Echo renamed');
    assert.equal(worker.persona, 'revised persona');
    assert.equal(worker.configRevision, 2);
    const taskState = await owner(app, 'tasks.get', { taskId: run.taskId });
    assert.equal(taskState.root.configSnapshot.workerManagement.revision, policy.revision + 1);
    assert.equal(taskState.items.length, 2);
    assert.equal(taskState.items[1].configSnapshot.name, 'Echo renamed');
    assert.equal(taskState.items[1].configSnapshot.persona, 'revised persona');
    assert.equal(taskState.items[1].status, 'completed');
    assert.equal(taskState.items[1].result, 'WORKER_MARKER_OK');
    assert.equal(app.storage.db.prepare('SELECT count(*) AS n FROM worker_management_operations WHERE root_task_id=?').get(run.taskId).n, 2);
    assert.equal(app.storage.db.prepare('SELECT count(*) AS n FROM task_tool_calls WHERE task_id=?').get(run.taskId).n, 3);
    assert.equal(workerRequests.length, 1);
    assert.equal(workerRequests[0].authorization, 'Bearer synthetic-worker-key-724');
    assert(!JSON.stringify(taskState).includes('synthetic-worker-key-724'));
    assert(rootRequests.slice(1).some((request) => request.input.some((item) => item.type === 'function_call_output' && item.output.includes('WORKER_MARKER_OK'))));
  } finally {
    await app.close();
    workerServer.closeAllConnections();
    await new Promise((resolve) => workerServer.close(resolve));
  }
});
