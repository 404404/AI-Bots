import { createHash, randomUUID } from 'node:crypto';
import type { Storage } from './storage.ts';
import type { ConnectionResolver } from './connection-resolver.ts';
import { mainBotId } from './bot-identity.ts';
import { validateBotIdentityPatch } from './bot-fields.ts';
import { BotError, requireValue, text } from './errors.ts';

export type WorkerPolicy = Readonly<{
  enabled: boolean;
  allowCreation: boolean;
  allowedWorkerIds: readonly string[];
  allowedConnectionIds: readonly string[];
  revision: number;
}>;
export type WorkerManagementScope = Readonly<{
  rootTaskId: string | null;
  mainBotId: string;
  policy: WorkerPolicy;
}>;

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const stamp = () => new Date().toISOString();
const parsedArray = (value: string): string[] => {
  const parsed = JSON.parse(value) as unknown;
  requireValue(Array.isArray(parsed) && parsed.every((item) => typeof item === 'string'),
    'worker-policy-corrupt', '工作 Bot 管理策略损坏。', 500);
  return [...new Set(parsed)];
};

/** Owns owner policy, scoped identity edits, connection grants, and durable operation receipts. */
export class WorkerManagement {
  storage: Storage;
  connections: ConnectionResolver;
  constructor(storage: Storage, connections: ConnectionResolver) {
    this.storage = storage;
    this.connections = connections;
  }

  policy(): WorkerPolicy {
    const row = this.storage.db.prepare('SELECT * FROM worker_management_policy WHERE singleton=1').get() as {
      enabled: number; allow_creation: number; allowed_worker_ids: string; allowed_connection_ids: string; revision: number;
    } | undefined;
    requireValue(row, 'worker-policy-corrupt', '工作 Bot 管理策略缺失。', 500);
    return Object.freeze({ enabled: row.enabled === 1, allowCreation: row.allow_creation === 1,
      allowedWorkerIds: Object.freeze(parsedArray(row.allowed_worker_ids)),
      allowedConnectionIds: Object.freeze(parsedArray(row.allowed_connection_ids)), revision: row.revision });
  }

  updatePolicy(input: Record<string, unknown>) {
    const allowed = new Set(['enabled', 'allowCreation', 'allowedWorkerIds', 'allowedConnectionIds', 'expectedRevision']);
    requireValue(Object.keys(input).every((key) => allowed.has(key)), 'invalid-worker-policy', '管理策略包含不支持的字段。');
    const before = this.policy();
    if (input.expectedRevision !== undefined)
      requireValue(input.expectedRevision === before.revision, 'worker-policy-conflict', '管理策略已变化，请刷新后重试。', 409);
    const enabled = input.enabled === undefined ? before.enabled : input.enabled;
    const allowCreation = input.allowCreation === undefined ? before.allowCreation : input.allowCreation;
    requireValue(typeof enabled === 'boolean' && typeof allowCreation === 'boolean', 'invalid-worker-policy', '策略开关必须为布尔值。');
    const workerIds = input.allowedWorkerIds === undefined ? [...before.allowedWorkerIds] : input.allowedWorkerIds;
    const connectionIds = input.allowedConnectionIds === undefined ? [...before.allowedConnectionIds] : input.allowedConnectionIds;
    requireValue(Array.isArray(workerIds) && workerIds.length <= 100 && workerIds.every((id) => typeof id === 'string' && id.length <= 64),
      'invalid-worker-policy', '允许管理的工作 Bot 列表无效。');
    requireValue(Array.isArray(connectionIds) && connectionIds.length <= 100 && connectionIds.every((id) => typeof id === 'string' && id.length <= 64),
      'invalid-worker-policy', '允许新建工作 Bot 使用的连接列表无效。');
    const mainId = mainBotId(this.storage.db);
    for (const id of new Set(workerIds as string[])) {
      requireValue(id !== mainId && !!this.storage.db.prepare('SELECT id FROM bots WHERE id=?').get(id),
        'worker-policy-target-invalid', '管理范围只能包含现有工作 Bot。', 409);
    }
    for (const id of new Set(connectionIds as string[])) {
      requireValue(this.connections.status(id, mainId).status === 'available',
        'worker-policy-connection-invalid', '新 Bot 只能使用已获所有者授权且当前有效的主 Bot 连接引用。', 409);
    }
    const normalizedWorkers = [...new Set(workerIds as string[])].sort();
    const normalizedConnections = [...new Set(connectionIds as string[])].sort();
    const changed = enabled !== before.enabled || allowCreation !== before.allowCreation ||
      canonical(normalizedWorkers) !== canonical(before.allowedWorkerIds) ||
      canonical(normalizedConnections) !== canonical(before.allowedConnectionIds);
    if (changed) this.storage.db.prepare(`UPDATE worker_management_policy SET enabled=?,allow_creation=?,allowed_worker_ids=?,
      allowed_connection_ids=?,revision=revision+1,updated_at=? WHERE singleton=1`).run(Number(enabled), Number(allowCreation),
      JSON.stringify(normalizedWorkers), JSON.stringify(normalizedConnections), stamp());
    return this.policy();
  }

  snapshot() {
    const policy = this.policy();
    return { enabled: policy.enabled, allowCreation: policy.allowCreation,
      allowedWorkerIds: [...policy.allowedWorkerIds], allowedConnectionIds: [...policy.allowedConnectionIds], revision: policy.revision };
  }

  scope(rootTaskId: string, snapshot: unknown): WorkerManagementScope {
    let parsedSnapshot = snapshot;
    if (typeof snapshot === 'string') {
      try { parsedSnapshot = JSON.parse(snapshot) as unknown; }
      catch { throw new BotError('worker-policy-snapshot-invalid', '运行中的管理策略快照损坏。', 500); }
    }
    const raw = parsedSnapshot && typeof parsedSnapshot === 'object' ? parsedSnapshot as Record<string, unknown> : {};
    const policyRaw = raw.workerManagement && typeof raw.workerManagement === 'object'
      ? raw.workerManagement as Record<string, unknown> : null;
    // Legacy tasks never received management authority; retain only their own
    // saved delegation snapshot rather than retroactively enabling new tools.
    if (!policyRaw) return Object.freeze({ rootTaskId, mainBotId: mainBotId(this.storage.db), policy: Object.freeze({
      enabled: false, allowCreation: false, allowedWorkerIds: Object.freeze([]),
      allowedConnectionIds: Object.freeze([]), revision: 0,
    }) });
    requireValue(policyRaw && Number.isInteger(policyRaw.revision) && typeof policyRaw.enabled === 'boolean' &&
      typeof policyRaw.allowCreation === 'boolean' && Array.isArray(policyRaw.allowedWorkerIds) &&
      Array.isArray(policyRaw.allowedConnectionIds), 'worker-policy-snapshot-invalid', '运行中的管理策略快照损坏。', 500);
    const mainId = mainBotId(this.storage.db);
    return Object.freeze({ rootTaskId, mainBotId: mainId, policy: Object.freeze({
      enabled: policyRaw.enabled, allowCreation: policyRaw.allowCreation,
      allowedWorkerIds: Object.freeze(policyRaw.allowedWorkerIds.filter((id): id is string => typeof id === 'string')),
      allowedConnectionIds: Object.freeze(policyRaw.allowedConnectionIds.filter((id): id is string => typeof id === 'string')),
      revision: policyRaw.revision as number,
    }) });
  }

  assertCurrent(scope: WorkerManagementScope) {
    requireValue(scope.mainBotId === mainBotId(this.storage.db), 'delegation-main-only', '只有主 Bot 执行范围可管理工作 Bot。', 403);
    const current = this.policy();
    requireValue(current.revision === scope.policy.revision, 'worker-policy-changed', '工作 Bot 管理策略在本次执行后发生变化。', 409);
    requireValue(current.enabled && scope.policy.enabled, 'worker-management-disabled', '所有者尚未启用对话中的工作 Bot 管理。', 403);
    return current;
  }

  allowedTargets(scope: WorkerManagementScope) {
    this.assertCurrent(scope);
    const created = scope.rootTaskId ? this.storage.db.prepare('SELECT bot_id FROM worker_management_scope_targets WHERE root_task_id=? ORDER BY bot_id')
      .all(scope.rootTaskId) as { bot_id: string }[] : [];
    return [...new Set([...scope.policy.allowedWorkerIds, ...created.map((row) => row.bot_id)])];
  }

  create(scope: WorkerManagementScope, operationId: string, nameInput: unknown, personaInput: unknown, connectionIdInput: unknown) {
    this.assertCurrent(scope);
    requireValue(scope.policy.allowCreation, 'worker-creation-disabled', '所有者尚未允许对话创建工作 Bot。', 403);
    const identity = validateBotIdentityPatch({ name: '', persona: '' }, { name: nameInput, persona: personaInput ?? '' });
    const { name, persona } = identity;
    const connectionId = text(connectionIdInput, '连接引用 ID', 64);
    requireValue(name.trim().length > 0, 'invalid-input', 'Bot 名称不能为空。');
    requireValue(scope.policy.allowedConnectionIds.includes(connectionId), 'worker-connection-forbidden', '此连接引用不在所有者允许的新 Bot 范围内。', 403);
    const resolved = this.connections.resolve(connectionId, scope.mainBotId);
    const args = { name, persona, connectionId };
    const key = this.operationKey(operationId, 'create', scope.rootTaskId ?? `owner:${scope.mainBotId}`);
    const argsHash = digest(args);
    const replay = this.findReceipt(key, scope.rootTaskId, 'create', argsHash);
    if (replay) {
      this.assertReceiptStillAuthorized(scope, replay.bot_id, replay.response_json);
      return JSON.parse(replay.response_json) as Record<string, unknown>;
    }
    const db = this.storage.db, id = randomUUID(), at = stamp();
    const slug = this.availableSlug(name);
    const response = { id, slug, name, persona, role: 'work', configRevision: 1,
      connectionId: '', sourceBotId: resolved.sourceBotId };
    this.storage.transaction(() => {
      this.assertCurrent(scope);
      requireValue(Number(db.prepare('SELECT count(*) AS n FROM bots WHERE id<>?').get(scope.mainBotId)?.n) < 100,
        'bot-limit', '工作 Bot 数量已达上限。', 409);
      const connection = this.connections.resolve(connectionId, scope.mainBotId);
      requireValue(connection.sourceBotId === resolved.sourceBotId && connection.sourceModelEpoch === resolved.sourceModelEpoch,
        'connection-changed', '所有者连接在创建期间发生变化。', 409);
      db.prepare(`INSERT INTO bots(id,slug,name,persona,config,created_at,updated_at,config_revision)
        VALUES(?,?,?,?,?,?,?,1)`).run(id, slug, name, persona, '{}', at, at);
      const workerConnectionId = this.connections.issue(connection.sourceBotId, id, at);
      response.connectionId = workerConnectionId;
      db.prepare(`INSERT INTO delegation_grants(main_bot_id,worker_bot_id,connection_id,created_at)
        VALUES(?,?,?,?)`).run(scope.mainBotId, id, workerConnectionId, at);
      db.prepare(`INSERT INTO worker_management_operations(operation_id,root_task_id,kind,arguments_hash,bot_id,response_json,created_at)
        VALUES(?,?,'create',?,?,?,?)`).run(key, scope.rootTaskId, argsHash, id, JSON.stringify(response), at);
      if (scope.rootTaskId) db.prepare('INSERT INTO worker_management_scope_targets(root_task_id,bot_id,operation_id,created_at) VALUES(?,?,?,?)')
        .run(scope.rootTaskId, id, key, at);
    });
    return response;
  }

  update(scope: WorkerManagementScope, operationId: string, workerIdInput: unknown, patch: Record<string, unknown>) {
    this.assertCurrent(scope);
    const workerId = text(workerIdInput, '工作 Bot ID', 64);
    const allowed = new Set(['name', 'persona']);
    requireValue(Object.keys(patch).every((key) => allowed.has(key)), 'invalid-worker-fields', '工作 Bot 管理只允许修改名称和身份提示。');
    requireValue(this.allowedTargets(scope).includes(workerId) && workerId !== scope.mainBotId,
      'worker-management-target-forbidden', '此工作 Bot 不在所有者允许的配置范围内。', 403);
    const key = this.operationKey(operationId, 'update', scope.rootTaskId ?? `owner:${scope.mainBotId}`);
    const argsHash = digest({ workerId, patch });
    const replay = this.findReceipt(key, scope.rootTaskId, 'update', argsHash);
    if (replay) {
      this.assertReceiptStillAuthorized(scope, replay.bot_id, null);
      return JSON.parse(replay.response_json) as Record<string, unknown>;
    }
    const current = this.storage.db.prepare('SELECT id,name,persona,config_revision FROM bots WHERE id=?').get(workerId) as
      { id: string; name: string; persona: string; config_revision: number } | undefined;
    requireValue(current, 'not-found', '工作 Bot 不存在。', 404);
    const identity = validateBotIdentityPatch(current, patch);
    const changed = current.name !== identity.name || current.persona !== identity.persona;
    const at = stamp();
    this.storage.transaction(() => {
      this.assertCurrent(scope);
      requireValue(this.allowedTargets(scope).includes(workerId), 'worker-management-target-forbidden', '工作 Bot 管理授权已撤销。', 403);
      const result = this.storage.db.prepare(`UPDATE bots SET name=?,persona=?,updated_at=?,config_revision=config_revision+?
        WHERE id=? AND config_revision=?`).run(identity.name, identity.persona, at, Number(changed), workerId, current.config_revision);
      requireValue(result.changes === 1, 'worker-config-conflict', '工作 Bot 配置已变化，请重新读取后重试。', 409);
      const response = { id: workerId, name: identity.name, persona: identity.persona,
        role: 'work', configRevision: current.config_revision + Number(changed) };
      this.storage.db.prepare(`INSERT INTO worker_management_operations(operation_id,root_task_id,kind,arguments_hash,bot_id,response_json,created_at)
        VALUES(?,?,'update',?,?,?,?)`).run(key, scope.rootTaskId, argsHash, workerId, JSON.stringify(response), at);
    });
    return { id: workerId, name: identity.name, persona: identity.persona, role: 'work', configRevision: current.config_revision + Number(changed) };
  }

  /** Read-only authorization check used when a persisted tool call is replayed. */
  assertReplayScope(scope: WorkerManagementScope, kind: 'create' | 'update', args: Record<string, unknown>) {
    const policy = this.assertCurrent(scope);
    if (kind === 'create') {
      requireValue(policy.allowCreation, 'worker-creation-disabled', '所有者尚未允许对话创建工作 Bot。', 403);
      const connectionId = text(args.connectionId, '连接引用 ID', 64);
      requireValue(scope.policy.allowedConnectionIds.includes(connectionId), 'worker-connection-forbidden', '此连接引用不在所有者允许的新 Bot 范围内。', 403);
      this.connections.resolve(connectionId, scope.mainBotId);
      return;
    }
    const workerId = text(args.workerId, '工作 Bot ID', 64);
    requireValue(workerId !== scope.mainBotId && this.allowedTargets(scope).includes(workerId),
      'worker-management-target-forbidden', '此工作 Bot 不在所有者允许的配置范围内。', 403);
  }

  /** Reads an operation receipt and validates its current scope without replaying any write. */
  operationReceipt(scope: WorkerManagementScope, operationId: string, kind: 'create' | 'update', args: Record<string, unknown>) {
    requireValue(scope.rootTaskId, 'worker-management-scope-invalid', '管理操作缺少根任务范围。', 500);
    const receiptArgs = kind === 'create'
      ? { name: args.name, persona: args.persona, connectionId: args.connectionId }
      : { workerId: args.workerId, patch: Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'workerId')) };
    const key = this.operationKey(operationId, kind, scope.rootTaskId);
    const receipt = this.findReceipt(key, scope.rootTaskId, kind, digest(receiptArgs));
    requireValue(receipt, 'worker-operation-receipt-missing', '操作成功回执缺失，拒绝重放副作用。', 500);
    this.assertReceiptStillAuthorized(scope, receipt.bot_id, kind === 'create' ? receipt.response_json : null);
    return JSON.parse(receipt.response_json) as Record<string, unknown>;
  }

  ownerCreate(operationId: unknown, name: unknown, persona: unknown, connectionId: unknown) {
    const policy = this.policy(), scope = { rootTaskId: null, mainBotId: mainBotId(this.storage.db), policy };
    requireValue(policy.enabled, 'worker-management-disabled', '请先启用工作 Bot 对话管理策略。', 409);
    // Owner-created targets are authorized by the same explicit policy and idempotent operation path.
    return this.create(scope, text(operationId, '操作 ID', 128), name, persona, connectionId);
  }

  ownerUpdate(operationId: unknown, workerId: unknown, patch: Record<string, unknown>) {
    const mainId = mainBotId(this.storage.db), id = text(workerId, '工作 Bot ID', 64);
    requireValue(id !== mainId, 'worker-management-target-forbidden', '不能通过工作 Bot 接口修改主 Bot。', 403);
    const key = this.operationKey(text(operationId, '操作 ID', 128), 'update', `owner:${mainId}`);
    requireValue(Object.keys(patch).every((field) => field === 'name' || field === 'persona'),
      'invalid-worker-fields', '工作 Bot 修改只允许名称和身份提示。');
    const argsHash = digest({ workerId: id, patch });
    const replay = this.findReceipt(key, null, 'update', argsHash);
    if (replay) {
      requireValue(!!this.storage.db.prepare('SELECT id FROM bots WHERE id=? AND id<>?').get(id, mainId),
        'not-found', '工作 Bot 不存在。', 404);
      return JSON.parse(replay.response_json) as Record<string, unknown>;
    }
    const current = this.storage.db.prepare('SELECT id,name,persona,config_revision FROM bots WHERE id=? AND id<>?')
      .get(id, mainId) as { id: string; name: string; persona: string; config_revision: number } | undefined;
    requireValue(current, 'not-found', '工作 Bot 不存在。', 404);
    const identity = validateBotIdentityPatch(current, patch);
    const changed = current.name !== identity.name || current.persona !== identity.persona, at = stamp();
    const response = { id, name: identity.name, persona: identity.persona, role: 'work',
      configRevision: current.config_revision + Number(changed) };
    this.storage.transaction(() => {
      const result = this.storage.db.prepare(`UPDATE bots SET name=?,persona=?,updated_at=?,config_revision=config_revision+?
        WHERE id=? AND id<>? AND config_revision=?`).run(identity.name, identity.persona, at, Number(changed), id, mainId, current.config_revision);
      requireValue(result.changes === 1, 'worker-config-conflict', '工作 Bot 配置已变化，请重新读取后重试。', 409);
      this.storage.db.prepare(`INSERT INTO worker_management_operations(operation_id,root_task_id,kind,arguments_hash,bot_id,response_json,created_at)
        VALUES(?,NULL,'update',?,?,?,?)`).run(key, argsHash, id, JSON.stringify(response), at);
    });
    return response;
  }

  private operationKey(operationId: string, kind: string, rootTaskId: string) {
    requireValue(operationId.length > 0 && operationId.length <= 160 && /^[A-Za-z0-9._:-]+$/u.test(operationId),
      'invalid-operation-id', '操作 ID 格式无效。');
    return `${kind}:${rootTaskId}:${operationId}`;
  }
  private findReceipt(key: string, rootId: string | null, kind: string, argsHash: string) {
    const row = this.storage.db.prepare('SELECT * FROM worker_management_operations WHERE operation_id=?').get(key) as
      { root_task_id: string | null; kind: string; arguments_hash: string; bot_id: string; response_json: string } | undefined;
    if (!row) return null;
    requireValue(row.root_task_id === rootId && row.kind === kind && row.arguments_hash === argsHash,
      'idempotency-conflict', '此操作 ID 已用于其他参数或操作。', 409);
    return row;
  }
  private assertReceiptStillAuthorized(scope: WorkerManagementScope, botId: string, responseJson: string | null) {
    this.assertCurrent(scope);
    let targetAllowed = this.allowedTargets(scope).includes(botId);
    if (responseJson) {
      const response = JSON.parse(responseJson) as { connectionId?: unknown };
      if (typeof response.connectionId === 'string') {
        if (!scope.rootTaskId) targetAllowed = true;
        const grant = this.storage.db.prepare(`SELECT connection_id FROM delegation_grants
          WHERE main_bot_id=? AND worker_bot_id=? AND revoked_at IS NULL`).get(scope.mainBotId, botId) as { connection_id: string } | undefined;
        requireValue(grant?.connection_id === response.connectionId && this.connections.status(response.connectionId, botId).status === 'available',
          'delegation-grant-revoked', '操作创建的工作 Bot 连接授权已撤销。', 409);
      }
    }
    requireValue(targetAllowed, 'worker-management-target-forbidden', '此操作结果已不在当前管理范围内。', 403);
  }
  private availableSlug(name: string) {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 48) || 'worker';
    for (let attempt = 0; attempt < 32; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${randomUUID().slice(0, 8)}`;
      if (!this.storage.db.prepare('SELECT id FROM bots WHERE slug=?').get(slug)) return slug;
    }
    throw new BotError('worker-slug-unavailable', '无法分配工作 Bot 标识。', 500);
  }
}
