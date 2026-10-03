const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL || 'http://127.0.0.1:8080';
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));let id;
 try{
  await page.goto(base);await page.locator('#add').click();
  const form=page.locator('#record-form');
  await form.locator('[name=inventory_number]').fill('LP-99886');await form.locator('[name=artist]').fill('Personal Artist');await form.locator('[name=title]').fill('Personal Album');
  await form.locator('[name=rating]').selectOption('5');await form.locator('[name=media_condition]').selectOption('VG+');await form.locator('[name=sleeve_condition]').selectOption('Generic');
  await form.locator('[name=notes]').fill('First notes');await page.locator('#save').click();await page.locator('#details').waitFor({state:'visible'});
  id=(await page.evaluate(()=>location.hash)).split('/')[1];
  await page.locator('#personal-summary').getByText('★★★★★ · 5/5').waitFor();
  await page.locator('#edit-personal').click();const personal=page.locator('#personal-form');
  assert.equal(await personal.locator('[name=media_condition]').inputValue(),'VG+');
  await personal.locator('[name=rating]').selectOption('1');await page.locator('#personal-cancel').click();
  await page.locator('#personal-summary').getByText('★★★★★ · 5/5').waitFor();
  await page.locator('#edit-personal').click();await personal.locator('[name=rating]').selectOption('3');await personal.locator('[name=media_condition]').selectOption('NM');await personal.locator('[name=sleeve_condition]').selectOption('No Cover');await personal.locator('[name=notes]').fill('My updated personal notes');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'/tmp/grooveshelf-personal-mobile.png'});
  await page.locator('#personal-save').click();await page.locator('#personal-editor').waitFor({state:'hidden'});
  await page.locator('#personal-summary').getByText('★★★ · 3/5').waitFor();await page.locator('#detail-content').getByText('My updated personal notes').waitFor();
  await page.reload();await page.locator('#personal-summary').getByText('★★★ · 3/5').waitFor();
  await page.locator('#edit-personal').click();for(const name of ['rating','media_condition','sleeve_condition'])await personal.locator(`[name=${name}]`).selectOption('');
  await page.locator('#personal-save').click();await page.locator('#personal-editor').waitFor({state:'hidden'});await page.locator('#personal-summary').getByText('Not rated').waitFor();
  assert.deepEqual(errors,[]);console.log('Personal browser flow passed: add, cancel, edit, reload, clear and mobile layout.');
 }finally{if(id)await page.request.delete(`${base}/api/records/${id}`);await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
