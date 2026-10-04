const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {openNavigation} = require('./navigation.cjs');
const base = process.env.GROOVESHELF_TEST_URL || 'http://127.0.0.1:8080';
(async () => {
 const browser = await chromium.launch(); const page = await browser.newPage(); let id;
 const errors=[];page.on('pageerror', e=>errors.push(e.message));
 try {
  await page.clock.install();
  const created = await page.request.post(base+'/api/records', {data:{inventory_number:'LP-88761',artist:'Saved Artist',title:'Saved Album',tracks:[{position:'A1',title:'Saved track'}]}});
  assert(created.ok());const original=await created.json();id=original.id;
  const expiry=Date.now()/1000+90;
  const settings={automatic_refresh:false,confirm_import:true,show_expired_metadata:true};
  const snapshot={...original,metadata_status:'current',metadata_expires_at:expiry,metadata_checked_at:expiry-21600,show_expired_metadata:true,source_url:'https://www.discogs.com/master/42',credits:[{name:'Saved Producer',role:'Producer',tracks:''}],credits_source_url:'https://www.discogs.com/release/100',pressing_year:1995,country:'Germany',catalog_numbers:[]};
  const record=()=>({...snapshot,show_expired_metadata:settings.show_expired_metadata});
  await page.route(base+'/api/settings',async route=>{
   if(route.request().method()==='PUT') Object.assign(settings,route.request().postDataJSON());
   await route.fulfill({json:settings});
  });
  await page.route(base+'/api/records',route=>route.fulfill({json:[record()]}));
  await page.route(base+'/api/records/'+id,route=>route.fulfill({json:record()}));
  await page.goto(base+'/#record/'+id);await page.getByRole('heading',{name:'Saved Album',exact:true}).waitFor();
  await page.clock.fastForward(91000);
  await page.locator('.metadata-stale-notice').waitFor();
  await page.getByText('Saved track',{exact:true}).waitFor();
  await page.locator('.album-credits').waitFor();
  assert((await page.locator('.metadata-stale-notice').textContent()).includes('Last checked'));
  for(const theme of ['gallery','studio','listening']){
   await page.evaluate(theme=>document.querySelector(`button[data-theme=${theme}]`).click(),theme);
   for(const viewport of [{width:390,height:844},{width:1024,height:600}]){
    await page.setViewportSize(viewport);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   }
  }
  await page.locator('#close-details').click();await openNavigation(page);await page.locator('#settings-open').click();
  await page.getByText('These settings apply to this GrooveShelf installation.').waitFor();
  await page.locator('[name=show_expired_metadata]').uncheck();await page.locator('#settings-save').click();
  await page.getByText('Settings saved.').waitFor();await page.locator('#settings-close').click();
  await page.goto(base+'/#record/'+id);await page.getByRole('heading',{name:'Metadata temporarily unavailable',exact:true}).waitFor();
  assert.equal(await page.locator('.album-credits').count(),0);
  assert.equal(await page.getByText('Saved track',{exact:true}).count(),0);
  assert.deepEqual(errors,[]);
  console.log('Saved Discogs display passed: client expiry, dated notice, credits, three themes, mobile/Pi and opt-out hiding.');
 } finally {
  await page.unrouteAll({behavior:'wait'});
  if(id) await page.request.delete(base+'/api/records/'+id);
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
