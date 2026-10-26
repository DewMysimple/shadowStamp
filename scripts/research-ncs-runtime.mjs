// Read-only, real WebGL uploads from the original NCS. No original asset is used
// in our renderer. Public bundle parameters are audited separately by URL/hash.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = 'artifacts/ncs-light-source';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const report = { observedAt: new Date().toISOString(), url: 'https://billguo.me/', scope: 'Read-only original NCS GPU uploads; no shader or image added to product.', errors: [], states: [] };
page.on('pageerror', e => report.errors.push(e.message));
await page.addInitScript(() => {
  const q = window.__ncsSourceGL = { programs: {}, canvasImages: [] };
  const programs = new WeakMap(), locations = new WeakMap(); let next = 0;
  for (const P of [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype].filter(Boolean)) {
    const create = P.createProgram;
    P.createProgram = function () { const p = create.call(this); programs.set(p, ++next); q.programs[next] = { uniforms: {}, canvas: { width: this.canvas.width, height: this.canvas.height, cls: this.canvas.className } }; return p; };
    const locate = P.getUniformLocation;
    P.getUniformLocation = function (p, name) { const loc = locate.call(this, p, name); if (loc) locations.set(loc, { id: programs.get(p), name }); return loc; };
    for (const method of ['uniform1f', 'uniform1i', 'uniform2f', 'uniform3f', 'uniform4f', 'uniform2fv', 'uniform3fv', 'uniform4fv']) {
      const original = P[method];
      P[method] = function (loc, ...values) { const entry = locations.get(loc); if (entry) q.programs[entry.id].uniforms[entry.name] = values.map(v => ArrayBuffer.isView(v) ? Array.from(v) : v); return original.call(this, loc, ...values); };
    }
    const upload = P.texImage2D;
    P.texImage2D = function (...args) {
      const image = args.find(v => v instanceof HTMLCanvasElement);
      if (image && q.canvasImages.length < 60) {
        const item = { width: image.width, height: image.height, ownerCanvas: this.canvas.className };
        try {
          const copy = document.createElement('canvas'); copy.width = 64; copy.height = 32;
          const ctx = copy.getContext('2d'); ctx.drawImage(image, 0, 0, 64, 32);
          const pixels = ctx.getImageData(0, 0, 64, 32).data;
          const colors = new Map(); let warm = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            const rgb = Array.from(pixels.slice(i, i + 3)), key = rgb.map(v => Math.floor(v / 16) * 16).join(',');
            colors.set(key, (colors.get(key) || 0) + 1);
            if (rgb[0] > rgb[1] + 10 && rgb[1] > rgb[2] + 8) warm++;
          }
          item.topQuantizedRGB = [...colors].sort((a, b) => b[1] - a[1]).slice(0, 8);
          item.orangeFraction = warm / (64 * 32);
        } catch (error) { item.error = String(error); }
        q.canvasImages.push(item);
      }
      return upload.apply(this, args);
    };
  }
});
try {
  await page.goto(report.url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.getByRole('button', { name: 'View all stamps' }).click();
  await page.waitForTimeout(1600);
  const stamp = page.locator('[data-stamp-id="ncs"]');
  for (const [label, u, v] of [['center', .5, .5], ['upperRight', .82, .18], ['lowerLeft', .18, .82]]) {
    const box = await stamp.boundingBox();
    await page.mouse.move(box.x + box.width * u, box.y + box.height * v);
    await page.waitForTimeout(900);
    report.states.push({ label, pointer: [u, v], gl: await page.evaluate(() => structuredClone(__ncsSourceGL)) });
  }
  await writeFile(`${out}/runtime-ncs.json`, JSON.stringify(report, null, 2));
  const programs = Object.entries(report.states[0].gl.programs).filter(([, p]) => Object.hasOwn(p.uniforms, 'normalMap'));
  console.log(JSON.stringify({ errors: report.errors, physicalPrograms: programs.map(([id, p]) => ({ id, canvas: p.canvas, uniforms: Object.fromEntries(Object.entries(p.uniforms).filter(([key]) => /roughness|metalness|clearcoat|normalScale|displacementScale|envMapIntensity|toneMappingExposure|specular|directionalLights|hemisphereLights|ambientLightColor/i.test(key))) })), canvasImages: report.states[0].gl.canvasImages }, null, 2));
} finally { await browser.close(); }
