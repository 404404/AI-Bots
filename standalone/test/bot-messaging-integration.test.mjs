import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { zstdDecompressSync } from 'node:zlib';
import { BotApplication } from '../src/application.ts';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';

const owner=(app,command,params={})=>app.execute(command,params,{kind:'owner'});
const toolSse=(threadId)=>{
  const args=JSON.stringify({threadId,body:'请给我一条独立建议。'});
  const events=[
    {type:'response.created',response:{id:'message-tool-response'}},
    {type:'response.output_item.added',output_index:0,item:{id:'call-item',type:'function_call',call_id:'bot-message-call',name:'send_bot_message',arguments:''}},
    {type:'response.function_call_arguments.delta',output_index:0,delta:args},
    {type:'response.function_call_arguments.done',output_index:0,arguments:args},
    {type:'response.output_item.done',output_index:0,item:{id:'call-item',type:'function_call',call_id:'bot-message-call',name:'send_bot_message',arguments:args}},
    {type:'response.completed',response:{id:'message-tool-response',status:'completed',usage:{input_tokens:1,output_tokens:2,total_tokens:3}}},
  ];
  return events.map(event=>`data: ${JSON.stringify(event)}\n\n`).join('');
};
const textSse=(text,id='message-reply')=>{
  const item={id,type:'message',role:'assistant',content:[{type:'output_text',text}]};
  const events=[{type:'response.created',response:{id}},{type:'response.output_item.added',output_index:0,item:{...item,content:[]}},{type:'response.output_text.delta',output_index:0,delta:text},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id,status:'completed',usage:{input_tokens:1,output_tokens:2,total_tokens:3}}}];
  return events.map(event=>`data: ${JSON.stringify(event)}\n\n`).join('');
};
const decodeRequest=init=>{const bytes=Buffer.from(init.body);return JSON.parse(new Headers(init.headers).get('content-encoding')==='zstd'?zstdDecompressSync(bytes).toString():bytes.toString());};

test('owner-authorized pair sends an actual Codex tool message and persists a recipient model reply (injected transports)',async()=>{
  const root=mkdtempSync(join(tmpdir(),'bot-message-e2e-'));
  const requests=[];let threadId='',toolInvoked=false;
  const transport={request:async(_url,init)=>{
    const request=decodeRequest(init);requests.push(request);
    const names=(request.tools??[]).map(tool=>tool.name);
    if(names.includes('send_bot_message')&&!toolInvoked){toolInvoked=true;return new Response(toolSse(threadId),{headers:{'content-type':'text/event-stream'}});}
    if(request.tools?.length)return new Response(textSse('已发送独立消息。','sender-final'),{headers:{'content-type':'text/event-stream'}});
    return new Response(textSse('这是收件 Bot 的模型生成答复。','recipient-reply'),{headers:{'content-type':'text/event-stream'}});
  }};
  const app=new BotApplication(root,transport);
  try{
    assert.equal(Number(app.storage.db.prepare('PRAGMA user_version').get().user_version),12);
    const a=await owner(app,'bots.create',{slug:'message-sender',name:'消息发起方',persona:'sender persona'});
    const b=await owner(app,'bots.create',{slug:'message-recipient',name:'消息接收方',persona:'recipient persona'});
    const pair=await owner(app,'bot-messages.authorize',{botAId:a.id,botBId:b.id});threadId=pair.thread.id;
    const codexModel=openaiCodexProvider().getModels()[0].id;
    const tokenPayload=Buffer.from(JSON.stringify({'https://api.openai.com/auth':{chatgpt_account_id:'synthetic-message-account'}})).toString('base64url');
    const access=`e30.${tokenPayload}.signature`;
    app.storage.db.prepare('UPDATE model_account SET oauth_credential=? WHERE singleton=1').run(app.storage.encrypt(JSON.stringify({type:'oauth',access,refresh:'synthetic-message-refresh',expires:Date.now()+3600000})));
    await owner(app,'model-account.update',{provider:'openai-codex',model:codexModel,keyless:true});
    const conversation=await owner(app,'conversations.create',{botId:a.id});
    const run=await owner(app,'runs.submit',{botId:a.id,conversationId:conversation.id,idempotencyKey:'actual-bot-message',content:'请联系授权对象。',selection:{kind:'global',modelId:codexModel}});
    await Promise.all([...app.active.values()].map(entry=>entry.done));
    for(let i=0;i<200;i++){
      const turn=app.storage.db.prepare('SELECT status FROM bot_message_turns WHERE incoming_message_id IN (SELECT id FROM bot_messages WHERE thread_id=? AND sender_bot_id=?)').get(threadId,a.id);
      if(turn?.status==='completed')break;
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    const threadMessages=await owner(app,'bot-messages.list',{threadId,limit:10});
    assert.equal(toolInvoked,true);
    assert.equal(threadMessages.length,2);
    assert.equal(threadMessages[0].senderBotId,a.id);
    assert.equal(threadMessages[0].taskId,run.taskId);
    assert.equal(threadMessages[0].sourceRunId,run.id);
    assert.equal(threadMessages[0].sourceConversationId,conversation.id);
    assert.equal(threadMessages[0].body,'请给我一条独立建议。');
    assert.equal(threadMessages[1].senderBotId,b.id);
    assert.equal(threadMessages[1].replyToMessageId,threadMessages[0].id);
    assert.equal(threadMessages[1].sourceRunId,run.id);
    assert.equal(threadMessages[1].sourceConversationId,conversation.id);
    assert.equal(threadMessages[1].body,'这是收件 Bot 的模型生成答复。');
    const receiverRequest=requests.find(request=>!(request.tools??[]).length);
    assert(receiverRequest);
    const encoded=JSON.stringify(receiverRequest);
    assert(encoded.includes('recipient persona'));
    assert(encoded.includes('请给我一条独立建议。'));
    assert(!encoded.includes('sender persona'));
    assert(!encoded.includes('synthetic-message-refresh'));
    assert.deepEqual((await owner(app,'bot-messages.threads')).map(thread=>thread.id),[threadId]);
    const linked=await owner(app,'bot-messages.timeline',{conversationId:conversation.id,limit:1});
    assert.equal(linked.items.length,1);
    assert.equal(linked.items[0].sourceConversationId,conversation.id);
    assert.equal(linked.nextCursor,linked.items[0].seq);
    const linkedNext=await owner(app,'bot-messages.timeline',{conversationId:conversation.id,afterSeq:linked.nextCursor,limit:1});
    assert.equal(linkedNext.items.length,1);
    assert.equal(linkedNext.items[0].replyToMessageId,threadMessages[0].id);
    await assert.rejects(app.execute('bot-messages.list',{threadId,limit:10},{kind:'bot',botId:a.id}),{code:'forbidden'});
  }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});

test('Application.close immediately observes BotMessaging close rejection without unhandled rejection',async()=>{
  const root=mkdtempSync(join(tmpdir(),'bot-message-close-'));
  const app=new BotApplication(root);
  const failure=new Error('injected immediate message close refusal');
  const unhandled=[];
  const onUnhandled=reason=>unhandled.push(reason);
  process.on('unhandledRejection',onUnhandled);
  app.botMessaging.close=()=>Promise.reject(failure);
  try{
    await assert.rejects(app.close(),error=>error===failure);
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.deepEqual(unhandled,[]);
  }finally{
    process.off('unhandledRejection',onUnhandled);
    app.storage.close();
    rmSync(root,{recursive:true,force:true});
  }
});
