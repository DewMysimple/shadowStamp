const {chromium}=require('C:/Users/Administrator/.codex/visualizations/2026/10/22/01a16437-65a1-7890-843d-46e69d56ce3f/scroll-audit-2026-10-23/node_modules/playwright');
const fs = require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 for(const [name,url] of [['bill','https://billguo.me/'],['microsoft','https://microsoft.ai/']]){
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000}); await page.waitForTimeout(7000);
  const data = await page.evaluate(()=>({
    html: document.documentElement.outerHTML,
    matching:[...document.querySelectorAll('*')].filter(e=>/stamp|webgl|dapple|light|shadow|noise|background|grain/i.test(e.className?.baseVal??e.className??'') || /canvas|video/.test(e.tagName.toLowerCase())).map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {tag:e.tagName,id:e.id,cls:e.className?.baseVal??e.className,rect:{x:r.x,y:r.y,w:r.width,h:r.height},text:(e.textContent??'').slice(0,250),style:{transform:s.transform,filter:s.filter,opacity:s.opacity,position:s.position,zIndex:s.zIndex,background:s.background,mask:s.mask,borderRadius:s.borderRadius},attrs:[...e.attributes].map(a=>[a.name,a.value])}}),
    css:[...document.styleSheets].flatMap(s=>{try{return [...s.cssRules].map(r=>r.cssText).filter(r=>/stamp|webgl|dapple|noise|shader|blur|grain/i.test(r))}catch{return [{href:s.href}]}}),
    resources:performance.getEntriesByType('resource').map(e=>({name:e.name,type:e.initiatorType}))
  }));
  fs.writeFileSync(`docs/reference/web/${name}-dom.json`,JSON.stringify(data,null,2));
  console.log(name,JSON.stringify({matching:data.matching,css:data.css,resources:data.resources}));
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
