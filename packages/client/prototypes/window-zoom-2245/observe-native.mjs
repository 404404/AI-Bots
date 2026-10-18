import {createRequire} from 'node:module';import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';import {join,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));const p=createRequire(join(process.env.BH_SOURCE_ROOT??process.cwd(),'node_modules/.pnpm/puppeteer@25.11.0/node_modules/'))('puppeteer');const b=await p.connect({browserURL:`http://127.0.0.1:${process.env.ZOOM_PROTOTYPE_DEBUG_PORT??39445}`,defaultViewport:null,protocolTimeout:10000});const page=(await b.pages()).find(p=>p.url().startsWith('dsh-app://app/'));
const out=join(here,'evidence/round2');mkdirSync(out,{recursive:true});const [cmd,arg]=process.argv.slice(2);
try {
if(cmd==='setup'){await page.evaluate(()=>window.__zoomProbe.embeds('http://127.0.0.1:39446/'));await page.waitForFunction(()=>window.__zoomProbe.state.guestReady,{polling:250});}
if(cmd==='reset'){await page.evaluate(()=>{window.__zoomProbe.set(0,'driver-reset');window.__zoomProbe.clear();});}
if(cmd==='record')await page.evaluate(x=>window.__zoomProbe.recording(x),arg==='on');
if(cmd==='focus'){
 if(arg==='main')await page.focus('#zoom-edit');
 else if(arg==='guest')await page.evaluate(()=>{const w=document.querySelector('#zoom-guest');w.focus();return w.executeJavaScript("document.querySelector('#edit').focus();true")});
 else {const f=page.frames().find(f=>f.name()===`zoom-prototype-${arg}`);await f.focus('#edit');}
}
const data=await page.evaluate(async()=>{
 const style=getComputedStyle(document.body);const w=document.querySelector('#zoom-guest');
 const nativeButton=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('新会话'));
 return {probe:window.__zoomProbe.snapshot(),fontTokens:['--dsh-content-font-size','--dsh-code-font-size','--dsh-terminal-font-size'].map(x=>[x,style.getPropertyValue(x)]),ruler:document.querySelector('#zoom-ruler').getBoundingClientRect().width,sidebarWidth:nativeButton?.getBoundingClientRect().width,focus:document.activeElement?.id||document.activeElement?.tagName,documentFocused:document.hasFocus(),value:document.querySelector('#zoom-edit').value,guest:w?{nativeZoom:w.getZoomFactor(),focus:await w.executeJavaScript('document.activeElement?.id'),value:await w.executeJavaScript("document.querySelector('#edit')?.value")}:null,themeRows:window.__DSH_BOOT__?.entries.filter(x=>x.id==='@deepseek-ai/dsh-client-ui-theme').length};
});
data.frames=[];for(const name of ['local','cross']){const f=page.frames().find(f=>f.name()===`zoom-prototype-${name}`);if(f)data.frames.push({name,...await f.evaluate(()=>({focus:document.activeElement?.id,value:document.querySelector('#edit')?.value,ruler:document.querySelector('#ruler')?.getBoundingClientRect().width}))});}
if(cmd==='snapshot'){const file=join(out,'native-system-input.json');const records=existsSync(file)?JSON.parse(readFileSync(file)):[];records.push({label:arg,input:'OS key through cua_repl, setup/readback through isolated CDP',...data});writeFileSync(file,JSON.stringify(records,null,2));await page.screenshot({path:join(out,arg+'.png')});}
console.log(JSON.stringify({label:arg,level:data.probe.state.level,actions:data.probe.state.actions.length,native:data.probe.state.native.length,focus:data.focus,fonts:data.fontTokens,guestZoom:data.guest?.nativeZoom}));
}finally{b.disconnect();}
