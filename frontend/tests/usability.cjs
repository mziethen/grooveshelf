const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {openNavigation,openRecordTools}=require('./navigation.cjs');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{
 const browser=await chromium.launch();const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const record={id:'ui-review-copy',inventory_number:'LP-00001',artist:'The Evening Sessions',title:'A place for every record',format:'LP',year:2020,tracks:Array.from({length:40},(_,i)=>({position:'A'+(i+1),title:'A song for the evening '+(i+1),duration:'3:45'})),notes:'',genres:[],styles:[],labels:[],description:'',protected_fields:[],favorite:false,nfc_uid:null,play_count:0,metadata_status:'current',discogs_master_id:42,discogs_release_id:100,original_year:1995,pressing_year:2020,country:'Germany',catalog_numbers:['GS-001'],original_year_source_url:'https://www.discogs.com/master/42',source_url:'https://www.discogs.com/release/100'};
 let offline=true;const searches=[];
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url());let data=record;
  if(url.pathname==='/api/records'){
   const q=url.searchParams.get('q')||'';searches.push(q);
   if(offline)return route.fulfill({status:503,json:{detail:'Server temporarily unavailable'}});
   data=q&&!record.title.toLowerCase().includes(q.toLowerCase())?[]:[record];
  }else if(url.pathname.endsWith('/plays'))data=[];
  else if(url.pathname==='/api/capture/next-inventory')data={inventory_number:'LP-00002'};
  else if(url.pathname==='/api/capture/duplicates')data={matches:[],total:0};
  await route.fulfill({json:data});
 });
 try{
  await page.clock.install();await page.goto(base);
  await page.getByRole('heading',{name:'Your collection could not be loaded.'}).waitFor();
  assert.equal(await page.locator('#empty-add').count(),0);assert.equal(await page.locator('#count').textContent(),'Unavailable');
  offline=false;await page.locator('#retry-load').click();await page.locator('[data-record]').waitFor();assert(!await page.locator('#retry-load').isVisible());
  await page.locator('#search').fill('no match');await page.clock.runFor(250);await page.getByRole('heading',{name:'No matching records.'}).waitFor();
  await page.locator('#missing-nfc').check();await page.locator('#empty-clear').click();await page.locator('[data-record]').waitFor();
  assert.equal(await page.locator('#search').inputValue(),'');assert(!await page.locator('#missing-nfc').isChecked());
  assert(await page.locator('#search').evaluate(e=>e===document.activeElement));
  await page.locator('#search').fill('pending query');const count=searches.length;await page.locator('#clear-filters').click();await page.clock.runFor(300);await page.locator('[data-record]').waitFor();assert.deepEqual(searches.slice(count),['']);
  await page.locator('#search').fill('no cached match');await page.clock.runFor(250);await page.locator('#empty-clear').waitFor();
  offline=true;await page.locator('#empty-clear').click();await page.getByRole('heading',{name:'Your collection could not be loaded.'}).waitFor();
  assert.equal(await page.locator('#empty-add').count(),0,'A failed reset must not imply an empty collection');
  offline=false;await page.locator('#retry-load').click();await page.locator('[data-record]').waitFor();
  for(const theme of ['gallery','studio','listening']){
   await page.evaluate(theme=>document.querySelector(`button[data-theme=${theme}]`).click(),theme);
   for(const viewport of [{width:320,height:700},{width:390,height:844},{width:1024,height:600},{width:1440,height:900}]){
    await page.setViewportSize(viewport);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert(await page.locator('#missing-nfc').locator('..').evaluate(e=>e.getBoundingClientRect().height>=44));
    assert(await page.locator('#search').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16));
    if(viewport.width===1024){assert(await page.locator('#settings-open').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));}
   }
  }
  await page.setViewportSize({width:390,height:844});await openNavigation(page);
  assert(!await page.locator('#export-options').evaluate(e=>e.open));await page.locator('#export-options summary').focus();await page.keyboard.press('Enter');assert(await page.getByRole('link',{name:'Export archive',exact:true}).isVisible());
  await page.keyboard.press('Escape');await page.locator('[data-record]').click();await page.locator('#details').waitFor({state:'visible'});
  assert.equal(await page.locator('#details').getAttribute('aria-labelledby'),'detail-title');
  assert(!await page.locator('#delete').isVisible());
  assert(await page.locator('#record-tools').evaluate(e=>e.getBoundingClientRect().top<document.querySelector('.detail-tracks').getBoundingClientRect().top));
  assert(await page.locator('#edit').evaluate(e=>e.getBoundingClientRect().bottom<document.querySelector('.detail-tracks').getBoundingClientRect().top));
  assert(await page.locator('#personal-summary').evaluate(e=>e.getBoundingClientRect().top<document.querySelector('.detail-tracks').getBoundingClientRect().top));
  assert(await page.locator('.pressing-details').evaluate(e=>e.getBoundingClientRect().top<document.querySelector('.detail-tracks').getBoundingClientRect().top));
  await openRecordTools(page);await page.locator('#record-tools summary').focus();const refreshed=page.waitForResponse(r=>r.url()===base+'/api/records/'+record.id);
  await page.clock.runFor(61000);await refreshed;
  assert(await page.locator('#record-tools').evaluate(e=>e.open));assert(await page.locator('#record-tools summary').evaluate(e=>e===document.activeElement));
  await page.locator('.detail-tracks li').last().scrollIntoViewIfNeeded();
  assert(await page.locator('#close-details').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));
  await page.locator('#close-details').click();await page.locator('[data-record]').click();await page.locator('#details').waitFor({state:'visible'});assert(!await page.locator('#record-tools').evaluate(e=>e.open));
  await page.locator('#details').screenshot({path:'/tmp/grooveshelf-ui-review-detail.png'});await page.locator('#close-details').click();
  await page.locator('#add').click();await page.locator('#editor').waitFor({state:'visible'});
  assert(await page.locator('#record-form [name=artist]').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16));
  assert(await page.locator('#record-form [name=artist]').evaluate(e=>Boolean(e.compareDocumentPosition(document.querySelector('#discogs-tools'))&Node.DOCUMENT_POSITION_FOLLOWING)));
  const visibleSave=()=>page.locator('#save').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;});
  assert(await visibleSave());await page.locator('#record-form [name=notes]').fill('An unsaved note');assert(await visibleSave());
  assert(await page.locator('#record-form [name=notes]').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=document.querySelector('#editor .dialog-top').getBoundingClientRect().bottom&&r.bottom<=document.querySelector('.editor-actions').getBoundingClientRect().top;}),'Focused notes remain between the sticky header and save bar');
  assert(await page.getByRole('button',{name:'Close editor',exact:true}).evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));
  await page.getByRole('button',{name:'Close editor',exact:true}).click();
  await page.evaluate(()=>document.querySelector('button[data-theme=gallery]').click());
  if(await page.locator('#export-options').evaluate(e=>e.open)){await openNavigation(page);await page.locator('#export-options summary').click();await page.keyboard.press('Escape');}
  await page.clock.runFor(300);
  await page.screenshot({path:'/tmp/grooveshelf-ui-review-mobile.png'});
  await page.setViewportSize({width:1024,height:600});await page.screenshot({path:'/tmp/grooveshelf-ui-review-pi.png'});
  assert.deepEqual(errors,[]);
  console.log('Usability passed: actionable failure/reset, debounce cancellation, readable controls, Pi settings, keyboard disclosures, detail ordering/state/focus, sticky actions and all themes.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
