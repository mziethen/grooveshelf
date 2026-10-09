const {openNavigation}=require('./navigation.cjs');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{
  const browser=await chromium.launch({headless:true});const page=await browser.newPage();
  try {
    await page.goto(base);await openNavigation(page);await page.locator('#backups-open').click();
    await page.waitForFunction(()=>!document.querySelector('#backups-create').disabled);
    const before=await(await page.request.get(base+'/api/records')).json();
    let release;const gate=new Promise(resolve=>release=resolve);let calls=0;
    await page.route('**/api/backups/*/inspect',async route=>{calls++;await gate;await route.continue();});
    await page.locator('[data-inspect-backup]').first().click();
    assert.equal(await page.locator('#backups-create').isDisabled(),true);
    assert.equal(await page.locator('[data-inspect-backup]').first().isDisabled(),true);
    await page.locator('#backups-close').click();await openNavigation(page);await page.locator('#backups-open').click();
    release();await page.waitForFunction(()=>!document.querySelector('#backups-create').disabled);
    assert.equal(calls,1);assert.equal(await page.locator('#backup-inspection').isVisible(),false);
    await page.unroute('**/api/backups/*/inspect');
    await page.locator('[data-inspect-backup]').first().click();
    await page.locator('#backup-inspection-status').getByText('Verified.',{exact:false}).waitFor();
    assert.equal(await page.locator('#backup-inspection-details dt').count(),7);
    for(const theme of ['gallery','studio','listening']) {
      await page.locator('#backups-close').click();
      await page.locator('.theme-picker summary').click();await page.locator(`button[data-theme="${theme}"]`).click();
      await openNavigation(page);await page.locator('#backups-open').click();
      await page.waitForFunction(()=>!document.querySelector('#backups-create').disabled);
      await page.locator('[data-inspect-backup]').first().click();
      await page.locator('#backup-inspection-status').getByText('Verified.',{exact:false}).waitFor();
      for(const [width,height] of [[320,700],[1024,600]]) {
        await page.setViewportSize({width,height});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        assert.equal(await page.locator('#backups-close').isVisible(),true);
      }
    }
    await page.route('**/api/backups/*/inspect',route=>route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({detail:'This backup could not be verified. Keep the original file and create another backup.'})}));
    await page.locator('[data-inspect-backup]').first().click();
    await page.locator('#backup-inspection-status').getByText('This backup could not be verified.',{exact:false}).waitFor();
    assert.equal(await page.locator('#backup-inspection-details').textContent(),'');
    await page.unroute('**/api/backups/*/inspect');
    await page.locator('[data-inspect-backup]').first().click();
    await page.locator('#backup-inspection-status').getByText('Verified.',{exact:false}).waitFor();
    const after=await(await page.request.get(base+'/api/records')).json();assert.deepEqual(after,before);
    console.log('Backup inspection passed: guarded close/reopen, verified facts, failure/retry, unchanged records and responsive themes.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
