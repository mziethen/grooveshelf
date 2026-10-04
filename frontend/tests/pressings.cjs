const {openRecordTools}=require('./navigation.cjs');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {join}=require('node:path');
const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{
 const {pressingMarkup}=await import(pathToFileURL(join(__dirname,'../pressings.js')).href);
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const metadata={discogs_master_id:42,discogs_release_id:100,original_year:1995,pressing_year:2008,country:'Germany',catalog_numbers:['CAT <script>alert(1)</script> '+ 'long'.repeat(40)],original_year_source_url:'https://www.discogs.com/master/42',metadata_status:'current'};
 assert.equal(pressingMarkup({},escape),'');assert.equal(pressingMarkup({...metadata,metadata_status:'unavailable'},escape),'');
 assert.equal(pressingMarkup({...metadata,metadata_expires_at:1},escape),'');
 assert(!pressingMarkup({...metadata,original_year_source_url:'javascript:alert(1)'},escape).includes('href='));
 const browser=await chromium.launch();const page=await browser.newPage();let id;
 try{
  const created=await page.request.post(base+'/api/records',{data:{inventory_number:'LP-88761',artist:'Pressing Artist',title:'Pressing Album',year:2009}});assert(created.ok());id=(await created.json()).id;
  const original=await(await page.request.get(base+'/api/records/'+id)).json();
  await page.route(base+'/api/records/'+id,async route=>{
   if(route.request().method()!=='GET')return route.continue();
   const response=await route.fetch();await route.fulfill({json:{...await response.json(),...metadata}});
  });
  await page.goto(base+'/#record/'+id);const section=page.locator('#detail-content .pressing-details');await section.waitFor();
  assert.equal(await section.locator('script').count(),0);assert((await section.textContent()).includes(metadata.catalog_numbers[0]));
  assert.equal(await section.getByRole('link').getAttribute('href'),metadata.original_year_source_url);
  for(const theme of ['gallery','studio','listening']){
   await page.evaluate(theme=>document.querySelector(`button[data-theme=${theme}]`).click(),theme);
   for(const viewport of [{width:390,height:844},{width:1024,height:600}]){
    await page.setViewportSize(viewport);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   }
  }
  await page.setViewportSize({width:390,height:844});await section.scrollIntoViewIfNeeded();await page.locator('#details').screenshot({path:'/tmp/grooveshelf-pressings-mobile.png'});
  await openRecordTools(page);await page.locator('#link-release').click();
  await page.route('**/api/metadata/discogs/releases/100',route=>route.fulfill({json:{...metadata,title:'Pressing Album',artist:'Pressing Artist',is_vinyl:true,year:2008,source_url:'https://www.discogs.com/release/100'}}));
  await page.locator('#release-id').fill('100');await page.locator('#release-load').click();await page.locator('#release-preview .pressing-details').waitFor();
  assert((await page.locator('#release-preview').textContent()).includes('1995'));assert(!await page.locator('#release-save').isDisabled());
  await page.locator('#release-cancel').click();await page.locator('#close-details').click();
  metadata.discogs_release_id=null;metadata.pressing_year=null;metadata.country='';metadata.catalog_numbers=[];
  await page.goto(base+'/#record/'+id);await page.reload();await section.getByText('Album linked; an exact pressing has not been selected. Reference release details do not identify your copy.',{exact:true}).waitFor();
  const after=await(await page.request.get(base+'/api/records/'+id)).json();assert.equal(after.year,original.year);assert.equal(after.play_count,original.play_count);assert.equal(after.nfc_uid,original.nfc_uid);
 }finally{if(id)await page.request.delete(base+'/api/records/'+id);await browser.close();}
 console.log('Pressing details: separate years, missing pressing, review, escaping and responsive themes passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
