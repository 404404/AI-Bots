import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { BotError, requireValue, text } from './errors.ts';
import type { BrowserAction, BrowserClient, BrowserRequiredPolicy, BrowserStepReply } from './browser-client.ts';

type Sqlite = {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...args: any[]): any;
    all(...args: any[]): any[];
    run(...args: any[]): { changes: number };
  };
};
export type BrowserStorage = { db: Sqlite; transaction<T>(fn: () => T): T };
export type BrowserTask = Readonly<{
  id: string; botId: string; executorBotId: string; parentId: string | null;
  status: string; deadlineAt: string;
}>;
export type BrowserTaskAdapter = Readonly<{
  /** Creates a canonical, no-model root task for a trusted owner entry. */
  createOwnerRootTask(input: { botId: string; idempotencyKey: string; deadlineAt: string }): BrowserTask;
  /** Ends the canonical owner root task created for a direct browser session. */
  finishOwnerRootTask(taskId: string, status: 'completed' | 'cancelled' | 'interrupted', code: string): void;
  /** Makes an uncertain worker side effect terminal in canonical task authority. */
  interruptTask(taskId: string, code: 'browser-step-interrupted'): void;
  /** Reads the canonical task row, never a model-provided scope object. */
  resolveTask(taskId: string): BrowserTask | undefined;
  /** True only while this call is running inside that actual executor task. */
  isCurrentExecutorTask(botId: string, taskId: string): boolean;
  assertOwnerBot(botId: string): void;
}>;

export const browserSchemaSql = `
CREATE TABLE browser_origin_grants(
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  origin TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision > 0),
  granted INTEGER NOT NULL CHECK(granted IN (0,1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(bot_id,origin)
);
CREATE TABLE browser_sessions(
  id TEXT PRIMARY KEY,
  worker_session_id TEXT,
  bot_id TEXT NOT NULL REFERENCES bots(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  open_kind TEXT NOT NULL CHECK(open_kind IN ('owner','worker')),
  open_key TEXT NOT NULL,
  open_fingerprint TEXT NOT NULL,
  create_operation_id TEXT NOT NULL UNIQUE,
  origin TEXT NOT NULL,
  grant_revision INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('creating','active','closing','closed','cancelled','expired','interrupted')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(bot_id,open_kind,open_key)
);
CREATE INDEX browser_sessions_task ON browser_sessions(task_id,status);
CREATE TABLE browser_steps(
  session_id TEXT NOT NULL REFERENCES browser_sessions(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  fingerprint TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('accepted','completed','interrupted','failed')),
  result_json TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(session_id,step_id),
  UNIQUE(session_id,sequence)
);
CREATE TABLE browser_screenshots(
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES browser_sessions(id) ON DELETE CASCADE,
  bot_id TEXT NOT NULL REFERENCES bots(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  png BLOB NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  byte_length INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(byte_length > 0 AND byte_length <= 2097152),
  CHECK(width > 0 AND width <= 1280 AND height > 0 AND height <= 800)
);
CREATE INDEX browser_screenshots_scope ON browser_screenshots(bot_id,task_id,created_at);
`;

const MAX_STEPS = 12;
const MAX_SESSION_MS = 120_000;
const MAX_SCREENSHOTS = 8;
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
const MAX_SESSION_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const BROWSER_READ_KEY_PREFIX = 'browser-read:';
const BROWSER_READ_POLICY: BrowserRequiredPolicy = Object.freeze({ version: 1, queryPolicy: 'deny' });
const isExactReadPolicy = (value: unknown) => !!value && typeof value === 'object' &&
  Object.keys(value).sort().join(',') === 'queryPolicy,version' &&
  (value as Record<string, unknown>).version === BROWSER_READ_POLICY.version &&
  (value as Record<string, unknown>).queryPolicy === BROWSER_READ_POLICY.queryPolicy;
const browserReadSessionKey = (key: string) => `${BROWSER_READ_KEY_PREFIX}${key}`;
const browserSensitiveContext = new AsyncLocalStorage<readonly string[]>();
function safeNavigationUrl(value: unknown, origin: string, secrets: readonly string[]) {
  requireValue(typeof value === 'string' && value.length <= 2048, 'invalid-browser-operation', '导航 URL 无效。', 400);
  requireValue(!secrets.some((secret) => secret && value.includes(secret)), 'browser-sensitive-url-refused', '导航 URL 含有敏感值，已拒绝。', 400);
  let url: URL;
  try { url = new URL(value); } catch { throw new BotError('invalid-browser-operation', '导航 URL 无效。', 400); }
  requireValue(url.origin === origin && !url.username && !url.password && !url.hash,
    'browser-target-outside-grant', '浏览器 URL 必须位于获准的精确 origin。', 403);
  requireValue(!url.search && !url.href.includes('?'), 'browser-query-not-supported', '首片浏览器不支持含 query 的 URL。', 400);
  return url.href;
}
function redactValue(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === 'string') {
    let output = value;
    for (const secret of secrets) if (secret) output = output.replaceAll(secret, '[REDACTED]');
    return output;
  }
  if (Array.isArray(value)) return value.map((item) => redactValue(item, secrets));
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [redactText(key, secrets), redactValue(item, secrets)]));
  return value;
}
function redactText(value: string, secrets: readonly string[]) {
  let output = value;
  for (const secret of secrets) if (secret) output = output.replaceAll(secret, '[REDACTED]');
  return output;
}
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let i = 0; i < 8; i += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function inspectScreenshot(bytes: Buffer) {
  requireValue(Buffer.isBuffer(bytes) && bytes.length >= 57 && bytes.length <= MAX_SCREENSHOT_BYTES && bytes.subarray(0, 8).equals(PNG_SIGNATURE),
    'invalid-browser-screenshot', '浏览器返回了无效或过大的 PNG 截图。', 502);
  let offset = 8, width = 0, height = 0, sawHeader = false, sawData = false, sawEnd = false;
  while (offset < bytes.length) {
    requireValue(bytes.length - offset >= 12, 'invalid-browser-screenshot', '浏览器返回了不完整的 PNG 截图。', 502);
    const length = bytes.readUInt32BE(offset);
    requireValue(length <= bytes.length - offset - 12, 'invalid-browser-screenshot', '浏览器返回了不完整的 PNG 截图。', 502);
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    for (const b of typeBytes) requireValue((b >= 65 && b <= 90) || (b >= 97 && b <= 122), 'invalid-browser-screenshot', '浏览器返回了无效的 PNG 截图。', 502);
    const type = typeBytes.toString('ascii');
    requireValue(['IHDR', 'IDAT', 'IEND'].includes(type), 'invalid-browser-screenshot', '浏览器返回了含有额外内容的 PNG 截图。', 502);
    const crcRange = bytes.subarray(offset + 4, offset + 8 + length);
    requireValue(crc32(crcRange) === bytes.readUInt32BE(offset + 8 + length), 'invalid-browser-screenshot', '浏览器返回了损坏的 PNG 截图。', 502);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (!sawHeader) {
      requireValue(type === 'IHDR' && length === 13, 'invalid-browser-screenshot', '浏览器返回了无效的 PNG 截图。', 502);
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      requireValue(width > 0 && width <= 1280 && height > 0 && height <= 800 && width * height <= 1_024_000 && data[8] === 8 && [2, 6].includes(data[9]!) && data[10] === 0 && data[11] === 0 && data[12] === 0,
        'invalid-browser-screenshot', '浏览器截图尺寸或编码不受支持。', 502);
      sawHeader = true;
    } else if (type === 'IHDR') {
      throw new BotError('invalid-browser-screenshot', '浏览器返回了重复 PNG 头。', 502);
    } else if (type === 'IDAT') {
      requireValue(!sawEnd, 'invalid-browser-screenshot', '浏览器返回了无效的 PNG 截图。', 502);
      sawData = true;
    } else {
      requireValue(type === 'IEND' && length === 0 && sawData && !sawEnd && offset + 12 === bytes.length,
        'invalid-browser-screenshot', '浏览器返回了不完整的 PNG 截图。', 502);
      sawEnd = true;
    }
    offset += length + 12;
  }
  requireValue(sawHeader && sawData && sawEnd, 'invalid-browser-screenshot', '浏览器返回了不完整的 PNG 截图。', 502);
  return { width, height };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const nowIso = () => new Date().toISOString();
function exactOrigin(value: unknown) {
  const input = text(value, 'origin', 512);
  let url: URL;
  try { url = new URL(input); } catch { throw new BotError('invalid-browser-origin', '浏览器 origin 无效。'); }
  requireValue(['http:', 'https:'].includes(url.protocol) && url.origin === input && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/',
    'invalid-browser-origin', '浏览器授权必须是精确 HTTP(S) origin。');
  return url.origin;
}

/** Application authority for browser tasks, steps, grants and screenshot resources. */
export class BrowserService {
  storage: BrowserStorage;
  client: BrowserClient;
  tasks: BrowserTaskAdapter;
  now: () => number;
  sensitiveValues: () => readonly string[];
  activeSteps = new Map<string, Promise<unknown>>();
  activeOpens = new Map<string, { fingerprint: string; promise: Promise<unknown> }>();

  constructor(options: { storage: BrowserStorage; client: BrowserClient; tasks: BrowserTaskAdapter; now?: () => number; sensitiveValues?: () => readonly string[] }) {
    this.storage = options.storage; this.client = options.client; this.tasks = options.tasks; this.now = options.now ?? (() => Date.now());
    this.sensitiveValues = options.sensitiveValues ?? (() => []);
    const required = ['browser_origin_grants', 'browser_sessions', 'browser_steps', 'browser_screenshots'];
    const existing = new Set((this.storage.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((row) => row.name));
    requireValue(required.every((name) => existing.has(name)), 'schema-upgrade-required', '浏览器数据结构尚未迁移。', 503);
  }

  /** Adds short-lived executor credentials to the single Browser response sanitizer scope. */
  withSensitiveValues<T>(values: readonly string[], operation: () => T): T {
    return browserSensitiveContext.run([...(browserSensitiveContext.getStore() ?? []), ...values.filter(Boolean)], operation);
  }

  private currentSensitiveValues() {
    const scoped = browserSensitiveContext.getStore() ?? [];
    return [...new Set([...this.sensitiveValues(), ...scoped])]
      .filter((secret): secret is string => typeof secret === 'string' && secret.length > 0)
      .sort((a, b) => b.length - a.length);
  }

  private requiredPolicy(session: Record<string, any>) {
    return typeof session.open_key === 'string' && session.open_key.startsWith(BROWSER_READ_KEY_PREFIX)
      ? BROWSER_READ_POLICY : undefined;
  }

  private async verifyPolicyHealth(policy: BrowserRequiredPolicy, signal?: AbortSignal) {
    const health = await this.client.health(signal);
    requireValue(health.ready === true && health.sandboxVerified === true && isExactReadPolicy(health.capabilities),
      'browser-worker-policy-unverified', '浏览器 worker 未证明只读页面所需的 query 拦截策略。', 503);
  }

  private async cancelWorker(session: Record<string, any>) {
    const policy = this.requiredPolicy(session);
    const reply = await this.client.cancel(session.worker_session_id, { botId: session.bot_id, taskId: session.task_id }, undefined, policy);
    if (policy) requireValue(isExactReadPolicy(reply.enforcedPolicy), 'browser-worker-policy-unverified', '浏览器 worker 未确认取消请求仍绑定只读页面策略。', 503);
  }

  private async closeWorker(session: Record<string, any>) {
    const policy = this.requiredPolicy(session);
    const reply = await this.client.close(session.worker_session_id, { botId: session.bot_id, taskId: session.task_id }, undefined, policy);
    if (policy) requireValue(isExactReadPolicy(reply.enforcedPolicy), 'browser-worker-policy-unverified', '浏览器 worker 未确认关闭请求仍绑定只读页面策略。', 503);
  }

  private sanitizeStoredResult(sessionId: string, stepId: string, encoded: string, secrets = this.currentSensitiveValues()) {
    const safe = JSON.stringify(redactValue(JSON.parse(encoded), secrets));
    if (safe !== encoded) this.storage.db.prepare('UPDATE browser_steps SET result_json=?,updated_at=? WHERE session_id=? AND step_id=?')
      .run(safe, this.timestamp(), sessionId, stepId);
    return JSON.parse(safe);
  }

  /** Sanitize legacy persisted tool results before a trusted owner/executor replay returns them. */
  sanitizeToolResult(botId: string, taskId: string, callId: string) {
    const task = this.tasks.resolveTask(taskId);
    requireValue(task && task.botId === botId && task.executorBotId === botId,
      'browser-task-scope-denied', '工具结果与当前 Bot 任务不匹配。', 403);
    if (task.parentId === null) this.tasks.assertOwnerBot(botId);
    else requireValue(this.tasks.isCurrentExecutorTask(botId, taskId), 'browser-task-scope-denied', '当前执行任务无权读取工具结果。', 403);
    const row = this.storage.db.prepare('SELECT result FROM task_tool_calls WHERE task_id=? AND tool_call_id=? AND tool_name=\'browser_read\'')
      .get(taskId, callId) as { result: string | null } | undefined;
    requireValue(row && typeof row.result === 'string', 'browser-tool-result-unavailable', '浏览器工具结果不可用。', 409);
    let safe: string;
    try { safe = JSON.stringify(redactValue(JSON.parse(row.result), this.currentSensitiveValues())); }
    catch { safe = redactText(row.result, this.currentSensitiveValues()); }
    if (safe !== row.result) this.storage.db.prepare('UPDATE task_tool_calls SET result=? WHERE task_id=? AND tool_call_id=?')
      .run(safe, taskId, callId);
    return safe;
  }

  grantOrigin(input: { botId: string; origin: string }) {
    this.tasks.assertOwnerBot(text(input.botId, 'botId', 64));
    return this.updateGrant(text(input.botId, 'botId', 64), exactOrigin(input.origin), true);
  }

  revokeOrigin(input: { botId: string; origin: string }) {
    this.tasks.assertOwnerBot(text(input.botId, 'botId', 64));
    return this.updateGrant(text(input.botId, 'botId', 64), exactOrigin(input.origin), false);
  }

  private async updateGrant(botId: string, origin: string, granted: boolean) {
    const at = nowIso();
    const result = this.storage.transaction(() => {
      const old = this.storage.db.prepare('SELECT revision FROM browser_origin_grants WHERE bot_id=? AND origin=?').get(botId, origin) as { revision: number } | undefined;
      const revision = (old?.revision ?? 0) + 1;
      this.storage.db.prepare(`INSERT INTO browser_origin_grants(bot_id,origin,revision,granted,updated_at) VALUES(?,?,?,?,?)
        ON CONFLICT(bot_id,origin) DO UPDATE SET revision=excluded.revision,granted=excluded.granted,updated_at=excluded.updated_at`).run(botId, origin, revision, granted ? 1 : 0, at);
      const sessions = this.storage.db.prepare(`SELECT s.*,
        EXISTS(SELECT 1 FROM browser_steps p WHERE p.session_id=s.id AND p.status='accepted') AS has_accepted_step
        FROM browser_sessions s WHERE s.bot_id=? AND s.origin=? AND s.status IN ('creating','active','closing')`).all(botId, origin) as Record<string, any>[];
      this.storage.db.prepare("UPDATE browser_sessions SET status='closing',updated_at=? WHERE bot_id=? AND origin=? AND status IN ('creating','active','closing')").run(at, botId, origin);
      this.storage.db.prepare("UPDATE browser_steps SET status='interrupted',error_code='browser-origin-grant-changed',updated_at=? WHERE session_id IN (SELECT id FROM browser_sessions WHERE bot_id=? AND origin=?) AND status='accepted'").run(at, botId, origin);
      return { revision, sessions };
    });
    const cleanupPending: { sessionId: string; leaseExpiresAt: string }[] = [];
    let taskInterruptionFailed = false;
    for (const session of result.sessions) {
      let workerClosed = !session.worker_session_id && session.status !== 'creating';
      if (session.worker_session_id) {
        try {
          await this.cancelWorker(session);
          workerClosed = true;
        } catch {
          cleanupPending.push({ sessionId: session.id, leaseExpiresAt: session.expires_at });
        }
      }
      if (session.open_kind === 'worker' && session.has_accepted_step) {
        try { this.tasks.interruptTask(session.task_id, 'browser-step-interrupted'); }
        catch { taskInterruptionFailed = true; }
      }
      if (!workerClosed && !session.worker_session_id) cleanupPending.push({ sessionId: session.id, leaseExpiresAt: session.expires_at });
      if (workerClosed) this.storage.db.prepare("UPDATE browser_sessions SET status='cancelled',updated_at=? WHERE id=? AND status='closing'").run(this.timestamp(), session.id);
      if (session.open_kind === 'owner') this.tasks.finishOwnerRootTask(session.task_id, 'cancelled', 'browser-origin-grant-changed');
    }
    if (taskInterruptionFailed) throw new BotError('browser-step-interrupted', '授权已撤销并关闭浏览器；canonical task 中断写入失败，调用方必须停止该任务。', 500);
    return { botId, origin, revision: result.revision, granted, cleanupPending };
  }

  listOriginGrants(botId: string) {
    this.tasks.assertOwnerBot(botId);
    return this.storage.db.prepare('SELECT origin,revision,granted,updated_at AS updatedAt FROM browser_origin_grants WHERE bot_id=? ORDER BY origin').all(botId);
  }

  /** Reject a direct-read replay when its persisted owner session belongs to an older grant revision. */
  assertOwnerReadReplayRevision(input: { botId: string; origin: string; idempotencyKey: string; grantRevision: number }) {
    const botId = text(input.botId, 'botId', 64), origin = exactOrigin(input.origin);
    this.tasks.assertOwnerBot(botId);
    const prior = this.storage.db.prepare(`SELECT grant_revision FROM browser_sessions
      WHERE bot_id=? AND open_kind='owner' AND open_key=? AND origin=? ORDER BY created_at DESC LIMIT 1`)
      .get(botId, browserReadSessionKey(text(input.idempotencyKey, 'idempotencyKey', 128)), origin) as { grant_revision: number } | undefined;
    requireValue(!prior || prior.grant_revision === input.grantRevision,
      'browser-origin-grant-changed', '浏览器授权已变更，不能重放旧页面结果。', 403);
  }

  /** Trusted model-tool discovery; exposes only exact active origins for the specified Bot. */
  grantedOriginsForBot(botIdInput: string) {
    const botId = text(botIdInput, 'Bot ID', 64);
    return (this.storage.db.prepare('SELECT origin FROM browser_origin_grants WHERE bot_id=? AND granted=1 ORDER BY origin').all(botId) as { origin: string }[])
      .map((row) => row.origin);
  }

  openForOwner(input: { botId: string; idempotencyKey: string; origin: string; queryPolicy?: 'deny'; signal?: AbortSignal }) {
    const botId = text(input.botId, 'botId', 64);
    const idempotencyKey = text(input.idempotencyKey, 'idempotencyKey', 128);
    this.tasks.assertOwnerBot(botId);
    const origin = exactOrigin(input.origin);
    const grant = this.readGrant(botId, origin);
    const task = this.tasks.createOwnerRootTask({ botId, idempotencyKey, deadlineAt: new Date(this.now() + MAX_SESSION_MS).toISOString() });
    if (!(task.botId === botId && task.executorBotId === botId && task.parentId === null && task.status === 'running' && Number.isFinite(Date.parse(task.deadlineAt)))) {
      this.tasks.finishOwnerRootTask(task.id, 'interrupted', 'browser-task-scope-denied');
      throw new BotError('browser-task-scope-denied', '所有者浏览器任务归属无效。', 403);
    }
    return this.open({ botId, task, origin, grantRevision: grant.revision, kind: 'owner',
      openKey: input.queryPolicy === 'deny' ? browserReadSessionKey(idempotencyKey) : idempotencyKey,
      queryPolicy: input.queryPolicy, signal: input.signal });
  }

  openForWorker(input: { botId: string; taskId: string; idempotencyKey: string; origin: string; queryPolicy?: 'deny'; signal?: AbortSignal }) {
    const botId = text(input.botId, 'botId', 64), taskId = text(input.taskId, 'taskId', 64);
    const task = this.tasks.resolveTask(taskId);
    requireValue(task && task.id === taskId && task.botId === botId && task.executorBotId === botId && task.parentId !== null && task.status === 'running' && this.tasks.isCurrentExecutorTask(botId, taskId),
      'browser-task-scope-denied', '当前执行任务无权创建浏览器会话。', 403);
    requireValue(Date.parse(task.deadlineAt) > this.now(), 'task-deadline-exceeded', '任务截止时间已到。', 409);
    const origin = exactOrigin(input.origin), grant = this.readGrant(botId, origin);
    const key = text(input.idempotencyKey, 'idempotencyKey', 128);
    return this.open({ botId, task, origin, grantRevision: grant.revision, kind: 'worker',
      openKey: input.queryPolicy === 'deny' ? browserReadSessionKey(key) : key,
      queryPolicy: input.queryPolicy, signal: input.signal });
  }

  private readGrant(botId: string, origin: string) {
    const grant = this.storage.db.prepare('SELECT revision,granted FROM browser_origin_grants WHERE bot_id=? AND origin=?').get(botId, origin) as { revision: number; granted: number } | undefined;
    requireValue(grant?.granted === 1, 'browser-origin-not-authorized', '此 Bot 尚未获准访问该 origin。', 403);
    return grant;
  }

  private open(input: { botId: string; task: BrowserTask; origin: string; grantRevision: number; kind: 'owner' | 'worker'; openKey: string; queryPolicy?: 'deny'; signal?: AbortSignal }) {
    const fingerprint = digest({ botId: input.botId, taskId: input.task.id, origin: input.origin, grantRevision: input.grantRevision, queryPolicy: input.queryPolicy ?? 'allow' });
    const pendingKey = `${input.botId}:${input.kind}:${input.openKey}`;
    const pending = this.activeOpens.get(pendingKey);
    if (pending) {
      requireValue(pending.fingerprint === fingerprint, 'browser-open-id-conflict', '浏览器会话幂等键已用于其他参数。', 409);
      return pending.promise;
    }
    const promise = this.openOnce(input, fingerprint).catch((error) => {
      // A conflicting replay is a read-only refusal. It must never change the original task.
      if (input.kind === 'owner' && !(error instanceof BotError && error.code === 'browser-open-id-conflict'))
        this.tasks.finishOwnerRootTask(input.task.id, 'interrupted', error instanceof BotError ? error.code : 'browser-session-interrupted');
      throw error;
    }).finally(() => {
      if (this.activeOpens.get(pendingKey)?.promise === promise) this.activeOpens.delete(pendingKey);
    });
    this.activeOpens.set(pendingKey, { fingerprint, promise });
    return promise;
  }

  private async openOnce(input: { botId: string; task: BrowserTask; origin: string; grantRevision: number; kind: 'owner' | 'worker'; openKey: string; queryPolicy?: 'deny'; signal?: AbortSignal }, fingerprint: string) {
    const remaining = Date.parse(input.task.deadlineAt) - this.now();
    requireValue(remaining >= 1000, 'task-deadline-exceeded', '任务剩余时间不足以创建浏览器租约。', 409);
    const leaseMs = Math.min(MAX_SESSION_MS, remaining);
    const old = this.storage.db.prepare('SELECT * FROM browser_sessions WHERE bot_id=? AND open_kind=? AND open_key=?').get(input.botId, input.kind, input.openKey) as Record<string, any> | undefined;
    if (old) {
      requireValue(old.open_fingerprint === fingerprint, 'browser-open-id-conflict', '浏览器会话幂等键已用于其他参数。', 409);
      requireValue(old.status === 'active', 'browser-session-not-replayable', '浏览器会话创建结果不确定或已结束。', 409);
      return { sessionId: old.id, taskId: old.task_id, expiresAt: old.expires_at, status: 'active', replayed: true };
    }
    const id = randomUUID(), createOperationId = randomUUID(), at = this.timestamp(), expiresAt = new Date(Math.min(this.now() + leaseMs, Date.parse(input.task.deadlineAt))).toISOString();
    this.storage.transaction(() => {
      const currentGrant = this.storage.db.prepare('SELECT revision,granted FROM browser_origin_grants WHERE bot_id=? AND origin=?').get(input.botId, input.origin) as { revision: number; granted: number } | undefined;
      requireValue(currentGrant?.granted === 1 && currentGrant.revision === input.grantRevision, 'browser-origin-grant-changed', '浏览器授权已变更，请重新创建会话。', 403);
      const activeCount = Number(this.storage.db.prepare("SELECT count(*) AS n FROM browser_sessions WHERE status IN ('creating','active','closing')").get()?.n ?? 0);
      requireValue(activeCount < 4, 'browser-session-capacity', '当前浏览器会话已达上限。', 429);
      this.storage.db.prepare(`INSERT INTO browser_sessions(id,bot_id,task_id,open_kind,open_key,open_fingerprint,create_operation_id,origin,grant_revision,status,expires_at,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,'creating',?,?,?)`).run(id, input.botId, input.task.id, input.kind, input.openKey, fingerprint, createOperationId, input.origin, input.grantRevision, expiresAt, at, at);
    });
    try {
      const requiredPolicy = input.queryPolicy === 'deny' ? BROWSER_READ_POLICY : undefined;
      if (requiredPolicy) await this.verifyPolicyHealth(requiredPolicy, input.signal);
      const reply = await this.client.create({ operationId: createOperationId, botId: input.botId, taskId: input.task.id, leaseMs, allowedOrigins: [input.origin], requiredPolicy, signal: input.signal });
      requireValue(typeof reply.sessionId === 'string' && reply.taskId === input.task.id && reply.operationId === createOperationId,
        'browser-worker-invalid-response', '浏览器 worker 返回了无效会话。', 502);
      if (requiredPolicy && !isExactReadPolicy(reply.enforcedPolicy)) {
        this.storage.db.prepare("UPDATE browser_sessions SET worker_session_id=?,status='closing',updated_at=? WHERE id=? AND status='creating'")
          .run(reply.sessionId, this.timestamp(), id);
        try {
          await this.cancelWorker({ worker_session_id: reply.sessionId, bot_id: input.botId, task_id: input.task.id, open_key: input.openKey });
          this.storage.db.prepare("UPDATE browser_sessions SET status='cancelled',updated_at=? WHERE id=? AND status='closing'").run(this.timestamp(), id);
        } catch { /* closing row retains the remote ID for lease reaping */ }
        throw new BotError('browser-worker-policy-unverified', '浏览器 worker 未确认只读页面所需的 query 拦截策略。', 503);
      }
      const changes = this.storage.db.prepare("UPDATE browser_sessions SET worker_session_id=?,status='active',updated_at=? WHERE id=? AND status='creating'").run(reply.sessionId, this.timestamp(), id).changes;
      if (changes !== 1) {
        this.storage.db.prepare("UPDATE browser_sessions SET worker_session_id=?,updated_at=? WHERE id=? AND status='closing'").run(reply.sessionId, this.timestamp(), id);
        try {
          await this.cancelWorker({ worker_session_id: reply.sessionId, bot_id: input.botId, task_id: input.task.id, open_key: input.openKey });
          this.storage.db.prepare("UPDATE browser_sessions SET status='cancelled',updated_at=? WHERE id=? AND status='closing'").run(this.timestamp(), id);
        } catch { /* the persisted remote ID lets the lease reaper retry until expiry */ }
        throw new BotError('browser-session-interrupted', '浏览器会话已中断。', 409);
      }
      return { sessionId: id, taskId: input.task.id, expiresAt, status: 'active', replayed: false };
    } catch (error) {
      this.storage.db.prepare("UPDATE browser_sessions SET status='interrupted',updated_at=? WHERE id=? AND status='creating'").run(this.timestamp(), id);
      throw error;
    }
  }

  async step(input: { sessionId: string; botId: string; taskId: string; stepId: string; action: BrowserAction; args?: Record<string, unknown>; signal?: AbortSignal }) {
    const session = this.lookupSession(input);
    const stepId = text(input.stepId, 'stepId', 128), rawArgs = input.args ?? {};
    requireValue(['navigate', 'read', 'click', 'type', 'scroll', 'screenshot'].includes(input.action), 'unsupported-browser-action', '浏览器操作不受支持。');
    requireValue(rawArgs !== null && typeof rawArgs === 'object' && !Array.isArray(rawArgs), 'invalid-browser-operation', '浏览器操作参数无效。');
    const args = { ...rawArgs };
    const secrets = this.currentSensitiveValues();
    if (input.action === 'navigate') args.url = safeNavigationUrl(args.url, session.origin, secrets);
    const requiredPolicy = this.requiredPolicy(session);
    if (requiredPolicy) await this.verifyPolicyHealth(requiredPolicy, input.signal);
    const fingerprint = digest({ action: input.action, args });
    const existing = this.storage.db.prepare('SELECT * FROM browser_steps WHERE session_id=? AND step_id=?').get(session.id, stepId) as Record<string, any> | undefined;
    if (existing) {
      if (existing.status === 'interrupted') {
        this.assertCanonicalTask(session, false);
        if (session.open_kind === 'worker') requireValue(this.tasks.isCurrentExecutorTask(session.bot_id, session.task_id), 'browser-task-scope-denied', '当前执行任务无权读取此步骤。', 403);
        else this.tasks.assertOwnerBot(session.bot_id);
        requireValue(existing.fingerprint === fingerprint, 'browser-step-id-conflict', '浏览器步骤 ID 已用于不同参数。', 409);
        throw new BotError('browser-step-interrupted', '浏览器步骤结果不确定；所属任务已终止，不能重发。', 409);
      }
      this.authorizeSession(session, input, true);
      requireValue(existing.fingerprint === fingerprint, 'browser-step-id-conflict', '浏览器步骤 ID 已用于不同参数。', 409);
      const active = this.activeSteps.get(`${session.id}:${stepId}`);
      if (active) return active;
      if (existing.status === 'completed') return this.sanitizeStoredResult(session.id, stepId, existing.result_json);
      if (existing.status === 'accepted') {
        this.storage.db.prepare("UPDATE browser_steps SET status='interrupted',error_code='process-interrupted',updated_at=? WHERE session_id=? AND step_id=? AND status='accepted'").run(this.timestamp(), session.id, stepId);
        this.storage.db.prepare("UPDATE browser_sessions SET status='interrupted',updated_at=? WHERE id=? AND status='active'").run(this.timestamp(), session.id);
        await this.interruptCanonicalTask(session);
      }
      throw new BotError('browser-step-interrupted', '浏览器步骤结果不确定，不能重发。', 409);
    }
    this.authorizeSession(session, input, true);
    requireValue(session.status === 'active' && Date.parse(session.expires_at) > this.now(), 'browser-session-not-active', '浏览器会话已结束。', 409);
    this.assertTaskStillActive(session);
    const at = nowIso();
    const sequence = this.storage.transaction(() => {
      const count = Number(this.storage.db.prepare('SELECT count(*) AS n FROM browser_steps WHERE session_id=?').get(session.id)?.n ?? 0);
      requireValue(count < MAX_STEPS, 'browser-step-budget-exhausted', '浏览器步骤预算已用完。', 429);
      const next = count + 1;
      this.storage.db.prepare(`INSERT INTO browser_steps(session_id,step_id,sequence,fingerprint,action,status,created_at,updated_at)
        VALUES(?,?,?,?,?,'accepted',?,?)`).run(session.id, stepId, next, fingerprint, input.action, at, at);
      return next;
    });
    const operation = this.performStep(session, { stepId, sequence, action: input.action, args, signal: input.signal, secrets });
    this.activeSteps.set(`${session.id}:${stepId}`, operation);
    try { return await operation; }
    finally { this.activeSteps.delete(`${session.id}:${stepId}`); }
  }

  private async performStep(session: Record<string, any>, input: { stepId: string; sequence: number; action: BrowserAction; args: Record<string, unknown>; signal?: AbortSignal; secrets: readonly string[] }) {
    const operationId = randomUUID();
    try {
      this.assertTaskStillActive(session);
      const requiredPolicy = this.requiredPolicy(session);
      const reply = await this.client.operate(session.worker_session_id, { botId: session.bot_id, taskId: session.task_id, sequence: input.sequence, operationId, action: input.action, args: input.args, requiredPolicy, signal: input.signal }) as unknown as BrowserStepReply;
      requireValue(reply.status === 'completed' && reply.sessionId === session.worker_session_id &&
        reply.taskId === session.task_id && reply.operationId === operationId && reply.sequence === input.sequence,
      'browser-worker-invalid-response', '浏览器 worker 返回了无效步骤状态。', 502);
      if (requiredPolicy) requireValue(isExactReadPolicy(reply.enforcedPolicy), 'browser-worker-policy-unverified', '浏览器 worker 未确认此步骤仍绑定只读页面策略。', 503);
      let result = reply.result;
      if (input.action === 'navigate' && result && typeof result === 'object' && typeof (result as Record<string, unknown>).url === 'string') {
        result = { ...(result as Record<string, unknown>), url: safeNavigationUrl((result as Record<string, unknown>).url, session.origin, input.secrets) };
      }
      let screenshot: { resourceId: string; png: Buffer; width: number; height: number } | null = null;
      if (input.action === 'screenshot') {
        requireValue(result && typeof result === 'object' && typeof (result as Record<string, unknown>).resourceId === 'string', 'browser-worker-invalid-response', '浏览器 worker 未返回截图资源。', 502);
        const workerResourceId = (result as Record<string, unknown>).resourceId as string;
        const png = await this.client.screenshot(session.worker_session_id, workerResourceId, { botId: session.bot_id, taskId: session.task_id }, input.signal, requiredPolicy);
        const dimensions = inspectScreenshot(png);
        screenshot = { resourceId: randomUUID(), png, ...dimensions };
        result = { resourceId: screenshot.resourceId, width: dimensions.width, height: dimensions.height, bytes: png.length };
      }
      result = redactValue(result, input.secrets);
      const encoded = JSON.stringify({ sessionId: session.id, taskId: session.task_id, stepId: input.stepId, sequence: input.sequence, status: 'completed', result });
      this.storage.transaction(() => {
        this.assertTaskStillActive(session);
        requireValue(session.status === 'active' && this.storage.db.prepare("SELECT 1 FROM browser_sessions WHERE id=? AND status='active'").get(session.id),
          'browser-step-interrupted', '浏览器步骤已中断，迟到结果已丢弃。', 409);
        requireValue(this.storage.db.prepare("SELECT 1 FROM browser_steps WHERE session_id=? AND step_id=? AND status='accepted'").get(session.id, input.stepId),
          'browser-step-interrupted', '浏览器步骤已中断，迟到结果已丢弃。', 409);
        if (screenshot) {
          const totals = this.storage.db.prepare('SELECT count(*) AS n,COALESCE(sum(byte_length),0) AS bytes FROM browser_screenshots WHERE session_id=?').get(session.id) as { n: number; bytes: number };
          requireValue(totals.n < MAX_SCREENSHOTS && totals.bytes + screenshot.png.length <= MAX_SESSION_SCREENSHOT_BYTES,
            'browser-screenshot-budget-exhausted', '浏览器截图预算已用完。', 413);
          this.storage.db.prepare('INSERT INTO browser_screenshots(id,session_id,bot_id,task_id,png,width,height,byte_length,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
            .run(screenshot.resourceId, session.id, session.bot_id, session.task_id, screenshot.png,
              screenshot.width, screenshot.height, screenshot.png.length, nowIso());
        }
        const updated = this.storage.db.prepare("UPDATE browser_steps SET status='completed',result_json=?,updated_at=? WHERE session_id=? AND step_id=? AND status='accepted'")
          .run(encoded, nowIso(), session.id, input.stepId).changes;
        requireValue(updated === 1, 'browser-step-interrupted', '浏览器步骤已中断，迟到结果已丢弃。', 409);
      });
      return JSON.parse(encoded);
    } catch {
      this.storage.db.prepare("UPDATE browser_steps SET status='interrupted',error_code='browser-step-interrupted',updated_at=? WHERE session_id=? AND step_id=? AND status='accepted'").run(this.timestamp(), session.id, input.stepId);
      this.storage.db.prepare("UPDATE browser_sessions SET status='interrupted',updated_at=? WHERE id=? AND status='active'").run(this.timestamp(), session.id);
      await this.interruptCanonicalTask(session);
      throw new BotError('browser-step-interrupted', '浏览器步骤结果不确定；所属任务已终止，不能重发。', 409);
    }
  }

  readScreenshot(input: { resourceId: string; botId: string; taskId: string }) {
    this.tasks.assertOwnerBot(text(input.botId, 'botId', 64));
    const row = this.storage.db.prepare(`SELECT ss.png,s.bot_id,s.task_id,t.executor_bot_id,t.initiator_bot_id,t.parent_id
      FROM browser_screenshots ss JOIN browser_sessions s ON s.id=ss.session_id JOIN tasks t ON t.id=ss.task_id
      WHERE ss.id=? AND ss.bot_id=? AND ss.task_id=?`).get(input.resourceId, input.botId, input.taskId) as { png: Buffer; bot_id: string; task_id: string; executor_bot_id: string; initiator_bot_id: string; parent_id: string | null } | undefined;
    requireValue(row, 'browser-screenshot-not-found', '截图资源不存在。', 404);
    const task = this.tasks.resolveTask(row.task_id);
    requireValue(task && task.id === row.task_id && task.executorBotId === row.bot_id && task.botId === row.bot_id,
      'browser-screenshot-not-found', '截图资源不存在。', 404);
    return Buffer.from(row.png);
  }

  traceForOwner(input: { botId: string; taskId: string }) {
    const botId = text(input.botId, 'Bot ID', 64), taskId = text(input.taskId, '任务 ID', 64);
    this.tasks.assertOwnerBot(botId);
    const task = this.storage.db.prepare(`SELECT id,root_id,parent_id,initiator_bot_id,executor_bot_id,status,error_code,created_at,started_at,finished_at,deadline_at,request_key
      FROM tasks WHERE id=?`).get(taskId) as Record<string, any> | undefined;
    const ownerTask = task && task.parent_id === null && task.root_id === taskId && task.initiator_bot_id === botId &&
      task.executor_bot_id === botId && typeof task.request_key === 'string' && task.request_key.startsWith('browser-owner:');
    const workerTask = task && task.parent_id !== null && task.executor_bot_id === botId &&
      this.storage.db.prepare('SELECT 1 FROM tasks WHERE id=? AND root_id=? AND parent_id IS NULL').get(task.root_id, task.root_id);
    requireValue(ownerTask || workerTask, 'browser-task-not-found', '浏览器任务不存在。', 404);
    const secrets = this.currentSensitiveValues();
    const sessions = this.storage.db.prepare(`SELECT id,task_id,origin,status,expires_at,created_at,updated_at
      FROM browser_sessions WHERE bot_id=? AND task_id=? AND open_kind=? ORDER BY created_at,id`).all(botId, taskId, ownerTask ? 'owner' : 'worker') as Record<string, any>[];
    return {
      task: { id: task.id, status: task.status, errorCode: task.error_code, createdAt: task.created_at,
        startedAt: task.started_at, finishedAt: task.finished_at, deadlineAt: task.deadline_at },
      toolCalls: ownerTask ? [] : (this.storage.db.prepare(`SELECT tool_call_id AS callId,status,error_code AS errorCode,result,created_at AS createdAt,finished_at AS finishedAt
        FROM task_tool_calls WHERE task_id=? AND tool_name='browser_read' ORDER BY created_at,tool_call_id`).all(taskId) as Record<string, any>[])
        .map((call) => {
          if (!call.result) return { ...call, result: null };
          const safe = JSON.stringify(redactValue(JSON.parse(call.result), secrets));
          if (safe !== call.result) this.storage.db.prepare('UPDATE task_tool_calls SET result=? WHERE task_id=? AND tool_call_id=?')
            .run(safe, taskId, call.callId);
          return { ...call, result: JSON.parse(safe) };
        }),
      sessions: sessions.map((session) => ({
        id: session.id, taskId: session.task_id, origin: session.origin, status: session.status,
        expiresAt: session.expires_at, createdAt: session.created_at, updatedAt: session.updated_at,
        steps: (this.storage.db.prepare(`SELECT step_id,sequence,action,status,result_json,error_code,created_at,updated_at
          FROM browser_steps WHERE session_id=? ORDER BY sequence`).all(session.id) as Record<string, any>[]).map((step) => ({
          stepId: step.step_id, sequence: step.sequence, action: step.action, status: step.status,
          result: step.result_json ? this.sanitizeStoredResult(session.id, step.step_id, step.result_json, secrets) : null, errorCode: step.error_code,
          createdAt: step.created_at, updatedAt: step.updated_at,
        })),
      })),
    };
  }

  listOwnerTasks(botIdInput: string, limitInput = 50) {
    const botId = text(botIdInput, 'Bot ID', 64);
    this.tasks.assertOwnerBot(botId);
    requireValue(Number.isInteger(limitInput) && limitInput > 0 && limitInput <= 100,
      'invalid-limit', '分页大小应为 1–100。');
    const rows = this.storage.db.prepare(`SELECT id FROM tasks
      WHERE root_id=id AND parent_id IS NULL AND initiator_bot_id=? AND executor_bot_id=? AND request_key LIKE 'browser-owner:%'
      ORDER BY seq DESC LIMIT ?`).all(botId, botId, limitInput) as { id: string }[];
    return rows.map((row) => this.traceForOwner({ botId, taskId: row.id }));
  }

  async close(input: { sessionId: string; botId: string; taskId: string; mode?: 'closed' | 'cancelled' }) {
    const session = this.lookupSession(input);
    this.authorizeSession(session, input, false);
    return this.closeSession(session, input.mode);
  }

  /** Owner-only close path for an authenticated adapter, including worker sessions. */
  async closeForOwner(input: { sessionId: string; botId: string; taskId: string; mode?: 'closed' | 'cancelled' }) {
    const session = this.lookupSession(input);
    this.tasks.assertOwnerBot(session.bot_id);
    this.assertCanonicalTask(session, false);
    return this.closeSession(session, input.mode);
  }

  private async closeSession(session: Record<string, any>, mode?: 'closed' | 'cancelled') {
    if (session.status === 'closed' || session.status === 'cancelled' || session.status === 'expired' || session.status === 'interrupted') return { sessionId: session.id, status: session.status };
    const hasAcceptedStep = Boolean(this.storage.db.prepare("SELECT 1 AS found FROM browser_steps WHERE session_id=? AND status='accepted' LIMIT 1").get(session.id));
    this.storage.db.prepare("UPDATE browser_sessions SET status='closing',updated_at=? WHERE id=? AND status IN ('active','creating')").run(this.timestamp(), session.id);
    this.storage.db.prepare("UPDATE browser_steps SET status='interrupted',error_code='session-closed',updated_at=? WHERE session_id=? AND status='accepted'").run(this.timestamp(), session.id);
    let taskInterruptionFailed = false;
    if (hasAcceptedStep && session.open_kind === 'worker') {
      try { this.tasks.interruptTask(session.task_id, 'browser-step-interrupted'); }
      catch { taskInterruptionFailed = true; }
    }
    let workerClosed = !session.worker_session_id && session.status !== 'creating';
    try {
      if (session.worker_session_id) {
        if (mode === 'cancelled') await this.cancelWorker(session);
        else await this.closeWorker(session);
        workerClosed = true;
      }
    } catch { /* the returned closing state includes the independent lease deadline */ }
    if (!workerClosed) {
      if (session.open_kind === 'owner') this.tasks.finishOwnerRootTask(session.task_id, 'cancelled', 'browser-session-cleanup-pending');
      if (taskInterruptionFailed) throw new BotError('browser-step-interrupted', '浏览器清理仍待租约到期；canonical task 中断写入失败，调用方必须停止该任务。', 500);
      return { sessionId: session.id, status: 'closing', cleanupPending: true, leaseExpiresAt: session.expires_at };
    }
    const status = mode ?? 'closed';
    this.storage.db.prepare('UPDATE browser_sessions SET status=?,updated_at=? WHERE id=?').run(status, this.timestamp(), session.id);
    if (session.open_kind === 'owner') this.tasks.finishOwnerRootTask(session.task_id, status === 'cancelled' ? 'cancelled' : 'completed', status);
    if (taskInterruptionFailed) throw new BotError('browser-step-interrupted', '浏览器已关闭；canonical task 中断写入失败，调用方必须停止该任务。', 500);
    return { sessionId: session.id, status };
  }

  async taskTerminal(taskId: string, terminal: 'completed' | 'failed' | 'cancelled' | 'interrupted') {
    const sessions = this.storage.db.prepare("SELECT * FROM browser_sessions WHERE task_id=? AND status IN ('creating','active','closing')").all(taskId) as Record<string, any>[];
    const cleanupPending: { sessionId: string; leaseExpiresAt: string }[] = [];
    for (const session of sessions) {
      this.storage.db.prepare("UPDATE browser_sessions SET status='closing',updated_at=? WHERE id=? AND status IN ('creating','active','closing')").run(this.timestamp(), session.id);
      this.storage.db.prepare("UPDATE browser_steps SET status='interrupted',error_code='task-terminal',updated_at=? WHERE session_id=? AND status='accepted'").run(this.timestamp(), session.id);
      let workerClosed = !session.worker_session_id && session.status !== 'creating';
      if (session.worker_session_id) {
        try { await this.cancelWorker(session); workerClosed = true; }
        catch { cleanupPending.push({ sessionId: session.id, leaseExpiresAt: session.expires_at }); }
      }
      const status = terminal === 'cancelled' ? 'cancelled' : terminal === 'interrupted' ? 'interrupted' : 'closed';
      if (workerClosed) this.storage.db.prepare("UPDATE browser_sessions SET status=?,updated_at=? WHERE id=? AND status='closing'").run(status, this.timestamp(), session.id);
    }
    return { taskId, status: terminal, cleanupPending };
  }

  async recover(remoteAvailable = true) {
    const rows = this.storage.db.prepare("SELECT * FROM browser_sessions WHERE status IN ('creating','active','closing')").all() as Record<string, any>[];
    const cleanupPending: { sessionId: string; leaseExpiresAt: string }[] = [];
    for (const row of rows) {
      this.storage.db.prepare("UPDATE browser_sessions SET status='closing',updated_at=? WHERE id=? AND status IN ('creating','active','closing')").run(this.timestamp(), row.id);
      this.storage.db.prepare("UPDATE browser_steps SET status='interrupted',error_code='process-interrupted',updated_at=? WHERE session_id=? AND status='accepted'").run(this.timestamp(), row.id);
      let workerClosed = !row.worker_session_id && row.status !== 'closing';
      if (row.worker_session_id && remoteAvailable) {
        try { await this.cancelWorker(row); workerClosed = true; }
        catch { cleanupPending.push({ sessionId: row.id, leaseExpiresAt: row.expires_at }); }
      } else if (row.worker_session_id) cleanupPending.push({ sessionId: row.id, leaseExpiresAt: row.expires_at });
      if (workerClosed) this.storage.db.prepare("UPDATE browser_sessions SET status='interrupted',updated_at=? WHERE id=? AND status='closing'").run(this.timestamp(), row.id);
      if (row.open_kind === 'owner') this.tasks.finishOwnerRootTask(row.task_id, 'interrupted', 'process-interrupted');
    }
    return { interrupted: rows.length, cleanupPending };
  }

  async reap() {
    const now = this.timestamp();
    const rows = this.storage.db.prepare("SELECT * FROM browser_sessions WHERE status='closing' OR (status IN ('creating','active') AND expires_at<=?)").all(now) as Record<string, any>[];
    for (const row of rows) {
      const expired = Date.parse(row.expires_at) <= Date.parse(now);
      let workerClosed = !row.worker_session_id && row.status !== 'creating';
      if (row.worker_session_id) {
        try { await this.cancelWorker(row); workerClosed = true; }
        catch { /* expiry is the worker-side lease cleanup bound */ }
      }
      if (workerClosed || expired) {
        const status = expired ? 'expired' : 'cancelled';
        this.storage.db.prepare('UPDATE browser_sessions SET status=?,updated_at=? WHERE id=? AND status IN (\'creating\',\'active\',\'closing\')').run(status, now, row.id);
        if (row.open_kind === 'owner') this.tasks.finishOwnerRootTask(row.task_id, 'cancelled', status === 'expired' ? 'browser-lease-expired' : 'browser-session-reaped');
      }
    }
    return rows.length;
  }

  private lookupSession(input: { sessionId: string; botId: string; taskId: string }) {
    const session = this.storage.db.prepare('SELECT * FROM browser_sessions WHERE id=? AND bot_id=? AND task_id=?').get(input.sessionId, input.botId, input.taskId) as Record<string, any> | undefined;
    requireValue(session, 'browser-session-not-found', '浏览器会话不存在。', 404);
    return session;
  }

  private authorizeSession(session: Record<string, any>, _input: { botId: string; taskId: string }, requireActive: boolean) {
    if (requireActive) requireValue(session.status === 'active' && Date.parse(session.expires_at) > this.now(), 'browser-session-not-active', '浏览器会话已结束。', 409);
    const task = this.assertCanonicalTask(session, requireActive);
    if (session.open_kind === 'owner') this.tasks.assertOwnerBot(session.bot_id);
    else requireValue(task.status === 'running' && this.tasks.isCurrentExecutorTask(session.bot_id, session.task_id),
      'browser-task-scope-denied', '当前执行任务无权操作此浏览器会话。', 403);
  }

  private assertCanonicalTask(session: Record<string, any>, requireActive: boolean) {
    const task = this.tasks.resolveTask(session.task_id);
    requireValue(task && task.id === session.task_id && task.botId === session.bot_id && task.executorBotId === session.bot_id,
      'browser-task-scope-denied', '浏览器会话与 canonical task 不匹配。', 403);
    if (session.open_kind === 'owner') requireValue(task.parentId === null, 'browser-task-scope-denied', '所有者浏览器会话必须绑定根任务。', 403);
    else requireValue(task.parentId !== null, 'browser-task-scope-denied', 'worker 浏览器会话必须绑定子任务。', 403);
    if (requireActive) requireValue(task.status === 'running' && Date.parse(task.deadlineAt) > this.now(), 'browser-task-not-active', '浏览器所属任务已结束或超时。', 409);
    return task;
  }

  private assertTaskStillActive(session: Record<string, any>) {
    this.assertCanonicalTask(session, true);
    if (session.open_kind === 'worker') requireValue(this.tasks.isCurrentExecutorTask(session.bot_id, session.task_id), 'browser-task-scope-denied', '当前执行上下文已失效。', 403);
    const grant = this.readGrant(session.bot_id, session.origin);
    requireValue(grant.revision === session.grant_revision, 'browser-origin-grant-changed', '浏览器授权已变更，请重新创建会话。', 403);
  }

  private async interruptCanonicalTask(session: Record<string, any>) {
    let persisted = true;
    try { this.tasks.interruptTask(session.task_id, 'browser-step-interrupted'); }
    catch { persisted = false; }
    await this.cancelWorker(session).catch(() => {});
    if (!persisted) throw new BotError('browser-step-interrupted', '浏览器步骤结果不确定；任务终止写入失败，调用方必须停止当前任务且不能重试。', 500);
  }

  private timestamp() { return new Date(this.now()).toISOString(); }
}
