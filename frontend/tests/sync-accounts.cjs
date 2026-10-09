const {openNavigation}=require('./navigation.cjs');
const assert=require('node:assert/strict');const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage();
 let resolved=false,attempts=0,release;const gate=new Promise(resolve=>release=resolve);
 const message='LP-00001: collection instance 11 (release 100) belongs to saved account 123; connected account is 456. Review this local association before syncing with the new account.';
 const record={id:'demo-copy',album_id:'demo-album',inventory_number:'LP-00001',artist:'Demo Artist',title:'Demo Album',format:'LP',year:1990,tracks:[],notes:'Keep my notes',genres:[],styles:[],labels:[],description:'',protected_fields:[],metadata_status:'manual'};
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/discogs/sync/preview')return route.fulfill({json:{plan_id:'account-plan',username:'demo-owner',remote_count:0,last_success_at:null,expires_in_seconds:600,actions:[],notices:resolved?[]:[{kind:'account_conflict',copy_id:record.id,action_id:'old-account',inventory_number:'LP-00001',saved_account:'123',connected_account:'456',release_id:100,instance_id:11,message}]}});
  if(path==='/api/discogs/sync/apply'){
   assert.deepEqual(route.request().postDataJSON(),{plan_id:'account-plan',action_id:'old-account',choice:'detach',confirmed:true});attempts++;
   if(attempts===1)return route.fulfill({status:409,json:{detail:'An export still needs review before this link can be removed.'}});
   await gate;resolved=true;return route.fulfill({json:{status:'detached',copy_id:record.id}});
  }
  return route.fulfill({json:path==='/api/records'?[record]:path.endsWith('/plays')?[]:{}});
 });
 try {
  await page.goto(base);await openNavigation(page);await page.locator('#sync-open').click();
  for(const theme of ['gallery','studio','listening']) {
   await page.locator('#sync-cancel').click();await page.locator('.theme-picker summary').click();await page.locator(`button[data-theme="${theme}"]`).click();
   await openNavigation(page);await page.locator('#sync-open').click();
   await page.getByRole('button',{name:'Review account conflict',exact:true}).click();
   assert.equal(await page.locator('#missing-link-title').textContent(),'Review previous Discogs account');
   assert.equal(await page.locator('#missing-link-copy').textContent(),message);
   assert.match(await page.locator('#missing-link-scope').textContent(),/previous account cannot be checked/i);
   assert.equal(await page.locator('#missing-link-check').isChecked(),false);
   await page.locator('#missing-link-confirm').click();assert.equal(attempts,0);
   for(const [width,height] of [[320,700],[1024,600]]) {await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
   await page.locator('#missing-link-check').check();await page.locator('#missing-link-cancel').click();assert.equal(attempts,0);
  }
  await page.getByRole('button',{name:'Review account conflict',exact:true}).click();await page.locator('#missing-link-check').check();
  await page.locator('#missing-link-confirm').click();await page.locator('#missing-link-error').getByText('An export still needs review before this link can be removed.',{exact:true}).waitFor();
  assert.equal(attempts,1);assert.equal(await page.locator('#missing-link-check').isChecked(),true);
  await page.locator('#missing-link-confirm').click();assert.equal(await page.locator('#missing-link-confirm').isDisabled(),true);assert.equal(await page.locator('#missing-link-cancel').isDisabled(),true);
  release();await page.locator('#missing-link-dialog').waitFor({state:'hidden'});await page.getByRole('button',{name:'Review account conflict',exact:true}).waitFor({state:'hidden'});
  assert.equal(attempts,2);assert.equal(record.notes,'Keep my notes');
  console.log('Account conflict flow passed: explicit review/cancel, checkbox, error/retry, guarded submission and responsive themes.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
