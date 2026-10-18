// THROWAWAY #2245. Starts ONLY a fresh task-owned Profile and browser directory.
// macOS installed DSH, no app/ASAR modifications and no package installation.
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,openSync,existsSync,symlinkSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
const here=dirname(fileURLToPath(import.meta.url));
const source=process.env.BH_SOURCE_ROOT??process.cwd();
const {devSecretEnvironment}=await import(pathToFileURL(join(source,'scripts/dev-secret.mjs')));
const store=join(source,'node_modules/.pnpm');
const puppeteer=createRequire(join(store,readdirSync(store).find(x=>x.startsWith('puppeteer@')),'node_modules/'))('puppeteer');
const root=mkdtempSync(join(tmpdir(),'bh-2245-zoom-'));
const port=Number(process.env.ZOOM_PROTOTYPE_DEBUG_PORT??39445);
try {await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(500)});throw new Error('Debug port occupied; choose ZOOM_PROTOTYPE_DEBUG_PORT.');}catch(e){if(e.message.startsWith('Debug port'))throw e;}
const env={...process.env,...devSecretEnvironment(),DSH_HOME:join(root,'home'),DSH_DESKTOP_DIAGNOSTIC_FILE:join(root,'fatal.txt')};
const executable='/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness';
const launch=()=>spawn(executable,[`--user-data-dir=${root}/browser`,`--remote-debugging-port=${port}`],{env,stdio:['ignore',openSync(join(root,'desktop.log'),'a',0o600),openSync(join(root,'desktop.log'),'a',0o600)]});
let child;
async function stop(){if(!child||child.exitCode!==null)return;const c=child;await new Promise(resolve=>{const timer=setTimeout(()=>c.kill('SIGKILL'),5000);c.once('exit',()=>{clearTimeout(timer);resolve();});c.kill('SIGTERM');});}
async function ready(probe=false){for(let n=0;n<60;n++){let b;try{b=await puppeteer.connect({browserURL:`http://127.0.0.1:${port}`,defaultViewport:null});const p=(await b.pages()).find(x=>x.url().startsWith('dsh-app://app/'));if(p&&await p.evaluate(probe=>probe?Boolean(window.__zoomProbe):Boolean(window.dshDesktop),probe))return;}catch{}finally{b?.disconnect();}await new Promise(r=>setTimeout(r,500));}throw new Error('Owned desktop did not become ready; inspect private task log.');}
try{
 child=launch();await ready();await stop();
 const profile=join(root,'home/profiles/desktop');const manifest=join(profile,'package.json');const data=JSON.parse(readFileSync(manifest));data.dependencies['@botharness/zoom-prototype']='link:'+here;writeFileSync(manifest,JSON.stringify(data,null,2));
 const link=join(profile,'node_modules/@botharness/zoom-prototype');mkdirSync(dirname(link),{recursive:true});symlinkSync(here,link);
 const patch=join(profile,'cordis.patch.yml');writeFileSync(patch,readFileSync(patch,'utf8')+'\n- insert:\n    - id: zoom-prototype\n      name: "@botharness/zoom-prototype"\n');
 child=launch();await ready(true);console.log('Disposable desktop prototype is ready. Ctrl+C stops only this instance.');
 writeFileSync(join(root,'owned-instance.json'),JSON.stringify({pid:child.pid,debugPort:port}),{mode:0o600});
 await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);child.once('exit',resolve);});
}finally{await stop();console.log('Owned prototype stopped. Temporary evidence/profile retained at '+root);}
