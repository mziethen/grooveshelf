const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{
 const browser=await chromium.launch();const page=await browser.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const records=[
  {id:'feedback-a',inventory_number:'LP-00001',artist:'First Artist',title:'First Album',nfc_uid:null},
  {id:'feedback-b',inventory_number:'LP-00002',artist:'Second Artist',title:'Second Album',nfc_uid:'04112233445566'}
 ].map(record=>({...record,format:'LP',tracks:[],notes:'',genres:[],styles:[],labels:[],description:'',protected_fields:[],metadata_status:'manual',favorite:false,play_count:0}));
 const uid='04AABBCCDDEEFF';
 const station={id:'pi-main',name:'Pi',scan_sequence:0,session:null,unknown_uid:null,reader_status:'connected'};
 let unavailable=false,attempts=[],heldSave=null,releaseSave;
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/stations/pi-main'){
   await route.fulfill(unavailable?{status:503,json:{detail:'Connection interrupted'}}:{json:station});return;
  }
  if(path.startsWith('/api/tags/')&&route.request().method()==='PUT'){
   const data=route.request().postDataJSON();attempts.push({...data,uid:path.split('/').pop()});
   if(attempts.length===1){await route.fulfill({status:409,json:{detail:'This record already has a tag. Confirm replacement to remove its old association.'}});return;}
   if(attempts.length===2){await route.fulfill({status:503,json:{detail:'Try this assignment again.'}});return;}
   heldSave=new Promise(resolve=>releaseSave=resolve);await heldSave;
   records[1].nfc_uid=uid;station.unknown_uid=null;
   await route.fulfill({json:{uid,copy_id:data.copy_id}});return;
  }
  if(path==='/api/records'){await route.fulfill({json:records});return;}
  if(path.endsWith('/plays')){await route.fulfill({json:[]});return;}
  if(path.startsWith('/api/records/')){await route.fulfill({json:records.find(r=>path.endsWith(r.id))||records[0]});return;}
  await route.fulfill({json:{}});
 });
 try{
  await page.clock.install();await page.goto(base+'/?station=pi-main');
  await page.locator('#station-reader-state').getByText('Reader connected. Ready to scan.',{exact:true}).waitFor();
  await page.evaluate(()=>{
   window.readerMutations=0;
   new MutationObserver(()=>window.readerMutations++).observe(document.querySelector('#station-reader-state'),{childList:true,subtree:true});
  });
  await page.clock.runFor(2200);assert.equal(await page.evaluate(()=>window.readerMutations),0,'Idle heartbeats must not reannounce reader state');
  station.reader_status='error';await page.clock.runFor(1200);await page.locator('#station-reader-state').getByText(/Reader error/).waitFor();
  station.reader_status='disconnected';await page.clock.runFor(1200);await page.locator('#station-reader-state').getByText(/Reader disconnected/).waitFor();
  station.reader_status='simulation';await page.clock.runFor(1200);await page.locator('#station-reader-state').getByText(/Test scan mode/).waitFor();
  station.reader_status='connected';station.unknown_uid=uid;station.scan_sequence++;
  await page.clock.runFor(1200);await page.locator('#station-assign').waitFor();
  unavailable=true;await page.clock.runFor(1200);await page.locator('#station-retry').waitFor();
  assert(await page.locator('#station-assign').isDisabled());
  unavailable=false;await page.locator('#station-retry').click();await page.locator('#station-retry').waitFor({state:'hidden'});
  assert(!await page.locator('#station-assign').isDisabled());
  await page.locator('#station-assign').click();await page.locator('#station-record-search').fill('second artist');
  await page.locator('#station-record-count').getByText('1 of 2 records',{exact:true}).waitFor();
  assert.equal(await page.locator('#station-record').inputValue(),records[1].id);
  await page.locator('#station-tag-summary').getByText(/Existing tag: 04112233445566/).waitFor();
  await page.locator('#station-record-search').fill('No matching album');assert(await page.locator('#station-tag-save').isDisabled());
  await page.locator('#station-record-search').fill('LP-00002');
  await page.locator('#station-tag-save').click();await page.locator('#station-tag-error').getByText(/Confirm replacement/).waitFor();
  assert(!attempts[0].replace);assert.equal(records[1].nfc_uid,'04112233445566');
  await page.locator('#station-tag-replace').check();await page.locator('#station-tag-save').click();
  await page.locator('#station-tag-error').getByText('Try this assignment again.',{exact:true}).waitFor();
  await page.locator('#station-tag-save').click();await page.waitForFunction(()=>document.querySelector('#station-tag-save').disabled);
  assert.equal(await page.locator('#station-tag-error').textContent(),'');
  await page.locator('#station-tag-form').evaluate(form=>form.requestSubmit());
  assert.equal(attempts.length,3,'An in-flight retry cannot submit twice');
  releaseSave();await page.locator('#station-tag-editor').waitFor({state:'hidden'});
  await page.locator('#station-feedback').getByText(/assigned to LP-00002/).waitFor();
  await page.clock.runFor(3200);await page.locator('#station-feedback').getByText(/Remove and scan it again/).waitFor();
  assert.equal(station.session,null,'Assignment alone must not start a play');
  assert(attempts[2].replace);assert.equal(attempts[2].copy_id,records[1].id);
  station.session={id:'existing-session',copy_id:records[1].id,status:'pending',remaining_seconds:600};station.scan_sequence++;
  await page.clock.runFor(1200);await page.locator('#details').waitFor();
  assert(!(await page.locator('#detail-station-feedback').textContent()).includes('assigned to'));
  station.reader_status='disconnected';await page.clock.runFor(1200);
  await page.locator('#detail-reader-state').getByText(/Existing listening sessions continue/).waitFor();
  assert.equal(station.session.id,'existing-session');assert.equal(station.session.status,'pending');
  station.unknown_uid='04000000000000';station.scan_sequence++;await page.clock.runFor(1200);
  await page.locator('#detail-assign-unknown').click();await page.locator('#station-tag-summary').getByText(/This record has no tag yet/).waitFor();
  station.unknown_uid='04000000000001';station.scan_sequence++;await page.clock.runFor(1200);
  assert.equal(await page.locator('#station-tag-uid').textContent(),'04000000000000','New scans cannot replace the tag being confirmed');
  for(const theme of ['gallery','studio','listening']){
   await page.evaluate(theme=>document.querySelector(`button[data-theme=${theme}]`).click(),theme);
   for(const size of [{width:390,height:844},{width:1024,height:600}]){
    await page.setViewportSize(size);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   }
  }
  await page.locator('#station-tag-editor').screenshot({path:'/tmp/grooveshelf-nfc-assignment-pi.png'});
  await page.locator('#station-tag-cancel').click();
  await page.locator('#detail-reader-state').getByText(/Reader disconnected/).waitFor();
  assert.deepEqual(errors,[]);
  console.log('Reader feedback passed: quiet heartbeat, reader states, API recovery, searchable confirmation, replacement conflicts, guarded retry, persistent success, preserved session and captured UID, responsive themes.');
 }finally{if(releaseSave)releaseSave();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
