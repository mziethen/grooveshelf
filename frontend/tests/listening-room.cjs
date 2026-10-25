const assert=require('node:assert/strict');const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});const ids=[];const errors=[];const writes=[];
 page.on('pageerror',e=>errors.push(e.message));
 try {
  const tracks=[['A1','First Light','3:30'],['A2','Second Light','4:00'],['B1','Evening','5:00'],['B2','<Night & Day>','4:30']].map(([position,title,duration])=>({position,title,duration}));
  for(const data of [{inventory_number:'LP-78001',artist:'Room Artist',title:'Evening Side',year:1977,storage_location:'Shelf R',notes:'Play side B when it rains.',tracks},{inventory_number:'LP-78002',artist:'Room Artist',title:'Suggested Album'}]){
   const response=await page.request.post(base+'/api/records',{data});assert(response.ok());ids.push((await response.json()).id);
  }
  await page.route('**/api/**',route=>{if(route.request().method()!=='GET')writes.push(route.request().url());route.continue();});
  await page.goto(base);await page.evaluate(()=>{try{localStorage.removeItem('grooveshelf-listening-copy');localStorage.removeItem('grooveshelf-listening-spin');}catch{}});await page.reload();
  // Idle screen: clock and a suggestion that only opens the album view.
  await page.locator('#mode-listening').click();
  await page.locator('#listening-suggestion').waitFor({state:'visible'});
  assert.match(await page.locator('#listening-clock').textContent(),/\d/);
  assert(await page.locator('#listening-spin').isHidden());
  assert.equal(await page.locator('.listening-copy').count(),0);
  await page.locator('#listening-choice').selectOption(ids[0]);await page.locator('.listening-copy h2').getByText('Evening Side',{exact:true}).waitFor();
  // Sides: durations, default side and switching.
  assert.equal(await page.locator('[data-side-button=A]').textContent(),'Side A 8 min');assert.equal(await page.locator('[data-side-button=B]').textContent(),'Side B 10 min');
  assert.equal(await page.locator('[data-side-button=A]').getAttribute('aria-pressed'),'true');
  assert(!await page.locator('.listening-tracklist').evaluate(e=>e.open));
  await page.locator('[data-side-button=B]').click();
  assert(await page.locator('.listening-tracklist').evaluate(e=>e.open));
  assert.deepEqual(await page.locator('.listening-tracklist li:not([hidden]) .track-title').allTextContents(),['Evening','<Night & Day>']);
  assert.equal(await page.locator('.vinyl-side').textContent(),'SIDE B');
  assert.match(await page.locator('.listening-note').textContent(),/Play side B when it rains/);
  assert.match(await page.locator('.listening-history').textContent(),/Not played yet/);
  // Spin preference persists; ambient mode hides the chrome and Escape restores it.
  await page.locator('#listening-spin').click();assert(await page.evaluate(()=>document.body.classList.contains('listening-still')));
  assert.equal(await page.locator('#listening-spin').textContent(),'Let it spin');
  await page.locator('#listening-ambient').click();
  assert(await page.locator('.topbar').isHidden());assert(await page.locator('#listening-ambient-exit').evaluate(e=>e===document.activeElement));
  for(const [width,height] of [[800,480],[1440,900]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.keyboard.press('Escape');assert(await page.locator('.topbar').isVisible());assert(await page.locator('#listening-ambient-exit').isHidden());
  await page.locator('#listening-ambient').click();await page.locator('#listening-ambient-exit').click();assert(await page.locator('.topbar').isVisible());
  await page.locator('#listening-ambient').click();await page.evaluate(()=>document.querySelector('#mode-collection').click());assert(!await page.evaluate(()=>document.body.classList.contains('listening-ambient')));
  await page.reload();await page.locator('#mode-listening').click();await page.locator('.listening-copy h2').waitFor();
  assert(await page.evaluate(()=>document.body.classList.contains('listening-still')));
  assert.equal(await page.locator('[data-side-button=A]').getAttribute('aria-pressed'),'true');
  // Every appearance keeps the room readable and within the viewport.
  for(const theme of ['gallery','studio','listening','console']){
   await page.evaluate(theme=>document.querySelector(`button[data-theme=${theme}]`).click(),theme);
   for(const [width,height] of [[320,700],[390,844],[800,480],[1440,900]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  }
  const motion=await browser.newPage({reducedMotion:'reduce'});await motion.goto(base);await motion.locator('#mode-listening').click();await motion.locator('#listening-choice').selectOption(ids[0]);await motion.locator('.listening-vinyl').waitFor();
  assert.equal(await motion.locator('.listening-vinyl').evaluate(e=>getComputedStyle(e).animationName),'none');await motion.close();
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  console.log('Listening room passed: idle clock and suggestion, sides with durations, escaped tracks, notes, persistent spin, ambient mode and exit, four themes, Pi and phone sizes, reduced motion and no writes.');
 } finally {
  for(const id of ids)await page.request.delete(base+'/api/records/'+id);
  await browser.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
