import { fetch, ProxyAgent, Agent } from 'undici';
import { BotError, requireValue, text } from './errors.ts';

export interface ModelConfig {
  provider?: 'compatible' | 'openai-codex';
  baseUrl: string;
  model: string;
  proxyUrl: string;
  keyless: boolean;
}
export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function endpoint(value: unknown, proxy = false): string {
  const raw = text(value, proxy ? '代理地址' : '模型服务地址', 512);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BotError('invalid-url', '地址格式无效。');
  }
  requireValue(
    ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash,
    'invalid-url',
    '地址须为 HTTP/HTTPS，不能包含凭据、查询参数或片段。',
  );
  if (proxy) {
    requireValue(url.pathname === '/', 'invalid-proxy', '代理地址只接受协议、主机和端口。');
    requireValue(
      !(
        process.env.BOT_IN_CONTAINER === '1' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      ),
      'container-proxy-loopback',
      '容器代理请使用 host.docker.internal，不能使用宿主机的 localhost。',
    );
  }
  return url.href.replace(/\/$/u, '');
}

export function validateModelConfig(input: Record<string, unknown>): ModelConfig {
  return {
    provider: input.provider === 'openai-codex' ? 'openai-codex' : 'compatible',
    baseUrl:
      input.provider === 'openai-codex'
        ? 'https://chatgpt.com/backend-api'
        : endpoint(input.baseUrl),
    model: text(input.model, '模型名称', 160),
    proxyUrl: input.proxyUrl ? endpoint(input.proxyUrl, true) : '',
    keyless: input.keyless === true,
  };
}

export async function completeModel(
  config: ModelConfig,
  key: string,
  messages: ModelMessage[],
  signal: AbortSignal,
) {
  requireValue(
    key.length > 0 || config.keyless,
    'model-credential-missing',
    '请先私密设置模型凭据。',
    409,
  );
  const dispatcher = config.proxyUrl
    ? new ProxyAgent({ uri: config.proxyUrl, proxyTunnel: true })
    : new Agent();
  const timeout = AbortSignal.timeout(60000);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      redirect: 'error',
      dispatcher,
      headers: {
        'content-type': 'application/json',
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({ model: config.model, messages, stream: false, max_tokens: 1024 }),
      signal: AbortSignal.any([signal, timeout]),
    });
    if (!response.ok) {
      const status = response.status;
      await response.body?.cancel();
      const code =
        status === 401
          ? 'model-unauthorized'
          : status === 403
            ? 'model-forbidden'
            : status === 429
              ? 'model-rate-limited'
              : status === 404
                ? 'model-not-found'
                : 'model-upstream-error';
      const error = new BotError(
        code,
        status === 403
          ? '模型服务拒绝请求；代理配置不能保证消除地区或账户限制。'
          : `模型服务返回 HTTP ${status}。`,
        502,
      );
      error.upstreamStatus = status;
      throw error;
    }
    let size = 0;
    const chunks = [];
    for await (const chunk of response.body ?? []) {
      size += chunk.length;
      if (size > 1048576)
        throw new BotError('model-response-too-large', '模型响应超过大小限制。', 502);
      chunks.push(Buffer.from(chunk));
    }
    let data;
    try {
      data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new BotError('model-invalid-response', '模型返回格式无效。', 502);
    }
    const content = data.choices?.[0]?.message?.content;
    requireValue(
      typeof content === 'string' && content.trim().length > 0 && content.length <= 64000,
      'model-invalid-response',
      '模型未返回有效的文本回复。',
      502,
    );
    return content;
  } catch (error) {
    if (error instanceof BotError) throw error;
    if (signal.aborted) throw new BotError('cancelled', '已停止生成。', 409);
    if (timeout.aborted) throw new BotError('model-timeout', '模型请求超时，未自动重试。', 504);
    throw new BotError(
      config.proxyUrl ? 'model-proxy-unreachable' : 'model-unreachable',
      '无法完成模型请求，请检查服务、凭据和代理配置。',
      502,
    );
  } finally {
    await dispatcher.destroy().catch(() => undefined);
  }
}
