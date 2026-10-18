// THROWAWAY: use the existing webview input API, with a non-conflicting native positive control.
import {createRequire} from 'node:module';import {readdirSync,writeFileSync} from 'node:fs';import {join,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
const s=join(process.env.BH_SOURCE_ROOT,'node_modules/.pnpm'),p=createRequire(join(s,readdirSync(s).find(x=>x.startsWith('puppeteer@')),'node_modules/'))('puppeteer');
const b=await p.connect({browserURL:`http://127.0.0.1:${process.env.ZOOM_PROTOTYPE_DEBUG_PORT??39445}`,defaultViewport:null});const page=(await b.pages()).find(x=>x.url().startsWith('dsh-app://app/'));const results=[];
try{
 await page.evaluate(()=>{window.__zoomProbe.set(0,'guest-reset');window.__probeNativeEvents=[];window.__probeUnsubscribe=window.dshDesktop.keyboard.subscribe(e=>window.__probeNativeEvents.push({kind:e.kind,code:e.code}));});
 const w=await page.$('#zoom-guest');const r=await w.boundingBox();await page.mouse.click(r.x+50,r.y+45);await page.evaluate(()=>document.querySelector('#zoom-guest').focus());
 for(const keyCode of ['Y','=']){
  await page.evaluate(keyCode=>{const w=document.querySelector('#zoom-guest');w.sendInputEvent({type:'keyDown',keyCode,modifiers:['meta']});w.sendInputEvent({type:'keyUp',keyCode,modifiers:['meta']});},keyCode);
  await new Promise(r=>setTimeout(r,500));results.push({keyCode,...await page.evaluate(()=>({level:window.__zoomProbe.state.level,events:window.__probeNativeEvents,focus:document.activeElement?.id,guestZoom:document.querySelector('#zoom-guest').getZoomFactor()}))});
 }
 await page.evaluate(()=>window.__probeUnsubscribe());
 writeFileSync(join(dirname(fileURLToPath(import.meta.url)),'evidence/guest-native-input.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{b.disconnect();}
