const {openNavigation}=require('./navigation.cjs');const assert=require('node:assert/strict');const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage();let applied=[],mappedRequests=[],done=false,failFields=true;
 const record={id:'copy-one',album_id:'album',inventory_number:'LP-00001',artist:'Demo Artist',title:'Demo Album',format:'LP',year:2000,tracks:[],notes:'My local note',rating:2,media_condition:'G',sleeve_condition:'VG',genres:[],styles:[],labels:[],protected_fields:[],metadata_status:'manual'};
 const definitions=[{id:7,name:'Media <grade>',type:'dropdown'},{id:8,name:'Sleeve grade',type:'dropdown'},{id:9,name:'Private notes',type:'textarea'}];
 const personal=['media_condition','sleeve_condition','notes'].map((field,index)=>({id:field,kind:'personal',copy_id:record.id,inventory_number:record.inventory_number,title:record.title,instance_id:11,release_id:100,field,definition:definitions[index],local_value:record[field],remote_value:['VG+','Generic',''][index],source_url:'https://www.discogs.com/release/100'}));
 const rating={id:'rating',kind:'rating',copy_id:record.id,inventory_number:record.inventory_number,title:record.title,instance_id:11,release_id:100,local_rating:2,remote_rating:5,source_url:'https://www.discogs.com/release/100'};
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/discogs/sync/fields'){
   if(failFields){failFields=false;return route.fulfill({status:503,json:{detail:'Discogs access was denied. Check the token.'}});}
   return route.fulfill({json:{account_id:'123',username:'demo-owner',fields:definitions}});
  }
  if(path==='/api/discogs/sync/preview'){
   const mapped=route.request().method()==='POST';if(mapped)mappedRequests.push(route.request().postDataJSON());
   return route.fulfill({json:{plan_id:'personal-plan',username:'demo-owner',remote_count:1,expires_in_seconds:600,notices:[],actions:done?[]:mapped?[rating,...personal]:[rating]}});
  }
  if(path==='/api/discogs/sync/apply'){
   const body=route.request().postDataJSON();assert.equal(body.confirmed,true);applied.push(body);
   if(body.choice==='rating_import')record.rating=5;else {assert.equal(body.choice,'personal_import');record[body.action_id]=personal.find(a=>a.id===body.action_id).remote_value;}
   if(applied.length===4)done=true;
   return route.fulfill({json:{status:body.choice==='rating_import'?'rating_imported':'personal_imported',copy_id:record.id}});
  }
  return route.fulfill({json:path==='/api/records'?[record]:path.endsWith('/plays')?[]:{}});
 });
 const map=async()=>{
  await page.locator('#sync-fields-open').click();await page.waitForFunction(()=>!document.querySelector('#sync-field-preview').disabled);
  for(const [field,id] of [['media_condition',7],['sleeve_condition',8],['notes',9]])await page.locator('#sync-field-'+field).selectOption(String(id));
  await page.locator('#sync-field-preview').click();await page.locator('[data-action="notes"]').waitFor();
 };
 try {
  await page.goto(base);await openNavigation(page);await page.locator('#sync-open').click();await page.locator('[data-action="rating"]').waitFor();
  await page.locator('#sync-fields-open').click();await page.locator('#sync-field-error').getByText('Discogs access was denied. Check the token.',{exact:true}).waitFor();assert.equal(await page.locator('#sync-field-preview').isDisabled(),true);await page.locator('#sync-field-cancel').click();
  await page.locator('#sync-fields-open').click();await page.waitForFunction(()=>!document.querySelector('#sync-field-preview').disabled);
  for(const field of ['media_condition','sleeve_condition','notes'])assert.equal(await page.locator('#sync-field-'+field).inputValue(),'');
  await page.locator('#sync-field-media_condition').selectOption('7');await page.locator('#sync-field-sleeve_condition').selectOption('7');await page.locator('#sync-field-preview').click();await page.locator('#sync-field-error').getByText('Choose a different Discogs field for each local field.',{exact:true}).waitFor();assert.equal(mappedRequests.length,0);await page.locator('#sync-field-cancel').click();
  for(const theme of ['gallery','studio','listening']) {
   await page.locator('#sync-cancel').click();await page.locator('.theme-picker summary').click();await page.locator(`button[data-theme="${theme}"]`).click();await openNavigation(page);await page.locator('#sync-open').click();await page.locator('[data-action="rating"]').waitFor();
   assert.equal(await page.locator('[data-action="notes"]').count(),0);await map();
   assert.deepEqual(mappedRequests.at(-1),{account_id:'123',media_condition:7,sleeve_condition:8,notes:9});
   assert.equal(await page.locator('.sync-field-values img').count(),0);assert.match(await page.locator('[data-action="notes"]').textContent(),/GrooveShelf: My local note/);assert.match(await page.locator('[data-action="notes"]').textContent(),/Discogs: \(empty\)/);
   for(const action of [rating,...personal])await page.locator(`[data-action="${action.id}"] select`).selectOption(action.kind==='rating'?'rating_import':'personal_import');
   await page.locator('#sync-apply').click();await page.locator('#sync-review').waitFor({state:'visible'});assert.equal(applied.length,0);
   assert.match(await page.locator('#sync-review-summary').textContent(),/3 personal field updates in GrooveShelf/);assert.match(await page.locator('#sync-review-items').textContent(),/My local note → \(empty\)/);
   for(const [width,height] of [[320,700],[1024,600]]) {await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
   await page.locator('#sync-review-back').click();assert.equal(applied.length,0);
  }
  await page.locator('#sync-apply').click();await page.locator('#sync-review-confirm').click();await page.locator('#sync-status').getByText('4 changes applied.',{exact:false}).waitFor();
  assert.deepEqual([record.rating,record.media_condition,record.sleeve_condition,record.notes],[5,'VG+','Generic','']);assert.equal(applied.length,4);
  await page.locator('#sync-cancel').click();await openNavigation(page);await page.locator('#sync-open').click();await page.locator('#sync-fields-open').click();await page.waitForFunction(()=>!document.querySelector('#sync-field-preview').disabled);
  assert.equal(await page.locator('#sync-field-notes').inputValue(),'');
  console.log('Personal sync passed: account field mapping, failure/retry, duplicate mapping rejection, independent changes, rating coexistence, clear review, session reset and responsive themes.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
