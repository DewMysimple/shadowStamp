import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const out = resolve('artifacts/single-light-study');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__postalGallery);
  await page.locator('.parameter-launcher').click();
  await page.screenshot({ path: `${out}/gallery.png` });
  await page.evaluate(() => __postalGallery.configure({ lightAnimation: false, pinLight: true }));
  await page.locator('[data-stamp="craft"]').hover({ force: true });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${out}/hover.png` });
  const pose = (await page.evaluate(() => __postalGallery.getDiagnostics())).poses.find(p => p.id === 'craft');
  const xs = pose.corners.map(p => p[0]), ys = pose.corners.map(p => p[1]);
  await page.screenshot({ path: `${out}/hover-craft.png`, clip: { x: Math.floor(Math.min(...xs)) - 35, y: Math.floor(Math.min(...ys)) - 35, width: Math.ceil(Math.max(...xs) - Math.min(...xs)) + 70, height: Math.ceil(Math.max(...ys) - Math.min(...ys)) + 70 } });
  await page.evaluate(() => __postalGallery.focus('craft'));
  await page.waitForFunction(() => __postalGallery.getDiagnostics().phase === 'focused');
  await page.mouse.move(715, 350);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/focus.png` });
  await writeFile(`${out}/capture.json`, JSON.stringify({ errors, diagnostics: await page.evaluate(() => __postalGallery.getDiagnostics()) }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await context.close(); await browser.close(); }
