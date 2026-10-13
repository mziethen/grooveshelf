const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {openNavigation}=require('./navigation.cjs');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{const browser=await chromium.launch();try{
 const page=await browser.newPage(),errors=[],writes=[];let previews=0;
 page.on('pageerror',e=>errors.push(e.message));await page.clock.install();
 const actions=[
  {id:'one',kind:'remote',artist:'Alice <Quartet>',title:'Evening',instance_id:11,release_id:101,matches:[]},
  {id:'two',kind:'remote',artist:'Bob',title:'Morning',instance_id:12,release_id:102,matches:[]},
  {id:'three',kind:'local',inventory_number:'LP-00003',copy_id:'local',title:'Local copy',release_id:103},
  {id:'four',kind:'rating',inventory_number:'LP-00004',copy_id:'rated',title:'Rated copy',instance_id:14,release_id:104,local_rating:1,remote_rating:5},
  {id:'five',kind:'personal',inventory_number:'LP-00005',copy_id:'notes',title:'Notes copy',instance_id:15,release_id:105,field:'notes',definition:{name:'Listening notes'},local_value:'',remote_value:'Remote note'},
 ].map(a=>({...a,source_url:'https://www.discogs.com/release/'+a.release_id}));
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/discogs/sync/preview'){previews++;return route.fulfill({json:{plan_id:'browse-plan',username:'owner',remote_count:4,expires_in_seconds:60,actions,notices:[{message:'This notice remains visible.'}]}});}
  if(route.request().method()!=='GET')writes.push(route.request().postDataJSON());
  return route.fulfill({json:path==='/api/discogs/sync/apply'?{status:'imported',inventory_number:'LP-00006'}:path==='/api/records'?[]:{}});
 });
 await page.goto(base);await openNavigation(page);await page.locator('#sync-open').click();await page.locator('[data-action="one"]').waitFor();
 const visible=()=>page.locator('#sync-results [data-action]:visible').evaluateAll(rows=>rows.map(r=>r.dataset.action));
 assert.deepEqual(await visible(),['one','two','three','four','five']);
 await page.locator('[data-action="one"] select').selectOption('import');await page.locator('[data-action="two"] select').selectOption('import');
 const node=await page.locator('[data-action="one"] select').elementHandle();
 await page.locator('#sync-search').fill('alice <quartet>');assert.deepEqual(await visible(),['one']);assert((await page.locator('#sync-visible-count').textContent()).includes('1 selected outside this view'));
 await page.locator('#sync-search').fill('LP-00003');assert.deepEqual(await visible(),['three']);
 await page.locator('#sync-search').fill('105');assert.deepEqual(await visible(),['five']);
 await page.locator('#sync-search').fill('Listening notes');assert.deepEqual(await visible(),['five']);
 await page.locator('#sync-search').fill('no match');assert(await page.locator('#sync-no-matches').isVisible());assert(await page.getByText('This notice remains visible.',{exact:true}).isVisible());
 assert((await page.locator('#sync-visible-count').textContent()).includes('2 selected outside this view'));
 await page.locator('#sync-apply').click();assert.equal(await page.locator('#sync-review-items li').count(),2);assert.equal(writes.length,0);await page.locator('#sync-review-back').click();
 await page.locator('#sync-clear-filter').click();assert(await node.evaluate(e=>e===document.querySelector('[data-action="one"] select')));assert.equal(await page.locator('[data-action="one"] select').inputValue(),'import');
 for(const [filter,ids] of [['remote',['one','two']],['local',['three']],['rating',['four']],['personal',['five']],['selected',['one','two']]]){await page.locator('#sync-filter').selectOption(filter);assert.deepEqual(await visible(),ids);}
 await page.locator('[data-action="one"] select').focus();await page.locator('[data-action="one"] select').selectOption('skip');assert.deepEqual(await visible(),['two']);assert(await page.locator('#sync-filter').evaluate(e=>e===document.activeElement));
 for(const theme of ['gallery','studio','listening']){await page.evaluate(t=>document.querySelector(`button[data-theme=${t}]`).click(),theme);for(const width of [320,390,1024]){await page.setViewportSize({width,height:700});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}}
 assert.equal(previews,1);assert.equal(writes.length,0);
 await page.locator('#sync-filter').selectOption('local');await page.locator('#sync-apply').click();assert.equal(await page.locator('#sync-review-items li').count(),1);assert((await page.locator('#sync-review-items').textContent()).includes('Morning'));await page.locator('#sync-review-confirm').click();
 await page.waitForFunction(()=>document.querySelector('#sync-status').textContent.startsWith('1 change applied'));
 assert.equal(writes.length,1);assert.equal(writes[0].action_id,'two');assert.equal(writes[0].choice,'import');assert(!await page.locator('#sync-browse').isVisible());assert.deepEqual(await visible(),['one','two','three','four','five']);
 await page.locator('#sync-preview').click();await page.locator('#sync-browse').waitFor();assert.equal(await page.locator('#sync-search').inputValue(),'');assert.equal(await page.locator('#sync-filter').inputValue(),'all');assert(await page.locator('#sync-apply').isDisabled());
 await page.clock.runFor(61000);assert(!await page.locator('#sync-browse').isVisible());assert(!await page.locator('#sync-no-matches').isVisible());assert(await page.locator('#sync-apply').isDisabled());assert.deepEqual(errors,[]);
 console.log('Sync browsing passed: local search/type filters, stable hidden selections, complete review, independent notices, empty results, no implicit requests, focus, expiry and responsive themes.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
