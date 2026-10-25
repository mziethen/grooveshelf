const assert=require('node:assert/strict');const {chromium}=require('playwright');
const base=process.env.GROOVESHELF_TEST_URL||'http://127.0.0.1:8080';
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});const ids=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const records=()=>page.request.get(base+'/api/records').then(r=>r.json()).then(list=>list.filter(r=>ids.includes(r.id)));
 try {
  for(const [number,title,location,year] of [['LP-77001','Console One','Shelf Q',1971],['LP-77002','Console Two','Shelf Q',1984],['LP-77003','Console Three','Crate Z',1990]]){
   const response=await page.request.post(base+'/api/records',{data:{inventory_number:number,artist:'Console Test',title,storage_location:location,year,media_condition:number==='LP-77003'?null:'VG+'}});assert(response.ok());ids.push((await response.json()).id);
  }
  // Query language, evaluated without a browser server round trip for filters.
  await page.goto(base);
  const parsed=await page.evaluate(async()=>{const {parseQuery}=await import('/query.js');const r=[{artist:'A',title:'Vol: One',genres:['Jazz'],storage_location:'Shelf B',media_condition:'NM',year:1975,play_count:2,last_played_at:new Date().toISOString()},{artist:'B',title:'X',genres:[],storage_location:'',media_condition:null,year:null,play_count:0,last_played_at:null}];
   return ['genre:jazz','cond:>=VG+','loc:"shelf b" blue','year:1970..1979','played:<30d','played:never','-has:location','rating:none','Vol: One','year:abc'].map(q=>{const p=parseQuery(q);return [p.text,p.chips.length,p.unknown.length,r.map(p.test)];});});
  assert.deepEqual(parsed,[['',1,0,[true,false]],['',1,0,[true,false]],['blue',1,0,[true,false]],['',1,0,[true,false]],['',1,0,[true,false]],['',1,0,[false,true]],['',1,0,[false,true]],['',1,0,[true,true]],['Vol: One',0,0,[true,true]],['',0,1,[true,true]]]);
  // Console appearance with readable contrast.
  await page.locator('.theme-picker summary').click();await page.locator('button[data-theme=console]').click();
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'console');
  const contrast=await page.evaluate(()=>{const rgb=c=>c.match(/\d+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});const lum=c=>{const [r,g,b]=rgb(c);return .2126*r+.7152*g+.0722*b;};const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};const s=getComputedStyle(document.documentElement);const probe=v=>{const e=document.createElement('i');e.style.color=`var(${v})`;document.body.append(e);const c=getComputedStyle(e).color;e.remove();return c;};
   return [ratio(probe('--ink'),probe('--paper')),ratio(probe('--muted'),probe('--surface')),ratio(probe('--muted'),probe('--paper')),ratio(probe('--accent-ink'),probe('--accent')),ratio(probe('--error'),probe('--surface'))];});
  for(const value of contrast)assert(value>=4.5,`contrast ${value}`);
  await page.reload();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'console');
  // Archive filters, views and saved filters.
  await page.locator('#mode-archive').click();
  await page.locator('#search').fill('artist:"Console Test" loc:"Shelf Q"');await page.getByText('2 of',{exact:false}).first().waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('#collection [data-record]').length===2);
  assert.match(await page.locator('#query-status').textContent(),/Filters: artist:"Console Test" · loc:"Shelf Q"/);
  await page.locator('#search').fill('artist:"Console Test" year:abc');await page.locator('#query-status').getByText('Not understood: year:abc',{exact:false}).waitFor();
  await page.locator('#search').fill('artist:"Console Test" no:cond');await page.waitForFunction(()=>document.querySelectorAll('#collection [data-record]').length===1);
  await page.locator('#save-filter').click();await page.reload();
  await page.locator('#quick-views [data-view=\'artist:"Console Test" no:cond\']').waitFor();
  await page.locator('#quick-views').getByRole('button',{name:'All copies',exact:false}).click();assert.equal(await page.locator('#search').inputValue(),'');
  await page.locator('body').click({position:{x:5,y:300}});await page.keyboard.press('Alt+Digit1');
  await page.waitForFunction(()=>document.querySelector('#search').value==='artist:"Console Test" no:cond');
  await page.locator('#quick-views [data-view=\'artist:"Console Test" no:cond\']').evaluate(e=>e.getAttribute('aria-pressed')).then(v=>assert.equal(v,'true'));
  await page.getByRole('button',{name:'Remove saved filter artist:"Console Test" no:cond'}).click();
  assert.equal(await page.locator('#quick-views .saved-filter').count(),0);
  // Selection, inspector and keyboard navigation in the archive.
  await page.locator('#search').fill('artist:"Console Test"');await page.waitForFunction(()=>document.querySelectorAll('#collection [data-record]').length===3);
  await page.locator('#search').blur();await page.locator('body').click({position:{x:5,y:300}});
  await page.keyboard.press('j');await page.locator('#inspector h2').getByText('Console One',{exact:true}).waitFor();
  await page.keyboard.press('j');await page.locator('#inspector h2').getByText('Console Two',{exact:true}).waitFor();
  await page.keyboard.press('x');await page.getByLabel('Select LP-77003').check();
  await page.locator('#selection-count').getByText('2 selected',{exact:true}).waitFor();
  const before=await records();
  await page.locator('body').click({position:{x:5,y:300}});await page.keyboard.press('e');
  await page.locator('#bulk-editor').waitFor({state:'visible'});await page.getByText('2 selected · 3 matching',{exact:false}).or(page.getByText(/^2 selected/)).first().waitFor();
  await page.locator('#bulk-form [name=media_condition]').selectOption('NM');await page.locator('#bulk-review').click();
  await page.getByText('Update 2 copies',{exact:true}).waitFor();
  const diff=await page.locator('#bulk-review-records').textContent();assert.match(diff,/Record condition: VG\+ → NM/);assert.match(diff,/Record condition: Not graded → NM/);
  assert.equal(await page.locator('#bulk-review-records li').count(),2);
  await page.locator('#bulk-close').click();assert.deepEqual(await records(),before);
  await page.locator('#selection-clear').click();assert(await page.locator('#selection-bar').isHidden());
  await page.locator('body').click({position:{x:5,y:300}});await page.keyboard.press('f');
  await page.locator('#inspector [data-inspector=favorite][aria-pressed=true]').waitFor();
  assert.equal((await records()).find(r=>r.title==='Console Three').favorite,true);
  await page.locator('#inspector [data-inspector=favorite]').click();await page.locator('#inspector [data-inspector=favorite][aria-pressed=false]').waitFor();
  // Command palette and shortcut overview.
  await page.keyboard.press('Control+k');await page.locator('#command-palette').waitFor({state:'visible'});
  await page.locator('#palette-input').fill('#LP-77003');await page.locator('#palette-results [aria-selected=true]').getByText('Console Three',{exact:false}).waitFor();
  await page.keyboard.press('Enter');await page.locator('#details').getByRole('heading',{name:'Console Three'}).waitFor();await page.getByRole('button',{name:'Close details'}).click();
  await page.locator('#palette-open').click();await page.locator('#palette-input').fill('>statistics');await page.keyboard.press('Enter');await page.locator('#statistics').waitFor({state:'visible'});await page.keyboard.press('Escape');
  await page.locator('body').click({position:{x:5,y:300}});await page.keyboard.press('?');await page.locator('#shortcuts-dialog').waitFor({state:'visible'});await page.keyboard.press('Escape');
  await page.locator('#search').focus();await page.keyboard.press('2');assert.equal(await page.locator('#search').inputValue(),'artist:"Console Test"2');await page.locator('#search').fill('artist:"Console Test"');
  // Phone layout: bottom tabs replace the top workspace tabs.
  for(const theme of ['console','gallery']){
   await page.evaluate(theme=>document.querySelector(`button[data-theme=${theme}]`).click(),theme);
   for(const [width,height] of [[320,700],[390,844]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
   assert(await page.locator('#mobile-tabs').isVisible());assert(await page.locator('.workspace-tabs').isHidden());
   assert.equal(await page.locator('#mobile-tabs [data-tab=archive]').getAttribute('aria-pressed'),'true');
   await page.locator('#mobile-tabs [data-tab=collection]').click();assert.equal(await page.locator('#mode-collection').getAttribute('aria-pressed'),'true');
   await page.locator('#mobile-tabs [data-tab=commands]').click();await page.locator('#command-palette').waitFor({state:'visible'});await page.keyboard.press('Escape');
   await page.locator('#mobile-tabs [data-tab=archive]').click();await page.setViewportSize({width:1440,height:900});
  }
  assert.deepEqual(errors,[]);
  console.log('Console passed: query language, views and saved filters, contrast, selection with diff review, inspector, keyboard shortcuts, command palette and phone tabs.');
 } finally {
  for(const id of ids)await page.request.delete(base+'/api/records/'+id);
  await page.evaluate(()=>{try{localStorage.removeItem('grooveshelf-saved-filters');localStorage.setItem('grooveshelf-theme','gallery');}catch{}}).catch(()=>{});
  await browser.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
