const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.GROOVESHELF_TEST_URL || 'http://127.0.0.1:8080';
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const record={id:'listening-copy',album_id:'album',inventory_number:'LP-99883',artist:'Station Artist',title:'Listening Album',format:'LP',year:2020,tracks:[],notes:'',genres:[],styles:[],labels:[],description:'',protected_fields:[],metadata_status:'manual',favorite:false,play_count:0,last_played_at:null,nfc_uid:null};
  let history=[];
  const station={id:'pi-main',name:'Raspberry Pi',scan_sequence:0,unknown_uid:null,session:null};
  let assignment=null;
  await page.route('**/api/**',async route=>{
    const request=route.request();const path=new URL(request.url()).pathname;let body;
    if(path==='/api/stations/pi-main')body=station;
    else if(path==='/api/stations/pi-main/end'){station.session.status='canceled';body=station;}
    else if(path.startsWith('/api/tags/') && request.method()==='PUT'){
      assignment=request.postDataJSON();record.nfc_uid=decodeURIComponent(path.split('/').pop());station.unknown_uid=null;body={uid:record.nfc_uid,copy_id:record.id};
    }
    else if(path==='/api/records')body=[record];
    else if(path===`/api/records/${record.id}`)body=record;
    else if(path===`/api/records/${record.id}/favorite`){record.favorite=request.postDataJSON().favorite;body={favorite:record.favorite};}
    else if(path===`/api/records/${record.id}/plays` && request.method()==='POST'){
      const value=request.postDataJSON();history=[{id:'manual-play',played_at:value.played_at,origin:'manual'}];record.play_count=1;record.last_played_at=value.played_at;body=history[0];
    }
    else if(path===`/api/records/${record.id}/plays`)body=history;
    else if(path==='/api/plays/manual-play' && request.method()==='DELETE'){
      history=[];record.play_count=0;record.last_played_at=null;await route.fulfill({status:204});return;
    }
    else{await route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({detail:'Not found'})});return;}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  try{
    await page.goto(`${base}/?station=pi-main`);
    await page.locator('#station-status').getByText('Listening station is ready. Waiting for scans.').waitFor();
    station.unknown_uid='04AABBCCDD1183';station.scan_sequence++;
    await page.getByRole('button',{name:'Assign this tag',exact:true}).click();
    await page.locator('#station-tag-save').click();
    await page.locator('#station-tag-editor').waitFor({state:'hidden'});
    assert.equal(assignment.copy_id,record.id);
    station.session={id:'session',copy_id:record.id,status:'pending',remaining_seconds:600};station.scan_sequence++;
    await page.locator('#details').waitFor({state:'visible'});
    await page.locator('#detail-station-status').getByText(/10:00/).waitFor();
    await page.locator('#detail-station-end').click();
    await page.locator('#detail-station-status').getByText(/canceled/).waitFor();
    assert.equal(record.play_count,0);
    await page.getByRole('button',{name:'☆ Add to favorites',exact:true}).click();
    await page.getByRole('button',{name:'★ Favorite',exact:true}).waitFor();
    assert.equal(record.favorite,true);
    await page.getByRole('button',{name:'Add a play',exact:true}).click();
    await page.getByRole('button',{name:'Save play',exact:true}).click();
    await page.locator('#play-history').getByText('Added manually').waitFor();
    assert.equal(record.play_count,1);
    await page.locator('#play-history').getByRole('button',{name:'Remove',exact:true}).click();
    await page.getByRole('button',{name:'Remove event',exact:true}).click();
    await page.locator('#play-history').getByText('No listening events yet.').waitFor();
    assert.equal(record.play_count,0);
    await page.getByRole('button',{name:'Replace tag',exact:true}).click();
    await page.locator('#tag-uid').fill('04AABBCCDD1184');await page.locator('#tag-replace').check();
    await page.locator('#tag-save').click();await page.locator('#tag-editor').waitFor({state:'hidden'});
    assert.equal(assignment.replace,true);assert.equal(record.nfc_uid,'04AABBCCDD1184');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:'/tmp/grooveshelf-listening-mobile.png',fullPage:true});
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('Listening browser flow passed: unknown tag assignment, scan navigation, countdown, cancellation, favorites, manual history and tag replacement.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
