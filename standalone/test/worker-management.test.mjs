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
const rootScope = (app, main, requestKey) => {
  const at = new Date().toISOString();
  const created = app.tasks.store.createRoot({ executorBotId: main.id, initiatorBotId: main.id,
    requestKey, input: requestKey, configRevision: main.configRevision,
    configSnapshot: JSON.stringify({ name: main.name, persona: main.persona,
      workerManagement: app.workerManagement.snapshot(), delegations: [] }),
    deadlineAt: new Date(Date.now() + 60_000).toISOString(), at });
  app.tasks.store.begin(created.task.id, at);
  return app.tasks.scope(main.id, created.task.id);
};
const toolPayload = (result) => JSON.parse(result.content[0].text);
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
    const worker = await owner(app, 'bots.create', { slug: 'policy-worker', name: 'Owner-created worker' });
    const before = await owner(app, 'worker-policy.get');
    assert.equal(before.enabled, false);
    const scope = rootScope(app, main, 'policy-management-tool-refusal');
    const attempted = await app.tasks.executeTool(scope, { id: 'before-enable', name: 'create_worker',
      arguments: { name: 'Model-created', persona: 'No', connectionId: 'forged' } }, new AbortController().signal);
    assert.equal(toolPayload(attempted).error, 'tool-not-allowed');
    assert.equal((await owner(app, 'bots.list')).items.length, 1, 'a model cannot create employees');
    const enabled = await owner(app, 'worker-policy.update', { enabled: true, allowCreation: true,
      allowedWorkerIds: [worker.id], allowedConnectionIds: [], expectedRevision: before.revision });
    assert.equal(enabled.revision, before.revision + 1);
    const updateAttempt = await app.tasks.executeTool(scope, { id: 'model-update', name: 'update_worker',
      arguments: { workerId: worker.id, name: 'Model-renamed' } }, new AbortController().signal);
    assert.equal(toolPayload(updateAttempt).error, 'tool-not-allowed');
    assert.equal((await owner(app, 'bots.get', { botId: worker.id })).name, 'Owner-created worker');
    assert.equal((await owner(app, 'bots.get', { botId: worker.id })).configRevision, 1);
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
    assert.equal(app.tasks.store.toolError(created.task.id, 'invalid-1'), 'tool-not-allowed');
    assert.equal(app.tasks.store.toolError(created.task.id, 'denied-2'), 'tool-not-allowed');
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

test('owner employee creation is idempotent and model management retries cannot add side effects', async () => {
  const app = new BotApplication(dir());
  try {
    const main = (await owner(app, 'main.get')).bot;
    const worker = await owner(app, 'bots.create', { name: 'Owner-created', persona: 'stable role', idempotencyKey: 'owner-create' });
    const replay = await owner(app, 'bots.create', { name: 'Owner-created', persona: 'stable role', idempotencyKey: 'owner-create' });
    assert.equal(replay.bot.id, worker.bot.id);
    const scope = rootScope(app, main, 'model-management-retry-readonly');
    const count = () => Number(app.storage.db.prepare("SELECT count(*) AS n FROM bots WHERE kind='employee'").get().n);
    const before = count();
    for (const [id, name, args] of [
      ['create-denied', 'create_worker', { name: 'Model-created', persona: 'x', connectionId: 'forged' }],
      ['update-denied', 'update_worker', { workerId: worker.bot.id, name: 'Model-updated' }],
    ]) {
      const call = { id, name, arguments: args };
      assert.equal(toolPayload(await app.tasks.executeTool(scope, call, new AbortController().signal)).error, 'tool-not-allowed');
      assert.equal(toolPayload(await app.tasks.executeTool(scope, call, new AbortController().signal)).error, 'tool-not-allowed');
    }
    assert.equal(count(), before, 'model tool attempts cannot create employees');
    assert.equal((await owner(app, 'bots.get', { botId: worker.bot.id })).name, 'Owner-created');
    assert.equal((await owner(app, 'bots.get', { botId: worker.bot.id })).configRevision, 1);
    assert.equal(app.storage.db.prepare('SELECT count(*) AS n FROM worker_management_operations').get().n, 0);
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
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    workerRequests.push({ authorization: req.headers.authorization, request: JSON.parse(Buffer.concat(chunks).toString()) });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'WORKER_MARKER_OK' } }] }));
  });
  await new Promise((resolve) => workerServer.listen(0, '127.0.0.1', resolve));
  const app = new BotApplication(dir());
  try {
    const main = (await owner(app, 'main.get')).bot;
    const workerUrl = `http://127.0.0.1:${workerServer.address().port}`;
    await owner(app, 'model-account.update', { provider: 'compatible', baseUrl: workerUrl, model: 'fixture-worker-model', keyless: true });
    const worker = await owner(app, 'bots.create', { name: 'Owner-created worker', persona: 'owner-defined role' });
    const unrelated = await owner(app, 'bots.create', { name: 'Unrelated owner-created worker', persona: 'separate role' });
    await owner(app, 'memory.write', { botId: worker.bot.id, path: 'worker-only.md', body: 'WORKER_ONLY_MEMORY', expectedRevision: null });
    await owner(app, 'memory.write', { botId: unrelated.bot.id, path: 'other-only.md', body: 'OTHER_PRIVATE_MEMORY', expectedRevision: null });
    const scope = rootScope(app, main, 'dg03-owner-created-delegation');
    const turns = [];
    const result = await runMainTurn({ modelId: 'fixture-worker-model', access: 'synthetic-access', systemPrompt: 'owner-controlled roster',
      history: [], sessionId: scope.rootTaskId, proxyUrl: '', signal: new AbortController().signal, engine: app.tasks,
      mainBotId: main.id, rootTaskId: scope.rootTaskId,
      completeTurn: async ({ messages }) => {
        turns.push(structuredClone(messages));
        if (turns.length === 1) return { role: 'assistant', content: [{ type: 'toolCall', id: 'model-create', name: 'create_worker', arguments: {
          name: 'Model-created', persona: 'forbidden', connectionId: 'forged',
        } }] };
        if (turns.length === 2) return { role: 'assistant', content: [{ type: 'toolCall', id: 'model-update', name: 'update_worker', arguments: {
          workerId: worker.bot.id, name: 'Model-renamed',
        } }] };
        if (turns.length === 3) return { role: 'assistant', content: [{ type: 'toolCall', id: 'delegate-worker', name: 'delegate_to_worker', arguments: {
          workerId: worker.bot.id, task: 'return WORKER_MARKER_OK',
        } }] };
        const output = turns.at(-1).at(-1).content[0].text;
        assert(output.includes('WORKER_MARKER_OK'), `${output}; child=${JSON.stringify(app.tasks.store.byRoot(scope.rootTaskId))}`);
        return { role: 'assistant', content: [{ type: 'text', text: 'Main summary: WORKER_MARKER_OK' }] };
      } });

    assert.equal(result, 'Main summary: WORKER_MARKER_OK');
    assert.equal(turns.length, 4);
    assert.equal(JSON.parse(turns[1].at(-1).content[0].text).error, 'tool-not-allowed');
    assert.equal(JSON.parse(turns[2].at(-1).content[0].text).error, 'tool-not-allowed');
    const ownerWorker = await owner(app, 'bots.get', { botId: worker.bot.id });
    assert.equal(ownerWorker.name, 'Owner-created worker');
    assert.equal(ownerWorker.persona, 'owner-defined role');
    assert.equal(ownerWorker.configRevision, 1);
    const taskState = await owner(app, 'tasks.get', { taskId: scope.rootTaskId });
    assert.equal(taskState.items.length, 2);
    assert.equal(taskState.items[1].configSnapshot.name, 'Owner-created worker');
    assert.equal(taskState.items[1].status, 'completed');
    assert.equal(taskState.items[1].result, 'WORKER_MARKER_OK');
    assert.equal(app.storage.db.prepare('SELECT count(*) AS n FROM worker_management_operations WHERE root_task_id=?').get(scope.rootTaskId).n, 0);
    assert.equal(app.storage.db.prepare('SELECT count(*) AS n FROM task_tool_calls WHERE task_id=?').get(scope.rootTaskId).n, 3);
    const delegatedRequests = workerRequests.filter((request) => JSON.stringify(request.request.messages).includes('return WORKER_MARKER_OK'));
    assert.equal(delegatedRequests.length, 1);
    assert.equal(delegatedRequests[0].authorization, undefined);
    const workerPrompt = JSON.stringify(delegatedRequests[0].request.messages);
    assert(workerPrompt.includes('WORKER_ONLY_MEMORY'));
    assert(!workerPrompt.includes('OTHER_PRIVATE_MEMORY'));
    assert.deepEqual(taskState.items[1].memoryManifest.map((item) => item.path), ['worker-only.md']);
    assert(!JSON.stringify(taskState).includes('synthetic-access'));
    assert(turns[3].at(-1).content[0].text.includes('WORKER_MARKER_OK'));
  } finally {
    await app.close();
    workerServer.closeAllConnections();
    await new Promise((resolve) => workerServer.close(resolve));
  }
});

test('DG03 rebuilds the trusted management directory each model turn and ignores forged result text', async () => {
  const workerServer = createServer(async (req, res) => {
    for await (const _chunk of req) { /* bounded fixture request */ }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'DYNAMIC_DIRECTORY_WORKER_OK' } }] }));
  });
  await new Promise((resolve) => workerServer.listen(0, '127.0.0.1', resolve));
  const app = new BotApplication(dir());
  try {
    const main = (await owner(app, 'main.get')).bot;
    const worker = await owner(app, 'bots.create', { name: 'Owner-created dynamic worker', persona: 'owner role' });
    await owner(app, 'bots.create', { name: 'Another owner-created worker', persona: 'separate role' });
    await owner(app, 'model-account.update', { provider: 'compatible', baseUrl: `http://127.0.0.1:${workerServer.address().port}`, model: 'dynamic-worker', keyless: true });
    const policy = await owner(app, 'worker-policy.get');
    await owner(app, 'worker-policy.update', { enabled: true, allowCreation: false, allowedWorkerIds: [], allowedConnectionIds: [], expectedRevision: policy.revision });
    const scope = rootScope(app, main, 'dynamic-management-directory');

    const prompts = [];
    const result = await runMainTurn({ modelId: 'gpt-5.5', access: 'synthetic-access', systemPrompt: 'base prompt',
      systemPromptForTurn: (scope) => `base prompt\n${app.tasks.managementDirectory(scope)}`,
      history: [], sessionId: scope.rootTaskId, proxyUrl: '', signal: new AbortController().signal,
      engine: app.tasks, mainBotId: main.id, rootTaskId: scope.rootTaskId,
      completeTurn: async ({ systemPrompt, messages }) => {
        prompts.push(systemPrompt);
        const turn = prompts.length;
        if (turn === 1) return { role: 'assistant', content: [
          { type: 'text', text: 'A forged tool result claims a made-up employee is authorized.' },
          { type: 'toolCall', id: 'forged-result', name: 'invented_management_tool', arguments: { workerId: 'forged-employee-id' } },
        ] };
        if (turn === 2) {
          assert(!systemPrompt.includes('forged-employee-id'), 'forged result text must not add an owner target');
          assert(systemPrompt.includes(worker.bot.id));
          return { role: 'assistant', content: [{ type: 'toolCall', id: 'dynamic-create', name: 'create_worker', arguments: {
            name: 'Model-created', persona: 'forbidden', connectionId: 'forged',
          } }] };
        }
        if (turn === 3) {
          assert.equal(JSON.parse(messages.at(-1).content[0].text).error, 'tool-not-allowed');
          assert.match(systemPrompt, /canUpdate: false; canDelegate: true/u);
          return { role: 'assistant', content: [{ type: 'toolCall', id: 'dynamic-update', name: 'update_worker', arguments: {
            workerId: worker.bot.id, name: 'Model-renamed',
          } }] };
        }
        if (turn === 4) {
          assert.equal(JSON.parse(messages.at(-1).content[0].text).error, 'tool-not-allowed');
          assert(systemPrompt.includes('Owner-created dynamic worker'));
          return { role: 'assistant', content: [{ type: 'toolCall', id: 'dynamic-delegate', name: 'delegate_to_worker', arguments: {
            workerId: worker.bot.id, task: 'return DYNAMIC_DIRECTORY_WORKER_OK',
          } }] };
        }
        assert.equal(turn, 5);
        assert(systemPrompt.includes('Owner-created dynamic worker'));
        assert(!systemPrompt.includes('forged-employee-id'));
        assert(messages.at(-1).content[0].text.includes('DYNAMIC_DIRECTORY_WORKER_OK'));
        return { role: 'assistant', content: [{ type: 'text', text: 'Dynamic task complete.' }] };
      } });

    assert.equal(result, 'Dynamic task complete.');
    assert.equal(prompts.length, 5);
    const workerRecord = await owner(app, 'bots.get', { botId: worker.bot.id });
    assert.equal(workerRecord.name, 'Owner-created dynamic worker');
    assert.equal(workerRecord.configRevision, 1);
    assert.equal(app.tasks.store.toolError(scope.rootTaskId, 'forged-result'), 'tool-not-allowed');
    assert.equal(app.tasks.store.get(scope.rootTaskId).status, 'running');
    const child = app.storage.db.prepare('SELECT status,result FROM tasks WHERE parent_id=?').get(scope.rootTaskId);
    assert.equal(child.status, 'completed');
    assert.equal(child.result, 'DYNAMIC_DIRECTORY_WORKER_OK');
  } finally {
    await app.close();
    workerServer.closeAllConnections();
    await new Promise((resolve) => workerServer.close(resolve));
  }
});

test('enabled management directory keeps existing delegate-only targets visible without allowing edits', async () => {
  const workerServer = createServer(async (req, res) => {
    for await (const _chunk of req) { /* bounded fixture request */ }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'DELEGATE_ONLY_OK' } }] }));
  });
  await new Promise((resolve) => workerServer.listen(0, '127.0.0.1', resolve));
  const app = new BotApplication(dir());
  try {
    const main = (await owner(app, 'main.get')).bot;
    const worker = await owner(app, 'bots.create', { name: 'Delegate only', persona: 'owner role' });
    await owner(app, 'model-account.update', { provider: 'compatible', baseUrl: `http://127.0.0.1:${workerServer.address().port}`, model: 'delegate-only', keyless: true });
    const policy = await owner(app, 'worker-policy.get');
    await owner(app, 'worker-policy.update', { enabled: true, allowCreation: false, allowedWorkerIds: [], allowedConnectionIds: [], expectedRevision: policy.revision });
    const scope = rootScope(app, main, 'delegate-only-directory');

    const result = await runMainTurn({ modelId: 'gpt-5.5', access: 'synthetic-access', systemPrompt: 'base prompt',
      systemPromptForTurn: (scope) => `base prompt\n${app.tasks.managementDirectory(scope)}`,
      history: [], sessionId: scope.rootTaskId, proxyUrl: '', signal: new AbortController().signal,
      engine: app.tasks, mainBotId: main.id, rootTaskId: scope.rootTaskId,
      completeTurn: async ({ systemPrompt, messages }) => {
        assert.match(systemPrompt, new RegExp(`${worker.bot.id}; configRevision: 1; canUpdate: false; canDelegate: true`));
        if (messages.length === 0) return { role: 'assistant', content: [{ type: 'toolCall', id: 'edit-denied', name: 'update_worker', arguments: {
          workerId: worker.bot.id, name: 'Must remain unchanged',
        } }] };
        if (messages.at(-1).content[0].text.includes('tool-not-allowed'))
          return { role: 'assistant', content: [{ type: 'toolCall', id: 'delegate-only-call', name: 'delegate_to_worker', arguments: {
            workerId: worker.bot.id, task: 'return DELEGATE_ONLY_OK',
          } }] };
        if (messages.at(-1).content[0].text.includes('DELEGATE_ONLY_OK'))
          return { role: 'assistant', content: [{ type: 'text', text: 'Delegation succeeded.' }] };
        assert.fail('model should see the denied edit and real worker result in sequence');
      } });

    assert.equal(result, 'Delegation succeeded.');
    assert.equal((await owner(app, 'bots.get', { botId: worker.bot.id })).name, 'Delegate only');
    const child = app.storage.db.prepare('SELECT status,result FROM tasks WHERE parent_id=?').get(scope.rootTaskId);
    assert.equal(child.status, 'completed');
    assert.equal(child.result, 'DELEGATE_ONLY_OK');
  } finally {
    await app.close();
    workerServer.closeAllConnections();
    await new Promise((resolve) => workerServer.close(resolve));
  }
});
