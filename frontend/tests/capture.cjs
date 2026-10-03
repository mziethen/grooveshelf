const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});const created=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base);await page.getByRole('button',{name:'＋ Add a record',exact:true}).click();
  const form=page.locator('#record-form');const field=name=>form.locator(`[name=${name}]`);
  await page.waitForFunction(()=>/^LP-\d{5}$/.test(document.querySelector('[name=inventory_number]').value));
  const first=await field('inventory_number').inputValue();
  await field('artist').fill('Rapid Capture Artist');await field('title').fill('Rapid Capture Album');await field('format').selectOption('EP');await field('year').fill('2001');await field('notes').fill('First copy only');await field('storage_location').fill('First shelf');await field('rating').selectOption('4');await field('tracks').fill('A1 | First track');await page.locator('#keep-artist').check();
  await page.locator('#save-next').click();await page.getByText(`Saved ${first}. Ready for your next record.`).waitFor();
  let copies=await (await page.request.get(base+'/api/records')).json();created.push(...copies.filter(r=>r.artist==='Rapid Capture Artist').map(r=>r.id));assert.equal(created.length,1);
  await page.waitForFunction(first=>document.querySelector('[name=inventory_number]').value!==first&&/^LP-\d{5}$/.test(document.querySelector('[name=inventory_number]').value),first);
  assert.equal(await field('artist').inputValue(),'Rapid Capture Artist');assert.equal(await field('format').inputValue(),'EP');assert(await page.locator('#keep-artist').isChecked());
  for(const name of ['title','year','notes','rating','tracks','storage_location'])assert.equal(await field(name).inputValue(),'');
  await field('title').fill('Rapid Capture Album');await page.locator('#duplicate-panel').waitFor({state:'visible'});await page.locator('#save').click();await page.locator('#form-error').getByText('Review the existing copies and confirm that you are adding another physical copy.').waitFor();
  assert.equal((await (await page.request.get(base+'/api/records')).json()).filter(r=>r.artist==='Rapid Capture Artist').length,1);
  await page.screenshot({path:'/tmp/grooveshelf-capture-mobile.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#duplicate-confirm').check();await page.locator('#save').click();await page.locator('#details').waitFor({state:'visible'});created.push(page.url().split('#record/')[1]);
  await page.getByRole('button',{name:'Edit record',exact:true}).click();assert(await page.locator('#save-next').isHidden());await page.locator('#save').click();await page.locator('#editor').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Close details'}).click();
  await page.route('**/api/capture/next-inventory',async route=>{await new Promise(resolve=>setTimeout(resolve,500));await route.fulfill({contentType:'application/json',body:JSON.stringify({inventory_number:'LP-88776',reserved:false})});});
  await page.getByRole('button',{name:'＋ Add a record',exact:true}).click();await field('inventory_number').fill('LP-88777');await page.waitForTimeout(650);assert.equal(await field('inventory_number').inputValue(),'LP-88777');
  assert.deepEqual(errors,[]);console.log('Rapid capture browser flow passed: suggestion, retained artist/format, cleared personal fields, duplicate confirmation, editing and delayed suggestion.');
 }finally{for(const id of created)await page.request.delete(`${base}/api/records/${id}`);await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
