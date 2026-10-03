const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.GROOVESHELF_TEST_URL || 'http://127.0.0.1:8080';
(async () => {
  const browser = await chromium.launch({headless: true});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const record = {id:'heartbeat-copy',inventory_number:'LP-99884',artist:'Heartbeat Artist',title:'Stable Album',format:'LP',year:2020,tracks:[],notes:'',genres:[],styles:[],labels:[],description:'',protected_fields:[],metadata_status:'manual',source_url:'https://www.discogs.com/master/1',favorite:false};
  let reads = 0;
  const station = {id:'pi-main',name:'Pi',scan_sequence:0,session:null,unknown_uid:null,reader_status:'connected'};
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body;
    if (path === '/api/records') { reads++; body = [record]; }
    else if (path === '/api/stations/pi-main') body = station;
    else if (path.endsWith('/plays')) body = [];
    else body = record;
    await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  try {
    await page.clock.install();
    await page.goto(`${base}/?station=pi-main`);
    await page.getByRole('button',{name:'Table',exact:true}).click();
    await page.locator('tbody button').waitFor();
    await page.waitForTimeout(100);
    const initialReads = reads;
    await page.evaluate(() => {
      window.savedTable = document.querySelector('table');
      window.loadingMessages = [];
      new MutationObserver(() => window.loadingMessages.push(document.querySelector('#message').textContent)).observe(document.querySelector('#message'),{childList:true,subtree:true});
      document.querySelector('tbody button').focus();
      window.tableTop = window.savedTable.getBoundingClientRect().top;
    });
    await page.clock.runFor(5000);
    await page.waitForTimeout(100);
    assert.equal(reads, initialReads, 'Idle heartbeats must not reload the collection');
    await page.clock.runFor(60000);
    await page.waitForTimeout(100);
    assert.equal(reads, initialReads + 1, 'Only the scheduled metadata refresh should reload');
    assert(await page.evaluate(() => window.savedTable === document.querySelector('table')));
    assert(await page.evaluate(() => document.activeElement === document.querySelector('tbody button')));
    assert(await page.evaluate(() => window.tableTop === document.querySelector('table').getBoundingClientRect().top));
    assert(await page.evaluate(() => !window.loadingMessages.some(text => text.includes('Loading'))));
    record.title = 'Updated Album';
    await page.clock.runFor(60000);
    await page.getByRole('button',{name:'Updated Album',exact:true}).waitFor();
    await page.getByRole('button',{name:'Updated Album',exact:true}).click();
    await page.locator('#details').waitFor({state:'visible'});
    for (let i=0;i<2;i++) {
      await page.locator('#refresh').click();
      await page.waitForFunction(() => !document.querySelector('#refresh').disabled);
    }
    const beforeRefresh = reads;
    await page.clock.runFor(60000);
    await page.waitForTimeout(100);
    assert.equal(reads,beforeRefresh+1,'Manual refresh must not create additional polling timers');
    assert.deepEqual(errors,[]);
    console.log('Heartbeat regression passed: idle polling, stable table and focus, live updates, single refresh timer.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
