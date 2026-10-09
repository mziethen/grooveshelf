const {openNavigation}=require('./navigation.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  try {
    await page.goto(base);
    await openNavigation(page);
    await page.locator('#backups-open').click();
    await page.locator('#backups-create').waitFor({state:'visible'});
    await page.waitForFunction(()=>!document.querySelector('#backups-create').disabled);
    assert.equal(await page.locator('#backups-enabled').isChecked(),false);
    const before=await(await page.request.get(base+'/api/backups')).json();
    await page.locator('#backups-create').click();
    await page.waitForFunction(()=>!document.querySelector('#backups-create').disabled);
    const after=await(await page.request.get(base+'/api/backups')).json();
    assert.equal(after.backup_count,before.backup_count+1);
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#backups-list a').first().click()]);
    assert.match(download.suggestedFilename(),/^grooveshelf-.*\.zip$/);
    assert.equal(fs.readFileSync(await download.path()).subarray(0,2).toString(),'PK');
    await page.locator('#backups-enabled').check();
    await page.locator('#backups-save').click();
    await page.waitForFunction(()=>!document.querySelector('#backups-save').disabled);
    assert.equal((await(await page.request.get(base+'/api/backups')).json()).enabled,true);
    await page.locator('#backups-enabled').uncheck();
    await page.locator('#backups-save').click();
    await page.waitForFunction(()=>!document.querySelector('#backups-save').disabled);
    const disabled=await(await page.request.get(base+'/api/backups')).json();
    assert.equal(disabled.enabled,false);assert.equal(disabled.backup_count,after.backup_count);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.locator('#backups-close').click();
    assert.equal(await page.locator('#backups').evaluate(e=>e.open),false);
    console.log('Backups flow passed: verified download, opt-in scheduling, retained files and mobile dialog.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
