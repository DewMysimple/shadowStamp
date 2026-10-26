import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const baseURL = process.env.PRODUCTION_URL || 'http://127.0.0.1:4174/';
const output = resolve('artifacts/controls-verification');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const report = { baseURL, startedAt: new Date().toISOString(), checks: [], errors: [] };
const contexts = [];
async function pageFor(options = {}, init) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  contexts.push(context);
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) report.errors.push(message.text()); });
  const response = await page.goto(baseURL, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);
  assert.equal(await page.locator('canvas').count(), 1);
  assert.equal(await page.evaluate(() => typeof window.__postalGallery), 'undefined');
  return page;
}
async function check(name, run) {
  try { const details = await run(); report.checks.push({ name, result: 'passed', details }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, result: 'failed', error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
}
try {
  await check('production desktop controls stay usable in focus, persist and export', async () => {
    const page = await pageFor();
    await page.getByRole('button', { name: '聚焦主邮票', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('main').dataset.phase === 'focused');
    const group = page.locator('.parameter-group').filter({ has: page.locator('summary', { hasText: '聚焦展示' }) });
    await group.locator('summary').click();
    await page.getByRole('spinbutton', { name: '聚焦偏转数值', exact: true }).fill('12');
    await page.locator('[data-parameter="resetTiltOnLeave"]').check();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('main').getAttribute('data-phase'), 'focused');
    assert.equal(await page.locator('[data-stamp="craft"]').getAttribute('data-selected'), 'true');
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出', exact: true }).click();
    const download = await downloadEvent;
    await download.saveAs(join(output, 'production-parameters.json'));
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('postal-studies:parameters:v1')));
    assert.equal(saved.parameters.focusTilt, 12);
    assert.equal(saved.parameters.resetTiltOnLeave, true);
    await page.screenshot({ path: join(output, 'production-desktop.png') });
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.getByRole('spinbutton', { name: '聚焦偏转数值', exact: true }).inputValue(), '12');
    await page.getByRole('button', { name: '聚焦主邮票', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('main').dataset.phase === 'focused');
    await page.locator('[data-stamp="craft"]').focus();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('main').dataset.phase === 'hovering' || document.querySelector('main').dataset.phase === 'idle');
    return { http: 200, canvas: 1, devDiagnosticsExposed: false, persistedTilt: 12, exported: download.suggestedFilename(), focusedControlClicksSafe: true };
  });
  await check('production mobile touch can open panel, focus and return', async () => {
    const page = await pageFor({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    assert.equal(await page.locator('.parameter-launcher').getAttribute('aria-expanded'), 'false');
    await page.locator('.parameter-launcher').tap();
    await page.getByRole('button', { name: '聚焦主邮票', exact: true }).tap();
    await page.waitForFunction(() => document.querySelector('main').dataset.phase === 'focused');
    await page.locator('.parameter-launcher').tap();
    await page.screenshot({ path: join(output, 'production-mobile.png') });
    await page.locator('.close-focus').tap();
    await page.waitForFunction(() => document.querySelector('main').dataset.phase === 'idle');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    return { trueTouch: true, noOverflow: true };
  });
  await check('denied localStorage still renders controls and live changes', async () => {
    const page = await pageFor({}, () => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage denied', 'SecurityError'); } }));
    await page.getByRole('spinbutton', { name: '悬停偏转数值', exact: true }).fill('9');
    await page.getByText('当前浏览器无法保存；参数仍可实时应用并导出。', { exact: true }).waitFor();
    await page.getByRole('button', { name: '聚焦主邮票', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('main').dataset.phase === 'focused');
    return { storageFailureHandled: true, liveControls: true };
  });
  await check('production console, page and WebGL messages', async () => { assert.deepEqual(report.errors, []); return { warnings: 0, errors: 0 }; });
} finally {
  report.result = report.checks.every(check => check.result === 'passed') ? 'passed' : 'failed';
  report.finishedAt = new Date().toISOString();
  await writeFile(join(output, 'production-report.json'), JSON.stringify(report, null, 2));
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
}
console.log(JSON.stringify({ result: report.result, checks: report.checks.length }));
if (report.result !== 'passed') process.exitCode = 1;
