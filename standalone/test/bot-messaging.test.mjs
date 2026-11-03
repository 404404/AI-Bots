import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../src/storage.ts';
import { BotMessaging, BotMessagingSql } from '../src/bot-messaging.ts';
import { createHash } from 'node:crypto';

const roots=[];const dir=()=>{const p=mkdtempSync(join(tmpdir(),'bot-messaging-'));roots.push(p);return p;};
after(()=>{for(const p of roots)rmSync(p,{recursive:true,force:true});});
function fixture(executor=async x=>`real adapter output for ${x.botId}`,options={}) {
  const storage=new Storage(dir()), at=new Date().toISOString();
  const add=storage.db.prepare("INSERT INTO bots(id,slug,name,persona,config,credential,created_at,updated_at,kind) VALUES(?,?,?,?,?,?,?,?, 'employee')");
  add.run('bot-a','bot-a','甲','persona A','{}',null,at,at);add.run('bot-b','bot-b','乙','persona B','{}',null,at,at);
  storage.db.exec(BotMessagingSql);
  const authorizedScopes=new WeakMap();const scope={};authorizedScopes.set(scope,{taskId:'task-a',toolCallId:'call-1'});
  const authority={resolve(value,args){const resolved=authorizedScopes.get(value);if(!resolved)throw Object.assign(new Error('untrusted execution scope'),{code:'untrusted-task-scope'});return resolved;}};
  const messaging=new BotMessaging(storage,executor,authority,options);
  const taskId='task-a';
  storage.db.prepare(`INSERT INTO tasks(id,root_id,parent_id,initiator_bot_id,executor_bot_id,request_key,input_hash,input,status,config_revision,created_at,started_at,deadline_at)
    VALUES(?,? ,NULL,'bot-a','bot-a','request','hash','run','running',1,?,?,?)`).run(taskId,taskId,at,at,new Date(Date.now()+60000).toISOString());
  const thread=messaging.authorizePair({kind:'owner'},'bot-a','bot-b',at).thread;
  const callArgs={threadId:'',body:''};
  const bindCall=(threadId,body,toolCallId='call-1')=>{const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`:JSON.stringify(value);const callScope={};authorizedScopes.set(callScope,{taskId:'task-a',toolCallId});const digest=createHash('sha256').update(canonical({arguments:{threadId,body}})).digest('hex');if(toolCallId==='call-1')storage.db.prepare("INSERT INTO task_tool_calls(task_id,tool_call_id,tool_name,arguments_hash,status,created_at) VALUES(?,'call-1','send_bot_message',?,'running',?) ON CONFLICT(task_id,tool_call_id) DO UPDATE SET arguments_hash=excluded.arguments_hash,status='running',error_code=NULL,finished_at=NULL").run(taskId,digest,at);else storage.db.prepare("INSERT INTO task_tool_calls(task_id,tool_call_id,tool_name,arguments_hash,status,created_at) VALUES(?,?,'send_bot_message',?,'running',?)").run('task-a',toolCallId,digest,at);return {scope:callScope,args:{threadId,body}};};
  return {storage,messaging,thread,taskId,at,scope,bindCall};
}
const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw new Error('fixture-timeout');};

test('only owner authorizes a pair and a running task derives the sender from canonical task state',()=>{
  const f=fixture();try {const {messaging,thread,taskId,storage}=f;
    assert.throws(()=>messaging.authorizePair({kind:'bot'},'bot-a','bot-b'),{code:'owner-required'});
    assert.throws(()=>messaging.sendFromTask({taskId,toolCallId:'call-1'},{threadId:thread.id,body:'forged'}),{code:'untrusted-task-scope'});
    assert.throws(()=>messaging.sendFromTask(f.scope,{threadId:thread.id,body:'x'.repeat(8001)}),{code:'invalid-input'});
    const call=f.bindCall(thread.id,'请检查方案。'),beforeHash=storage.db.prepare('SELECT arguments_hash FROM task_tool_calls WHERE task_id=? AND tool_call_id=?').get(taskId,'call-1').arguments_hash;
    const sent=messaging.sendFromTask(call.scope,call.args);
    assert.equal(sent.message.senderBotId,'bot-a');assert.equal(sent.message.recipientBotId,'bot-b');
    assert.equal(messaging.messages({kind:'owner'},thread.id)[0].body,'请检查方案。');
    assert.equal(storage.db.prepare('SELECT arguments_hash FROM task_tool_calls WHERE task_id=? AND tool_call_id=?').get(taskId,'call-1').arguments_hash,beforeHash);
  } finally {f.storage.close();}
});

test('tool-call replay is idempotent; conflicting reuse is refused without a second turn',()=>{
  const f=fixture();try {const {messaging,thread,taskId,at,storage}=f;
    const input=f.bindCall(thread.id,'同一消息');
    const first=messaging.sendFromTask(input.scope,input.args),again=messaging.sendFromTask(input.scope,input.args);
    assert.equal(again.replayed,true);assert.equal(again.message.id,first.message.id);
    const conflicting=f.bindCall(thread.id,'改写');assert.throws(()=>messaging.sendFromTask(conflicting.scope,conflicting.args),{code:'idempotency-conflict'});
    assert.equal(storage.db.prepare('SELECT count(*) n FROM bot_message_turns').get().n,1);
  } finally {f.storage.close();}
});

test('recipient executor receives bounded thread context and its actual generated response is durably attributed',async()=>{
  const calls=[];const f=fixture(async input=>{calls.push(input);return '模型生成的乙方答复';});try {const {messaging,thread,taskId,at,storage}=f;
    const old=storage.db.prepare("INSERT INTO bot_messages(id,thread_id,sender_bot_id,recipient_bot_id,body,created_at) VALUES(?,?, 'bot-a','bot-b',?,?)");for(let i=0;i<15;i++)old.run(`old-${i}`,thread.id,`旧消息${i}`,at);
    const call=f.bindCall(thread.id,'请核对设计');const sent=messaging.sendFromTask(call.scope,call.args);
    messaging.dispatchPending();await wait(()=>storage.db.prepare("SELECT status FROM bot_message_turns WHERE incoming_message_id=?").get(sent.message.id).status==='completed');
    assert.equal(calls.length,1);assert.equal(calls[0].botId,'bot-b');assert.equal(calls[0].incomingBody,'请核对设计');assert.equal(calls[0].history.length,12);assert.equal(calls[0].history[0].body,'旧消息4');assert.equal(calls[0].history.at(-1).body,'请核对设计');
    const messages=messaging.messages({kind:'owner'},thread.id);assert.deepEqual(messages.slice(-2).map(x=>x.senderBotId),['bot-a','bot-b']);assert.equal(messages.at(-1).replyToMessageId,sent.message.id);assert.equal(messages.at(-1).body,'模型生成的乙方答复');
  } finally {await f.messaging.close();f.storage.close();}
});

test('restart marks claimed work interrupted and never reruns it; queued work is bounded',async()=>{
  let release;const gate=new Promise(r=>release=r);const f=fixture(async()=>gate);try {const {messaging,thread,taskId,at,storage}=f;
    const call=f.bindCall(thread.id,'尚未完成');const sent=messaging.sendFromTask(call.scope,call.args);
    messaging.dispatchPending();await wait(()=>storage.db.prepare("SELECT status FROM bot_message_turns WHERE incoming_message_id=?").get(sent.message.id).status==='running');
    assert.equal(messaging.recover(at),1);const afterRestart=new BotMessaging(storage,async()=>{assert.fail('interrupted work must not rerun');},{resolve(){throw Error('not used');}});afterRestart.dispatchPending();assert.equal(afterRestart.active.size,0);
    assert.equal(storage.db.prepare("SELECT status FROM bot_message_turns WHERE incoming_message_id=?").get(sent.message.id).status,'interrupted');
    release('late result');await new Promise(r=>setTimeout(r,10));assert.equal(messaging.messages({kind:'owner'},thread.id).length,1);
  } finally {release?.('cleanup');await f.messaging.close();f.storage.close();}
});

test('an abort does not release a provider slot until the ignored call settles, and shutdown does not claim queued turns',async()=>{
  let release;const gate=new Promise(r=>release=r),started=[];const f=fixture(async input=>{started.push(input.botId);if(started.length===1)return gate;return 'later';},{maxConcurrent:2});
  try {const {messaging,thread,storage}=f;const call=f.bindCall(thread.id,'first');const incoming=messaging.sendFromTask(call.scope,call.args).message;
    const secondId='queued-second';storage.db.prepare("INSERT INTO bot_messages(id,thread_id,sender_bot_id,recipient_bot_id,body,created_at) VALUES(?,?, 'bot-a','bot-b','second',?)").run(secondId,thread.id,f.at);
    storage.db.prepare("INSERT INTO bot_message_turns(id,incoming_message_id,thread_id,recipient_bot_id,status,created_at) VALUES('turn-second',?,?, 'bot-b','queued',?)").run(secondId,thread.id,f.at);
    messaging.dispatchPending();await wait(()=>started.length===1);const firstTurn=storage.db.prepare("SELECT id FROM bot_message_turns WHERE status='running'").get().id;
    messaging.active.get(firstTurn).abort(new Error('controlled cancellation'));messaging.dispatchPending();assert.equal(started.length,1);assert.equal(messaging.active.size,1);
    release('late result');await wait(()=>started.length===2);await wait(()=>Number(storage.db.prepare("SELECT count(*) n FROM bot_message_turns WHERE status IN ('queued','running')").get().n)===0);
  } finally {release?.('cleanup');await f.messaging.close();f.storage.close();}
});

test('close reports an active ignored-abort provider and keeps its recipient lock until it settles',async()=>{
  let release;const gate=new Promise(r=>release=r),calls=[];const f=fixture(async input=>{calls.push(input.botId);return gate;},{maxConcurrent:1,closeTimeoutMs:30});
  try {const {messaging,thread,storage}=f;const call=f.bindCall(thread.id,'active');const sent=messaging.sendFromTask(call.scope,call.args).message;
    const queuedId='close-queued';storage.db.prepare("INSERT INTO bot_messages(id,thread_id,sender_bot_id,recipient_bot_id,body,created_at) VALUES(?,?, 'bot-a','bot-b','queued',?)").run(queuedId,thread.id,f.at);
    storage.db.prepare("INSERT INTO bot_message_turns(id,incoming_message_id,thread_id,recipient_bot_id,status,created_at) VALUES('close-turn',?,?, 'bot-b','queued',?)").run(queuedId,thread.id,f.at);
    messaging.dispatchPending();await wait(()=>calls.length===1);const activeTurn=storage.db.prepare("SELECT id FROM bot_message_turns WHERE status='running'").get().id;await assert.rejects(messaging.close(),{code:'message-provider-still-active'});
    assert.equal(storage.db.prepare('SELECT status FROM bot_message_turns WHERE id=?').get(activeTurn).status,'interrupted');
    assert.equal(Number(storage.db.prepare("SELECT count(*) n FROM bot_message_turns WHERE status='queued'").get().n),1);assert.equal(calls.length,1);assert.equal(messaging.activeRecipients.has('bot-b'),true);
    release('late');await wait(()=>messaging.active.size===0);await messaging.close();assert.equal(messaging.activeRecipients.has('bot-b'),false);
  } finally {release?.('late');await f.messaging.close();f.storage.close();}
});

test('two turns for one recipient execute sequentially even when global capacity is two',async()=>{
  let release;const gate=new Promise(r=>release=r),started=[];const f=fixture(async input=>{started.push(input.incomingBody);if(started.length===1)return gate;return 'second reply';},{maxConcurrent:2});
  try {const {messaging,thread,storage}=f;const first=f.bindCall(thread.id,'first','call-1'),second=f.bindCall(thread.id,'second','call-2');
    messaging.sendFromTask(first.scope,first.args);messaging.sendFromTask(second.scope,second.args);messaging.dispatchPending();await wait(()=>started.length===1);assert.equal(started[0],'first');
    release('first reply');await wait(()=>started.length===2);assert.equal(started[1],'second');await wait(()=>Number(storage.db.prepare("SELECT count(*) n FROM bot_message_turns WHERE status='completed'").get().n)===2);
  } finally {release?.('cleanup');await f.messaging.close();f.storage.close();}
});

test('expired queued messages are terminal and are never sent to the executor',()=>{
  let calls=0;const f=fixture(async()=>{calls++;return 'unexpected';});try {const {messaging,thread,storage}=f;const old=new Date(Date.now()-11*60_000).toISOString();
    storage.db.prepare("INSERT INTO bot_messages(id,thread_id,sender_bot_id,recipient_bot_id,body,created_at) VALUES('expired-message',?,?,?,'old',?)").run(thread.id,'bot-a','bot-b',old);
    storage.db.prepare("INSERT INTO bot_message_turns(id,incoming_message_id,thread_id,recipient_bot_id,status,created_at) VALUES('expired-turn','expired-message',?,?,'queued',?)").run(thread.id,'bot-b',old);
    messaging.dispatchPending();assert.equal(storage.db.prepare("SELECT status FROM bot_message_turns WHERE id='expired-turn'").get().status,'failed');assert.equal(calls,0);
  } finally {f.storage.close();}
});

test('pre-provider context failure releases the slot and recipient lock',async()=>{
  let calls=0;const f=fixture(async()=>{calls++;return 'unexpected';});try {const {messaging,thread,storage}=f;
    const call=f.bindCall(thread.id,'will fail before model');const sent=messaging.sendFromTask(call.scope,call.args).message;
    messaging.context=()=>{throw new Error('injected context read failure');};messaging.dispatchPending();
    await wait(()=>storage.db.prepare('SELECT status FROM bot_message_turns WHERE incoming_message_id=?').get(sent.id).status==='failed');
    await wait(()=>messaging.active.size===0);assert.equal(messaging.activeRecipients.has('bot-b'),false);assert.equal(calls,0);await messaging.close();
  } finally {await f.messaging.close();f.storage.close();}
});

test('pair revocation and queued turn failure commit atomically',()=>{
  const f=fixture();try {const {messaging,thread,storage}=f;const call=f.bindCall(thread.id,'queued');const sent=messaging.sendFromTask(call.scope,call.args).message;
    storage.db.exec(`CREATE TRIGGER fail_queued_turn_update BEFORE UPDATE ON bot_message_turns WHEN OLD.status='queued' BEGIN SELECT RAISE(ABORT,'injected failure'); END;`);
    assert.throws(()=>messaging.revokePair({kind:'owner'},thread.id,f.at));
    assert.equal(storage.db.prepare('SELECT revoked_at FROM bot_message_threads WHERE id=?').get(thread.id).revoked_at,null);
    assert.equal(storage.db.prepare('SELECT status FROM bot_message_turns WHERE incoming_message_id=?').get(sent.id).status,'queued');
    storage.db.exec('DROP TRIGGER fail_queued_turn_update');messaging.revokePair({kind:'owner'},thread.id,f.at);
    assert(storage.db.prepare('SELECT revoked_at FROM bot_message_threads WHERE id=?').get(thread.id).revoked_at);
    assert.equal(storage.db.prepare('SELECT status FROM bot_message_turns WHERE incoming_message_id=?').get(sent.id).status,'failed');
  } finally {f.storage.close();}
});

test('empty revoked_at is treated as revoked, timestamps use server time, and only owner may revoke',()=>{
  const f=fixture();try {const {messaging,thread,storage}=f;
    assert.throws(()=>messaging.revokePair({kind:'bot'},thread.id),{code:'owner-required'});
    storage.db.prepare("UPDATE bot_message_threads SET revoked_at='',updated_at='' WHERE id=?").run(thread.id);
    const call=f.bindCall(thread.id,'must be refused');assert.throws(()=>messaging.sendFromTask(call.scope,call.args),{code:'message-thread-revoked'});
    const restored=messaging.authorizePair({kind:'owner'},'bot-a','bot-b');assert.equal(restored.replayed,false);assert.equal(restored.thread.revokedAt,null);assert.notEqual(restored.thread.updatedAt,'');
    messaging.revokePair({kind:'owner'},thread.id,'');const revoked=storage.db.prepare('SELECT revoked_at FROM bot_message_threads WHERE id=?').get(thread.id).revoked_at;
    assert.equal(typeof revoked,'string');assert.notEqual(revoked,'');assert(Number.isFinite(Date.parse(revoked)));
  } finally {f.storage.close();}
});

test('turn-state write failure is recorded, does not leak locks, and is reported by close',async()=>{
  let calls=0;const f=fixture(async()=>{calls++;throw new Error('provider must not be reached');});try {const {messaging,thread,storage}=f;
    const call=f.bindCall(thread.id,'pre-provider failure');messaging.sendFromTask(call.scope,call.args);
    messaging.context=()=>{throw new Error('injected context failure');};
    storage.db.exec(`CREATE TRIGGER fail_terminal_turn_update BEFORE UPDATE ON bot_message_turns WHEN OLD.status='running' BEGIN SELECT RAISE(ABORT,'injected persistence failure'); END;`);
    messaging.dispatchPending();await wait(()=>messaging.status().failures.length===1);
    assert.equal(messaging.status().failures[0].code,'message-state-persistence-failed');assert.equal(messaging.active.size,0);assert.equal(messaging.activeRecipients.size,0);assert.equal(calls,0);
    await assert.rejects(messaging.close(),{code:'message-persistence-failed'});
  } finally {f.storage.close();}
});

test('provider-settled reply and terminal-state write failures release locks and propagate without unhandled rejection',async()=>{
  let calls=0,unhandled=0;const onUnhandled=()=>{unhandled++;};process.on('unhandledRejection',onUnhandled);
  const f=fixture(async()=>{calls++;return 'model reply that cannot persist';});try {const {messaging,thread,storage}=f;
    const call=f.bindCall(thread.id,'provider is actually invoked');messaging.sendFromTask(call.scope,call.args);
    storage.db.exec(`CREATE TRIGGER fail_reply_insert BEFORE INSERT ON bot_messages WHEN NEW.reply_to_message_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'injected reply persistence failure'); END;
      CREATE TRIGGER fail_terminal_update BEFORE UPDATE ON bot_message_turns WHEN OLD.status='running' AND NEW.status<>'running' BEGIN SELECT RAISE(ABORT,'injected terminal persistence failure'); END;`);
    messaging.dispatchPending();await wait(()=>messaging.status().failures.length===1);await wait(()=>messaging.active.size===0);
    assert.equal(calls,1);assert.equal(messaging.activeRecipients.size,0);assert.equal(messaging.status().activeProviders,0);
    await new Promise(r=>setTimeout(r,0));assert.equal(unhandled,0);await assert.rejects(messaging.close(),{code:'message-persistence-failed'});
  } finally {process.off('unhandledRejection',onUnhandled);f.storage.close();}
});

test('revoke aborts its active thread from memory after commit without a follow-up database lookup',async()=>{
  let release,signal;const gate=new Promise(r=>release=r);const f=fixture(async input=>{signal=input.signal;return gate;});try {const {messaging,thread}=f;
    const call=f.bindCall(thread.id,'active before revoke');messaging.sendFromTask(call.scope,call.args);messaging.dispatchPending();await wait(()=>signal);
    messaging.turn=()=>{throw new Error('revoke must not query turns after its transaction commits');};
    const revoked=messaging.revokePair({kind:'owner'},thread.id);assert(revoked.revokedAt);assert.equal(signal.aborted,true);
    release('late reply');await wait(()=>messaging.active.size===0);await messaging.close();
  } finally {release?.('cleanup');await f.messaging.close().catch(()=>{});f.storage.close();}
});

test('send after close is rejected before any message or queued turn is persisted',async()=>{
  const f=fixture();try {const {messaging,thread,storage}=f;const call=f.bindCall(thread.id,'must not persist');await messaging.close();
    assert.throws(()=>messaging.sendFromTask(call.scope,call.args),{code:'message-service-closed'});
    assert.equal(storage.db.prepare('SELECT count(*) n FROM bot_messages').get().n,0);
    assert.equal(storage.db.prepare('SELECT count(*) n FROM bot_message_turns').get().n,0);
  } finally {await f.messaging.close();f.storage.close();}
});
