import { AsyncLocalStorage } from 'node:async_hooks';
import type { Storage } from './storage.ts';
import { BotError, requireValue, text } from './errors.ts';
import { TaskStore, type Task, type TaskStatus } from './task-store.ts';
import type { BrowserTask, BrowserTaskAdapter } from './browser-service.ts';

type ExecutorContext = Readonly<{ botId: string; taskId: string }>;

/** Adapts the browser module to canonical SQLite tasks and trusted executor context. */
export class BrowserTaskAdapterImpl implements BrowserTaskAdapter {
  storage: Storage;
  tasks: TaskStore;
  currentExecutor = new AsyncLocalStorage<ExecutorContext>();
  currentOwner = new AsyncLocalStorage<true>();

  constructor(storage: Storage, tasks: TaskStore) {
    this.storage = storage;
    this.tasks = tasks;
  }

  assertOwnerBot(botId: string) {
    requireValue(this.currentOwner.getStore() === true, 'forbidden', '此浏览器操作仅限已认证所有者。', 403);
    requireValue(!!this.storage.db.prepare('SELECT id FROM bots WHERE id=?').get(text(botId, 'Bot ID', 64)),
      'not-found', 'Bot 不存在。', 404);
  }

  createOwnerRootTask(input: { botId: string; idempotencyKey: string; deadlineAt: string }): BrowserTask {
    const botId = text(input.botId, 'Bot ID', 64);
    const idempotencyKey = text(input.idempotencyKey, '操作 ID', 128);
    this.assertOwnerBot(botId);
    const bot = this.storage.db.prepare('SELECT name,persona,config_revision FROM bots WHERE id=?').get(botId) as
      { name: string; persona: string; config_revision: number };
    const requestKey = `browser-owner:${idempotencyKey}`;
    const created = this.tasks.createRoot({
      executorBotId: botId,
      initiatorBotId: botId,
      requestKey,
      input: 'Owner opened an authorized browser session.',
      configRevision: bot.config_revision,
      configSnapshot: JSON.stringify({ kind: 'direct-browser', name: bot.name, persona: bot.persona }),
      deadlineAt: input.deadlineAt,
      at: new Date().toISOString(),
    });
    if (created.task.status === 'queued') this.tasks.begin(created.task.id, new Date().toISOString());
    return this.toBrowserTask(this.tasks.get(created.task.id));
  }

  finishOwnerRootTask(taskId: string, status: 'completed' | 'cancelled' | 'interrupted', code: string) {
    const task = this.tasks.get(text(taskId, '任务 ID', 64));
    requireValue(task.parent_id === null && task.root_id === task.id && task.request_key.startsWith('browser-owner:'),
      'browser-task-scope-denied', '该任务不是所有者浏览器任务。', 403);
    this.tasks.finish(task.id, status, null, status === 'completed' ? null : text(code, '错误码', 80), new Date().toISOString());
  }

  interruptTask(taskId: string, code: 'browser-step-interrupted') {
    const task = this.tasks.get(text(taskId, '任务 ID', 64));
    requireValue(task.parent_id !== null && task.status === 'running',
      'browser-task-scope-denied', '只有运行中的工作任务可因浏览器不确定动作中断。', 403);
    this.tasks.finish(task.id, 'interrupted', null, code, new Date().toISOString());
  }

  resolveTask(taskId: string): BrowserTask | undefined {
    const row = this.storage.db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId) as Task | undefined;
    return row ? this.toBrowserTask(row) : undefined;
  }

  isCurrentExecutorTask(botId: string, taskId: string) {
    const context = this.currentExecutor.getStore();
    if (!context || context.botId !== botId || context.taskId !== taskId) return false;
    const task = this.storage.db.prepare('SELECT executor_bot_id,status,deadline_at FROM tasks WHERE id=?').get(taskId) as
      { executor_bot_id: string; status: TaskStatus; deadline_at: string } | undefined;
    return task?.executor_bot_id === botId && task.status === 'running' && Date.parse(task.deadline_at) > Date.now();
  }

  /** Only a trusted worker runner may wrap its actual model/tool execution with this scope. */
  runAsExecutor<T>(botId: string, taskId: string, operation: () => T): T {
    const task = this.storage.db.prepare('SELECT executor_bot_id,status FROM tasks WHERE id=?').get(taskId) as
      { executor_bot_id: string; status: TaskStatus } | undefined;
    requireValue(task?.executor_bot_id === botId && task.status === 'running',
      'browser-task-scope-denied', '当前任务不属于此工作 Bot。', 403);
    return this.currentOwner.exit(() => this.currentExecutor.run(Object.freeze({ botId, taskId }), operation));
  }

  /** Only authenticated owner application entry points may grant this independent owner scope. */
  runAsOwner<T>(operation: () => T): T {
    return this.currentExecutor.exit(() => this.currentOwner.run(true, operation));
  }

  /** Model requests and their asynchronous tool loops inherit neither owner nor prior executor authority. */
  runAsUntrusted<T>(operation: () => T): T {
    return this.currentOwner.exit(() => this.currentExecutor.exit(operation));
  }

  isCurrentOwner() {
    return this.currentOwner.getStore() === true;
  }

  private toBrowserTask(task: Task): BrowserTask {
    return Object.freeze({ id: task.id, botId: task.executor_bot_id, executorBotId: task.executor_bot_id,
      parentId: task.parent_id, status: task.status, deadlineAt: task.deadline_at });
  }
}
