const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{const browser=await chromium.launch();try{
 const page=await browser.newPage(),errors=[],queries=[];let reads=0,saves=0,mode='text',release,held;
 page.on('pageerror',e=>errors.push(e.message));
 const preview={discogs_master_id:42,title:'Evening sessions',artist:'The Quartet',tracks:[{position:'A1',title:'Opening'}],genres:[],styles:[],labels:[],images:[],source_url:'https://www.discogs.com/master/42'};
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  if(path==='/api/capture/cover-text'){
   reads++;assert.equal(request.headers()['content-type'],'image/png');
   if(mode==='held'){held=new Promise(resolve=>release=resolve);await held;}
   return route.fulfill(mode==='error'?{status:503,json:{detail:'Tesseract is unavailable. Search manually.'}}:{json:{text:mode==='empty'?'':'The Quartet <cover> Evening sessions'}});
  }
  if(path==='/api/metadata/discogs/text-search'){queries.push(url.searchParams.get('q'));return route.fulfill({json:{results:[{id:42,title:'The Quartet - Evening sessions',source_url:preview.source_url}],pages:1}});}
  if(path==='/api/metadata/discogs/masters/42')return route.fulfill({json:preview});
  if(path==='/api/settings')return route.fulfill({json:{confirm_import:false}});
  if(path==='/api/records'&&request.method()==='POST')saves++;
  return route.fulfill({json:path==='/api/records'?[]:path==='/api/capture/next-inventory'?{inventory_number:'LP-00001'}:path==='/api/capture/duplicates'?{matches:[],total:0}:{}});
 });
 const photo={name:'cover.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZxkAAAAASUVORK5CYII=','base64')};
 async function open(){await page.locator('#add').click();await page.locator('#cover-recognition summary').click();}
 await page.goto(base);await open();
 await page.locator('#recognition-file').setInputFiles({...photo,name:'bad.gif',mimeType:'image/gif'});assert(await page.locator('#recognition-read').isDisabled());assert.equal(reads,0);
 await page.locator('#recognition-file').setInputFiles(photo);await page.locator('#recognition-read').click();await page.locator('#recognition-review').waitFor();assert.equal(queries.length,0);assert.equal(saves,0);assert.equal(await page.locator('#recognition-text').inputValue(),'The Quartet <cover> Evening sessions');assert.equal(await page.locator('#record-form [name=artist]').inputValue(),'');
 await page.locator('#recognition-text').fill('The Quartet Evening sessions');await page.locator('#recognition-search').click();await page.locator('[data-master="42"]').click();await page.locator('#discogs-use').waitFor();assert.equal(await page.locator('#record-form [name=artist]').inputValue(),'');assert.deepEqual(queries,['The Quartet Evening sessions']);
 await page.locator('#discogs-use').click();assert.equal(await page.locator('#record-form [name=artist]').inputValue(),'The Quartet');assert.equal(saves,0);
 for(const theme of ['gallery','studio','listening']){await page.evaluate(t=>document.querySelector(`button[data-theme=${t}]`).click(),theme);for(const width of [320,390,1024]){await page.setViewportSize({width,height:700});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}}
 await page.getByRole('button',{name:'Close editor',exact:true}).click();await open();assert.equal(await page.locator('#recognition-file').inputValue(),'');assert(!await page.locator('#recognition-review').isVisible());
 await page.locator('#recognition-file').setInputFiles(photo);mode='error';await page.locator('#recognition-read').click();await page.getByText('Tesseract is unavailable. Search manually.',{exact:true}).waitFor();assert(!await page.locator('#recognition-read').isDisabled());
 mode='empty';await page.locator('#recognition-read').click();await page.locator('#recognition-review').waitFor();assert(await page.locator('#recognition-search').isDisabled());await page.locator('#recognition-text').fill('Manual correction');assert(!await page.locator('#recognition-search').isDisabled());
 mode='held';await page.locator('#recognition-read').click();await page.waitForFunction(()=>document.querySelector('#recognition-read').disabled);while(!release)await new Promise(resolve=>setTimeout(resolve,10));assert(await page.locator('#recognition-file').isDisabled());await page.getByRole('button',{name:'Close editor',exact:true}).click();await open();release();await page.waitForTimeout(100);assert(!await page.locator('#recognition-review').isVisible());assert.equal(await page.locator('#recognition-text').inputValue(),'');assert.equal(saves,0);assert.deepEqual(errors,[]);
 console.log('Cover recognition passed: validated upload, local OCR/error/retry, reviewed text, explicit search and album confirmation, no auto-save, empty text, stale responses, three themes and responsive layout.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
