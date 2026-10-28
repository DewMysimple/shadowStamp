import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { DEFAULT_PARAMETERS, PARAMETER_FIELDS, PARAMETER_GROUPS, STORAGE_KEY, serializeParameters } from '../src/parameters.js';
import { LIGHT_PRESETS, LIGHT_PRESET_KEYS } from '../src/lightPresets.js';

const base = process.env.VERIFY_URL || 'http://127.0.0.1:4173/';
const output = resolve(process.env.VERIFY_OUTPUT || 'artifacts/light-presets');
await mkdir(output, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { base, startedAt: new Date().toISOString(), scope: 'Six stamp-light algorithms: real controls, GPU branch, controlled portrait/landscape pixels, local scope, persistence and lifecycle.', checks: [], errors: [], warnings: [], screenshots: [] };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-unsafe-swiftshader'] });
const contexts = [];
let page;

async function check(name, task) {
  const began = Date.now();
  try { const details = await task(); report.checks.push({ name, result: 'passed', elapsedMs: Date.now() - began, details }); console.log(`PASS ${name}`); }
  catch (error) {
    report.checks.push({ name, result: 'failed', elapsedMs: Date.now() - began, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`);
    if (page && !page.isClosed()) await page.screenshot({ path: join(output, `failure-${report.checks.length}.png`) }).catch(() => {});
  }
}
async function pageAt(options = {}, seed) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...options }); contexts.push(context);
  await context.addInitScript(({ seed, storageKey }) => {
    if (seed && !sessionStorage.getItem('__presetSeeded')) { localStorage.setItem(storageKey, seed); sessionStorage.setItem('__presetSeeded', '1'); }
    const q = window.__presetQA = { programs: {}, createdTextures: 0, raf: 0 };
    const originalContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attributes) { return originalContext.call(this, type, /^webgl2?$/.test(type) ? { ...(attributes || {}), preserveDrawingBuffer: true } : attributes); };
    const raf = requestAnimationFrame.bind(window); window.requestAnimationFrame = callback => raf(time => { q.raf++; callback(time); });
    const programs = new WeakMap(), locations = new WeakMap(); let nextProgram = 0;
    for (const P of [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype].filter(Boolean)) {
      const createProgram = P.createProgram; P.createProgram = function () { const program = createProgram.call(this); programs.set(program, ++nextProgram); q.programs[nextProgram] = {}; return program; };
      const getLocation = P.getUniformLocation; P.getUniformLocation = function (program, name) { const location = getLocation.call(this, program, name); if (location) locations.set(location, { id: programs.get(program), name }); return location; };
      for (const method of ['uniform1f', 'uniform1i', 'uniform2f', 'uniform3f', 'uniform2fv', 'uniform3fv']) {
        const original = P[method]; P[method] = function (location, ...values) { const info = locations.get(location); if (info) { const normalized = values.map(value => ArrayBuffer.isView(value) ? Array.from(value) : value); q.programs[info.id][info.name] = normalized.length === 1 ? normalized[0] : normalized; } return original.call(this, location, ...values); };
      }
      const createTexture = P.createTexture; P.createTexture = function () { const texture = createTexture.call(this); if (texture) q.createdTextures++; return texture; };
    }
  }, { seed, storageKey: STORAGE_KEY });
  const p = await context.newPage();
  p.on('pageerror', error => report.errors.push({ url: p.url(), message: error.message }));
  p.on('console', message => { if (message.type() === 'error') report.errors.push({ url: p.url(), message: message.text() }); if (message.type() === 'warning') report.warnings.push({ url: p.url(), message: message.text() }); });
  await p.goto(base, { waitUntil: 'networkidle' }); await p.waitForFunction(() => Boolean(window.__postalGallery)); return p;
}
const diagnostics = p => p.evaluate(() => __postalGallery.getDiagnostics());
async function panel(p, open = true) { if ((await p.locator('.parameter-launcher').getAttribute('aria-expanded') === 'true') !== open) await p.locator('.parameter-launcher').click(); }
async function set(p, key, value) {
  await panel(p); const field = PARAMETER_FIELDS.find(field => field.key === key); assert.ok(field, key);
  const group = p.locator('.parameter-group').nth(PARAMETER_GROUPS.findIndex(group => group.fields.some(field => field.key === key)));
  if (await group.getAttribute('open') === null) await group.locator('summary').click();
  const control = p.locator(`[data-parameter="${key}"]`);
  if (field.type === 'select') await control.selectOption(value);
  else if (field.type === 'number') await p.getByRole('spinbutton', { name: `${field.label}数值`, exact: true }).fill(String(value));
  else if (field.type === 'boolean') { if (await control.isChecked() !== value) await p.locator(`label[for="parameter-${key}"]`).click(); }
  else await control.evaluate((node, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); }, value);
  await p.waitForFunction(({ key, value }) => __postalGallery.getDiagnostics().parameters[key] === value, { key, value });
}
async function setMany(p, values) { for (const [key, value] of Object.entries(values)) await set(p, key, value); }
async function reset(p) { await panel(p); await p.getByRole('button', { name: '全部重置', exact: true }).click(); await p.waitForFunction(defaults => JSON.stringify(__postalGallery.getDiagnostics().parameters) === JSON.stringify(defaults), DEFAULT_PARAMETERS); }
async function focus(p, id) {
  if ((await diagnostics(p)).selected !== id) {
    if ((await diagnostics(p)).selected) { await p.evaluate(() => __postalGallery.close()); await p.waitForFunction(() => !__postalGallery.getDiagnostics().selected); }
    await p.evaluate(id => __postalGallery.focus(id), id);
  }
  await p.waitForFunction(id => { const d = __postalGallery.getDiagnostics(); return d.phase === 'focused' && d.selected === id; }, id); await p.waitForTimeout(250);
}
async function settle(p) { await p.mouse.move(1350, 50); await p.evaluate(() => document.activeElement?.blur()); await p.waitForTimeout(650); }
async function gpuBranch(p, index) { await p.waitForFunction(index => Object.values(__presetQA.programs).some(program => program.uLightAlgorithm === index), index); }
async function snap(p, name) { await p.screenshot({ path: join(output, name) }); report.screenshots.push(name); }
async function stampPixels(p, id) {
  return p.evaluate(id => {
    const d = __postalGallery.getDiagnostics(), corners = d.poses.find(pose => pose.id === id).corners;
    const left = Math.min(...corners.map(point => point[0])), top = Math.min(...corners.map(point => point[1]));
    const width = Math.max(...corners.map(point => point[0])) - left, height = Math.max(...corners.map(point => point[1])) - top;
    const canvas = document.querySelector('.exhibition-canvas'), gl = canvas.getContext('webgl2'), sx = gl.drawingBufferWidth / innerWidth, sy = gl.drawingBufferHeight / innerHeight;
    const x = Math.round((left + width * .1) * sx), y = Math.round((top + height * .1) * sy), w = Math.max(1, Math.round(width * .8 * sx)), h = Math.max(1, Math.round(height * .8 * sy));
    const prior = gl.getParameter(gl.FRAMEBUFFER_BINDING); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const pixels = new Uint8Array(w * h * 4); gl.readPixels(x, gl.drawingBufferHeight - y - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels); gl.bindFramebuffer(gl.FRAMEBUFFER, prior);
    const samples = [];
    for (let row = 0; row < 80; row++) for (let col = 0; col < 64; col++) {
      const offset = (Math.min(h - 1, Math.floor((row + .5) / 80 * h)) * w + Math.min(w - 1, Math.floor((col + .5) / 64 * w))) * 4;
      samples.push(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    }
    return { samples, width: w, height: h, time: d.background.time, aspect: d.background.aspect };
  }, id);
}
async function deskPixels(p) {
  return p.evaluate(() => {
    const gl = document.querySelector('.exhibition-canvas').getContext('webgl2'), prior = gl.getParameter(gl.FRAMEBUFFER_BINDING); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const pixels = new Uint8Array(32 * 32 * 4); gl.readPixels(4, 4, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, pixels); gl.bindFramebuffer(gl.FRAMEBUFFER, prior); return Array.from(pixels);
  });
}
function difference(a, b) { assert.equal(a.length, b.length); const deltas = a.map((value, index) => Math.abs(value - b[index])); return { meanRGBDelta: deltas.reduce((sum, value) => sum + value, 0) / deltas.length, maxRGBDelta: Math.max(...deltas), changedFraction: deltas.filter(value => value > 0).length / deltas.length }; }
async function paste(p, json) { await panel(p); await p.getByRole('button', { name: '粘贴', exact: true }).click(); await p.locator('#parameter-json').fill(json); await p.getByRole('button', { name: '应用 JSON', exact: true }).click(); }

try {
  page = await pageAt();
  await check('six named presets are selectable; current additive appearance remains the default', async () => {
    assert.deepEqual((await diagnostics(page)).parameters, DEFAULT_PARAMETERS); assert.equal(DEFAULT_PARAMETERS.lightAlgorithm, 'local-add');
    await panel(page); const options = await page.locator('#parameter-lightAlgorithm option').evaluateAll(nodes => nodes.map(node => ({ value: node.value, text: node.textContent })));
    assert.equal(options.length, 6); assert.equal(new Set(options.map(option => option.value)).size, 6);
    for (const preset of LIGHT_PRESETS) { assert.ok(options.some(option => option.value === preset.id && option.text.includes(preset.name))); await set(page, 'lightAlgorithm', preset.id); assert.match(await page.locator('.parameter-preset-note').innerText(), new RegExp(preset.description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); }
    await reset(page); await snap(page, '01-six-preset-panel.png'); return { options, default: DEFAULT_PARAMETERS.lightAlgorithm, canvasCount: await page.locator('canvas').count() };
  });
  await check('preset selection and restoration preserve gallery, pointer, animation and enabled preferences', async () => {
    await setMany(page, { hoverTilt: 9, focusHeight: .6, backgroundColor: '#f8f4ee', lightAnimation: false, lightFollowPointer: false, pinLight: true, lightEnabled: false });
    const before = (await diagnostics(page)).parameters;
    for (const preset of LIGHT_PRESETS) {
      await set(page, 'lightAlgorithm', preset.id); const values = (await diagnostics(page)).parameters;
      for (const key of Object.keys(before).filter(key => !LIGHT_PRESET_KEYS.includes(key))) assert.equal(values[key], before[key], `${preset.id} preserved ${key}`);
      assert.equal(await page.locator('[data-preset-state]').innerText(), '预设原值');
      await set(page, 'lightContrast', .77); assert.equal(await page.locator('[data-preset-state]').innerText(), '已微调');
      await page.getByRole('button', { name: '恢复此光影预设', exact: true }).click(); assert.equal(await page.locator('[data-preset-state]').innerText(), '预设原值');
      assert.equal((await diagnostics(page)).parameters.lightContrast, preset.values.lightContrast ?? DEFAULT_PARAMETERS.lightContrast);
      assert.equal((await diagnostics(page)).parameters.lightEnabled, false);
    }
    await reset(page); return { checkedPresets: 6, unaffectedKeys: Object.keys(before).filter(key => !LIGHT_PRESET_KEYS.includes(key)), editedAndRestored: true };
  });
  await check('six GPU branches produce distinct portrait and landscape light; disabled output and desk are identical', async () => {
    await setMany(page, { lightAnimation: false, lightFollowPointer: false, tiltEnabled: false, pinLight: true });
    const renders = [], common = { lightContrast: .4, shadowStrength: .7, surfaceRelief: .22, surfaceShine: .3 };
    let resources;
    for (const id of ['foshan', 'tianyang']) {
      await focus(page, id); const enabled = [], disabled = [], desk = [];
      for (const preset of LIGHT_PRESETS) {
        await set(page, 'lightAlgorithm', preset.id); await setMany(page, common); await set(page, 'lightEnabled', true); await settle(page); await gpuBranch(page, preset.index);
        const pixels = await stampPixels(page, id); enabled.push({ id: preset.id, ...pixels }); desk.push(await deskPixels(page));
        await snap(page, `${id}-${preset.id}.png`);
        await set(page, 'lightEnabled', false); await settle(page); disabled.push(await stampPixels(page, id));
        const current = await diagnostics(page);
        if (!resources) resources = { materials: current.materials, textures: current.textures, renderer: current.renderer, lightTexture: current.background.texture, createdTextures: await page.evaluate(() => __presetQA.createdTextures) };
        else { assert.deepEqual(current.materials, resources.materials); assert.deepEqual(current.textures, resources.textures); assert.deepEqual(current.renderer, resources.renderer); assert.equal(current.background.texture, resources.lightTexture); assert.equal(await page.evaluate(() => __presetQA.createdTextures), resources.createdTextures); }
      }
      for (const pixels of disabled) assert.deepEqual(pixels.samples, disabled[0].samples, `${id} unlit pixels`);
      for (const pixels of desk) assert.deepEqual(pixels, desk[0], `${id} static surrounding pixels`);
      const pairwise = [];
      for (let a = 0; a < enabled.length; a++) {
        assert.ok(difference(enabled[a].samples, disabled[a].samples).meanRGBDelta > .1, `${id}/${enabled[a].id} has visible illumination`);
        for (let b = a + 1; b < enabled.length; b++) { const delta = difference(enabled[a].samples, enabled[b].samples); assert.ok(delta.meanRGBDelta > .03, `${id}: ${enabled[a].id}/${enabled[b].id} must render differently`); pairwise.push({ a: enabled[a].id, b: enabled[b].id, ...delta }); }
      }
      assert.equal(new Set(enabled.map(pixels => pixels.time)).size, 1, 'Every algorithm used the same paused field time');
      renders.push({ stamp: id, common, time: enabled[0].time, size: [enabled[0].width, enabled[0].height], branches: enabled.map(pixels => ({ id: pixels.id, aspect: pixels.aspect, sha256: hash(Uint8Array.from(pixels.samples)) })), pairwise, unlitSHA256: hash(Uint8Array.from(disabled[0].samples)), deskSHA256: hash(Uint8Array.from(desk[0])) });
    }
    await reset(page); await page.evaluate(() => __postalGallery.close()); await page.waitForFunction(() => !__postalGallery.getDiagnostics().selected);
    return { renders, persistentAssets: resources, identicalDisabledOutput: true, identicalDeskPixels: true };
  });
  await check('each algorithm lights only the hovered stamp and animated light leaves the desk static', async () => {
    await reset(page); await setMany(page, { lightAnimation: false, tiltEnabled: false, lightFollowPointer: false });
    const states = [];
    for (const preset of LIGHT_PRESETS) {
      await set(page, 'lightAlgorithm', preset.id); await panel(page, false); await page.locator('[data-stamp="foshan"]').hover({ force: true }); await page.waitForTimeout(550);
      const d = await diagnostics(page); assert.equal(d.hovered, 'foshan'); assert.ok(d.lightStates.find(state => state.id === 'foshan').amount > .99); assert.ok(d.lightStates.filter(state => state.id !== 'foshan').every(state => state.amount === 0));
      const paper = await deskPixels(page); await page.waitForTimeout(150); assert.deepEqual(await deskPixels(page), paper); states.push({ id: preset.id, owner: d.background.owner, lit: d.lightStates.filter(state => state.amount > .001).map(state => state.id) });
    }
    await set(page, 'lightAnimation', true); await panel(page, false); await page.locator('[data-stamp="foshan"]').hover({ force: true }); await page.waitForTimeout(500);
    const before = await diagnostics(page), paper = await deskPixels(page); await page.waitForTimeout(400); const after = await diagnostics(page); assert.ok(after.background.time > before.background.time); assert.deepEqual(await deskPixels(page), paper);
    await reset(page); return { states, flowingTimeAdvanced: after.background.time - before.background.time, backgroundUnchanged: true };
  });
  await check('real export, textarea import and reload preserve the selected algorithm and fine tuning', async () => {
    await set(page, 'lightAlgorithm', 'soft-light'); await setMany(page, { lightContrast: .57, textureScale: 1.4, lightEnabled: false, focusTilt: 9.5 }); const expected = (await diagnostics(page)).parameters;
    const event = page.waitForEvent('download'); await page.getByRole('button', { name: '导出', exact: true }).click(); const download = await event, file = join(output, 'six-light-parameters.json'); await download.saveAs(file); const json = await readFile(file, 'utf8'); assert.deepEqual(JSON.parse(json).parameters, expected);
    await reset(page); await paste(page, json); await page.waitForFunction(expected => JSON.stringify(__postalGallery.getDiagnostics().parameters) === JSON.stringify(expected), expected);
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => Boolean(window.__postalGallery)); assert.deepEqual((await diagnostics(page)).parameters, expected); assert.equal(await page.locator('#parameter-lightAlgorithm').inputValue(), 'soft-light'); assert.equal(await page.locator('[data-preset-state]').innerText(), '已微调');
    await reset(page); return { file: 'six-light-parameters.json', algorithm: expected.lightAlgorithm, lightContrast: expected.lightContrast, exactReload: true, disabledPreserved: true };
  });
  await check('revision-four saves without an algorithm retain edits; invalid identifiers fall back safely', async () => {
    const old = { ...DEFAULT_PARAMETERS, hoverTilt: 11, lightContrast: .33, lightEnabled: false, textureScale: 1.65 }; delete old.lightAlgorithm;
    const legacy = await pageAt({}, JSON.stringify({ version: 2, appearanceRevision: 4, parameters: old })); const values = (await diagnostics(legacy)).parameters;
    assert.deepEqual(values, { ...old, lightAlgorithm: 'local-add' });
    await paste(legacy, serializeParameters({ ...values, lightAlgorithm: 'unknown-renderer', lightEnabled: true })); assert.equal((await diagnostics(legacy)).parameters.lightAlgorithm, 'local-add'); assert.equal((await diagnostics(legacy)).parameters.lightContrast, .33);
    // Feed an actually invalid external value, rather than normalizing it through the exporter.
    await paste(legacy, JSON.stringify({ version: 2, appearanceRevision: 4, parameters: { ...values, lightAlgorithm: { injected: true } } })); assert.equal((await diagnostics(legacy)).parameters.lightAlgorithm, 'local-add');
    await legacy.close(); return { legacyEditsPreserved: true, fallbackAlgorithm: 'local-add', invalidObjectRejected: true };
  });
  await check('mobile controls select all six and retain touch focus; reduced motion changes appearance without continuous frames', async () => {
    const mobile = await pageAt({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await panel(mobile);
    for (const preset of LIGHT_PRESETS) await set(mobile, 'lightAlgorithm', preset.id);
    await panel(mobile, false); await mobile.locator('[data-stamp="foshan"]').tap(); await mobile.waitForFunction(() => __postalGallery.getDiagnostics().phase === 'focused'); await panel(mobile);
    await set(mobile, 'lightAlgorithm', 'screen'); assert.equal((await diagnostics(mobile)).phase, 'focused'); assert.equal((await diagnostics(mobile)).parameters.lightAlgorithm, 'screen'); await snap(mobile, '02-mobile-preset-focus.png');
    const reduced = await pageAt({ reducedMotion: 'reduce' }); await set(reduced, 'pinLight', true); await focus(reduced, 'foshan'); const outputs = [];
    for (const id of ['legacy-multiply', 'local-add', 'screen']) { await set(reduced, 'lightAlgorithm', id); await settle(reduced); outputs.push(hash(Uint8Array.from((await stampPixels(reduced, 'foshan')).samples))); }
    assert.equal(new Set(outputs).size, 3); await panel(reduced, false); await settle(reduced); const a = await diagnostics(reduced), ra = await reduced.evaluate(() => __presetQA.raf), pixels = await stampPixels(reduced, 'foshan'); await reduced.waitForTimeout(350); const b = await diagnostics(reduced), rb = await reduced.evaluate(() => __presetQA.raf); assert.equal(ra, rb); assert.equal(a.background.time, b.background.time); assert.deepEqual((await stampPixels(reduced, 'foshan')).samples, pixels.samples); await snap(reduced, '03-reduced-motion-focus.png');
    return { mobileOptions: 6, focusRetained: true, reducedDistinctOutputs: outputs.length, reducedRAFStopped: true };
  });
  await check('no browser, shader or WebGL warnings and errors', async () => { assert.deepEqual(report.errors, []); assert.deepEqual(report.warnings, []); return { errors: 0, warnings: 0 }; });
} finally {
  report.finishedAt = new Date().toISOString(); report.result = report.checks.every(check => check.result === 'passed') ? 'passed' : 'failed'; await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2)); await Promise.all(contexts.map(context => context.close())); await browser.close();
}
console.log(JSON.stringify({ result: report.result, checks: report.checks.length, failed: report.checks.filter(check => check.result === 'failed').map(check => check.name), output }, null, 2));
if (report.result !== 'passed') process.exitCode = 1;
