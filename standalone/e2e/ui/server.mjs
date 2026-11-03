import { startServer } from '../../src/server.ts';
import { writeSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';

const textSse = (text, id) => {
  const item = { id, type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] };
  const events = [
    { type: 'response.created', response: { id } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
    { type: 'response.output_text.delta', output_index: 0, delta: text },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id, status: 'completed', usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 } } },
  ];
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
};

const toolSse = (threadId) => {
  const args = JSON.stringify({ threadId, body: 'UI QA synthetic model: 跨 Bot 通信持久化检查。' });
  const item = { id: 'ui-qa-tool-call', type: 'function_call', call_id: 'ui-qa-send-bot-message', name: 'send_bot_message', arguments: args };
  const events = [
    { type: 'response.created', response: { id: 'ui-qa-tool-response' } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, arguments: '' } },
    { type: 'response.function_call_arguments.delta', output_index: 0, delta: args },
    { type: 'response.function_call_arguments.done', output_index: 0, arguments: args },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'ui-qa-tool-response', status: 'completed', usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 } } },
  ];
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
};

function createSyntheticCodexTransport() {
  let toolInvoked = false;
  let requestCount = 0;
  return {
    get requestCount() { return requestCount; },
    request: async (_url, init) => {
      requestCount += 1;
      const bytes = Buffer.from(init.body);
      const payload = JSON.parse(new Headers(init.headers).get('content-encoding') === 'zstd' ? zstdDecompressSync(bytes).toString() : bytes.toString());
      const toolNames = (payload.tools ?? []).map((tool) => tool.name);
      if (toolNames.includes('send_bot_message') && !toolInvoked) {
        const threadId = JSON.stringify(payload).match(/threadId: ([^;"\s]+);/)?.[1];
        if (!threadId) return new Response('Authorized test thread was absent from model context.', { status: 500 });
        toolInvoked = true;
        return new Response(toolSse(threadId), { headers: { 'content-type': 'text/event-stream' } });
      }
      const text = toolNames.includes('send_bot_message')
        ? 'UI QA synthetic model: 已执行授权通信工具。'
        : 'UI QA synthetic model: 已收到独立通信并完成测试回复。';
      return new Response(textSse(text, `ui-qa-response-${requestCount}`), { headers: { 'content-type': 'text/event-stream' } });
    },
  };
}

let runtime;
try {
  const publicUrl = process.env.UI_QA_PUBLIC_URL;
  const dataDir = process.env.BOT_DATA_DIR;
  if (!publicUrl || !dataDir) throw new Error('Missing isolated UI QA server configuration.');
  runtime = await startServer({ dataDir, host: '127.0.0.1', port: 0, publicUrl, trustedUrls: [] });
  if (process.env.UI_QA_TEST_MODEL === 'synthetic-codex-tool') {
    const tokenPayload = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'ui-qa-synthetic-account' } })).toString('base64url');
    const grant = {
      type: 'oauth', access: `e30.${tokenPayload}.ui-qa-synthetic-signature`,
      refresh: 'ui-qa-synthetic-refresh-only', expires: Date.now() + 3_600_000,
    };
    runtime.app.storage.db.prepare('UPDATE model_account SET oauth_credential=? WHERE singleton=1')
      .run(runtime.app.storage.encrypt(JSON.stringify(grant)));
    const transport = createSyntheticCodexTransport();
    runtime.app.codexTransport = transport;
    runtime.app.tasks.codexTransport = transport;
  }
  const address = runtime.server.address();
  if (!address || typeof address === 'string' || address.address !== '127.0.0.1' || !Number.isInteger(address.port) || address.port < 1)
    throw new Error('Standalone server did not bind a valid ephemeral loopback port.');
  writeSync(3, `${JSON.stringify({ event: 'ready', pid: process.pid, port: address.port })}\n`);
} catch (error) {
  const code = typeof error?.code === 'string' ? error.code : 'ui-qa-server-start-failed';
  process.stderr.write(`${JSON.stringify({ event: 'failed', code })}\n`);
  process.exitCode = 1;
}

if (runtime) {
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try {
      await runtime.close();
    } catch {
      process.exitCode = 1;
    }
  };
  process.on('SIGTERM', () => void stop());
  process.on('SIGINT', () => void stop());
}
