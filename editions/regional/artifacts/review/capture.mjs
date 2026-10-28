import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('artifacts/review',{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--enable-unsafe-swiftshader']});
const report=[];
for(const [name,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
const page=await browser.newPage({viewport,deviceScaleFactor:1});
await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});await page.waitForFunction(()=>!!window.__postalGallery);await page.waitForTimeout(600);
await page.mouse.move(5,5);await page.screenshot({path:`artifacts/review/${name}-initial.png`});
await page.locator('[data-stamp="craft"]').hover({force:true});await page.waitForTimeout(450);await page.screenshot({path:`artifacts/review/${name}-hover.png`});
report.push({name,viewport,state:'hover',diagnostics:await page.evaluate(()=>window.__postalGallery.getDiagnostics()),labels:await page.locator('.hover-label').evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{text:e.textContent,rect:{x:r.x,y:r.y,w:r.width,h:r.height},font:s.font,color:s.color}})});
await page.locator('[data-stamp="craft"]').click({force:true});await page.waitForFunction(()=>window.__postalGallery.getDiagnostics().phase==='focused');
await page.mouse.move(5,5);await page.waitForTimeout(350);await page.screenshot({path:`artifacts/review/${name}-focus.png`});
report.push({name,viewport,state:'focus',diagnostics:await page.evaluate(()=>window.__postalGallery.getDiagnostics()),text:await page.locator('body').innerText(),boxes:await page.locator('[data-stamp]').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{id:e.dataset.stamp,rect:{x:r.x,y:r.y,w:r.width,h:r.height}}}))});
await page.close();}
await writeFile('artifacts/review/measurements.json',JSON.stringify(report,null,2));await browser.close();console.log('Saved six review screenshots and measurements.');
