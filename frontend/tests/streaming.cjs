const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const {join} = require('node:path');
const {chromium} = require('playwright');
const base = process.env.GROOVESHELF_TEST_URL || 'http://127.0.0.1:8080';
(async () => {
  const {albumSearchLinks} = await import(pathToFileURL(join(__dirname,'../streaming.js')).href);
  const input = {artist:'Björk & "Friends"',title:'Jóga / <script>alert(1)</script> #?',metadata_status:'manual'};
  const query = `${input.artist} ${input.title}`;
  const links = albumSearchLinks(input);
  assert.equal(decodeURIComponent(new URL(links[0].url).pathname.slice('/search/'.length)),query);
  assert.equal(new URL(links[1].url).searchParams.get('search_query'),query);
  assert.deepEqual(albumSearchLinks({...input,artist:''}),[]);
  assert.deepEqual(albumSearchLinks({...input,metadata_status:'unavailable'}),[]);
  assert.deepEqual(albumSearchLinks({...input,metadata_expires_at:1}),[]);
  assert.deepEqual(albumSearchLinks({...input,metadata_status:'unavailable',protected_fields:['artist']}),[]);
  assert.equal(albumSearchLinks({...input,metadata_status:'unavailable',protected_fields:['artist','title']}).length,2);
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  let id;
  try {
    const response = await page.request.post(base+'/api/records',{data:{inventory_number:'LP-88601',artist:input.artist,title:input.title}});
    assert(response.ok()); id = (await response.json()).id;
    const before = await (await page.request.get(base+'/api/records/'+id)).json();
    const external = [];
    context.on('request',request=>{if(request.url().startsWith('https://'))external.push(request);});
    await context.route('https://open.spotify.com/**',route=>route.fulfill({contentType:'text/html',body:'<p>Search destination</p>'}));
    await context.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:'<p>Search destination</p>'}));
    await page.goto(base+'/#record/'+id);
    await page.getByRole('link',{name:'Search Spotify'}).waitFor();
    for (const theme of ['gallery','studio','listening']) {
      await page.evaluate(theme=>document.querySelector(`button[data-theme=${theme}]`).click(),theme);
      for (const viewport of [{width:1280,height:900},{width:390,height:844},{width:1024,height:600}]) {
        await page.setViewportSize(viewport);
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        assert(await page.locator('.streaming-links').isVisible());
      }
    }
    assert.equal(external.length,0);
    assert.equal(await page.locator('#detail-content script').count(),0);
    for (const link of links) {
      const anchor = page.getByRole('link',{name:link.label});
      assert.equal(await anchor.getAttribute('target'),'_blank');
      assert.equal(await anchor.getAttribute('rel'),'noopener noreferrer');
      const [popup] = await Promise.all([context.waitForEvent('page'),anchor.click()]);
      await popup.waitForURL(link.url);
      await popup.close();
    }
    assert.equal(external.length,2);
    for(const request of external) assert.equal(request.headers().referer,undefined);
    assert.deepEqual(await (await page.request.get(base+'/api/records/'+id)).json(),before);
    await page.request.put(base+'/api/records/'+id,{data:{inventory_number:'LP-88601',artist:'Edited artist',title:'Edited album'}});
    await page.reload();
    await page.getByRole('link',{name:'Search Spotify'}).waitFor();
    assert.equal(decodeURIComponent(new URL(await page.getByRole('link',{name:'Search Spotify'}).getAttribute('href')).pathname.slice('/search/'.length)),'Edited artist Edited album');
    const record = await (await page.request.get(base+'/api/records/'+id)).json();
    await page.route(base+'/api/records/'+id,route=>route.fulfill({json:{...record,metadata_status:'unavailable',protected_fields:[]}}));
    await page.reload();
    await page.getByRole('button',{name:'Show QR code'}).waitFor();
    assert.equal(await page.locator('.streaming-links').count(),0);
    console.log('Streaming links passed: encoded searches, explicit new tabs, no referrer/preloading, unchanged listening/NFC, edits, unavailable metadata, themes and mobile/Pi layout.');
  } finally {
    if(id)await page.request.delete(base+'/api/records/'+id);
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
