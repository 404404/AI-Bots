import { fetch, Agent, ProxyAgent } from 'undici';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { stream } from '@earendil-works/pi-ai/api/openai-codex-responses';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';
import type { AssistantMessage, Message, Tool } from '@earendil-works/pi-ai';
import { BotError, requireValue } from './errors.ts';

export type CodexTransport = { request: typeof fetch };

/** One real pi-ai turn. Structured toolCall blocks are returned intact for validation. */
export async function completeCodexTurn(args: {
  modelId: string; access: string; systemPrompt: string; messages: Message[]; tools?: Tool[];
  proxyUrl: string; sessionId: string; signal: AbortSignal; transport?: CodexTransport; beforeRequest?: () => void | Promise<void>;
}): Promise<AssistantMessage> {
  const model = openaiCodexProvider().getModels().find((value) => value.id === args.modelId);
  requireValue(model, 'model-not-found', '此 Codex 模型不在锁定 SDK 的目录中。', 409);
  const dispatcher = args.proxyUrl ? new ProxyAgent({ uri: args.proxyUrl, proxyTunnel: true }) : new Agent();
  const timeout = AbortSignal.timeout(90000), combined = AbortSignal.any([args.signal, timeout]);
  let upstreamStatus: number | undefined;
  let beforeRequestFailed = false;
  let beforeRequestError: unknown;
  try {
    const context = normalizeContext({ systemPrompt: args.systemPrompt, messages: args.messages, tools: args.tools });
    const result = await stream(model, context, {
      apiKey: args.access, signal: combined, transport: 'sse', sessionId: args.sessionId,
      maxTokens: 1024, maxRetries: 0,
      onPayload: (payload) => {
        if (args.tools?.length && payload && typeof payload === 'object')
          return { ...(payload as Record<string, unknown>), parallel_tool_calls: false };
      },
      fetch: async (input, init) => {
        try {
          await args.beforeRequest?.();
        } catch (error) {
          beforeRequestFailed = true;
          beforeRequestError = error;
          throw error;
        }
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        requireValue(url.origin === 'https://chatgpt.com' && url.pathname === '/backend-api/codex/responses', 'unexpected-model-endpoint', '模型 SDK 请求了非预期地址。', 502);
        const response = await (args.transport?.request ?? fetch)(url, { ...init, dispatcher, redirect: 'error', signal: combined });
        upstreamStatus = response.status;
        let bytes = 0;
        const body = response.body?.pipeThrough(new TransformStream({
          transform(chunk, controller) {
            bytes += chunk.byteLength;
            if (bytes > 2097152) throw new Error('Response limit');
            controller.enqueue(chunk);
          },
        }));
        return new Response(body ?? null, { status: response.status, statusText: response.statusText, headers: response.headers });
      },
    }).result();
    if (beforeRequestFailed) throw beforeRequestError;
    if (combined.aborted) throw new Error('Aborted');
    if (result.stopReason === 'error' || result.stopReason === 'aborted') {
      const code = upstreamStatus === 403 ? 'model-forbidden' : upstreamStatus === 401 ? 'codex-login-expired' : upstreamStatus === 429 ? 'model-rate-limited' : 'codex-model-failed';
      const error = new BotError(code, 'Codex 模型请求未完成，请检查登录和连接状态。', 502);
      error.upstreamStatus = upstreamStatus;
      throw error;
    }
    requireValue(result.content.length > 0 && result.content.length <= 64, 'model-invalid-response', 'Codex 未返回有效的结构化结果。', 502);
    for (const part of result.content) {
      if (part.type === 'text') requireValue(part.text.length <= 64000, 'model-response-too-large', 'Codex 回复超过大小限制。', 502);
    }
    return result;
  } catch (error) {
    if (beforeRequestFailed) throw beforeRequestError;
    if (error instanceof BotError) throw error;
    if (args.signal.aborted) throw new BotError('cancelled', '执行已取消。', 409);
    if (timeout.aborted) throw new BotError('model-timeout', 'Codex 模型请求超时，未自动重试。', 504);
    const failure = new BotError(args.proxyUrl ? 'model-proxy-unreachable' : 'model-unreachable', 'Codex 模型请求未完成，请检查诊断记录。', 502);
    failure.upstreamStatus = upstreamStatus;
    throw failure;
  } finally {
    await dispatcher.destroy().catch(() => undefined);
  }
}
