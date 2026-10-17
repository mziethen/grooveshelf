const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{const browser=await chromium.launch();try{
 const page=await browser.newPage(),uploads=[],otherWrites=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(['/api/capture/cover-text','/api/capture/cover-matches'].includes(path)){
   uploads.push({path,type:req.headers()['content-type'],data:req.postDataBuffer()});return route.fulfill({json:path.endsWith('cover-text')?{text:'Read text'}:{matches:[],total_matches:0,compared:0,unavailable:0,incomplete:false}});
  }
  if(req.method()!=='GET')otherWrites.push(path);
  return route.fulfill({json:path==='/api/records'?[]:path==='/api/capture/next-inventory'?{inventory_number:'LP-00001'}:{}});
 });
 await page.goto(base);await page.locator('#add').click();await page.locator('#cover-recognition summary').click();
 const base64=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=40;const x=c.getContext('2d');x.fillStyle='red';x.fillRect(0,0,40,40);x.fillStyle='blue';x.fillRect(40,0,40,40);return c.toDataURL('image/png').split(',')[1];});
 const original=Buffer.from(base64,'base64');await page.locator('#recognition-file').setInputFiles({name:'original.png',mimeType:'image/png',buffer:original});
 assert(await page.locator('#recognition-original').isDisabled());await page.locator('#recognition-read').click();await page.locator('#recognition-review').waitFor();
 await page.locator('#recognition-rotate').click();await page.getByText('Photo rotated 90° clockwise',{exact:false}).waitFor();assert(!await page.locator('#recognition-review').isVisible());assert.equal(await page.locator('#recognition-text').inputValue(),'');assert.equal(uploads.length,1);
 await page.locator('#recognition-read').click();await page.locator('#recognition-review').waitFor();await page.locator('#recognition-match').click();await page.locator('#recognition-matches p').waitFor();assert.equal(uploads.length,3);assert.equal(uploads[1].type,'image/jpeg');assert(uploads[1].data.equals(uploads[2].data));
 const pixels=await page.evaluate(async data=>{const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));const image=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);return {width:image.width,height:image.height,top:[...x.getImageData(20,10,1,1).data],bottom:[...x.getImageData(20,70,1,1).data]};},uploads[1].data.toString('base64'));
 assert.equal(pixels.width,40);assert.equal(pixels.height,80);assert(pixels.top[0]>200&&pixels.top[2]<30);assert(pixels.bottom[2]>200&&pixels.bottom[0]<30);
 await page.locator('#recognition-original').click();assert(!await page.locator('#recognition-review').isVisible());assert.equal(await page.locator('#recognition-matches').textContent(),'');await page.locator('#recognition-read').click();await page.locator('#recognition-review').waitFor();assert(uploads.at(-1).data.equals(original));assert.equal(uploads.at(-1).type,'image/png');
 for(const angle of [90,180,270,0]){await page.locator('#recognition-rotate').click();await page.getByText(`Photo rotated ${angle}° clockwise`,{exact:false}).waitFor();}
 for(const theme of ['gallery','studio','listening']){await page.evaluate(t=>document.querySelector(`button[data-theme=${t}]`).click(),theme);for(const width of [320,390,1024]){await page.setViewportSize({width,height:700});assert(await page.locator('#editor').evaluate(e=>e.scrollWidth<=e.clientWidth));}}
 await page.locator('#recognition-file').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not an image')});await page.locator('#recognition-rotate').click();await page.waitForFunction(()=>!document.querySelector('#recognition-rotate').disabled);assert(!await page.locator('#recognition-original').isEnabled());
 await page.getByRole('button',{name:'Close editor',exact:true}).click();await page.locator('#add').click();await page.locator('#cover-recognition summary').click();assert(await page.locator('#recognition-rotate').isDisabled());assert(await page.locator('#recognition-original').isDisabled());assert.deepEqual(otherWrites,[]);assert.deepEqual(errors,[]);
 console.log('Photo rotation passed: prepared pixels reach OCR and matching, original bytes retained, four turns, stale-result clearing, corrupt images, reset and responsive themes without implicit writes.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
