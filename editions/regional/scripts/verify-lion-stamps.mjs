import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

// Uses an existing development server; never replaces a user-owned process.
const baseURL = process.env.VERIFY_URL || 'http://127.0.0.1:4173/';
const output = resolve('artifacts/lion-stamps/verification');
const ids = ['joy', 'anger', 'sorrow', 'delight', 'motion', 'stillness', 'surprise', 'doubt'];
const labels = ['喜', '怒', '哀', '乐', '动', '静', '惊', '疑'];
const sources = ['src/App.jsx', 'src/config.js', 'src/artwork.js', 'src/styles.css', 'src/rendering/StampGallery.js', 'src/rendering/StampMaterial.js', 'src/rendering/DappledLight.js', 'src/rendering/dappledShaders.js'];
const hash = data => createHash('sha256').update(data).digest('hex');
const sourceHashes = async () => Object.fromEntries(await Promise.all(sources.map(async path => [path, hash(await readFile(path))])));
await mkdir(output, { recursive: true });
const report = { baseURL, startedAt: new Date().toISOString(), browser: 'Installed Chrome, real WebGL and genuine touchscreen input', checks: [], screenshots: [], consoleErrors: [], pageErrors: [], failedRequests: [], sourceHashesBefore: await sourceHashes() };
const audit = JSON.parse(await readFile('artifacts/lion-stamps/source-asset-audit.json', 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const contexts = [];
const timeout = 20000;

function instrument() {
  window.__lionClicks = [];
  window.__lionDraws = [];
  document.addEventListener('click', event => window.__lionClicks.push({ id: event.target.closest('[data-stamp]')?.dataset.stamp ?? null, pointerType: event.pointerType }), true);
  for (const type of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
    const prototype = window[type]?.prototype;
    if (!prototype) continue;
    const locations = new WeakMap(), values = new WeakMap();
    const getLocation = prototype.getUniformLocation;
    prototype.getUniformLocation = function (program, name) {
      const location = getLocation.call(this, program, name);
      if (location) locations.set(location, { program, name });
      return location;
    };
    const uniform = prototype.uniform1f;
    prototype.uniform1f = function (location, value) {
      const descriptor = locations.get(location);
      if (descriptor) {
        const state = values.get(descriptor.program) || {};
        state[descriptor.name] = value;
        values.set(descriptor.program, state);
      }
      return uniform.call(this, location, value);
    };
    for (const method of ['drawElements', 'drawArrays']) {
      const original = prototype[method];
      prototype[method] = function (...args) {
        const state = values.get(this.getParameter(this.CURRENT_PROGRAM));
        if (state && 'uActivity' in state && 'uBlur' in state) {
          window.__lionDraws.push({ activity: state.uActivity, blur: state.uBlur, opacity: state.uOpacity });
          if (window.__lionDraws.length > 64) window.__lionDraws.shift();
        }
        return original.apply(this, args);
      };
    }
  }
}

async function newPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...options });
  contexts.push(context);
  await context.addInitScript(instrument);
  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('requestfailed', request => report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__postalGallery), null, { timeout });
  await page.waitForFunction(() => [...document.querySelectorAll('[data-stamp]')].length === 8 && [...document.querySelectorAll('[data-stamp]')].every(button => Number.parseFloat(button.style.width) > 30), null, { timeout });
  return page;
}

const diagnostics = page => page.evaluate(() => window.__postalGallery.getDiagnostics());
async function waitSelected(page, id) {
  await page.waitForFunction(id => { const state = window.__postalGallery?.getDiagnostics(); return state?.selected === id && (id === null || state.phase === 'focused'); }, id, { timeout });
}
async function returnToGallery(page) {
  await page.evaluate(() => { window.__postalGallery.close(); document.activeElement?.blur(); });
  await page.mouse.move(6, 210);
  await waitSelected(page, null);
  await page.waitForTimeout(250);
}
async function exposedPoint(page, id, selector = '[data-stamp]') {
  return page.locator(selector).evaluateAll((buttons, { id, selector, ids }) => {
    const button = selector === '.fallback-stamp' ? buttons[ids.indexOf(id)] : buttons.find(node => node.dataset.stamp === id);
    if (!button) return null;
    const rect = button.getBoundingClientRect(), points = [];
    for (let y = 1; y < 19; y++) for (let x = 1; x < 19; x++) {
      const px = Math.max(2, rect.left) + (Math.min(innerWidth - 2, rect.right) - Math.max(2, rect.left)) * x / 20;
      const py = Math.max(2, rect.top) + (Math.min(innerHeight - 2, rect.bottom) - Math.max(2, rect.top)) * y / 20;
      if (document.elementFromPoint(px, py)?.closest(selector) !== button) continue;
      let clearance = 0;
      for (let radius = 2; radius <= 20; radius += 2) {
        if (![0, .25, .5, .75, 1, 1.25, 1.5, 1.75].every(a => document.elementFromPoint(px + Math.cos(a * Math.PI) * radius, py + Math.sin(a * Math.PI) * radius)?.closest(selector) === button)) break;
        clearance = radius;
      }
      points.push({ x: px, y: py, clearance });
    }
    points.sort((a, b) => b.clearance - a.clearance || Math.hypot(a.x - rect.left - rect.width / 2, a.y - rect.top - rect.height / 2) - Math.hypot(b.x - rect.left - rect.width / 2, b.y - rect.top - rect.height / 2));
    return points[0] || null;
  }, { id, selector, ids });
}
async function clickStamp(page, id, touch = false) {
  const point = await exposedPoint(page, id);
  assert.ok(point, `${id} has no exposed pointer target`);
  assert.ok(point.clearance >= 6, `${id} exposed target is too small: ${JSON.stringify(point)}`);
  if (touch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
  assert.equal((await page.evaluate(() => window.__lionClicks.at(-1)))?.id, id);
  await waitSelected(page, id);
  return point;
}
async function capture(page, file, note = '') {
  await page.screenshot({ path: join(output, file) });
  report.screenshots.push({ file, note });
}
async function check(name, operation) {
  if (process.env.VERIFY_ONLY && !name.includes(process.env.VERIFY_ONLY)) return;
  const started = Date.now();
  try {
    const details = await operation();
    report.checks.push({ name, result: 'passed', elapsedMs: Date.now() - started, details });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, result: 'failed', elapsedMs: Date.now() - started, error: error.stack });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

try {
  const desktop = await newPage();
  await check('eight source images match the supplied lion project and decode locally', async () => {
    const stamps = await desktop.evaluate(async () => (await import('/src/config.js')).STAMPS);
    assert.deepEqual(stamps.map(stamp => stamp.id), ids);
    const assets = [];
    for (const [index, stamp] of stamps.entries()) {
      assert.equal(stamp.name, `醒狮八态 · ${labels[index]}`);
      assert.equal(stamp.number, String(index + 1).padStart(2, '0'));
      assert.equal(stamp.image, `/assets/lion-states/lion-${stamp.id}.png`);
      const response = await desktop.request.get(new URL(stamp.image, baseURL).href);
      assert.equal(response.status(), 200);
      const digest = hash(await response.body());
      assert.equal(digest, audit.assets.find(asset => asset.key === stamp.id).sha256);
      const decoded = await desktop.evaluate(async url => { const image = new Image(); image.src = url; await image.decode(); return { width: image.naturalWidth, height: image.naturalHeight }; }, stamp.image);
      assert.deepEqual(decoded, { width: 1254, height: 1254 });
      assets.push({ id: stamp.id, image: stamp.image, sha256: digest, ...decoded });
    }
    assert.equal(new Set(assets.map(asset => asset.sha256)).size, 8);
    assert.equal(await desktop.locator('.stamp-hit').count(), 8);
    assert.equal(await desktop.locator('canvas').count(), 1);
    await capture(desktop, 'desktop-gallery.png');
    return assets;
  });

  await check('eight print canvases draw the correct face with transparent perforations', async () => {
    const prints = await desktop.evaluate(async ids => {
      const { createStampArtwork, prepareStampArtwork } = await import('/src/artwork.js');
      await prepareStampArtwork();
      const original = CanvasRenderingContext2D.prototype.drawImage;
      const draws = [];
      CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) { if (image instanceof HTMLImageElement) draws.push(image.currentSrc || image.src); return original.call(this, image, ...args); };
      try {
        const results = [];
        for (const id of ids) {
          draws.length = 0;
          const canvas = createStampArtwork(id, 720, 900), context = canvas.getContext('2d');
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          const bytes = await crypto.subtle.digest('SHA-256', pixels);
          const sha256 = Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
          const alphaAt = (x, y) => pixels[(Math.round(y) * canvas.width + Math.round(x)) * 4 + 3];
          results.push({ id, sha256, draws: [...draws], size: [canvas.width, canvas.height], topCutAlpha: alphaAt(60, 0), leftCutAlpha: alphaAt(0, 56), centerAlpha: alphaAt(360, 450), data: canvas.toDataURL('image/png').split(',')[1] });
        }
        return results;
      } finally { CanvasRenderingContext2D.prototype.drawImage = original; }
    }, ids);
    assert.equal(new Set(prints.map(print => print.sha256)).size, 8);
    for (const print of prints) {
      assert.deepEqual(print.size, [720, 900]);
      assert.equal(print.topCutAlpha, 0, `${print.id} top perforation`);
      assert.equal(print.leftCutAlpha, 0, `${print.id} left perforation`);
      assert.equal(print.centerAlpha, 255);
      assert.deepEqual(print.draws.map(url => new URL(url).pathname), [`/assets/lion-states/lion-${print.id}.png`]);
      await writeFile(join(output, `print-${print.id}.png`), Buffer.from(print.data, 'base64'));
      delete print.data;
    }
    return prints;
  });

  await check('desktop mouse reaches all eight hover lights, focused stamps and Escape returns', async () => {
    const results = [];
    for (const [index, id] of ids.entries()) {
      await returnToGallery(desktop);
      const point = await exposedPoint(desktop, id);
      assert.ok(point, `${id} is exposed`);
      await desktop.mouse.move(point.x, point.y);
      await desktop.waitForFunction(id => window.__postalGallery.getDiagnostics().hovered === id, id, { timeout });
      await desktop.waitForTimeout(1000);
      assert.equal(await desktop.locator('.hover-label').textContent(), `醒狮八态 · ${labels[index]}`);
      const hover = await diagnostics(desktop);
      assert.ok(hover.lightStates.find(state => state.id === id).amount > .99);
      assert.ok(hover.lightStates.filter(state => state.id !== id).every(state => state.amount < .01));
      const draws = await desktop.evaluate(() => window.__lionDraws.slice(-8));
      assert.equal(draws.length, 8);
      assert.equal(draws.filter(draw => draw.activity > .99 && draw.blur < .02).length, 1);
      assert.equal(draws.filter(draw => draw.activity < .01 && draw.blur > 10).length, 7);
      if (index === 0) await capture(desktop, 'desktop-hover-joy.png');
      await clickStamp(desktop, id);
      assert.equal(await desktop.locator(`[data-stamp="${id}"]`).getAttribute('aria-pressed'), 'true');
      assert.equal(await desktop.locator('.exhibition').getAttribute('role'), 'dialog');
      await capture(desktop, `focus-${id}.png`);
      await desktop.keyboard.press('Escape');
      await waitSelected(desktop, null);
      results.push({ id, point, activeLightCount: 1, defocusedOtherStamps: 7 });
    }
    return results;
  });

  await check('keyboard reaches eight named stamps and preserves focus trapping and Escape', async () => {
    await desktop.reload({ waitUntil: 'networkidle' });
    await desktop.waitForFunction(() => Boolean(window.__postalGallery), null, { timeout });
    const reached = [];
    for (let i = 0; i < 15 && reached.length < 8; i++) {
      await desktop.keyboard.press('Tab');
      const control = await desktop.evaluate(() => ({ id: document.activeElement.dataset.stamp, label: document.activeElement.getAttribute('aria-label') }));
      if (control.id) reached.push(control);
    }
    assert.deepEqual(reached.map(control => control.id), ids);
    assert.ok(reached.every(control => control.label?.includes('8')));
    await desktop.keyboard.press('Enter');
    await waitSelected(desktop, 'doubt');
    await desktop.keyboard.press('Tab');
    assert.equal(await desktop.evaluate(() => document.activeElement.className), 'close-focus');
    await desktop.keyboard.press('Shift+Tab');
    assert.equal(await desktop.evaluate(() => document.activeElement.dataset.stamp), 'doubt');
    await desktop.keyboard.press('Escape');
    await waitSelected(desktop, null);
    await desktop.waitForFunction(() => document.activeElement.dataset.stamp === 'doubt');
    return { reached, trappedFocus: true, restoredTrigger: 'doubt' };
  });

  await check('existing parameter preview and light controls operate on the new collection', async () => {
    await returnToGallery(desktop);
    const launcher = desktop.locator('.parameter-launcher');
    if (await launcher.getAttribute('aria-expanded') === 'false') await launcher.click();
    await desktop.getByRole('button', { name: /聚焦主邮票/ }).click();
    await waitSelected(desktop, 'joy');
    const before = await diagnostics(desktop);
    assert.equal(before.parameters.lightEnabled, true);
    const light = desktop.locator('[data-parameter="lightEnabled"]');
    await light.uncheck();
    await desktop.waitForFunction(() => window.__postalGallery.getDiagnostics().parameters.lightEnabled === false);
    await desktop.waitForTimeout(1000);
    assert.ok((await diagnostics(desktop)).lightStates.every(state => state.amount < .01));
    await light.check();
    await desktop.waitForFunction(() => window.__postalGallery.getDiagnostics().parameters.lightEnabled === true);
    await desktop.getByRole('button', { name: /返回画廊/ }).click();
    await waitSelected(desktop, null);
    await launcher.click();
    return { previewId: 'joy', lightEnabledApplied: true, originalParametersRetained: true };
  });

  await check('repeated selection of eight stamps preserves GPU allocations', async () => {
    await returnToGallery(desktop);
    const before = await diagnostics(desktop);
    for (const id of ids) { await clickStamp(desktop, id); await desktop.keyboard.press('Escape'); await waitSelected(desktop, null); }
    await returnToGallery(desktop);
    const after = await diagnostics(desktop);
    assert.deepEqual(after.materials, before.materials);
    assert.deepEqual(after.textures, before.textures);
    assert.deepEqual(after.renderer, before.renderer);
    assert.equal(after.renderer.textures, 26);
    return { cycles: 8, renderer: after.renderer, textureUUIDsStable: true, materialUUIDsStable: true };
  });

  const mobile = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await check('genuine touch reaches all eight stamps and the small viewport keeps all targets exposed', async () => {
    await capture(mobile, 'mobile-gallery.png');
    const touched = [];
    for (const id of ids) {
      await returnToGallery(mobile);
      const point = await clickStamp(mobile, id, true);
      assert.equal((await mobile.evaluate(() => window.__lionClicks.at(-1))).pointerType, 'touch');
      if (id === 'joy') await capture(mobile, 'mobile-focus-joy.png');
      await mobile.locator('.close-focus').tap();
      await waitSelected(mobile, null);
      touched.push({ id, point, pointerType: 'touch' });
    }
    const small = await newPage({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
    const targets = [];
    for (const id of ids) { const point = await exposedPoint(small, id); assert.ok(point && point.clearance >= 6, `${id} needs an exposed target at 320×568`); targets.push({ id, point }); }
    const viewport = await small.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth }));
    assert.deepEqual(viewport, { width: 320, documentWidth: 320, bodyWidth: 320 });
    await capture(small, 'small-mobile-gallery.png');
    return { touched, smallViewport: { targets, viewport } };
  });

  await check('reduced motion and disposal preserve the existing mechanisms', async () => {
    const page = await newPage({ reducedMotion: 'reduce' });
    await page.waitForTimeout(500);
    assert.equal((await diagnostics(page)).reducedMotion, true);
    await clickStamp(page, 'surprise');
    await capture(page, 'reduced-motion-focus-surprise.png');
    const pose = (await diagnostics(page)).poses.find(pose => pose.id === 'surprise');
    assert.equal(pose.rotation[0], 0); assert.equal(pose.rotation[1], 0);
    const cleanup = await page.evaluate(() => { const api = window.__postalGallery; api.dispose(); api.dispose(); return { memory: api.getDiagnostics().renderer, canvasCount: document.querySelectorAll('canvas').length, diagnosticRemoved: !window.__postalGallery }; });
    assert.equal(cleanup.memory.textures, 0);
    assert.equal(cleanup.memory.geometries, 0);
    assert.equal(cleanup.canvasCount, 0);
    assert.equal(cleanup.diagnosticRemoved, true);
    return { reducedMotion: true, cleanup };
  });

  await check('WebGL disabled still shows eight correct paper stamps with touch focus', async () => {
    const disabled = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-webgl'] });
    const expectedConsoleErrors = [], pageErrors = [];
    try {
      const page = await disabled.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      page.on('console', message => { if (message.type() === 'error') expectedConsoleErrors.push(message.text()); });
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.goto(baseURL, { waitUntil: 'networkidle' });
      await page.locator('.fallback-gallery').waitFor({ state: 'visible', timeout });
      await page.waitForFunction(() => [...document.querySelectorAll('.fallback-stamp img')].length === 8 && [...document.querySelectorAll('.fallback-stamp img')].every(image => image.complete && image.naturalWidth > 0), null, { timeout });
      assert.equal(await page.locator('canvas').count(), 0);
      for (const id of ids) {
        const point = await exposedPoint(page, id, '.fallback-stamp');
        assert.ok(point, `${id} fallback has no exposed target`);
        await page.touchscreen.tap(point.x, point.y);
        await page.waitForFunction(index => document.querySelectorAll('.fallback-stamp')[index]?.classList.contains('is-active'), ids.indexOf(id));
        if (id === 'anger') await capture(page, 'fallback-focus-anger.png');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('.fallback-gallery').classList.contains('is-focused'));
        await page.waitForTimeout(450);
      }
      await capture(page, 'fallback-gallery.png');
      assert.deepEqual(pageErrors, []);
      assert.ok(expectedConsoleErrors.every(message => /WebGL|context/i.test(message)), JSON.stringify(expectedConsoleErrors));
      return { count: 8, allTouchFocusAndEscape: true, expectedConsoleErrors, pageErrors };
    } finally { await disabled.close(); }
  });

  await check('unchanged sources and browser error audit', async () => {
    report.sourceHashesAfter = await sourceHashes();
    assert.deepEqual(report.sourceHashesAfter, report.sourceHashesBefore);
    assert.deepEqual(report.consoleErrors, []);
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.failedRequests, []);
    return { changedDuringRun: false, consoleErrors: 0, pageErrors: 0, failedRequests: 0 };
  });
} finally {
  report.finishedAt = new Date().toISOString();
  report.result = report.checks.length > 0 && report.checks.every(check => check.result === 'passed') ? 'passed' : 'failed';
  const reportFile = process.env.VERIFY_ONLY ? `report-${process.env.VERIFY_ONLY.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json` : 'report.json';
  await writeFile(join(output, reportFile), JSON.stringify(report, null, 2));
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
}
if (report.result !== 'passed') process.exitCode = 1;
console.log(JSON.stringify({ result: report.result, checks: report.checks.length, failed: report.checks.filter(check => check.result === 'failed').map(check => check.name), output }, null, 2));
