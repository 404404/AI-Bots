// THROWAWAY experiment driver, not a production test suite.
import {createRequire} from 'node:module';
import {readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
const here=dirname(fileURLToPath(import.meta.url));
const store=join(process.env.BH_SOURCE_ROOT??process.cwd(),'node_modules/.pnpm');
const entry=readdirSync(store).find(x=>x.startsWith('puppeteer@'));
const puppeteer=createRequire(join(store,entry,'node_modules/'))('puppeteer');
const output=join(here,'evidence');mkdirSync(output,{recursive:true});
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<html><body style="margin:8px;background:white;color:black"><div id="ruler" style="width:100px;height:15px;background:teal"></div><input id="edit" value="cross-origin fixture"><p>Embedded content</p></body></html>');});
await new Promise(r=>server.listen(39446,'127.0.0.1',r));
const browser=await puppeteer.connect({browserURL:`http://127.0.0.1:${process.env.ZOOM_PROTOTYPE_DEBUG_PORT??39445}`,defaultViewport:null});
const page=(await browser.pages()).find(p=>p.url().startsWith('dsh-app://app/'));
const result={kind:'native-desktop-prototype',browser:await browser.version(),input:'CDP keyboard input, not physical keyboard/Human QA',steps:[],console:[]};
page.on('pageerror',e=>result.console.push({kind:'pageerror',message:e.message}));page.on('console',m=>{if(['error','warn'].includes(m.type()))result.console.push({kind:m.type(),message:m.text()});});
const settle=()=>new Promise(r=>setTimeout(r,250));
async function snapshot(label,shot=false){await settle();const data=await page.evaluate(()=>{
 const rect=e=>e?{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}:null;
 const native=[...document.querySelectorAll('button')].find(e=>e.textContent.includes('新会话'));
 const style=getComputedStyle(document.documentElement);
 const bodyStyle=getComputedStyle(document.body);return {focused:document.hasFocus(),fontTokens:[...bodyStyle].filter(x=>x.includes('font-size')).map(x=>[x,bodyStyle.getPropertyValue(x)]),probe:window.__zoomProbe.snapshot(),zoom:style.zoom,viewport:[innerWidth,innerHeight],document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],ruler:rect(document.querySelector('#zoom-ruler')),nativeButton:{rect:rect(native),font:native?getComputedStyle(native).fontSize:null},focus:document.activeElement?.id||document.activeElement?.tagName,value:document.querySelector('#zoom-edit').value,embeds:[...document.querySelectorAll('#zoom-embeds iframe,#zoom-embeds webview')].map(e=>({id:e.id,rect:rect(e)}))};
 });result.steps.push({label,...data});if(shot)await page.screenshot({path:join(output,label+'.png')});console.log(label,JSON.stringify({level:data.probe.state.level,ruler:data.ruler.width,font:data.nativeButton.font,focus:data.focus}));writeFileSync(join(output,'native-results.json'),JSON.stringify(result,null,2));}
async function key(code){await page.keyboard.down('Meta');await page.keyboard.press(code);await page.keyboard.up('Meta');await settle();}
try {
 await page.bringToFront();await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__zoomProbe?.snapshot().config==='ready');
 await snapshot('native-100-baseline',true);await page.click('#zoom-edit');await key('KeyY');await snapshot('main-native-positive-control');await page.evaluate(()=>window.__zoomProbe.set(0,'driver-reset'));
 await page.click('#zoom-edit');await key('Equal');await snapshot('reserved-equal');await key('Minus');
 await page.evaluate(()=>window.__zoomProbe.mode('capture'));await key('Equal');await snapshot('capture-120-input',true);
 await page.click('#zoom-plus');await snapshot('capture-144-control',true);
 await page.evaluate(()=>window.__zoomProbe.set(0,'driver-reset'));
 await page.evaluate(()=>window.__zoomProbe.recording(true));await key('Equal');await snapshot('recording-protected');await page.evaluate(()=>window.__zoomProbe.recording(false));
 await page.evaluate(()=>document.querySelector('#zoom-edit').dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true})));await key('Equal');await snapshot('synthetic-composition-protected');await page.evaluate(()=>document.querySelector('#zoom-edit').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
 await page.evaluate(()=>window.__zoomProbe.embeds('http://127.0.0.1:39446/'));
 await page.waitForFunction(()=>document.querySelector('#zoom-local')?.contentDocument?.querySelector('#edit'));
 await page.waitForFunction(()=>window.__zoomProbe.state.guestReady===true);await snapshot('embedded-100',true);
 for(const name of ['zoom-prototype-local','zoom-prototype-cross']) {
  await page.evaluate(()=>window.__zoomProbe.set(0,'driver-reset'));
  const frame=page.frames().find(f=>f.name()===name);await frame.waitForSelector('#edit');await frame.click('#edit');
  await key('Equal');await snapshot(name+'-equal');
  await key('KeyY');await snapshot(name+'-bridge-control');
 }
 await page.evaluate(()=>window.__zoomProbe.set(1,'driver-set-120'));await snapshot('embedded-120',true);
 result.targets=browser.targets().map(t=>({type:t.type(),url:t.url().split('?')[0]}));
 result.guest=await page.evaluate(()=>{const w=document.querySelector('#zoom-guest');return {url:w.getURL?.(),zoom:w.getZoomFactor?.(),methods:['sendInputEvent','executeJavaScript','getZoomFactor'].map(x=>[x,typeof w[x]])}});
 console.log(JSON.stringify({guest:result.guest,targets:result.targets}));writeFileSync(join(output,'native-results.json'),JSON.stringify(result,null,2));
} finally {browser.disconnect();server.close();}
