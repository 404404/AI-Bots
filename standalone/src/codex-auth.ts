import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import type { Storage } from './storage.ts';
import { BotError, requireValue, text } from './errors.ts';
import { bumpModelEpoch } from './connection-resolver.ts';

export type Grant = {
  type: 'oauth';
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
};
type Attempt = {
  id: string;
  phase: string;
  errorCode: string | null;
  url: string | null;
  userCode: string | null;
  expiresAt: number;
  manualInput: boolean;
  worker?: Worker;
};
export class CodexAuth {
  storage: Storage;
  attempts = new Map<string, Attempt>();
  refreshes = new Map<string, Promise<Grant>>();
  workers = new Set<Worker>();
  createWorker: (data: Record<string, unknown>) => Worker;
  log: (botId: string, code: string, status?: number) => void;
  constructor(
    storage: Storage,
    log: (botId: string, code: string, status?: number) => void,
    createWorker = (data: Record<string, unknown>) =>
      new Worker(new URL('./codex-auth-worker.ts', import.meta.url), { workerData: data }),
  ) {
    this.storage = storage;
    this.log = log;
    this.createWorker = createWorker;
  }
  read(botId: string) {
    return this.storage.db
      .prepare('SELECT credential FROM oauth_credentials WHERE bot_id=?')
      .get(botId)?.credential as string | undefined;
  }
  decode(blob: string): Grant {
    const grant = JSON.parse(this.storage.decrypt(blob));
    requireValue(
      grant?.type === 'oauth' &&
        typeof grant.access === 'string' &&
        grant.access.length > 0 &&
        typeof grant.refresh === 'string' &&
        grant.refresh.length > 0 &&
        Number.isFinite(grant.expires),
      'codex-invalid-grant',
      '登录记录无效，请重新登录。',
      409,
    );
    return grant;
  }
  status(botId: string) {
    const blob = this.read(botId),
      grant = blob ? this.decode(blob) : undefined,
      attempt = this.attempts.get(botId);
    return {
      signedIn: !!grant,
      expiresAt: grant?.expires ?? null,
      models: openaiCodexProvider()
        .getModels()
        .map((model) => ({ id: model.id, name: model.name })),
      attempt: attempt
        ? {
            id: attempt.id,
            phase: attempt.phase,
            errorCode: attempt.errorCode,
            url: attempt.url,
            userCode: attempt.userCode,
            expiresAt: attempt.expiresAt,
            manualInput: attempt.manualInput,
          }
        : { phase: 'idle' },
    };
  }
  begin(botId: string, proxyUrl: string, method: unknown) {
    requireValue(
      method === 'device_code' || method === 'browser',
      'invalid-login-method',
      '请选择设备码或浏览器登录。',
    );
    if (this.attempts.get(botId)?.phase === 'running') return this.status(botId);
    requireValue(this.workers.size < 4, 'auth-capacity', '登录请求已达上限，请稍后重试。', 409);
    const attempt: Attempt = {
      id: randomUUID(),
      phase: 'running',
      errorCode: null,
      url: null,
      userCode: null,
      expiresAt: Date.now() + 900000,
      manualInput: false,
    };
    const worker = this.createWorker({ operation: 'login', proxyUrl, method });
    attempt.worker = worker;
    this.workers.add(worker);
    this.attempts.set(botId, attempt);
    const timer = setTimeout(() => this.cancel(botId), 900000);
    timer.unref();
    worker.on('message', (message) => {
      if (this.attempts.get(botId) !== attempt || attempt.phase !== 'running') return;
      if (message.type === 'request-status') {
        this.log(botId, 'codex-auth-request', message.status);
        return;
      }
      if (message.type === 'device-code') {
        if (
          message.url !== 'https://auth.openai.com/codex/device' ||
          typeof message.userCode !== 'string' ||
          message.userCode.length > 64
        )
          return;
        attempt.url = message.url;
        attempt.userCode = message.userCode;
      }
      if (message.type === 'auth-url') {
        try {
          const url = new URL(message.url);
          if (url.origin === 'https://auth.openai.com' && url.pathname === '/oauth/authorize')
            attempt.url = url.href;
        } catch {}
      }
      if (message.type === 'manual-input') attempt.manualInput = true;
      if (message.type === 'authorized') {
        try {
          const blob = this.storage.encrypt(JSON.stringify(message.credential));
          this.decode(blob);
          this.storage.db
            .prepare(
              'INSERT INTO oauth_credentials(bot_id,credential) VALUES(?,?) ON CONFLICT(bot_id) DO UPDATE SET credential=excluded.credential',
            )
            .run(botId, blob);
          bumpModelEpoch(this.storage.db, botId);
          attempt.phase = 'authorized';
          attempt.url = null;
          attempt.userCode = null;
          attempt.manualInput = false;
          this.log(botId, 'codex-auth-authorized');
        } catch {
          attempt.phase = 'failed';
          attempt.errorCode = 'codex-grant-save-failed';
        }
      }
      if (message.type === 'failed') {
        attempt.phase = 'failed';
        attempt.errorCode = message.code;
        attempt.url = null;
        attempt.userCode = null;
        attempt.manualInput = false;
        this.log(botId, message.code, message.status);
      }
    });
    worker.on('error', () => {
      if (attempt.phase === 'running') {
        attempt.phase = 'failed';
        attempt.errorCode = 'codex-auth-worker-failed';
        attempt.url = null;
        attempt.userCode = null;
      }
    });
    worker.on('exit', () => {
      clearTimeout(timer);
      this.workers.delete(worker);
      if (attempt.phase === 'running') {
        attempt.phase = 'failed';
        attempt.errorCode = 'codex-auth-interrupted';
      }
    });
    return this.status(botId);
  }
  answer(botId: string, value: unknown) {
    const attempt = this.attempts.get(botId);
    requireValue(
      attempt?.phase === 'running' && attempt.manualInput,
      'no-pending-prompt',
      '当前没有等待输入的登录请求。',
      409,
    );
    let url: URL;
    try {
      url = new URL(text(value, '回调地址', 8192));
    } catch {
      throw new BotError('invalid-oauth-callback', '请粘贴登录完成后的 localhost 回调完整地址。');
    }
    requireValue(
      url.protocol === 'http:' &&
        url.hostname === 'localhost' &&
        url.port === '1455' &&
        url.pathname === '/auth/callback' &&
        url.searchParams.get('state') &&
        url.searchParams.get('code'),
      'invalid-oauth-callback',
      '回调地址或授权状态无效。',
    );
    attempt.worker?.postMessage({ type: 'answer', value: url.href });
    attempt.manualInput = false;
    return { accepted: true };
  }
  cancel(botId: string) {
    const attempt = this.attempts.get(botId);
    if (attempt?.phase === 'running') {
      attempt.phase = 'cancelled';
      attempt.url = null;
      attempt.userCode = null;
      attempt.manualInput = false;
      void attempt.worker?.terminate();
    }
    return this.status(botId);
  }
  logout(botId: string) {
    this.cancel(botId);
    const removed = this.storage.db.prepare('DELETE FROM oauth_credentials WHERE bot_id=?').run(botId).changes;
    if (removed) bumpModelEpoch(this.storage.db, botId);
    this.attempts.delete(botId);
    this.log(botId, 'codex-auth-removed');
    return this.status(botId);
  }
  async access(botId: string, proxyUrl: string, signal: AbortSignal): Promise<Grant> {
    if (signal.aborted) throw new BotError('cancelled', '执行已取消。', 409);
    const active = this.refreshes.get(botId);
    if (active) return await this.waitForRefresh(active, signal);
    const blob = this.read(botId);
    requireValue(blob, 'codex-not-signed-in', '请先完成此 Bot 的 Codex 登录。', 409);
    const grant = this.decode(blob);
    if (grant.expires > Date.now() + 60000) return grant;
    const pending = new Promise<Grant>((resolve, reject) => {
      const worker = this.createWorker({ operation: 'refresh', proxyUrl, credential: grant });
      this.workers.add(worker);
      let settled = false;
      const finish = (error?: BotError, result?: Grant) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.workers.delete(worker);
        void worker.terminate();
        if (error) reject(error);
        else resolve(result!);
      };
      const timer = setTimeout(
        () => finish(new BotError('codex-refresh-timeout', '登录刷新超时，请重试。', 504)),
        60000,
      );
      timer.unref();
      worker.on('message', (message) => {
        if (settled) return;
        if (message.type === 'authorized') {
          try {
            const next = this.storage.encrypt(JSON.stringify(message.credential)),
              value = this.decode(next);
            requireValue(
              this.storage.db
                .prepare(
                  'UPDATE oauth_credentials SET credential=? WHERE bot_id=? AND credential=?',
                )
                .run(next, botId, blob).changes,
              'codex-auth-changed',
              '登录状态已变化，请重新发送。',
              409,
            );
            this.log(botId, 'codex-auth-refreshed');
            finish(undefined, value);
          } catch (error) {
            finish(
              error instanceof BotError
                ? error
                : new BotError('codex-refresh-failed', '登录刷新失败，请重新登录。', 409),
            );
          }
        }
        if (message.type === 'failed')
          finish(new BotError(message.code, 'Codex 登录刷新失败，请检查连接或重新登录。', 502));
      });
      worker.on('error', () => finish(new BotError('codex-refresh-failed', '登录刷新失败。', 502)));
      worker.on('exit', () => {
        if (!settled) finish(new BotError('codex-refresh-interrupted', '登录刷新被中断。', 502));
      });
    });
    this.refreshes.set(botId, pending);
    const cleanup = () => {
      if (this.refreshes.get(botId) === pending) this.refreshes.delete(botId);
    };
    void pending.then(cleanup, cleanup);
    return await this.waitForRefresh(pending, signal);
  }
  private waitForRefresh(pending: Promise<Grant>, signal: AbortSignal): Promise<Grant> {
    return new Promise((resolve, reject) => {
      const abort = () => reject(new BotError('cancelled', '执行已取消。', 409));
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener('abort', abort, { once: true });
      void pending.then(
        (value) => {
          signal.removeEventListener('abort', abort);
          resolve(value);
        },
        (error) => {
          signal.removeEventListener('abort', abort);
          reject(error);
        },
      );
    });
  }
  async close() {
    for (const botId of this.attempts.keys()) this.cancel(botId);
    await Promise.allSettled([...this.workers].map((worker) => worker.terminate()));
  }
}
