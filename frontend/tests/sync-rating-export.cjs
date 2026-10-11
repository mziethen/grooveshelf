const {openNavigation}=require('./navigation.cjs');const assert=require('node:assert/strict');const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage();let attempts=0,done=false;
 const record={id:'copy-one',album_id:'album',inventory_number:'LP-00001',artist:'Demo Artist',title:'Demo Album',format:'LP',year:2000,tracks:[],notes:'Keep notes',genres:[],styles:[],labels:[],protected_fields:[],metadata_status:'manual',rating:null};
 const actions=[{id:'export-one',kind:'rating',copy_id:'copy-one',inventory_number:'LP-00001',title:'Demo Album',instance_id:11,release_id:100,local_rating:null,remote_rating:5,folder_id:5,can_export_rating:true,source_url:'https://www.discogs.com/release/100'}, {id:'import-only',kind:'rating',copy_id:'copy-two',inventory_number:'LP-00002',title:'Second copy',instance_id:12,release_id:100,local_rating:4,remote_rating:2,can_export_rating:false,source_url:'https://www.discogs.com/release/100'}];
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/discogs/sync/preview')return route.fulfill({json:{plan_id:'export-plan',username:'demo-owner',remote_count:2,expires_in_seconds:600,actions:done?[]:actions,notices:[]}});
  if(path==='/api/discogs/sync/apply'){
   attempts++;const body=route.request().postDataJSON();assert.equal(body.choice,'rating_export');assert.equal(body.confirmed,true);assert.equal(body.action_id,'export-one');
   if(attempts===1)return route.fulfill({status:502,json:{detail:'Rating update unconfirmed. Refresh the preview to check Discogs before choosing another update.'}});
   done=true;return route.fulfill({json:{status:'rating_exported',copy_id:record.id,rating:null}});
  }
  return route.fulfill({json:path==='/api/records'?[record]:{}});
 });
 try {
  await page.goto(base);await openNavigation(page);await page.locator('#sync-open').click();
  for(const theme of ['gallery','studio','listening']) {
   await page.locator('#sync-cancel').click();await page.locator('.theme-picker summary').click();await page.locator(`button[data-theme="${theme}"]`).click();await openNavigation(page);await page.locator('#sync-open').click();
   await page.locator('[data-action="export-one"] select').waitFor();assert.equal(await page.locator('[data-action="export-one"] select').inputValue(),'skip');
   assert.equal(await page.locator('[data-action="import-only"] option[value="rating_export"]').count(),0);
   await page.locator('[data-action="export-one"] select').selectOption('rating_export');await page.locator('#sync-apply').click();assert.equal(attempts,0);
   assert.match(await page.locator('#sync-review-summary').textContent(),/1 rating update in Discogs \(demo-owner\)/);
   assert.match(await page.locator('#sync-review-items').textContent(),/5\/5 → Unrated/);assert.match(await page.locator('#sync-review-items').textContent(),/Release 100 · Discogs instance 11/);
   for(const [width,height] of [[320,700],[1024,600]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
   await page.locator('#sync-review-back').click();assert.equal(attempts,0);
  }
  await page.locator('#sync-apply').click();await page.locator('#sync-review-confirm').click();await page.locator('#sync-error').getByText('Sync stopped.',{exact:false}).waitFor();assert.equal(attempts,1);assert.match(await page.locator('#sync-error').textContent(),/may have reached Discogs/);assert.equal(await page.locator('#sync-apply').isDisabled(),true);
  await page.locator('#sync-preview').click();await page.locator('[data-action="export-one"] select').waitFor();assert.equal(attempts,1);assert.equal(await page.locator('[data-action="export-one"] select').inputValue(),'skip');
  await page.locator('[data-action="export-one"] select').selectOption('rating_export');await page.locator('#sync-apply').click();await page.locator('#sync-review-confirm').click();await page.locator('#sync-status').getByText('1 change applied.',{exact:false}).waitFor();assert.equal(attempts,2);assert.match(await page.locator('[data-action="export-one"] .sync-result').textContent(),/Rating updated in Discogs/);assert.equal(record.rating,null);assert.equal(record.notes,'Keep notes');
  console.log('Rating export passed: explicit direction and clearing, destination/instance review, cancel, unconfirmed response, no automatic retry, fresh confirmation and responsive themes.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
