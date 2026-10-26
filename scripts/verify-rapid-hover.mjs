import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

const baseURL = process.env.VERIFY_URL || 'http://127.0.0.1:4173/';
const phase = process.env.RAPID_PHASE || 'after';
const output = resolve('artifacts/rapid-hover');
await mkdir(output, { recursive: true });
const sources = ['src/rendering/StampGallery.js', 'src/rendering/StampMaterial.js', 'src/rendering/DappledLight.js', 'src/parameters.js'];
const sourceHashes = async () => Object.fromEntries(await Promise.all(sources.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
const report = { phase, baseURL, startedAt: new Date().toISOString(), checks: [], errors: [], sourceHashesBefore: await sourceHashes() };
const shader = await readFile('src/rendering/StampMaterial.js', 'utf8');
const hardBlurGate = /activity\s*>\s*0\.001\s*&&\s*uBlur\s*<\s*0\.02/.test(shader);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const contexts = [];
const ids = ['joy', 'anger', 'sorrow', 'delight', 'motion', 'stillness', 'surprise', 'doubt'];
function instrument() {
  window.__rapidFrames = [];
  window.__rapidEnters = [];
  window.__rapidDraws = [];
  window.__rapidPixelProbe = null;
  window.__rapidPixelResult = null;
  let lastPaperDraw = null;
  document.addEventListener('pointerover', e => {
    const id = e.target.closest('[data-stamp]')?.dataset.stamp;
    if (id && e.pointerType !== 'touch') window.__rapidEnters.push({ id, at: performance.now() });
  }, true);
  for (const type of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
    const proto = window[type]?.prototype;
    if (!proto) continue;
    const locations = new WeakMap(), values = new WeakMap(), activityLocations = new WeakMap();
    const nativeUniform = proto.uniform1f;
    const get = proto.getUniformLocation;
    proto.getUniformLocation = function (program, name) {
      const location = get.call(this, program, name);
      if (location) locations.set(location, { program, name });
      if (location && name === 'uActivity') activityLocations.set(program, location);
      return location;
    };
    for (const method of ['uniform1f', 'uniform2f']) {
      const original = proto[method];
      proto[method] = function (location, ...args) {
        const descriptor = locations.get(location);
        if (descriptor) {
          const state = values.get(descriptor.program) || {};
          state[descriptor.name] = args.length === 1 ? args[0] : args;
          values.set(descriptor.program, state);
        }
        return original.call(this, location, ...args);
      };
    }
    for (const method of ['drawElements', 'drawArrays']) {
      const original = proto[method];
      proto[method] = function (...args) {
        const result = original.apply(this, args);
        const state = values.get(this.getParameter(this.CURRENT_PROGRAM));
        if (state && 'uActivity' in state && 'uBlur' in state) {
          window.__rapidDraws.push({ at: performance.now(), activity: state.uActivity, blur: state.uBlur, uv: state.uPointer, size: state.uSize });
          lastPaperDraw = { gl: this, original, args, state: { ...state }, program: this.getParameter(this.CURRENT_PROGRAM), activityLocation: activityLocations.get(this.getParameter(this.CURRENT_PROGRAM)), nativeUniform };
        }
        return result;
      };
    }
  }
  const native = requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => native(timestamp => {
    window.__rapidDraws = [];
    callback(timestamp);
    const d = window.__postalGallery?.getDiagnostics();
    if (d) {
      window.__rapidFrames.push({ at: performance.now(), timestamp, hovered: d.hovered, selected: d.selected, lightStates: d.lightStates, background: d.background, lastDraw: window.__rapidDraws.at(-1), draws: window.__rapidDraws });
      if (window.__rapidFrames.length > 2400) window.__rapidFrames.shift();
      // Compare the actual active stamp draw with an immediate redraw of the
      // same pixels, geometry, blur and optical texture with activity zero.
      // The square is wholly inside opaque paper; restore the real uniform and
      // draw before returning. This separates light from deblur/pose changes.
      if (window.__rapidPixelProbe && d.hovered === window.__rapidPixelProbe && lastPaperDraw) {
        const { gl, original, args, state, program, activityLocation, nativeUniform } = lastPaperDraw;
        if (gl.getParameter(gl.CURRENT_PROGRAM) === program && !gl.getParameter(gl.FRAMEBUFFER_BINDING)) {
          const rect = document.querySelector(`[data-stamp="${d.hovered}"]`).getBoundingClientRect();
          const ratio = gl.drawingBufferWidth / innerWidth, side = 48;
          const x = Math.round((rect.left + rect.width / 2) * ratio - side / 2);
          const y = Math.round(gl.drawingBufferHeight - (rect.top + rect.height / 2) * ratio - side / 2);
          const lit = new Uint8Array(side * side * 4), off = new Uint8Array(lit.length);
          gl.readPixels(x, y, side, side, gl.RGBA, gl.UNSIGNED_BYTE, lit);
          nativeUniform.call(gl, activityLocation, 0);
          original.apply(gl, args);
          gl.readPixels(x, y, side, side, gl.RGBA, gl.UNSIGNED_BYTE, off);
          nativeUniform.call(gl, activityLocation, state.uActivity);
          original.apply(gl, args);
          let delta = 0, changed = 0;
          for (let i = 0; i < lit.length; i += 4) {
            const difference = Math.abs(lit[i] - off[i]) + Math.abs(lit[i + 1] - off[i + 1]) + Math.abs(lit[i + 2] - off[i + 2]);
            delta += difference; if (difference > 0) changed++;
          }
          window.__rapidPixelResult = { id: d.hovered, at: performance.now(), activity: state.uActivity, blur: state.uBlur, meanRGBDelta: delta / (side * side * 3), changedPixels: changed, samplePixels: side * side, rgbaError: gl.getError() };
          window.__rapidPixelProbe = null;
        }
      }
    }
  });
}
async function pageFor(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...options });
  contexts.push(context);
  await context.addInitScript(instrument);
  const page = await context.newPage();
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') report.errors.push(e.text()); });
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__postalGallery && [...document.querySelectorAll('[data-stamp]')].every(b => Number.parseFloat(b.style.width) > 30));
  if (await page.locator('.parameter-launcher').getAttribute('aria-expanded') === 'true') await page.locator('.parameter-launcher').click();
  await page.evaluate(() => __postalGallery.configure({ tiltEnabled: false, lightAnimation: false, hoverScale: 1, hoverLift: 0, pinLight: false }));
  await page.mouse.move(10, 850);
  await page.waitForTimeout(450);
  return page;
}
async function point(page, id) {
  return page.locator(`[data-stamp="${id}"]`).evaluate(button => {
    const r = button.getBoundingClientRect(), points = [];
    for (let y = .15; y <= .85; y += .1) for (let x = .15; x <= .85; x += .1) {
      const px = r.left + r.width * x, py = r.top + r.height * y;
      if (document.elementFromPoint(px, py)?.closest('[data-stamp]') === button) points.push({ x: px, y: py, distance: Math.hypot(x - .5, y - .5) });
    }
    points.sort((a, b) => a.distance - b.distance);
    return points[0];
  });
}
async function move(page, id) {
  const p = await point(page, id);
  assert.ok(p, `${id} exposed target`);
  await page.mouse.move(p.x, p.y);
}
async function check(name, run) {
  try { const details = await run(); report.checks.push({ name, result: 'passed', details }); console.log(`PASS ${name}`); }
  catch (e) { report.checks.push({ name, result: 'failed', error: e.stack }); console.error(`FAIL ${name}: ${e.message}`); }
}
function summarize(frames, enters) {
  return enters.map((entry, index) => {
    const finish = enters[index + 1]?.at ?? Infinity;
    const current = frames.filter(f => f.at >= entry.at && f.at < finish && f.hovered === entry.id && f.lastDraw);
    const activity = current.find(f => f.lastDraw.activity > .01);
    const eligible = current.find(f => f.lastDraw.activity > .01 && (!hardBlurGate || f.lastDraw.blur < .02));
    return { id: entry.id, dwellMs: Number.isFinite(finish) ? finish - entry.at : null, frameCount: current.length, firstFrameMs: current[0]?.at - entry.at, firstActivityMs: activity?.at - entry.at, firstEligibleMs: eligible?.at - entry.at, firstOwner: current[0]?.background?.owner, blockedFrames: current.filter(f => f.lastDraw.activity > .01 && hardBlurGate && f.lastDraw.blur >= .02).length, firstDraw: current[0]?.lastDraw, lastDraw: current.at(-1)?.lastDraw };
  });
}
try {
  const page = await pageFor();
  await check('cold first hover and a switch from a fully blurred card', async () => {
    await page.evaluate(() => { __rapidFrames.length = 0; __rapidEnters.length = 0; });
    await move(page, 'joy'); await page.waitForTimeout(650);
    await move(page, 'anger'); await page.waitForTimeout(700);
    const data = await page.evaluate(() => ({ frames: __rapidFrames, enters: __rapidEnters }));
    const summary = summarize(data.frames, data.enters);
    await writeFile(join(output, `${phase}-cold-switch-frames.json`), JSON.stringify(data));
    await page.screenshot({ path: join(output, `${phase}-warm-anger.png`) });
    assert.equal(summary.length, 2);
    if (phase !== 'baseline') for (const item of summary) {
      assert.ok(item.firstEligibleMs < 110, JSON.stringify(item));
      assert.ok(item.firstDraw.activity > .01, JSON.stringify(item));
      assert.equal(item.firstOwner, item.id);
    }
    return { hardBlurGate, summary };
  });
  await check('eight cards switch repeatedly with 40, 80 and 120ms dwell', async () => {
    const runs = [];
    const before = await page.evaluate(() => __postalGallery.getDiagnostics());
    for (const dwell of [40, 80, 120]) {
      await page.mouse.move(10, 850); await page.waitForTimeout(500);
      await page.evaluate(() => { __rapidFrames.length = 0; __rapidEnters.length = 0; });
      for (const id of ids) { await move(page, id); await page.waitForTimeout(dwell); }
      await page.waitForTimeout(70);
      const data = await page.evaluate(() => ({ frames: __rapidFrames, enters: __rapidEnters }));
      const summary = summarize(data.frames, data.enters);
      await writeFile(join(output, `${phase}-rapid-${dwell}-frames.json`), JSON.stringify(data));
      assert.equal(summary.length, 8);
      if (phase !== 'baseline') for (const item of summary) {
        assert.ok(item.firstEligibleMs < 110, JSON.stringify(item));
        assert.ok(item.firstDraw.activity > .01, JSON.stringify(item));
        assert.equal(item.firstOwner, item.id);
      }
      runs.push({ requestedDwellMs: dwell, summary });
    }
    const after = await page.evaluate(() => __postalGallery.getDiagnostics());
    assert.deepEqual(after.materials, before.materials); assert.deepEqual(after.textures, before.textures);
    assert.equal(after.renderer.textures, before.renderer.textures);
    return { runs, stableMaterials: true, stableTextures: true, textures: after.renderer.textures };
  });
  await check('inactive cards settle and the background remains static', async () => {
    await page.mouse.move(10, 850); await page.waitForTimeout(1500);
    const d = await page.evaluate(() => __postalGallery.getDiagnostics());
    assert.ok(d.lightStates.every(s => s.amount === 0));
    const count = await page.evaluate(() => __rapidFrames.length);
    const clip = { x: 10, y: 200, width: 180, height: 180 };
    const a = await page.screenshot({ clip });
    await page.waitForTimeout(250);
    const b = await page.screenshot({ clip });
    assert.deepEqual(a, b); assert.equal(await page.evaluate(() => __rapidFrames.length), count);
    return { stoppedFrames: count, allLightsZero: true, staticPaperPixels: true };
  });
  await check('the first switched draw has real light pixels while deblur is still running', async () => {
    await page.evaluate(() => __postalGallery.configure({ lightEnabled: true, lightFadeIn: .12, lightFadeOut: .16 }));
    await move(page, 'joy'); await page.waitForTimeout(700);
    await page.evaluate(() => { __rapidPixelProbe = 'anger'; __rapidPixelResult = null; });
    await move(page, 'anger');
    await page.waitForFunction(() => __rapidPixelResult);
    const pixels = await page.evaluate(() => __rapidPixelResult);
    assert.equal(pixels.rgbaError, 0);
    assert.ok(pixels.activity > .01 && pixels.blur > 1, JSON.stringify(pixels));
    if (phase !== 'baseline') assert.ok(pixels.meanRGBDelta > .05 && pixels.changedPixels > 100, JSON.stringify(pixels));
    return pixels;
  });
  await check('custom fade, disabled light and reduced motion retain their semantics', async () => {
    await page.evaluate(() => __postalGallery.configure({ lightFadeOut: .02 }));
    await page.mouse.move(10, 850); await page.waitForTimeout(500);
    await page.evaluate(() => __postalGallery.configure({ lightFadeIn: .8, lightFadeOut: .8 }));
    await move(page, 'joy'); await page.waitForTimeout(150);
    const gradual = await page.evaluate(() => __postalGallery.getDiagnostics());
    const amount = gradual.lightStates.find(s => s.id === 'joy').amount;
    assert.ok(amount > .01 && amount < .6, String(amount));
    await page.evaluate(() => __postalGallery.configure({ lightEnabled: false }));
    await page.waitForTimeout(50); await move(page, 'motion');
    const off = await page.evaluate(() => __postalGallery.getDiagnostics());
    assert.equal(off.background.enabled, false); assert.equal(off.background.active, false);
    const reduced = await pageFor({ reducedMotion: 'reduce' });
    await move(reduced, 'surprise'); await reduced.waitForTimeout(1500);
    const before = await reduced.evaluate(() => ({ count: __rapidFrames.length, d: __postalGallery.getDiagnostics() }));
    await reduced.waitForTimeout(250);
    const after = await reduced.evaluate(() => ({ count: __rapidFrames.length, d: __postalGallery.getDiagnostics() }));
    assert.equal(before.count, after.count); assert.equal(before.d.background.time, after.d.background.time);
    return { customFadeActivityAfter150ms: amount, offStopsOpticalField: true, reducedMotionStopsRAF: true };
  });
  await check('source stability and browser error audit', async () => {
    report.sourceHashesAfter = await sourceHashes();
    assert.deepEqual(report.sourceHashesAfter, report.sourceHashesBefore); assert.deepEqual(report.errors, []);
    return { errors: 0, unchangedSources: true };
  });
} finally {
  report.finishedAt = new Date().toISOString();
  report.result = report.checks.every(c => c.result === 'passed') ? 'passed' : 'failed';
  await writeFile(join(output, `${phase}-report.json`), JSON.stringify(report, null, 2));
  await Promise.all(contexts.map(c => c.close())); await browser.close();
}
console.log(JSON.stringify({ phase, result: report.result, checks: report.checks.length }));
if (report.result !== 'passed') process.exitCode = 1;
