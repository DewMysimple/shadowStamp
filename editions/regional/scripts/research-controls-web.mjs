import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const dir='artifacts/controls-research';
await fs.mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const report={observedAt:new Date().toISOString(),bill:{},microsoft:{},errors};
async function billSample(){return page.evaluate(()=>{
 const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};
 const take=e=>{const c=getComputedStyle(e);return {tag:e.tagName,cls:e.className,style:e.getAttribute('style'),rect:rect(e),transform:c.transform,perspective:c.perspective,filter:c.filter,transition:c.transition,opacity:c.opacity,css:{tiltX:c.getPropertyValue('--tilt-x'),tiltY:c.getPropertyValue('--tilt-y'),scale:c.getPropertyValue('--scale'),mx:c.getPropertyValue('--mx'),my:c.getPropertyValue('--my')},images:[...e.querySelectorAll('img')].map(i=>({src:i.currentSrc,width:i.naturalWidth,complete:i.complete}))}};
 return {time:performance.now(),elements:[...document.querySelectorAll('[data-stamp-id="ncs"],[data-stamp-id="ncs"] *,[class*="StampDetail"][class*="card"],[class*="StampDetail"][class*="figure"],[class*="StampDetail"][class*="morphs"],[class*="StampDetail"] [class*="paper"]')].filter(e=>e.tagName!=='PATH'&&e.tagName!=='SVG').map(take)};
});}
try{
 await page.goto('https://billguo.me/',{waitUntil:'domcontentloaded',timeout:60000});await page.waitForTimeout(5000);
 await page.getByRole('button',{name:'View all stamps'}).click();await page.waitForTimeout(1800);
 const ncs=page.locator('[data-stamp-id="ncs"]');
 const bounds=await ncs.boundingBox();report.bill.bounds=bounds;
 report.bill.gallery=[];
 for(const [name,u,v] of [['center',.5,.5],['left',.13,.5],['right',.87,.5],['top',.5,.13],['bottom',.5,.87],['upperRight',.8,.2]]){
   await page.mouse.move(bounds.x+bounds.width*u,bounds.y+bounds.height*v);await page.waitForTimeout(600);report.bill.gallery.push({name,pointer:{u,v},state:await billSample()});
 }
 await page.screenshot({path:`${dir}/bill-gallery-upper-right.png`});
 await page.mouse.move(bounds.x+bounds.width*.5,bounds.y+bounds.height*.5);await page.mouse.click(bounds.x+bounds.width*.5,bounds.y+bounds.height*.5);await page.waitForTimeout(1600);
 report.bill.focusInitial=await billSample();
 const card=page.getByRole('dialog',{name:'New Craft Society postage stamp',exact:true});const fb=await card.boundingBox();report.bill.focusBounds=fb;
 report.bill.focus=[];
 for(const [name,u,v] of [['center',.5,.5],['left',.12,.5],['right',.88,.5],['top',.5,.12],['bottom',.5,.88],['upperRight',.82,.18],['outsideRight',1.35,.5],['outsideLeft',-.35,.5],['outsideTop',.5,-.25],['outsideBottom',.5,1.2]]){
  await page.mouse.move(fb.x+fb.width*u,fb.y+fb.height*v);await page.waitForTimeout(600);report.bill.focus.push({name,pointer:{u,v},state:await billSample()});
  if(name==='upperRight')await page.screenshot({path:`${dir}/bill-focused-upper-right.png`});
 }
 await page.mouse.move(fb.x+fb.width*.5,fb.y+fb.height*.5);await page.waitForTimeout(700);
 await page.evaluate(()=>{window.__pointerTrace=[];window.__pointerT0=null;document.addEventListener('pointermove',()=>{window.__pointerT0=performance.now()},{capture:true,once:true});const begin=performance.now();function record(){const e=document.querySelector('[class*="StampDetail"][class*="figure"] [class*="__paper"]'),s=e?getComputedStyle(e):null;window.__pointerTrace.push({t:performance.now(),eventAt:window.__pointerT0,x:s?.getPropertyValue('--tilt-x'),y:s?.getPropertyValue('--tilt-y')});if(performance.now()-begin<1000)requestAnimationFrame(record)}requestAnimationFrame(record)});
 await page.mouse.move(fb.x+fb.width*.82,fb.y+fb.height*.18);await page.waitForTimeout(1100);report.bill.focusPointerTrace=await page.evaluate(()=>window.__pointerTrace);
 report.bill.css=await page.evaluate(()=>{const out=[];function read(rules){for(const r of rules){if(r.cssRules)read(r.cssRules);else if(/perspective|tilt-x|tilt-y|holo|lifted/.test(r.cssText)&&r.cssText.length<5000)out.push(r.cssText)}}for(const s of document.styleSheets){try{read(s.cssRules)}catch{}}return out});
 await page.mouse.move(fb.x+fb.width*.5,fb.y+fb.height*.5);await page.mouse.down();await page.mouse.move(fb.x+fb.width*.75,fb.y+fb.height*.35,{steps:12});await page.waitForTimeout(400);report.bill.focusDrag=await billSample();await page.mouse.up();await page.waitForTimeout(800);report.bill.focusDragEnd=await billSample();
}catch(e){report.bill.error=String(e)}
await fs.writeFile(`${dir}/web-parameters.json`,JSON.stringify(report,null,2));
try{
 const ms=await browser.newPage({viewport:{width:1440,height:900}});
 await ms.addInitScript(()=>{
  window.__uniformAudit={uniforms:{},programs:{},contexts:[],draws:0};
  const gc=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){const r=gc.call(this,t,...a);window.__uniformAudit.contexts.push({type:t,success:!!r});return r};
  for(const p of [WebGLRenderingContext.prototype,WebGL2RenderingContext.prototype]){
   const map=new WeakMap(),programs=new WeakMap();let count=0;const get=p.getUniformLocation;p.getUniformLocation=function(pr,n){const l=get.call(this,pr,n);if(!programs.has(pr))programs.set(pr,++count);const id=programs.get(pr);if(l)map.set(l,{n,id});return l};
   for(const name of ['uniform1f','uniform1i','uniform2f','uniform2fv','uniform3f','uniform3fv','uniform4f','uniform4fv']){const fn=p[name];p[name]=function(l,...v){const loc=l&&map.get(l);if(loc){const {n,id}=loc,val=v.map(x=>ArrayBuffer.isView(x)?Array.from(x):x);window.__uniformAudit.uniforms[n]=val;(window.__uniformAudit.programs[id]??={})[n]=val}return fn.call(this,l,...v)}}
   for(const name of ['drawArrays','drawElements']){const fn=p[name];p[name]=function(...a){window.__uniformAudit.draws++;return fn.call(this,...a)}}
  }
 });
 await ms.goto('https://microsoft.ai/',{waitUntil:'domcontentloaded',timeout:60000});await ms.waitForTimeout(5000);await ms.getByRole('button',{name:'Reject',exact:true}).click({timeout:3000}).catch(()=>{});await ms.waitForTimeout(1000);
 report.microsoft.dom=await ms.evaluate(()=>({canvases:[...document.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height,css:{width:c.clientWidth,height:c.clientHeight},parent:c.parentElement.outerHTML.slice(0,6000)}))}));
 report.microsoft.samples=[];
 for(const [name,x,y]of [['left',100,450],['right',1300,450],['top',720,100],['bottom',720,800]]){await ms.mouse.move(x,y);await ms.waitForTimeout(700);report.microsoft.samples.push({name,pointer:{x,y},audit:await ms.evaluate(()=>window.__uniformAudit)})}
 await ms.screenshot({path:`${dir}/microsoft-current.png`});
}catch(e){report.microsoft.error=String(e)}
await fs.writeFile(`${dir}/web-parameters.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({bill:{bounds:report.bill.bounds,focusBounds:report.bill.focusBounds,error:report.bill.error,focus:report.bill.focus?.map(s=>({name:s.name,paper:s.state.elements.filter(e=>/HomeStamps.*__paper$/.test(e.cls)).at(-1)?.css,figure:s.state.elements.find(e=>/StampDetail.*__figure/.test(e.cls))?.transform}))},microsoft:{programs:report.microsoft.samples?.at(-1)?.audit.programs,error:report.microsoft.error},errorCount:errors.length},null,2));
await browser.close();
