const {chromium}=require('C:/Users/Administrator/.codex/visualizations/2026/10/22/01a16437-65a1-7890-843d-46e69d56ce3f/scroll-audit-2026-10-23/node_modules/playwright');
const fs=require('node:fs');
const dir='docs/reference/web';
async function snap(page,name){await page.screenshot({path:`${dir}/${name}.png`});}
async function billState(page){return page.evaluate(()=>({time:performance.now(),bodyClass:document.body.className,bodyAttr:[...document.body.attributes].map(a=>[a.name,a.value]),stamps:[...document.querySelectorAll('[data-stamp-id]')].map(e=>{const p=e.querySelector('[class*="__paper"]'),s=getComputedStyle(e),r=e.getBoundingClientRect();return{id:e.dataset.stampId,rect:{x:r.x,y:r.y,w:r.width,h:r.height},transform:s.transform,filter:s.filter,opacity:s.opacity,style:e.getAttribute('style'),paper:p?{style:p.getAttribute('style'),transform:getComputedStyle(p).transform}:null}}),tooltips:[...document.querySelectorAll('[class*="tooltip"],[class*="stampViewBack"],[class*="stampView"],[class*="scrim"]')].map(e=>{const s=getComputedStyle(e);return{cls:e.className,text:e.textContent,opacity:s.opacity,style:e.getAttribute('style'),font:s.font,padding:s.padding,background:s.background,color:s.color,borderRadius:s.borderRadius}})}));}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome',args:['--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:900}}), log=[];
 page.on('pageerror',e=>log.push(String(e)));
 await page.goto('https://billguo.me/',{waitUntil:'domcontentloaded',timeout:45000}); await page.waitForTimeout(5000);
 await page.getByRole('button',{name:'View all stamps'}).click(); await page.waitForTimeout(2200); await snap(page,'bill-gallery');
 const states={gallery:await billState(page)};
 await page.locator('[data-stamp-id="ncs"]').hover({force:true}); await page.waitForTimeout(500); await snap(page,'bill-hover');states.hover=await billState(page);
 const start=Date.now(); await page.locator('[data-stamp-id="ncs"]').click({force:true});
 states.focusSamples=[];
 for(const t of [0,100,200,350,550,800,1200,1800]){await page.waitForTimeout(Math.max(0,start+t-Date.now())); states.focusSamples.push(await billState(page));if([200,550,1800].includes(t)) await snap(page,`bill-focus-${t}`);}
 states.focusText=await page.locator('body').innerText();await page.keyboard.press('Escape');await page.waitForTimeout(1500);await snap(page,'bill-return');states.return=await billState(page);states.errors=log;
 fs.writeFileSync(`${dir}/bill-interaction-measurements.json`,JSON.stringify(states,null,2));
 await page.setViewportSize({width:390,height:844});await page.reload({waitUntil:'domcontentloaded'});await page.waitForTimeout(4500);
 await snap(page,'bill-mobile-initial');states.mobileInitial=await billState(page);
 try{await page.getByRole('button',{name:'View all stamps'}).click({timeout:3000,force:true});await page.waitForTimeout(1500);await snap(page,'bill-mobile-gallery');states.mobile=await billState(page);}catch(e){states.mobileError=String(e)}
 fs.writeFileSync(`${dir}/bill-interaction-measurements.json`,JSON.stringify(states,null,2));console.log(JSON.stringify({gallery:states.gallery.stamps,hover:states.hover,focus:states.focusSamples.at(-1),focusText:states.focusText,errors:log,mobile:states.mobile?.stamps,mobileError:states.mobileError}));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
