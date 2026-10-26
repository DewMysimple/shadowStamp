const {chromium}=require('C:/Users/Administrator/.codex/visualizations/2026/10/22/01a16437-65a1-7890-843d-46e69d56ce3f/scroll-audit-2026-10-23/node_modules/playwright');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome',args:['--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',e=>{if(e.type()==='error')errors.push(e.text())});
 await page.addInitScript(()=>{
  window.__glObservations={shaders:[],contexts:[],uniformNames:[],draws:0};
  const gc=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(type,...args){const r=gc.call(this,type,...args);window.__glObservations.contexts.push({type,success:!!r});return r};
  for(const P of [window.WebGLRenderingContext?.prototype,window.WebGL2RenderingContext?.prototype].filter(Boolean)){
   const ss=P.shaderSource;P.shaderSource=function(shader,source){window.__glObservations.shaders.push(source);return ss.call(this,shader,source)};
   const gu=P.getUniformLocation;P.getUniformLocation=function(program,name){if(!window.__glObservations.uniformNames.includes(name))window.__glObservations.uniformNames.push(name);return gu.call(this,program,name)};
   for(const method of ['drawArrays','drawElements']){const f=P[method];P[method]=function(...args){window.__glObservations.draws++;return f.call(this,...args)}}
  }
 });
 await page.goto('https://microsoft.ai/',{waitUntil:'domcontentloaded',timeout:45000});await page.waitForTimeout(5000);
 await page.getByRole('button',{name:'Reject',exact:true}).click().catch(()=>{});await page.waitForTimeout(1200);
 const results={samples:[]};
 for(let i=0;i<3;i++){await page.screenshot({path:`docs/reference/web/microsoft-light-${i}.png`});results.samples.push(await page.evaluate(()=>({time:performance.now(),draws:window.__glObservations.draws,canvas:[...document.querySelectorAll('canvas')].map(c=>({w:c.width,h:c.height,rect:{x:c.getBoundingClientRect().x,y:c.getBoundingClientRect().y,w:c.getBoundingClientRect().width,h:c.getBoundingClientRect().height},outer:c.outerHTML,parent:c.parentElement.outerHTML.slice(0,5000)}))})));await page.waitForTimeout(5000);}
 await page.mouse.move(900,400);await page.waitForTimeout(1500);await page.screenshot({path:'docs/reference/web/microsoft-light-pointer.png'});
 results.gl=await page.evaluate(()=>window.__glObservations);results.errors=errors;
 fs.writeFileSync('docs/reference/web/microsoft-observations.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify({samples:results.samples,contexts:results.gl.contexts,shaders:results.gl.shaders.map(s=>({length:s.length,sample:s.slice(-18000)})),uniformNames:results.gl.uniformNames,errors}));
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
