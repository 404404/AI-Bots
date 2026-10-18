// THROWAWAY #2245. macOS installed DSH, fresh task-owned Profile/browser only.
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,symlinkSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
import {prepareThemeCompatibility} from './prepare-theme-compat.mjs';
const here=dirname(fileURLToPath(import.meta.url)),source=process.env.BH_SOURCE_ROOT??process.cwd();
const {devSecretEnvironment}=await import(pathToFileURL(join(source,'scripts/dev-secret.mjs')));
const store=join(source,'node_modules/.pnpm'),puppeteer=createRequire(join(store,readdirSync(store).find(x=>x.startsWith('puppeteer@')),'node_modules/'))('puppeteer');
const root=mkdtempSync(join(tmpdir(),'bh-2245-zoom-')),port=Number(process.env.ZOOM_PROTOTYPE_DEBUG_PORT??39445);
const app='/Applications/DeepSeek Harness.app',asar=join(app,'Contents/Resources/app.asar');
const pause=ms=>new Promise(r=>setTimeout(r,ms));let interrupted=false;
for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>{interrupted=true;});
function ownedPid(){let pid;try{pid=Number(execFileSync('lsof',['-t',`-iTCP:${port}`,'-sTCP:LISTEN'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim());}catch{return null;}if(!Number.isInteger(pid)||pid<=0)throw Error('Ambiguous debug listener');const cmd=execFileSync('ps',['-p',String(pid),'-o','command='],{encoding:'utf8'});if(!cmd.includes(`--user-data-dir=${root}/browser`))throw Error('Debug port belongs to another task');return pid;}
async function stop(){const pid=ownedPid();if(!pid)return;process.kill(pid,'SIGTERM');for(let n=0;n<100;n++){try{process.kill(pid,0);}catch{return;}await pause(100);}try{process.kill(pid,'SIGKILL');}catch{}for(let n=0;n<30&&ownedPid()!==null;n++)await pause(100);}
async function launch(){const child=spawn('open',['-n','-a',app,'--env',`DSH_HOME=${root}/home`,'--stdout',join(root,'private.log'),'--stderr',join(root,'private.log'),'--args',`--user-data-dir=${root}/browser`,`--remote-debugging-port=${port}`],{env:{...process.env,...devSecretEnvironment()},stdio:'ignore'});await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('LaunchServices failed')));});}
async function ready(probe=false){const deadline=Date.now()+45000;while(Date.now()<deadline&&!interrupted){let b;try{const info=await(await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(500)})).json();b=await puppeteer.connect({browserWSEndpoint:info.webSocketDebuggerUrl,defaultViewport:null,protocolTimeout:3000});const p=(await b.pages()).find(x=>x.url().startsWith('dsh-app://app/'));if(p&&await p.evaluate(probe=>Boolean(window.dshDesktop)&&(!probe||window.__zoomProbe?.snapshot().config==='ready')&&!document.body.innerText.includes('Loading plugins'),probe))return;}catch{}finally{b?.disconnect();}await pause(200);}throw Error('Owned desktop did not finish boot; inspect its private log.');}
try{
 if(ownedPid()!==null)throw Error('Debug port occupied');
 await launch();await ready();await stop();
 const profile=join(root,'home/profiles/desktop'),manifest=join(profile,'package.json'),data=JSON.parse(readFileSync(manifest));data.dependencies['@botharness/zoom-prototype']='link:'+here;writeFileSync(manifest,JSON.stringify(data,null,2));
 const link=join(profile,'node_modules/@botharness/zoom-prototype');mkdirSync(dirname(link),{recursive:true});symlinkSync(here,link);
 const patch=join(profile,'cordis.patch.yml');writeFileSync(patch,readFileSync(patch,'utf8').replace(/^\s*\[\]\s*$/m,'')+'\n- insert:\n    - id: zoom-prototype\n      name: "@botharness/zoom-prototype"\n');
 if(process.env.ZOOM_PROTOTYPE_THEME_COMPAT!=='0')prepareThemeCompatibility(root,asar);
 await launch();await ready(true);writeFileSync(join(root,'owned-instance.json'),JSON.stringify({pid:ownedPid(),debugPort:port}),{mode:0o600});
 console.log('Disposable desktop prototype ready; Ctrl+C stops only this instance.');
 while(!interrupted&&ownedPid()!==null)await pause(1000);
}finally{await stop();console.log('Owned prototype stopped; private temporary Profile retained at '+root);}
