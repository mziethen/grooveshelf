const {openNavigation}=require('./navigation.cjs');const assert=require('node:assert/strict');const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage();let attempts=0,done=false;
 const record={id:'copy-one',album_id:'album',inventory_number:'LP-00001',artist:'Demo Artist',title:'Demo Album',format:'LP',year:2000,tracks:[],notes:'Keep notes',genres:[],styles:[],labels:[],protected_fields:[],metadata_status:'manual',rating:2};
 const actions=[{id:'rate-one',kind:'rating',copy_id:'copy-one',inventory_number:'LP-00001',title:'Demo Album',instance_id:11,release_id:100,local_rating:2,remote_rating:5,source_url:'https://www.discogs.com/release/100'}, {id:'rate-two',kind:'rating',copy_id:'copy-two',inventory_number:'LP-00002',title:'Second copy',instance_id:12,release_id:100,local_rating:4,remote_rating:null,source_url:'https://www.discogs.com/release/100'}];
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/discogs/sync/preview')return route.fulfill({json:{plan_id:'ratings-plan',username:'demo-owner',remote_count:2,expires_in_seconds:600,actions:done?[]:actions,notices:[]}});
  if(path==='/api/discogs/sync/apply'){
   attempts++;const body=route.request().postDataJSON();assert.equal(body.choice,'rating_import');assert.equal(body.confirmed,true);
   if(attempts===1)return route.fulfill({status:409,json:{detail:'The Discogs copy or rating changed. Refresh the preview.'}});
   if(body.action_id==='rate-one')record.rating=5;else done=true;
   return route.fulfill({json:{status:'rating_imported',copy_id:body.action_id==='rate-one'?'copy-one':'copy-two',rating:body.action_id==='rate-one'?5:null}});
  }
  return route.fulfill({json:path==='/api/records'?[record]:path.endsWith('/plays')?[]:{}});
 });
 const choose=async()=>{for(const action of actions)await page.locator(`[data-action="${action.id}"] select`).selectOption('rating_import');};
 try {
  await page.goto(base);await openNavigation(page);await page.locator('#sync-open').click();
  for(const theme of ['gallery','studio','listening']) {
   await page.locator('#sync-cancel').click();await page.locator('.theme-picker summary').click();await page.locator(`button[data-theme="${theme}"]`).click();await openNavigation(page);await page.locator('#sync-open').click();
   await page.locator('[data-action="rate-one"] select').waitFor();assert.equal(await page.locator('[data-action="rate-one"] select').inputValue(),'skip');
   assert.match(await page.locator('[data-action="rate-two"]').textContent(),/GrooveShelf: 4\/5 · Discogs: Unrated/);
   await choose();await page.locator('#sync-apply').click();assert.equal(attempts,0);
   assert.match(await page.locator('#sync-review-summary').textContent(),/2 rating updates in GrooveShelf/);
   assert.match(await page.locator('#sync-review-items').textContent(),/2\/5 → 5\/5/);
   assert.match(await page.locator('#sync-review-items').textContent(),/4\/5 → Unrated/);
   for(const [width,height] of [[320,700],[1024,600]]) {await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
   await page.locator('#sync-review-back').click();assert.equal(attempts,0);assert.equal(await page.locator('[data-action="rate-one"] select').inputValue(),'rating_import');
  }
  await page.locator('#sync-apply').click();await page.locator('#sync-review-confirm').click();await page.locator('#sync-error').getByText('Sync stopped.',{exact:false}).waitFor();
  assert.equal(attempts,1);assert.equal(record.rating,2);assert.doesNotMatch(await page.locator('#sync-error').textContent(),/may have reached Discogs/);
  await page.locator('#sync-preview').click();await page.locator('[data-action="rate-one"] select').waitFor();await choose();await page.locator('#sync-apply').click();await page.locator('#sync-review-confirm').click();
  await page.locator('#sync-status').getByText('2 changes applied.',{exact:false}).waitFor();assert.equal(record.rating,5);assert.equal(attempts,3);assert.equal(record.notes,'Keep notes');
  assert.match(await page.locator('[data-action="rate-one"] .sync-result').textContent(),/Rating updated in GrooveShelf/);
  await page.locator('#sync-preview').click();await page.getByText('No additions are ready to synchronize.',{exact:true}).waitFor();assert.equal(attempts,3);
  console.log('Rating sync passed: per-copy values, explicit clearing, final review/cancel, fresh retry, local-only updates and responsive themes.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
