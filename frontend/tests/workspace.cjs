const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{const browser=await chromium.launch();try{
 const page=await browser.newPage();const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
 const station={id:'wall',scan_sequence:0,session:null,unknown_uid:null,reader_status:'connected'};
 const record={id:'workspace-copy',inventory_number:'LP-00001',title:'An evening together',artist:'The Quartet',format:'LP',year:2020,tracks:[{position:'A1',title:'Opening',duration:'3:45'}],protected_fields:[],genres:[],styles:[],labels:[],notes:'',metadata_status:'current'};
 await page.route('**/api/**',route=>{const request=route.request();if(request.method()!=='GET')writes.push(request.url());const path=new URL(request.url()).pathname;route.fulfill({json:path==='/api/stations/wall'?station:path==='/api/records/workspace-copy'?record:path==='/api/records'?[record]:[]});});
 await page.goto(base+'?station=wall');await page.locator('[data-record]').waitFor();
 await page.locator('#mode-archive').click();assert.equal(await page.locator('#collection').getAttribute('class'),'table-wrap');
 await page.locator('#search').fill('evening');await page.waitForTimeout(250);
 await page.locator('#mode-listening').click();await page.locator('#listening-choice option[value="workspace-copy"]').waitFor({state:'attached'});await page.locator('#listening-choice').selectOption('workspace-copy');await page.locator('.listening-copy h2').waitFor();
 station.scan_sequence=1;station.session={copy_id:record.id,status:'pending',remaining_seconds:590,title:record.title};
 await page.waitForFunction(()=>document.querySelector('#station-feedback').textContent.includes('Tag recognized'));assert(!await page.locator('#details').evaluate(e=>e.open));
 assert.equal(await page.locator('.listening-copy h2').textContent(),record.title);await page.locator('.listening-tracklist summary').click();assert(await page.locator('.listening-tracklist').evaluate(e=>e.open));
 for(const theme of ['gallery','studio','listening']){await page.locator('.theme-picker summary').click();await page.locator(`button[data-theme=${theme}]`).click();assert(await page.locator('.listening-tracklist').evaluate(e=>e.open));for(const width of [390,800,1440]){await page.setViewportSize({width,height:700});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}}
 await page.locator('#mode-collection').click();assert.equal(await page.locator('#search').inputValue(),'evening');await page.locator('#nav-toggle').click();assert(await page.locator('#app-main').evaluate(e=>e.inert));await page.keyboard.press('Escape');assert(await page.locator('#nav-toggle').evaluate(e=>e===document.activeElement));assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 console.log('Workspace passed: modes, album selection, tracks, retained search, all themes, responsive layouts, drawer focus and no play writes.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
