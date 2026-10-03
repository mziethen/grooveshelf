const assert=require('node:assert/strict');const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});const ids=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));try{
 for(const [number,title,tracks] of [['LP-88771','Incomplete record',[]],['LP-88772','With tracks',[{position:'A1',title:'Test track'}]]]){
 const response=await page.request.post(base+'/api/records',{data:{inventory_number:number,artist:'Tools Test Artist',title,tracks}});assert(response.ok());ids.push((await response.json()).id);}
 await page.goto(base);await page.getByRole('searchbox').fill('Tools Test Artist');await page.getByText('2 records',{exact:true}).waitFor();
 await page.locator('#missing-cover').check();await page.getByText('2 of 2 records match',{exact:true}).waitFor();
 await page.locator('#missing-tracks').check();await page.getByText('1 of 2 records match',{exact:true}).waitFor();assert.equal(await page.locator('#collection [data-record]').count(),1);
 await page.locator('#missing-nfc').check();await page.getByRole('button',{name:'Table',exact:true}).click();await page.locator('#collection').getByRole('button',{name:'Incomplete record',exact:true}).click();await page.locator('#details').waitFor({state:'visible'});await page.getByRole('button',{name:'Edit record',exact:true}).click();await page.locator('#record-form [name=tracks]').fill('A1 | Now complete');await page.locator('#save').click();await page.locator('#editor').waitFor({state:'hidden'});await page.getByRole('button',{name:'Close details'}).click();await page.getByText('0 of 2 records match',{exact:true}).waitFor();assert.equal(await page.locator('#empty-add').count(),0);
 await page.locator('#missing-tracks').uncheck();await page.getByText('2 of 2 records match',{exact:true}).waitFor();
 await page.screenshot({path:'/tmp/grooveshelf-tools-mobile.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name:'Export CSV'}).click()]);assert.equal(download.suggestedFilename(),'grooveshelf-collection.csv');
 assert.deepEqual(errors,[]);console.log('Collection tools browser flow passed: combined filters, counts, search, table/details/edit and CSV download.');
 }finally{for(const id of ids)await page.request.delete(base+'/api/records/'+id);await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
