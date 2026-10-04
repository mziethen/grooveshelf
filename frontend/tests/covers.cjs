const {openRecordTools}=require('./navigation.cjs');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const base = process.env.GROOVESHELF_TEST_URL || 'http://127.0.0.1:8080';
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const images=['a'.repeat(32),'b'.repeat(32)].map((id,i)=>({id,type:i?'secondary':'primary',preview_url:`/api/metadata/discogs/masters/42/images/${id}`}));
  const preview={discogs_master_id:42,title:'Cover Album',artist:'Artist',year:2000,tracks:[],genres:[],styles:[],labels:[],description:'',source_url:'https://www.discogs.com/master/42',images};
  let record=null;
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;let body;
    if(path.includes('/images/') || path.startsWith('/api/covers/')){
      await route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZxkAAAAASUVORK5CYII=','base64')});return;
    }
    if(path.endsWith('/search'))body={results:[{id:42,title:'Artist - Cover Album'}],pages:1};
    else if(path.endsWith('/masters/42'))body=preview;
    else if(path==='/api/records' && route.request().method()==='POST'){
      record={...preview,...route.request().postDataJSON(),id:'cover-copy',album_id:'album',protected_fields:[],cover_selection_status:'selected',metadata_status:'current'};
      record.cover_url=`/api/covers/discogs/42/${record.cover_image_id}?v=1`;body=record;
    }
    else if(path==='/api/records')body=record?[record]:[];
    else if(path.endsWith('/cover-options'))body={images,selected_id:record.cover_image_id,selection_status:record.cover_selection_status,source_url:preview.source_url};
    else if(path.endsWith('/cover')){
      record.cover_image_id=route.request().postDataJSON().image_id;
      record.cover_url=record.cover_image_id?`/api/covers/discogs/42/${record.cover_image_id}?v=2`:'/api/covers/discogs/42';
      record.cover_selection_status=record.cover_image_id?'selected':'default';body=record;
    }
    else if(path.endsWith('/plays'))body=[];
    else body=record;
    await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  try{
    await page.goto(base);await page.locator('#add').click();
    await page.getByLabel('Artist',{exact:true}).fill('Artist');await page.locator('#discogs-search').click();
    await page.getByRole('button',{name:'Artist - Cover Album'}).click();
    await page.getByRole('button',{name:'Select image 2',exact:true}).click();
    assert.equal(await page.locator('#discogs-cover-gallery .cover-preview img').getAttribute('src'),images[1].preview_url);
    await page.locator('#discogs-use').click();await page.getByLabel('Inventory number',{exact:false}).fill('LP-99885');await page.locator('#save').click();
    await page.locator('#details').waitFor({state:'visible'});assert.equal(record.cover_image_id,images[1].id);
    await openRecordTools(page);await page.locator('#choose-cover').click();await page.locator('#cover-picker-gallery').getByRole('button',{name:'Select image 1',exact:true}).click();
    await page.locator('#cover-picker-cancel').click();assert.equal(record.cover_image_id,images[1].id);
    await openRecordTools(page);await page.locator('#choose-cover').click();await page.locator('#cover-picker-gallery').getByRole('button',{name:'Select image 1',exact:true}).click();
    await page.locator('#cover-picker-save').click();await page.locator('#cover-picker').waitFor({state:'hidden'});
    assert.equal(record.cover_image_id,images[0].id);
    await openRecordTools(page);await page.locator('#choose-cover').click();await page.locator('#cover-picker-gallery').getByRole('button',{name:'Use default cover'}).click();
    await page.screenshot({path:'/tmp/grooveshelf-cover-picker.png'});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('#cover-picker-save').click();await page.locator('#cover-picker').waitFor({state:'hidden'});assert.equal(record.cover_image_id,null);
    assert.deepEqual(errors,[]);console.log('Cover browser flow passed: import selection, preview, cancel, replacement and default cover.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
