const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.GROOVESHELF_TEST_URL || 'http://127.0.0.1:8080';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: {width: 390, height: 844} });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const preview = { discogs_master_id: 42, title: 'A Discogs Album', artist: 'Fixture Artist', year: 1995,
    tracks: [{position:'A1',title:'An imported track'}], genres:['Rock'], styles:[],labels:['Label'], description:'Album notes',source_url:'https://www.discogs.com/master/42',source_name:'Discogs'};
  let saved = null;
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body;
    if (path === '/api/metadata/discogs/search') body = {results:[{id:42,title:'Fixture Artist - A Discogs Album',year:1995,source_url:preview.source_url}],pages:1};
    else if (path === '/api/metadata/discogs/masters/42') body = preview;
    else if (path === '/api/records' && route.request().method() === 'POST') {
      saved = route.request().postDataJSON();
      body = {...preview,...saved,id:'fixture-copy',album_id:'fixture-album',created_at:'2026-10-03',cover_url:'/api/covers/discogs/42',protected_fields:['title'],metadata_status:'current',metadata_expires_at:Date.now()/1000+3600};
      saved = body;
    } else if (path === '/api/records') body = saved ? [saved] : [];
    else if (path === '/api/records/fixture-copy') body = saved;
    else if (path === '/api/covers/discogs/42') { await route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZxkAAAAASUVORK5CYII=','base64')}); return; }
    else { await route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({detail:'Not found'})});return; }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  try {
    await page.clock.install();
    await page.goto(base);
    await page.getByRole('button',{name:'＋ Add a record',exact:true}).click();
    await page.getByLabel('Artist',{exact:true}).fill('Fixture Artist');
    await page.getByRole('button',{name:'Search Discogs',exact:true}).click();
    await page.getByRole('button',{name:'Fixture Artist - A Discogs Album 1995'}).click();
    await page.getByRole('button',{name:'Use these details'}).waitFor();
    assert.equal(await page.getByLabel('Album title',{exact:true}).inputValue(),'');
    assert.equal(saved,null,'Preview must not save a record');
    await page.getByRole('button',{name:'Use these details'}).click();
    assert.equal(await page.getByLabel('Album title',{exact:true}).inputValue(),'A Discogs Album');
    await page.getByLabel('Inventory number',{exact:false}).fill('LP-99882');
    await page.getByLabel('Album title',{exact:true}).fill('My corrected title');
    await page.getByRole('button',{name:'Save record'}).click();
    await page.locator('#details').waitFor({state:'visible'});
    assert.equal(saved.discogs_master_id,42);
    assert.equal(saved.title,'My corrected title');
    assert.equal(saved.tracks[0].position,'A1');
    await page.locator('#details').getByRole('link',{name:'Data provided by Discogs'}).first().waitFor();
    assert.equal(await page.locator('#details .cover img').count(),1);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({path:'/tmp/grooveshelf-discogs-mobile.png',fullPage:true});
    // Offline browser views must stop showing provider fields after their deadline.
    await page.clock.fastForward(3601000);
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#details').getByRole('heading',{name:'My corrected title'}).count(),1);
    assert.equal(await page.locator('#details .cover img').count(),0);
    assert.equal(await page.locator('#details .detail-tracks').count(),0);
    assert.equal(await page.locator('#edit').isDisabled(),true);
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('Discogs browser flow passed: search, preview, explicit confirmation, manual correction, source link and local cover.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
