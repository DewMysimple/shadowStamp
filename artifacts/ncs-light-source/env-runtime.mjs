import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const out='artifacts/ncs-light-source';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
 const q=window.__envAudit={programs:{},uploads:[]};const programs=new WeakMap(),locations=new WeakMap(),shaders=new WeakMap();let id=0;
 for(const P of [WebGLRenderingContext?.prototype,WebGL2RenderingContext?.prototype].filter(Boolean)){
  const cp=P.createProgram;P.createProgram=function(){const p=cp.call(this);programs.set(p,++id);q.programs[id]={uniforms:{},features:[]};return p};
  const ss=P.shaderSource;P.shaderSource=function(shader,source){shaders.set(shader,source);return ss.call(this,shader,source)};
  const attach=P.attachShader;P.attachShader=function(program,shader){const source=shaders.get(shader)||'';q.programs[programs.get(program)].features.push({chars:source.length,physical:/PHYSICAL/.test(source),dapple:/uDappleMap/.test(source),neutral:/NeutralToneMapping/.test(source),linearToSRGB:/sRGBTransferOETF|linearToOutputTexel/.test(source)});return attach.call(this,program,shader)};
  const gu=P.getUniformLocation;P.getUniformLocation=function(program,name){const location=gu.call(this,program,name);if(location)locations.set(location,{program:programs.get(program),name});return location};
  for(const method of ['uniform1f','uniform3f','uniform3fv','uniform2f','uniform2fv','uniformMatrix3fv']){
   const fn=P[method];P[method]=function(location,...args){const info=locations.get(location);if(info&&/envMap|toneMapping|directionalLights|pointLights|hemisphereLights|roughness|metalness|clearcoat|normalScale|uDappleGate/i.test(info.name)){const vals=args.map(v=>ArrayBuffer.isView(v)?Array.from(v):v);q.programs[info.program].uniforms[info.name]=vals.length===1?vals[0]:vals;}return fn.call(this,location,...args)};
  }
  const ti=P.texImage2D;P.texImage2D=function(...args){const source=args.find(v=>v instanceof HTMLImageElement||v instanceof HTMLCanvasElement);if(source&&q.uploads.length<150)q.uploads.push({kind:source.constructor.name,src:source.src||null,width:source.naturalWidth||source.width,height:source.naturalHeight||source.height});return ti.apply(this,args)};
 }
});
try{
 await page.goto('https://billguo.me/',{waitUntil:'domcontentloaded',timeout:60000});await page.waitForTimeout(3500);
 await page.getByRole('button',{name:'View all stamps'}).click();await page.waitForTimeout(1500);
 const stamp=page.locator('[data-stamp-id="ncs"]'),box=await stamp.boundingBox();
 const captures=[];
 for(const [name,u,v] of [['center',.5,.5],['upperRight',.8,.2],['lowerLeft',.2,.8]]){
  await page.mouse.move(box.x+box.width*u,box.y+box.height*v);await page.waitForTimeout(800);
  captures.push({name,pointer:[u,v],programs:await page.evaluate(()=>structuredClone(__envAudit.programs))});
 }
 const report={observedAt:new Date().toISOString(),url:page.url(),viewport:{width:1440,height:900},scope:'Read-only real WebGL uniform calls of the shipped NCS hover material; no parameter overrides or shader changes.',bounds:box,captures,uploads:await page.evaluate(()=>__envAudit.uploads),errors};
 await writeFile(`${out}/env-runtime.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify({captures:captures.map(c=>({name:c.name,physical:Object.entries(c.programs).filter(([,p])=>p.uniforms.normalScale&&p.uniforms.metalness===0).map(([id,p])=>({id,...p}))})),errors},null,2));
}finally{await browser.close()}
