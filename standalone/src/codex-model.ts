import { fetch, Agent, ProxyAgent } from 'undici';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { stream } from '@earendil-works/pi-ai/api/openai-codex-responses';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';
import { BotError, requireValue } from './errors.ts';
import type { ModelMessage } from './model.ts';

export async function completeCodex(
  modelId: string,
  access: string,
  messages: ModelMessage[],
  proxyUrl: string,
  sessionId: string,
  signal: AbortSignal,
  transport?: { request: typeof fetch },
) {
  const model = openaiCodexProvider()
    .getModels()
    .find((value) => value.id === modelId);
  requireValue(model, 'model-not-found', '此 Codex 模型不在锁定 SDK 的目录中。', 409);
  const dispatcher = proxyUrl ? new ProxyAgent({ uri: proxyUrl, proxyTunnel: true }) : new Agent();
  const timeout = AbortSignal.timeout(90000),
    combined = AbortSignal.any([signal, timeout]);
  let upstreamStatus: number | undefined;
  try {
    const context = normalizeContext({
      systemPrompt: messages
        .filter((value) => value.role === 'system')
        .map((value) => value.content)
        .join('\n'),
      messages: messages
        .filter((value) => value.role !== 'system')
        .map((value) =>
          value.role === 'user'
            ? { role: 'user', content: value.content, timestamp: Date.now() }
            : {
                role: 'assistant',
                content: [{ type: 'text', text: value.content }],
                api: 'openai-codex-responses',
                provider: 'openai-codex',
                model: model.id,
                stopReason: 'stop',
                timestamp: Date.now(),
                usage: {
                  input: 0,
                  output: 0,
                  cacheRead: 0,
                  cacheWrite: 0,
                  totalTokens: 0,
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                },
              },
        ),
    });
    const result = await stream(model, context, {
      apiKey: access,
      signal: combined,
      transport: 'sse',
      sessionId,
      maxTokens: 1024,
      maxRetries: 0,
      fetch: async (input, init) => {
        const url = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        );
        requireValue(
          url.origin === 'https://chatgpt.com' && url.pathname === '/backend-api/codex/responses',
          'unexpected-model-endpoint',
          '模型 SDK 请求了非预期地址。',
          502,
        );
        const response = await (transport?.request ?? fetch)(url, {
          ...init,
          dispatcher,
          redirect: 'error',
          signal: combined,
        });
        upstreamStatus = response.status;
        let bytes = 0;
        const body = response.body?.pipeThrough(
          new TransformStream({
            transform(chunk, controller) {
              bytes += chunk.byteLength;
              if (bytes > 2097152) throw new Error('Response limit');
              controller.enqueue(chunk);
            },
          }),
        );
        return new Response(body ?? null, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      },
    }).result();
    if (combined.aborted) throw new Error('Aborted');
    if (result.stopReason === 'error' || result.stopReason === 'aborted') {
      const code =
        upstreamStatus === 403
          ? 'model-forbidden'
          : upstreamStatus === 401
            ? 'codex-login-expired'
            : upstreamStatus === 429
              ? 'model-rate-limited'
              : 'codex-model-failed';
      const error = new BotError(code, 'Codex 模型请求未完成，请检查登录和连接状态。', 502);
      error.upstreamStatus = upstreamStatus;
      throw error;
    }
    const content = result.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n');
    requireValue(
      content.trim().length > 0 && content.length <= 64000,
      'model-invalid-response',
      'Codex 未返回有效文本。',
      502,
    );
    return content;
  } catch (error) {
    if (error instanceof BotError) throw error;
    if (signal.aborted) throw new BotError('cancelled', '执行已取消。', 409);
    if (timeout.aborted)
      throw new BotError('model-timeout', 'Codex 模型请求超时，未自动重试。', 504);
    const failure = new BotError(
      proxyUrl ? 'model-proxy-unreachable' : 'model-unreachable',
      'Codex 模型请求未完成，请检查诊断记录。',
      502,
    );
    failure.upstreamStatus = upstreamStatus;
    throw failure;
  } finally {
    await dispatcher.destroy().catch(() => undefined);
  }
}
