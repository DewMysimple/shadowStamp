import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { getEditionLaunch, inspectRunningEdition } from './start-edition.mjs';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, process.env.VERIFY_OUTPUT || 'artifacts/dual-editions');
await mkdir(output, { recursive: true });
const launches = ['original', 'regional'].map(edition => getEditionLaunch(edition, root));
const report = { startedAt: new Date().toISOString(), scope: 'Concurrent original/regional servers, exact runtime source preservation, launcher reuse and origin-isolated persistence.',
  origins: launches.map(({ edition, url, cwd }) => ({ edition, url, cwd })), checks: [], errors: [], failedRequests: [], screenshots: [] };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await context.addInitScript(() => {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attributes) {
    return original.call(this, type, /^webgl2?$/.test(type) ? { ...(attributes || {}), preserveDrawingBuffer: true } : attributes);
  };
});
const pages = {};

async function check(name, work) {
  const began = Date.now();
  try { const details = await work(); report.checks.push({ name, result: 'passed', elapsedMs: Date.now() - began, details }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, result: 'failed', elapsedMs: Date.now() - began, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
}
async function visit(edition) {
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push({ edition, message: error.message }));
  page.on('console', message => { if (message.type() === 'error') report.errors.push({ edition, message: message.text() }); });
  page.on('requestfailed', request => report.failedRequests.push({ edition, url: request.url(), error: request.failure()?.errorText }));
  await page.goto(launches.find(launch => launch.edition === edition).url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__postalGallery));
  pages[edition] = page; return page;
}
const diagnostics = page => page.evaluate(() => window.__postalGallery.getDiagnostics());
async function snap(page, name) { await page.screenshot({ path: join(output, name) }); report.screenshots.push(name); }
async function panel(page, open = true) {
  if ((await page.locator('.parameter-launcher').getAttribute('aria-expanded') === 'true') !== open) await page.locator('.parameter-launcher').click();
}
async function setNumber(page, key, value) {
  await panel(page);
  const range = page.locator(`[data-parameter="${key}"]`);
  await range.evaluate(node => node.closest('details').open = true);
  await range.locator('..').locator('input[type="number"]').fill(String(value));
  await page.waitForFunction(({ key, value }) => __postalGallery.getDiagnostics().parameters[key] === value, { key, value });
}
async function desk(page) {
  return page.evaluate(() => {
    const gl = document.querySelector('.exhibition-canvas').getContext('webgl2');
    const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const pixels = new Uint8Array(32 * 32 * 4); gl.readPixels(4, 4, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer); return Array.from(pixels);
  });
}
async function runtimePreservation(base, prefix, roots) {
  const listing = (await exec('git', ['ls-tree', '-r', '-z', base, '--', ...roots], { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })).stdout;
  const expected = listing.split('\0').filter(Boolean).map(line => {
    const [metadata, path] = line.split('\t'); return { path, blob: metadata.split(' ')[2] };
  });
  const mismatches = [];
  for (const file of expected) {
    const target = prefix ? `${prefix}/${file.path}` : file.path;
    const actual = (await exec('git', ['hash-object', `--path=${target}`, target], { cwd: root, encoding: 'utf8' })).stdout.trim();
    if (actual !== file.blob) mismatches.push({ path: target, expected: file.blob, actual });
  }
  const actualPaths = [];
  async function collect(relative) {
    if (!existsSync(join(root, relative))) return;
    for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await collect(child); else actualPaths.push(prefix ? child.slice(prefix.length + 1) : child);
    }
  }
  for (const directory of ['src', 'public']) await collect(prefix ? `${prefix}/${directory}` : directory);
  const expectedPaths = new Set(expected.filter(file => /^(src|public)\//.test(file.path)).map(file => file.path));
  const unexpected = actualPaths.filter(path => !expectedPaths.has(path));
  assert.deepEqual(mismatches, []); assert.deepEqual(unexpected, []);
  return { base, prefix: prefix || '.', checkedFiles: expected.length, mismatches, unexpected, scope: roots };
}
async function listeningProcesses() {
  const command = 'Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 4173,4174 } | Sort-Object LocalPort | Select-Object LocalAddress,LocalPort,OwningProcess | ConvertTo-Json -Compress';
  return JSON.parse((await exec('powershell.exe', ['-NoProfile', '-Command', command], { cwd: root, encoding: 'utf8' })).stdout);
}

try {
  await check('both concurrent servers identify as the intended edition', async () => {
    const identities = await Promise.all(launches.map(async launch => ({ edition: launch.edition, ...await inspectRunningEdition(launch) })));
    assert.deepEqual(identities.map(item => [item.occupied, item.edition]), [[true, 'original'], [true, 'regional']]);
    await Promise.all(launches.map(launch => visit(launch.edition)));
    assert.equal(await pages.original.locator('[data-stamp]').count(), 8);
    assert.equal(await pages.regional.locator('[data-stamp]').count(), 12);
    assert.equal(await pages.original.locator('#parameter-lightAlgorithm').count(), 0);
    assert.equal(await pages.regional.locator('#parameter-lightAlgorithm option').count(), 6);
    assert.equal((await diagnostics(pages.regional)).parameters.lightAlgorithm, 'local-add');
    return { identities, originalStamps: 8, regionalStamps: 12, regionalAlgorithms: 6, simultaneousPagesInOneContext: true };
  });
  await check('original eight-expression edition preserves static desk, hover light and focus', async () => {
    const page = pages.original;
    await page.bringToFront();
    await panel(page, false); await page.mouse.move(1430, 10); await page.waitForTimeout(450);
    const initial = await diagnostics(page), idleDesk = await desk(page);
    assert.ok(initial.lightStates.every(state => state.amount === 0)); await snap(page, 'original-idle.png');
    await page.locator('[data-stamp="joy"]').hover({ force: true });
    await page.waitForFunction(() => { const d = __postalGallery.getDiagnostics(); return d.hovered === 'joy' && d.lightStates.find(state => state.id === 'joy').amount > .99; });
    const hovered = await diagnostics(page);
    assert.ok(hovered.lightStates.find(state => state.id === 'joy').amount > .99);
    assert.ok(hovered.lightStates.filter(state => state.id !== 'joy').every(state => state.amount === 0));
    assert.deepEqual(await desk(page), idleDesk); await snap(page, 'original-hover.png');
    await page.locator('[data-stamp="joy"]').click({ force: true }); await page.waitForFunction(() => __postalGallery.getDiagnostics().phase === 'focused');
    assert.equal((await diagnostics(page)).selected, 'joy'); await snap(page, 'original-focus.png');
    await page.locator('.close-focus').click(); await page.waitForFunction(() => __postalGallery.getDiagnostics().selected === null);
    return { idleLightAmounts: initial.lightStates.map(state => state.amount), hoverOwner: hovered.background.owner, focus: 'joy', deskSHA256: hash(Uint8Array.from(idleDesk)), returned: true };
  });
  await check('regional assets, default six-choice controls and focus use the copied edition', async () => {
    const page = pages.regional, stamps = await page.evaluate(async () => (await import('/src/config.js')).STAMPS);
    await page.bringToFront();
    const assets = [];
    for (const stamp of stamps) { const response = await page.request.get(new URL(stamp.image, launches[1].url).href); assert.equal(response.status(), 200, stamp.image); assets.push({ id: stamp.id, path: stamp.image, status: response.status(), sha256: hash(await response.body()) }); }
    await panel(page, false); await page.mouse.move(1430, 10); await page.waitForTimeout(450); await snap(page, 'regional-idle.png');
    const idleDesk = await desk(page);
    await page.locator('[data-stamp="foshan"]').hover({ force: true }); await page.waitForFunction(() => { const d = __postalGallery.getDiagnostics(); return d.hovered === 'foshan' && d.lightStates.find(state => state.id === 'foshan').amount > .99; });
    const hovered = await diagnostics(page);
    assert.ok(hovered.lightStates.find(state => state.id === 'foshan').amount > .99); assert.deepEqual(await desk(page), idleDesk); await snap(page, 'regional-hover.png');
    await page.locator('[data-stamp="foshan"]').click({ force: true }); await page.waitForFunction(() => __postalGallery.getDiagnostics().phase === 'focused');
    assert.equal((await diagnostics(page)).selected, 'foshan'); await snap(page, 'regional-focus.png');
    await page.locator('.close-focus').click(); await page.waitForFunction(() => __postalGallery.getDiagnostics().selected === null);
    return { assets, defaultAlgorithm: (await diagnostics(page)).parameters.lightAlgorithm, focus: 'foshan', staticDesk: true, returned: true };
  });
  await check('one browser context retains separate settings at the two origins after reload', async () => {
    const original = pages.original, regional = pages.regional;
    await setNumber(original, 'hoverTilt', 9); await setNumber(original, 'lightContrast', .37);
    await panel(regional); await regional.locator('#parameter-lightAlgorithm').selectOption('soft-light'); await setNumber(regional, 'hoverTilt', 4); await setNumber(regional, 'lightContrast', .61);
    const before = { original: (await diagnostics(original)).parameters, regional: (await diagnostics(regional)).parameters };
    assert.equal(before.original.lightContrast, .37); assert.equal(before.regional.lightContrast, .61);
    await Promise.all([original.reload({ waitUntil: 'networkidle' }), regional.reload({ waitUntil: 'networkidle' })]);
    await Promise.all([original.waitForFunction(() => Boolean(window.__postalGallery)), regional.waitForFunction(() => Boolean(window.__postalGallery))]);
    assert.deepEqual((await diagnostics(original)).parameters, before.original); assert.deepEqual((await diagnostics(regional)).parameters, before.regional);
    assert.equal((await diagnostics(regional)).parameters.lightAlgorithm, 'soft-light');
    const key = 'postal-studies:parameters:v2';
    const storage = { original: await original.evaluate(key => localStorage.getItem(key), key), regional: await regional.evaluate(key => localStorage.getItem(key), key) };
    assert.notEqual(storage.original, storage.regional);
    return { sharedStorageKey: key, origins: launches.map(launch => launch.url), original: { hoverTilt: before.original.hoverTilt, lightContrast: before.original.lightContrast }, regional: { hoverTilt: before.regional.hoverTilt, lightContrast: before.regional.lightContrast, algorithm: before.regional.lightAlgorithm }, reloadPreservedBoth: true, userBrowserProfileUntouched: true };
  });
  await check('both actual CMD launchers reuse existing processes and share root dependencies', async () => {
    const before = await listeningProcesses();
    const runs = [];
    for (const file of ['runStart.cmd', 'runGo.cmd']) {
      const result = await exec('cmd.exe', ['/d', '/c', file], { cwd: root, env: { ...process.env, POSTAL_NO_OPEN: '1' }, timeout: 12000, encoding: 'utf8' });
      assert.match(result.stdout, /Reusing (original|regional) edition/); runs.push({ file, stdout: result.stdout.trim(), stderr: result.stderr.trim() });
    }
    const after = await listeningProcesses(); assert.deepEqual(after, before);
    assert.equal(launches[0].vite, launches[1].vite); assert.ok(existsSync(launches[0].vite));
    const nestedModules = join(root, 'editions', 'regional', 'node_modules');
    const cacheDirectories = existsSync(nestedModules) ? await readdir(nestedModules) : [];
    assert.deepEqual(cacheDirectories.filter(name => !['.vite', '.vite-temp'].includes(name)), [], 'Vite caches are allowed; a second dependency installation is not');
    const originalRequire = createRequire(join(root, 'package.json')), regionalRequire = createRequire(join(root, 'editions', 'regional', 'package.json'));
    const sharedModules = Object.fromEntries(['react', 'react-dom', 'three'].map(name => {
      assert.equal(regionalRequire.resolve(name), originalRequire.resolve(name)); return [name, originalRequire.resolve(name)];
    }));
    const originalPackage = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const regionalPackage = JSON.parse(await readFile(join(root, 'editions', 'regional', 'package.json'), 'utf8'));
    assert.deepEqual(regionalPackage.dependencies, originalPackage.dependencies); assert.deepEqual(regionalPackage.devDependencies, originalPackage.devDependencies);
    return { runs, listenersBefore: before, listenersAfter: after, noExtraServer: true, sharedVite: launches[0].vite, sharedModules, nestedCacheDirectories: cacheDirectories, secondDependencyInstallation: false };
  });
  await check('runtime source and assets exactly match the two committed source editions', async () => ({
    original: await runtimePreservation('11d5049', '', ['src', 'public', 'index.html', 'vite.config.js', 'package.json', 'package-lock.json']),
    regional: await runtimePreservation('74ba21c', 'editions/regional', ['src', 'public', 'index.html', 'vite.config.js']),
  }));
  await check('both editions produced no browser errors or failed requests', async () => {
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedRequests, []); return { errors: 0, failedRequests: 0 };
  });
} finally {
  report.finishedAt = new Date().toISOString(); report.result = report.checks.every(check => check.result === 'passed') ? 'passed' : 'failed';
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  await context.close(); await browser.close();
}
console.log(JSON.stringify({ result: report.result, checks: report.checks.length, failed: report.checks.filter(check => check.result !== 'passed').map(check => check.name), output }));
if (report.result !== 'passed') process.exitCode = 1;
