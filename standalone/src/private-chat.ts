import { randomUUID } from 'node:crypto';
import type { Storage } from './storage.ts';
import type { ConnectionResolver } from './connection-resolver.ts';
import type { ModelConfig } from './model.ts';
import type { CodexAuth } from './codex-auth.ts';
import { TaskStore } from './task-store.ts';
import { BotError, requireValue, text } from './errors.ts';
import { isMainBot, mainBotId } from './bot-identity.ts';

export type ModelSelection =
  | { kind: 'local'; modelId: string }
  | { kind: 'connection'; connectionId: string; modelId: string };

function selection(value: unknown): ModelSelection {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'invalid-model-selection', '模型选择无效。');
  const item = value as Record<string, unknown>;
  if (item.kind === 'local') {
    requireValue(Object.keys(item).every((key) => ['kind', 'modelId'].includes(key)), 'invalid-model-selection', '模型选择字段无效。');
    return { kind: 'local', modelId: text(item.modelId, '模型 ID', 160) };
  }
  requireValue(item.kind === 'connection' && Object.keys(item).every((key) => ['kind', 'connectionId', 'modelId'].includes(key)),
    'invalid-model-selection', '模型选择字段无效。');
  return { kind: 'connection', connectionId: text(item.connectionId, '连接 ID', 64), modelId: text(item.modelId, '模型 ID', 160) };
}

/** Persistence and authorization boundary for employee private chat. */
export class PrivateChat {
  storage: Storage;
  connections: ConnectionResolver;
  auth: CodexAuth;
  constructor(storage: Storage, connections: ConnectionResolver, auth: CodexAuth) {
    this.storage = storage;
    this.connections = connections;
    this.auth = auth;
  }

  private state(botId: string) {
    return this.storage.db.prepare('SELECT * FROM private_chat_state WHERE bot_id=?').get(botId) as
      { bot_id: string; conversation_id: string | null; selection_json: string | null; updated_at: string } | undefined;
  }

  private initialSelection(botId: string): ModelSelection | null {
    const db = this.storage.db;
    const connectionId = isMainBot(db, botId)
      ? db.prepare('SELECT connection_id FROM main_bot WHERE singleton=1').get()?.connection_id as string | null
      : (db.prepare('SELECT connection_id FROM delegation_grants WHERE main_bot_id=? AND worker_bot_id=?')
          .get(mainBotId(db), botId) as { connection_id: string } | undefined)?.connection_id ?? null;
    if (connectionId) {
      try {
        const resolved = this.connections.resolve(connectionId, botId);
        return { kind: 'connection', connectionId, modelId: resolved.config.model };
      } catch {
        const saved = db.prepare('SELECT b.config FROM model_connections c JOIN bots b ON b.id=c.source_bot_id WHERE c.id=?')
          .get(connectionId) as { config: string } | undefined;
        const model = saved ? (JSON.parse(saved.config) as ModelConfig).model : '';
        return { kind: 'connection', connectionId, modelId: model || 'unavailable' };
      }
    }
    return null;
  }

  open(botId: string) {
    const db = this.storage.db;
    return this.storage.transaction(() => {
      let state = this.state(botId);
      if (!state) {
        const recent = db.prepare(`SELECT c.id FROM conversations c LEFT JOIN runs r ON r.conversation_id=c.id
          LEFT JOIN messages m ON m.conversation_id=c.id WHERE c.bot_id=?
          GROUP BY c.id ORDER BY COALESCE(MAX(m.created_at),MAX(r.created_at),c.created_at) DESC,c.id DESC LIMIT 1`).get(botId) as { id: string } | undefined;
        const id = recent?.id ?? randomUUID();
        if (!recent) db.prepare('INSERT INTO conversations(id,bot_id,title,created_at) VALUES(?,?,?,?)')
          .run(id, botId, '私聊', new Date().toISOString());
        const selected = this.initialSelection(botId);
        db.prepare('INSERT INTO private_chat_state(bot_id,conversation_id,selection_json,updated_at) VALUES(?,?,?,?)')
          .run(botId, id, selected ? JSON.stringify(selected) : null, new Date().toISOString());
        state = this.state(botId);
      }
      let conversationId = state?.conversation_id ?? null;
      if (!conversationId || !db.prepare('SELECT id FROM conversations WHERE id=? AND bot_id=?').get(conversationId, botId)) {
        const recent = db.prepare(`SELECT c.id FROM conversations c LEFT JOIN runs r ON r.conversation_id=c.id
          LEFT JOIN messages m ON m.conversation_id=c.id WHERE c.bot_id=?
          GROUP BY c.id ORDER BY COALESCE(MAX(m.created_at),MAX(r.created_at),c.created_at) DESC,c.id DESC LIMIT 1`).get(botId) as { id: string } | undefined;
        conversationId = recent?.id ?? randomUUID();
        if (!recent) db.prepare('INSERT INTO conversations(id,bot_id,title,created_at) VALUES(?,?,?,?)')
          .run(conversationId, botId, '私聊', new Date().toISOString());
        db.prepare('UPDATE private_chat_state SET conversation_id=?,updated_at=? WHERE bot_id=?')
          .run(conversationId, new Date().toISOString(), botId);
      }
      const conversation = db.prepare('SELECT id,bot_id,title,created_at FROM conversations WHERE id=?').get(conversationId) as
        { id: string; bot_id: string; title: string; created_at: string };
      return { botId, conversation: { id: conversation.id, botId, title: conversation.title, createdAt: conversation.created_at },
        selection: state?.selection_json ? JSON.parse(state.selection_json) as ModelSelection : null };
    });
  }

  listModels(botId: string) {
    const db = this.storage.db;
    const bot = db.prepare('SELECT config,credential FROM bots WHERE id=?').get(botId) as { config: string; credential: string | null };
    const local = JSON.parse(bot.config) as ModelConfig;
    const options: { selection: ModelSelection; provider: string; model: string; label: string; status: string }[] = [];
    if (local.provider === 'openai-codex' && this.auth.status(botId).signedIn) {
      for (const model of this.auth.status(botId).models) options.push({ selection: { kind: 'local', modelId: model.id },
        provider: 'openai-codex', model: model.id, label: `Codex · ${model.name}`, status: 'available' });
    } else if (local.provider !== 'openai-codex' && local.model && local.baseUrl && (bot.credential || local.keyless)) {
      options.push({ selection: { kind: 'local', modelId: local.model }, provider: 'compatible', model: local.model,
        label: `本地连接 · ${local.model}`, status: 'available' });
    }
    const ids = new Set<string>();
    if (isMainBot(db, botId)) {
      const rows = db.prepare('SELECT id FROM model_connections c JOIN connection_grants g ON g.connection_id=c.id WHERE g.consumer_bot_id=? AND g.revoked_at IS NULL ORDER BY c.created_at,c.id')
        .all(botId) as { id: string }[];
      for (const row of rows) ids.add(row.id);
    } else {
      const grant = db.prepare('SELECT connection_id FROM delegation_grants WHERE main_bot_id=? AND worker_bot_id=? AND revoked_at IS NULL')
        .get(mainBotId(db), botId) as { connection_id: string } | undefined;
      if (grant) ids.add(grant.connection_id);
    }
    for (const id of ids) {
      let resolved;
      try { resolved = this.connections.resolve(id, botId); } catch { continue; }
      const models = resolved.config.provider === 'openai-codex'
        ? this.auth.status(resolved.sourceBotId).models.map((item) => item.id)
        : [resolved.config.model];
      const sourceName = (db.prepare('SELECT name FROM bots WHERE id=?').get(resolved.sourceBotId) as { name: string }).name;
      for (const modelId of models) options.push({ selection: { kind: 'connection', connectionId: id, modelId },
        provider: resolved.config.provider ?? 'compatible', model: modelId,
        label: `${sourceName} · ${resolved.config.provider ?? 'compatible'} · ${modelId}`, status: 'available' });
    }
    const state = this.state(botId);
    return { botId, items: options, selected: state?.selection_json ? JSON.parse(state.selection_json) as ModelSelection : null };
  }

  resolve(botId: string, value?: unknown) {
    const selected = value === undefined ? (this.state(botId)?.selection_json
      ? JSON.parse(this.state(botId)!.selection_json!) as ModelSelection : this.initialSelection(botId)) : selection(value);
    requireValue(selected, 'model-selection-required', '请先在发送区选择模型，或在设置中保存明确选择。', 409);
    const db = this.storage.db;
    if (selected.kind === 'connection') {
      if (!isMainBot(db, botId)) {
        const grant = db.prepare(`SELECT connection_id FROM delegation_grants WHERE main_bot_id=? AND worker_bot_id=? AND revoked_at IS NULL`)
          .get(mainBotId(db), botId) as { connection_id: string } | undefined;
        requireValue(grant?.connection_id === selected.connectionId, 'connection-not-found',
          '此工作 Bot 未获该连接的直接私聊授权。', 403);
      }
      const reference = this.connections.resolve(selected.connectionId, botId);
      const model = reference.config.provider === 'openai-codex'
        ? this.auth.status(reference.sourceBotId).models.some((item) => item.id === selected.modelId)
        : reference.config.model === selected.modelId;
      requireValue(model, 'model-not-authorized', '所选模型不在此连接的允许目录中。', 403);
      return { selection: selected, config: { ...reference.config, model: selected.modelId }, sourceBotId: reference.sourceBotId,
        sourceModelEpoch: reference.sourceModelEpoch, connectionId: selected.connectionId, credential: reference.credential };
    }
    const bot = db.prepare('SELECT config,credential FROM bots WHERE id=?').get(botId) as { config: string; credential: string | null };
    const config = JSON.parse(bot.config) as ModelConfig;
    if (config.provider === 'openai-codex') {
      requireValue(this.auth.status(botId).signedIn && this.auth.status(botId).models.some((item) => item.id === selected.modelId),
        'model-not-authorized', '所选 Codex 模型不在当前 SDK 目录中或账号未登录。', 403);
    } else requireValue(config.model === selected.modelId, 'model-not-authorized', '兼容 API 只允许选择已配置模型。', 403);
    return { selection: selected, config: { ...config, model: selected.modelId }, sourceBotId: botId,
      sourceModelEpoch: Number(db.prepare('SELECT model_epoch FROM bots WHERE id=?').get(botId)?.model_epoch),
      connectionId: null as string | null, credential: bot.credential };
  }

  selectModel(botId: string, value: unknown) {
    const resolved = this.resolve(botId, value);
    this.storage.db.prepare(`INSERT INTO private_chat_state(bot_id,conversation_id,selection_json,updated_at)
      VALUES(?,NULL,?,?) ON CONFLICT(bot_id) DO UPDATE SET selection_json=excluded.selection_json,updated_at=excluded.updated_at`)
      .run(botId, JSON.stringify(resolved.selection), new Date().toISOString());
    return this.listModels(botId);
  }

  selectConversation(botId: string, conversationIdInput: unknown) {
    this.open(botId);
    const conversationId = text(conversationIdInput, 'Conversation ID', 64);
    const exists = this.storage.db.prepare('SELECT id,title,created_at FROM conversations WHERE bot_id=? AND id=?').get(botId, conversationId) as
      { id: string; title: string; created_at: string } | undefined;
    requireValue(exists, 'not-found', '此 Bot 的历史对话不存在。', 404);
    this.storage.db.prepare(`INSERT INTO private_chat_state(bot_id,conversation_id,selection_json,updated_at)
      VALUES(?,?,NULL,?) ON CONFLICT(bot_id) DO UPDATE SET conversation_id=excluded.conversation_id,updated_at=excluded.updated_at`)
      .run(botId, conversationId, new Date().toISOString());
    return { botId, conversation: { id: exists.id, botId, title: exists.title, createdAt: exists.created_at } };
  }

  timeline(botId: string, conversationId: string, params: Record<string, unknown>, storage: Storage,
    pageSize: (value: unknown) => number) {
    const limit = pageSize(params.limit);
    const direction = params.direction === undefined ? 'forward' : params.direction;
    requireValue(direction === 'forward' || direction === 'backward', 'invalid-direction', '时间线方向无效。');
    const scope = `private-timeline:${botId}:${conversationId}:${direction}`;
    let after: { createdAt: string; id: string } | null = null;
    const encoded = storage.keysetAfter(params.cursor, scope);
    if (encoded) {
      try { const parsed = JSON.parse(encoded) as { createdAt?: unknown; id?: unknown };
        requireValue(typeof parsed.createdAt === 'string' && typeof parsed.id === 'string', 'invalid-cursor', '时间线游标无效。');
        after = { createdAt: parsed.createdAt, id: parsed.id };
      } catch { throw new BotError('invalid-cursor', '时间线游标无效，请从第一页重新读取。'); }
    }
    const db = storage.db;
    const afterSql = after ? `WHERE created_at${direction === 'forward' ? '>' : '<'}? OR (created_at=? AND id${direction === 'forward' ? '>' : '<'}?)` : '';
    const values: (string | number)[] = [botId, conversationId, botId, conversationId];
    if (after) values.push(after.createdAt, after.createdAt, after.id);
    values.push(limit + 1);
    const rows = db.prepare(`SELECT * FROM (
      SELECT 'message:'||m.id AS id,'message' AS type,m.created_at AS created_at,m.id AS message_id,m.run_id AS run_id,
        m.role AS role,m.content AS content,NULL AS task_id,NULL AS root_id,NULL AS parent_id,NULL AS initiator_bot_id,
        NULL AS executor_bot_id,NULL AS status,NULL AS error_code,NULL AS finished_at,NULL AS config_snapshot
      FROM messages m WHERE m.bot_id=? AND m.conversation_id=?
      UNION ALL
      SELECT 'task:'||t.id,'task',t.created_at,NULL,r.id,NULL,NULL,t.id,t.root_id,t.parent_id,t.initiator_bot_id,
        t.executor_bot_id,t.status,t.error_code,t.finished_at,t.config_snapshot
      FROM tasks t JOIN runs r ON r.task_id=t.root_id WHERE r.bot_id=? AND r.conversation_id=? AND t.parent_id IS NOT NULL
    ) ${afterSql} ORDER BY created_at ${direction === 'forward' ? 'ASC' : 'DESC'},id ${direction === 'forward' ? 'ASC' : 'DESC'} LIMIT ?`).all(...values) as {
      id: string; type: 'message' | 'task'; created_at: string; message_id: string | null; run_id: string | null;
      role: string | null; content: string | null; task_id: string | null; root_id: string | null; parent_id: string | null;
      initiator_bot_id: string | null; executor_bot_id: string | null; status: string | null; error_code: string | null;
      finished_at: string | null; config_snapshot: string | null;
    }[];
    const hasMore = rows.length > limit, page = rows.slice(0, limit);
    if (direction === 'backward') page.reverse();
    const items = page.map((row) => row.type === 'message'
      ? { id: row.id, type: row.type, createdAt: row.created_at, message: { id: row.message_id!, runId: row.run_id!,
        role: row.role!, content: row.content!, createdAt: row.created_at } }
      : { id: row.id, type: row.type, createdAt: row.created_at, task: { id: row.task_id!, rootId: row.root_id!,
        parentId: row.parent_id!, initiatorBotId: row.initiator_bot_id!, executorBotId: row.executor_bot_id!,
        status: row.status!, errorCode: row.error_code, createdAt: row.created_at, finishedAt: row.finished_at,
        runId: row.run_id!, sourceBotId: (JSON.parse(row.config_snapshot ?? '{}') as { sourceBotId?: string }).sourceBotId ?? null } });
    const last = page.at(-1);
    const cursorRow = direction === 'backward' ? page[0] : last;
    return { botId, conversationId, direction, items, hasMore, nextCursor: hasMore && cursorRow
      ? storage.keysetCursor(scope, JSON.stringify({ createdAt: cursorRow.created_at, id: cursorRow.id })) : null };
  }

  taskDetail(botId: string, conversationId: string, taskIdInput: unknown) {
    const taskId = text(taskIdInput, '任务 ID', 64);
    const row = this.storage.db.prepare(`SELECT t.root_id FROM tasks t JOIN runs r ON r.task_id=t.root_id
      WHERE r.bot_id=? AND r.conversation_id=? AND t.id=? AND t.parent_id IS NOT NULL`).get(botId, conversationId, taskId);
    requireValue(row, 'task-not-found', '此对话中不存在该协作任务。', 404);
    const store = new TaskStore(this.storage);
    const items = store.byRoot((row as { root_id: string }).root_id).map((task) => store.public(task));
    return { botId, conversationId, root: items[0], items };
  }
}

export { selection as parseModelSelection };
