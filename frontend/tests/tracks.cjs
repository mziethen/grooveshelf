const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {join}=require('node:path');
const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{
 const {trackLine,parseTracks}=await import(pathToFileURL(join(__dirname,'../tracks.js')).href);
 const original=[{position:'A1',title:'Title | with pipes',duration:'3:45'},{position:'',title:'Legacy | title | 3:45'}];
 assert.deepEqual(parseTracks(original.map(trackLine).join('\n'),original),original);
 assert.deepEqual(parseTracks('Opening\nA1 | Song | 3:45\n | Finale | 1:02:03'),[
  {position:'',title:'Opening'},{position:'A1',title:'Song',duration:'3:45'},{position:'',title:'Finale',duration:'1:02:03'}]);
 assert.throws(()=>parseTracks('A1 | Song | 3:99'),/m:ss/);
 const browser=await chromium.launch();const page=await browser.newPage();let id;
 try{
  await page.goto(base);await page.locator('#add').click();
  await page.locator('#record-form [name=inventory_number]').fill('LP-88701');
  await page.locator('#record-form [name=artist]').fill('Timed Artist');
  await page.locator('#record-form [name=title]').fill('Timed Album');
  await page.locator('#record-form [name=tracks]').fill('A1 | Opening song with a deliberately long title that wraps on small screens | 3:45\nB1 | Finale | 1:02:03');
  await page.locator('#save').click();await page.locator('#show-qr').waitFor();
  id=(await(await page.request.get(base+'/api/records')).json()).find(r=>r.inventory_number==='LP-88701').id;
  const durations=page.locator('#detail-content .track-duration');assert.deepEqual(await durations.allTextContents(),['3:45','1:02:03']);
  for(const theme of ['gallery','studio','listening']){
   await page.evaluate(theme=>document.querySelector(`button[data-theme=${theme}]`).click(),theme);
   for(const viewport of [{width:390,height:844},{width:1024,height:600}]){
    await page.setViewportSize(viewport);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   }
  }
  await page.setViewportSize({width:390,height:844});
  await durations.first().scrollIntoViewIfNeeded();
  await page.locator('#details').screenshot({path:'/tmp/grooveshelf-track-durations-mobile.png'});
  await page.locator('#edit').click();assert((await page.locator('#record-form [name=tracks]').inputValue()).includes('3:45'));
  await page.locator('#record-form [name=notes]').fill('Other fields changed');
  await page.locator('#save').click();await page.locator('#editor').waitFor({state:'hidden'});
  assert.deepEqual((await(await page.request.get(base+'/api/records/'+id)).json()).tracks.map(t=>t.duration),['3:45','1:02:03']);
  await page.locator('#edit').click();await page.locator('#record-form [name=tracks]').fill('A1 | Opening | 3:99');
  await page.locator('#save').click();await page.getByText('Use m:ss or h:mm:ss for track durations, for example 3:45.',{exact:true}).waitFor();
  await page.locator('#record-form [name=tracks]').fill('A1 | Opening\nB1 | Finale | 1:02:03');
  await page.locator('#save').click();await page.locator('#editor').waitFor({state:'hidden'});
  let record=await(await page.request.get(base+'/api/records/'+id)).json();assert(!record.tracks[0].duration);assert.equal(record.tracks[1].duration,'1:02:03');
  await page.locator('#close-details').click();
  const preview={discogs_master_id:42,title:'Timed Preview',artist:'Preview Artist',year:2001,
   tracks:[{position:'A1',title:'Preview song',duration:'4:56'}],genres:[],styles:[],labels:[],description:'',source_url:'https://www.discogs.com/master/42',source_name:'Discogs'};
  await page.route('**/api/metadata/discogs/search*',route=>route.fulfill({json:{results:[{id:42,title:'Preview Artist - Timed Preview',year:2001,source_url:preview.source_url}],pages:1}}));
  await page.route('**/api/metadata/discogs/masters/42',route=>route.fulfill({json:preview}));
  await page.locator('#add').click();await page.locator('#record-form [name=artist]').fill('Preview Artist');
  await page.getByRole('button',{name:'Search Discogs',exact:true}).click();
  await page.getByRole('button',{name:'Preview Artist - Timed Preview 2001'}).click();
  await page.locator('.preview-tracks .track-duration').waitFor();assert.equal(await page.locator('.preview-tracks .track-duration').textContent(),'4:56');
  await page.getByRole('button',{name:'Use these details'}).click();assert.equal(await page.locator('#record-form [name=tracks]').inputValue(),'A1 | Preview song | 4:56');
  await page.keyboard.press('Escape');
  console.log('Track durations passed: manual entry, preservation on edits, invalid values, clearing, legacy titles, Discogs preview/import draft, themes and responsive layout.');
 }finally{if(id)await page.request.delete(base+'/api/records/'+id);await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
