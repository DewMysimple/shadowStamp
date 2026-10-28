import { preview } from 'vite';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Run after npm run build. Use an OS-assigned private port, leaving both user
// launchers and their existing servers untouched. No development API is used.
const root=fileURLToPath(new URL('../',import.meta.url));
const out=join(root,'artifacts/frame-stability');
await mkdir(out,{recursive:true});
const server=await preview({root,configFile:false,preview:{host:'127.0.0.1',port:0,strictPort:true}});
let browser;
const report={startedAt:new Date().toISOString(),scope:'Built production app; actual GPU disk adapter, source HDRI panel, real category raycast and exposure input; no development diagnostics.',errors:[]};
try {
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1.25});
  await context.addInitScript(()=>{
    const q=window.__prodQA={contexts:0,patchedShaders:0};
    const seen=new WeakSet(),get=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,attrs){const gl=get.call(this,type,attrs);if(/^webgl/.test(type)&&gl&&!seen.has(gl)){seen.add(gl);q.contexts++;}return gl;};
    const source=WebGL2RenderingContext.prototype.shaderSource;
    WebGL2RenderingContext.prototype.shaderSource=function(shader,text){if(text.includes('uFrameDisplayLut')&&text.includes('previousPoint')&&text.includes('dot(tangent, tangent) < 1e-8'))q.patchedShaders++;return source.call(this,shader,text);};
  });
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`,{waitUntil:'networkidle'});
  await page.waitForSelector('.frame-region[aria-busy=false]',{timeout:60000});
  assert.equal(await page.locator('.frame-unavailable').count(),0);
  await page.waitForTimeout(1800);
  report.gpu=await page.evaluate(()=>({...__prodQA,dpr:devicePixelRatio,devApi:!!window.__postalGallery,canvas:document.querySelectorAll('.exhibition-canvas').length}));
  assert.equal(report.gpu.contexts,1);assert.equal(report.gpu.canvas,1);assert.equal(report.gpu.devApi,false);assert.ok(report.gpu.patchedShaders>=5);
  const current=JSON.parse(await readFile(join(out,'final-runtime.json'),'utf8')).artFrame;
  await page.mouse.click(...current.categories.find(c=>c.id==='china').screen);
  await page.waitForFunction(()=>document.querySelector('[aria-label="选择中国邮票"]').getAttribute('aria-pressed')==='true');
  await page.waitForTimeout(700);
  report.visibleStamps=await page.locator('.stamp-hit').evaluateAll(nodes=>nodes.filter(n=>getComputedStyle(n).pointerEvents!=='none'&&getComputedStyle(n).visibility!=='hidden').map(n=>n.dataset.stamp));
  assert.deepEqual(report.visibleStamps,['beijing','tianyang','quanzhou','hongkong']);
  await page.locator('.frame-launcher').click();
  const exposure=page.getByRole('spinbutton',{name:'相框曝光数值',exact:true});
  await exposure.fill('.2');
  report.exposureControl=await exposure.evaluate(node=>node.valueAsNumber);assert.equal(report.exposureControl,.2);
  report.savedExposure=await page.evaluate(()=>JSON.parse(localStorage.getItem('postal-studies:frame-studio:v1')).parameters.exposure);assert.equal(report.savedExposure,.2);
  await page.waitForTimeout(200);
  await page.screenshot({path:join(out,'final-07-production-controls.png')});
  assert.deepEqual(report.errors,[]);report.passed=true;
  await context.close();
} catch(error) {report.passed=false;report.failure=error.stack;process.exitCode=1;}
finally {
  await browser?.close();
  await new Promise((resolve,reject)=>server.httpServer.close(error=>error?reject(error):resolve()));
  report.finishedAt=new Date().toISOString();
  await writeFile(join(out,'production-smoke.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report,null,2));
