const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{const browser=await chromium.launch();try{
 const page=await browser.newPage(),errors=[],providerCalls=[],writes=[];let mode='match',release;
 page.on('pageerror',e=>errors.push(e.message));
 const record={id:'saved-copy',inventory_number:'LP-00001',title:'Cover <without text>',artist:'The Quartet',format:'LP',tracks:[],genres:[],styles:[],labels:[],credits:[],protected_fields:[],metadata_status:'manual',notes:'',play_count:0};
 await page.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;
  if(path.startsWith('/api/metadata'))providerCalls.push(path);
  if(path==='/api/capture/cover-matches'){
   if(mode==='held')await new Promise(resolve=>release=resolve);
   return route.fulfill(mode==='error'?{status:429,json:{detail:'Another cover comparison is running.'}}:{json:{matches:mode==='empty'?[]:[record],total_matches:mode==='empty'?0:1,compared:3,unavailable:2,incomplete:mode==='partial'}});
  }
  if(path==='/api/records'&&req.method()!=='GET')writes.push(path);
  return route.fulfill({json:path==='/api/records'?[record]:path==='/api/records/saved-copy'?record:path==='/api/capture/next-inventory'?{inventory_number:'LP-00002'}:path==='/api/capture/duplicates'?{matches:[],total:0}:[]});
 });
 const photo={name:'art.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZxkAAAAASUVORK5CYII=','base64')};
 async function open(){await page.locator('#add').click();await page.locator('#cover-recognition summary').click();await page.locator('#recognition-file').setInputFiles(photo);}
 await page.goto(base);await open();await page.locator('#recognition-match').click();await page.locator('[data-open-match]').waitFor();assert((await page.locator('#recognition-matches').textContent()).includes('Cover <without text>'));assert.equal(writes.length,0);assert.deepEqual(providerCalls,[]);assert.equal(await page.locator('#record-form [name=title]').inputValue(),'');
 for(const theme of ['gallery','studio','listening']){await page.evaluate(t=>document.querySelector(`button[data-theme=${t}]`).click(),theme);for(const width of [320,390,1024]){await page.setViewportSize({width,height:700});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}}
 await page.locator('[data-open-match]').click();await page.locator('#details').waitFor();assert.equal(await page.evaluate(()=>location.hash),'#record/saved-copy');assert(!await page.locator('#editor').evaluate(e=>e.open));assert.equal(writes.length,0);await page.getByRole('button',{name:'Close details',exact:true}).click();
 await open();assert.equal(await page.locator('[data-open-match]').count(),0);mode='error';await page.locator('#recognition-match').click();await page.getByText('Another cover comparison is running.',{exact:true}).waitFor();assert(!await page.locator('#recognition-match').isDisabled());
 mode='empty';await page.locator('#recognition-match').click();await page.getByText('No similar saved covers found.',{exact:false}).waitFor();assert.equal(await page.locator('[data-open-match]').count(),0);
 mode='partial';await page.locator('#recognition-match').click();await page.getByText('Compared 3 saved covers.',{exact:false}).waitFor();assert((await page.locator('#recognition-status').textContent()).includes('processing limit'));
 mode='held';await page.locator('#recognition-match').click();while(!release)await new Promise(resolve=>setTimeout(resolve,10));assert(await page.locator('#recognition-read').isDisabled());await page.getByRole('button',{name:'Close editor',exact:true}).click();await open();release();await page.waitForTimeout(100);assert.equal(await page.locator('[data-open-match]').count(),0);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 console.log('Local cover matching passed: reviewed LP suggestions, escaping, no provider calls/writes, explicit open, reset, retry, empty/partial results, stale responses and responsive themes.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
