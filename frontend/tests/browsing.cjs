const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{const browser=await chromium.launch();try{
 const page=await browser.newPage();const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
 const station={id:'browse',scan_sequence:0,session:null,unknown_uid:null,reader_status:'connected'};
 const records=[
  {id:'browse-a',inventory_number:'LP-00003',artist:'Zulu',title:'Alpha',year:null,favorite:true,genres:['Jazz & Soul'],storage_location:'Shelf "A"'},
  {id:'browse-b',inventory_number:'LP-00001',artist:'Alpha',title:'Zulu',year:2022,favorite:false,genres:['Rock'],storage_location:'Shelf B'},
  {id:'browse-c',inventory_number:'LP-00002',artist:'Alpha',title:'Bravo',year:1994,favorite:true,genres:['Jazz & Soul'],storage_location:'Shelf "A"'},
 ].map(r=>({...r,format:'LP',tracks:[],notes:'',protected_fields:[],metadata_status:'manual'}));
 await page.route('**/api/**',route=>{if(route.request().method()!=='GET')writes.push(route.request().url());const url=new URL(route.request().url()),q=(url.searchParams.get('q')||'').toLowerCase();const record=records.find(r=>url.pathname==='/api/records/'+r.id);route.fulfill({json:url.pathname==='/api/stations/browse'?station:record||records.filter(r=>(r.title+' '+r.artist).toLowerCase().includes(q))});});
 await page.goto(base+'?station=browse');await page.locator('#collection [data-record]').first().waitFor();
 const ids=()=>page.locator('#collection [data-record]').evaluateAll(nodes=>nodes.map(n=>n.dataset.record));
 assert.deepEqual(await ids(),['browse-b','browse-c','browse-a']);
 const card=await page.locator('#collection [data-record]').first().elementHandle(), option=await page.locator('#filter-genre option').last().elementHandle();await page.locator('#collection-sort').focus();station.scan_sequence++;await page.waitForTimeout(1400);assert(await card.evaluate(e=>e===document.querySelector('#collection [data-record]')));assert(await option.evaluate(e=>e===document.querySelector('#filter-genre option:last-child')));assert(await page.locator('#collection-sort').evaluate(e=>e===document.activeElement));
 for(const [order,expected] of [['artist',['browse-c','browse-b','browse-a']],['artist-desc',['browse-a','browse-c','browse-b']],['title',['browse-a','browse-c','browse-b']],['title-desc',['browse-b','browse-c','browse-a']],['year',['browse-c','browse-b','browse-a']],['year-desc',['browse-b','browse-c','browse-a']],['inventory-desc',['browse-a','browse-c','browse-b']]]){await page.locator('#collection-sort').selectOption(order);assert.deepEqual(await ids(),expected);}
 await page.locator('#filter-favorites').check();await page.locator('#filter-genre').selectOption('Jazz & Soul');await page.locator('#filter-location').selectOption('Shelf "A"');await page.locator('#missing-tracks').check();assert.deepEqual(await ids(),['browse-a','browse-c']);
 await page.locator('#search').fill('Zulu');await page.waitForFunction(()=>document.querySelector('#count').textContent==='1 of 2 records match');
 assert.deepEqual(await ids(),['browse-a']);await page.locator('#mode-archive').click();assert.deepEqual(await ids(),['browse-a']);assert.equal(await page.locator('#filter-location').inputValue(),'Shelf "A"');
 await page.locator('#search').fill('no-match');await page.locator('#empty-clear').waitFor();await page.locator('#empty-clear').click();await page.waitForFunction(()=>document.querySelectorAll('#collection [data-record]').length===3);assert(!await page.locator('#filter-favorites').isChecked());assert.equal(await page.locator('#filter-genre').inputValue(),'');assert.equal(await page.locator('#collection-sort').inputValue(),'inventory-desc');
 await page.reload();assert.equal(await page.locator('#collection-sort').inputValue(),'inventory-desc');
 for(const theme of ['gallery','studio','listening']){await page.locator('.theme-picker summary').click();await page.locator(`button[data-theme=${theme}]`).click();for(const width of [320,390,800,1024]){await page.setViewportSize({width,height:600});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}}
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log('Browsing passed: all sorts, missing years, combined filters/search, escaped values, workspace preservation/reset, persisted order and responsive themes.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
