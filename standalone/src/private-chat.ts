import { randomUUID } from 'node:crypto';
import type { Storage } from './storage.ts';
import type { ModelConfig } from './model.ts';
import type { CodexAuth } from './codex-auth.ts';
import { TaskStore } from './task-store.ts';
import { BotError, requireValue, text } from './errors.ts';

export type ModelSelection =
  | { kind: 'global'; modelId: string }
  | { kind: 'local'; modelId: string }
  | { kind: 'connection'; connectionId: string; modelId: string };

function selection(value: unknown): ModelSelection {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'invalid-model-selection', '模型选择无效。');
  const item = value as Record<string, unknown>;
  if (item.kind === 'local' || item.kind === 'global') {
    requireValue(Object.keys(item).every((key) => ['kind', 'modelId'].includes(key)), 'invalid-model-selection', '模型选择字段无效。');
    return { kind: item.kind, modelId: text(item.modelId, '模型 ID', 160) };
  }
  requireValue(item.kind === 'connection' && Object.keys(item).every((key) => ['kind', 'connectionId', 'modelId'].includes(key)),
    'invalid-model-selection', '模型选择字段无效。');
  return { kind: 'connection', connectionId: text(item.connectionId, '连接 ID', 64), modelId: text(item.modelId, '模型 ID', 160) };
}

/** Persistence and authorization boundary for employee private chat. */
export class PrivateChat {
  storage: Storage;
  auth: CodexAuth;
  constructor(storage: Storage, auth: CodexAuth) {
    this.storage = storage;
    this.auth = auth;
  }

  private state(botId: string) {
    return this.storage.db.prepare('SELECT * FROM private_chat_state WHERE bot_id=?').get(botId) as
      { bot_id: string; conversation_id: string | null; selection_json: string | null; updated_at: string } | undefined;
  }

  private initialSelection(botId: string): ModelSelection | null {
    const row = this.storage.db.prepare('SELECT config_json,provider FROM model_account WHERE singleton=1').get() as {config_json:string;provider:string};
    const model = (JSON.parse(row.config_json) as ModelConfig).model;
    return model ? { kind: 'global', modelId: model } : null;
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
      let selected = state?.selection_json ? JSON.parse(state.selection_json) as ModelSelection : null;
      if (!selected) {
        selected = this.initialSelection(botId);
        if (selected) db.prepare('UPDATE private_chat_state SET selection_json=?,updated_at=? WHERE bot_id=?')
          .run(JSON.stringify(selected), new Date().toISOString(), botId);
      }
      return { botId, conversation: { id: conversation.id, botId, title: conversation.title, createdAt: conversation.created_at },
        selection: selected };
    });
  }

  listModels(botId: string) {
    const db = this.storage.db;
    const row = db.prepare('SELECT config_json,provider,oauth_credential,credential,migration_state FROM model_account WHERE singleton=1').get() as
      {config_json:string;provider:string;oauth_credential:string|null;credential:string|null;migration_state:string};
    const local = JSON.parse(row.config_json) as ModelConfig;
    const options: { selection: ModelSelection; provider: string; model: string; label: string; status: string }[] = [];
    const status = this.auth.status('@owner');
    if (local.model) {
      if (local.provider === 'openai-codex') {
        for (const model of status.models) options.push({ selection: { kind: 'global', modelId: model.id }, provider: 'openai-codex',
          model: model.id, label: `Codex · ${model.name}`, status: status.signedIn ? model.status : 'not-signed-in' });
      } else if (row.credential || local.keyless) options.push({ selection: { kind: 'global', modelId: local.model }, provider: 'compatible',
        model: local.model, label: `模型账户 · ${local.model}`, status: 'available' });
    }
    const state = this.state(botId);
    return { botId, items: options, selected: state?.selection_json ? JSON.parse(state.selection_json) as ModelSelection : this.initialSelection(botId),
      migrationState: row.migration_state };
  }

  resolve(botId: string, value?: unknown) {
    const selected = value === undefined ? (this.state(botId)?.selection_json
      ? JSON.parse(this.state(botId)!.selection_json!) as ModelSelection : this.initialSelection(botId)) : selection(value);
    requireValue(selected, 'model-selection-required', '请先在发送区选择模型，或在设置中保存明确选择。', 409);
    const db = this.storage.db;
    requireValue(selected.kind === 'global', 'model-account-only', '所有员工共用全局模型账户；请在账户设置中选择模型。', 409);
    const account = db.prepare('SELECT config_json,credential,epoch,migration_state FROM model_account WHERE singleton=1').get() as
      {config_json:string;credential:string|null;epoch:number;migration_state:string};
    requireValue(account.migration_state !== 'selection-required', 'model-account-selection-required', '请选择要保留的已有模型账户。', 409);
    const configured = JSON.parse(account.config_json) as ModelConfig;
    let config = configured;
    if (config.provider === 'openai-codex') {
      const auth = this.auth.status('@owner');
      requireValue(auth.signedIn, 'codex-not-signed-in', '请先完成全局模型账户登录。', 409);
      requireValue(auth.models.some((item) => item.id === selected.modelId), 'model-not-authorized', '所选模型不在当前 SDK 目录中。', 403);
      config = { ...configured, model: selected.modelId };
    } else {
      requireValue(configured.model === selected.modelId, 'model-not-authorized', '所选模型不在全局模型账户目录中。', 403);
      requireValue(account.credential || configured.keyless, 'model-credential-missing', '请先私密设置全局模型凭据。', 409);
    }
    return { selection: selected, config, sourceBotId: '@owner', sourceModelEpoch: account.epoch,
      connectionId: null as string | null, credential: account.credential };
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
