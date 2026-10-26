import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

await mkdir('artifacts/light-study',{recursive:true});
const files={
 '/adapter.js':resolve('src/rendering/DappledLight.js'),
 '/dappledShaders.js':resolve('src/rendering/dappledShaders.js'),
 '/three.module.js':resolve('node_modules/three/build/three.module.js'),
 '/three.core.js':resolve('node_modules/three/build/three.core.js'),
};
const html=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;overflow:hidden}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/three.module.js"}}</script><script type="module">
import*as THREE from'three';import{createDappledLight}from'/adapter.js';
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);document.body.append(renderer.domElement);
const light=createDappledLight(renderer,{animate:false});light.resize(innerWidth,innerHeight);let t=0,passes=0;const nativeRender=renderer.render.bind(renderer);renderer.render=(...args)=>{passes++;return nativeRender(...args)};
window.audit={renderer,light};window.draw=(study=light.parameters.study,reduced=false)=>{const previous=passes;light.parameters.study=study;light.render(t+=.1,0,reduced);return{passes:passes-previous,programs:renderer.info.programs.length,texture:light.texture.uuid,parameters:light.parameters}};window.draw();window.ready=true;
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);light.resize(innerWidth,innerHeight);window.draw()});
</script>`;
const server=http.createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;if(path==='/favicon.ico'){res.writeHead(204);return res.end()}if(path==='/'){res.setHeader('Content-Type','text/html');return res.end(html)}if(!files[path]){res.writeHead(404);return res.end()}res.setHeader('Content-Type','application/javascript');res.end(await readFile(files[path]))});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text())});
const report={};
try{
await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.ready);
report.start=await page.evaluate(()=>draw(0));await page.screenshot({path:'artifacts/light-study/01-paper-center.png'});
report.mid=await page.evaluate(()=>draw(.5));await page.screenshot({path:'artifacts/light-study/02-half-study.png'});
report.original=await page.evaluate(()=>draw(1));await page.screenshot({path:'artifacts/light-study/03-original-colour.png'});
assert.equal(report.start.programs,3);assert.equal(report.original.programs,3);assert.equal(report.start.texture,report.original.texture);
assert.equal(report.mid.passes,1);assert.equal(report.original.passes,1);
await page.evaluate(()=>{audit.light.setPointer(.2,.75);for(let i=0;i<20;i++)draw(0)});await page.screenshot({path:'artifacts/light-study/04-paper-pointer-left.png'});
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(120);await page.evaluate(()=>{audit.light.setPointer(.5,.5);for(let i=0;i<20;i++)draw(0)});await page.screenshot({path:'artifacts/light-study/05-paper-mobile.png'});
await page.evaluate(()=>draw(1));await page.screenshot({path:'artifacts/light-study/06-original-mobile.png'});
await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(120);
await page.evaluate(()=>{audit.light.parameters.animate=true;audit.light.setPointer(.5,.5);for(let i=0;i<30;i++)draw(0)});await page.screenshot({path:'artifacts/light-study/07-paper-drift.png'});
await page.evaluate(()=>draw(0,true));const reducedFirst=await page.screenshot();await page.evaluate(()=>{for(let i=0;i<12;i++)draw(0,true)});const reducedSecond=await page.screenshot();assert.ok(reducedFirst.equals(reducedSecond));report.reducedPixelsStable=true;
report.cleanup=await page.evaluate(()=>{audit.light.dispose();audit.light.dispose();return{...audit.renderer.info.memory}});assert.equal(report.cleanup.geometries,0);assert.equal(report.cleanup.textures,0);assert.deepEqual(errors,[]);report.errors=errors;report.result='passed';
await writeFile('artifacts/light-study/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();server.close()}
