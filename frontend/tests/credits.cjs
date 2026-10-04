const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {join}=require('node:path');
const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{
 const {creditsMarkup}=await import(pathToFileURL(join(__dirname,'../credits.js')).href);
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const credits=[{name:'Producer <script>alert(1)</script>',role:'Producer [Original sessions]',tracks:''},
  {name:'Songwriter with a deliberately long credited name',role:'Written-By, Arranged By',tracks:'A1 to B2'},
  {name:'Performer',role:'Guitar',tracks:'A2a'}];
 assert.equal(creditsMarkup({},escape),'');
 assert.equal(creditsMarkup({credits,metadata_status:'unavailable'},escape),'');
 assert.equal(creditsMarkup({credits,metadata_expires_at:1},escape),'');
 assert(!creditsMarkup({credits,credits_source_url:'javascript:alert(1)'},escape).includes('href='));
 const browser=await chromium.launch();const page=await browser.newPage();let id;
 try{
  await page.clock.install();
  const created=await page.request.post(base+'/api/records',{data:{inventory_number:'LP-88751',artist:'Credits Artist',title:'Credits Album',tracks:[{position:'A1',title:'Opening',duration:'3:45'}]}});
  assert(created.ok());id=(await created.json()).id;
  const original=await(await page.request.get(base+'/api/records/'+id)).json();
  const expiry=Date.now()/1000+60;
  const metadata={credits,credits_source_url:'https://www.discogs.com/release/100',reference_release_url:'https://www.discogs.com/release/100',source_url:'https://www.discogs.com/master/42',metadata_status:'current',metadata_expires_at:expiry};
  await page.route(base+'/api/records/'+id,async route=>{
   if(route.request().method()!=='GET')return route.continue();
   const result=await route.fetch();await route.fulfill({json:{...await result.json(),...metadata}});
  });
  await page.goto(base+'/#record/'+id);const section=page.locator('#detail-content .album-credits');
  await section.waitFor();assert(!await section.evaluate(e=>e.open));
  await section.locator('summary').focus();await page.keyboard.press('Enter');assert(await section.evaluate(e=>e.open));
  assert.equal(await section.locator('li').count(),3);assert.equal(await section.locator('script').count(),0);
  assert.equal(await section.locator('li').first().locator('strong').textContent(),credits[0].name);
  await section.getByText('Scope: A1 to B2',{exact:true}).waitFor();
  await section.getByText('Credits from the reference release; your pressing may differ.',{exact:true}).waitFor();
  assert.equal(await section.getByRole('link',{name:'Credits provided by Discogs'}).getAttribute('href'),metadata.credits_source_url);
  for(const theme of ['gallery','studio','listening']){
   await page.evaluate(theme=>document.querySelector(`button[data-theme=${theme}]`).click(),theme);
   for(const viewport of [{width:390,height:844},{width:1024,height:600}]){
    await page.setViewportSize(viewport);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   }
  }
  await page.setViewportSize({width:390,height:844});await section.scrollIntoViewIfNeeded();
  await page.locator('#details').screenshot({path:'/tmp/grooveshelf-credits-mobile.png'});
  await page.getByRole('button',{name:'Edit personal details'}).click();
  await page.locator('#personal-form [name=notes]').fill('Local note');await page.locator('#personal-save').click();
  await page.locator('#personal-editor').waitFor({state:'hidden'});assert.equal(await section.locator('li').count(),3);
  await page.clock.runFor(61000);await page.waitForFunction(()=>!document.querySelector('#detail-content .album-credits'));
  assert.equal(await section.count(),0);
  const after=await(await page.request.get(base+'/api/records/'+id)).json();
  assert.equal(after.play_count,original.play_count);assert.equal(after.nfc_uid,original.nfc_uid);
  await page.locator('#close-details').click();
  const preview={discogs_master_id:42,artist:'Preview Artist',title:'Preview Album',year:2001,tracks:[],genres:[],styles:[],labels:[],description:'',...metadata,metadata_expires_at:null};
  await page.route('**/api/metadata/discogs/search*',route=>route.fulfill({json:{results:[{id:42,title:'Preview Artist - Preview Album',year:2001,source_url:preview.source_url}],pages:1}}));
  await page.route('**/api/metadata/discogs/masters/42',route=>route.fulfill({json:preview}));
  await page.locator('#add').click();await page.locator('#record-form [name=artist]').fill('Preview Artist');
  await page.getByRole('button',{name:'Search Discogs',exact:true}).click();await page.getByRole('button',{name:'Preview Artist - Preview Album 2001'}).click();
  const previewCredits=page.locator('.metadata-preview .album-credits');await previewCredits.waitFor();
  assert(!await previewCredits.evaluate(e=>e.open));await previewCredits.locator('summary').click();
  assert.equal(await previewCredits.locator('li').count(),3);await page.keyboard.press('Escape');
  console.log('Credits passed: collapsed keyboard disclosure, escaped roles/names, source/scope attribution, personal edits, automatic expiry, Discogs preview, no listening/NFC changes, themes and mobile/Pi layout.');
 }finally{if(id)await page.request.delete(base+'/api/records/'+id);await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
