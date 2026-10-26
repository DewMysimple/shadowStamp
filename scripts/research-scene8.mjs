// Read-only runtime harness: serves the original Scene 8 files without changing them.
import http from 'node:http';
import { readFile, mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const original = String.raw`E:\Software Development\幽兰`;
const adapted = process.argv.includes('--adapted');
const output = resolve(adapted ? 'artifacts/research/dappled-adapted' : 'artifacts/research/scene8');
await mkdir(output, { recursive: true });
const files = {
  '/scene.js': join(original, 'src/viewer/dappledLightScene.js'),
  '/dappledLightShaders.js': join(original, 'src/viewer/dappledLightShaders.js'),
  '/sceneCatalog.js': join(original, 'src/viewer/sceneCatalog.js'),
  '/three.module.js': join(original, 'node_modules/three/build/three.module.js'),
  '/three.core.js': join(original, 'node_modules/three/build/three.core.js'),
  ...(adapted ? {
    '/adapter.js': resolve('src/rendering/DappledLight.js'),
    '/dappledShaders.js': resolve('src/rendering/dappledShaders.js'),
  } : {}),
};
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const before = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([url, path]) => [url, await hash(path)])));
const originalHTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scene 8 read-only verification</title><style>html,body{margin:0;overflow:hidden}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';
import { createDappledLightScene } from '/scene.js';
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);renderer.setSize(innerWidth, innerHeight);document.body.append(renderer.domElement);
const scene = new THREE.Scene();let scheduled=0;window.renders=0;
function requestRender(){if(scheduled)return;scheduled=requestAnimationFrame(t=>{scheduled=0;const more=effect.update(t,!document.hidden);effect.render();window.renders++;if(more)requestRender();});}
const effect = createDappledLightScene(scene,renderer,requestRender);
effect.setSize(innerWidth,innerHeight);effect.activate();window.audit={renderer,scene,effect};window.ready=true;
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);effect.setSize(innerWidth,innerHeight);requestRender();});
</script>`;
const adaptedHTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dappled adapter verification</title><style>html,body{margin:0;overflow:hidden}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';import {createDappledLight} from '/adapter.js';
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);document.body.append(renderer.domElement);
const core=createDappledLight(renderer);core.resize(innerWidth,innerHeight);let drawCalls=0;const native=renderer.render.bind(renderer);renderer.render=(...args)=>{drawCalls++;return native(...args)};
window.audit={renderer,core};window.renderOnce=(t,f=0,r=false)=>{const old=drawCalls;core.render(t,f,r);return drawCalls-old};window.renderOnce(0);
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);core.resize(innerWidth,innerHeight)});window.ready=true;
</script>`;
const html = adapted ? adaptedHTML : originalHTML;
const server = http.createServer(async (req, res) => {
  const key = new URL(req.url, 'http://localhost').pathname;
  if (key === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
  if (!files[key]) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', 'application/javascript');res.end(await readFile(files[key]));
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const serverPort = server.address().port;
const profile = await mkdtemp(join(tmpdir(), 'stamp-scene8-'));
const chrome = spawn(String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`, [
  '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1440,900', 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(done => setTimeout(done, ms));
let targets;
for (let i = 0; i < 100; i++) { try { const debugPort = (await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json(); if (targets.some(x => x.type === 'page')) break; } catch {} await delay(100); }
const ws = new WebSocket(targets.find(x => x.type === 'page').webSocketDebuggerUrl);
await new Promise((done, reject) => { ws.onopen=done;ws.onerror=reject; });
let id=0;const tasks=new Map();const errors=[];
ws.onmessage=({data})=>{const msg=JSON.parse(data);if(msg.id){const task=tasks.get(msg.id);tasks.delete(msg.id);msg.error?task.reject(msg.error):task.done(msg.result);}else if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails);else if(msg.method==='Runtime.consoleAPICalled'&&msg.params.type==='error')errors.push(msg.params.args);};
function send(method,params={}){return new Promise((done,reject)=>{tasks.set(++id,{done,reject});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;}
async function screenshot(name){const {data}=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,name),Buffer.from(data,'base64'));}
const report={source:original,sourceHashesBefore:before};
try {
 await send('Runtime.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:`http://127.0.0.1:${serverPort}/`});
 for(let i=0;i<100;i++){if(await evaluate('!!window.ready'))break;await delay(100);}
 assert.ok(await evaluate('!!window.ready'));
 if (adapted) {
   report.throttledPasses = await evaluate('[renderOnce(0.01),renderOnce(0.042),renderOnce(0.05)]');
   assert.deepEqual(report.throttledPasses,[1,3,1]);
   report.reducedMotionPasses = await evaluate('[renderOnce(0.06,0,true),renderOnce(1,0,true)]');
   assert.deepEqual(report.reducedMotionPasses,[3,1]);
   await screenshot('01-adapted-paper.png');
   report.focusPasses=await evaluate('renderOnce(1.05,1,true)');assert.equal(report.focusPasses,1);
   await screenshot('02-adapted-focused.png');
   await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(100);
   await evaluate('renderOnce(2,0,true)');await screenshot('03-adapted-mobile.png');
   report.cleanup=await evaluate('(()=>{const before={...audit.renderer.info.memory};audit.core.dispose();audit.core.dispose();return {before,after:{...audit.renderer.info.memory}}})()');
   assert.equal(report.cleanup.before.geometries,1);assert.equal(report.cleanup.before.textures,2);
   assert.equal(report.cleanup.after.geometries,0);assert.equal(report.cleanup.after.textures,0);
   assert.equal(errors.length,0,JSON.stringify(errors));report.consoleErrors=errors;report.result='passed';
   await writeFile(join(output,'runtime-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 } else {
 await delay(1000);await screenshot('01-original-center.png');
 report.original=await evaluate('({parameters:audit.effect.parameters,memory:audit.renderer.info.memory,programs:audit.renderer.info.programs.length,renderCount:renders,canvas:document.querySelectorAll("canvas").length})');
 await evaluate('audit.effect.parameters.animate=false');
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:340,y:300});await delay(1500);await screenshot('02-original-pointer-left.png');
 report.pointer=await evaluate('audit.scene.children[0].material.uniforms.uPointer.value.toArray()');
 assert.ok(Math.abs(report.pointer[0]-340/1440)<.001);
 const count=await evaluate('renders');await delay(250);assert.equal(await evaluate('renders'),count);
 report.pausedStopsRendering=true;
 await evaluate('audit.effect.parameters.animate=true;audit.effect.setReducedMotion(true);audit.effect.center()');await delay(150);
 const reduced=await evaluate('({time:audit.scene.children[0].material.uniforms.uTime.value,renders})');await delay(250);
 assert.deepEqual(await evaluate('({time:audit.scene.children[0].material.uniforms.uTime.value,renders})'),reduced);
 report.reducedMotionStopsRendering=true;
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(150);await screenshot('03-original-mobile.png');
 report.mobile=await evaluate('({aspect:audit.scene.children[0].material.uniforms.uAspect.value,width:audit.renderer.domElement.width,height:audit.renderer.domElement.height})');
 assert.ok(Math.abs(report.mobile.aspect-390/844)<1e-6);
 report.cleanup=await evaluate('(()=>{const before={...audit.renderer.info.memory};audit.effect.dispose();audit.effect.dispose();return {before,after:{...audit.renderer.info.memory},sceneChildren:audit.scene.children.length}})()');
 assert.equal(report.cleanup.after.geometries,report.cleanup.before.geometries-1);
 assert.equal(report.cleanup.after.textures,report.cleanup.before.textures-2);assert.equal(report.cleanup.sceneChildren,0);
 assert.equal(errors.length,0,JSON.stringify(errors));report.consoleErrors=errors;report.result='passed';
 report.sourceHashesAfter=Object.fromEntries(await Promise.all(Object.entries(files).map(async([url,path])=>[url,await hash(path)])));
 assert.deepEqual(report.sourceHashesAfter,before);
 await writeFile(join(output,'runtime-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }
} finally { ws.close();chrome.kill();server.close(); }
