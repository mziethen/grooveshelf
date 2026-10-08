const assert=require('node:assert/strict');const {chromium}=require('playwright');const {PNG}=require('pngjs');const {openRecordTools}=require('./navigation.cjs');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{
 const browser=await chromium.launch();const page=await browser.newPage();let id,releaseUpload;
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const png=new PNG({width:160,height:160});for(let i=0;i<png.data.length;i+=4){png.data[i]=180;png.data[i+1]=100;png.data[i+2]=45;png.data[i+3]=255;}const image=PNG.sync.write(png);
 let uploads=0;
 try{
  const created=await page.request.post(base+'/api/records',{data:{inventory_number:'LP-88771',artist:'Photo Artist',title:'Photo Album'}});assert(created.ok());id=(await created.json()).id;
  await page.route(base+'/api/records/'+id+'/photos?**',async route=>{
   uploads++;if(uploads===1){await route.fulfill({status:503,json:{detail:'Please retry this photo.'}});return;}
   const response=await route.fetch();await new Promise(resolve=>releaseUpload=resolve);await route.fulfill({response});
  });
  await page.goto(base+'/#record/'+id);await page.locator('#details').waitFor();await openRecordTools(page);await page.locator('#manage-photos').click();
  await page.locator('#photos-status').getByText(/No personal photos yet/).waitFor();
  await page.locator('#photo-form [name=kind]').selectOption('back');await page.locator('#photo-form [name=caption]').fill('My <script>sleeve</script>');
  await page.locator('#photo-form [name=file]').setInputFiles({name:'sleeve.png',mimeType:'image/png',buffer:image});
  await page.locator('#photo-upload').click();await page.locator('#photos-error').getByText('Please retry this photo.',{exact:true}).waitFor();
  assert.equal(await page.locator('#photo-form [name=caption]').inputValue(),'My <script>sleeve</script>');
  await page.locator('#photo-upload').click();await page.waitForFunction(()=>document.querySelector('#photo-upload').disabled);
  await page.waitForFunction(()=>document.querySelector('#photo-form [name=file]').disabled);
  await page.locator('#photo-form').evaluate(form=>form.requestSubmit());
  while(!releaseUpload)await page.waitForTimeout(20);
  assert.equal(uploads,2);releaseUpload();
  await page.locator('#photos-status').getByText('1 of 12 photos saved for this copy.',{exact:true}).waitFor();
  assert.equal(await page.locator('#photo-preview-caption').textContent(),'My <script>sleeve</script>');
  assert.equal(await page.locator('#photos script').count(),0);
  await page.locator('#photo-use-cover').click();await page.locator('#photo-preview-title').getByText('Back cover · Selected cover',{exact:true}).waitFor();
  await page.locator('#photos-close').click();await page.locator('#detail-overview .cover img').waitFor();
  const cover=await page.locator('#detail-overview .cover img').getAttribute('src');assert(cover.startsWith('/api/photos/'));
  await page.reload();await page.locator('#detail-overview .cover img').waitFor();assert.equal(await page.locator('#detail-overview .cover img').getAttribute('src'),cover);
  await openRecordTools(page);await page.locator('#manage-photos').click();await page.locator('#photo-preview-title').getByText(/Selected cover/).waitFor();
  for(const theme of ['gallery','studio','listening']){
   await page.evaluate(theme=>document.querySelector(`button[data-theme=${theme}]`).click(),theme);
   for(const viewport of [{width:390,height:844},{width:1024,height:600}]){
    await page.setViewportSize(viewport);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   }
  }
  await page.locator('#photos').evaluate(dialog=>dialog.scrollTop=0);
  await page.waitForFunction(()=>document.querySelector('#photo-preview-image').complete&&document.querySelector('#photo-preview-image').naturalWidth>0);
  await page.locator('#photos').screenshot({path:'/tmp/grooveshelf-personal-photos-pi.png'});
  await page.locator('#photo-album-cover').click();await page.waitForFunction(()=>document.querySelector('#photo-album-cover').disabled&&!document.querySelector('#photo-upload').disabled);
  assert.equal((await(await page.request.get(base+'/api/records/'+id)).json()).personal_cover_url,null);
  await page.locator('#photo-use-cover').click();await page.locator('#photo-preview-title').getByText(/Selected cover/).waitFor();
  await page.locator('#photo-delete').click();await page.locator('#photo-remove-cancel').click();assert.equal((await(await page.request.get(base+'/api/records/'+id+'/photos')).json()).length,1);
  await page.locator('#photo-delete').click();await page.locator('#photo-remove-confirm').click();await page.locator('#photo-remove').waitFor({state:'hidden'});
  await page.locator('#photos-status').getByText(/No personal photos yet/).waitFor();assert.equal((await page.request.get(base+cover)).status(),404);
  await page.unrouteAll({behavior:'wait'});
  const descriptor=(await(await page.request.post(base+'/api/records/'+id+'/photos?kind=label',{data:image,headers:{'Content-Type':'image/png'}})).json());
  await page.request.put(base+'/api/records/'+id+'/personal-cover',{data:{photo_id:descriptor.id}});
  // Browser expiry must retain personal covers even when provider details hide.
  await page.route(base+'/api/records/'+id,async route=>{
   const response=await route.fetch();await route.fulfill({json:{...await response.json(),metadata_status:'current',metadata_expires_at:1,show_expired_metadata:false,protected_fields:['artist','title']}});
  });
  await page.locator('#photos-close').click();await page.reload();await page.locator('#detail-overview .cover img').waitFor();
  assert.equal(await page.locator('#detail-overview .cover img').getAttribute('src'),descriptor.url);
  assert.deepEqual(errors,[]);console.log('Personal photos passed: upload validation/retry, guarded binary save, escaped captions, cover persistence, album fallback, confirmed deletion, expiry and responsive themes.');
 }finally{if(releaseUpload)releaseUpload();await page.unrouteAll({behavior:'wait'});if(id)await page.request.delete(base+'/api/records/'+id);await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
