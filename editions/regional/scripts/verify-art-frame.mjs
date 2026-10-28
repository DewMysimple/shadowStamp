import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAMPS } from '../src/config.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const project = resolve(root, '../..');
const assetReports = join(root, 'artifacts/art-frame');
const out = resolve(root, process.env.VERIFY_OUTPUT || 'artifacts/frame-stability/integration');
await mkdir(out, { recursive: true });
const base = process.env.VERIFY_URL || 'http://127.0.0.1:4174/';
const report = { startedAt: new Date().toISOString(), base, checks: [], screenshots: [], errors: [], scope: 'Desktop frame integration, exact assets, real raycast categories, HDRI/display pipeline, existing stamp interactions and lifecycle. Mobile optimization excluded by user.' };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-unsafe-swiftshader'] });
let page, context;
const requests = [];
async function check(name, task) {
  try { const evidence = await task(); report.checks.push({ name, status: 'passed', evidence }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, status: 'failed', error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); await page?.screenshot({ path: join(out, `failure-${report.checks.length}.png`) }).catch(()=>{}); }
}
async function open(options = {}, failedAsset) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...options });
  await ctx.addInitScript(() => {
    const q = window.__frameQA = { callbacks: 0, contexts: 0, lutShaders: 0 };
    const seen = new WeakSet(), original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, attrs) { const result=original.call(this,type,attrs); if (/^webgl/.test(type) && result && !seen.has(result)) { seen.add(result); q.contexts++; } return result; };
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => raf(time => {
      q.callbacks++; callback(time);
      if(q.record && window.__postalGallery){const d=__postalGallery.getDiagnostics();q.frames.push({time,series:d.series,states:d.lightStates.map(s=>({id:s.id,opacity:s.opacity}))});}
    });
    const source = WebGL2RenderingContext.prototype.shaderSource;
    WebGL2RenderingContext.prototype.shaderSource = function(shader, text) { if (text.includes('uFrameDisplayLut')) q.lutShaders++; return source.call(this, shader, text); };
  });
  if (failedAsset) await ctx.route(`**/${failedAsset}`, route=>route.abort());
  const p = await ctx.newPage();
  p.on('pageerror', e=>report.errors.push(e.message));
  if (!failedAsset) p.on('console', m=>{if(m.type()==='error')report.errors.push(m.text());});
  p.on('request', req=>{if (/\.(exr|glb|png)(\?|$)/.test(req.url())) requests.push(req.url());});
  await p.goto(base,{waitUntil:'networkidle'});
  await p.waitForFunction(()=>Boolean(window.__postalGallery));
  if (!failedAsset) { await p.waitForFunction(()=>__postalGallery.getDiagnostics().artFrame.loaded, {}, {timeout:60000}); await p.waitForFunction(()=>__postalGallery.getDiagnostics().artFrame.categories.every(c=>c.reveal===1)); }
  return { ctx, p };
}
const diag = () => page.evaluate(()=>__postalGallery.getDiagnostics());
async function idle() { await page.mouse.move(1400, 820); await page.evaluate(()=>document.activeElement?.blur()); await page.waitForTimeout(1000); }
async function select(id) { const c=(await diag()).artFrame.categories.find(c=>c.id===id); await page.mouse.click(...c.screen); await page.waitForFunction(id=>__postalGallery.getDiagnostics().series===id,id); await page.waitForTimeout(650); }
async function visibleIds() { return page.locator('.stamp-hit').evaluateAll(nodes=>nodes.filter(node=>getComputedStyle(node).visibility!=='hidden' && getComputedStyle(node).pointerEvents!=='none').map(node=>node.dataset.stamp)); }
async function snap(name) { await page.screenshot({path:join(out,name)}); report.screenshots.push(name); }

await check('Original frame, source blend, HDRI, twelve print assets and original edition preserved', async()=>{
  const build=JSON.parse(await readFile(join(assetReports,'model-build.json'),'utf8'));
  for (const [name, expected] of Object.entries(build.source_hashes)) assert.equal(hash(await readFile(join('C:/Users/Administrator/Desktop/Modeling/相框/Models/ArtFrame_2to1',name))), expected);
  const originalHash=hash(await readFile(join(root,'public/models/art-frame-original.glb'))); assert.equal(originalHash, build.source_hashes['ArtFrame_2to1.glb']);
  const hdriSource='E:/数字媒体竞赛/张钧儒/lion/source/public/assets/environments/citrus_orchard_road_puresky_4k.exr';
  const hdriHash=hash(await readFile(hdriSource)); assert.equal(hash(await readFile(join(root,'public/environments/citrus-orchard-road-4k.exr'))),hdriHash);
  const paths=execFileSync('git',['ls-tree','-r','--name-only','8764e9b','--','src','public','index.html','package.json','package-lock.json','vite.config.js','runStart.cmd','runGo.cmd','scripts/start-edition.mjs'],{cwd:project,encoding:'utf8'}).trim().split('\n');
  for (const path of [...paths,...STAMPS.map(s=>'editions/regional/public'+s.image)]) {
    const actual=await readFile(join(project,path));
    const expected=execFileSync('git',['show',`8764e9b:${path}`],{cwd:project,maxBuffer:16*1024*1024});
    // Git stores launchers as LF; the existing Windows checkout uses CRLF.
    if(path.endsWith('.cmd')) assert.equal(actual.toString().replace(/\r\n/g,'\n'),expected.toString().replace(/\r\n/g,'\n'),path);
    else assert.equal(hash(actual),hash(expected),path);
  }
  const evidence={ originalHash, hdriHash, originalFiles:paths.length, stampImages:STAMPS.length, sourceUnchanged:true };
  await writeFile(join(out,'asset-preservation.json'),JSON.stringify(evidence,null,2)); return evidence;
});
await check('Five real mesh text nodes and small physical glyph scale',async()=>{
  const data=await readFile(join(root,'public/models/frame-typography.glb'));
  const gltf=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString());
  const names=['Title_Chinese','Title_English','Category_Guangdong','Category_China','Category_World'];
  for(const name of names){ const node=gltf.nodes.find(n=>n.name===name); assert.ok(node,name); assert.ok(gltf.accessors[gltf.meshes[node.mesh].primitives[0].attributes.POSITION].count>100); }
  const build=JSON.parse(await readFile(join(assetReports,'model-build.json'),'utf8'));
  const categories=build.objects.filter(o=>o.category);
  for(const object of categories){ assert.ok(object.world_dimensions_m[2]>.017 && object.world_dimensions_m[2]<.020); assert.ok(object.world_dimensions_m[1]>.001); const bounds=object.bounds_blender; assert.ok(bounds[0][2]>-.228 && bounds[1][2]<-.115); }
  return {names,categoryGlyphHeights:categories.map(o=>o.world_dimensions_m[2]),categoryThickness:categories[0].world_dimensions_m[1],verifiedGlyphs:build.glyphs.length};
});
await check('Actual runGo.cmd reuses the intended regional server',async()=>{
  const stdout=execFileSync('cmd.exe',['/d','/c','runGo.cmd'],{cwd:project,env:{...process.env,POSTAL_NO_OPEN:'1'},encoding:'utf8',timeout:15000});
  assert.match(stdout,/Reusing regional edition: http:\/\/127.0.0.1:4174/); return stdout.trim();
});
({ctx:context,p:page}=await open());
await check('Default Guangdong, one renderer, real HDRI and GPU display transform',async()=>{
  await idle(); const d=await diag();
  assert.equal(d.series,'guangdong'); assert.deepEqual(await visibleIds(),STAMPS.filter(s=>s.series==='guangdong').map(s=>s.id));
  assert.equal(await page.locator('.exhibition-canvas').count(),1);
  const q=await page.evaluate(()=>__frameQA); assert.equal(q.contexts,1); assert.ok(q.lutShaders>=2);
  assert.equal(d.artFrame.studio.hdri.width,4096); assert.equal(d.artFrame.studio.hdri.height,2048); assert.ok(d.artFrame.studio.hdri.loaded);
  assert.equal(d.artFrame.hiddenOriginalTexts.length,4); assert.ok(d.artFrame.hiddenOriginalTexts.every(t=>!t.visible));
  assert.equal(d.artFrame.studio.invisibleHitAreasCastShadows,false);
  assert.ok(d.artFrame.materials.every(m=>m.displayTransform));
  for (const mat of d.artFrame.materials) for(const map of mat.maps) if(map.name) assert.equal(map.colorSpace,map.key==='map'?'srgb':'');
  await snap('01-initial-guangdong.png'); return {q,studio:d.artFrame.studio,originalHidden:d.artFrame.hiddenOriginalTexts};
});
await check('Raycast hover and smooth normal-axis micro-motion on all three words',async()=>{
  const result=[];
  for(const id of ['guangdong','china','world']) {
    await idle(); const before=(await diag()).artFrame.categories.find(c=>c.id===id); await page.mouse.move(...before.screen); await page.waitForTimeout(350);
    const a=(await diag()).artFrame; const after=a.categories.find(c=>c.id===id);
    assert.equal(a.hovered,id); assert.ok(after.position[2]>before.position[2]+.001); assert.ok(after.scale>=1.03 && after.scale<=1.036);
    assert.equal(after.position[0],before.position[0]); assert.equal(after.position[1],before.position[1]);
    assert.equal(await page.locator('main').evaluate(n=>n.style.cursor),'pointer'); result.push({id,before:before.position,after:after.position});
    if(id==='china')await snap('02-hover-china.png');
  }
  return result;
});
await check('Three real text clicks update content, heading, count and unique selection',async()=>{
  for(const id of ['china','world','guangdong']) {
    await select(id); const d=await diag(); assert.equal(d.artFrame.selected,id);
    assert.deepEqual(await visibleIds(),STAMPS.filter(s=>s.series===id).map(s=>s.id));
    assert.equal(await page.locator('.frame-category-access[aria-pressed=true]').count(),1);
    assert.equal(await page.locator('[data-collection-count]').textContent(),'04 / 12');
    if(id==='china')await snap('03-selected-china.png'); if(id==='world')await snap('04-selected-world.png');
  } return {categories:3,stamps:12};
});
await check('Category transition fades old set before staggered new entries',async()=>{
  const pos=(await diag()).artFrame.categories.find(c=>c.id==='china').screen;
  await page.evaluate(()=>{__frameQA.record=true;__frameQA.frames=[];});
  await page.mouse.click(...pos);
  await page.waitForFunction(()=>__postalGallery.getDiagnostics().lightStates.find(s=>s.id==='hongkong').opacity===1);
  const frames=await page.evaluate(()=>{__frameQA.record=false;return __frameQA.frames;});
  await writeFile(join(out,'category-transition.json'),JSON.stringify(frames,null,2));
  const incoming=['beijing','tianyang','quanzhou','hongkong']; const outgoing=['foshan','guangzhou','heshan','suixi'];
  assert.ok(frames.some(f=>f.states.find(s=>s.id===incoming[0]).opacity>.2&&f.states.find(s=>s.id===incoming[3]).opacity<.15));
  assert.ok(frames.filter(f=>f.states.find(s=>s.id===incoming[0]).opacity>.05).every(f=>outgoing.every(id=>f.states.find(s=>s.id===id).opacity<.01)));
  await page.waitForTimeout(400); return {frames:frames.length,staggerObserved:true};
});
await check('Rapid category clicks finish with the last chosen category',async()=>{
  for(const id of ['world','china','world','guangdong','china','guangdong','world']){const c=(await diag()).artFrame.categories.find(c=>c.id===id);await page.mouse.click(...c.screen);}
  await page.waitForTimeout(700); const d=await diag(); assert.equal(d.series,'world'); assert.equal(d.artFrame.selected,'world'); assert.deepEqual(await visibleIds(),STAMPS.filter(s=>s.series==='world').map(s=>s.id)); return {series:d.series};
});
await check('Photo and blank frame clicks do not act as category buttons',async()=>{
  const d=await diag(),v=d.artFrame.viewport; await page.mouse.click(v.x+v.width*.5,v.y+v.height*.45); await page.waitForTimeout(100); assert.equal((await diag()).series,d.series); return {series:d.series};
});
await check('Accessible keyboard focus, arrow navigation and Enter selection',async()=>{
  await page.getByRole('button',{name:'选择广东邮票',exact:true}).focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'选择中国邮票'); await page.keyboard.press('Enter');
  await page.waitForFunction(()=>__postalGallery.getDiagnostics().series==='china'); await page.waitForTimeout(650); assert.equal((await diag()).artFrame.selected,'china');
  await page.keyboard.press('End'); assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'选择世界邮票'); return {keyboard:true};
});
await check('Existing warm stamp hover, focus, details and Escape return',async()=>{
  await idle(); const initial=await diag(); const button=page.locator('[data-stamp=beijing]'); await button.hover(); await page.waitForTimeout(300);
  assert.ok((await diag()).lightStates.find(s=>s.id==='beijing').amount>.9);
  await button.click(); await page.waitForFunction(()=>__postalGallery.getDiagnostics().phase==='focused');
  await snap('05-stamp-focus.png'); assert.equal(await page.locator('.focus-detail h2').textContent(),'京华太狮');
  await page.keyboard.press('Escape'); await page.waitForFunction(()=>!__postalGallery.getDiagnostics().selected); await idle();
  assert.equal((await diag()).series,'china'); assert.deepEqual((await diag()).artFrame.roots,initial.artFrame.roots);
  assert.deepEqual((await diag()).materials,initial.materials); assert.deepEqual((await diag()).textures,initial.textures); return {focus:true,return:true,assetsReused:true};
});
await check('Six lighting algorithms and saved parameter controls remain available',async()=>{
  await page.locator('.parameter-launcher').click(); const selectControl=page.locator('[data-parameter=lightAlgorithm]'); assert.equal(await selectControl.locator('option').count(),6);
  await selectControl.selectOption('soft-light'); await page.waitForFunction(()=>__postalGallery.getDiagnostics().parameters.lightAlgorithm==='soft-light');
  await page.reload({waitUntil:'networkidle'}); await page.waitForFunction(()=>window.__postalGallery?.getDiagnostics().artFrame.loaded); assert.equal((await diag()).parameters.lightAlgorithm,'soft-light');
  await page.locator('.parameter-launcher').click(); await page.locator('[data-parameter=lightAlgorithm]').selectOption('local-add'); await page.locator('.parameter-launcher').click(); await idle(); return {algorithms:6,persisted:true};
});
await check('Resizing common desktop displays preserves frame and nonoverlapping stamp ratios',async()=>{
  const sizes=[[1024,768],[1280,720],[1440,900],[1920,1080],[2560,1440]];
  for(const [width,height]of sizes){await page.setViewportSize({width,height});await page.waitForTimeout(350);const d=await diag(),v=d.artFrame.viewport;
    for(const [x,y]of d.artFrame.frameCorners){assert.ok(x>=v.x&&x<=v.x+v.width);assert.ok(y>=v.y&&y<=v.y+v.height);}
    const active=d.poses.filter(p=>STAMPS.find(s=>s.id===p.id).series===d.series); for(const pose of active) for(const [x,y]of pose.corners){assert.ok(x>v.x+v.width&&x<width);assert.ok(y>195&&y<height-65);}
    assert.ok(Math.abs(d.artFrame.modelSizeM[0]/d.artFrame.modelSizeM[1]-2)<.005);
    if(width===1920){await snap('06-desktop-1920.png');await page.screenshot({path:join(out,'07-frame-closeup.png'),clip:v});report.screenshots.push('07-frame-closeup.png');}
  }await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(200);return sizes;
});
await check('Warmed categories reuse GPU resources and never reload models, HDRI or images',async()=>{
  for(const id of ['china','world','guangdong'])await select(id);await idle();const before=await diag(),requestCount=requests.length;
  for(const id of ['world','guangdong','china','world','guangdong'])await select(id);await idle();const after=await diag();
  assert.deepEqual(after.materials,before.materials);assert.deepEqual(after.textures,before.textures);assert.deepEqual(after.artFrame.roots,before.artFrame.roots);assert.deepEqual(after.renderer,before.renderer);assert.equal(requests.length,requestCount);return {requests:requestCount,renderer:after.renderer};
});
await check('Idle scene sleeps and the frame has no continuous floating animation',async()=>{
  await idle();const a=await page.evaluate(()=>__frameQA.callbacks),pose=(await diag()).artFrame.categories.map(c=>c.position);await page.waitForTimeout(300);
  const b=await page.evaluate(()=>__frameQA.callbacks);assert.ok(b-a<=1);assert.deepEqual((await diag()).artFrame.categories.map(c=>c.position),pose);return {idleCallbacks:b-a};
});
await check('Frame and original print shaders have no new browser errors',async()=>{assert.deepEqual(report.errors,[]);await writeFile(join(out,'runtime-diagnostics.json'),JSON.stringify(await diag(),null,2));return {errors:0};});
await check('Gallery teardown releases its canvas and animation clock',async()=>{
  await page.evaluate(()=>__postalGallery.dispose());assert.equal(await page.locator('.exhibition-canvas').count(),0);const a=await page.evaluate(()=>__frameQA.callbacks);await page.waitForTimeout(200);assert.ok((await page.evaluate(()=>__frameQA.callbacks))-a<=1);return {disposed:true};
});
await context.close();
await check('Reduced-motion keeps text stable and disables continuous movement',async()=>{
  ({ctx:context,p:page}=await open({reducedMotion:'reduce'}));await idle();const d=await diag();assert.ok(d.reducedMotion);assert.ok(d.artFrame.categories.every(c=>c.reveal===1));
  const a=await page.evaluate(()=>__frameQA.callbacks);await page.waitForTimeout(200);assert.ok((await page.evaluate(()=>__frameQA.callbacks))-a<=1);await context.close();return {reducedMotion:true};
});
await check('HDRI failure gives a clear message and usable category fallback',async()=>{
  ({ctx:context,p:page}=await open({},'citrus-orchard-road-4k.exr'));await page.waitForSelector('.frame-unavailable');assert.equal(await page.locator('.frame-category-access:visible').count(),3);
  await page.getByRole('button',{name:'选择中国邮票',exact:true}).click();await page.waitForFunction(()=>__postalGallery.getDiagnostics().series==='china');await page.waitForTimeout(650);assert.deepEqual(await visibleIds(),STAMPS.filter(s=>s.series==='china').map(s=>s.id));await context.close();return {message:true,categoriesUsable:true};
});
await browser.close();report.finishedAt=new Date().toISOString();report.passed=report.checks.every(c=>c.status==='passed');await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
console.log(`${report.checks.filter(c=>c.status==='passed').length}/${report.checks.length} passed`);if(!report.passed)process.exitCode=1;
