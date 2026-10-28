const {chromium}=require('C:/Users/Administrator/.codex/visualizations/2026/10/22/01a16437-65a1-7890-843d-46e69d56ce3f/scroll-audit-2026-10-23/node_modules/playwright');
const fs=require('fs');
(async()=>{
const b=await chromium.launch({headless:true,channel:'chrome',args:['--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']}),p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto('https://billguo.me/',{waitUntil:'domcontentloaded'});await p.waitForTimeout(5000);await p.getByRole('button',{name:'View all stamps'}).click();await p.waitForTimeout(2000);
await p.evaluate(()=>{window.__focusTrace=[];document.addEventListener('click',()=>{
const start=performance.now();function sample(){
const f=document.querySelector('[class*="StampDetail"][class*="__figure"]'),r=document.querySelector('[class*="StampDetail"][class*="__room"]');
if(f){const rect=f.getBoundingClientRect();window.__focusTrace.push({t:performance.now()-start,transform:getComputedStyle(f).transform,x:rect.x,y:rect.y,w:rect.width,h:rect.height,roomOpacity:r?getComputedStyle(r).opacity:null})}
if(performance.now()-start<1400)requestAnimationFrame(sample)}requestAnimationFrame(sample)
},{once:true,capture:true})});
await p.locator('[data-stamp-id="ncs"]').click({force:true});await p.waitForTimeout(1600);
const result=await p.evaluate(()=>window.__focusTrace);fs.writeFileSync('docs/reference/web/bill-focus-trace.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));await b.close()
})().catch(e=>{console.error(e);process.exit(1)});
