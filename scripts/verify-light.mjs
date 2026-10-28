import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,stat,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const out=resolve('artifacts/lion-stamps/regression/light');await mkdir(out,{recursive:true});
const base=process.env.VERIFY_URL||'http://127.0.0.1:4173/';
const report={base,scope:'Single default light: stamp-local dappled illumination and shallow paper normals; static paper background',startedAt:new Date().toISOString(),checks:[],errors:[],screenshots:[]};
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--enable-unsafe-swiftshader']});
const contexts=[],hash=b=>createHash('sha256').update(b).digest('hex');
async function check(name,fn){try{const details=await fn();report.checks.push({name,result:'passed',details});console.log(`PASS ${name}`)}catch(e){report.checks.push({name,result:'failed',error:e.stack});console.error(`FAIL ${name}: ${e.message}`)}}
async function createPage(options={}){
 const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,...options});contexts.push(ctx);
 await ctx.addInitScript(()=>{
  const q=window.__lightQA={raf:0,offscreen:[],programs:{},freezeTime:false,frozenTime:null,pointerEvents:[],framebuffers:new Map(),gl:null};
  const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>raf(t=>{q.raf++;callback(t)});
  document.addEventListener('pointermove',e=>q.pointerEvents.push({type:e.pointerType,x:e.clientX,y:e.clientY}),{passive:true});
  const programs=new WeakMap(),locations=new WeakMap(),framebuffers=new WeakMap();let pid=0,fid=0;
  for(const P of [window.WebGLRenderingContext?.prototype,window.WebGL2RenderingContext?.prototype].filter(Boolean)){
   const cp=P.createProgram;P.createProgram=function(){const p=cp.call(this);programs.set(p,++pid);q.programs[pid]={uniforms:{},field:false};return p};
   const cf=P.createFramebuffer;P.createFramebuffer=function(){const f=cf.call(this);framebuffers.set(f,++fid);q.framebuffers.set(fid,f);return f};
   const bf=P.bindFramebuffer;P.bindFramebuffer=function(target,fb){q.gl=this;if(target===this.FRAMEBUFFER||target===this.DRAW_FRAMEBUFFER)this.__qaBoundFramebuffer=fb;return bf.call(this,target,fb)};
   const gu=P.getUniformLocation;P.getUniformLocation=function(p,name){const l=gu.call(this,p,name),id=programs.get(p);if(l){locations.set(l,{id,name});if(name==='uDensity')q.programs[id].field=true}return l};
   const u1=P.uniform1f;P.uniform1f=function(l,value){const loc=locations.get(l);if(loc){const p=q.programs[loc.id];if(p.field&&loc.name==='uTime'&&q.freezeTime){q.frozenTime??=p.uniforms.uTime??value;value=q.frozenTime}p.uniforms[loc.name]=value}return u1.call(this,l,value)};
   const u2=P.uniform2f;P.uniform2f=function(l,x,y){const loc=locations.get(l);if(loc)q.programs[loc.id].uniforms[loc.name]=[x,y];return u2.call(this,l,x,y)};
   const u2v=P.uniform2fv;P.uniform2fv=function(l,value){const loc=locations.get(l);if(loc)q.programs[loc.id].uniforms[loc.name]=Array.from(value);return u2v.call(this,l,value)};
   for(const method of ['drawArrays','drawElements']){const f=P[method];P[method]=function(...args){if(this.__qaBoundFramebuffer&&q.offscreen.length<30000)q.offscreen.push({time:performance.now(),fb:framebuffers.get(this.__qaBoundFramebuffer)});return f.call(this,...args)}}
  }
  window.__fieldPixels=()=>{const ids=[...new Set(q.offscreen.map(e=>e.fb))].sort((a,b)=>a-b),gl=q.gl,fb=q.framebuffers.get(ids.at(-1));if(!fb)return null;const prior=gl.getParameter(gl.FRAMEBUFFER_BINDING),pixels=new Uint8Array(384*480*4);gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.readPixels(0,0,384,480,gl.RGBA,gl.UNSIGNED_BYTE,pixels);gl.bindFramebuffer(gl.FRAMEBUFFER,prior);let sum=2166136261;for(const value of pixels)sum=Math.imul(sum^value,16777619);return(sum>>>0).toString(16)};
 });
 const p=await ctx.newPage();p.on('pageerror',e=>report.errors.push({type:'pageerror',message:e.message}));p.on('console',e=>{if(e.type()==='error')report.errors.push({type:'console',message:e.text()})});return p;
}
async function visit(p){
 await p.goto(base,{waitUntil:'networkidle'});await p.waitForFunction(()=>!!window.__postalGallery,{timeout:15000});
 if(await p.locator('.parameter-launcher').getAttribute('aria-expanded')!=='true')await p.locator('.parameter-launcher').click();
 assert.equal((await p.evaluate(()=>__postalGallery.getDiagnostics().parameters)).lightEnabled,true);
 assert.equal(await p.locator('#parameter-preset, [data-parameter="lightModel"]').count(),0);
 if(p.viewportSize().width<700)await p.locator('.parameter-launcher').click();
}
const diagnostics=p=>p.evaluate(()=>window.__postalGallery.getDiagnostics());
const field=p=>p.evaluate(()=>Object.values(__lightQA.programs).find(p=>p.field)?.uniforms);
const textureHash=p=>p.evaluate(()=>__fieldPixels());
async function snap(p,name){await p.screenshot({path:join(out,name)});report.screenshots.push(name)}
async function idle(p){await p.mouse.move(30,200);await p.evaluate(()=>document.activeElement?.blur());await p.waitForFunction(()=>!window.__postalGallery.getDiagnostics().background.active,{timeout:15000});await p.waitForTimeout(100)}
const p=await createPage();
try{
 await check('idle gallery has static paper and no optical work',async()=>{
  await visit(p);await idle(p);assert.equal(await p.locator('canvas').count(),1);assert.equal(await p.locator('.light-study-toggle').count(),0);
  const a=await diagnostics(p),ra=await p.evaluate(()=>__lightQA.raf);await p.waitForTimeout(400);const b=await diagnostics(p),rb=await p.evaluate(()=>__lightQA.raf);assert.equal(a.background.time,b.background.time);assert.equal(a.background.fieldUpdates,b.background.fieldUpdates);assert.equal(ra,rb);await snap(p,'final-gallery.png');return{field:a.background,rafStopped:true};
 });
 let hoverBox;
 await check('hover animates the stamp while the background pixels remain unchanged',async()=>{
  const clip={x:350,y:80,width:160,height:70},paper0=await p.screenshot({clip});await p.locator('[data-stamp="foshan"]').hover({force:true});await p.waitForTimeout(550);hoverBox=await p.locator('[data-stamp="foshan"]').boundingBox();
  const before=await p.screenshot({clip:hoverBox}),a=await diagnostics(p);await p.waitForTimeout(900);const after=await p.screenshot({clip:hoverBox}),b=await diagnostics(p),paper1=await p.screenshot({clip});
  assert.ok(b.background.time>a.background.time);assert.ok(b.background.fieldUpdates>a.background.fieldUpdates);assert.notEqual(hash(before),hash(after));assert.equal(hash(paper0),hash(paper1));assert.ok(Math.abs(b.background.aspect-45/65)<1e-6);assert.equal(b.background.width,384);assert.equal(b.background.height,480);await snap(p,'final-hover.png');
  return{stampPixelsChanged:true,backgroundPixelsIdentical:true,paperSHA256:hash(paper0),fieldBefore:a.background,fieldAfter:b.background};
 });
 await check('local pointer UV independently changes optical texture with uTime frozen',async()=>{
  await p.evaluate(()=>{__lightQA.freezeTime=true;__lightQA.frozenTime=null});const cx=hoverBox.x+hoverBox.width/2,cy=hoverBox.y+hoverBox.height/2;await p.mouse.move(cx,cy);await p.waitForTimeout(450);const a=await field(p),ha=await textureHash(p);await p.mouse.move(cx+36,cy-48);await p.waitForTimeout(600);const b=await field(p),hb=await textureHash(p);
  assert.equal(a.uTime,b.uTime);assert.ok(Math.hypot(...a.uPointer.map((v,i)=>v-b.uPointer[i]))>.08);assert.notEqual(ha,hb);await p.evaluate(()=>{__lightQA.freezeTime=false;__lightQA.frozenTime=null});return{frozenTime:a.uTime,localPointerBefore:a.uPointer,localPointerAfter:b.uPointer,textureHashBefore:ha,textureHashAfter:hb};
 });
 await check('expensive optical updates are capped at 24fps and freeze on pointer exit',async()=>{
  const t0=await p.evaluate(()=>performance.now());await p.waitForTimeout(1200);const t1=await p.evaluate(()=>performance.now());const events=await p.evaluate(({t0,t1})=>__lightQA.offscreen.filter(e=>e.time>=t0&&e.time<=t1),{t0,t1}),id=Math.min(...events.map(e=>e.fb)),count=events.filter(e=>e.fb===id).length,rate=count/((t1-t0)/1000);assert.ok(count>=3);assert.ok(rate<=25.5);
  await idle(p);const a=await diagnostics(p),ha=await textureHash(p);await p.waitForTimeout(450);const b=await diagnostics(p),hb=await textureHash(p);assert.equal(a.background.time,b.background.time);assert.equal(a.background.fieldUpdates,b.background.fieldUpdates);assert.equal(ha,hb);return{observedOpticalFps:rate,cap:24,idleTextureStable:true,idleTimeStable:true,note:'Software-rendered observed rate is not a hardware performance guarantee.'};
 });
 await check('ten hover round trips reuse renderer, material and texture UUIDs',async()=>{
  const a=await diagnostics(p);for(let i=0;i<10;i++){await p.locator('[data-stamp="foshan"]').hover({force:true});await p.waitForTimeout(120);await idle(p)}const b=await diagnostics(p);assert.deepEqual(a.renderer,b.renderer);assert.deepEqual(a.materials,b.materials);assert.deepEqual(a.textures,b.textures);assert.equal(a.background.texture,b.background.texture);return{cycles:10,renderer:b.renderer,lightTextureStable:true,artTextureUUIDsStable:true,materialUUIDsStable:true};
 });
 const mobile=await createPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await check('mobile touch focus and local touch movement illuminate the stamp',async()=>{
  await visit(mobile);await mobile.locator('[data-stamp="foshan"]').tap();await mobile.waitForFunction(()=>__postalGallery.getDiagnostics().phase==='focused');const box=await mobile.locator('[data-stamp="foshan"]').boundingBox();await mobile.evaluate(()=>{__lightQA.freezeTime=true});const cx=box.x+box.width/2,cy=box.y+box.height/2,cdp=await mobile.context().newCDPSession(mobile);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+1,y:cy+1}]});await mobile.waitForTimeout(400);const a=await field(mobile),ha=await textureHash(mobile);
  for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+50*i/12,y:cy-60*i/12}]});await mobile.waitForTimeout(25)}await mobile.waitForTimeout(400);const b=await field(mobile),hb=await textureHash(mobile);await snap(mobile,'final-mobile.png');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(a.uTime,b.uTime);assert.ok(Math.hypot(...a.uPointer.map((v,i)=>v-b.uPointer[i]))>.08);assert.notEqual(ha,hb);return{touchMoves:await mobile.evaluate(()=>__lightQA.pointerEvents.filter(e=>e.type==='touch').length),localUVBefore:a.uPointer,localUVAfter:b.uPointer,opticalPixelsChanged:true};
 });
 const reduced=await createPage({reducedMotion:'reduce'});
 await check('reduced motion hover remains static and stops RAF',async()=>{
  await visit(reduced);await reduced.locator('[data-stamp="foshan"]').hover({force:true});await reduced.waitForTimeout(900);const a=await reduced.screenshot(),da=await diagnostics(reduced),ra=await reduced.evaluate(()=>__lightQA.raf);await reduced.waitForTimeout(400);const b=await reduced.screenshot(),db=await diagnostics(reduced),rb=await reduced.evaluate(()=>__lightQA.raf);assert.equal(hash(a),hash(b));assert.equal(ra,rb);assert.equal(da.background.time,db.background.time);assert.equal(da.background.fieldUpdates,db.background.fieldUpdates);return{pixelsStatic:true,rafStopped:true,field:db.background};
 });
 await check('five-second video shows actual stamp hover light and local pointer motion',async()=>{
  const movie=await createPage({recordVideo:{dir:join(out,'recording'),size:{width:1440,height:900}}}),begun=Date.now();await visit(movie);await movie.locator('[data-stamp="foshan"]').hover({force:true});await movie.waitForTimeout(500);const box=await movie.locator('[data-stamp="foshan"]').boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2,offset=Math.max(0,(Date.now()-begun)/1000-.5);
  await movie.waitForTimeout(1500);for(let i=0;i<=20;i++){await movie.mouse.move(cx+Math.sin(i*.3)*40,cy+Math.cos(i*.3)*55);await movie.waitForTimeout(100)}await movie.waitForTimeout(2500);const video=movie.video();await movie.close();const raw=await video.path(),output=join(out,'light-motion.webm');
  await promisify(execFile)('ffmpeg',['-y','-ss',String(offset),'-i',raw,'-t','5','-an','-vf','crop=640:400:390:150,scale=720:450,fps=24','-c:v','libvpx-vp9','-crf','32','-b:v','0',output],{windowsHide:true,maxBuffer:4*1024*1024});const probe=await promisify(execFile)('ffprobe',['-v','error','-show_entries','format=duration','-of','json',output],{windowsHide:true}),durationSeconds=Number(JSON.parse(probe.stdout).format.duration),bytes=(await stat(output)).size;assert.ok(durationSeconds>=4.9&&durationSeconds<=5.1);assert.ok(bytes<2*1024*1024);await unlink(raw);return{file:'light-motion.webm',width:720,height:450,durationSeconds,bytes,content:'Real browser stamp hover, time drift and pointer-guided local light; static paper background.'};
 });
 await check('console and page errors',async()=>{assert.deepEqual(report.errors,[]);return{errors:0}});
}finally{report.finishedAt=new Date().toISOString();report.result=report.checks.every(c=>c.result==='passed')?'passed':'failed';await writeFile(join(out,'final-report.json'),JSON.stringify(report,null,2));await Promise.all(contexts.map(c=>c.close()));await browser.close()}
console.log(JSON.stringify({result:report.result,checks:report.checks.length,failed:report.checks.filter(x=>x.result==='failed').map(x=>x.name),out},null,2));if(report.result!=='passed')process.exitCode=1;
