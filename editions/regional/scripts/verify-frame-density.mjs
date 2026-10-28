import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { EXHIBITION } from '../src/config.js';

const root=fileURLToPath(new URL('../',import.meta.url)),out=join(root,'artifacts/frame-stability');
await mkdir(out,{recursive:true});
const report={startedAt:new Date().toISOString(),scope:'Actual offscreen GPU viewport at 125%, 150%, and 200% desktop scaling; CSS raycast registration and whole-frame tilt.',checks:[],errors:[]};
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
for(const [width,height,dpr]of [[1536,864,1.25],[1280,720,1.5],[1440,900,2]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr});
  await context.addInitScript(()=>{
    const q=window.__densityQA={viewports:[]},programs=new WeakSet();let currentProgram=null;
    const P=WebGL2RenderingContext.prototype,get=P.getUniformLocation,use=P.useProgram;
    P.getUniformLocation=function(program,name){const location=get.call(this,program,name);if(name==='uFrameDisplayLut'&&location)programs.add(program);return location;};
    P.useProgram=function(program){currentProgram=program;return use.call(this,program);};
    for(const name of ['drawElements','drawArrays','drawElementsInstanced']){
      const draw=P[name];P[name]=function(...args){if(programs.has(currentProgram)){const viewport=Array.from(this.getParameter(this.VIEWPORT));const last=q.viewports.at(-1);if(!last||last.some((v,i)=>v!==viewport[i]))q.viewports.push(viewport);}return draw.call(this,...args);};
    }
  });
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  try{
    await page.goto(process.env.VERIFY_URL||'http://127.0.0.1:4174/',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.__postalGallery?.getDiagnostics().artFrame.loaded,{}, {timeout:60000});
    await page.waitForFunction(()=>__postalGallery.getDiagnostics().artFrame.categories.every(c=>c.reveal===1));
    const before=await page.evaluate(()=>__postalGallery.getDiagnostics()),target=before.artFrame.renderPass.size;
    const actual=await page.evaluate(()=>{const gl=document.querySelector('.exhibition-canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return {viewports:__densityQA.viewports,drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};});
    assert.ok(actual.viewports.length>0);assert.ok(actual.viewports.every(([x,y,w,h])=>x===0&&y===0&&w===target[0]&&h===target[1]));
    assert.deepEqual(actual.drawingBuffer,[Math.floor(width*Math.min(dpr,EXHIBITION.maxDpr)),Math.floor(height*Math.min(dpr,EXHIBITION.maxDpr))]);
    await page.mouse.move(width-5,height-5);await page.waitForTimeout(900);
    if(dpr===1.25)await page.screenshot({path:join(out,'final-08-desktop-density-125.png')});
    await page.mouse.click(...before.artFrame.categories.find(c=>c.id==='china').screen);
    await page.waitForFunction(()=>__postalGallery.getDiagnostics().series==='china');
    const v=before.artFrame.viewport;await page.mouse.move(v.x+v.width*.85,v.y+v.height*.2);await page.waitForTimeout(900);
    const tilt=await page.evaluate(()=>__postalGallery.getDiagnostics().artFrame.tilt.rotation);
    assert.ok(Math.abs(tilt[0])>.005&&Math.abs(tilt[1])>.005);
    report.checks.push({width,height,dpr,passed:true,target,actual,cssRaycast:true,tilt});console.log(`PASS desktop DPR ${dpr}`);
  }catch(error){report.checks.push({width,height,dpr,passed:false,error:error.stack});console.error(`FAIL desktop DPR ${dpr}: ${error.message}`);await page.screenshot({path:join(out,`failure-density-${dpr}.png`)}).catch(()=>{});}
  finally{await context.close();}
}
await browser.close();report.finishedAt=new Date().toISOString();report.passed=report.checks.every(c=>c.passed)&&report.errors.length===0;await writeFile(join(out,'desktop-density.json'),JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
