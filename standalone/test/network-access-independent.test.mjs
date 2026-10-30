import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request } from 'node:http';
import { spawn } from 'node:child_process';
import { createNetworkAccessPolicy, configuredTrustedUrls, isPrivateOrLoopbackAddress, trustedHost, trustedOrigin } from '../src/network-access.ts';
import { startServer } from '../src/server.ts';

const roots=[];
const dir=()=>{const path=mkdtempSync(join(tmpdir(),'network-independent-'));roots.push(path);return path;};
after(()=>{for(const path of roots)rmSync(path,{recursive:true,force:true});});

test('NET01 private and loopback CIDR boundaries, mapped addresses and malformed input',()=>{
 const accepted=['10.0.0.0','10.255.255.255','172.16.0.0','172.31.255.255','192.168.0.0','192.168.255.255','100.64.0.0','100.127.255.255','127.0.0.1','127.255.255.255','::1','fc00::','fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff','::ffff:192.168.68.11','::ffff:10.250.250.1','::ffff:100.64.0.1'];
 const denied=['9.255.255.255','11.0.0.0','172.15.255.255','172.32.0.0','192.167.255.255','192.169.0.0','100.63.255.255','100.128.0.0','126.255.255.255','128.0.0.0','8.8.8.8','::ffff:8.8.8.8','fbff:ffff::','fe00::','2001:4860:4860::8888','fe80::1%eth0','', 'unknown','010.1.1.1'];
 for(const value of accepted)assert.equal(isPrivateOrLoopbackAddress(value),true,value);
 for(const value of denied)assert.equal(isPrivateOrLoopbackAddress(value),false,value);
});

test('NET02 trusted aliases are exact and reject malformed URL, host and origin',()=>{
 const policy=createNetworkAccessPolicy('http://192.168.68.11:20443',['http://10.250.250.1:20443','http://192.168.68.12:20443'],3080);
 for(const host of ['192.168.68.11:20443','10.250.250.1:20443','192.168.68.12:20443','127.0.0.1:20443','localhost:3080'])assert.equal(trustedHost(host,policy),true,host);
 for(const host of ['10.250.250.1:20444','10.250.250.2:20443','evil.example:20443','10.250.250.1:20443.evil','x@10.250.250.1:20443','10.250.250.1:20443/path','*',''])assert.equal(trustedHost(host,policy),false,host);
 for(const origin of ['http://10.250.250.1:20443','http://192.168.68.11:20443','http://localhost:3080'])assert.equal(trustedOrigin(origin,policy),true,origin);
 for(const origin of ['https://10.250.250.1:20443','http://10.250.250.1:20444','http://10.250.250.1:20443/path','http://evil.example:20443','null','*',''])assert.equal(trustedOrigin(origin,policy),false,origin);
 for(const url of ['http://user:pass@10.250.250.1:20443','http://10.250.250.1:20443/path','http://10.250.250.1:20443?x=1','http://10.250.250.1:20443/#x','file:///tmp/x','http://*'])assert.throws(()=>createNetworkAccessPolicy('http://127.0.0.1:20443',[url]),{code:'invalid-trusted-url'});
 for(const input of ['[','{}','[1]',JSON.stringify(Array(33).fill('http://a'))])assert.throws(()=>configuredTrustedUrls(input),{code:'invalid-trusted-url-config'});
});

test('NET02 authenticated HTTP and CLI honor aliases while refusing cross-origin and spoof headers',async()=>{
 const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));const root=dir(),base=`http://127.0.0.1:${port}`,alias=`10.250.250.1:${port}`;
 const runtime=await startServer({dataDir:root,port,host:'127.0.0.1',publicUrl:base,trustedUrls:[`http://${alias}`]});
 const send=(host,path,body,extra={})=>new Promise((resolve,reject)=>{const payload=JSON.stringify(body);const req=request({hostname:'127.0.0.1',port,path,method:'POST',headers:{host,'content-type':'application/json',...extra}},res=>{const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(Buffer.concat(chunks).toString())}));});req.on('error',reject);req.end(payload);});
 const cli=(command,jar)=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--experimental-strip-types','src/cli.ts',command],{cwd:process.cwd(),env:{...process.env,BOT_URL:base,BOT_SESSION_FILE:jar},stdio:['pipe','pipe','pipe']});let output='';p.stdout.on('data',x=>output+=x);p.on('error',reject);p.on('exit',code=>{try{resolve({code,body:JSON.parse(output)});}catch(e){reject(e);}});p.stdin.end('{}');});
 try{const command={command:'main.get',params:{}};assert.equal((await send(alias,'/api/v1/command',command,{origin:`http://${alias}`})).status,401);assert.equal((await send(`10.250.250.1:${port+1}`,'/api/v1/command',command)).body.error.code,'host-not-allowed');assert.equal((await send(alias,'/api/v1/command',command,{origin:`http://evil.example:${port}`})).body.error.code,'origin-not-allowed');assert.equal((await send(alias,'/api/v1/command',command,{'sec-fetch-site':'cross-site'})).body.error.code,'cross-site-refused');assert.equal((await send(alias,'/api/v1/command',command,{'x-forwarded-for':'10.1.2.3','x-forwarded-host':alias})).status,401);assert.equal((await send(`evil.example:${port}`,'/api/v1/command',command,{'x-forwarded-for':'10.1.2.3','x-forwarded-host':alias})).body.error.code,'host-not-allowed');
 const code=readFileSync(join(root,'secrets','access-code'),'utf8').trim();const login=await send(alias,'/api/v1/session',{code},{origin:`http://${alias}`});assert.equal(login.status,200);const cookie=login.headers['set-cookie'][0].split(';')[0],jar=join(root,'session');writeFileSync(jar,cookie,{mode:0o600});const direct=await send(alias,'/api/v1/command',command,{origin:`http://${alias}`,cookie});assert.equal(direct.status,200);const result=await cli('main.get',jar);assert.equal(result.code,0);assert.equal(result.body.result.bot.id,direct.body.result.bot.id);
 }finally{await runtime.close();}
});
