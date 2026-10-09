const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {openNavigation}=require('./navigation.cjs');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{const browser=await chromium.launch();try{
 const context=await browser.newContext();const page=await context.newPage();const writes=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 const record={id:'startup-copy',inventory_number:'LP-00001',artist:'The Quartet',title:'Evening',year:2020,format:'LP',tracks:[],genres:[],styles:[],labels:[],notes:'',protected_fields:[],metadata_status:'manual'};
 let exists=true;
 const mock=route=>{const req=route.request(),path=new URL(req.url()).pathname;if(req.method()!=='GET')writes.push(path);route.fulfill({json:path==='/api/settings'?{automatic_refresh:true,confirm_import:true,show_expired_metadata:false}:path==='/api/records/startup-copy'?record:path==='/api/records'?(exists?[record]:[]):path.endsWith('/events')?[]:{}});};
 await context.route('**/api/**',mock);await page.goto(base);await page.locator('#collection [data-record]').waitFor();
 await openNavigation(page);await page.locator('#settings-open').click();await page.locator('#settings-save').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#settings-save').disabled);await page.locator('[name=startup_view]').selectOption('listening');await page.locator('#settings-save').click();await page.getByText('Settings saved.',{exact:true}).waitFor();await page.locator('#settings-close').click();await page.reload();await page.locator('#listening-screen').waitFor({state:'visible'});await page.locator('#listening-choice').selectOption(record.id);await page.locator('.listening-copy h2').waitFor();await page.reload();await page.locator('.listening-copy h2').waitFor();assert.equal(await page.locator('#listening-choice').inputValue(),record.id);assert.equal(await page.locator('#mode-listening').getAttribute('aria-pressed'),'true');
 await page.goto(base+'/#record/'+record.id);await page.reload();await page.locator('#details').waitFor({state:'visible'});assert.notEqual(await page.locator('#mode-listening').getAttribute('aria-pressed'),'true');await page.locator('#close-details').click();
 const other=await browser.newPage();await other.route('**/api/**',mock);await other.goto(base);await other.locator('#library-screen').waitFor({state:'visible'});assert.equal(await other.locator('#mode-collection').getAttribute('aria-pressed'),'true');await other.close();
 exists=false;await page.goto(base);await page.locator('#listening-screen').waitFor({state:'visible'});assert.equal(await page.locator('.listening-copy').count(),0);assert.deepEqual(writes,['/api/settings']);assert.deepEqual(errors,[]);console.log('Startup passed: saved per browser, remembered copy, record-link precedence, missing-copy fallback and no play writes.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
