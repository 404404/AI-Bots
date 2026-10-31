import { randomUUID } from 'node:crypto';
import type { Storage } from './storage.ts';
import { BotError, requireValue, text } from './errors.ts';
import type { ModelConfig } from './model.ts';

/** Schema owned by GroupChat; exported so backend migrations can include it explicitly. */
export const GroupChatSql = `
CREATE TABLE IF NOT EXISTS chat_groups (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_group_members (
  group_id TEXT NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  bot_id TEXT NOT NULL REFERENCES bots(id), added_at TEXT NOT NULL, generation INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  PRIMARY KEY(group_id,bot_id)
);
CREATE TABLE IF NOT EXISTS chat_group_messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, group_id TEXT NOT NULL REFERENCES chat_groups(id), sender_type TEXT NOT NULL CHECK(sender_type IN ('user','bot')),
  sender_id TEXT NOT NULL, sender_name TEXT NOT NULL, run_id TEXT, content TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_group_messages_order ON chat_group_messages(group_id,seq);
CREATE TABLE IF NOT EXISTS chat_group_runs (
  id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES chat_groups(id), bot_id TEXT NOT NULL REFERENCES bots(id),
  user_message_id TEXT NOT NULL REFERENCES chat_group_messages(id), request_key TEXT NOT NULL, input TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','cancelled','interrupted')),
  error_code TEXT, model_id TEXT NOT NULL, model_epoch INTEGER NOT NULL, membership_generation INTEGER NOT NULL, recipient_index INTEGER NOT NULL, created_at TEXT NOT NULL, finished_at TEXT,
  UNIQUE(group_id,request_key,bot_id)
);
`;

type Resolved = { config: ModelConfig; credential: string | null; sourceModelEpoch: number };
type Message = { id: string; groupId: string; senderId: string; senderType: 'user'|'bot'; senderName: string; content: string; createdAt: string; runId: string | null };
type Run = { id: string; groupId: string; botId: string; status: string; errorCode: string | null; createdAt: string; finishedAt: string | null };
export type GroupChatAdapter = {
  resolve(botId: string, modelId: string): Resolved;
  assertAuthorized(epoch: number): void;
  readMemory(botId: string): { path: string; body: string }[];
  diagnostic?: (event: 'execution-detached' | 'execution-settled', runId: string) => void;
  execute(args: { botId: string; groupId: string; requestKey: string; modelEpoch: number; input: string; history: Message[]; memory: {path:string;body:string}[]; config: ModelConfig; credential: string | null; signal: AbortSignal }): Promise<string>;
};
const now = () => new Date().toISOString();
const asMessage = (r: any): Message => ({ id:r.id, groupId:r.group_id, senderId:r.sender_id, senderType:r.sender_type, senderName:r.sender_name, content:r.content, createdAt:r.created_at, runId:r.run_id });
const asRun = (r: any): Run => ({ id:r.id, groupId:r.group_id, botId:r.bot_id, status:r.status, errorCode:r.error_code, createdAt:r.created_at, finishedAt:r.finished_at });

/** Persistent group chat business boundary. All model execution is supplied by the application. */
export class GroupChat {
  readonly storage: Storage;
  readonly adapter: GroupChatAdapter;
  readonly active = new Map<string, AbortController>();
  /** Adapters that ignore AbortSignal remain tracked and count against capacity until their promise settles. */
  readonly detached = new Map<string, Promise<unknown>>();
  readonly deadlineMs: number;
  readonly jobs = new Set<Promise<void>>();
  constructor(storage: Storage, adapter: GroupChatAdapter, options: { deadlineMs?: number } = {}) { this.storage = storage; this.adapter = adapter; this.deadlineMs = options.deadlineMs ?? 90_000; requireValue(Number.isInteger(this.deadlineMs) && this.deadlineMs > 0, 'invalid-group-deadline', '群聊执行时限无效。'); }
  /** Called once at backend startup after GroupChatSql has been applied in the schema migration. */
  recover() { return this.storage.db.prepare("UPDATE chat_group_runs SET status='interrupted',error_code='process-restarted',finished_at=? WHERE status IN ('queued','running')").run(now()).changes; }
  private members(groupId: string) {
    return this.storage.db.prepare('SELECT m.bot_id,b.name,m.generation FROM chat_group_members m JOIN bots b ON b.id=m.bot_id WHERE m.group_id=? AND m.active=1 ORDER BY m.added_at,m.bot_id')
      .all(groupId) as {bot_id:string;name:string;generation:number}[];
  }
  private groupRow(id: string) {
    const row = this.storage.db.prepare('SELECT id,name,created_at,updated_at FROM chat_groups WHERE id=?').get(id) as any;
    requireValue(row, 'group-not-found', '群聊不存在。', 404); return row;
  }
  private publicGroup(id: string) {
    const r=this.groupRow(id); return {id:r.id,name:r.name,createdAt:r.created_at,updatedAt:r.updated_at,members:this.members(id).map(x=>({botId:x.bot_id,name:x.name}))};
  }
  create(input: {name: unknown; memberBotIds: unknown}) {
    const name=text(input.name,'群名称',100); const ids=this.validateIds(input.memberBotIds,100);
    requireValue(ids.length>=1,'group-members-required','群聊至少需要一名成员。');
    const rows=this.storage.db.prepare(`SELECT id,name FROM bots WHERE id IN (${ids.map(()=>'?').join(',')})`).all(...ids) as {id:string;name:string}[];
    requireValue(rows.length===ids.length,'group-member-not-found','群成员必须是已存在员工。',404);
    const id=randomUUID(), at=now();
    this.storage.transaction(()=>{this.storage.db.prepare('INSERT INTO chat_groups(id,name,created_at,updated_at) VALUES(?,?,?,?)').run(id,name,at,at);
      const add=this.storage.db.prepare('INSERT INTO chat_group_members(group_id,bot_id,added_at,generation,active) VALUES(?,?,?,1,1)'); for(const botId of ids)add.run(id,botId,at);});
    return {group:this.publicGroup(id)};
  }
  list() { const rows=this.storage.db.prepare('SELECT id FROM chat_groups ORDER BY updated_at DESC,id').all() as {id:string}[]; return {groups:rows.map(x=>this.publicGroup(x.id))}; }
  get(groupIdInput: unknown) {
    const groupId=text(groupIdInput,'群 ID',64), group=this.publicGroup(groupId);
    const runs=this.storage.db.prepare('SELECT * FROM chat_group_runs WHERE group_id=? ORDER BY rowid DESC LIMIT 100').all(groupId).map(asRun);
    return {group,runs};
  }
  run(groupIdInput: unknown, runIdInput: unknown) {
    const groupId=text(groupIdInput,'群 ID',64), runId=text(runIdInput,'运行 ID',64); this.groupRow(groupId);
    const row=this.storage.db.prepare('SELECT * FROM chat_group_runs WHERE group_id=? AND id=?').get(groupId,runId);
    requireValue(row,'group-run-not-found','群内执行不存在。',404); return {run:asRun(row)};
  }
  messages(groupIdInput: unknown, params: {limit?: unknown; cursor?: unknown} = {}) {
    const groupId=text(groupIdInput,'群 ID',64); this.groupRow(groupId);
    const limit=params.limit===undefined?50:Number(params.limit); requireValue(Number.isInteger(limit)&&limit>=1&&limit<=100,'invalid-page-size','每页最多100条群消息。');
    const scope=`group-messages:${groupId}`, cursor=params.cursor; let before: number|null=null;
    const encoded=this.storage.keysetAfter(cursor,scope);
    if(encoded) { try { const parsed=Number(encoded);
      requireValue(Number.isSafeInteger(parsed)&&parsed>0,'invalid-cursor','群历史游标无效。'); before=parsed;
    } catch { throw new BotError('invalid-cursor','群历史游标无效，请重新读取。'); } }
    const rows=(before?this.storage.db.prepare('SELECT * FROM chat_group_messages WHERE group_id=? AND seq<? ORDER BY seq DESC LIMIT ?').all(groupId,before,limit+1)
      :this.storage.db.prepare('SELECT * FROM chat_group_messages WHERE group_id=? ORDER BY seq DESC LIMIT ?').all(groupId,limit+1)) as any[];
    const hasMore=rows.length>limit, items=rows.slice(0,limit).reverse().map(asMessage), first=items[0];
    const nextCursor=hasMore&&first?this.storage.keysetCursor(scope,String((rows.slice(0,limit).at(-1) as any).seq)):null;
    return {groupId,items,hasMore,nextCursor};
  }
  setMembers(groupIdInput: unknown, memberBotIds: unknown) {
    const groupId=text(groupIdInput,'群 ID',64), ids=this.validateIds(memberBotIds,100); this.groupRow(groupId);
    requireValue(ids.length>=1,'group-members-required','群聊至少需要一名成员。');
    const rows=this.storage.db.prepare(`SELECT id FROM bots WHERE id IN (${ids.map(()=>'?').join(',')})`).all(...ids) as {id:string}[];
    requireValue(rows.length===ids.length,'group-member-not-found','群成员必须是已存在员工。',404);
    this.storage.transaction(()=>{const db=this.storage.db, at=now(); const placeholders=ids.map(()=>'?').join(','); if(ids.length) db.prepare(`UPDATE chat_group_members SET active=0 WHERE group_id=? AND bot_id NOT IN (${placeholders})`).run(groupId,...ids); else db.prepare('UPDATE chat_group_members SET active=0 WHERE group_id=?').run(groupId); const add=db.prepare(`INSERT INTO chat_group_members(group_id,bot_id,added_at,generation,active) VALUES(?,?,?,1,1) ON CONFLICT(group_id,bot_id) DO UPDATE SET generation=CASE WHEN chat_group_members.active=0 THEN chat_group_members.generation+1 ELSE chat_group_members.generation END,active=1,added_at=CASE WHEN chat_group_members.active=0 THEN excluded.added_at ELSE chat_group_members.added_at END`); for(const botId of ids)add.run(groupId,botId,at); db.prepare('UPDATE chat_groups SET updated_at=? WHERE id=?').run(at,groupId);});
    return {group:this.publicGroup(groupId)};
  }
  private validateIds(value: unknown, maximum=3): string[] {
    requireValue(Array.isArray(value) && value.length<=maximum && value.every(x=>typeof x==='string'),'invalid-group-members',`成员选择无效，最多选择${maximum}名员工。`);
    const ids=[...new Set((value as string[]).map(x=>text(x,'员工 ID',64)))]; requireValue(ids.length===(value as unknown[]).length,'invalid-group-members','成员不能重复。'); return ids;
  }
  send(input: {groupId: unknown; text: unknown; modelId: unknown; recipientBotIds: unknown; idempotencyKey: unknown}) {
    const groupId=text(input.groupId,'群 ID',64), body=text(input.text,'消息',12000), modelId=text(input.modelId,'模型 ID',160), ids=this.validateIds(input.recipientBotIds), key=text(input.idempotencyKey,'幂等键',128);
    requireValue(ids.length>0,'group-recipient-required','请明确选择至少一名群成员回应。'); this.groupRow(groupId);
    const currentMembers=this.members(groupId); const members=new Set(currentMembers.map(x=>x.bot_id)); requireValue(ids.every(x=>members.has(x)),'group-member-not-found','所选回应者不是当前群成员。',409);
    // Idempotency is anchored in the run key and user message id; reject conflicting retries.
    const existing=this.storage.db.prepare('SELECT id FROM chat_group_runs WHERE group_id=? AND request_key=? LIMIT 1').get(groupId,key) as {id:string}|undefined;
    if(existing){const first=this.storage.db.prepare('SELECT input,model_id,user_message_id FROM chat_group_runs WHERE group_id=? AND request_key=? ORDER BY rowid LIMIT 1').get(groupId,key) as any;
      requireValue(first.input===body&&first.model_id===modelId,'idempotency-conflict','同一幂等键不能用于不同消息。',409);
      const prior=(this.storage.db.prepare('SELECT bot_id FROM chat_group_runs WHERE group_id=? AND request_key=? ORDER BY rowid').all(groupId,key) as {bot_id:string}[]).map(x=>x.bot_id);
      requireValue(JSON.stringify(prior)===JSON.stringify(ids),'idempotency-conflict','同一幂等键不能用于不同回应成员。',409);
      return {group:this.publicGroup(groupId),userMessage:this.message(first.user_message_id),runs:(this.storage.db.prepare('SELECT * FROM chat_group_runs WHERE group_id=? AND request_key=? ORDER BY rowid').all(groupId,key) as any[]).map(asRun)};}
    const groupOutstanding=(this.storage.db.prepare("SELECT COUNT(*) AS count FROM chat_group_runs WHERE group_id=? AND status IN ('queued','running')").get(groupId) as {count:number}).count; requireValue(groupOutstanding===0,'group-capacity','此群上一条消息仍在处理，请稍后重试。',409);
    const outstanding=(this.storage.db.prepare("SELECT COUNT(*) AS count FROM chat_group_runs WHERE status IN ('queued','running')").get() as {count:number}).count;
    requireValue(outstanding + this.detached.size + ids.length <= 3,'group-capacity','当前群聊执行数已达上限，请稍后重试。',409);
    const at=now(), msgId=randomUUID();
    // Resolve and snapshot each selected employee before accepting work. Authorization is rechecked at commit.
    const resolved=ids.map(botId=>({botId,model:this.adapter.resolve(botId,modelId)}));
    this.storage.transaction(()=>{this.storage.db.prepare("INSERT INTO chat_group_messages(id,group_id,sender_type,sender_id,sender_name,content,created_at) VALUES(?,?,'user','user','你',?,?)").run(msgId,groupId,body,at);
      const insert=this.storage.db.prepare("INSERT INTO chat_group_runs(id,group_id,bot_id,user_message_id,request_key,input,status,model_id,model_epoch,membership_generation,recipient_index,created_at) VALUES(?,?,?,?,?,?,'queued',?,?,?,?,?)");
      for(const [index,x] of resolved.entries()){const generation=currentMembers.find(m=>m.bot_id===x.botId)!.generation; insert.run(randomUUID(),groupId,x.botId,msgId,key,body,modelId,x.model.sourceModelEpoch,generation,index,at);} this.storage.db.prepare('UPDATE chat_groups SET updated_at=? WHERE id=?').run(at,groupId);});
    const runs=this.storage.db.prepare('SELECT * FROM chat_group_runs WHERE group_id=? AND request_key=? ORDER BY rowid').all(groupId,key) as any[];
    let sequence=Promise.resolve();
    for(const run of runs){const model=resolved.find(x=>x.botId===run.bot_id)!.model; const controller=new AbortController(); this.active.set(run.id,controller); sequence=sequence.then(()=>this.executeRun(run.id,model,controller));}
    const job=sequence; this.jobs.add(job); void job.finally(()=>this.jobs.delete(job));
    return {group:this.publicGroup(groupId),userMessage:this.message(msgId),runs:runs.map(asRun)};
  }
  private message(id: string) { const row=this.storage.db.prepare('SELECT * FROM chat_group_messages WHERE id=?').get(id) as any; return row?asMessage(row):null; }
  private abortable<T>(runId: string, promise: Promise<T>, signal: AbortSignal): Promise<T> {
    const trackDetached = () => {
      this.detached.set(runId, promise);
      this.adapter.diagnostic?.('execution-detached', runId);
      const cleanup = () => { if (this.detached.get(runId) === promise) { this.detached.delete(runId); this.adapter.diagnostic?.('execution-settled', runId); } };
      void promise.then(cleanup, cleanup);
    };
    if (signal.aborted) { trackDetached(); return Promise.reject(signal.reason ?? new BotError('group-cancelled','群聊执行已取消。',409)); }
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const onAbort = () => {
        if (settled) return; settled = true; signal.removeEventListener('abort', onAbort); trackDetached();
        reject(signal.reason ?? new BotError('group-cancelled','群聊执行已取消。',409));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      void promise.then((value) => { if (settled) return; settled = true; signal.removeEventListener('abort', onAbort); resolve(value); }, (error) => { if (settled) return; settled = true; signal.removeEventListener('abort', onAbort); reject(error); });
      if (signal.aborted) onAbort();
    });
  }
  private async executeRun(runId:string, resolved:Resolved, controller:AbortController) {
    const db=this.storage.db; let deadlineReached=false;
    const timer=setTimeout(()=>{deadlineReached=true;controller.abort(new BotError('group-deadline-exceeded','群聊执行超过90秒时限。',504));},this.deadlineMs);
    try {
      const claimed=this.storage.transaction(()=>{const run=db.prepare("SELECT * FROM chat_group_runs WHERE id=? AND status='queued'").get(runId) as any; if(!run)return null;
        if(!this.members(run.group_id).some(x=>x.bot_id===run.bot_id&&x.generation===run.membership_generation)){db.prepare("UPDATE chat_group_runs SET status='cancelled',error_code='member-removed',finished_at=? WHERE id=?").run(now(),runId);return null;}
        db.prepare("UPDATE chat_group_runs SET status='running' WHERE id=? AND status='queued'").run(runId); return run;});
      if(!claimed)return;
      const userSeq=(db.prepare('SELECT seq FROM chat_group_messages WHERE id=?').get(claimed.user_message_id) as {seq:number}).seq;
      const previousIds=(db.prepare('SELECT id FROM chat_group_runs WHERE user_message_id=? AND recipient_index<? AND status=\'completed\'').all(claimed.user_message_id,claimed.recipient_index) as {id:string}[]).map(x=>x.id);
      const extra=previousIds.length?` OR run_id IN (${previousIds.map(()=>'?').join(',')})`:'';
      const history=(db.prepare(`SELECT * FROM chat_group_messages WHERE group_id=? AND (seq<=?${extra}) ORDER BY seq DESC LIMIT 20`).all(claimed.group_id,userSeq,...previousIds) as any[]).reverse().map(asMessage);
      const memory=this.adapter.readMemory(claimed.bot_id).slice(0,8).map(x=>({path:x.path,body:x.body.slice(0,4000)}));
      this.adapter.assertAuthorized(claimed.model_epoch);
      // Actual adapters pass signal through to the provider transport. The race also makes a broken
      // adapter unable to keep persisted state or shutdown waiting forever; its late value is detached.
      const execution=Promise.resolve().then(()=>{ if(controller.signal.aborted) throw controller.signal.reason ?? new BotError('group-cancelled','群聊执行已取消。',409); return this.adapter.execute({botId:claimed.bot_id,groupId:claimed.group_id,requestKey:runId,modelEpoch:claimed.model_epoch,input:claimed.input,history,memory,config:resolved.config,credential:resolved.credential,signal:controller.signal}); });
      const output=await this.abortable(runId,execution,controller.signal);
      requireValue(typeof output==='string' && output.length<=16000,'group-result-too-large','员工回复超过限制。',502);
      this.storage.transaction(()=>{const current=db.prepare('SELECT status,group_id,bot_id,model_epoch,membership_generation FROM chat_group_runs WHERE id=?').get(runId) as any;
        if(!current||current.status!=='running')return;
        requireValue(this.members(current.group_id).some(x=>x.bot_id===current.bot_id&&x.generation===current.membership_generation),'group-member-removed','员工已移出群聊，迟到回复已丢弃。',409);
        this.adapter.assertAuthorized(current.model_epoch);
        const name=(db.prepare('SELECT name FROM bots WHERE id=?').get(current.bot_id) as {name:string}|undefined)?.name;
        requireValue(name,'group-member-not-found','员工已不存在。',409);
        db.prepare("INSERT INTO chat_group_messages(id,group_id,sender_type,sender_id,sender_name,run_id,content,created_at) VALUES(?,?,'bot',?,?,?, ?,?)").run(randomUUID(),current.group_id,current.bot_id,name,runId,output,now());
        db.prepare("UPDATE chat_group_runs SET status='completed',finished_at=? WHERE id=? AND status='running'").run(now(),runId); db.prepare('UPDATE chat_groups SET updated_at=? WHERE id=?').run(now(),current.group_id);});
    } catch(error) { const code=deadlineReached?'group-deadline-exceeded':error instanceof BotError?error.code:'group-execution-failed'; this.storage.transaction(()=>{const row=db.prepare("SELECT status FROM chat_group_runs WHERE id=?").get(runId) as {status:string}|undefined;
        if(row?.status==='running')db.prepare("UPDATE chat_group_runs SET status=?,error_code=?,finished_at=? WHERE id=?").run(controller.signal.aborted&&!deadlineReached?'cancelled':'failed',code,now(),runId);}); }
    finally { clearTimeout(timer); this.active.delete(runId); }
  }
  cancel(groupIdInput:unknown, runIdInput:unknown) {
    const groupId=text(groupIdInput,'群 ID',64), runId=text(runIdInput,'运行 ID',64); this.groupRow(groupId);
    const row=this.storage.db.prepare('SELECT status FROM chat_group_runs WHERE id=? AND group_id=?').get(runId,groupId) as {status:string}|undefined;
    requireValue(row,'group-run-not-found','群内执行不存在。',404);
    if(row.status==='queued'||row.status==='running') this.storage.transaction(()=>{this.storage.db.prepare("UPDATE chat_group_runs SET status='cancelled',error_code='cancelled-by-owner',finished_at=? WHERE id=? AND status IN ('queued','running')").run(now(),runId);});
    this.active.get(runId)?.abort(); return {run:asRun(this.storage.db.prepare('SELECT * FROM chat_group_runs WHERE id=?').get(runId))};
  }
  pendingExecutionIds() { return [...this.detached.keys()]; }
  async close() {
    const runIds=[...this.active.keys()];
    if(runIds.length) this.storage.transaction(()=>{const placeholders=runIds.map(()=>'?').join(','); this.storage.db.prepare(`UPDATE chat_group_runs SET status='cancelled',error_code='shutdown',finished_at=? WHERE id IN (${placeholders}) AND status IN ('queued','running')`).run(now(),...runIds);});
    for(const c of this.active.values())c.abort(new BotError('group-shutdown','群聊服务正在关闭。',409));
    await Promise.allSettled([...this.jobs]);
    const detachedRunIds=this.pendingExecutionIds(); return {detachedRunIds};
  }
}
