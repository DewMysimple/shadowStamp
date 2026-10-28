import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const output = resolve('artifacts/lion-stamps');
await mkdir(join(output, 'prints'), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(process.env.VERIFY_URL || 'http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__postalGallery);
  const prints = await page.evaluate(async () => {
    const { createStampArtwork, prepareStampArtwork } = await import('/src/artwork.js');
    const { STAMPS } = await import('/src/config.js');
    await prepareStampArtwork();
    const board = document.createElement('canvas');
    board.width = 1600;
    board.height = 1080;
    const ctx = board.getContext('2d');
    ctx.fillStyle = '#e8e1d5'; ctx.fillRect(0, 0, board.width, board.height);
    const result = STAMPS.map((stamp, index) => {
      const artwork = createStampArtwork(stamp.id);
      const x = 46 + index % 4 * 390;
      const y = 35 + Math.floor(index / 4) * 525;
      ctx.save();
      ctx.shadowColor = '#3c2e1b30'; ctx.shadowBlur = 17; ctx.shadowOffsetY = 7;
      ctx.drawImage(artwork, x, y, 338, 422.5);
      ctx.restore();
      ctx.fillStyle = '#765a45';
      ctx.font = '18px "SimSun", serif';
      ctx.fillText(`${stamp.number}  ${stamp.name}`, x + 18, y + 462);
      return { id: stamp.id, name: stamp.name, file: `lion-stamp-${stamp.number}-${stamp.id}.png`, data: artwork.toDataURL('image/png') };
    });
    return { result, board: board.toDataURL('image/png') };
  });
  for (const print of prints.result) await writeFile(join(output, 'prints', print.file), Buffer.from(print.data.split(',')[1], 'base64'));
  await writeFile(join(output, 'stamps-contact-sheet.png'), Buffer.from(prints.board.split(',')[1], 'base64'));
  await page.locator('.parameter-launcher').click();
  await page.mouse.move(20, 880);
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(output, 'gallery.png') });
  await page.locator('[data-stamp="joy"]').hover();
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(output, 'hover-joy.png') });
  await page.locator('[data-stamp="joy"]').click();
  await page.waitForFunction(() => __postalGallery.getDiagnostics().phase === 'focused');
  await page.mouse.move(755, 355);
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(output, 'focus-joy.png') });
  await writeFile(join(output, 'print-export.json'), JSON.stringify({ createdAt: new Date().toISOString(), size: [720, 900], prints: prints.result.map(({ data, ...entry }) => entry) }, null, 2) + '\n');
  console.log('Exported eight 720×900 perforated stamps, contact sheet and three gallery captures.');
} finally {
  await browser.close();
}
