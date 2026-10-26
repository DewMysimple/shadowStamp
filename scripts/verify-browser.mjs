import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

// Run against the retained Vite development server; never starts or replaces it.
const baseURL = process.env.VERIFY_URL || 'http://127.0.0.1:4173/';
const output = resolve('artifacts/single-light-verification/browser');
await mkdir(output, { recursive: true });
const report = { baseURL, startedAt: new Date().toISOString(), browser: 'Installed Chrome, headless, real WebGL', checks: [], consoleErrors: [], pageErrors: [], screenshots: [] };
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const timeout = 15000;
const ids = ['specimen', 'kensho', 'craft', 'mint', 'nocturne', 'gaohan'];
const allContexts = [];

async function createPage(options = {}, expectedErrors = null) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...options });
  allContexts.push(context);
  await context.addInitScript(() => {
    window.__qaRafExecutions = 0;
    window.__qaFreeze = false;
    window.__qaHoldProgress = null;
    window.__qaClicks = [];
    document.addEventListener('click', event => window.__qaClicks.push({id:event.target.closest('[data-stamp]')?.dataset.stamp ?? null,x:event.clientX,y:event.clientY,pointerType:event.pointerType}),true);
    const native = requestAnimationFrame.bind(window);
    const held = [];
    function schedule(callback) {
      return native(time => {
        if (window.__qaFreeze) { held.push(callback); return; }
        callback(time); window.__qaRafExecutions++;
        const p = Number(document.querySelector('.exhibition')?.dataset.progress);
        if (window.__qaHoldProgress !== null && p >= window.__qaHoldProgress && p < .99) {
          window.__qaFreeze = true; window.__qaHoldProgress = null;
        }
      });
    }
    window.requestAnimationFrame = schedule;
    window.__qaResume = () => { window.__qaFreeze = false; window.__qaHoldProgress = null; held.splice(0).forEach(schedule); };
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push({ viewport: options.viewport ?? 'desktop', message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') (expectedErrors || report.consoleErrors).push({ viewport: options.viewport ?? 'desktop', message: message.text() });
  });
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__postalGallery, { timeout });
  return page;
}
const diagnostic = page => page.evaluate(() => window.__postalGallery.getDiagnostics());
async function waitState(page, phase, selected) {
  await page.waitForFunction(({ phase, selected }) => {
    const d = window.__postalGallery?.getDiagnostics();
    return d?.phase === phase && (selected === undefined || d.selected === selected);
  }, { phase, selected }, { timeout });
}
async function closeGallery(page) {
  await page.evaluate(() => { window.__qaResume(); window.__postalGallery.close(); document.activeElement?.blur(); });
  await page.mouse.move(20, 150);
  await page.waitForFunction(() => window.__postalGallery.getDiagnostics().selected === null, { timeout });
}
async function clickVisible(page, id, input = 'mouse') {
  // Locate an actually exposed part of irregularly overlapping/partly cropped stamps.
  const point = await page.locator(`[data-stamp="${id}"]`).evaluate((button, input) => {
    const rect = button.getBoundingClientRect();
    const left = Math.max(2, rect.left), right = Math.min(innerWidth - 2, rect.right);
    const top = Math.max(2, rect.top), bottom = Math.min(innerHeight - 2, rect.bottom);
    const points = [];
    for (let y = 1; y < 16; y++) for (let x = 1; x < 16; x++) {
      const px = left + (right - left) * x / 16, py = top + (bottom - top) * y / 16;
      if (document.elementFromPoint(px, py)?.closest('[data-stamp]') === button) {
        let clearance=0;
        for(let radius=2;radius<=24;radius+=2){
          const inside=[0,.25,.5,.75,1,1.25,1.5,1.75].every(angle=>document.elementFromPoint(px+Math.cos(angle*Math.PI)*radius,py+Math.sin(angle*Math.PI)*radius)?.closest('[data-stamp]')===button);
          if(!inside)break;clearance=radius;
        }
        points.push({ x: px, y: py, clearance });
      }
    }
    points.sort((a,b) => b.clearance-a.clearance || Math.hypot(a.x - (rect.left + rect.width/2),a.y - (rect.top + rect.height/2)) - Math.hypot(b.x - (rect.left + rect.width/2),b.y - (rect.top + rect.height/2)));
    return points[0] ?? null;
  }, input);
  assert.ok(point, `${id} has no exposed clickable point`);
  if (input === 'touch') await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  const actual=await page.evaluate(()=>window.__qaClicks.at(-1));
  assert.equal(actual?.id,id,`${input} at ${JSON.stringify(point)} activated ${JSON.stringify(actual)}`);
  return point;
}
async function screenshot(page, filename, note = '') {
  await page.screenshot({ path: join(output, filename), fullPage: false });
  report.screenshots.push({ file: filename, note, ...(await diagnostic(page).catch(() => ({}))) });
}
async function assertViewportOrigin(page) {
  const viewport = await page.evaluate(() => {
    const host = document.querySelector('.exhibition'), rect = document.querySelector('.exhibition-canvas').getBoundingClientRect();
    return { scrollLeft: host.scrollLeft, scrollTop: host.scrollTop, canvasX: rect.x, canvasY: rect.y, pageX: scrollX, pageY: scrollY };
  });
  for (const [key, value] of Object.entries(viewport)) assert.equal(value, 0, `${key} must stay at the viewport origin`);
  return viewport;
}
async function check(name, fn) {
  if(process.env.VERIFY_ONLY && !name.includes(process.env.VERIFY_ONLY)) return;
  const start = Date.now();
  try {
    const details = await fn();report.checks.push({ name, result: 'passed', elapsedMs: Date.now() - start, details });console.log(`PASS ${name}`);
  } catch (error) {
    const live = [];
    for (const context of allContexts) for (const page of context.pages()) live.push(await diagnostic(page).catch(()=>({diagnosticUnavailable:true})));
    report.checks.push({ name, result: 'failed', elapsedMs: Date.now() - start, error: error.stack, liveDiagnostics: live });console.error(`FAIL ${name}: ${error.message}\n${JSON.stringify(live)}`);
  }
}
const desktop = await createPage();
try {
  await check('desktop: initial, hover, midpoint, focus and return screenshots', async () => {
    await closeGallery(desktop);await desktop.waitForTimeout(350);
    assert.equal(await desktop.locator('canvas').count(), 1);
    await screenshot(desktop, 'desktop-01-initial.png');
    await desktop.locator('[data-stamp="craft"]').hover();
    await desktop.waitForFunction(() => window.__postalGallery.getDiagnostics().hovered === 'craft');
    await desktop.waitForTimeout(400);
    assert.equal(await desktop.locator('.hover-label').textContent(), 'NEW CRAFT SOCIETY');
    await screenshot(desktop, 'desktop-02-hover.png');
    await assertViewportOrigin(desktop);
    await desktop.evaluate(() => { window.__qaHoldProgress = .42; });
    await clickVisible(desktop, 'craft');
    await desktop.waitForFunction(() => window.__qaFreeze, null, { timeout, polling: 20 });
    const midpoint = await diagnostic(desktop);assert.ok(midpoint.progress >= .42 && midpoint.progress < .99);
    await screenshot(desktop, 'desktop-03-mid-transition.png', 'RAF held after an actual transition frame for an exact intermediate screenshot; immediately resumed.');
    await desktop.evaluate(() => window.__qaResume());await waitState(desktop, 'focused', 'craft');
    await screenshot(desktop, 'desktop-04-focus.png');
    await assertViewportOrigin(desktop);
    assert.equal(await desktop.locator('.focus-instruction').textContent(), 'CLICK ANYWHERE OR PRESS ESC.');
    // This point is outside both the stamp and the open parameter panel.
    assert.equal(await desktop.evaluate(() => Boolean(document.elementFromPoint(400,150)?.closest('[data-stamp], [data-parameter-panel]'))), false);
    await desktop.mouse.click(400,150);await waitState(desktop, 'idle', null);await desktop.waitForTimeout(300);
    await screenshot(desktop, 'desktop-05-return.png');
    return { canvasCount: 1, midpoint: midpoint.progress, label: 'NEW CRAFT SOCIETY', backgroundExit: true };
  });

  await check('desktop: all six stamps select through exposed pointer targets', async () => {
    const selected = [];
    for (const id of ids) {
      await closeGallery(desktop);await desktop.waitForTimeout(100);
      const point = await clickVisible(desktop, id);await waitState(desktop,'focused',id);
      selected.push({ id, point });await desktop.keyboard.press('Escape');
      await desktop.waitForFunction(() => window.__postalGallery.getDiagnostics().selected === null, { timeout });
    }
    return selected;
  });

  await check('desktop: keyboard names, Enter, focus trap and Escape restoration', async () => {
    // Reload resets the browser's native sequential-focus starting point.
    await desktop.reload({waitUntil:'networkidle'});await desktop.waitForFunction(()=>!!window.__postalGallery);
    const reachable = [], otherControls = [];
    for (let i=0;i<12 && reachable.length<6;i++) {
      await desktop.keyboard.press('Tab');
      const control=await desktop.evaluate(() => ({ id: document.activeElement.dataset.stamp, name: document.activeElement.getAttribute('aria-label') }));
      if(control.id)reachable.push(control);else otherControls.push(control);
    }
    assert.deepEqual(new Set(reachable.map(x=>x.id)),new Set(ids));assert.ok(reachable.every(x=>x.name?.startsWith('View ')));
    const selected = reachable[5].id;await desktop.keyboard.press('Enter');await waitState(desktop,'focused',selected);
    await assertViewportOrigin(desktop);
    await desktop.keyboard.press('Tab');assert.equal(await desktop.evaluate(() => document.activeElement.className),'close-focus');
    await desktop.keyboard.press('Tab');assert.equal(await desktop.evaluate(() => document.activeElement.className),'parameter-launcher');
    await desktop.keyboard.press('Shift+Tab');assert.equal(await desktop.evaluate(() => document.activeElement.className),'close-focus');
    await desktop.keyboard.press('Shift+Tab');assert.equal(await desktop.evaluate(() => document.activeElement.dataset.stamp),selected);
    await desktop.keyboard.press('Escape');
    await desktop.waitForFunction(id => window.__postalGallery.getDiagnostics().selected === null && document.activeElement.dataset.stamp === id, selected, { timeout });
    return { reachable, otherControls, focusedTabCycle: true, escapeRestoresTrigger: true };
  });

  await check('desktop: Escape reverses an unfinished transition continuously', async () => {
    await closeGallery(desktop);await clickVisible(desktop,'craft');
    await desktop.waitForFunction(() => { const d=window.__postalGallery.getDiagnostics();return d.progress>.1 && d.progress<.9; }, { timeout });
    const before=await diagnostic(desktop);await desktop.keyboard.press('Escape');const after=await diagnostic(desktop);
    assert.ok(after.progress <= before.progress+.18, `position jumped: ${before.progress} -> ${after.progress}`);
    await desktop.waitForFunction(() => window.__postalGallery.getDiagnostics().selected === null, { timeout });
    return { before: before.progress, after: after.progress, final: (await diagnostic(desktop)).progress };
  });

  await check('desktop: choosing another stamp while returning queues a new focus', async () => {
    await closeGallery(desktop);await clickVisible(desktop,'craft');await waitState(desktop,'focused','craft');
    await desktop.keyboard.press('Escape');
    await desktop.waitForFunction(() => {const d=window.__postalGallery.getDiagnostics();return d.phase==='returning'&&d.progress<.75&&d.progress>.05;}, { timeout });
    await clickVisible(desktop,'mint');await waitState(desktop,'focused','mint');
    return { selected: (await diagnostic(desktop)).selected };
  });

  await check('desktop: ten repeated cycles preserve texture/material UUIDs and GPU counts', async () => {
    await closeGallery(desktop);const before=await diagnostic(desktop);
    for(let i=0;i<10;i++) {
      await clickVisible(desktop,'craft');await waitState(desktop,'focused','craft');
      await desktop.keyboard.press('Escape');await desktop.waitForFunction(()=>window.__postalGallery.getDiagnostics().selected===null, { timeout });
    }
    const after=await diagnostic(desktop);
    assert.deepEqual(after.materials,before.materials);assert.deepEqual(after.textures,before.textures);assert.deepEqual(after.renderer,before.renderer);
    return { cycles:10,renderer:after.renderer,materialsStable:true,texturesStable:true };
  });

  await check('resize: focused stamp keeps intended center across desktop and mobile', async () => {
    await closeGallery(desktop);await clickVisible(desktop,'craft');await waitState(desktop,'focused','craft');
    // Measure the neutral anchor. Perspective tilt legitimately moves the bounding-box center;
    // its four-corner alignment and directional response are covered in verify-controls.mjs.
    await desktop.evaluate(()=>window.__postalGallery.configure({tiltEnabled:false}));await desktop.waitForTimeout(700);
    const centers=[];
    for(const size of [{width:1024,height:768},{width:390,height:844},{width:1440,height:900}]) {
      await desktop.setViewportSize(size);await desktop.waitForTimeout(180);
      await assertViewportOrigin(desktop);
      const box=await desktop.locator('[data-stamp="craft"]').boundingBox();
      const expectedX=size.width*(size.width<700?.5:.479),expectedY=size.height*.5;
      const center={x:box.x+box.width/2,y:box.y+box.height/2};
      assert.ok(Math.abs(center.x-expectedX)<1.5,JSON.stringify({size,center,expectedX}));
      assert.ok(Math.abs(center.y-expectedY)<1.5,JSON.stringify({size,center,expectedY}));centers.push({size,center,expectedX,expectedY});
    }
    await desktop.evaluate(()=>window.__postalGallery.configure({tiltEnabled:true}));await closeGallery(desktop);return { centers,note:'Neutral pose: desktop follows video at 47.9% viewport width; mobile uses 50%. Tilt corners verified separately.' };
  });

  const mobile = await createPage({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
  await check('mobile: initial, synthetic hover, touch midpoint, focus and return screenshots', async () => {
    await screenshot(mobile,'mobile-01-initial.png');
    await mobile.locator('[data-stamp="craft"]').dispatchEvent('pointerenter',{pointerType:'mouse',isPrimary:true});
    await mobile.waitForTimeout(350);await screenshot(mobile,'mobile-02-hover.png','Synthetic mouse pointerenter on a touch viewport; real touch is tested separately below.');
    await mobile.locator('[data-stamp="craft"]').dispatchEvent('pointerleave',{pointerType:'mouse',isPrimary:true});
    await mobile.evaluate(()=>{window.__qaHoldProgress=.42;});await clickVisible(mobile,'craft','touch');
    await mobile.waitForFunction(()=>window.__qaFreeze,null,{timeout,polling:20});await screenshot(mobile,'mobile-03-mid-transition.png','Actual touch entry; RAF held after an intermediate frame for screenshot only.');
    await mobile.evaluate(()=>window.__qaResume());await waitState(mobile,'focused','craft');await screenshot(mobile,'mobile-04-focus.png');
    await assertViewportOrigin(mobile);
    const focusBox=await mobile.locator('[data-stamp="craft"]').boundingBox();assert.ok(Math.abs(focusBox.x+focusBox.width/2-195)<1);
    await mobile.touchscreen.tap(25,450);await mobile.waitForFunction(()=>window.__postalGallery.getDiagnostics().selected===null,{timeout});await mobile.waitForTimeout(300);await screenshot(mobile,'mobile-05-return.png');
    const overflow=await mobile.evaluate(()=>({innerWidth,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth}));
    assert.equal(overflow.documentWidth,390);assert.equal(overflow.bodyWidth,390);
    return { genuineTouchEntryAndBackgroundExit:true,overflow };
  });

  await check('mobile: all six stamps are reachable with real touch', async () => {
    const selected=[];for(const id of ids){try{await closeGallery(mobile);const point=await clickVisible(mobile,id,'touch');await waitState(mobile,'focused',id);await assertViewportOrigin(mobile);selected.push({id,point});await mobile.locator('.close-focus').tap();await mobile.waitForFunction(()=>window.__postalGallery.getDiagnostics().selected===null,null,{timeout});}catch(error){throw Error(`${id}: ${error.message}`);}}
    return selected;
  });

  await check('lifecycle: explicit dispose is idempotent and releases uploaded GPU assets', async () => {
    const page=await createPage();
    const result=await page.evaluate(()=>{
      const api=window.__postalGallery,before=api.getDiagnostics();api.dispose();api.dispose();
      return {before,after:api.getDiagnostics(),canvasCount:document.querySelectorAll('canvas').length,globalRemoved:!window.__postalGallery};
    });
    assert.equal(result.canvasCount,0);assert.equal(result.globalRemoved,true);assert.equal(result.after.renderer.geometries,0);assert.equal(result.after.renderer.textures,0);
    await page.close();return result;
  });

  const reduced=await createPage({ reducedMotion:'reduce' });
  await check('reduced motion: static renderer, stable pixels and live preference changes', async () => {
    await reduced.waitForTimeout(900);assert.equal((await diagnostic(reduced)).reducedMotion,true);
    const before=await reduced.evaluate(()=>window.__qaRafExecutions);
    const first=await reduced.screenshot();await reduced.waitForTimeout(350);const second=await reduced.screenshot();
    assert.equal(await reduced.evaluate(()=>window.__qaRafExecutions),before);
    const firstHash=createHash('sha256').update(first).digest('hex'),secondHash=createHash('sha256').update(second).digest('hex');assert.equal(firstHash,secondHash);
    await clickVisible(reduced,'craft');await waitState(reduced,'focused','craft');await screenshot(reduced,'reduced-motion-focus.png');
    await reduced.emulateMedia({reducedMotion:'no-preference'});await reduced.waitForTimeout(250);const running=await reduced.evaluate(()=>window.__qaRafExecutions);await reduced.waitForTimeout(250);assert.ok(await reduced.evaluate(()=>window.__qaRafExecutions)>running);
    await reduced.emulateMedia({reducedMotion:'reduce'});await reduced.waitForTimeout(500);const stopped=await reduced.evaluate(()=>window.__qaRafExecutions);await reduced.waitForTimeout(250);assert.equal(await reduced.evaluate(()=>window.__qaRafExecutions),stopped);
    return { rafCount:before,stableScreenshotSHA256:firstHash,livePreferenceRestartsAndStops:true };
  });

  await check('WebGL context loss: renderer cleans up and paper fallback remains interactive', async () => {
    await closeGallery(desktop);
    const extension=await desktop.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_lose_context');if(!ext)return false;ext.loseContext();return true;});
    assert.ok(extension,'WEBGL_lose_context unavailable');
    await desktop.locator('.fallback-gallery').waitFor({state:'visible',timeout});await desktop.waitForFunction(()=>[...document.querySelectorAll('.fallback-stamp img')].every(img=>img.complete&&img.naturalWidth>0),{timeout});
    assert.equal(await desktop.locator('canvas').count(),0);assert.equal(await desktop.evaluate(()=>window.__postalGallery),undefined);
    await desktop.locator('.fallback-craft').click();await desktop.locator('.fallback-gallery.is-focused').waitFor({timeout});
    await desktop.keyboard.press('Escape');await desktop.waitForFunction(()=>!document.querySelector('.fallback-gallery').classList.contains('is-focused'));
    await desktop.screenshot({path:join(output,'desktop-context-loss-fallback.png')});report.screenshots.push({file:'desktop-context-loss-fallback.png',note:'Real WEBGL_lose_context event, with renderer removed and DOM edition restored.'});
    return { realContextLost:true,canvasRemoved:true,diagnosticRemoved:true,interactiveFallback:true };
  });

  await check('WebGL disabled: DOM paper edition loads, focuses and exits', async () => {
    const disabled=await chromium.launch({channel:'chrome',headless:true,args:['--disable-webgl']});
    const expectedConsoleErrors=[];const unexpectedPageErrors=[];
    try {
      const page=await disabled.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      page.on('console',msg=>{if(msg.type()==='error')expectedConsoleErrors.push(msg.text());});page.on('pageerror',error=>unexpectedPageErrors.push(error.message));
      await page.goto(baseURL,{waitUntil:'networkidle'});await page.locator('.fallback-gallery').waitFor({state:'visible',timeout});
      await page.waitForFunction(()=>[...document.querySelectorAll('.fallback-stamp img')].every(img=>img.complete&&img.naturalWidth>0),null,{timeout});
      assert.equal(await page.locator('.fallback-stamp').count(),6);assert.equal(await page.locator('canvas').count(),0);
      await page.locator('.fallback-craft').tap();await page.locator('.fallback-gallery.is-focused').waitFor({timeout});
      await page.screenshot({path:join(output,'mobile-webgl-disabled-focus.png')});report.screenshots.push({file:'mobile-webgl-disabled-focus.png',note:'Separate Chrome launched with --disable-webgl; all artwork remains usable as DOM images.'});
      await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.fallback-gallery').classList.contains('is-focused'));
      assert.deepEqual(unexpectedPageErrors,[]);
      assert.ok(expectedConsoleErrors.every(text=>/WebGL|context/i.test(text)),JSON.stringify(expectedConsoleErrors));
      return {artworkCount:6,canvasCount:0,focusAndEscape:true,expectedConsoleErrors,unexpectedPageErrors};
    } finally {await disabled.close();}
  });

  await check('browser console and page errors',async()=>{assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.pageErrors,[]);return {consoleErrors:0,pageErrors:0};});
} finally {
  report.finishedAt=new Date().toISOString();report.result=report.checks.every(x=>x.result==='passed')?'passed':'failed';
  const reportName=process.env.VERIFY_ONLY?`browser-report-${process.env.VERIFY_ONLY.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.json`:'browser-report.json';
  await writeFile(join(output,reportName),JSON.stringify(report,null,2));
  await Promise.all(allContexts.map(context=>context.close()));await browser.close();
}
if(report.result!=='passed')process.exitCode=1;
console.log(JSON.stringify({result:report.result,checks:report.checks.length,failed:report.checks.filter(x=>x.result==='failed').map(x=>x.name),output},null,2));
