import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const output = resolve('artifacts/region-stamps');
const prints = join(output, 'prints');
await mkdir(prints, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(process.env.VERIFY_URL || 'http://127.0.0.1:4175/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__postalGallery && document.querySelectorAll('[data-stamp]').length === 12);

  const composition = await page.evaluate(async () => {
    const { STAMPS } = await import('/src/config.js');
    const { createStampArtwork, prepareStampArtwork } = await import('/src/artwork.js');
    await prepareStampArtwork();
    const board = document.createElement('canvas');
    board.width = 1680;
    board.height = 1680;
    const ctx = board.getContext('2d');
    ctx.fillStyle = '#f8f3eb'; ctx.fillRect(0, 0, board.width, board.height);
    ctx.fillStyle = '#886b59'; ctx.textBaseline = 'middle';
    const groups = [
      { id: 'guangdong', title: 'GUANGDONG · 岭南', cards: STAMPS.filter(stamp => stamp.series === 'guangdong') },
      { id: 'china', title: 'CHINA · 九州', cards: STAMPS.filter(stamp => stamp.series === 'china') },
      { id: 'world', title: 'WORLD · 四海', cards: STAMPS.filter(stamp => stamp.series === 'world') },
    ];
    const records = [];
    for (const [row, group] of groups.entries()) {
      const top = 55 + row * 545;
      ctx.font = '18px Georgia, serif'; ctx.fillText(group.title, 68, top - 24);
      for (const [column, stamp] of group.cards.entries()) {
        const canvas = createStampArtwork(stamp.id, 720, Math.round(720 / stamp.ratio));
        const file = `stamp-${stamp.number}-${stamp.id}.png`;
        const data = canvas.toDataURL('image/png');
        const cellLeft = 70 + column * 390, cellRight = cellLeft + 325;
        const maxHeight = 412, maxWidth = cellRight - cellLeft;
        const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
        const w = canvas.width * scale, h = canvas.height * scale;
        const x = cellLeft + (maxWidth - w) / 2, y = top + 14 + (maxHeight - h) / 2;
        ctx.save(); ctx.shadowColor = '#4b362728'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 8;
        ctx.drawImage(canvas, x, y, w, h); ctx.restore();
        ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.fillText(`${stamp.number}  ${stamp.place} · ${stamp.title}`, cellLeft, top + 455);
        records.push({ id: stamp.id, number: stamp.number, place: stamp.place, title: stamp.title, ratio: stamp.ratio, file, width: canvas.width, height: canvas.height, data });
      }
    }
    return { records, contactSheet: board.toDataURL('image/png') };
  });
  for (const stamp of composition.records) await writeFile(join(prints, stamp.file), Buffer.from(stamp.data.split(',')[1], 'base64'));
  await writeFile(join(output, 'contact-sheet.png'), Buffer.from(composition.contactSheet.split(',')[1], 'base64'));
  await page.screenshot({ path: join(output, 'overview.png') });
  await page.locator('[data-series-nav] button').filter({ hasText: '广东篇' }).click();
  await page.waitForTimeout(450);
  await page.locator('[data-stamp="foshan"]').hover();
  await page.waitForTimeout(850);
  await page.screenshot({ path: join(output, 'hover-foshan.png') });
  for (const id of ['guangdong', 'china', 'world']) {
    await page.locator(`[data-series-nav] button`).filter({ hasText: id === 'guangdong' ? '广东篇' : id === 'china' ? '中国篇' : '世界篇' }).click();
    await page.waitForFunction(id => window.__postalGallery.getDiagnostics().series === id, id);
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(output, `${id}-series.png`) });
  }
  await page.locator('[data-stamp="london"]').click();
  await page.waitForFunction(() => window.__postalGallery.getDiagnostics().phase === 'focused');
  await page.screenshot({ path: join(output, 'focus-london.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.locator('[data-series-nav] button').filter({ hasText: '全部12张' }).click();
  await page.waitForTimeout(400);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  if (await page.locator('.parameter-launcher').getAttribute('aria-expanded') === 'true') await page.locator('.parameter-launcher').click();
  await page.screenshot({ path: join(output, 'mobile-overview.png') });
  await writeFile(join(output, 'capture-record.json'), JSON.stringify({ capturedAt: new Date().toISOString(), viewport: [1440, 900], assets: composition.records.map(({ data, ...record }) => record), pageErrors: errors }, null, 2) + '\n');
  if (errors.length) throw new Error(`Browser errors during capture: ${errors.join('; ')}`);
  console.log(`Captured ${composition.records.length} region stamp prints, contact sheet and 7 browser states to ${output}`);
} finally {
  await browser.close();
}
