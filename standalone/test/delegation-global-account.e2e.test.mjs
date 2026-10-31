import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { BotApplication } from '../src/application.ts';
import { TaskStore } from '../src/task-store.ts';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';

const roots = [];
const directory = () => {
  const root = mkdtempSync(join(tmpdir(), 'delegation-global-account-e2e-'));
  roots.push(root);
  return root;
};
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const owner = (app, command, params = {}) => app.execute(command, params, { kind: 'owner' });
const codexToken = () => {
  const payload = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-account' } })).toString('base64url');
  return `e30.${payload}.signature`;
};
const sseToolCall = (workerId) => {
  const args = JSON.stringify({ workerId, task: 'Return the agreed marker DELEGATE_OK.' });
  const events = [
    { type: 'response.created', response: { id: 'root-call' } },
    { type: 'response.output_item.added', output_index: 0, item: { id: 'call-item', type: 'function_call', call_id: 'delegate-call', name: 'delegate_to_worker', arguments: '' } },
    { type: 'response.function_call_arguments.delta', output_index: 0, delta: args },
    { type: 'response.function_call_arguments.done', output_index: 0, arguments: args },
    { type: 'response.output_item.done', output_index: 0, item: { id: 'call-item', type: 'function_call', call_id: 'delegate-call', name: 'delegate_to_worker', arguments: args } },
    { type: 'response.completed', response: { id: 'root-call', status: 'completed', usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
  ];
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
};
const sseText = (text, id) => {
  const item = { id: `${id}-message`, type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] };
  const events = [
    { type: 'response.created', response: { id } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
    { type: 'response.output_text.delta', output_index: 0, delta: text },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id, status: 'completed', usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
  ];
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
};

test('Codex toolCall delegates through the shared account and returns a redacted worker result to the root', async () => {
  const rootRequests = [];
  const workerRequests = [];
  let workerId;
  let rootTurns = 0;
  const access = codexToken();
  const refresh = 'synthetic-refresh-global-delegation';
  const transport = { request: async (_url, init) => {
    const bytes = typeof init.body === 'string' ? Buffer.from(init.body) : Buffer.from(init.body);
    const headers = new Headers(init.headers);
    const request = JSON.parse(headers.get('content-encoding') === 'zstd' ? zstdDecompressSync(bytes).toString() : bytes.toString());
    if (request.tools?.some((tool) => tool.name === 'delegate_to_worker')) {
      rootRequests.push(request);
      rootTurns++;
      return new Response(rootTurns === 1 ? sseToolCall(workerId) : sseText('Root summary: DELEGATE_OK', 'root-summary'), {
        headers: { 'content-type': 'text/event-stream' },
      });
    }
    workerRequests.push({ request, authorization: headers.get('authorization') });
    return new Response(sseText(`DELEGATE_OK ${access} ${refresh}`, 'worker-result'), {
      headers: { 'content-type': 'text/event-stream' },
    });
  } };
  const app = new BotApplication(directory(), transport);
  try {
    const rootBot = await owner(app, 'bots.create', { slug: 'global-root', name: 'Global root', persona: 'Root persona.' });
    const worker = await owner(app, 'bots.create', { slug: 'global-worker', name: 'Global worker', persona: 'Worker persona.' });
    workerId = worker.id;
    const modelId = openaiCodexProvider().getModels()[0].id;
    app.storage.db.prepare('UPDATE model_account SET oauth_credential=? WHERE singleton=1')
      .run(app.storage.encrypt(JSON.stringify({ type: 'oauth', access, refresh, expires: Date.now() + 3_600_000 })));
    await owner(app, 'model-account.update', { provider: 'openai-codex', model: modelId, keyless: true });
    const memoryRoot = join(app.storage.root, 'bots', worker.id, 'memory');
    mkdirSync(memoryRoot, { recursive: true });
    writeFileSync(join(memoryRoot, 'worker.md'), 'Synthetic worker memory.');

    const conversation = await owner(app, 'conversations.create', { botId: rootBot.id });
    const run = await owner(app, 'runs.submit', { botId: rootBot.id, conversationId: conversation.id,
      idempotencyKey: 'global-delegation-e2e', content: 'Delegate this task.',
      selection: { kind: 'global', modelId } });
    await Promise.all([...app.active.values()].map((entry) => entry.done));

    const finalRun = await owner(app, 'runs.get', { botId: rootBot.id, runId: run.id });
    assert.equal(finalRun.status, 'completed');
    assert.equal(rootRequests.length, 2);
    assert.equal(workerRequests.length, 1);
    assert.equal(workerRequests[0].request.model, modelId);
    assert.equal(workerRequests[0].authorization, `Bearer ${access}`);
    const workerPrompt = JSON.stringify(workerRequests[0].request);
    assert(workerPrompt.includes('Worker persona.'));
    assert(workerPrompt.includes('Synthetic worker memory.'));
    assert.equal(workerPrompt.includes('Root persona.'), false);

    const tasks = new TaskStore(app.storage).byRoot(run.taskId);
    assert.equal(tasks.length, 2);
    assert.equal(tasks[1].executor_bot_id, worker.id);
    assert.equal(tasks[1].connection_id, null);
    assert.equal(tasks[1].status, 'completed');
    assert(tasks[1].config_snapshot.includes(modelId));
    assert.equal(tasks[1].config_snapshot.includes(access), false);
    assert.equal(tasks[1].result, `DELEGATE_OK [REDACTED] [REDACTED]`);

    const followUp = rootRequests[1].input.find((item) => item.type === 'function_call_output');
    assert(followUp?.output.includes(tasks[1].id));
    assert(followUp.output.includes('DELEGATE_OK'));
    assert.equal(followUp.output.includes(access), false);
    assert.equal(followUp.output.includes(refresh), false);
    assert.equal(followUp.output.includes('Synthetic worker memory.'), false);
    assert(!JSON.stringify(await owner(app, 'diagnostics.list')).includes(access));
    assert(!JSON.stringify(app.storage.db.prepare('SELECT result,error_code FROM task_tool_calls').all()).includes(access));
  } finally {
    await app.close();
  }
});
