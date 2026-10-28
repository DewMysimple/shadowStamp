import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const baseURL = process.env.VERIFY_URL || 'http://127.0.0.1:4175/';
const output = resolve('artifacts/region-stamps/verification');
const series = ['guangdong', 'china', 'world'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { baseURL, startedAt: new Date().toISOString(), checks: [], pageErrors: [], consoleErrors: [], failedRequests: [], screenshots: [] };
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const contexts = [];

async function pageAt(viewport, touch = false) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch });
  contexts.push(context);
  await context.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attributes) {
      if (/^webgl2?$/.test(type)) return getContext.call(this, type, { ...(attributes || {}), preserveDrawingBuffer: true });
      return getContext.call(this, type, attributes);
    };
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  page.on('requestfailed', request => report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__postalGallery));
  await page.waitForFunction(() => document.querySelectorAll('[data-stamp]').length === 12 && [...document.querySelectorAll('[data-stamp]')].every(button => parseFloat(button.style.width) > 20));
  return page;
}

async function check(name, task) {
  const began = Date.now();
  try {
    const details = await task();
    report.checks.push({ name, result: 'passed', elapsedMs: Date.now() - began, details });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, result: 'failed', elapsedMs: Date.now() - began, error: error.stack });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

async function snap(page, name) {
  const file = `${name}.png`;
  await page.screenshot({ path: join(output, file) });
  report.screenshots.push(file);
}

const diagnostics = page => page.evaluate(() => window.__postalGallery.getDiagnostics());
async function paperPixels(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.exhibition-canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const sx = gl.drawingBufferWidth / innerWidth, sy = gl.drawingBufferHeight / innerHeight;
    const points = [[10, 10], [innerWidth - 10, 10], [10, innerHeight - 10], [innerWidth - 10, innerHeight - 10]];
    return points.map(([x, y]) => {
      const pixel = new Uint8Array(4);
      gl.readPixels(Math.round(x * sx), gl.drawingBufferHeight - 1 - Math.round(y * sy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return [...pixel];
    });
  });
}
async function idle(page, ms = 500) { await page.waitForTimeout(ms); }
async function closeFocus(page) {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__postalGallery.getDiagnostics().selected === null);
  await idle(page, 120);
}

try {
  const desktop = await pageAt({ width: 1440, height: 900 });
  const stamps = await desktop.evaluate(async () => (await import('/src/config.js')).STAMPS);
  const ids = stamps.map(stamp => stamp.id);

  await check('twelve independent scene artworks load at their intended ratios', async () => {
    assert.equal(stamps.length, 12);
    assert.deepEqual(series.map(id => stamps.filter(stamp => stamp.series === id).length), [4, 4, 4]);
    const assets = [];
    for (const stamp of stamps) {
      const response = await desktop.request.get(new URL(stamp.image, baseURL).href);
      assert.equal(response.status(), 200, stamp.id);
      const bytes = await response.body();
      const decoded = await desktop.evaluate(async src => {
        const image = new Image(); image.src = src; await image.decode();
        return { width: image.naturalWidth, height: image.naturalHeight };
      }, stamp.image);
      assert.ok(decoded.width > 0 && decoded.height > 0, stamp.id);
      assert.ok(Math.abs(stamp.ratio - ({ guangdong: 45 / 65, china: 60 / 45, world: 40 / 75 })[stamp.series]) < 1e-9);
      assets.push({ id: stamp.id, series: stamp.series, image: stamp.image, ratio: stamp.ratio, sha256: hash(bytes), bytes: bytes.length, ...decoded });
    }
    assert.equal(new Set(assets.map(asset => asset.sha256)).size, 12, 'each stamp uses a separate painting');
    const d = await diagnostics(desktop);
    assert.equal(d.renderer.textures, 36, 'one renderer owns the 12 print, 12 paper and 12 shadow textures');
    assert.equal(await desktop.locator('canvas').count(), 1, 'the gallery uses one WebGL canvas');
    await snap(desktop, 'desktop-overview');
    return assets;
  });

  await check('all three series filters show their four stamps and return continuously', async () => {
    const result = [];
    for (const id of series) {
      const label = { guangdong: '广东篇', china: '中国篇', world: '世界篇' }[id];
      await desktop.locator('[data-series-nav] button').filter({ hasText: label }).click();
      await desktop.waitForFunction(id => window.__postalGallery.getDiagnostics().series === id, id);
      await idle(desktop, 500);
      const visible = await desktop.locator('[data-stamp]').evaluateAll(nodes => nodes.filter(node => node.style.visibility === 'visible').map(node => node.dataset.stamp));
      const expected = stamps.filter(stamp => stamp.series === id).map(stamp => stamp.id);
      assert.deepEqual(visible, expected, id);
      await snap(desktop, `desktop-${id}`);
      result.push({ id, visible });
    }
    await desktop.locator('[data-series-nav] button').filter({ hasText: '全部12张' }).click();
    await desktop.waitForFunction(() => window.__postalGallery.getDiagnostics().series === 'all');
    await idle(desktop, 500);
    return result;
  });

  await check('warm hover light follows each stamp and leaves the desk untouched', async () => {
    const results = [];
    const staticPaper = await paperPixels(desktop);
    assert.ok(staticPaper.every(pixel => pixel[3] === 255 && pixel[0] > 220), `background WebGL readback: ${JSON.stringify(staticPaper)}`);
    for (const id of ids) {
      const button = desktop.locator(`[data-stamp="${id}"]`);
      await button.hover();
      await desktop.waitForFunction(id => window.__postalGallery.getDiagnostics().hovered === id, id);
      await desktop.waitForFunction(id => {
        const state = window.__postalGallery.getDiagnostics();
        return state.lightStates.find(item => item.id === id).amount > 0.9 && state.lightStates.filter(item => item.id !== id).every(item => item.amount < 0.02);
      }, id, { timeout: 2500 });
      const state = await diagnostics(desktop);
      const expectedAspect = stamps.find(stamp => stamp.id === id).ratio;
      assert.ok(Math.abs(state.background.aspect - expectedAspect) < 0.001, `${id} light map aspect ${state.background.aspect} does not match ${expectedAspect}`);
      assert.deepEqual(await paperPixels(desktop), staticPaper, `${id} hover changed the static desk pixels`);
      results.push({ id, active: state.lightStates.filter(item => item.amount > 0.9).map(item => item.id), light: state.lightStates.find(item => item.id === id).uv });
    }
    await desktop.locator('[data-stamp="foshan"]').hover();
    await idle(desktop, 600);
    await snap(desktop, 'desktop-hover-foshan');
    await desktop.locator('[data-stamp="foshan"]').screenshot({ path: join(output, 'hover-foshan-stamp.png') });
    return results;
  });

  await check('focus opens the selected stamp and Escape returns to the same series', async () => {
    await desktop.locator('[data-stamp="london"]').click();
    await desktop.waitForFunction(() => window.__postalGallery.getDiagnostics().phase === 'focused');
    assert.equal((await diagnostics(desktop)).selected, 'london');
    assert.equal(await desktop.locator('.exhibition').getAttribute('role'), 'dialog');
    assert.match(await desktop.locator('.focus-detail').innerText(), /伦敦/);
    await snap(desktop, 'desktop-focus-london');
    await closeFocus(desktop);
    return { selected: 'london', escapeReturns: true };
  });

  const mobileResults = [];
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
    const mobile = await pageAt(viewport, true);
    await check(`mobile ${viewport.width}x${viewport.height} keeps stamp corners in bounds and touch focus works`, async () => {
      const before = await diagnostics(mobile);
      const corners = before.poses.flatMap(pose => pose.corners);
      assert.ok(corners.every(([x, y]) => x >= -1 && y >= -1 && x <= viewport.width + 1 && y <= viewport.height + 1));
      await snap(mobile, `mobile-${viewport.width}x${viewport.height}`);
      await mobile.locator('[data-stamp="foshan"]').tap();
      await mobile.waitForFunction(() => window.__postalGallery.getDiagnostics().phase === 'focused');
      assert.equal((await diagnostics(mobile)).selected, 'foshan');
      await closeFocus(mobile);
      return { stampCorners: corners.length, realTouch: true, focusAndReturn: true };
    });
    mobileResults.push({ viewport, phase: (await diagnostics(mobile)).phase });
  }

  report.assets = stamps.map(stamp => ({ id: stamp.id, series: stamp.series, image: stamp.image, ratio: stamp.ratio }));
  report.pageErrors.push(...[]);
  report.result = report.checks.every(item => item.result === 'passed') && !report.pageErrors.length && !report.consoleErrors.length && !report.failedRequests.length ? 'passed' : 'failed';
  report.mobile = mobileResults;
  report.finishedAt = new Date().toISOString();
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ result: report.result, checks: report.checks.length, failed: report.checks.filter(item => item.result === 'failed').map(item => item.name), pageErrors: report.pageErrors, consoleErrors: report.consoleErrors, failedRequests: report.failedRequests }, null, 2));
  if (report.result !== 'passed') process.exitCode = 1;
} finally {
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
}
