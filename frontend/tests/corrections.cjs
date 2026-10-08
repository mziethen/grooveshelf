const assert=require('node:assert/strict');const {chromium}=require('playwright');const {openRecordTools}=require('./navigation.cjs');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{
 const browser=await chromium.launch();const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const record={id:'corrections-copy',inventory_number:'LP-00001',artist:'Saved Artist',title:'My album',format:'LP',year:2001,tracks:[{position:'A1',title:'My track',duration:'4:01'}],notes:'Private note',genres:[],styles:[],labels:[],description:'',source_url:'https://www.discogs.com/master/42',protected_fields:['title','year','tracks'],metadata_status:'current',favorite:false,play_count:0};
 let attempts=[],releaseSave=null,stale=false;
 const fields=()=>[
  {field:'title',current:record.title,provider:'Discogs <script>album</script>',available:true},
  {field:'year',current:2001,provider:null,available:false},
  {field:'tracks',current:record.tracks,provider:[{position:'A1',title:'Provider track',duration:'3:45'}],available:true}
 ].filter(item=>record.protected_fields.includes(item.field));
 const expiry=Date.now()/1000+90;
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/corrections')){
   if(route.request().method()==='GET'){
    await route.fulfill({json:{record_id:record.id,inventory_number:record.inventory_number,revision:'a'.repeat(64),source_url:record.source_url,metadata_status:stale?'stale':'current',metadata_checked_at:expiry-21600,metadata_expires_at:expiry,show_expired_metadata:stale,fields:fields()}});return;
   }
   attempts.push(route.request().postDataJSON());
   if(attempts.length===1){await route.fulfill({status:409,json:{detail:'This metadata changed since your review. Close and reopen the review.'}});return;}
   if(attempts.length===2){await route.fulfill({status:503,json:{detail:'Try saving again.'}});return;}
   await new Promise(resolve=>releaseSave=resolve);
   record.title='Discogs <script>album</script>';record.protected_fields=['year','tracks'];
   await route.fulfill({json:record});return;
  }
  if(path==='/api/records'){await route.fulfill({json:[record]});return;}
  if(path.endsWith('/plays')){await route.fulfill({json:[]});return;}
  await route.fulfill({json:record});
 });
 try{
  await page.clock.install();await page.goto(base+'/#record/'+record.id);await page.locator('#details').waitFor();
  await openRecordTools(page);await page.locator('#review-corrections').click();
  await page.locator('#corrections-status').getByText(/Snapshot checked/).waitFor();
  assert.equal(await page.locator('#corrections-fields script').count(),0);
  assert.equal(await page.locator('#corrections-fields input[value=keep]:checked').count(),3);
  assert(await page.locator('#corrections-fields input[name=year][value=provider]').isDisabled());
  await page.locator('#corrections-fields input[name=title][value=provider]').check();await page.locator('#corrections-cancel').click();assert.equal(attempts.length,0);
  await page.locator('#review-corrections').click();await page.locator('#corrections-fields input[name=title][value=keep]').waitFor();
  assert(await page.locator('#corrections-fields input[name=title][value=keep]').isChecked());
  await page.locator('#corrections-fields input[name=title][value=provider]').check();await page.locator('#corrections-save').click();
  await page.locator('#corrections-error').getByText(/changed since your review/).waitFor();
  assert(await page.locator('#corrections-fields input[name=title][value=provider]').isChecked());
  await page.locator('#corrections-close').click();await page.locator('#review-corrections').click();
  await page.locator('#corrections-fields input[name=title][value=provider]').check();await page.locator('#corrections-save').click();
  await page.locator('#corrections-error').getByText('Try saving again.',{exact:true}).waitFor();
  await page.locator('#corrections-save').click();await page.waitForFunction(()=>document.querySelector('#corrections-save').disabled);
  assert.equal(await page.locator('#corrections-error').textContent(),'');assert(await page.locator('#corrections-fields input[name=title][value=provider]').isDisabled());
  await page.locator('#corrections-form').evaluate(form=>form.requestSubmit());assert.equal(attempts.length,3);
  assert.deepEqual(attempts[2].choices,{title:'provider',year:'keep',tracks:'keep'});
  releaseSave();await page.locator('#corrections').waitFor({state:'hidden'});
  await page.locator('#details').getByRole('heading',{name:record.title,exact:true}).waitFor();
  await page.locator('#review-corrections').click();await page.locator('#corrections-fields input[name=tracks]').first().waitFor();
  await page.clock.fastForward(91000);await page.locator('#corrections-status').getByText(/snapshot has expired/).waitFor();
  assert(await page.locator('#corrections-save').isDisabled());assert.equal(await page.locator('#corrections-fields').textContent(),'');
  await page.locator('#corrections-close').click();stale=true;
  await page.locator('#review-corrections').click();await page.locator('#corrections-status').getByText(/older than six hours/).waitFor();
  assert((await page.locator('#corrections-status').textContent()).includes('Snapshot checked'));
  assert(!await page.locator('#corrections-save').isDisabled());
  for(const theme of ['gallery','studio','listening']){
   await page.evaluate(theme=>document.querySelector(`button[data-theme=${theme}]`).click(),theme);
   for(const viewport of [{width:390,height:844},{width:1024,height:600}]){
    await page.setViewportSize(viewport);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   }
  }
  await page.locator('#corrections-save').scrollIntoViewIfNeeded();await page.locator('#corrections').screenshot({path:'/tmp/grooveshelf-corrections-pi.png'});
  assert.deepEqual(errors,[]);console.log('Metadata correction review passed: explicit choices, cancel/defaults, escaping, missing values, conflicts/retries, guarded save, expiry preference and responsive themes.');
 }finally{if(releaseSave)releaseSave();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
