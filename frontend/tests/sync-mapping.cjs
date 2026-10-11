const {openNavigation}=require('./navigation.cjs');const assert=require('node:assert/strict');const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage();let saved=null,invalid=false,account='123',failSave=true,writes=[],previews=[];
 const definitions=[{id:7,name:'Media grade',type:'dropdown'},{id:9,name:'Personal notes',type:'textarea'}];
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;const method=route.request().method();
  if(path==='/api/discogs/sync/fields')return route.fulfill({json:{account_id:account,username:'demo-owner',fields:definitions,saved_mapping:saved?.account_id===account&&!invalid?saved:null,saved_mapping_invalid:!!saved&&saved.account_id===account&&invalid}});
  if(path==='/api/discogs/sync/mapping'){
   const body=route.request().postDataJSON();writes.push({method,body});
   if(method==='PUT'&&failSave){failSave=false;return route.fulfill({status:503,json:{detail:'Saving failed. Try again.'}});}
   if(method==='PUT'){saved={...body};invalid=false;}else saved=null;
   return route.fulfill({json:{status:method==='PUT'?'saved':'forgotten'}});
  }
  if(path==='/api/discogs/sync/preview'){
   previews.push({method,body:method==='POST'?route.request().postDataJSON():null});
   return route.fulfill({json:{plan_id:'empty',username:'demo-owner',remote_count:0,actions:[],notices:[],expires_in_seconds:600}});
  }
  if(path==='/api/discogs/sync/apply')throw Error('Unexpected import');
  return route.fulfill({json:path==='/api/records'?[]:{}});
 });
 const open=async()=>{await openNavigation(page);await page.locator('#sync-open').click();await page.locator('#sync-fields-open').click();await page.waitForFunction(()=>!document.querySelector('#sync-field-preview').disabled);};
 try {
  await page.goto(base);await open();assert.equal(await page.locator('#sync-field-remember').isChecked(),false);assert.equal(await page.locator('#sync-field-forget').isVisible(),false);
  await page.locator('#sync-field-media_condition').selectOption('7');await page.locator('#sync-field-notes').selectOption('9');await page.locator('#sync-field-folders').check();await page.locator('#sync-field-remember').check();
  await page.locator('#sync-field-cancel').click();assert.equal(writes.length,0);await page.locator('#sync-fields-open').click();await page.waitForFunction(()=>!document.querySelector('#sync-field-preview').disabled);
  await page.locator('#sync-field-media_condition').selectOption('7');await page.locator('#sync-field-notes').selectOption('9');await page.locator('#sync-field-folders').check();await page.locator('#sync-field-remember').check();
  const initial=previews.length;await page.locator('#sync-field-preview').click();await page.locator('#sync-field-error').getByText('Saving failed. Try again.',{exact:true}).waitFor();assert.equal(previews.length,initial);assert.equal(await page.locator('#sync-field-preview').isDisabled(),false);
  await page.locator('#sync-field-preview').click();await page.waitForFunction(()=>!document.querySelector('#sync-field-dialog').open);assert.equal(saved.notes,9);assert.equal(saved.folder_locations,true);
  await page.locator('#sync-cancel').click();await page.reload();await open();assert.equal(previews.at(-1).method,'GET');assert.equal(await page.locator('#sync-field-notes').inputValue(),'9');assert.equal(await page.locator('#sync-field-folders').isChecked(),true);
  for(const theme of ['gallery','studio','listening']) {
   await page.locator('#sync-field-cancel').click();await page.locator('#sync-cancel').click();await page.locator('.theme-picker summary').click();await page.locator(`button[data-theme="${theme}"]`).click();await open();
   for(const [width,height] of [[320,700],[1024,600]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
   assert.match(await page.locator('#sync-field-saved').textContent(),/Saved choices loaded/);
  }
  await page.locator('#sync-field-cancel').click();await page.locator('#sync-cancel').click();account='456';await open();assert.equal(await page.locator('#sync-field-notes').inputValue(),'');assert.equal(await page.locator('#sync-field-remember').isChecked(),false);assert.equal(await page.locator('#sync-field-forget').isVisible(),false);
  await page.locator('#sync-field-cancel').click();await page.locator('#sync-cancel').click();account='123';invalid=true;await open();assert.equal(await page.locator('#sync-field-notes').inputValue(),'');assert.match(await page.locator('#sync-field-saved').textContent(),/changed or are missing/);
  await page.locator('#sync-field-forget').click();await page.locator('#sync-field-saved').getByText('Saved mapping forgotten. Current choices remain available for this session.',{exact:true}).waitFor();assert.equal(saved,null);assert.equal(writes.at(-1).method,'DELETE');assert.equal(writes.at(-1).body.account_id,'123');
  console.log('Saved sync mapping passed: explicit save/cancel, failure/retry, reload, no automatic imports, account isolation, stale definitions, forgetting and responsive themes.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
