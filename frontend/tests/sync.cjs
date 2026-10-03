const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL || 'http://127.0.0.1:8080';
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const record={id:'sync-copy',album_id:'album',inventory_number:'LP-00001',artist:'My Artist',title:'My Album',format:'LP',year:1990,tracks:[],notes:'Keep my notes',genres:[],styles:[],labels:[],description:'',protected_fields:[],metadata_status:'manual'};
 let imported=null;let applied=[];let releaseLinked=false;
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;let body;
  if(path==='/api/records')body=imported?[record,imported]:[record];
  else if(path==='/api/records/sync-copy')body=record;
  else if(path.endsWith('/plays'))body=[];
  else if(path==='/api/metadata/discogs/releases/100')body={title:'Discogs Album',artist:'Discogs Artist',year:2000,is_vinyl:true,source_url:'https://www.discogs.com/release/100'};
  else if(path.endsWith('/discogs-release')){assert.equal(route.request().postDataJSON().release_id,100);record.discogs_release_id=100;releaseLinked=true;body=record;}
  else if(path==='/api/discogs/sync/preview')body={plan_id:'plan',username:'owner',remote_count:1,last_success_at:null,expires_in_seconds:600,
   actions:applied.length?[]:[{id:'remote',kind:'remote',instance_id:11,release_id:100,artist:'Remote Artist',title:'Remote Album',source_url:'https://www.discogs.com/release/100',matches:[{id:record.id,inventory_number:record.inventory_number,title:record.title}]},{id:'local',kind:'local',copy_id:'local-copy',inventory_number:'LP-00002',title:'Outbound Album',release_id:200,source_url:'https://www.discogs.com/release/200'}],notices:[]};
  else if(path==='/api/discogs/sync/apply'){
   const action=route.request().postDataJSON();applied.push(action);
   if(action.choice==='link'){assert.equal(action.copy_id,record.id);body={status:'linked',copy_id:record.id};}
   else{body={status:'exported',copy_id:'local-copy'};}
  }else body={};
  await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 try{
  await page.clock.install();await page.goto(base);
  await page.getByRole('button',{name:'My Album',exact:false}).click();await page.locator('#link-release').click();
  await page.locator('#release-id').fill('100');await page.locator('#release-load').click();
  await page.locator('#release-preview').getByRole('heading',{name:'Discogs Album'}).waitFor();assert(!releaseLinked);
  await page.locator('#release-save').click();await page.locator('#release-dialog').waitFor({state:'hidden'});
  assert(releaseLinked);assert.equal(record.title,'My Album');
  await page.locator('#close-details').click();await page.locator('#details').waitFor({state:'hidden'});
  await page.locator('#sync-open').click();await page.locator('[data-action="remote"] select').waitFor();
  assert.equal(applied.length,0,'Preview must not write anything');
  await page.locator('[data-action="remote"] select').selectOption('link:sync-copy');
  await page.locator('[data-action="local"] select').selectOption('export');
  assert.equal(applied.length,0,'Choosing actions must not write anything');
  await page.screenshot({path:'/tmp/grooveshelf-sync-mobile.png'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#sync-apply').click();await page.getByText('Copies matched.',{exact:true}).waitFor();
  await page.getByText('Added to Discogs.',{exact:true}).waitFor();assert.equal(applied.length,2);
  await page.locator('#sync-preview').click();await page.getByText('No additions are ready to synchronize.').waitFor();
  assert(await page.locator('#sync-apply').isDisabled());assert.deepEqual(errors,[]);
  console.log('Sync browser flow passed: pressing confirmation, read-only preview, explicit matching/export, progress and repeat preview.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
