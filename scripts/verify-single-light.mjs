import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { STAMPS } from '../src/config.js';
import { DEFAULT_PARAMETERS, PARAMETER_FIELDS, PARAMETER_GROUPS, STORAGE_KEY, LEGACY_STORAGE_KEY, serializeParameters } from '../src/parameters.js';

const base = process.env.VERIFY_URL || 'http://127.0.0.1:4173/';
const out = resolve('artifacts/lion-stamps/regression/single-light');
await mkdir(out, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceFiles = ['src/App.jsx', 'src/config.js', 'src/artwork.js', 'src/parameters.js', 'src/ParameterPanel.jsx', 'src/rendering/StampMaterial.js', 'src/rendering/StampGallery.js', 'src/rendering/DappledLight.js', 'src/rendering/dappledShaders.js', 'src/rendering/ncsLighting.js', 'src/rendering/SurfaceTexture.js'];
const fingerprint = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path, hash(await readFile(path))])));
const report = { base, startedAt: new Date().toISOString(), scope: 'One enabled stamp-local light: rendered appearance controls, static surroundings, interaction, migration and resource lifecycle. Visual similarity to reference is reviewed separately.', sourceSnapshot: await fingerprint(), checks: [], errors: [], warnings: [] };
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const contexts = [];
let page;
async function check(name, run) {
  try { const details = await run(); report.checks.push({ name, result: 'passed', details }); console.log(`PASS ${name}`); }
  catch (error) {
    report.checks.push({ name, result: 'failed', error: error.stack, diagnostics: page && !page.isClosed() ? await diag(page).catch(() => null) : null });
    console.error(`FAIL ${name}: ${error.message}`);
    if (page && !page.isClosed()) await page.screenshot({ path: join(out, `failure-${report.checks.length}.png`) }).catch(() => {});
  }
}
async function createPage(options = {}, seededStorage) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...options });
  contexts.push(context);
  await context.addInitScript(({ seededStorage }) => {
    if (seededStorage && !sessionStorage.getItem('__singleLightSeeded')) {
      for (const [key, value] of Object.entries(seededStorage)) localStorage.setItem(key, value);
      sessionStorage.setItem('__singleLightSeeded', '1');
    }
    const q = window.__singleLightQA = { raf: 0, programs: {}, createdTextures: 0, deletedTextures: 0, framebuffers: new Map(), lastOffscreen: null, gl: null };
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => raf(time => { q.raf++; callback(time); });
    const locations = new WeakMap(), programs = new WeakMap(), framebuffers = new WeakMap(); let programId = 0, framebufferId = 0;
    for (const P of [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype].filter(Boolean)) {
      const cp = P.createProgram; P.createProgram = function () { const program = cp.call(this); programs.set(program, ++programId); q.programs[programId] = {}; return program; };
      const locate = P.getUniformLocation; P.getUniformLocation = function (program, name) { const location = locate.call(this, program, name); if (location) locations.set(location, { program: programs.get(program), name }); return location; };
      for (const method of ['uniform1f', 'uniform2f', 'uniform3f', 'uniform2fv', 'uniform3fv']) {
        const original = P[method]; P[method] = function (location, ...values) { const info = locations.get(location); if (info) { const normalized = values.map(value => ArrayBuffer.isView(value) ? Array.from(value) : value); q.programs[info.program][info.name] = normalized.length === 1 ? normalized[0] : normalized; } return original.call(this, location, ...values); };
      }
      const createTexture = P.createTexture, deleteTexture = P.deleteTexture;
      P.createTexture = function () { const texture = createTexture.call(this); if (texture) q.createdTextures++; return texture; };
      P.deleteTexture = function (texture) { if (texture) q.deletedTextures++; return deleteTexture.call(this, texture); };
      const createFramebuffer = P.createFramebuffer; P.createFramebuffer = function () { const fb = createFramebuffer.call(this); framebuffers.set(fb, ++framebufferId); q.framebuffers.set(framebufferId, fb); return fb; };
      const bindFramebuffer = P.bindFramebuffer; P.bindFramebuffer = function (target, fb) { q.gl = this; if (target === this.FRAMEBUFFER || target === this.DRAW_FRAMEBUFFER) this.__singleBoundFramebuffer = fb; return bindFramebuffer.call(this, target, fb); };
      for (const method of ['drawArrays', 'drawElements']) { const original = P[method]; P[method] = function (...args) { if (this.__singleBoundFramebuffer) q.lastOffscreen = framebuffers.get(this.__singleBoundFramebuffer); return original.call(this, ...args); }; }
    }
    window.__singleOpticalHash = () => {
      const gl = q.gl, framebuffer = q.framebuffers.get(q.lastOffscreen); if (!gl || !framebuffer) return null;
      const prior = gl.getParameter(gl.FRAMEBUFFER_BINDING), pixels = new Uint8Array(384 * 480 * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer); gl.readPixels(0, 0, 384, 480, gl.RGBA, gl.UNSIGNED_BYTE, pixels); gl.bindFramebuffer(gl.FRAMEBUFFER, prior);
      let value = 2166136261; for (const byte of pixels) value = Math.imul(value ^ byte, 16777619); return (value >>> 0).toString(16);
    };
  }, { seededStorage });
  const p = await context.newPage();
  p.on('pageerror', error => report.errors.push({ url: p.url(), message: error.message }));
  p.on('console', message => { if (message.type() === 'error') report.errors.push({ url: p.url(), message: message.text() }); if (message.type() === 'warning') report.warnings.push({ url: p.url(), message: message.text() }); });
  await p.goto(base, { waitUntil: 'networkidle' }); await p.waitForFunction(() => !!window.__postalGallery);
  return p;
}
const diag = p => p.evaluate(() => __postalGallery.getDiagnostics());
const gpu = p => p.evaluate(() => Object.values(__singleLightQA.programs));
async function openPanel(p) { if (await p.locator('.parameter-launcher').getAttribute('aria-expanded') !== 'true') await p.locator('.parameter-launcher').click(); }
async function closePanel(p) { if (await p.locator('.parameter-launcher').getAttribute('aria-expanded') === 'true') await p.locator('.parameter-launcher').click(); }
async function set(p, key, value) {
  await openPanel(p);
  const field = PARAMETER_FIELDS.find(field => field.key === key), groupIndex = PARAMETER_GROUPS.findIndex(group => group.fields.some(field => field.key === key));
  assert.ok(field, `Unknown parameter ${key}`);
  const group = p.locator('.parameter-group').nth(groupIndex);
  if (await group.getAttribute('open') === null) await group.locator('summary').click();
  const control = p.locator(`[data-parameter="${key}"]`);
  if (field.type === 'number') await p.getByRole('spinbutton', { name: `${field.label}数值`, exact: true }).fill(String(value));
  else if (field.type === 'boolean') { if (await control.isChecked() !== value) await p.locator(`label[for="parameter-${key}"]`).click(); }
  else await control.evaluate((node, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); }, value);
  await p.waitForFunction(({ key, value }) => __postalGallery.getDiagnostics().parameters[key] === value, { key, value });
}
async function setMany(p, values) { for (const [key, value] of Object.entries(values)) await set(p, key, value); }
async function configure(p, values) { await p.evaluate(values => __postalGallery.configure(values), values); await p.waitForTimeout(120); }
async function focus(p, id = 'joy') {
  const d = await diag(p);
  if (d.selected && d.selected !== id) { await p.evaluate(() => __postalGallery.close()); await p.waitForFunction(() => __postalGallery.getDiagnostics().selected === null); }
  await p.evaluate(id => __postalGallery.focus(id), id);
  await p.waitForFunction(id => { const d = __postalGallery.getDiagnostics(); return d.selected === id && d.phase === 'focused'; }, id);
  await p.waitForTimeout(250);
}
async function pointer(p, u = .65, v = .3, id = 'joy') {
  const pose = (await diag(p)).poses.find(pose => pose.id === id), [bl, tl, , tr] = pose.corners;
  await p.mouse.move(tl[0] + (tr[0] - tl[0]) * u + (bl[0] - tl[0]) * v, tl[1] + (tr[1] - tl[1]) * u + (bl[1] - tl[1]) * v);
  await p.waitForTimeout(650);
}
async function delta(p, before, after, id = 'joy', region = 'inside') {
  const corners = (await diag(p)).poses.find(pose => pose.id === id).corners;
  return p.evaluate(async ({ before, after, corners, region }) => {
    async function decode(base64) { const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode(); const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0); return { data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height }; }
    const a = await decode(before), b = await decode(after), [bl, tl, , tr] = corners, changes = [];
    const minimum = region === 'outside' ? -.2 : .1, maximum = region === 'outside' ? 1.2 : .9;
    for (let v = minimum; v < maximum; v += .0125) for (let u = minimum; u < maximum; u += .0125) {
      if (region === 'outside' && u >= .015 && u <= .985 && v >= .015 && v <= .985) continue;
      const x = Math.round(tl[0] + (tr[0] - tl[0]) * u + (bl[0] - tl[0]) * v), y = Math.round(tl[1] + (tr[1] - tl[1]) * u + (bl[1] - tl[1]) * v);
      if (x < 0 || y < 0 || x >= a.width || y >= a.height) continue;
      const offset = (y * a.width + x) * 4; let change = 0; for (let c = 0; c < 3; c++) change += Math.abs(a.data[offset + c] - b.data[offset + c]) / 3; changes.push(change);
    }
    changes.sort((a, b) => a - b); return { region, samples: changes.length, meanRGBDelta: changes.reduce((sum, value) => sum + value, 0) / changes.length, p95: changes[Math.floor(changes.length * .95)], maximum: changes.at(-1), changedFraction: changes.filter(value => value > .1).length / changes.length };
  }, { before: before.toString('base64'), after: after.toString('base64'), corners, region });
}
async function uniformValue(p, name, expected) {
  const values = (await gpu(p)).filter(program => Object.hasOwn(program, name)).map(program => program[name]);
  assert.ok(values.length, `GPU uniform ${name} must be active`);
  if (typeof expected === 'number') assert.ok(values.some(value => Math.abs(value - expected) < 1e-5), `${name}: ${JSON.stringify(values)} != ${expected}`);
  if (typeof expected === 'string') {
    const rgb = [1, 3, 5].map(offset => Number.parseInt(expected.slice(offset, offset + 2), 16) / 255);
    assert.ok(values.some(value => Array.isArray(value) && value.every((channel, index) => Math.abs(channel - rgb[index]) < 1e-5)), `${name}: ${JSON.stringify(values)} != ${expected}`);
  }
  return values;
}
async function atRest(p) {
  await p.waitForTimeout(1300); const a = await diag(p), ra = await p.evaluate(() => __singleLightQA.raf);
  await p.waitForTimeout(450); const b = await diag(p), rb = await p.evaluate(() => __singleLightQA.raf);
  assert.equal(ra, rb, 'Settled light must stop RAF'); assert.equal(a.background.fieldUpdates, b.background.fieldUpdates); assert.equal(a.background.time, b.background.time);
  return { raf: rb, fieldUpdates: b.background.fieldUpdates, time: b.background.time };
}
async function reset(p) { await openPanel(p); await p.getByRole('button', { name: '全部重置', exact: true }).click(); await p.waitForFunction(defaults => JSON.stringify(__postalGallery.getDiagnostics().parameters) === JSON.stringify(defaults), DEFAULT_PARAMETERS); }
try {
  page = await createPage();
  await check('fresh session has one default enabled light, no preset or model switches', async () => {
    await openPanel(page); const d = await diag(page);
    assert.deepEqual(d.parameters, DEFAULT_PARAMETERS); assert.equal(d.parameters.lightEnabled, true); assert.equal(Object.hasOwn(d.parameters, 'lightModel'), false);
    assert.equal(await page.locator('#parameter-preset,[data-parameter="lightModel"],.parameter-inactive').count(), 0);
    assert.equal(await page.locator('select').count(), 0); assert.equal(await page.getByText(/场景8|效果预设/).count(), 0);
    assert.equal(await page.locator('canvas').count(), 1); assert.equal(await page.locator('[data-parameter="lightEnabled"]').isChecked(), true);
    await page.mouse.move(1200, 100); await page.evaluate(() => document.activeElement?.blur()); const rest = await atRest(page);
    await page.screenshot({ path: join(out, 'single-default-gallery.png') });
    return { fields: PARAMETER_FIELDS.length, oneCanvas: true, noModeSelector: true, lightEnabled: true, idle: rest };
  });
  await check('default light flows on the stamp while the surrounding background remains static', async () => {
    await focus(page); await closePanel(page); await pointer(page);
    const clip = { x: 350, y: 80, width: 160, height: 70 }, a = await page.screenshot(), paperA = await page.screenshot({ clip }), d = await diag(page);
    await page.waitForTimeout(1100); const b = await page.screenshot(), paperB = await page.screenshot({ clip }), e = await diag(page);
    assert.ok(e.background.time > d.background.time); assert.ok(e.background.fieldUpdates > d.background.fieldUpdates);
    assert.equal(hash(paperA), hash(paperB)); const pixels = await delta(page, a, b); assert.ok(pixels.meanRGBDelta > .1, JSON.stringify(pixels));
    assert.ok((e.background.fieldUpdates - d.background.fieldUpdates) / 1.1 < 27, 'Optical work must remain capped');
    await page.screenshot({ path: join(out, 'single-default-focus.png') });
    return { pixels, staticBackgroundSHA256: hash(paperA), before: d.background, after: e.background };
  });
  await check('the default illumination produces warm highlights in real stamp pixels', async () => {
    await configure(page, { ...DEFAULT_PARAMETERS, lightAnimation: false, tiltEnabled: false, lightEnabled: false }); await pointer(page); await page.waitForTimeout(600);
    const unlit = await page.screenshot({ path: join(out, 'default-warm-off.png') });
    await configure(page, { lightEnabled: true }); await pointer(page); const lit = await page.screenshot({ path: join(out, 'default-warm-on.png') });
    const corners = (await diag(page)).poses.find(pose => pose.id === 'joy').corners;
    const warmth = await page.evaluate(async ({ unlit, lit, corners }) => {
      async function decode(source) { const image = new Image(); image.src = `data:image/png;base64,${source}`; await image.decode(); const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0); return { data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width }; }
      const a = await decode(unlit), b = await decode(lit), [bl, tl, , tr] = corners;
      let samples = 0, highlights = 0, warmthSum = 0, luminanceGain = 0, allWarmth = 0;
      for (let v = .12; v < .9; v += .0125) for (let u = .12; u < .9; u += .0125) {
        const x = Math.round(tl[0] + (tr[0] - tl[0]) * u + (bl[0] - tl[0]) * v), y = Math.round(tl[1] + (tr[1] - tl[1]) * u + (bl[1] - tl[1]) * v), offset = (y * a.width + x) * 4;
        const rgb = [0, 1, 2].map(channel => b.data[offset + channel] - a.data[offset + channel]), gain = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
        samples++; allWarmth += rgb[0] - rgb[2];
        if (gain > 1) { highlights++; warmthSum += rgb[0] - rgb[2]; luminanceGain += gain; }
      }
      return { samples, highlightSamples: highlights, highlightFraction: highlights / samples, highlightMeanRedMinusBlueGain: warmthSum / highlights, highlightMeanLuminanceGain: luminanceGain / highlights, overallMeanRedMinusBlueGain: allWarmth / samples };
    }, { unlit: unlit.toString('base64'), lit: lit.toString('base64'), corners });
    assert.ok(warmth.highlightSamples > 50 && warmth.highlightFraction > .03, JSON.stringify(warmth));
    assert.ok(warmth.highlightMeanRedMinusBlueGain > .5, `The default highlights should warm the paper: ${JSON.stringify(warmth)}`);
    return { ...warmth, note: 'Same geometry and original print; red-versus-blue gain verifies warm illumination, not pixel identity to the reference.' };
  });
  await check('the audited original main light and orange lamp reach the GPU in linear color', async () => {
    const measured = {};
    for (const [name, hex] of [['uMainColor', '#fff4e6'], ['uLampColor', '#ffe0b0']]) {
      const expected = [1, 3, 5].map(offset => { const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; });
      const values = await uniformValue(page, name);
      assert.ok(values.some(value => Array.isArray(value) && value.every((channel, index) => Math.abs(channel - expected[index]) < 1e-5)), `${name}: ${JSON.stringify(values)}`);
      measured[name] = { hex, expectedLinearRGB: expected, actual: values };
    }
    for (const [name, value] of [['uMainIntensity', 1.6], ['uLampIntensity', .65], ['uLampHeight', .45]]) measured[name] = await uniformValue(page, name, value);
    return measured;
  });
  await check('paper size, impression and shine controls alter pixels and active GPU uniforms', async () => {
    await setMany(page, { tiltEnabled: false, hoverScale: 1, hoverLift: 0, lightAnimation: false, surfaceRelief: .8, surfaceShine: .8 }); await pointer(page); await page.waitForTimeout(800);
    const measurements = [];
    for (const [key, low, high, uniform] of [['textureScale', .4, 3, 'uTextureScale'], ['surfaceRelief', 0, 1, 'uSurfaceRelief'], ['surfaceShine', 0, 1, 'uSurfaceShine']]) {
      await set(page, key, low); await pointer(page); const a = await page.screenshot(), poseBefore = (await diag(page)).poses.find(pose => pose.id === 'joy');
      await set(page, key, high); await pointer(page); const b = await page.screenshot(), pixels = await delta(page, a, b), uniforms = await uniformValue(page, uniform, high);
      const poseAfter = (await diag(page)).poses.find(pose => pose.id === 'joy');
      for (const attribute of ['center', 'rotation', 'corners']) assert.deepEqual(poseAfter[attribute], poseBefore[attribute], `${key} must not move or extrude geometry`);
      assert.ok(pixels.meanRGBDelta > .015 && pixels.changedFraction > .01, `${key}: ${JSON.stringify(pixels)}`);
      measurements.push({ key, from: low, to: high, pixels, uniforms });
    }
    await setMany(page, { surfaceRelief: DEFAULT_PARAMETERS.surfaceRelief, surfaceShine: DEFAULT_PARAMETERS.surfaceShine, textureScale: DEFAULT_PARAMETERS.textureScale });
    return measurements;
  });
  await check('light pattern enlargement controls actual pixels and inverse optical density', async () => {
    await setMany(page, { lightAnimation: false, tiltEnabled: false, lightEnabled: true });
    await set(page, 'lightScale', .5); await pointer(page); const a = await page.screenshot(), densityA = (await uniformValue(page, 'uDensity')).at(-1), sizeNormA = (await diag(page)).background.sizeNorm;
    await set(page, 'lightScale', 2); await pointer(page); const b = await page.screenshot(), densityB = (await uniformValue(page, 'uDensity')).at(-1), sizeNormB = (await diag(page)).background.sizeNorm, pixels = await delta(page, a, b);
    assert.ok(Math.abs(densityA - 26.7 / (.5 * sizeNormA)) < 1e-4, `Source density .5x: ${densityA}, sizeNorm=${sizeNormA}`);
    assert.ok(Math.abs(densityB - 26.7 / (2 * sizeNormB)) < 1e-4, `Source density 2x: ${densityB}, sizeNorm=${sizeNormB}`);
    assert.ok(Math.abs(densityA / densityB - 4) < 1e-4, `The original scale enlarges cells: ${densityA} / ${densityB}`);
    assert.ok(pixels.meanRGBDelta > .1 && pixels.changedFraction > .05, JSON.stringify(pixels));
    await set(page, 'lightScale', DEFAULT_PARAMETERS.lightScale);
    return { fromScale: .5, toScale: 2, densityA, densityB, sizeNormA, sizeNormB, pixels, sourceRule: '26.7 / (scale * sizeNorm); a larger scale enlarges the optical pattern without changing print UVs.' };
  });
  await check('warm light, dark tint, depth, intensity and defocus controls change rendered illumination', async () => {
    const measurements = [];
    for (const [key, low, high, uniform] of [['lightColor', '#ffe4aa', '#b7d1ef', 'uLightColor'], ['shadowColor', '#4f5a43', '#975040', 'uShadowColor'], ['shadowStrength', 0, .8, 'uShadowStrength'], ['lightIntensity', 0, 1.4, 'uLightStrength'], ['lightSoftness', 0, 3, 'uSoftness']]) {
      await setMany(page, { lightAnimation: false, tiltEnabled: false, lightEnabled: true, shadowStrength: .65, lightIntensity: 1 });
      await set(page, key, low); await pointer(page); const a = await page.screenshot();
      await set(page, key, high); await pointer(page); const b = await page.screenshot(), pixels = await delta(page, a, b), uniforms = await uniformValue(page, uniform, high);
      assert.ok(pixels.meanRGBDelta > .03 && pixels.changedFraction > .01, `${key}: ${JSON.stringify(pixels)}`); measurements.push({ key, from: low, to: high, pixels, uniforms });
      await set(page, key, DEFAULT_PARAMETERS[key]);
    }
    return measurements;
  });
  await check('surrounding shadow color, depth and softness change actual shadow pixels', async () => {
    await page.evaluate(() => __postalGallery.close()); await page.waitForFunction(() => __postalGallery.getDiagnostics().selected === null);
    await setMany(page, { tiltEnabled: false, lightAnimation: false, pinLight: true, contactShadowOpacity: .9 }); await page.mouse.move(1200, 100); await page.waitForTimeout(1000);
    const measurements = [];
    for (const [key, low, high, uniform] of [['contactShadowColor', '#3a4a37', '#874f45', 'uColor'], ['contactShadowOpacity', 0, .9, 'uOpacity'], ['contactShadowSoftness', 0, 3, 'uSoftness']]) {
      await set(page, key, low); await page.mouse.move(1200, 100); await page.waitForTimeout(500); const a = await page.screenshot();
      await set(page, key, high); await page.mouse.move(1200, 100); await page.waitForTimeout(500); const b = await page.screenshot(), pixels = await delta(page, a, b, 'joy', 'outside'), uniforms = await uniformValue(page, uniform, typeof high === 'string' ? high : undefined);
      assert.ok(pixels.meanRGBDelta > .01 && pixels.maximum > 1, `${key}: ${JSON.stringify(pixels)}`); measurements.push({ key, from: low, to: high, pixels, uniforms });
      await set(page, key, DEFAULT_PARAMETERS[key]);
    }
    await page.screenshot({ path: join(out, 'single-shadow-gallery.png') }); return measurements;
  });
  await check('pointer changes the optical texture independently of time; disabled tracking is stable', async () => {
    await configure(page, { ...DEFAULT_PARAMETERS, tiltEnabled: false, hoverScale: 1, hoverLift: 0, lightAnimation: false }); await focus(page); await closePanel(page);
    await pointer(page, .2, .2); const a = await page.screenshot(), da = await diag(page), opticalA = await page.evaluate(() => __singleOpticalHash());
    await pointer(page, .8, .8); const b = await page.screenshot(), db = await diag(page), opticalB = await page.evaluate(() => __singleOpticalHash());
    assert.equal(da.background.time, db.background.time); assert.notEqual(opticalA, opticalB); const pixels = await delta(page, a, b); assert.ok(pixels.meanRGBDelta > .1, JSON.stringify(pixels));
    await configure(page, { lightFollowPointer: false }); await pointer(page, .2, .2); const rest = await atRest(page), c = await page.screenshot(); await pointer(page, .8, .8); await atRest(page); const d = await page.screenshot(); assert.equal(hash(c), hash(d));
    await configure(page, { lightFollowPointer: true, pointerInfluence: 0 }); await pointer(page, .2, .8); await atRest(page); const e = await page.screenshot(); await pointer(page, .8, .2); await atRest(page); const f = await page.screenshot(); assert.equal(hash(e), hash(f));
    return { pixels, opticalA, opticalB, frozenTime: da.background.time, disabledTrackingStatic: true, zeroInfluenceStatic: true, rest };
  });
  await check('live and initial reduced-motion preferences stop flow, pointer motion and RAF', async () => {
    await configure(page, { ...DEFAULT_PARAMETERS }); await pointer(page); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(1000);
    const a = await page.screenshot(); await pointer(page, .25, .75); const b = await page.screenshot(); assert.equal(hash(a), hash(b)); const live = await atRest(page);
    const reduced = await createPage({ reducedMotion: 'reduce' }); await focus(reduced); await closePanel(reduced); await pointer(reduced, .8, .2); const c = await reduced.screenshot(); await pointer(reduced, .2, .8); const d = await reduced.screenshot(); assert.equal(hash(c), hash(d)); const initial = await atRest(reduced);
    await reduced.screenshot({ path: join(out, 'single-reduced-motion.png') }); await page.emulateMedia({ reducedMotion: 'no-preference' });
    return { live, initial, pixelsStatic: true };
  });
  await check('old saved modes upgrade to the enabled light; new edits, off state, export and import persist', async () => {
    const oldValues = { ...DEFAULT_PARAMETERS, hoverTilt: 12, lightEnabled: false, lightIntensity: .8, lightColor: '#ffebd0', shadowColor: '#989384' };
    const legacy = await createPage({}, { [STORAGE_KEY]: JSON.stringify({ version: 2, appearanceRevision: 3, parameters: oldValues }) });
    const upgraded = (await diag(legacy)).parameters; assert.equal(upgraded.hoverTilt, 12); assert.equal(upgraded.lightEnabled, true); assert.equal(upgraded.lightIntensity, DEFAULT_PARAMETERS.lightIntensity); assert.equal(upgraded.shadowColor, DEFAULT_PARAMETERS.shadowColor); assert.equal(Object.hasOwn(upgraded, 'lightModel'), false);
    const v1 = await createPage({}, { [LEGACY_STORAGE_KEY]: JSON.stringify({ version: 1, parameters: { hoverTilt: 9, lightModel: 'dappled', lightEnabled: false } }) });
    assert.equal((await diag(v1)).parameters.hoverTilt, 9); assert.equal((await diag(v1)).parameters.lightEnabled, true);
    await set(legacy, 'lightEnabled', false); await set(legacy, 'textureScale', 1.8); await set(legacy, 'contactShadowColor', '#74806b');
    const downloadEvent = legacy.waitForEvent('download'); await legacy.getByRole('button', { name: '导出', exact: true }).click(); const download = await downloadEvent, path = join(out, 'single-light-parameters.json'); await download.saveAs(path);
    const exported = JSON.parse(await readFile(path, 'utf8')); assert.equal(exported.appearanceRevision, 4); assert.equal(exported.parameters.lightEnabled, false); assert.equal(exported.parameters.textureScale, 1.8); assert.equal(exported.parameters.contactShadowColor, '#74806b');
    await legacy.reload({ waitUntil: 'networkidle' }); await legacy.waitForFunction(() => !!window.__postalGallery); assert.deepEqual((await diag(legacy)).parameters, exported.parameters);
    await openPanel(legacy); const imported = { ...exported.parameters, lightEnabled: true, textureScale: 2.3, contactShadowSoftness: 2.2 };
    await legacy.locator('input[type=file]').setInputFiles({ name: 'single-import.json', mimeType: 'application/json', buffer: Buffer.from(serializeParameters(imported)) });
    await legacy.waitForFunction(expected => JSON.stringify(__postalGallery.getDiagnostics().parameters) === JSON.stringify(expected), imported);
    const stored = await legacy.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY); assert.deepEqual(stored.parameters, imported);
    return { oldRevisionUpgraded: true, oldGalleryValuePreserved: 12, v1Upgrade: true, newOffStateSurvivedReload: true, exportedAppearanceRevision: exported.appearanceRevision, importedTextureScale: imported.textureScale };
  });
  await check('mobile touch moves stamp-local illumination and keeps controls usable', async () => {
    const mobile = await createPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await mobile.locator('[data-stamp="joy"]').tap(); await mobile.waitForFunction(() => __postalGallery.getDiagnostics().phase === 'focused');
    await configure(mobile, { tiltEnabled: false, lightAnimation: false }); const box = await mobile.locator('[data-stamp="joy"]').boundingBox(), cdp = await mobile.context().newCDPSession(mobile);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * .3, y: box.y + box.height * .7 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * .31, y: box.y + box.height * .69 }] }); await mobile.waitForTimeout(600); const a = await mobile.screenshot(), d = await diag(mobile), opticalA = await mobile.evaluate(() => __singleOpticalHash());
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * .7, y: box.y + box.height * .3 }] }); await mobile.waitForTimeout(700); const b = await mobile.screenshot(), e = await diag(mobile), opticalB = await mobile.evaluate(() => __singleOpticalHash());
    const pixels = await delta(mobile, a, b); assert.ok(pixels.meanRGBDelta > .1, JSON.stringify(pixels)); assert.notEqual(opticalA, opticalB); assert.equal(d.background.time, e.background.time);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await set(mobile, 'textureScale', 1.4); assert.equal((await diag(mobile)).selected, 'joy'); await closePanel(mobile); await mobile.screenshot({ path: join(out, 'single-mobile-focus.png') });
    return { opticalA, opticalB, pixels, actualTouchUV: e.lightStates.find(light => light.id === 'joy').uv, panelEditKeptFocus: true };
  });
  await check('eight-stamp cycles and lighting edits reuse GPU assets; dispose releases owned textures', async () => {
    await reset(page); await closePanel(page); const ids = STAMPS.map(stamp => stamp.id);
    for (const id of ids) { await focus(page, id); await pointer(page, .6, .35, id); }
    const a = await diag(page), created = await page.evaluate(() => __singleLightQA.createdTextures);
    for (const [index, id] of ids.entries()) { await focus(page, id); await configure(page, { textureScale: .8 + index * .2, contactShadowSoftness: index * .4, lightIntensity: .5 + index * .1 }); await pointer(page, .6, .35, id); }
    const b = await diag(page); assert.deepEqual(a.materials, b.materials); assert.deepEqual(a.textures, b.textures); assert.equal(a.background.texture, b.background.texture); assert.deepEqual(a.renderer, b.renderer); assert.equal(await page.evaluate(() => __singleLightQA.createdTextures), created);
    await focus(page, 'joy'); await configure(page, DEFAULT_PARAMETERS); await closePanel(page); await pointer(page); await page.screenshot({ path: join(out, 'single-final-focus.png') });
    const disposed = await page.evaluate(() => { const api = __postalGallery, before = api.getDiagnostics(); api.dispose(); api.dispose(); return { before, after: api.getDiagnostics(), deletedTextures: __singleLightQA.deletedTextures, canvasCount: document.querySelectorAll('canvas').length }; });
    assert.equal(disposed.after.renderer.textures, 0); assert.equal(disposed.canvasCount, 0); assert.ok(disposed.deletedTextures >= disposed.before.renderer.textures);
    return { cycles: ids.length, before: a.renderer, after: b.renderer, stableTextureAllocations: created, disposedTextureCount: disposed.after.renderer.textures, deletedTextures: disposed.deletedTextures };
  });
  await check('current source stayed unchanged throughout verification and browser remained clean', async () => {
    report.finalSourceSnapshot = await fingerprint(); assert.deepEqual(report.finalSourceSnapshot, report.sourceSnapshot, 'Source changed during the run'); assert.deepEqual(report.errors, []); assert.deepEqual(report.warnings, []);
    return { errors: 0, warnings: 0, sourceStable: true };
  });
} finally {
  report.finishedAt = new Date().toISOString(); report.result = report.checks.every(check => check.result === 'passed') ? 'passed' : 'failed';
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2)); await Promise.all(contexts.map(context => context.close())); await browser.close();
}
console.log(JSON.stringify({ result: report.result, checks: report.checks.length, failed: report.checks.filter(check => check.result === 'failed').map(check => check.name), out }, null, 2));
if (report.result !== 'passed') process.exitCode = 1;
