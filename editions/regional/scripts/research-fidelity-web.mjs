// Read-only browser observations. No third-party image or shader becomes a product asset.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const out = 'artifacts/fidelity-research';
const stampId = process.argv.includes('--kensho') ? 'kensho' : 'ncs';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const errors = [];
const report = { observedAt: new Date().toISOString(), bill: {}, microsoft: {}, errors };
if (process.argv.includes('--bill-only')) {
  try { report.microsoft = JSON.parse(await readFile(`${out}/ncs-live-material-observations.json`, 'utf8')).microsoft; }
  catch { /* A first bill-only run simply has no Microsoft observation. */ }
}

async function instrument(page) {
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const audit = window.__fidelityGL = { programs: {}, textures: [], canvases: [], draws: 0 };
    const ids = new WeakMap(); let next = 0;
    const id = object => { if (!ids.has(object)) ids.set(object, ++next); return ids.get(object); };
    const shaders = new WeakMap(), uniforms = new WeakMap();
    for (const P of [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype].filter(Boolean)) {
      const source = P.shaderSource;
      P.shaderSource = function(shader, text) { shaders.set(shader, text); return source.call(this, shader, text); };
      const attach = P.attachShader;
      P.attachShader = function(program, shader) {
        const text = shaders.get(shader) || '';
        const item = audit.programs[id(program)] ??= { canvas: id(this.canvas), shaderFeatures: [], uniforms: {} };
        item.shaderFeatures.push({ lines: text.split('\n').length, chars: text.length,
          uniforms: [...text.matchAll(/uniform\s+\w+\s+(\w+)/g)].map(match => match[1]),
          samplers: [...text.matchAll(/uniform\s+sampler\w*\s+(\w+)/g)].map(match => match[1]),
          featureNames: ['normal', 'height', 'relief', 'bump', 'fresnel', 'specular', 'roughness', 'voronoi', 'noise', 'time', 'mouse', 'gradient', 'blur', 'dFdx', 'dFdy', 'spectrum'].filter(word => text.toLowerCase().includes(word.toLowerCase())),
          textureReads: [...text.matchAll(/\btexture(?:2D|Lod)?\s*\(/g)].length,
          hasSine: /\bsin\s*\(/.test(text), hasCosine: /\bcos\s*\(/.test(text), hasDerivative: /\bdFd[xy]\s*\(/.test(text) });
        return attach.call(this, program, shader);
      };
      const location = P.getUniformLocation;
      P.getUniformLocation = function(program, name) { const loc = location.call(this, program, name); if (loc) uniforms.set(loc, { program: id(program), name }); return loc; };
      for (const method of ['uniform1f', 'uniform1i', 'uniform2f', 'uniform2fv', 'uniform3f', 'uniform3fv', 'uniform4f', 'uniform4fv']) {
        const native = P[method];
        P[method] = function(loc, ...values) { const entry = uniforms.get(loc); if (entry) (audit.programs[entry.program] ??= { uniforms: {} }).uniforms[entry.name] = values.map(value => ArrayBuffer.isView(value) ? [...value] : value); return native.call(this, loc, ...values); };
      }
      const upload = P.texImage2D;
      P.texImage2D = function(...args) {
        const image = args.find(value => value instanceof HTMLImageElement || value instanceof HTMLCanvasElement || value instanceof ImageBitmap);
        if (image && audit.textures.length < 250) audit.textures.push({ canvas: id(this.canvas), kind: image.constructor.name, width: image.naturalWidth || image.width, height: image.naturalHeight || image.height, src: image.currentSrc || image.src || null });
        return upload.apply(this, args);
      };
      for (const method of ['drawArrays', 'drawElements']) { const native = P[method]; P[method] = function(...args) { audit.draws++; return native.apply(this, args); }; }
    }
  });
}

async function sample(page) {
  return page.evaluate(() => ({
    gl: structuredClone(window.__fidelityGL),
    nodes: [...document.querySelectorAll(`[data-stamp-id="${window.__researchStampId || 'ncs'}"], [data-stamp-id="${window.__researchStampId || 'ncs'}"] *, [class*="StampDetail"] canvas, [class*="StampDetail"] img`)].map(element => {
      const css = getComputedStyle(element), box = element.getBoundingClientRect();
      return { tag: element.tagName, cls: element.className, opacity: css.opacity, filter: css.filter, blend: css.mixBlendMode,
        x: box.x, y: box.y, width: box.width, height: box.height, src: element.currentSrc || element.src || null, naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight,
        canvasWidth: element instanceof HTMLCanvasElement ? element.width : undefined, canvasHeight: element instanceof HTMLCanvasElement ? element.height : undefined };
    }),
    baseColorSamples: (() => {
      const image = document.querySelector(`[data-stamp-id="${window.__researchStampId || 'ncs'}"] img`);
      if (!image?.naturalWidth) return null;
      try {
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
        return [[.5,.5],[.3,.3],[.7,.7],[.15,.15],[.85,.15],[.15,.85],[.85,.85],[.05,.5]].map(([u,v]) => {
          const pixels = ctx.getImageData(Math.round(u*(canvas.width-1))-2, Math.round(v*(canvas.height-1))-2, 5, 5).data;
          const mean = [0,0,0]; for(let i=0;i<pixels.length;i+=4) for(let c=0;c<3;c++) mean[c] += pixels[i+c]/25;
          return {uv:[u,v],meanRGB:mean.map(value=>Number(value.toFixed(2)))};
        });
      } catch(error) { return {error:String(error)}; }
    })(),
  }));
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await instrument(page);
  await page.goto('https://billguo.me/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(id => { window.__researchStampId = id; }, stampId);
  await page.waitForTimeout(4500);
  await page.getByRole('button', { name: 'View all stamps' }).click();
  await page.waitForTimeout(1600);
  await page.mouse.move(40, 120); await page.waitForTimeout(700);
  report.bill.idle = await sample(page);
  await page.screenshot({ path: `${out}/bill-${stampId}-idle.png` });
  report.bill.stampIds = await page.locator('[data-stamp-id]').evaluateAll(nodes => nodes.map(node => node.dataset.stampId));
  const stamp = page.locator(`[data-stamp-id="${stampId}"]`), box = await stamp.boundingBox();
  report.bill.bounds = box;
  report.bill.hover = [];
  for (const [label, u, v] of [['center', .5, .5], ['upperRight', .82, .18], ['lowerLeft', .18, .82]]) {
    await page.mouse.move(box.x + box.width * u, box.y + box.height * v); await page.waitForTimeout(650);
    report.bill.hover.push({ label, pointer: [u, v], sample: await sample(page) });
    await page.screenshot({ path: `${out}/bill-${stampId}-hover-${label}.png` });
  }
  // Hide no layers, mutate no style: both base image and relief renderer are observed as shipped.
  const clickBox = await stamp.boundingBox();
  await page.mouse.click(clickBox.x + clickBox.width / 2, clickBox.y + clickBox.height / 2); await page.waitForTimeout(1600);
  report.bill.focus = await sample(page);
  await page.screenshot({ path: `${out}/bill-${stampId}-focus.png` });
  report.bill.styles = await page.evaluate(() => {
    const output = [];
    function read(rules) { for (const rule of rules) { if (rule.cssRules) read(rule.cssRules); else if (/relief|holo|emboss|shine|canvas/i.test(rule.cssText) && /HomeStamps|StampDetail/.test(rule.cssText)) output.push(rule.cssText); } }
    for (const sheet of document.styleSheets) { try { read(sheet.cssRules); } catch {} }
    return output;
  });
} catch (error) { report.bill.error = String(error); }

if (stampId !== 'kensho' && !process.argv.includes('--bill-only')) try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await instrument(page);
  await page.goto('https://microsoft.ai/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4500);
  await page.getByRole('button', { name: 'Reject', exact: true }).click({ timeout: 2000 }).catch(() => {});
  await page.mouse.move(1200, 180); await page.waitForTimeout(1000);
  report.microsoft = await page.evaluate(() => ({ gl: structuredClone(window.__fidelityGL), canvases: [...document.querySelectorAll('canvas')].map(canvas => ({ width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight })) }));
  await page.screenshot({ path: `${out}/microsoft-rechecked.png` });
} catch (error) { report.microsoft.error = String(error); }

await writeFile(`${out}/${stampId}-live-material-observations.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ stampId, bill: { error: report.bill.error, baseImages: report.bill.idle?.nodes.filter(node => node.tag === 'IMG'), materialPrograms: Object.entries(report.bill.hover?.[0]?.sample.gl.programs || {}).filter(([, p]) => p.uniforms.normalMap).map(([id, p]) => ({ id, roughness: p.uniforms.roughness, metalness: p.uniforms.metalness, normalScale: p.uniforms.normalScale, displacementScale: p.uniforms.displacementScale })), focusedImage: report.bill.focus?.nodes.filter(node => node.tag === 'IMG') }, microsoft: { error: report.microsoft.error, canvases: report.microsoft.canvases }, errors }, null, 2));
await browser.close();
