import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import * as THREE from 'three';
import { FRAME_DEFAULTS, FRAME_STUDIO_SOURCE, FRAME_STORAGE_KEY, normalizeFrameParameters, parseFrameParameters, serializeFrameParameters } from '../src/frameParameters.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = join(root, process.env.VERIFY_OUTPUT || 'artifacts/frame-stability');
await mkdir(out, { recursive: true });
const report = { startedAt: new Date().toISOString(), scope: 'Source Blender transforms and actual GPU uploads; continuous inner-trim hover stability; whole-frame tilt; real model controls, isolation, persistence and lifecycle. Desktop only.', checks: [], errors: [], warnings: [], screenshots: [] };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await context.addInitScript(() => {
  const q = window.__studioQA = { contexts: 0, raf: 0, diskShaders: 0, gpu: {}, sources: [] };
  const contexts = new WeakSet(), locations = new WeakMap();
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attributes) {
    const gl = getContext.call(this, type, /^webgl/.test(type) ? { ...attributes, preserveDrawingBuffer: true } : attributes);
    if (/^webgl/.test(type) && gl && !contexts.has(gl)) { contexts.add(gl); q.contexts++; }
    return gl;
  };
  const raf = requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => raf(time => { q.raf++; callback(time); });
  const P = WebGL2RenderingContext.prototype;
  const source = P.shaderSource;
  P.shaderSource = function(shader, text) {
    if (text.includes('uFrameDisplayLut') && text.includes('previousPoint')) {
      q.diskShaders++;
      q.sources.push({ disk: true, safeBasis: text.includes('dot(tangent, tangent) < 1e-8'), world: text.includes('PI * (envMapColor.rgb * envMapIntensity + uFrameWorldRadiance)'), bytes: text.length });
    }
    return source.call(this, shader, text);
  };
  const getLocation = P.getUniformLocation;
  P.getUniformLocation = function(program, name) { const location = getLocation.call(this,program,name); if(location)locations.set(location,name); return location; };
  for (const name of ['uniform1f','uniform3f','uniform3fv']) {
    const original = P[name];
    P[name] = function(location, ...values) {
      const key = locations.get(location);
      if (key && (/^uFrame/.test(key) || key.startsWith('rectAreaLights'))) q.gpu[key] = values.length===1 ? (ArrayBuffer.isView(values[0]) ? Array.from(values[0]) : values[0]) : values;
      return original.call(this,location,...values);
    };
  }
});
const page = await context.newPage();
page.on('pageerror',error=>report.errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());if(message.type()==='warning')report.warnings.push(message.text());});
const requests = [];
page.on('request',req=>{if(/\.(glb|exr|png)(\?|$)/.test(req.url()))requests.push(req.url());});
const diagnostics = () => page.evaluate(()=>__postalGallery.getDiagnostics());
const frame = async () => (await diagnostics()).artFrame;
const hash = values => createHash('sha256').update(Uint8Array.from(values)).digest('hex');
const closeTo = (a,b,eps=1e-5) => { assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-b[i])<eps,`${a} != ${b}`); };
async function check(name, task) {
  const start=Date.now();
  try { const evidence=await task();report.checks.push({name,result:'passed',elapsedMs:Date.now()-start,evidence});console.log(`PASS ${name}`); }
  catch(error){report.checks.push({name,result:'failed',elapsedMs:Date.now()-start,error:error.stack});console.error(`FAIL ${name}: ${error.message}`);await page.screenshot({path:join(out,`failure-${report.checks.length}.png`)}).catch(()=>{});}
}
async function ready() {
  await page.waitForFunction(()=>window.__postalGallery?.getDiagnostics().artFrame.loaded,{}, {timeout:60000});
  await page.waitForFunction(()=>__postalGallery.getDiagnostics().artFrame.categories.every(c=>c.reveal===1));
}
async function settle() {
  await page.waitForFunction(()=>{
    const d=__postalGallery.getDiagnostics().artFrame,t=d.tilt,p=d.parameters;
    const target=t.pointerInside&&t.enabled&&!d.reducedMotion?t.target:[0,0];
    return Math.abs(t.rotation[0]+target[1]*p.tiltDegrees*Math.PI/180)<1e-7 && Math.abs(t.rotation[1]-target[0]*p.tiltDegrees*Math.PI/180)<1e-7 && d.categories.every(c=>c.reveal===1);
  },{}, {timeout:20000});
}
async function outside() { await page.mouse.move(1430,870);await page.evaluate(()=>document.activeElement?.blur());await settle();await page.waitForTimeout(100); }
async function panel(open=true) {if((await page.locator('.frame-launcher').getAttribute('aria-expanded')==='true')!==open)await page.locator('.frame-launcher').click();}
async function reveal(control) {
  const ancestors=await control.locator('xpath=ancestor::details').all();
  for(const ancestor of ancestors)if(await ancestor.getAttribute('open')===null)await ancestor.locator(':scope > summary').click();
}
async function setNumber(key,label,value) {
  await panel();const input=page.getByRole('spinbutton',{name:`${label}数值`,exact:true,includeHidden:true});await reveal(input);await input.fill(String(value));
  await page.waitForFunction(({key,value})=>__postalGallery.getDiagnostics().artFrame.parameters[key]===value,{key,value});await settle();
}
async function snap(name) {await page.screenshot({path:join(out,name)});report.screenshots.push(name);}
function project(d,point) {
  const p=new THREE.Vector3(...point).applyMatrix4(new THREE.Matrix4().fromArray(d.modelToClip));
  return [d.renderViewport.x+(p.x+1)*d.renderViewport.width/2,d.renderViewport.y+(1-p.y)*d.renderViewport.height/2];
}
async function pixels(points) {
  return page.evaluate(points=>{
    const gl=document.querySelector('.exhibition-canvas').getContext('webgl2'),prior=gl.getParameter(gl.FRAMEBUFFER_BINDING);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,data=new Uint8Array(w*h*4);
    gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,data);gl.bindFramebuffer(gl.FRAMEBUFFER,prior);
    const sx=w/innerWidth,sy=h/innerHeight;
    return points.flatMap(([x,y])=>{const i=(Math.max(0,Math.min(h-1,h-1-Math.floor(y*sy)))*w+Math.max(0,Math.min(w-1,Math.floor(x*sx))))*4;return [data[i],data[i+1],data[i+2]];});
  },points);
}
async function seamPixels() {
  const d=await frame(),points=[];
  // Include the thin outside silhouettes and the shared moulding boundaries,
  // as well as the flat interiors highlighted in the user's screenshots.
  for(const [y,z]of [[.164,.01167],[.1638,.01185],[.162,.01185],[.1595,.01217],[.1593,.01235],[.1573,.01235],[-.114,.01167],[-.1138,.01185],[-.112,.01185],[-.1095,.01217],[-.1093,.01235],[-.1073,.01235]])for(let i=0;i<161;i++)points.push(project(d,[-.42+i/160*.84,y,z]));
  return pixels(points);
}
async function framePixels() {
  const d=await frame(),points=[];
  for(let y=0;y<24;y++)for(let x=0;x<48;x++)points.push(project(d,[-.49+x/47*.98,-.24+y/23*.48,.015]));
  return pixels(points);
}
const delta = (a,b) => {const values=a.map((v,i)=>Math.abs(v-b[i]));return {mean:values.reduce((a,b)=>a+b,0)/values.length,max:Math.max(...values),strongFraction:values.filter(v=>v>28).length/values.length};};
await page.goto(process.env.VERIFY_URL||'http://127.0.0.1:4174/',{waitUntil:'networkidle'});await ready();await outside();

await check('Three source disk lights match original Blender transforms and actual GPU uploads',async()=>{
  const d=await frame(),q=await page.evaluate(()=>__studioQA);
  assert.equal(q.contexts,1);assert.ok(q.diskShaders>=5);assert.ok(q.sources.every(s=>s.safeBasis&&s.world));
  assert.equal(d.studio.sceneLights.length,3);assert.ok(d.studio.sceneLights.every(l=>l.type==='RectAreaLight'));
  const uploads=[];
  for(const [i,source]of FRAME_STUDIO_SOURCE.lights.entries()){
    const light=d.studio.softboxes[i];assert.equal(light.shape,'DISK');assert.equal(light.watts,source.watts);assert.equal(light.diameter,source.size);
    closeTo(light.position,source.position);closeTo(light.direction,source.direction);
    assert.ok(1-Math.abs(new THREE.Quaternion().fromArray(light.quaternion).dot(new THREE.Quaternion().fromArray(source.quaternion)))<1e-7);
    const position=q.gpu[`rectAreaLights[${i}].position`];closeTo(position,[source.position[0],source.position[1],source.position[2]-2]);
    closeTo(q.gpu[`rectAreaLights[${i}].halfWidth`],new THREE.Vector3(source.size/2,0,0).applyQuaternion(new THREE.Quaternion().fromArray(source.quaternion)).toArray());
    closeTo(q.gpu[`rectAreaLights[${i}].color`],source.color.map(v=>v*light.intensity));
    uploads.push({name:source.name,position,color:q.gpu[`rectAreaLights[${i}].color`]});
  }
  const world=FRAME_STUDIO_SOURCE.world.nodes.find(n=>n.type==='BACKGROUND').inputs;
  closeTo(q.gpu.uFrameWorldRadiance,world.Color.slice(0,3).map(v=>v*world.Strength));
  assert.ok(Math.abs(q.gpu.uFrameExposure-1)<1e-7);
  await writeFile(join(out,'gpu-source-match.json'),JSON.stringify({source:FRAME_STUDIO_SOURCE,uploads,shaders:q.sources},null,2));
  return {lights:3,uploads,world:q.gpu.uFrameWorldRadiance,diskShaderVariants:q.diskShaders};
});
await check('Solid opaque geometry, micrometer seam ordering and stable source display pass',async()=>{
  const d=await frame();assert.deepEqual(d.renderPass.depthRange,[1.8,2.2]);assert.equal(d.renderPass.samples,4);assert.ok(d.renderPass.size[0]>=d.renderViewport.width*1.99);
  const solids=d.materials.filter(m=>m.name.startsWith('PBR_')||m.name==='M_Landscape_Photo'||m.name==='M_Mat_Trim');
  assert.ok(solids.every(m=>!m.transparent&&m.depthWrite));
  const trims=d.materials.filter(m=>m.name==='M_Mat_Trim');assert.equal(trims.length,2);assert.deepEqual(trims.map(m=>m.polygonOffsetUnits).sort((a,b)=>a-b),[-2,-1]);assert.ok(trims.every(m=>m.side===THREE.FrontSide));
  const samples=await seamPixels();assert.ok(Math.min(...samples)>75);await snap('final-01-studio.png');
  return {renderPass:d.renderPass,trimUnits:trims.map(m=>m.polygonOffsetUnits),minimumTrimChannel:Math.min(...samples)};
});
await check('Model control launcher is at upper left and exposes the actual supplied HDRI',async()=>{
  const box=await page.locator('.frame-launcher').boundingBox();assert.ok(box.x<100&&box.y<160);assert.equal(await page.locator('.frame-launcher').getAttribute('aria-expanded'),'false');
  await panel();await page.locator('.frame-hdri img').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('.frame-hdri img').naturalWidth===512);
  assert.equal(await page.locator('.frame-hdri').getAttribute('href'),'/environments/citrus-orchard-road-4k.exr');
  assert.equal(await page.locator('.exhibition-canvas').count(),1);await snap('final-02-model-controls.png');await panel(false);return {box,preview:[512,256],sourceDownload:true};
});
await check('Whole frame tilts gently with pointer, damps smoothly and returns on leave',async()=>{
  await outside();const d=await frame(),v=d.viewport;await page.mouse.move(v.x+v.width*.88,v.y+v.height*.2);await page.waitForTimeout(70);const moving=await frame();await settle();const after=await frame();
  assert.ok(Math.abs(after.tilt.rotation[0])>.01&&Math.abs(after.tilt.rotation[1])>.01);
  assert.ok(Math.abs(moving.tilt.rotation[1])>0&&Math.abs(moving.tilt.rotation[1])<Math.abs(after.tilt.rotation[1]));
  assert.ok(after.tilt.rotation.slice(0,2).every(r=>Math.abs(r)<=FRAME_DEFAULTS.tiltDegrees*Math.PI/180));
  assert.equal((await diagnostics()).selected,null);await snap('final-03-pointer-tilt.png');await outside();closeTo((await frame()).tilt.rotation.slice(0,3),[0,0,0],1e-8);
  return {during:moving.tilt,settled:after.tilt,returned:true};
});
await check('Repeated traversal of both inner seams produces no black strips or nonfinite poses',async()=>{
  const v=(await frame()).viewport,results=[];
  for(const y of [.18,.69])for(let i=0;i<9;i++){
    const x=.11+i/8*.78;await page.mouse.move(v.x+v.width*x,v.y+v.height*y);await settle();
    const d=await frame(),samples=await seamPixels();assert.ok(d.modelToClip.every(Number.isFinite));assert.ok(Math.min(...samples)>75);
    results.push({pointer:[x,y],rotation:d.tilt.rotation.slice(0,3),minimumChannel:Math.min(...samples),sha256:hash(samples)});
  }
  await writeFile(join(out,'seam-traversal.json'),JSON.stringify(results,null,2));return {poses:results.length,minimumChannel:Math.min(...results.map(r=>r.minimumChannel))};
});
await check('Near-stationary pointer perturbations do not trigger sudden long-line flashes',async()=>{
  const v=(await frame()).viewport;await page.mouse.move(v.x+v.width*.5,v.y+v.height*.18);await settle();const before=await seamPixels();
  await page.mouse.move(v.x+v.width*.5+.05,v.y+v.height*.18+.05);await settle();const after=await seamPixels();const diff=delta(before,after);
  assert.ok(diff.mean<2&&diff.strongFraction<.02);await page.waitForTimeout(400);assert.deepEqual(await seamPixels(),after);
  return {points:1932,perturbationCssPx:.05,...diff,stationarySha256:hash(after)};
});
await check('HDRI, world and exposure controls update actual GPU uniforms while stamps and desk stay identical',async()=>{
  await outside();const d=await diagnostics(),pose=d.poses.find(p=>p.id==='foshan');
  const stampCenter=pose.corners.reduce((a,p)=>[a[0]+p[0]/4,a[1]+p[1]/4],[0,0]);
  const unchangedPoints=[[1400,15],[1410,20],...Array.from({length:60},(_,i)=>[stampCenter[0]-25+i%10*5,stampCenter[1]-15+Math.floor(i/10)*5])];
  const unaffected=await pixels(unchangedPoints),before=await framePixels(),stampParameters=d.parameters;
  await setNumber('hdriIntensity','HDRI 强度',.65);await setNumber('hdriRotation','HDRI 水平旋转',-40);await setNumber('worldStrength','原场景世界光',.23);await setNumber('exposure','相框曝光',-.25);
  const a=await frame(),q=await page.evaluate(()=>__studioQA.gpu);assert.equal(a.studio.environmentIntensity,.65);assert.ok(Math.abs(a.studio.environmentRotation[1]-(-40*Math.PI/180))<1e-8);
  closeTo(q.uFrameWorldRadiance,FRAME_STUDIO_SOURCE.world.nodes.find(n=>n.type==='BACKGROUND').inputs.Color.slice(0,3).map(v=>v*.23));assert.ok(Math.abs(q.uFrameExposure-2**(-.25-FRAME_DEFAULTS.exposure))<1e-6);
  await panel(false);await outside();const changed=delta(before,await framePixels());assert.ok(changed.mean>3);assert.deepEqual(await pixels(unchangedPoints),unaffected);assert.deepEqual((await diagnostics()).parameters,stampParameters);
  await panel();await page.locator('[data-frame-parameter=hdriEnabled]').uncheck();assert.equal((await frame()).studio.environmentIntensity,0);await page.getByRole('button',{name:'恢复默认',exact:true}).click();await panel(false);await outside();
  return {frameDelta:changed,stampAndDeskSha256:hash(unaffected),actualWorldUniform:q.uFrameWorldRadiance,actualExposure:q.uFrameExposure};
});
await check('All three light controls change power, diameter, color, position and angle without adding emitters',async()=>{
  const changes=[];await panel();
  for(const [i,label]of ['主光','补光','轮廓光'].entries()){
    const input=page.getByRole('spinbutton',{name:`${label}功率数值`,exact:true,includeHidden:true});await reveal(input);await input.fill(String(12+i*4));
    await page.getByRole('spinbutton',{name:`${label}圆盘直径数值`,exact:true}).fill(String(.7+i*.1));
    const x=FRAME_DEFAULTS.lights[i].position[0]+.1;await page.locator(`[data-frame-parameter="light-${i}-position-0"]`).fill(String(x));
    const angle=FRAME_DEFAULTS.lights[i].rotation[2]+6;await page.locator(`[data-frame-parameter="light-${i}-rotation-2"]`).fill(String(angle));
    const color=page.getByLabel(`${label}颜色`,{exact:true});await color.evaluate(node=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,'#ffe1b4');node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.waitForFunction(({i,x})=>__postalGallery.getDiagnostics().artFrame.parameters.lights[i].position[0]===x,{i,x});
    const d=await frame(),light=d.studio.softboxes[i];assert.equal(d.studio.sceneLights.length,3);assert.equal(light.watts,12+i*4);assert.ok(Math.abs(light.diameter-(.7+i*.1))<1e-8);closeTo(light.position,[x,FRAME_DEFAULTS.lights[i].position[2],-FRAME_DEFAULTS.lights[i].position[1]]);
    assert.ok(light.color[1]<.9&&light.color[2]<.6);assert.ok(new THREE.Vector3().fromArray(light.direction).distanceTo(new THREE.Vector3().fromArray(FRAME_STUDIO_SOURCE.lights[i].direction))>.02);
    await page.locator(`[data-frame-parameter="light-${i}-enabled"]`).uncheck();assert.equal((await frame()).studio.sceneLights[i].intensity,0);await page.locator(`[data-frame-parameter="light-${i}-enabled"]`).check();changes.push(light);
  }
  await snap('final-04-light-controls.png');await page.getByRole('button',{name:'恢复默认',exact:true}).click();await panel(false);await outside();return changes;
});
await check('Paper, wood and shadow controls change their own material or projection',async()=>{
  await outside();const base=await frame(),wallPoints=[];
  for(const y of [-.27,-.29,-.31,-.33])for(let i=0;i<25;i++)wallPoints.push(project(base,[-.35+i/24*.7,y,-.03]));
  const shadowBefore=await pixels(wallPoints);
  await setNumber('woodNormal','木纹法线强度',.4);await setNumber('canvasNormal','画芯法线强度',.3);await setNumber('shadowOpacity','墙面投影浓度',0);await setNumber('shadowSoftness','投影柔和度',1.5);
  const d=await frame();closeTo(d.materials.find(m=>m.name.includes('Wood')).normalScale,[.4,.4]);closeTo(d.materials.find(m=>m.name.includes('Canvas')).normalScale,[.3,.3]);
  assert.equal(d.parameters.shadowOpacity,0);assert.equal(d.parameters.shadowSoftness,1.5);
  const shadowOff=await pixels(wallPoints),shadowDelta=delta(shadowBefore,shadowOff);assert.ok(shadowDelta.mean>.5);
  await page.evaluate(p=>__postalGallery.configureFrame({...p,lights:p.lights.map(light=>({...light,color:[0,0,0]}))}),normalizeFrameParameters());
  await page.waitForTimeout(100);assert.deepEqual(await pixels(wallPoints),shadowOff,'black emitters must not leave an artificial wall shadow');
  await page.getByRole('button',{name:'恢复默认',exact:true}).click();await panel(false);await outside();return {wood:[.4,.4],canvas:[.3,.3],shadowDisabled:true,shadowDelta,blackEmittersCastNoShadow:true};
});
await check('Real export, edited import and reload preserve a complete independent frame rig',async()=>{
  await setNumber('hdriRotation','HDRI 水平旋转',-80);await panel();const downloadPromise=page.waitForEvent('download');await page.locator('.frame-panel-footer').getByRole('button',{name:'导出',exact:true}).click();const download=await downloadPromise;
  const exported=await readFile(await download.path(),'utf8');const p=parseFrameParameters(exported);assert.equal(p.hdriRotation,-80);await writeFile(join(out,'frame-parameters-export.json'),exported);
  p.exposure=.1;p.lights[1].watts=11;p.tiltDegrees=3.5;const imported=serializeFrameParameters(p);
  await page.getByLabel('导入相框参数文件',{exact:true}).setInputFiles({name:'frame-edited.json',mimeType:'application/json',buffer:Buffer.from(imported)});
  await page.waitForFunction(()=>__postalGallery.getDiagnostics().artFrame.parameters.lights[1].watts===11);
  await page.reload({waitUntil:'networkidle'});await ready();await outside();assert.deepEqual((await frame()).parameters,p);
  assert.equal(JSON.parse(await page.evaluate(key=>localStorage.getItem(key),FRAME_STORAGE_KEY)).schema,'postal-frame-studio');
  await panel();await page.getByRole('button',{name:'恢复默认',exact:true}).click();await panel(false);await outside();assert.deepEqual((await frame()).parameters,normalizeFrameParameters());return {filename:download.suggestedFilename(),roundTrip:true,restoredSource:true};
});
await check('Tilt controls, reduced motion and panel event isolation behave correctly',async()=>{
  await panel();const toggle=page.locator('[data-frame-parameter=tiltEnabled]');await reveal(toggle);await toggle.uncheck();await panel(false);const v=(await frame()).viewport;
  await page.mouse.move(v.x+v.width*.9,v.y+v.height*.2);await settle();closeTo((await frame()).tilt.rotation.slice(0,3),[0,0,0],1e-8);
  await panel();await reveal(toggle);await toggle.check();await setNumber('tiltDegrees','最大转角',4);await setNumber('tiltResponse','旋转响应时间',.25);
  const currentSeries=(await diagnostics()).series;await page.getByRole('button',{name:'JSON',exact:true}).click();await page.locator('#frame-parameters-json').fill('{bad');await page.getByRole('button',{name:'应用 JSON',exact:true}).click();assert.equal((await diagnostics()).series,currentSeries);assert.ok(await page.locator('.frame-panel-footer [role=status]').textContent());
  await page.keyboard.press('Escape');assert.equal(await page.locator('.frame-launcher').getAttribute('aria-expanded'),'false');
  await page.emulateMedia({reducedMotion:'reduce'});await page.mouse.move(v.x+v.width*.1,v.y+v.height*.9);await settle();assert.ok((await diagnostics()).reducedMotion);closeTo((await frame()).tilt.rotation.slice(0,3),[0,0,0],1e-8);
  await outside();const raf=await page.evaluate(()=>__studioQA.raf);await page.waitForTimeout(250);assert.ok((await page.evaluate(()=>__studioQA.raf))-raf<=1);
  await page.emulateMedia({reducedMotion:'no-preference'});await panel();await page.getByRole('button',{name:'恢复默认',exact:true}).click();await panel(false);await outside();return {toggle:true,reducedMotion:true,escape:true,invalidImportContained:true};
});
await check('Desktop resize, all-corner maximum tilt and supersampling stay within the view and depth range',async()=>{
  const results=[];
  await page.evaluate(p=>__postalGallery.configureFrame({...p,tiltDegrees:5}),normalizeFrameParameters());
  for(const [width,height]of [[1024,768],[1280,720],[1440,900],[1920,1080],[2560,1440]]){
    await page.setViewportSize({width,height});await page.mouse.move(width-5,height-5);await settle();const d=await frame(),v=d.viewport;
    assert.ok(d.renderPass.size.every(n=>n<=4096));assert.ok(d.frameCorners.every(([x,y])=>x>=v.x&&x<=v.x+v.width&&y>=v.y&&y<=v.y+v.height));
    for(const [x,y]of [[.06,.06],[.94,.06],[.06,.94],[.94,.94]]){await page.mouse.move(v.x+v.width*x,v.y+v.height*y);await settle();const a=await frame();assert.ok(a.modelToClip.every(Number.isFinite));assert.ok(a.frameCorners.every(([x,y])=>x>=v.x-12&&x<=v.x+v.width+12&&y>=v.y-12&&y<=v.y+v.height+12));}
    results.push({width,height,target:d.renderPass.size});if(width===1920)await snap('final-05-desktop-1920.png');
  }
  await page.setViewportSize({width:1440,height:900});await page.evaluate(p=>__postalGallery.configureFrame(p),normalizeFrameParameters());await outside();return results;
});
await check('Stationary frame reuses one cached render and parameter edits do not leak resources',async()=>{
  await outside();const before=await diagnostics(),count=requests.length,raf=await page.evaluate(()=>__studioQA.raf),samples=await seamPixels();await page.waitForTimeout(400);const after=await diagnostics();
  assert.equal(after.artFrame.renderPass.renders,before.artFrame.renderPass.renders);assert.ok((await page.evaluate(()=>__studioQA.raf))-raf<=1);assert.deepEqual(await seamPixels(),samples);
  for(let i=0;i<6;i++)await page.evaluate(i=>{const d=__postalGallery.getDiagnostics().artFrame;__postalGallery.configureFrame({...d.parameters,exposure:i%2?.3:.4});},i);
  await page.evaluate(p=>__postalGallery.configureFrame(p),normalizeFrameParameters());await outside();assert.deepEqual((await diagnostics()).renderer,before.renderer);assert.equal(requests.length,count);return {renderer:before.renderer,unchangedRenders:after.artFrame.renderPass.renders,assetRequests:count,pixelSha256:hash(samples)};
});
await check('No new runtime errors; teardown releases the new render target and animation',async()=>{
  assert.deepEqual(report.errors,[]);await writeFile(join(out,'final-runtime.json'),JSON.stringify(await diagnostics(),null,2));await snap('final-06-default-restored.png');
  await page.evaluate(()=>__postalGallery.dispose());assert.equal(await page.locator('.exhibition-canvas').count(),0);const raf=await page.evaluate(()=>__studioQA.raf);await page.waitForTimeout(200);assert.ok((await page.evaluate(()=>__studioQA.raf))-raf<=1);return {errors:0,disposed:true};
});
await context.close();await browser.close();report.finishedAt=new Date().toISOString();report.passed=report.checks.every(c=>c.result==='passed');
await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));console.log(`${report.checks.filter(c=>c.result==='passed').length}/${report.checks.length} passed`);if(!report.passed)process.exitCode=1;
