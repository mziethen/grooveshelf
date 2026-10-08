const {openRecordTools}=require('./navigation.cjs');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {join}=require('node:path');
const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{
 const {releaseNotesMarkup}=await import(pathToFileURL(join(__dirname,'../release-notes.js')).href);
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const text='Recorded in Berlin.\n<script>alert(1)</script>\n'+ 'LongUnbrokenCatalogText'.repeat(25);
 assert.equal(releaseNotesMarkup({},escape),'');
 assert.equal(releaseNotesMarkup({description:'  \n '},escape),'');
 assert.equal(releaseNotesMarkup({description:text,metadata_expires_at:1},escape),'');
 assert.equal(releaseNotesMarkup({description:text,metadata_status:'unavailable',show_expired_metadata:true},escape),'');
 assert(releaseNotesMarkup({description:text,metadata_expires_at:1,show_expired_metadata:true},escape));
 assert(!releaseNotesMarkup({description:text,reference_release_url:'javascript:alert(1)'},escape).includes('href='));
 assert(!releaseNotesMarkup({description:text,discogs_release_id:100,source_url:'https://www.discogs.com/release/101'},escape).includes('href='));
 const browser=await chromium.launch();const page=await browser.newPage();let id;
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.clock.install();
  const created=await page.request.post(base+'/api/records',{data:{inventory_number:'LP-88752',artist:'Notes Artist',title:'Notes Album',notes:'My private sleeve note'}});
  assert(created.ok());id=(await created.json()).id;
  const original=await(await page.request.get(base+'/api/records/'+id)).json();
  const metadata={description:text,discogs_master_id:42,source_url:'https://www.discogs.com/master/42',reference_release_url:'https://www.discogs.com/release/100',metadata_status:'current',metadata_expires_at:Date.now()/1000+180};
  await page.route(base+'/api/records/'+id,async route=>{
   if(route.request().method()!=='GET')return route.continue();
   const result=await route.fetch();await route.fulfill({json:{...await result.json(),...metadata}});
  });
  await page.goto(base+'/#record/'+id);const section=page.locator('#detail-content .release-notes');
  await section.waitFor();assert(!await section.evaluate(e=>e.open));
  await section.locator('summary').focus();await page.keyboard.press('Enter');
  assert(await section.evaluate(e=>e.open));assert.equal(await section.locator('.release-notes-text').textContent(),text);
  assert.equal(await section.locator('script').count(),0);
  await section.getByText('Notes from the album’s reference release; your pressing may differ. Your personal notes are kept separately.',{exact:true}).waitFor();
  assert.equal(await section.getByRole('link').getAttribute('href'),metadata.reference_release_url);
  await page.locator('#detail-content').getByText('My private sleeve note',{exact:true}).waitFor();
  for(const theme of ['gallery','studio','listening']){
   await page.evaluate(theme=>document.querySelector(`button[data-theme=${theme}]`).click(),theme);
   for(const viewport of [{width:390,height:844},{width:1024,height:600}]){
    await page.setViewportSize(viewport);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert(await section.evaluate(e=>e.scrollWidth<=e.clientWidth));
   }
  }
  await page.locator('#details').screenshot({path:'/tmp/grooveshelf-release-notes-pi.png'});
  await section.locator('summary').focus();metadata.description=text+'\nUpdated source notes.';
  await page.clock.runFor(61000);
  await section.getByText(metadata.description,{exact:true}).waitFor();
  assert(await section.evaluate(e=>e.open));assert(await section.locator('summary').evaluate(e=>e===document.activeElement));
  await page.clock.runFor(121000);await section.waitFor({state:'hidden'});
  assert(await page.locator('#close-details').evaluate(e=>e===document.activeElement));
  const after=await(await page.request.get(base+'/api/records/'+id)).json();
  assert.equal(after.notes,original.notes);assert.equal(after.play_count,original.play_count);assert.equal(after.nfc_uid,original.nfc_uid);
  await page.locator('#close-details').click();
  const preview={discogs_release_id:100,artist:'Preview Artist',title:'Preview Album',year:2001,tracks:[],genres:[],styles:[],labels:[],description:text,source_url:'https://www.discogs.com/release/100',is_vinyl:true};
  await page.route('**/api/metadata/discogs/search*',route=>route.fulfill({json:{results:[{id:42,title:'Preview Artist - Preview Album',year:2001,source_url:'https://www.discogs.com/master/42'}],pages:1}}));
  await page.route('**/api/metadata/discogs/masters/42',route=>route.fulfill({json:{...preview,discogs_release_id:null,discogs_master_id:42,source_url:'https://www.discogs.com/master/42',reference_release_url:preview.source_url}}));
  await page.route('**/api/metadata/discogs/releases/100',route=>route.fulfill({json:preview}));
  await page.locator('#add').click();await page.locator('#record-form [name=artist]').fill('Preview Artist');
  await page.getByRole('button',{name:'Search Discogs',exact:true}).click();await page.getByRole('button',{name:'Preview Artist - Preview Album 2001'}).click();
  const previewNotes=page.locator('.metadata-preview .release-notes');await previewNotes.waitFor();
  assert(!await previewNotes.evaluate(e=>e.open));await previewNotes.locator('summary').click();
  assert.equal(await previewNotes.locator('.release-notes-text').textContent(),text);await page.keyboard.press('Escape');
  await page.goto(base+'/#record/'+id);
  await openRecordTools(page);await page.locator('#link-release').click();
  await page.locator('#release-id').fill('100');await page.locator('#release-load').click();
  const pressingNotes=page.locator('#release-preview .release-notes');await pressingNotes.waitFor();
  await pressingNotes.getByText('Discogs release notes',{exact:true}).click();
  assert.equal(await pressingNotes.getByRole('link').getAttribute('href'),preview.source_url);
  assert.equal(await pressingNotes.locator('.release-notes-text').textContent(),text);
  assert.deepEqual(errors,[]);
  console.log('Release notes passed: reference/pressing attribution, collapsed previews/details, escaping, long text, expiry, focus/state preservation, personal-data preservation and responsive themes.');
 }finally{if(id)await page.request.delete(base+'/api/records/'+id);await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
