// THROWAWAY: apply the same CSS mechanism to a real isolated BotHarness page.
// This is a layout experiment, not permission to enable zoom in the Web product.
import {createRequire} from 'node:module';import {readdirSync,readFileSync,writeFileSync} from 'node:fs';import {join,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
const source=process.env.BH_SOURCE_ROOT??process.cwd(),store=join(source,'node_modules/.pnpm');
const p=createRequire(join(store,readdirSync(store).find(x=>x.startsWith('puppeteer@')),'node_modules/'))('puppeteer');
const here=dirname(fileURLToPath(import.meta.url)),out=join(here,'evidence');
const instance=JSON.parse(readFileSync(join(source,'.humanlayer/verify/zoom-2245-prototype/instance.json')));
const browser=await p.launch({headless:true,args:['--no-sandbox'],defaultViewport:{width:1440,height:900}});const page=await browser.newPage();const result={kind:'isolated-real-BotHarness-Web-layout-only',steps:[],console:[]};
page.on('pageerror',e=>result.console.push({kind:'error',message:e.message}));page.on('console',m=>{if(['warn','error'].includes(m.type()))result.console.push({kind:m.type(),message:m.text()});});
const pause=()=>new Promise(r=>setTimeout(r,400));
async function shot(label){await pause();result.steps.push({label,...await page.evaluate(()=>({zoom:getComputedStyle(document.documentElement).zoom,viewport:[innerWidth,innerHeight],document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],dialogs:[...document.querySelectorAll('[role="dialog"]')].map(e=>({text:e.textContent.slice(0,120),rect:e.getBoundingClientRect().toJSON()})),text:document.body.innerText.slice(-1400)}))});await page.screenshot({path:join(out,label+'.png')});writeFileSync(join(out,'web-results.json'),JSON.stringify(result,null,2));}
try{
 await page.goto(instance.url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.body.innerText.includes('继续')||[...document.querySelectorAll('button')].some(x=>x.getAttribute('aria-label')==='Bot 模式'));const next=await page.$$('::-p-aria(继续)');if(next.length)await next[0].click();await pause();
 for(const name of ['稍后配置','跳过教程','跳过引导']){const es=await page.$$('::-p-aria('+name+')');if(es.length)await es[0].click();}
 await page.locator('::-p-aria(Bot 模式)').click();await pause();console.log((await page.$eval('body',x=>x.innerText)).slice(-2000));await shot('bot-100');
 const skips=await page.$$('::-p-aria(跳过教程)');if(skips.length)await skips[0].click();await pause();await page.locator('::-p-aria(Bot 设置)').click();await shot('bot-settings-100');
 for(const [level,label] of [[1,'120'],[2,'144'],[-1,'83'],[8,'430']]){await page.evaluate(level=>document.documentElement.style.zoom=String(1.2**level),level);await shot('bot-settings-'+label);}
 await page.evaluate(()=>document.documentElement.style.zoom='1');await shot('bot-settings-reset');
}catch(e){result.failure=String(e);result.body=await page.$eval('body',x=>x.innerText.slice(0,2500));writeFileSync(join(out,'web-failure.json'),JSON.stringify(result,null,2));await page.screenshot({path:join(out,'web-failure.png')});throw e;}finally{await browser.close();}
