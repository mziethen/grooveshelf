const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {openNavigation}=require('./navigation.cjs');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{const browser=await chromium.launch();try{
 const page=await browser.newPage(),writes=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 const actions=Array.from({length:30},(_,i)=>({id:'layout-'+i,kind:'remote',title:'An evening record '+i,artist:'The Quartet',instance_id:i+1,release_id:i+100,matches:[],source_url:'https://www.discogs.com/release/'+(i+100)}));
 await page.route('**/api/**',route=>{if(route.request().method()!=='GET')writes.push(route.request().url());return route.fulfill({json:new URL(route.request().url()).pathname==='/api/discogs/sync/preview'?{plan_id:'layout',username:'owner',remote_count:30,expires_in_seconds:600,actions,notices:[]}:[]});});
 await page.goto(base);await openNavigation(page);await page.locator('#sync-open').click();await page.locator('[data-action="layout-29"]').waitFor({state:'attached'});
 await page.locator('[data-action="layout-0"] select').selectOption('import');await page.locator('[data-action="layout-29"] select').selectOption('import');
 async function footerReachable(id,button){
  const facts=await page.locator('#'+id).evaluate((dialog,buttonId)=>{const footer=dialog.querySelector(':scope>.actions'),content=dialog.querySelector('.sync-workspace-content'),b=document.getElementById(buttonId),r=b.getBoundingClientRect(),f=footer.getBoundingClientRect(),c=content.getBoundingClientRect();return {inside:r.top>=0&&r.bottom<=innerHeight,uncovered:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),separate:c.bottom<=f.top+1,overflow:dialog.scrollWidth>dialog.clientWidth};},button);
  assert(facts.inside&&facts.uncovered&&facts.separate&&!facts.overflow,JSON.stringify(facts));
 }
 for(const theme of ['gallery','studio','listening']){await page.evaluate(t=>document.querySelector(`button[data-theme=${t}]`).click(),theme);for(const [width,height] of [[320,600],[390,844],[1024,600],[800,480],[1440,900]]){
  await page.setViewportSize({width,height});await page.locator('#sync-dialog .sync-workspace-content').evaluate(e=>e.scrollTop=0);await footerReachable('sync-dialog','sync-apply');
  await page.locator('[data-action="layout-29"] select').scrollIntoViewIfNeeded();await footerReachable('sync-dialog','sync-apply');
  const last=await page.locator('[data-action="layout-29"] select').boundingBox(),footer=await page.locator('#sync-dialog>.actions').boundingBox();assert(last.y+last.height<=footer.y+1);
  await page.locator('#sync-apply').click();assert.equal(await page.locator('#sync-review-items li').count(),2);await footerReachable('sync-review','sync-review-confirm');await page.locator('#sync-review-back').click();
  assert.equal(await page.locator('[data-action="layout-29"] select').inputValue(),'import');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }}
 await page.locator('#sync-apply').focus();assert(await page.locator('#sync-apply').evaluate(e=>e===document.activeElement));assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 await page.screenshot({path:'/tmp/grooveshelf-sync-workspace.png'});
 console.log('Sync layout passed: long plans, persistent preview/review actions, exposed final row, preserved selections, keyboard focus, no writes and responsive themes.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
