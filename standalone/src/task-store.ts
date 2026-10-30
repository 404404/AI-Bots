import { createHash, randomUUID } from 'node:crypto';
import type { Storage } from './storage.ts';
import { BotError, requireValue, text } from './errors.ts';

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type Task = {
  seq: number; id: string; root_id: string; parent_id: string | null; initiator_bot_id: string;
  executor_bot_id: string; request_key: string; input_hash: string; input: string; status: TaskStatus;
  result: string | null; error_code: string | null; connection_id: string | null; config_revision: number;
  config_snapshot: string | null; memory_snapshot: string | null;
  created_at: string; started_at: string | null; finished_at: string | null; deadline_at: string;
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
const time = (value: string) => new Date(value).getTime();

/** Canonical SQLite authority for task ancestry, idempotency, tools and terminal state. */
export class TaskStore {
  storage: Storage;
  constructor(storage: Storage) { this.storage = storage; }

  rootByRequest(initiatorBotId: string, requestKey: string) {
    return this.storage.db.prepare('SELECT * FROM tasks WHERE parent_id IS NULL AND initiator_bot_id=? AND request_key=?')
      .get(initiatorBotId, requestKey) as Task | undefined;
  }

  createRoot(args: { executorBotId: string; initiatorBotId: string; requestKey: string; input: string; connectionId?: string; connectionEpoch?: number; configRevision: number; configSnapshot?: string; memorySnapshot?: string; deadlineAt: string; at: string }) {
    const db = this.storage.db, inputHash = hash(canonical({ input: args.input, executorBotId: args.executorBotId,
      connectionId: args.connectionId ?? null, connectionEpoch: args.connectionEpoch ?? null, configRevision: args.configRevision }));
    const existing = this.rootByRequest(args.initiatorBotId, args.requestKey);
    if (existing) {
      requireValue(existing.input_hash === inputHash && existing.executor_bot_id === args.executorBotId && existing.connection_id === (args.connectionId ?? null) && existing.config_revision === args.configRevision, 'idempotency-conflict', '相同任务 ID 不能用于不同输入、执行者、连接或配置版本。', 409);
      return { task: existing, replayed: true };
    }
    const id = randomUUID();
    db.prepare(`INSERT INTO tasks(id,root_id,initiator_bot_id,executor_bot_id,request_key,input_hash,input,status,connection_id,config_revision,created_at,deadline_at,config_snapshot,memory_snapshot)
      VALUES(?,?,?, ?,?,?,?,'queued',?,?,?, ?,?,?)`).run(id, id, args.initiatorBotId, args.executorBotId, args.requestKey, inputHash, args.input, args.connectionId ?? null, args.configRevision, args.at, args.deadlineAt, args.configSnapshot ?? null, args.memorySnapshot ?? null);
    return { task: this.get(id), replayed: false };
  }

  createChild(args: { rootId: string; parentId: string; initiatorBotId: string; executorBotId: string; requestKey: string; input: string; connectionId: string; configRevision: number; configSnapshot: string; memorySnapshot: string; deadlineAt: string; at: string }) {
    const input = text(args.input, '任务内容', 12000);
    requireValue(time(args.deadlineAt) > time(args.at), 'task-deadline-exceeded', '任务截止时间已到。', 409);
    const snapshot = JSON.parse(args.configSnapshot) as { sourceModelEpoch?: number };
    const inputHash = hash(canonical({ input, rootId: args.rootId, parentId: args.parentId,
      executorBotId: args.executorBotId, connectionId: args.connectionId, connectionEpoch: snapshot.sourceModelEpoch ?? null, configRevision: args.configRevision }));
    const existing = this.storage.db.prepare('SELECT * FROM tasks WHERE parent_id=? AND request_key=?').get(args.parentId, args.requestKey) as Task | undefined;
    if (existing) {
      requireValue(existing.input_hash === inputHash && existing.executor_bot_id === args.executorBotId && existing.connection_id === args.connectionId && existing.config_revision === args.configRevision, 'idempotency-conflict', '相同工具调用不能用于不同任务、连接或配置版本。', 409);
      return { task: existing, replayed: true };
    }
    const id = randomUUID();
    this.storage.db.prepare(`INSERT INTO tasks(id,root_id,parent_id,initiator_bot_id,executor_bot_id,request_key,input_hash,input,status,connection_id,config_revision,created_at,deadline_at,config_snapshot,memory_snapshot)
      VALUES(?,?,?,?,?,?,?,?,'queued',?,?,?,?,?,?)`).run(id, args.rootId, args.parentId, args.initiatorBotId, args.executorBotId, args.requestKey, inputHash, input, args.connectionId, args.configRevision, args.at, args.deadlineAt, args.configSnapshot, args.memorySnapshot);
    return { task: this.get(id), replayed: false };
  }

  begin(id: string, at: string) {
    requireValue(time(this.get(id).deadline_at) > time(at), 'task-deadline-exceeded', '任务截止时间已到。', 504);
    return this.storage.db.prepare("UPDATE tasks SET status='running',started_at=? WHERE id=? AND status='queued'").run(at, id).changes === 1;
  }
  finish(id: string, status: Extract<TaskStatus, 'completed' | 'failed' | 'cancelled' | 'interrupted'>, result: string | null, code: string | null, at: string) {
    return this.storage.db.prepare("UPDATE tasks SET status=?,result=?,error_code=?,finished_at=? WHERE id=? AND status IN ('queued','running')").run(status, result, code, at, id).changes === 1;
  }
  finishChild(rootId: string, id: string, result: string, at: string) {
    return this.storage.db.prepare(`UPDATE tasks SET status='completed',result=?,finished_at=?
      WHERE id=? AND parent_id=? AND status='running'
        AND EXISTS(SELECT 1 FROM tasks WHERE id=? AND status='running')`).run(result, at, id, rootId, rootId).changes === 1;
  }
  beginTool(taskId: string, callId: string, name: string, argsJson: string, at: string) {
    const digest = hash(canonical(JSON.parse(argsJson))), db = this.storage.db;
    const existing = db.prepare('SELECT * FROM task_tool_calls WHERE task_id=? AND tool_call_id=?').get(taskId, callId) as { arguments_hash: string; tool_name: string; status: string; result: string | null; error_code: string | null } | undefined;
    if (existing) {
      requireValue(existing.arguments_hash === digest && name === existing.tool_name, 'tool-call-id-conflict', '工具调用 ID 已绑定其他参数。', 409);
      requireValue(existing.status !== 'running', 'tool-call-in-progress', '此工具调用仍在执行，拒绝重复副作用。', 409);
      return { replayed: true, budgetExceeded: existing.error_code === 'tool-budget-exceeded', result: existing.result, errorCode: existing.error_code };
    }
    const count = Number(db.prepare(`SELECT count(*) AS n FROM task_tool_calls tc
      JOIN tasks t ON t.id=tc.task_id WHERE t.root_id=(SELECT root_id FROM tasks WHERE id=?)
        AND COALESCE(tc.error_code,'')<>'tool-budget-exceeded'`).get(taskId)?.n);
    if (count >= 8) {
      db.prepare(`INSERT INTO task_tool_calls(task_id,tool_call_id,tool_name,arguments_hash,status,error_code,created_at,finished_at)
        VALUES(?,?,?,?,'failed','tool-budget-exceeded',?,?)`).run(taskId, callId, name.slice(0, 100), digest, at, at);
      return { replayed: false as const, budgetExceeded: true, result: null, errorCode: 'tool-budget-exceeded' };
    }
    db.prepare("INSERT INTO task_tool_calls(task_id,tool_call_id,tool_name,arguments_hash,status,created_at) VALUES(?,?,?,?,'running',?)").run(taskId, callId, name.slice(0, 100), digest, at);
    return { replayed: false as const, budgetExceeded: false, result: null, errorCode: null };
  }
  finishTool(taskId: string, callId: string, result: string | null, errorCode: string | null, at: string) {
    this.storage.db.prepare("UPDATE task_tool_calls SET status=?,result=?,error_code=?,finished_at=? WHERE task_id=? AND tool_call_id=? AND status='running'").run(errorCode ? 'failed' : 'completed', result, errorCode, at, taskId, callId);
  }
  toolError(taskId: string, callId: string) {
    return (this.storage.db.prepare('SELECT error_code FROM task_tool_calls WHERE task_id=? AND tool_call_id=?').get(taskId, callId) as { error_code: string | null } | undefined)?.error_code ?? null;
  }
  get(id: string): Task {
    const row = this.storage.db.prepare('SELECT * FROM tasks WHERE id=?').get(id) as Task | undefined;
    requireValue(row, 'task-not-found', '任务不存在。', 404);
    return row;
  }
  byRoot(rootId: string) {
    return this.storage.db.prepare('SELECT * FROM tasks WHERE root_id=? ORDER BY seq').all(rootId) as Task[];
  }
  setMemorySnapshot(id: string, manifest: { path: string; revision: string }[]) {
    this.storage.db.prepare('UPDATE tasks SET memory_snapshot=? WHERE id=?').run(JSON.stringify(manifest), id);
  }
  cancel(id: string, at: string) {
    const db = this.storage.db;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare("UPDATE tasks SET status='cancelled',result=NULL,error_code='cancelled',finished_at=? WHERE root_id=? AND status IN ('queued','running')").run(at, this.get(id).root_id);
      db.prepare("UPDATE task_tool_calls SET status='cancelled',result=NULL,error_code='cancelled',finished_at=? WHERE task_id IN (SELECT id FROM tasks WHERE root_id=?) AND status='running'").run(at, this.get(id).root_id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return this.get(id);
  }
  cancelOne(id: string, at: string) {
    const db = this.storage.db;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare("UPDATE tasks SET status='cancelled',result=NULL,error_code='cancelled',finished_at=? WHERE id=? AND status IN ('queued','running')").run(at, id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return this.get(id);
  }
  recover(at: string) {
    const db = this.storage.db;
    db.exec('BEGIN IMMEDIATE');
    try {
      const tasks = db.prepare("UPDATE tasks SET status='interrupted',result=NULL,error_code='process-interrupted',finished_at=? WHERE status IN ('queued','running')").run(at).changes;
      db.prepare("UPDATE task_tool_calls SET status='failed',result=NULL,error_code='process-interrupted',finished_at=? WHERE status='running'").run(at);
      db.exec('COMMIT');
      return tasks;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  public(task: Task) {
    const snapshot = task.config_snapshot ? JSON.parse(task.config_snapshot) as Record<string, unknown> : null;
    const model = snapshot?.model && typeof snapshot.model === 'object'
      ? snapshot.model as Record<string, unknown> : null;
    const configSnapshot = snapshot ? {
      ...(typeof snapshot.name === 'string' ? { name: snapshot.name } : {}),
      ...(typeof snapshot.persona === 'string' ? { persona: snapshot.persona } : {}),
      ...(model ? { model: Object.fromEntries(['provider', 'baseUrl', 'model', 'proxyUrl', 'keyless']
        .filter((key) => model[key] !== undefined).map((key) => [key, model[key]])) } : {}),
      ...(snapshot.connection && typeof snapshot.connection === 'object' ? { connection: snapshot.connection } : {}),
      ...(Array.isArray(snapshot.delegations) ? { delegations: snapshot.delegations } : {}),
      ...(snapshot.workerManagement && typeof snapshot.workerManagement === 'object' ? { workerManagement: snapshot.workerManagement } : {}),
      ...(typeof snapshot.sourceBotId === 'string' ? { sourceBotId: snapshot.sourceBotId } : {}),
      ...(typeof snapshot.sourceModelEpoch === 'number' ? { sourceModelEpoch: snapshot.sourceModelEpoch } : {}),
    } : null;
    const memory = task.memory_snapshot ? JSON.parse(task.memory_snapshot) as unknown : [];
    const memoryManifest = Array.isArray(memory) ? memory.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const file = entry as Record<string, unknown>;
      return typeof file.path === 'string' && typeof file.revision === 'string'
        ? [{ path: file.path, revision: file.revision }] : [];
    }) : [];
    return { id: task.id, rootId: task.root_id, parentId: task.parent_id, initiatorBotId: task.initiator_bot_id,
      executorBotId: task.executor_bot_id, idempotencyKey: task.request_key.startsWith('direct:') ? task.request_key.slice(7) : task.request_key, input: task.input, status: task.status,
      result: task.result, errorCode: task.error_code, connectionId: task.connection_id, configRevision: task.config_revision,
      configSnapshot, memoryManifest,
      createdAt: task.created_at, startedAt: task.started_at, finishedAt: task.finished_at, deadlineAt: task.deadline_at };
  }
}
