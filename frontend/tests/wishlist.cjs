const {openNavigation}=require('./navigation.cjs');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL || 'http://127.0.0.1:8080';
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});let copyId;const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/metadata/discogs/search?**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({results:[{id:42,title:'Provider Artist - Provider Title',source_url:'https://www.discogs.com/master/42'}],pages:1})}));
 await page.route('**/api/metadata/discogs/masters/42',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'Provider unavailable; manual entry remains available.'})}));
 try{
  await page.goto(base);await openNavigation(page);await page.locator('#wishlist-open').click();await page.locator('#wish-add').click();
  const form=page.locator('#wish-form');await form.locator('[name=artist]').fill('Wish Artist');await form.locator('[name=title]').fill('Wish Album');await form.locator('[name=notes]').fill('Find a clean original');
  await page.locator('#wish-search').click();await page.getByRole('button',{name:'Provider Artist - Provider Title'}).click();
  assert.equal(await form.locator('[name=title]').inputValue(),'Wish Album','Reference selection must retain personal wording');
  await page.locator('#wish-save').click();await page.locator('#wish-editor').waitFor({state:'hidden'});await page.locator('#wish-list').getByRole('heading',{name:'Wish Album'}).waitFor();
  assert.equal((await (await page.request.get(base+'/api/records')).json()).length,0);
  await page.locator('#wish-list').getByRole('button',{name:'Edit wish'}).click();await form.locator('[name=notes]').fill('Prefer a quiet copy');await page.locator('#wish-save').click();await page.locator('#wish-list').getByText('Prefer a quiet copy').waitFor();
  await page.locator('#wish-filter').fill('missing');await page.getByText('No wishes match your search.').waitFor();await page.locator('#wish-filter').fill('');await page.locator('#wish-list').getByRole('heading',{name:'Wish Album'}).waitFor();
  await page.screenshot({path:'/tmp/grooveshelf-wishlist-mobile.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#wish-list').getByRole('button',{name:'I bought this record'}).click();await page.locator('#editor').waitFor({state:'visible'});
  await page.locator('.close-editor').first().click();
  await openNavigation(page);await page.locator('#wishlist-open').click();await page.locator('#wish-list').getByRole('heading',{name:'Wish Album'}).waitFor();
  await page.locator('#wish-list').getByRole('button',{name:'I bought this record'}).click();
  await page.locator('#record-form [name=inventory_number]').fill('LP-99887');await page.locator('#save').click();await page.locator('#details').waitFor({state:'visible'});
  copyId=(await page.evaluate(()=>location.hash)).split('/')[1];
  assert.equal((await (await page.request.get(base+'/api/wishlist')).json()).length,0);
  assert.equal((await (await page.request.get(base+'/api/records')).json()).length,1);
  await page.locator('#close-details').click();await openNavigation(page);await page.locator('#wishlist-open').click();await page.getByText('Your wishlist is empty. Add an album you would like to find.').waitFor();
  await page.locator('#wish-add').click();await form.locator('[name=artist]').fill('Other Artist');await form.locator('[name=title]').fill('Removable Wish');await page.locator('#wish-save').click();await page.locator('#wish-editor').waitFor({state:'hidden'});
  await page.locator('#wish-list').getByRole('button',{name:'Remove wish'}).click();await page.locator('#wish-delete-cancel').click();assert.equal((await (await page.request.get(base+'/api/wishlist')).json()).length,1);
  await page.locator('#wish-list').getByRole('button',{name:'Remove wish'}).click();await page.locator('#wish-delete-confirm').click();await page.getByText('Your wishlist is empty. Add an album you would like to find.').waitFor();
  assert.deepEqual(errors,[]);console.log('Wishlist browser flow passed: manual entry, Discogs reference, edit/search, cancel purchase, acquire and confirmed removal.');
 }finally{if(copyId)await page.request.delete(`${base}/api/records/${copyId}`);await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
