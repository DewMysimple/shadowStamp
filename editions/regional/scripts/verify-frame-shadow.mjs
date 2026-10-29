import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { normalizeFrameParameters } from '../src/frameParameters.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const project = resolve(root, '../..'), out = resolve(root, 'artifacts/frame-shadow');
await mkdir(out, { recursive: true });
const report = { startedAt: new Date().toISOString(), baseline: 'f29710d',
  scope: 'Actual old/new GPU wall pixels; horizontal banding, unchanged model/artwork, tilted wall shadows, parameter extremes, spatial precision, caching and target disposal. Desktop only.',
  checks: [], errors: [], warnings: [] };
const hash = data => createHash('sha256').update(Buffer.from(data.buffer, data.byteOffset, data.byteLength)).digest('hex');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--enable-unsafe-swiftshader'] });
const contexts = [];
async function open(baseline = false) {
  const context = await browser.newContext({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 });
  contexts.push(context);
  if (baseline) for (const file of ['ArtFrame.js', 'FrameContactShadow.js']) {
    const source = execFileSync('git', ['show', `f29710d:editions/regional/src/rendering/${file}`], { cwd: project, encoding: 'utf8' });
    await context.route(`**/src/rendering/${file}*`, async route => {
      const response = await route.fetch(), transformed = await response.text();
      const imports = [...transformed.matchAll(/\bfrom\s*["']([^"']+)["']/g)].map(match => match[1]);
      const body = source.replace(/\bfrom (['"])(three(?:\/[^'"]*)?)\1/g, (_, quote, specifier) => {
        const name = specifier.split('/').at(-1).replace('.js', '');
        const url = imports.find(url => specifier === 'three' ? /\/three\.js(?:\?|$)/.test(url) : url.includes(name));
        assert.ok(url, `Vite import missing for ${specifier}`);
        return `from '${url}'`;
      });
      await route.fulfill({ response, contentType: 'application/javascript',
        body });
    });
  }
  await context.addInitScript(() => {
    const q = window.__shadowQA = { contexts: 0, draws: {}, viewports: {}, sources: {}, targets: new Set(), deleted: new Set() };
    const seen = new WeakSet(), kinds = new WeakMap(); let current = null;
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, attributes) {
      const gl = get.call(this, type, /^webgl/.test(type) ? { ...attributes, preserveDrawingBuffer: true } : attributes);
      if (/^webgl/.test(type) && gl && !seen.has(gl)) { seen.add(gl); q.contexts++; }
      return gl;
    };
    const P = WebGL2RenderingContext.prototype, location = P.getUniformLocation, use = P.useProgram;
    P.getUniformLocation = function(program, name) {
      const result = location.call(this, program, name);
      const kind = { uWallZ: 'visibility', h: 'horizontal', v: 'vertical' }[name];
      if (result && kind) kinds.set(program, kind);
      return result;
    };
    P.useProgram = function(program) { current = program; return use.call(this, program); };
    const source = P.shaderSource;
    P.shaderSource = function(shader, text) {
      if (text.includes('uniform float uSoftness, uWallZ')) q.sources.visibility128 = text.includes('i < 128');
      return source.call(this, shader, text);
    };
    for (const name of ['drawElements', 'drawArrays']) {
      const draw = P[name];
      P[name] = function(...args) {
        const kind = kinds.get(current);
        if (kind) {
          const target = this.getParameter(this.FRAMEBUFFER_BINDING);
          q.targets.add(target); q.draws[kind] = (q.draws[kind] || 0) + 1;
          q.viewports[kind] = Array.from(this.getParameter(this.VIEWPORT));
          if (kind === 'visibility') q.visibilityFramebuffer = target;
        }
        return draw.call(this, ...args);
      };
    }
    const destroy = P.deleteFramebuffer;
    P.deleteFramebuffer = function(target) { q.deleted.add(target); return destroy.call(this, target); };
  });
  const page = await context.newPage();
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error') report.errors.push(m.text());
    if (m.type() === 'warning') report.warnings.push(m.text());
  });
  await page.goto(process.env.VERIFY_URL || 'http://127.0.0.1:4174/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__postalGallery?.getDiagnostics().artFrame.loaded, {}, { timeout: 60000 });
  await outside(page);
  return page;
}
async function settle(page) {
  await page.waitForFunction(() => {
    const d = __postalGallery.getDiagnostics().artFrame, t = d.tilt, p = d.parameters;
    const target = t.pointerInside && t.enabled && !d.reducedMotion ? t.target : [0, 0];
    return d.categories.every(c => c.reveal === 1) && d.renderPass.cached &&
      Math.abs(t.rotation[0] + target[1] * p.tiltDegrees * Math.PI / 180) < 1e-7 &&
      Math.abs(t.rotation[1] - target[0] * p.tiltDegrees * Math.PI / 180) < 1e-7;
  }, {}, { timeout: 20000 });
}
async function outside(page) { const v = page.viewportSize(); await page.mouse.move(v.width - 5, 60); await settle(page); }
async function state(page) { return page.evaluate(() => __postalGallery.getDiagnostics()); }
async function configure(page, values) { await page.evaluate(p => __postalGallery.configureFrame(p), values); await settle(page); }
async function pixels(page, points) {
  return page.evaluate(points => {
    const gl = document.querySelector('.exhibition-canvas').getContext('webgl2');
    const prior = gl.getParameter(gl.FRAMEBUFFER_BINDING), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const bytes = new Uint8Array(w * h * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, bytes); gl.bindFramebuffer(gl.FRAMEBUFFER, prior);
    return points.flatMap(([x,y]) => {
      const i = ((h - 1 - Math.floor(y * h / innerHeight)) * w + Math.floor(x * w / innerWidth)) * 4;
      return Array.from(bytes.subarray(i, i + 3));
    });
  }, points);
}
async function wallProfiles(page) {
  const d = (await state(page)).artFrame, y = Math.ceil(Math.max(...d.frameCorners.map(p => p[1]))) + 4;
  const minX = Math.min(...d.frameCorners.map(p => p[0])), maxX = Math.max(...d.frameCorners.map(p => p[0]));
  const span = Math.round((maxX - minX) * .05), rows = Math.round((maxX - minX) * .085);
  const profiles = [];
  for (const fraction of [.3, .5, .7]) {
    const x = minX + fraction * (maxX - minX), points = [];
    for (let dy = 0; dy < rows; dy++) for (let dx = -span; dx <= span; dx++) points.push([x + dx, y + dy]);
    const data = await pixels(page, points), width = span * 2 + 1, values = [];
    for (let row = 0; row < rows; row++) {
      let sum = 0; for (let i = row * width * 3; i < (row + 1) * width * 3; i++) sum += data[i];
      values.push(sum / (width * 3));
    }
    const slope = values.slice(1).map((v, i) => v - values[i]);
    const curvature = slope.slice(1).map((v, i) => Math.abs(v - slope[i]));
    profiles.push({ x, y, values, maxStep: Math.max(...slope.map(Math.abs)), maxCurvature: Math.max(...curvature) });
  }
  return profiles;
}
async function targetPixels(page) {
  return page.evaluate(() => {
    const gl = document.querySelector('.exhibition-canvas').getContext('webgl2'), q = __shadowQA;
    const prior = gl.getParameter(gl.FRAMEBUFFER_BINDING); gl.bindFramebuffer(gl.FRAMEBUFFER, q.visibilityFramebuffer);
    const data = new Float32Array(1024 * 626 * 4), type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
    gl.readPixels(0, 0, 1024, 626, gl.RGBA, gl.FLOAT, data);
    const error = gl.getError(); gl.bindFramebuffer(gl.FRAMEBUFFER, prior);
    let min = Infinity, max = -Infinity, finite = true;
    const precision = new Set();
    for (let i = 0; i < data.length; i += 4) { const v = data[i]; finite &&= Number.isFinite(v); min = Math.min(min, v); max = Math.max(max, v); if (v > 0 && v < 1) precision.add(v); }
    return { type, error, min, max, finite, intermediateValues: precision.size,
      centerProfile: Array.from({ length: 120 }, (_, i) => data[((175 - i) * 1024 + 512) * 4]),
      sources: q.sources, viewports: q.viewports, targets: q.targets.size, contexts: q.contexts };
  });
}
async function check(name, task) {
  try { const evidence = await task(); report.checks.push({ name, passed: true, evidence }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, passed: false, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
}

let page;
try {
  const baseline = await open(true), baselineState = await state(baseline), oldProfiles = await wallProfiles(baseline);
  const f = baselineState.artFrame, points = [];
  for (let y = 0; y < 22; y++) for (let x = 0; x < 44; x++) points.push([
    f.viewport.x + f.viewport.width * (.10 + x / 43 * .8), f.viewport.y + f.viewport.height * (.12 + y / 21 * .76) ]);
  for (const pose of baselineState.poses.filter(p => ['foshan','guangzhou','heshan','suixi'].includes(p.id))) {
    const xs = pose.corners.map(p=>p[0]), ys = pose.corners.map(p=>p[1]);
    for (let y = 1; y <= 6; y++) for (let x = 1; x <= 6; x++) points.push([
      Math.min(...xs)+(Math.max(...xs)-Math.min(...xs))*x/7,
      Math.min(...ys)+(Math.max(...ys)-Math.min(...ys))*y/7]);
  }
  points.push([150,100], [2400,1100], [2500,1390], [1650,160]);
  const originalPixels = await pixels(baseline, points);
  await baseline.screenshot({ path: join(out, 'before-2560.png') });
  await baseline.setViewportSize({ width: 1440, height: 900 }); await outside(baseline);
  await baseline.screenshot({ path: join(out, 'before-1440.png') });
  await baseline.context().close();
  page = await open(); const d = await state(page), newProfiles = await wallProfiles(page);
  await page.screenshot({ path: join(out, 'final-2560.png') });
  const lower = Math.floor(Math.max(...d.artFrame.frameCorners.map(p => p[1]))) - 6;
  await page.screenshot({ path: join(out, 'final-shadow-detail.png'), clip: { x: 40, y: lower, width: 1520, height: 190 } });
  await writeFile(join(out, 'shadow-profiles.json'), JSON.stringify({ old: oldProfiles, current: newProfiles }, null, 2));
  await check('Long horizontal shadow terraces disappear in actual wall pixels', async () => {
    for (let i = 0; i < oldProfiles.length; i++) {
      assert.ok(oldProfiles[i].maxCurvature > 1, 'baseline must reproduce the reported stepped shadow');
      assert.ok(newProfiles[i].maxCurvature < oldProfiles[i].maxCurvature * .45, 'spatial filtering must remove the abrupt plateaus');
      assert.ok(newProfiles[i].values.at(-1) - newProfiles[i].values[0] > 20, 'retain a visible contact shadow');
    }
    return oldProfiles.map((p, i) => ({ x: p.x, before: p.maxCurvature, after: newProfiles[i].maxCurvature }));
  });
  await check('Only wall projection changes; model, source lighting, page and stamp pixels are preserved', async () => {
    const actual = await pixels(page, points); assert.deepEqual(actual, originalPixels);
    assert.deepEqual(d.artFrame.modelToClip, baselineState.artFrame.modelToClip);
    assert.deepEqual(d.artFrame.materials, baselineState.artFrame.materials);
    assert.deepEqual(d.artFrame.parameters, baselineState.artFrame.parameters);
    assert.deepEqual(d.artFrame.studio.softboxes, baselineState.artFrame.studio.softboxes);
    return { samples: points.length, sha256: hash(Uint8Array.from(actual)), sourceLights: 3, unchangedModel: true };
  });
  await check('Real GPU visibility is half-float, spatially filtered and not 8-bit quantized', async () => {
    const gpu = await targetPixels(page); assert.equal(gpu.error, 0);
    assert.ok([5126,5131].includes(gpu.type), 'driver may recommend FLOAT or HALF_FLOAT for a half-float attachment');
    assert.equal(gpu.contexts, 1); assert.equal(gpu.targets, 2); assert.ok(gpu.sources.visibility128);
    assert.ok(gpu.finite && gpu.min >= 0 && gpu.max <= 1.001); assert.ok(gpu.intermediateValues > 1000);
    for (const v of Object.values(gpu.viewports)) assert.deepEqual(v, [0, 0, 1024, 626]);
    await writeFile(join(out, 'shadow-gpu.json'), JSON.stringify(gpu, null, 2)); return gpu;
  });
  await check('All four 5-degree corners keep continuous stable shadows, then return to rest', async () => {
    const p = normalizeFrameParameters(); p.tiltDegrees = 5; await configure(page, p); const v = (await state(page)).artFrame.viewport, results = [];
    for (const [x,y] of [[.02,.02],[.98,.02],[.98,.98],[.02,.98]]) {
      await page.mouse.move(v.x + v.width*x, v.y + v.height*y); await settle(page);
      const at = (await state(page)).artFrame, one = await targetPixels(page); await page.waitForTimeout(100);
      const two = await targetPixels(page); assert.deepEqual(one.centerProfile, two.centerProfile);
      assert.ok(one.finite && one.min >= 0 && one.max <= 1.001); results.push({ rotation: at.tilt.rotation, stable: true });
    }
    await page.screenshot({ path: join(out, 'final-tilt-2560.png') });
    await outside(page); await configure(page, normalizeFrameParameters()); return results;
  });
  await check('Opacity, softness and black-light extremes stay finite and retain parameter behavior', async () => {
    const p = normalizeFrameParameters(), all = [];
    for (const softness of [.25, 2]) {
      await configure(page, { ...p, shadowSoftness: softness }); const gpu = await targetPixels(page);
      assert.ok(gpu.finite && gpu.min >= 0 && gpu.max <= 1.001); all.push({ softness, profile: gpu.centerProfile });
    }
    assert.notDeepEqual(all[0].profile, all[1].profile);
    await configure(page, { ...p, shadowOpacity: 0 }); const off = await wallProfiles(page);
    await configure(page, { ...p, lights: p.lights.map(light => ({ ...light, color: [0, 0, 0] })) });
    const black = await wallProfiles(page); assert.deepEqual(black.map(p=>p.values), off.map(p=>p.values));
    await configure(page, { ...p, shadowOpacity: .8 }); const dark = await wallProfiles(page);
    assert.ok(dark[1].values[0] < newProfiles[1].values[0] - 20);
    await configure(page, p); return { softnessExtremes: all.map(p=>p.softness), blackLightsLeaveNoShadow: true, opacityRange: [0,.8] };
  });
  await check('Shadow cache is independent of category, exposure and resize; stationary pixels do not flicker', async () => {
    await outside(page); const before = (await state(page)).artFrame, profiles = await wallProfiles(page);
    for (let i = 0; i < 6; i++) { await page.waitForTimeout(50); assert.deepEqual(await wallProfiles(page), profiles); }
    await configure(page, { ...normalizeFrameParameters(), exposure: .8 });
    assert.equal((await state(page)).artFrame.studio.shadowProjection.renders, before.studio.shadowProjection.renders);
    for (const series of ['china', 'guangdong']) {
      await page.evaluate(series => __postalGallery.setSeries(series), series);
      await page.waitForFunction(series => __postalGallery.getDiagnostics().series === series, series);
      await settle(page);
      assert.equal((await state(page)).artFrame.studio.shadowProjection.renders, before.studio.shadowProjection.renders);
    }
    // Fix the physical pose for the resize invariant: Chromium can dispatch a
    // real pointer relocation while the emulated desktop is being resized.
    const fixed = { ...normalizeFrameParameters(), exposure: .8, tiltEnabled: false };
    await configure(page, fixed); const visibilityBefore = await targetPixels(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForFunction(() => innerWidth === 1440 && Math.abs(__postalGallery.getDiagnostics().artFrame.viewport.width - 1440*.615) < .1);
    await outside(page);
    assert.equal((await state(page)).artFrame.studio.shadowProjection.renders, before.studio.shadowProjection.renders);
    assert.deepEqual((await targetPixels(page)).centerProfile, visibilityBefore.centerProfile);
    await configure(page, normalizeFrameParameters()); await outside(page);
    await page.screenshot({ path: join(out, 'final-1440.png') });
    return { stableSamples: 6, cachedRenders: before.studio.shadowProjection.renders, categories: ['china','guangdong'], resolutionIndependent: true };
  });
  await check('Both shadow render targets are released with the existing gallery lifecycle', async () => {
    await page.evaluate(() => __postalGallery.dispose());
    const cleanup = await page.evaluate(() => ({ targets: __shadowQA.targets.size, deleted: [...__shadowQA.targets].filter(t => __shadowQA.deleted.has(t)).length }));
    assert.equal(cleanup.targets, 2); assert.equal(cleanup.deleted, 2); return cleanup;
  });
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser.close(); report.finishedAt = new Date().toISOString();
  report.passed = report.checks.length === 7 && report.checks.every(c => c.passed) && report.errors.length === 0;
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
