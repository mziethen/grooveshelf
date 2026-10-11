const {openNavigation}=require('./navigation.cjs');const assert=require('node:assert/strict');const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage();let attempts=0,done=false;
 const actions=[{id:'note',kind:'personal',copy_id:'copy',inventory_number:'LP-00001',title:'Demo album',instance_id:11,release_id:100,field:'notes',definition:{id:9,name:'Notes <field>',public:true},local_value:'',remote_value:'Remote <note>',remote_raw:'Remote <note>',export_value:'',source_url:'https://www.discogs.com/release/100'}, {id:'condition',kind:'personal',copy_id:'copy',inventory_number:'LP-00001',title:'Demo album',instance_id:11,release_id:100,field:'media_condition',definition:{id:7,name:'Media grade',public:false},local_value:'G',remote_value:'VG+',remote_raw:'Very Good Plus (VG+)',export_value:'Good (G)',source_url:'https://www.discogs.com/release/100'}, {id:'folder',kind:'personal',copy_id:'copy',inventory_number:'LP-00001',title:'Demo album',instance_id:11,release_id:100,field:'storage_location',definition:{id:5,name:'Jazz shelf'},local_value:'Shelf B',remote_value:'Jazz shelf',source_url:'https://www.discogs.com/release/100'}];
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/discogs/sync/preview')return route.fulfill({json:{plan_id:'fields-plan',username:'demo-owner',remote_count:1,expires_in_seconds:600,actions:done?[]:actions,notices:[]}});
  if(path==='/api/discogs/sync/apply'){
   attempts++;const body=route.request().postDataJSON();assert.equal(body.choice,'personal_export');assert.equal(body.confirmed,true);
   if(attempts===1)return route.fulfill({status:502,json:{detail:'Personal field update unconfirmed. Refresh the preview.'}});
   if(body.action_id==='condition')done=true;
   return route.fulfill({json:{status:'personal_exported',copy_id:'copy',field:body.action_id==='note'?'notes':'media_condition'}});
  }
  return route.fulfill({json:path==='/api/records'?[]:{}});
 });
 const select=async()=>{for(const id of ['note','condition'])await page.locator(`[data-action="${id}"] select`).selectOption('personal_export');};
 try {
  await page.goto(base);await openNavigation(page);await page.locator('#sync-open').click();
  for(const theme of ['gallery','studio','listening']) {
   await page.locator('#sync-cancel').click();await page.locator('.theme-picker summary').click();await page.locator(`button[data-theme="${theme}"]`).click();await openNavigation(page);await page.locator('#sync-open').click();
   await page.locator('[data-action="note"] select').waitFor();assert.equal(await page.locator('[data-action="note"] select').inputValue(),'skip');assert.equal(await page.locator('[data-action="folder"] option[value="personal_export"]').count(),0);
   await select();await page.locator('#sync-apply').click();assert.equal(attempts,0);assert.match(await page.locator('#sync-review-summary').textContent(),/2 personal field updates in Discogs \(demo-owner\)/);
   const text=await page.locator('#sync-review-items').textContent();assert.match(text,/Public field · Remote <note> → \(empty\)/);assert.match(text,/Private field · Very Good Plus \(VG\+\) → Good \(G\)/);assert.match(text,/Discogs instance 11/);assert.equal(await page.locator('#sync-review-items field, #sync-review-items note').count(),0);
   for(const [width,height] of [[320,700],[1024,600]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
   await page.locator('#sync-review-back').click();assert.equal(attempts,0);
  }
  await page.locator('#sync-apply').click();await page.locator('#sync-review-confirm').click();await page.locator('#sync-error').getByText('Sync stopped.',{exact:false}).waitFor();assert.equal(attempts,1);assert.match(await page.locator('#sync-error').textContent(),/may have reached Discogs/);assert.match(await page.locator('[data-action="condition"] .sync-result').textContent(),/Not attempted/);
  await page.locator('#sync-preview').click();await page.locator('[data-action="note"] select').waitFor();assert.equal(attempts,1);assert.equal(await page.locator('[data-action="note"] select').inputValue(),'skip');await select();await page.locator('#sync-apply').click();await page.locator('#sync-review-confirm').click();await page.locator('#sync-status').getByText('2 changes applied.',{exact:false}).waitFor();assert.equal(attempts,3);assert.match(await page.locator('[data-action="note"] .sync-result').textContent(),/Personal field updated in Discogs/);
  console.log('Personal export passed: exact text, clearing, destination/visibility review, independent fields, no folder export, cancel, unconfirmed results, fresh confirmation and responsive themes.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
