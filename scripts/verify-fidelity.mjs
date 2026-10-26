import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DEFAULT_PARAMETERS, STORAGE_KEY, LEGACY_STORAGE_KEY, PARAMETER_VERSION } from '../src/parameters.js';

const base = process.env.VERIFY_URL || 'http://127.0.0.1:4173/';
const out = resolve('artifacts/fidelity-verification');
await mkdir(out, { recursive: true });
const report = { base, startedAt: new Date().toISOString(), scope: 'Current static artwork and stamp-specific surface lighting, not a claim of pixel-identical third-party artwork', checks: [], errors: [], warnings: [] };
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const contexts = [];
const hash = value => createHash('sha256').update(value).digest('hex');
const sourcePaths=['src/artwork.js','src/parameters.js','src/rendering/StampGallery.js','src/rendering/StampMaterial.js','src/rendering/SurfaceTexture.js'];
const sourceFingerprint=async()=>Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,hash(await readFile(path))])));
report.sourceSnapshot=await sourceFingerprint();
const diagnostics = page => page.evaluate(() => __postalGallery.getDiagnostics());
async function check(name, run) {
  try { const details = await run(); report.checks.push({ name, result: 'passed', details }); console.log(`PASS ${name}`); }
  catch (error) {
    const debug=page&&!page.isClosed()?await diagnostics(page).catch(()=>null):null;
    report.checks.push({ name, result: 'failed', error: error.stack,debug }); console.error(`FAIL ${name}: ${error.message}`);
    if(page&&!page.isClosed())await page.screenshot({path:join(out,`failure-${String(report.checks.length).padStart(2,'0')}.png`)}).catch(()=>{});
  }
}
async function createPage(options = {}, storage) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...options });
  contexts.push(context);
  await context.addInitScript(({ storage }) => {
    if (storage) for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
    const q = window.__fidelityQA = { raf: 0, programs: {}, createdTextures: 0, deletedTextures: 0 };
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => raf(time => { q.raf++; callback(time); });
    const locations = new WeakMap(), programs = new WeakMap(); let id = 0;
    for (const prototype of [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype].filter(Boolean)) {
      const create = prototype.createProgram;
      prototype.createProgram = function () { const program = create.call(this); programs.set(program, ++id); q.programs[id] = {}; return program; };
      const locate = prototype.getUniformLocation;
      prototype.getUniformLocation = function (program, name) { const location = locate.call(this, program, name); if (location) locations.set(location, { id: programs.get(program), name }); return location; };
      for (const name of ['uniform1f', 'uniform2f', 'uniform3f', 'uniform2fv', 'uniform3fv']) {
        const original = prototype[name];
        prototype[name] = function (location, ...values) { const field = locations.get(location); if (field) q.programs[field.id][field.name] = values.length === 1 ? (ArrayBuffer.isView(values[0]) ? Array.from(values[0]) : values[0]) : values; return original.call(this, location, ...values); };
      }
      const makeTexture = prototype.createTexture, deleteTexture = prototype.deleteTexture;
      prototype.createTexture = function () { const texture = makeTexture.call(this); if (texture) q.createdTextures++; return texture; };
      prototype.deleteTexture = function (texture) { if (texture) q.deletedTextures++; return deleteTexture.call(this, texture); };
    }
  }, { storage });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); if (message.type() === 'warning') report.warnings.push(message.text()); });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__postalGallery);
  return page;
}
async function configure(page, values) { await page.evaluate(values => __postalGallery.configure(values), values); await page.waitForTimeout(250); }
async function focus(page, id) {
  const d = await diagnostics(page);
  if (d.selected && d.selected !== id) { await page.evaluate(() => __postalGallery.close()); await page.waitForFunction(() => __postalGallery.getDiagnostics().selected === null); }
  await page.evaluate(id => __postalGallery.focus(id), id);
  await page.waitForFunction(id => { const d = __postalGallery.getDiagnostics(); return d.selected === id && d.phase === 'focused'; }, id);
  await page.waitForTimeout(350);
}
async function pointer(page, u, v, id = 'craft') {
  const pose = (await diagnostics(page)).poses.find(pose => pose.id === id);
  const [bottomLeft, topLeft, , topRight] = pose.corners;
  const x = topLeft[0] + (topRight[0] - topLeft[0]) * u + (bottomLeft[0] - topLeft[0]) * v;
  const y = topLeft[1] + (topRight[1] - topLeft[1]) * u + (bottomLeft[1] - topLeft[1]) * v;
  await page.mouse.move(x, y); await page.waitForTimeout(750);
}
async function imageStats(page, id, coordinates, image) {
  const pose = (await diagnostics(page)).poses.find(pose => pose.id === id);
  return page.evaluate(async ({ image, coordinates, corners }) => {
    const picture = new Image(); picture.src = `data:image/png;base64,${image}`; await picture.decode();
    const canvas = document.createElement('canvas'); canvas.width = picture.width; canvas.height = picture.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(picture, 0, 0);
    const [bl, tl, , tr] = corners;
    return coordinates.map(([u, v]) => {
      const x = Math.round(tl[0] + (tr[0] - tl[0]) * u + (bl[0] - tl[0]) * v);
      const y = Math.round(tl[1] + (tr[1] - tl[1]) * u + (bl[1] - tl[1]) * v);
      const bytes = ctx.getImageData(x-2,y-2,5,5).data, channels=[0,0,0];
      for(let offset=0;offset<bytes.length;offset+=4)for(let c=0;c<3;c++)channels[c]+=bytes[offset+c];
      const rgb=channels.map(value=>value/25);
      return {uv:[u,v],rgb,luminance:rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722,chroma:Math.max(...rgb)-Math.min(...rgb)};
    });
  }, { image: image.toString('base64'), coordinates, corners: pose.corners });
}
async function perceptualDelta(page,id,before,after){
  const corners=(await diagnostics(page)).poses.find(pose=>pose.id===id).corners;
  return page.evaluate(async({before,after,corners})=>{
    async function decode(source){const image=new Image();image.src=`data:image/png;base64,${source}`;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);return{data:ctx.getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width}}
    const a=await decode(before),b=await decode(after),[bl,tl,,tr]=corners,changes=[];
    for(let v=.12;v<.9;v+=.02)for(let u=.12;u<.9;u+=.02){const x=Math.round(tl[0]+(tr[0]-tl[0])*u+(bl[0]-tl[0])*v),y=Math.round(tl[1]+(tr[1]-tl[1])*u+(bl[1]-tl[1])*v),offset=(y*a.width+x)*4;let delta=0;for(let c=0;c<3;c++)delta+=(b.data[offset+c]-a.data[offset+c])*[.2126,.7152,.0722][c];changes.push(Math.abs(delta));}
    changes.sort((a,b)=>a-b);return{samples:changes.length,mean:changes.reduce((a,b)=>a+b,0)/changes.length,p95:changes[Math.floor(changes.length*.95)],maximum:changes.at(-1)};
  },{before:before.toString('base64'),after:after.toString('base64'),corners});
}
async function staticFrames(page) {
  await page.waitForTimeout(1200);
  const a = await page.evaluate(() => __fidelityQA.raf), d = await diagnostics(page);
  await page.waitForTimeout(400);
  const b = await page.evaluate(() => __fidelityQA.raf), e = await diagnostics(page);
  assert.equal(a, b, 'RAF must stop after surface input settles'); assert.equal(d.background.fieldUpdates, e.background.fieldUpdates);
  return { raf: b, opticalUpdates: e.background.fieldUpdates, opticalTime: e.background.time };
}
let page;
try {
  page = await createPage();
  await check('unlit print removes baked coarse contour bands without flattening stamp alpha', async () => {
    const baseline = (await promisify(execFile)('git', ['show', '2345174:src/artwork.js'], { windowsHide: true })).stdout;
    const result = await page.evaluate(async baseline => {
      const oldModule = await import(`data:text/javascript;base64,${btoa(unescape(encodeURIComponent(baseline)))}`);
      const currentModule = await import('/src/artwork.js');
      const before = oldModule.createStampArtwork('craft'), after = currentModule.createStampArtwork('craft');
      const measure = canvas => {
        const ctx = canvas.getContext('2d'), data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let difference = 0, count = 0, sum = 0, squares = 0;
        for (let y = 0; y < 180; y++) for (let x = 1; x < 180; x++) {
          const p = ((y+350) * canvas.width + x+250) * 4, prior = p - 4;
          const luminance = p => data[p] * .2126 + data[p + 1] * .7152 + data[p + 2] * .0722;
          const value = luminance(p); difference += Math.abs(value - luminance(prior)); sum += value; squares += value * value; count++;
        }
        return { adjacentDifference: difference / count, standardDeviation: Math.sqrt(squares / count - (sum / count) ** 2), centerAlpha: data[(450*canvas.width+360)*4+3], notchAlpha: data[60*4+3] };
      };
      return { before: measure(before), after: measure(after), beforePng: before.toDataURL(), afterPng: after.toDataURL() };
    }, baseline);
    assert.ok(result.after.adjacentDifference < result.before.adjacentDifference * .85, JSON.stringify(result));
    assert.equal(result.after.centerAlpha, 255); assert.equal(result.after.notchAlpha, 0);
    for (const key of ['beforePng', 'afterPng']) await writeFile(join(out, `${key === 'beforePng' ? 'baseline' : 'current'}-unlit-artwork.png`), Buffer.from(result[key].split(',')[1], 'base64'));
    delete result.beforePng; delete result.afterPng; return result;
  });
  await check('default surface light changes actual stamp pixels while background remains identical', async () => {
    assert.equal((await diagnostics(page)).parameters.lightModel, 'surface');
    await configure(page, { tiltEnabled: false, hoverScale: 1, hoverLift: 0 });
    await focus(page, 'craft');
    const background = { x: 1050, y: 100, width: 180, height: 180 };
    await pointer(page, .2, .2); const a = await page.screenshot(), d = await diagnostics(page), paperA = await page.screenshot({ clip: background });
    await pointer(page, .8, .8); const b = await page.screenshot(), e = await diagnostics(page), paperB = await page.screenshot({ clip: background });
    assert.notEqual(hash(a), hash(b)); assert.equal(hash(paperA), hash(paperB));
    const visibility=await perceptualDelta(page,'craft',a,b);
    assert.ok(visibility.mean>=1.5&&visibility.p95>=6,`Pointer lighting must be perceptible, not only a changed hash: ${JSON.stringify(visibility)}`);
    assert.equal(d.background.fieldUpdates, 0); assert.equal(e.background.fieldUpdates, 0);
    const state = await staticFrames(page); await page.screenshot({ path: join(out, 'surface-craft-focus.png') });
    return { stampPixelsChanged: true, backgroundPixelsIdentical: true, noDappledPasses: true, visibility,state };
  });
  await check('NCS paper keeps white margins free of the old broad brown shadow multiply', async () => {
    await configure(page, { lightEnabled: false }); await pointer(page, .8, .2);
    const points = [[.04,.2],[.04,.4],[.04,.6],[.04,.8],[.96,.2],[.96,.4],[.96,.6],[.96,.8],[.3,.04],[.7,.96]];
    const unlit = await imageStats(page, 'craft', points, await page.screenshot());
    await configure(page, { lightEnabled: true }); await pointer(page, .8, .2);
    const lit = await imageStats(page, 'craft', points, await page.screenshot());
    const drops = lit.map((sample, index) => unlit[index].luminance - sample.luminance);
    assert.ok(Math.max(...drops) < 15, JSON.stringify({ unlit, lit, drops }));
    assert.ok(lit.every(sample => sample.luminance > 205), JSON.stringify(lit));
    return { unlit, lit, largestLuminanceDrop: Math.max(...drops) };
  });
  await check('surface pointer-follow switch and zero influence really freeze illumination', async () => {
    await configure(page,{tiltEnabled:false,hoverScale:1,hoverLift:0,lightFollowPointer:false}); await pointer(page,.2,.2); const a=await page.screenshot(); await pointer(page,.8,.8); const b=await page.screenshot();
    assert.equal(hash(a),hash(b));
    const stopped=(await diagnostics(page)).lightStates.find(entry=>entry.id==='craft').uv; assert.ok(Math.hypot(stopped[0]-.5,stopped[1]-.5)<.002,JSON.stringify(stopped));
    await configure(page,{lightFollowPointer:true,pointerInfluence:0}); await pointer(page,.2,.8); const c=await page.screenshot(); await pointer(page,.8,.2); const d=await page.screenshot();
    assert.equal(hash(c),hash(d));
    await configure(page,{pointerInfluence:DEFAULT_PARAMETERS.pointerInfluence}); await pointer(page,.8,.2);
    return{disabledTrackingPixelsStatic:true,zeroInfluencePixelsStatic:true,disabledUV:stopped};
  });
  await check('surface roughness and coating change real highlights and GPU uniforms', async () => {
    await configure(page,{surfaceCoat:1,surfaceShine:1,surfaceRoughness:.2}); await pointer(page,.7,.25); const a=await page.screenshot();
    await configure(page,{surfaceRoughness:.95,surfaceCoat:0}); const b=await page.screenshot(); assert.notEqual(hash(a),hash(b));
    const gpu=await page.evaluate(()=>Object.values(__fidelityQA.programs)); assert.ok(gpu.some(program=>Math.abs(program.uSurfaceRoughness-.95)<1e-6&&program.uSurfaceCoat===0));
    await configure(page,{surfaceCoat:DEFAULT_PARAMETERS.surfaceCoat,surfaceShine:DEFAULT_PARAMETERS.surfaceShine,surfaceRoughness:DEFAULT_PARAMETERS.surfaceRoughness});
    return{highlightPixelsChanged:true,roughnessGPU:.95,coatingGPU:0};
  });
  await check('all six stamps retain their print identity under light, with black Kensho ink preserved', async () => {
    const measurements=[];
    for(const id of ['craft','kensho','specimen','mint','gaohan','nocturne']) {
      await focus(page,id); await configure(page,{tiltEnabled:false,lightEnabled:false}); await pointer(page,.7,.25,id);
      const baseline=await page.screenshot();
      await configure(page,{lightEnabled:true}); await pointer(page,.7,.25,id); const lit=await page.screenshot();
      const corners=(await diagnostics(page)).poses.find(pose=>pose.id===id).corners;
      const statistics=await page.evaluate(async({before,after,corners})=>{
        async function decode(source){const image=new Image();image.src=`data:image/png;base64,${source}`;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);return{data:ctx.getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width}}
        const a=await decode(before),b=await decode(after),[bl,tl,,tr]=corners;
        let samples=0,delta=0,colored=0,chromaAligned=0,black=0,blackDelta=0,blackAfter=0;
        for(let v=.12;v<.9;v+=.013)for(let u=.12;u<.9;u+=.013){
          const x=Math.round(tl[0]+(tr[0]-tl[0])*u+(bl[0]-tl[0])*v),y=Math.round(tl[1]+(tr[1]-tl[1])*u+(bl[1]-tl[1])*v),offset=(y*a.width+x)*4;
          const rgbA=Array.from(a.data.slice(offset,offset+3)),rgbB=Array.from(b.data.slice(offset,offset+3));
          const luminance=rgb=>rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722,la=luminance(rgbA),lb=luminance(rgbB);
          delta+=Math.abs(lb-la);samples++;
          const max=Math.max(...rgbA),min=Math.min(...rgbA);
          if(max-min>20){colored++;const ac=rgbA.map(c=>c-la),bc=rgbB.map(c=>c-lb);if(ac.reduce((s,c,i)=>s+c*bc[i],0)>0)chromaAligned++;}
          if(la<55){black++;blackDelta+=Math.abs(lb-la);blackAfter+=lb;}
        }
        return{samples,meanLuminanceDelta:delta/samples,colored,chromaIdentity:colored?chromaAligned/colored:1,blackSamples:black,blackMeanDelta:black?blackDelta/black:0,blackMeanAfter:black?blackAfter/black:0};
      },{before:baseline.toString('base64'),after:lit.toString('base64'),corners});
      assert.ok(statistics.meanLuminanceDelta<22,`${id}: ${JSON.stringify(statistics)}`);
      assert.ok(statistics.chromaIdentity>.97,`${id} recolored the print: ${JSON.stringify(statistics)}`);
      if(id==='kensho'){assert.ok(statistics.blackSamples>50,JSON.stringify(statistics));assert.ok(statistics.blackMeanAfter<65,JSON.stringify(statistics));assert.ok(statistics.blackMeanDelta<12,JSON.stringify(statistics));await page.screenshot({path:join(out,'surface-kensho-focus.png')});}
      assert.equal(Object.hasOwn((await diagnostics(page)).parameters,'surfaceFinish'),false);
      measurements.push({id,...statistics});
    }
    await focus(page,'craft'); return{measurements,noFinishReplacementControl:true};
  });
  await check('explicit dappled mode remains live and returning to surface stops optical work', async () => {
    await page.locator('[data-parameter="lightModel"]').selectOption('dappled'); await pointer(page, .6, .35);
    const a = await diagnostics(page); await page.waitForTimeout(650); const b = await diagnostics(page);
    assert.ok(b.background.fieldUpdates > a.background.fieldUpdates);
    await page.locator('[data-parameter="lightModel"]').selectOption('surface'); await pointer(page, .6, .35);
    const state = await staticFrames(page), programs = await page.evaluate(() => Object.values(__fidelityQA.programs));
    assert.ok(programs.some(program => program.uLightModel === 0));
    return { dappledUpdates: b.background.fieldUpdates - a.background.fieldUpdates, surfaceRest: state };
  });
  await check('v1 saved custom numbers migrate to the new default surface finish and v2 key', async () => {
    const legacy = await createPage({}, { [LEGACY_STORAGE_KEY]: JSON.stringify({ version: 1, parameters: { focusTilt: 9.5, lightIntensity: .73, lightDensity: 21.2, lightColor: '#d6e2ab' } }) });
    const d = await diagnostics(legacy); assert.equal(d.parameters.lightModel, 'surface'); assert.equal(Object.hasOwn(d.parameters,'surfaceFinish'),false);
    assert.equal(d.parameters.focusTilt, 9.5); assert.equal(d.parameters.lightIntensity, .73); assert.equal(d.parameters.lightDensity, 21.2);
    const stored = await legacy.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    assert.equal(stored.version, PARAMETER_VERSION); assert.equal(stored.parameters.lightModel, 'surface');
    const factory = await createPage({}, { [LEGACY_STORAGE_KEY]: JSON.stringify({ version: 1, parameters: { focusTilt: 7.5, lightIntensity: .55, lightContrast: .18, surfaceShine: .25 } }) });
    const upgraded = await diagnostics(factory); assert.equal(upgraded.parameters.focusTilt,7.5);
    for(const key of ['lightIntensity','lightContrast','surfaceShine'])assert.equal(upgraded.parameters[key],DEFAULT_PARAMETERS[key],`old factory ${key} must upgrade`);
    const current = await factory.evaluate(key=>JSON.parse(localStorage.getItem(key)),STORAGE_KEY); assert.equal(current.appearanceRevision,2);
    return { version: stored.version, userValuesPreserved: true, newModelApplied: true, factoryTripletUpgraded:true,unrelatedCustomTiltPreserved:7.5,appearanceRevision:current.appearanceRevision };
  });
  await check('touch and reduced-motion surface paths remain functional', async () => {
    const mobile = await createPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await mobile.locator('[data-stamp="craft"]').tap(); await mobile.waitForFunction(() => __postalGallery.getDiagnostics().phase === 'focused');
    const box = await mobile.locator('[data-stamp="craft"]').boundingBox(), cdp = await mobile.context().newCDPSession(mobile);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width*.5, y: box.y + box.height*.5 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width*.7, y: box.y + box.height*.25 }] });
    await mobile.waitForTimeout(800); const touch = await diagnostics(mobile);
    assert.ok(touch.lightStates.find(entry => entry.id === 'craft').uv[0] > .6); assert.equal(touch.background.fieldUpdates, 0);
    await mobile.screenshot({ path: join(out, 'surface-mobile.png') });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const reduced = await createPage({ reducedMotion: 'reduce' }); await focus(reduced, 'craft'); await pointer(reduced, .8, .2);
    const a = await reduced.screenshot(), d = await diagnostics(reduced); await pointer(reduced, .2, .8); const b = await reduced.screenshot();
    assert.equal(hash(a), hash(b)); assert.deepEqual(d.lightStates.find(entry => entry.id === 'craft').uv, [.5,.5]); await staticFrames(reduced);
    return { actualTouchUV: touch.lightStates.find(entry => entry.id === 'craft').uv, reducedPixelsStatic: true };
  });
  await check('mode cycles reuse GPU assets and disposal releases normal textures too', async () => {
    await focus(page, 'craft'); await configure(page, { lightModel: 'dappled' }); await pointer(page,.5,.5); await configure(page,{lightModel:'surface'}); await pointer(page,.5,.5);
    const before = await diagnostics(page), created = await page.evaluate(() => __fidelityQA.createdTextures);
    for (let i=0;i<4;i++) { await configure(page,{lightModel:i%2?'surface':'dappled'}); await focus(page,i%2?'craft':'kensho'); }
    const after = await diagnostics(page); assert.deepEqual(before.materials,after.materials); assert.deepEqual(before.textures,after.textures); assert.equal(before.background.texture,after.background.texture);
    assert.equal(await page.evaluate(()=>__fidelityQA.createdTextures),created);
    const disposed = await page.evaluate(()=>{const api=__postalGallery,before=api.getDiagnostics();api.dispose();api.dispose();return{before,after:api.getDiagnostics(),texturesDeleted:__fidelityQA.deletedTextures,canvas:document.querySelectorAll('canvas').length}});
    assert.equal(disposed.canvas,0); assert.equal(disposed.after.renderer.textures,0); assert.ok(disposed.texturesDeleted >= 18);
    return { materialAndTextureIdentityStable: true, gpuTexturesBefore: disposed.before.renderer.textures, gpuTexturesAfter: disposed.after.renderer.textures, deletedTextures: disposed.texturesDeleted };
  });
  await check('console and WebGL compilation remain clean', async () => { assert.deepEqual(report.errors,[]); assert.deepEqual(report.warnings,[]);report.finalSourceSnapshot=await sourceFingerprint();assert.deepEqual(report.sourceSnapshot,report.finalSourceSnapshot,'Source changed during verification; HMR results cannot prove final state');return{errors:0,warnings:0,sourceStable:true}; });
} finally {
  report.finishedAt = new Date().toISOString(); report.result = report.checks.every(check=>check.result==='passed')?'passed':'failed';
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)); await Promise.all(contexts.map(context=>context.close())); await browser.close();
}
console.log(JSON.stringify({result:report.result,checks:report.checks.length,failed:report.checks.filter(check=>check.result==='failed').map(check=>check.name)},null,2));
if(report.result!=='passed')process.exitCode=1;
