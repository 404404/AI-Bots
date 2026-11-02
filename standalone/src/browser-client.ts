import { request as httpRequest, type ClientRequest } from 'node:http';
import { BotError, requireValue } from './errors.ts';

const JSON_LIMIT = 128 * 1024;
const PNG_LIMIT = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;

export type BrowserAction = 'navigate' | 'read' | 'click' | 'type' | 'scroll' | 'screenshot' | 'close';
export type BrowserScope = Readonly<{ botId: string; taskId: string }>;
export type BrowserStepReply = Readonly<{
  sessionId: string; taskId: string; operationId: string; sequence: number; status: 'completed'; result: unknown;
  enforcedPolicy?: { version: number; queryPolicy: string };
}>;
export type BrowserRequiredPolicy = Readonly<{ version: 1; queryPolicy: 'deny' }>;

/** Trusted application-side HTTP-over-UDS client for the fixed browser worker protocol. */
export class BrowserClient {
  readonly socketPath: string;
  constructor(options: { socketPath: string }) {
    requireValue(typeof options.socketPath === 'string' && options.socketPath.startsWith('/') && !options.socketPath.includes('\0'),
      'browser-client-config-invalid', '浏览器 worker socket 配置无效。', 500);
    this.socketPath = options.socketPath;
  }

  health(signal?: AbortSignal) {
    return this.jsonRequest('GET', '/healthz', {}, signal);
  }
  create(input: BrowserScope & { operationId: string; leaseMs: number; allowedOrigins: string[]; requiredPolicy?: BrowserRequiredPolicy; signal?: AbortSignal }) {
    const { signal, ...body } = input;
    return this.jsonRequest('POST', '/v1/sessions', body, signal);
  }
  operate(sessionId: string, input: BrowserScope & { operationId: string; sequence: number; action: BrowserAction; args?: Record<string, unknown>; requiredPolicy?: BrowserRequiredPolicy; signal?: AbortSignal }) {
    const { signal, ...body } = input;
    return this.jsonRequest('POST', `/v1/sessions/${encodeURIComponent(sessionId)}/operations`, body, signal);
  }
  cancel(sessionId: string, scope: BrowserScope, signal?: AbortSignal, requiredPolicy?: BrowserRequiredPolicy) {
    return this.jsonRequest('POST', `/v1/sessions/${encodeURIComponent(sessionId)}/cancel`, { ...scope, ...(requiredPolicy ? { requiredPolicy } : {}) }, signal);
  }
  close(sessionId: string, scope: BrowserScope, signal?: AbortSignal, requiredPolicy?: BrowserRequiredPolicy) {
    return this.jsonRequest('POST', `/v1/sessions/${encodeURIComponent(sessionId)}/close`, { ...scope, ...(requiredPolicy ? { requiredPolicy } : {}) }, signal);
  }
  screenshot(sessionId: string, resourceId: string, scope: BrowserScope, signal?: AbortSignal, requiredPolicy?: BrowserRequiredPolicy) {
    const body = { ...scope, ...(requiredPolicy ? { requiredPolicy } : {}) };
    return this.request('POST', `/v1/sessions/${encodeURIComponent(sessionId)}/screenshots/${encodeURIComponent(resourceId)}`, body, PNG_LIMIT, signal)
      .then(({ status, contentType, bytes, queryPolicy, policyVersion }) => {
        requireValue(status >= 200 && status < 300 && contentType.toLowerCase().startsWith('image/png'),
          'browser-worker-refused', '浏览器截图暂不可用。', 502);
        if (requiredPolicy) requireValue(policyVersion === requiredPolicy.version && queryPolicy === requiredPolicy.queryPolicy,
          'browser-worker-policy-unverified', '浏览器 worker 未确认此截图请求仍绑定只读页面策略。', 503);
        return bytes;
      });
  }

  private async jsonRequest(method: string, path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const { status, bytes, contentType } = await this.request(method, path, body, JSON_LIMIT, signal);
    let parsed: unknown;
    try { parsed = JSON.parse(bytes.toString('utf8')); } catch {
      throw new BotError('browser-worker-invalid-response', '浏览器 worker 返回了无效响应。', 502);
    }
    requireValue(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed),
      'browser-worker-invalid-response', '浏览器 worker 返回了无效响应。', 502);
    if (status < 200 || status >= 300) {
      const error = (parsed as Record<string, unknown>).error;
      const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[a-z0-9-]{1,80}$/u.test(error.code)
        ? error.code : 'browser-worker-refused';
      throw new BotError(code, '浏览器 worker 未接受此操作。', status >= 400 && status < 600 ? status : 502);
    }
    return parsed as Record<string, unknown>;
  }

  private request(method: string, path: string, body: Record<string, unknown>, limit: number, signal?: AbortSignal) {
    requireValue(!signal?.aborted, 'browser-request-cancelled', '浏览器请求已取消。', 499);
    const payload = method === 'GET' ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
    requireValue(payload.length <= JSON_LIMIT, 'browser-request-too-large', '浏览器请求超过大小限制。', 413);
    return new Promise<{ status: number; contentType: string; bytes: Buffer; queryPolicy: string | undefined; policyVersion: number | undefined }>((resolve, reject) => {
      let settled = false;
      const finishError = (error: Error) => { if (!settled) { settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(error); } };
      const req: ClientRequest = httpRequest({ socketPath: this.socketPath, method, path,
        headers: { 'content-type': 'application/json', 'content-length': String(payload.length), connection: 'close' } }, (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > limit) { req.destroy(); finishError(new BotError('browser-worker-response-too-large', '浏览器 worker 响应超过大小限制。', 502)); return; }
          chunks.push(chunk);
        });
        res.on('end', () => {
          if (settled) return;
          settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
          const version = Number(res.headers['x-browser-policy-version']);
          resolve({ status: res.statusCode ?? 502, contentType: String(res.headers['content-type'] ?? ''), bytes: Buffer.concat(chunks),
            queryPolicy: typeof res.headers['x-browser-query-policy'] === 'string' ? res.headers['x-browser-query-policy'] : undefined,
            policyVersion: Number.isFinite(version) ? version : undefined });
        });
        res.on('error', () => finishError(new BotError('browser-worker-unavailable', '浏览器 worker 暂不可用。', 503)));
      });
      const abort = () => { req.destroy(); finishError(new BotError('browser-request-cancelled', '浏览器请求已取消。', 499)); };
      const timer = setTimeout(() => { req.destroy(); finishError(new BotError('browser-worker-timeout', '浏览器 worker 请求超时，操作结果不确定。', 504)); }, REQUEST_TIMEOUT_MS);
      timer.unref?.();
      signal?.addEventListener('abort', abort, { once: true });
      req.on('error', () => finishError(new BotError('browser-worker-unavailable', '浏览器 worker 暂不可用。', 503)));
      req.end(payload);
    });
  }
}
