import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../src/storage.ts';
import { GroupChat, GroupChatSql } from '../src/group-chat.ts';

const roots=[]; const dir=()=>{const p=mkdtempSync(join(tmpdir(),'group-chat-'));roots.push(p);return p;};
after(()=>{for(const p of roots)rmSync(p,{recursive:true,force:true});});
function fixture(execute, options={}) {
  const storage=new Storage(dir()), at=new Date().toISOString();
  const add=storage.db.prepare('INSERT INTO bots(id,slug,name,persona,config,credential,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)');
  for(const [id,name] of [['bot-a','甲'],['bot-b','乙'],['bot-c','丙']])add.run(id,id,name,'persona','{}',null,at,at);
  storage.db.exec(GroupChatSql);
  const calls=[];
  const group=new GroupChat(storage,{resolve:(_botId,modelId)=>({config:{provider:'compatible',model:modelId},credential:null,sourceModelEpoch:1}),assertAuthorized:epoch=>assert.equal(epoch,1),readMemory:id=>[{path:'notes.md',body:`only-${id}`}],execute:async args=>{calls.push(args);return execute?execute(args):`${args.botId} replied`;}},options);
  return {storage,group,calls};
}
const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw new Error('fixture-timeout');};

test('group send persists stable senders and executes explicitly selected members in order with isolated context',async()=>{
  const f=fixture();try{const {group,storage,calls}=f;const created=group.create({name:'项目',memberBotIds:['bot-a','bot-b']});const id=created.group.id;
    const sent=group.send({groupId:id,text:'请看这个',modelId:'synthetic-model',recipientBotIds:['bot-a','bot-b'],idempotencyKey:'send-1'});
    await wait(()=>group.get(id).runs.every(r=>r.status==='completed'));
    assert.deepEqual(calls.map(c=>c.botId),['bot-a','bot-b']);assert.equal(calls[1].history.some(m=>m.senderId==='bot-a'),true);
    assert.deepEqual(calls[0].memory,[{path:'notes.md',body:'only-bot-a'}]);assert.deepEqual(calls[1].memory,[{path:'notes.md',body:'only-bot-b'}]);
    const data=group.messages(id);assert.deepEqual(data.items.map(m=>m.senderId),['user','bot-a','bot-b']);assert.equal(data.items[1].senderName,'甲');
    const replay=group.send({groupId:id,text:'请看这个',modelId:'synthetic-model',recipientBotIds:['bot-a','bot-b'],idempotencyKey:'send-1'});assert.deepEqual(replay.runs.map(r=>r.id),sent.runs.map(r=>r.id));assert.equal(calls.length,2);
    assert.equal(storage.db.prepare('SELECT count(*) n FROM messages').get().n,0);
  }finally{await f.group.close();f.storage.close();}
});

test('member removal atomically discards a late reply and cancellation remains visible',async()=>{
  let release;const gate=new Promise(r=>release=r);const f=fixture(async()=>{await gate;return 'late';});try{const {group,storage}=f;const id=group.create({name:'临时',memberBotIds:['bot-a']}).group.id;
    const sent=group.send({groupId:id,text:'开始',modelId:'synthetic-model',recipientBotIds:['bot-a'],idempotencyKey:'late-1'});await wait(()=>group.get(id).runs[0].status==='running');
    group.setMembers(id,['bot-b']);group.setMembers(id,['bot-a']);release();await wait(()=>group.get(id).runs[0].status==='failed');
    assert.equal(group.messages(id).items.length,1);assert.equal(group.get(id).runs[0].errorCode,'group-member-removed');assert.deepEqual(group.get(id).group.members.map(m=>m.botId),['bot-a']);
    const next=group.send({groupId:id,text:'点名已移除成员',modelId:'synthetic-model',recipientBotIds:['bot-b'],idempotencyKey:'invalid-2'});assert.fail(`unexpected send ${JSON.stringify(next)}`);
  }catch(error){assert.equal(error.code,'group-member-not-found');}finally{release?.();await f.group.close();f.storage.close();}
});

test('interrupted runs are not replayed after restart and unselected recipients are refused',async()=>{
  let release;const gate=new Promise(r=>release=r);const f=fixture(async()=>{await gate;return 'late';});const {group,storage}=f;
  try{const id=group.create({name:'恢复',memberBotIds:['bot-a']}).group.id;assert.throws(()=>group.send({groupId:id,text:'no target',modelId:'synthetic-model',recipientBotIds:[],idempotencyKey:'none'}),{code:'group-recipient-required'});
    group.send({groupId:id,text:'interrupt',modelId:'synthetic-model',recipientBotIds:['bot-a'],idempotencyKey:'reboot'});await wait(()=>group.get(id).runs[0].status==='running');
    const recovery=new GroupChat(storage,{resolve:()=>{throw Error('should not run');},assertAuthorized:()=>{},readMemory:()=>[],execute:async()=>''}); recovery.recover();
    assert.equal(group.get(id).runs[0].status,'interrupted');release();
  }finally{release?.();await group.close();storage.close();}
});

test('group history pages backward with an authenticated stable cursor',async()=>{const f=fixture();try{const {group,storage}=f;const id=group.create({name:'历史',memberBotIds:['bot-a']}).group.id;const insert=storage.db.prepare("INSERT INTO chat_group_messages(id,group_id,sender_type,sender_id,sender_name,content,created_at) VALUES(?,?,'user','user','你',?,?)");for(let i=0;i<105;i++)insert.run(`m-${String(i).padStart(3,'0')}`,id,String(i),new Date(Date.UTC(2026,0,1,0,0,i)).toISOString());const first=group.messages(id,{limit:50});assert.equal(first.items[0].content,'55');assert.equal(first.items.at(-1).content,'104');assert(first.nextCursor);const older=group.messages(id,{limit:50,cursor:first.nextCursor});assert.equal(older.items[0].content,'5');assert.equal(older.items.at(-1).content,'54');assert.throws(()=>group.messages(id,{limit:50,cursor:'forged'}),{code:'invalid-cursor'});}finally{await f.group.close();f.storage.close();}});

test('an adapter that ignores abort cannot hold status or close open and its late result is discarded',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);const f=fixture(async()=>gate);const {group,storage}=f;
  try{const id=group.create({name:'取消',memberBotIds:['bot-a']}).group.id;const sent=group.send({groupId:id,text:'hang',modelId:'synthetic-model',recipientBotIds:['bot-a'],idempotencyKey:'cancel-hang'});await wait(()=>group.get(id).runs[0].status==='running');
    group.cancel(id,sent.runs[0].id);await wait(()=>group.get(id).runs[0].status==='cancelled'&&group.active.size===0);
    const closed=await Promise.race([group.close(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('close-hung')),100))]);assert.deepEqual(closed.detachedRunIds,[sent.runs[0].id]);
    assert.equal(group.messages(id).items.length,1);release('late completion');await wait(()=>group.detached.size===0);assert.equal(group.messages(id).items.length,1);
  }finally{release?.('cleanup');await group.close();storage.close();}
});

test('an ignored abort at deadline becomes terminal and detached calls count against capacity until settled',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);const f=fixture(async()=>gate,{deadlineMs:30});const {group,storage}=f;
  try{const firstGroup=group.create({name:'一',memberBotIds:['bot-a']}).group.id;const first=group.send({groupId:firstGroup,text:'timeout',modelId:'synthetic-model',recipientBotIds:['bot-a'],idempotencyKey:'timeout-hang'});await wait(()=>group.run(firstGroup,first.runs[0].id).run.status==='failed');
    assert.equal(group.run(firstGroup,first.runs[0].id).run.errorCode,'group-deadline-exceeded');assert.equal(group.detached.size,1);
    const secondGroup=group.create({name:'二',memberBotIds:['bot-b']}).group.id;group.send({groupId:secondGroup,text:'hang2',modelId:'synthetic-model',recipientBotIds:['bot-b'],idempotencyKey:'hang2'});await wait(()=>group.get(secondGroup).runs[0].status==='failed');
    const thirdGroup=group.create({name:'三',memberBotIds:['bot-c']}).group.id;group.send({groupId:thirdGroup,text:'hang3',modelId:'synthetic-model',recipientBotIds:['bot-c'],idempotencyKey:'hang3'});await wait(()=>group.get(thirdGroup).runs[0].status==='failed');assert.equal(group.detached.size,3);
    const fourthGroup=group.create({name:'四',memberBotIds:['bot-a']}).group.id;assert.throws(()=>group.send({groupId:fourthGroup,text:'blocked',modelId:'synthetic-model',recipientBotIds:['bot-a'],idempotencyKey:'blocked'}),{code:'group-capacity'});
    release('late completion');await wait(()=>group.detached.size===0);const next=group.send({groupId:fourthGroup,text:'after settle',modelId:'synthetic-model',recipientBotIds:['bot-a'],idempotencyKey:'after'});await wait(()=>group.run(fourthGroup,next.runs[0].id).run.status==='failed'||group.run(fourthGroup,next.runs[0].id).run.status==='completed');
    assert.equal(group.messages(firstGroup).items.filter(m=>m.senderType==='bot').length,0);
  }finally{release?.('cleanup');await group.close();storage.close();}
});
