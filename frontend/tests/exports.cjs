const {openExports}=require('./navigation.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright');
const base = process.env.GROOVESHELF_TEST_URL || 'http://127.0.0.1:8080';
(async () => {
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage();
  try {
    await page.goto(base);
    const before = await (await page.request.get(base+'/api/records')).json();
    for (const [label, extension] of [['Export JSON','json'],['Printable catalog','html']]) {
      await openExports(page);const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link',{name:label,exact:true}).click()]);
      assert.equal(download.suggestedFilename(), 'grooveshelf-collection.'+extension);
      const content = fs.readFileSync(await download.path(), 'utf8');
      if (extension === 'json') {
        const payload = JSON.parse(content);
        assert.equal(payload.record_count,before.length);
        assert.deepEqual(payload.records.map(r=>r.id),before.map(r=>r.id));
      } else {
        const catalog = await browser.newPage({viewport:{width:390,height:844}});
        const requests=[]; catalog.on('request', r=>requests.push(r.url()));
        await catalog.setContent(content);
        assert.equal(await catalog.locator('article').count(),before.length);
        assert.equal(await catalog.locator('script,img,link').count(),0);
        assert.deepEqual(requests,[]);
        assert(await catalog.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
        await catalog.emulateMedia({media:'print'});
        assert((await catalog.pdf({format:'A4'})).length > 1000);
        await catalog.close();
      }
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('#nav-toggle').click();
    const [mobileDownload] = await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name:'Export JSON',exact:true}).click()]);
    assert.equal(mobileDownload.suggestedFilename(),'grooveshelf-collection.json');
    assert.deepEqual(await (await page.request.get(base+'/api/records')).json(),before);
    console.log('Additional exports passed: JSON download, offline HTML, mobile layout and PDF printing.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
