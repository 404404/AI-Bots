import { createHash, randomUUID } from 'node:crypto';
import type { Storage } from './storage.ts';
import { BotError, requireValue, text } from './errors.ts';

/** Standalone schema 12 Bot-to-Bot message and response tables. */
export const BotMessagingSql = `
CREATE TABLE IF NOT EXISTS bot_message_threads (
  id TEXT PRIMARY KEY, bot_a_id TEXT NOT NULL REFERENCES bots(id), bot_b_id TEXT NOT NULL REFERENCES bots(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revoked_at TEXT,
  CHECK(bot_a_id < bot_b_id), UNIQUE(bot_a_id,bot_b_id)
);
CREATE TABLE IF NOT EXISTS bot_messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
  thread_id TEXT NOT NULL REFERENCES bot_message_threads(id),
  sender_bot_id TEXT NOT NULL REFERENCES bots(id), recipient_bot_id TEXT NOT NULL REFERENCES bots(id),
  reply_to_message_id TEXT REFERENCES bot_messages(id), task_id TEXT REFERENCES tasks(id),
  source_run_id TEXT REFERENCES runs(id), source_conversation_id TEXT REFERENCES conversations(id), tool_call_id TEXT,
  idempotency_hash TEXT,
  body TEXT NOT NULL, created_at TEXT NOT NULL,
  CHECK(sender_bot_id <> recipient_bot_id), UNIQUE(task_id,tool_call_id)
);
CREATE INDEX IF NOT EXISTS bot_messages_thread_order ON bot_messages(thread_id,seq);
CREATE TABLE IF NOT EXISTS bot_message_turns (
  id TEXT PRIMARY KEY, incoming_message_id TEXT NOT NULL UNIQUE REFERENCES bot_messages(id),
  thread_id TEXT NOT NULL REFERENCES bot_message_threads(id), recipient_bot_id TEXT NOT NULL REFERENCES bots(id),
  status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','interrupted')),
  error_code TEXT, created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT
);
CREATE INDEX IF NOT EXISTS bot_message_turns_queue ON bot_message_turns(status,created_at);
`;

export type MessageActor = { kind: 'owner' };
export type BotMessage = { seq: number; id: string; threadId: string; senderBotId: string; recipientBotId: string; replyToMessageId: string | null; taskId: string | null; sourceRunId: string | null; sourceConversationId: string | null; body: string; createdAt: string };
type ThreadRow = { id: string; bot_a_id: string; bot_b_id: string; revoked_at: string | null; created_at: string; updated_at: string };
type TurnRow = { id: string; incoming_message_id: string; thread_id: string; recipient_bot_id: string; status: string; created_at: string };
type ContextMessage = { senderBotId: string; recipientBotId: string; body: string; createdAt: string };
export type BotMessageExecutor = (input: { botId: string; threadId: string; incomingMessageId: string; incomingBody: string; history: ContextMessage[]; signal: AbortSignal }) => Promise<string>;
export type TaskToolAuthority = { resolve(scope: unknown, args: { threadId: string; body: string }): { taskId: string; toolCallId: string } };

const MAX_BODY = 8_000;
const MAX_HISTORY = 12;
const MAX_CONTEXT_CHARS = 24_000;
const MAX_PENDING_PER_BOT = 20;
const MAX_CONCURRENT = 2;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const isRevoked = (row: ThreadRow) => row.revoked_at !== null;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
const dateMs = (s: string) => new Date(s).getTime();
const asMessage = (r: any): BotMessage => ({ seq:r.seq, id:r.id, threadId:r.thread_id, senderBotId:r.sender_bot_id, recipientBotId:r.recipient_bot_id, replyToMessageId:r.reply_to_message_id, taskId:r.task_id, sourceRunId:r.source_run_id ?? null, sourceConversationId:r.source_conversation_id ?? null, body:r.body, createdAt:r.created_at });

/** Independent standalone Bot messaging authority. Owner APIs manage/read pairs; only a running task can author as a Bot. */
export class BotMessaging {
  readonly storage: Storage;
  readonly active = new Map<string, AbortController>();
  private activeThreads = new Map<string,string>();
  private jobs = new Set<Promise<void>>();
  /** Provider promises outlive an aborted message turn when adapters ignore AbortSignal. */
  private providerJobs = new Set<Promise<void>>();
  private providerTurnIds = new Set<string>();
  private activeRecipients = new Set<string>();
  private fatalFailures = new Map<string,string>();
  private closing = false;
  readonly executor: BotMessageExecutor;
  readonly authority: TaskToolAuthority;
  constructor(storage: Storage, executor: BotMessageExecutor, authority: TaskToolAuthority, options: { maxConcurrent?: number; turnTtlMs?: number; closeTimeoutMs?: number } = {}) {
    this.storage=storage; this.executor=executor; this.authority=authority;
    this.maxConcurrent=options.maxConcurrent ?? MAX_CONCURRENT;
    this.turnTtlMs=options.turnTtlMs ?? 10*60_000;
    this.closeTimeoutMs=options.closeTimeoutMs ?? 5_000;
    requireValue(Number.isInteger(this.maxConcurrent) && this.maxConcurrent > 0 && this.maxConcurrent <= MAX_CONCURRENT, 'invalid-message-capacity', 'Bot 消息并发上限无效。');
    requireValue(Number.isInteger(this.turnTtlMs) && this.turnTtlMs > 0 && this.turnTtlMs <= 60*60_000, 'invalid-message-ttl', 'Bot 消息队列时限无效。');
    requireValue(Number.isInteger(this.closeTimeoutMs) && this.closeTimeoutMs > 0 && this.closeTimeoutMs <= 60_000, 'invalid-message-close-timeout', 'Bot 消息关闭等待时限无效。');
  }
  readonly maxConcurrent: number;
  readonly turnTtlMs: number;
  readonly closeTimeoutMs: number;

  /** Owner-authorized pair creation is the grant; no implicit contact or task delegation creates one. */
  authorizePair(actor: MessageActor, botAId: unknown, botBId: unknown) {
    requireValue(actor?.kind === 'owner', 'owner-required', '只有所有者可以授权 Bot 通信。', 403);
    const at=new Date().toISOString();
    const a=text(botAId,'Bot ID',200), b=text(botBId,'Bot ID',200);
    requireValue(a !== b, 'invalid-bot-pair', 'Bot 不能与自己通信。');
    const [bot_a_id,bot_b_id]=[a,b].sort();
    const bots=this.storage.db.prepare("SELECT id FROM bots WHERE id IN (?,?) AND kind='employee'").all(bot_a_id,bot_b_id) as {id:string}[];
    requireValue(bots.length===2,'bot-not-found','通信双方必须是已存在的员工 Bot。',404);
    const existing=this.storage.db.prepare('SELECT * FROM bot_message_threads WHERE bot_a_id=? AND bot_b_id=?').get(bot_a_id,bot_b_id) as ThreadRow|undefined;
    if(existing) {
      if(isRevoked(existing)) this.storage.db.prepare('UPDATE bot_message_threads SET revoked_at=NULL,updated_at=? WHERE id=?').run(at,existing.id);
      return {thread:this.thread(existing.id),replayed:!isRevoked(existing)};
    }
    const id=randomUUID();
    this.storage.db.prepare('INSERT INTO bot_message_threads(id,bot_a_id,bot_b_id,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,bot_a_id,bot_b_id,at,at);
    return {thread:this.thread(id),replayed:false};
  }

  revokePair(actor: MessageActor, threadId: unknown) {
    requireValue(actor?.kind==='owner','owner-required','只有所有者可以撤销 Bot 通信。',403);
    const at=new Date().toISOString();
    const id=text(threadId,'线程 ID',200);
    this.storage.transaction(()=>{
      const row=this.threadRow(id);
      if(!isRevoked(row)) this.storage.db.prepare('UPDATE bot_message_threads SET revoked_at=?,updated_at=? WHERE id=?').run(at,at,id);
      this.storage.db.prepare("UPDATE bot_message_turns SET status='failed',error_code='message-thread-revoked',finished_at=? WHERE thread_id=? AND status='queued'").run(at,id);
    });
    for(const [turnId,activeThreadId] of this.activeThreads) if(activeThreadId===id) this.active.get(turnId)?.abort(new BotError('message-thread-revoked','通信授权已撤销。',409));
    return this.thread(id);
  }

  listThreads(actor: MessageActor) {
    requireValue(actor?.kind==='owner','owner-required','只有所有者可以读取 Bot 通信。',403);
    return (this.storage.db.prepare(`SELECT t.*,a.name AS bot_a_name,b.name AS bot_b_name FROM bot_message_threads t JOIN bots a ON a.id=t.bot_a_id JOIN bots b ON b.id=t.bot_b_id ORDER BY t.created_at,t.id`).all() as any[]).map(r=>({id:r.id,botA:{id:r.bot_a_id,name:r.bot_a_name},botB:{id:r.bot_b_id,name:r.bot_b_name},createdAt:r.created_at,updatedAt:r.updated_at,revokedAt:r.revoked_at}));
  }

  messages(actor: MessageActor, threadId: unknown, limit = 50) {
    requireValue(actor?.kind==='owner','owner-required','只有所有者可以读取 Bot 通信。',403);
    const id=text(threadId,'线程 ID',200); this.threadRow(id);
    requireValue(Number.isInteger(limit)&&limit>=1&&limit<=100,'invalid-limit','消息数量无效。');
    const rows=this.storage.db.prepare('SELECT * FROM (SELECT * FROM bot_messages WHERE thread_id=? ORDER BY seq DESC LIMIT ?) ORDER BY seq').all(id,limit) as any[];
    return rows.map(asMessage);
  }

  conversationMessages(actor: MessageActor, conversationId: unknown, afterSeq: unknown = 0, limit = 50) {
    requireValue(actor?.kind==='owner','owner-required','只有所有者可以读取 Bot 通信。',403);
    const id=text(conversationId,'Conversation ID',200);
    requireValue(this.storage.db.prepare('SELECT id FROM conversations WHERE id=?').get(id),'not-found','对话不存在。',404);
    requireValue(Number.isSafeInteger(afterSeq)&&Number(afterSeq)>=0,'invalid-cursor','消息游标无效。');
    requireValue(Number.isInteger(limit)&&limit>=1&&limit<=100,'invalid-limit','消息数量无效。');
    const rows=this.storage.db.prepare('SELECT * FROM bot_messages WHERE source_conversation_id=? AND seq>? ORDER BY seq LIMIT ?').all(id,Number(afterSeq),limit+1) as any[];
    const hasMore=rows.length>limit;if(hasMore)rows.pop();
    return {items:rows.map(asMessage),nextCursor:hasMore&&rows.length?rows.at(-1).seq:null};
  }

  authorizedPeers(botId: string) {
    return this.storage.db.prepare(`SELECT t.id AS thread_id, CASE WHEN t.bot_a_id=? THEN b.id ELSE a.id END AS bot_id,
      CASE WHEN t.bot_a_id=? THEN b.name ELSE a.name END AS name
      FROM bot_message_threads t JOIN bots a ON a.id=t.bot_a_id JOIN bots b ON b.id=t.bot_b_id
      WHERE (t.bot_a_id=? OR t.bot_b_id=?) AND t.revoked_at IS NULL ORDER BY t.id`)
      .all(botId,botId,botId,botId) as {thread_id:string;bot_id:string;name:string}[];
  }

  /** Sender identity is derived from the live task row. Callers cannot supply a Bot identity. */
  sendFromTask(scope: unknown, input: { threadId: unknown; body: unknown }) {
    requireValue(!this.closing,'message-service-closed','Bot 消息服务已关闭，不能提交新消息。',503);
    const threadId=text(input.threadId,'线程 ID',200), body=text(input.body,'消息',MAX_BODY);
    const {taskId,toolCallId}=this.authority.resolve(scope,{threadId,body});
    text(taskId,'任务 ID',200);text(toolCallId,'工具调用 ID',200);
    const at=new Date().toISOString();
    return this.storage.transaction(()=>{
      requireValue(!this.closing,'message-service-closed','Bot 消息服务已关闭，不能提交新消息。',503);
      const task=this.storage.db.prepare('SELECT id,root_id,parent_id,executor_bot_id,status,deadline_at FROM tasks WHERE id=?').get(taskId) as any;
      requireValue(task && task.status==='running' && dateMs(task.deadline_at)>dateMs(at),'bot-run-not-active','只有正在运行且未超时的 Bot 执行可以发送消息。',409);
      const thread=this.threadRow(threadId);
      requireValue(!isRevoked(thread),'message-thread-revoked','Bot 通信授权已撤销。',403);
      const sender=task.executor_bot_id as string;
      requireValue(sender===thread.bot_a_id||sender===thread.bot_b_id,'message-sender-not-authorized','此 Bot 不在获授权的通信双方中。',403);
      const recipient=sender===thread.bot_a_id?thread.bot_b_id:thread.bot_a_id;
      const source=this.storage.db.prepare('SELECT id,conversation_id FROM runs WHERE task_id=? AND bot_id=? ORDER BY seq DESC LIMIT 1').get(task.root_id,sender) as {id:string;conversation_id:string}|undefined;
      const tool=this.storage.db.prepare('SELECT arguments_hash,status,tool_name FROM task_tool_calls WHERE task_id=? AND tool_call_id=?').get(taskId,toolCallId) as any;
      requireValue(tool && tool.status==='running' && tool.tool_name==='send_bot_message' && tool.arguments_hash===hash(canonical({arguments:{threadId,body}})),'tool-call-not-active','消息必须来自参数匹配的当前模型工具调用。',409);
      const digest=hash(JSON.stringify([threadId,body,recipient]));
      const prior=this.storage.db.prepare('SELECT * FROM bot_messages WHERE task_id=? AND tool_call_id=?').get(taskId,toolCallId) as any;
      if(prior) { requireValue(prior.idempotency_hash===digest,'idempotency-conflict','相同工具调用 ID 已用于不同消息。',409); return {message:asMessage(prior),replayed:true}; }
      const pending=Number((this.storage.db.prepare("SELECT count(*) AS n FROM bot_message_turns WHERE recipient_bot_id=? AND status IN ('queued','running')").get(recipient) as any).n);
      requireValue(pending<MAX_PENDING_PER_BOT,'message-capacity','接收 Bot 的待处理消息已达上限。',429);
      const id=randomUUID();
      this.storage.db.prepare('INSERT INTO bot_messages(id,thread_id,sender_bot_id,recipient_bot_id,task_id,source_run_id,source_conversation_id,tool_call_id,idempotency_hash,body,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,threadId,sender,recipient,taskId,source?.id??null,source?.conversation_id??null,toolCallId,digest,body,at);
      this.storage.db.prepare("INSERT INTO bot_message_turns(id,incoming_message_id,thread_id,recipient_bot_id,status,created_at) VALUES(?,?,?,?,'queued',?)").run(randomUUID(),id,threadId,recipient,at);
      this.storage.db.prepare('UPDATE bot_message_threads SET updated_at=? WHERE id=?').run(at,threadId);
      return {message:this.message(id),replayed:false};
    });
  }

  /** Claims and executes queued recipient turns through the host's real model adapter. */
  dispatchPending() {
    if(this.closing) return this.jobs.size;
    const expiry=new Date(Date.now()-this.turnTtlMs).toISOString(), now=new Date().toISOString();
    this.storage.db.prepare("UPDATE bot_message_turns SET status='failed',error_code='message-expired',finished_at=? WHERE status='queued' AND created_at<?").run(now,expiry);
    while(this.active.size<this.maxConcurrent) {
      const candidates=this.storage.db.prepare(`SELECT q.* FROM bot_message_turns q JOIN bot_messages m ON m.id=q.incoming_message_id
        WHERE q.status='queued' AND q.created_at>=?
          AND NOT EXISTS(SELECT 1 FROM bot_message_turns r WHERE r.recipient_bot_id=q.recipient_bot_id AND r.status='running')
        ORDER BY m.seq LIMIT 100`).all(expiry) as TurnRow[];
      const turn=candidates.find(candidate=>!this.activeRecipients.has(candidate.recipient_bot_id));
      if(!turn) break;
      const controller=new AbortController(), at=new Date().toISOString();
      const started=this.storage.db.prepare("UPDATE bot_message_turns SET status='running',started_at=? WHERE id=? AND status='queued'").run(at,turn.id).changes;
      if(started!==1) continue;
      this.active.set(turn.id,controller);
      this.activeThreads.set(turn.id,turn.thread_id);
      this.activeRecipients.add(turn.recipient_bot_id);
      const job=this.executeTurn(turn,controller).catch(error=>{
        this.recordFatal(turn.id,error);
      }).finally(()=>{
        this.jobs.delete(job);
        if(!this.providerTurnIds.has(turn.id)) {
          this.active.delete(turn.id);
          this.activeThreads.delete(turn.id);
          this.activeRecipients.delete(turn.recipient_bot_id);
        }
        try { this.dispatchPending(); } catch(error) { this.recordFatal(turn.id,error); }
      });
      this.jobs.add(job);
    }
    return this.jobs.size;
  }

  /** Running turns are deliberately terminal after restart; only never-started queued turns remain eligible. */
  recover(at = new Date().toISOString()) {
    return this.storage.db.prepare("UPDATE bot_message_turns SET status='interrupted',error_code='process-restarted',finished_at=? WHERE status='running'").run(at).changes;
  }

  async close() {
    this.closing=true;
    for(const controller of this.active.values()) controller.abort(new BotError('message-process-closing','通信执行器正在关闭。',503));
    const settled=Promise.allSettled([...this.jobs,...this.providerJobs]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const completed=await Promise.race([settled.then(()=>true),new Promise<false>(resolve=>{timer=setTimeout(()=>resolve(false),this.closeTimeoutMs);})]);
    if(timer) clearTimeout(timer);
    requireValue(completed,'message-provider-still-active',`仍有 ${this.providerJobs.size} 个模型请求未停止；关闭未完成。`,503);
    requireValue(this.fatalFailures.size===0,'message-persistence-failed',`消息执行状态写入失败（${this.fatalFailures.size} 项）；关闭未完成。`,503);
  }

  status() { return { closing:this.closing, activeProviders:this.providerJobs.size, activeRecipients:this.activeRecipients.size, failures:[...this.fatalFailures.entries()].map(([turnId,code])=>({turnId,code})) }; }

  private recordFatal(turnId:string,error:unknown) {
    const code=error instanceof BotError?error.code:'message-state-persistence-failed';
    if(this.fatalFailures.size<100)this.fatalFailures.set(turnId,code);
  }

  private async executeTurn(turn: TurnRow, controller: AbortController) {
    try {
      const incoming=this.storage.db.prepare('SELECT * FROM bot_messages WHERE id=?').get(turn.incoming_message_id) as any;
      const thread=this.threadRow(turn.thread_id);
      requireValue(!isRevoked(thread),'message-thread-revoked','Bot 通信授权已撤销。',403);
      const history=this.context(turn.thread_id,turn.incoming_message_id);
      const reply=text(await this.executeBounded({botId:turn.recipient_bot_id,threadId:turn.thread_id,incomingMessageId:turn.incoming_message_id,incomingBody:incoming.body,history,signal:controller.signal},controller),'Bot 回复',MAX_BODY);
      requireValue(!controller.signal.aborted,'message-execution-interrupted','Bot 回复已中断。',409);
      const at=new Date().toISOString();
      this.storage.transaction(()=>{
        const still=this.turn(turn.id); requireValue(still?.status==='running','message-turn-not-running','消息执行已结束。',409);
        const current=this.threadRow(turn.thread_id); requireValue(!isRevoked(current),'message-thread-revoked','Bot 通信授权已撤销。',403);
        this.storage.db.prepare('INSERT INTO bot_messages(id,thread_id,sender_bot_id,recipient_bot_id,reply_to_message_id,source_run_id,source_conversation_id,body,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),turn.thread_id,turn.recipient_bot_id,incoming.sender_bot_id,turn.incoming_message_id,incoming.source_run_id,incoming.source_conversation_id,reply,at);
        this.storage.db.prepare("UPDATE bot_message_turns SET status='completed',finished_at=? WHERE id=? AND status='running'").run(at,turn.id);
        this.storage.db.prepare('UPDATE bot_message_threads SET updated_at=? WHERE id=?').run(at,turn.thread_id);
      });
    } catch(error) {
      const at=new Date().toISOString();
      const code=error instanceof BotError?error.code:'message-execution-failed';
      try {
        this.storage.db.prepare("UPDATE bot_message_turns SET status=?,error_code=?,finished_at=? WHERE id=? AND status='running'").run(controller.signal.aborted?'interrupted':'failed',code,at,turn.id);
      } catch(persistError) {
        const failure=new BotError('message-state-persistence-failed','消息执行状态无法写入本地数据库。',503);
        (failure as Error & {cause?:unknown}).cause=persistError;
        throw failure;
      }
    }
  }

  private executeBounded(input: Parameters<BotMessageExecutor>[0], controller: AbortController) {
    return new Promise<string>((resolve,reject)=>{
      const timer=setTimeout(()=>controller.abort(new BotError('message-deadline-exceeded','Bot 消息执行超时。',504)),90_000);
      const aborted=()=>reject(controller.signal.reason instanceof Error?controller.signal.reason:new BotError('message-execution-interrupted','Bot 消息执行已中断。',409));
      if(controller.signal.aborted) { clearTimeout(timer); aborted(); return; }
      controller.signal.addEventListener('abort',aborted,{once:true});
      const provider=Promise.resolve().then(()=>this.executor(input));
      const tracked=provider.then(()=>undefined,()=>undefined).then(()=>{
        clearTimeout(timer);controller.signal.removeEventListener('abort',aborted);
        const turnId=this.activeIdForController(controller);
        this.active.delete(turnId);
        this.activeThreads.delete(turnId);
        this.activeRecipients.delete(input.botId);
        this.providerJobs.delete(tracked);
        this.providerTurnIds.delete(turnId);
        try { this.dispatchPending(); } catch(error) { this.recordFatal(turnId,error); }
      });
      const turnId=this.activeIdForController(controller);
      this.providerTurnIds.add(turnId);
      this.providerJobs.add(tracked);
      provider.then(resolve,reject);
    });
  }

  private context(threadId:string,incomingId:string):ContextMessage[] {
    const rows=this.storage.db.prepare('SELECT sender_bot_id,recipient_bot_id,body,created_at FROM bot_messages WHERE thread_id=? AND seq <= (SELECT seq FROM bot_messages WHERE id=?) ORDER BY seq DESC LIMIT ?').all(threadId,incomingId,MAX_HISTORY) as any[];
    const result:ContextMessage[]=[];let size=0;
    for(const r of rows) { const body=String(r.body).slice(0,Math.max(0,MAX_CONTEXT_CHARS-size)); if(!body)continue; result.push({senderBotId:r.sender_bot_id,recipientBotId:r.recipient_bot_id,body,createdAt:r.created_at});size+=body.length;if(size>=MAX_CONTEXT_CHARS)break; }
    return result.reverse();
  }
  private activeIdForController(controller:AbortController) { for(const [id,value] of this.active)if(value===controller)return id;return ''; }
  private threadRow(id:string):ThreadRow { const r=this.storage.db.prepare('SELECT * FROM bot_message_threads WHERE id=?').get(id) as ThreadRow|undefined;requireValue(r,'message-thread-not-found','Bot 通信线程不存在。',404);return r; }
  private thread(id:string) { const r=this.threadRow(id);return {id:r.id,botAId:r.bot_a_id,botBId:r.bot_b_id,createdAt:r.created_at,updatedAt:r.updated_at,revokedAt:r.revoked_at}; }
  private message(id:string) { const r=this.storage.db.prepare('SELECT * FROM bot_messages WHERE id=?').get(id);requireValue(r,'message-not-found','消息不存在。',404);return asMessage(r); }
  private turn(id:string) { return this.storage.db.prepare('SELECT * FROM bot_message_turns WHERE id=?').get(id) as any; }
}
