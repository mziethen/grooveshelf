import {collectionOrigin,recordQR,savedOrigin,rememberOrigin} from './qr.js';

export function labelDocument(numbers, values, escape, records=[]) {
  const paper=values.paper==='A4'?[210,297]:values.paper==='Letter'?[215.9,279.4]:null;
  const config=Object.fromEntries(['columns','width','height','margin_x','margin_y','gap_x','gap_y','skip'].map(key=>[key,Number(values[key])]));
  if(!paper||Object.values(config).some(value=>!Number.isFinite(value)))throw Error('Enter valid label dimensions.');
  const {columns,width,height,margin_x:mx,margin_y:my,gap_x:gx,gap_y:gy,skip}=config;
  if(!Number.isInteger(columns)||columns<1||columns>10||width<20||height<10||[mx,my,gx,gy,skip].some(value=>value<0)||!Number.isInteger(skip))throw Error('Check label dimensions, columns and unused starting positions.');
  if(columns*width+(columns-1)*gx+2*mx>paper[0]+0.001)throw Error('The columns, gaps and margins do not fit this page width.');
  const rows=Math.floor((paper[1]-2*my+gy+0.001)/(height+gy));
  if(rows<1)throw Error('The label height and margins do not fit this page.');
  const capacity=rows*columns;
  if(skip>=capacity)throw Error('Used labels must be fewer than the labels on one sheet.');
  if(!numbers.length)throw Error('Select at least one record.');
  if(numbers.some(number=>!/^LP-(?!00000)[0-9]{5}$/.test(number)))throw Error('An inventory number is invalid. Refresh the collection.');
  const qrEnabled=values.qr==='on'||values.qr===true;
  const origin=qrEnabled?collectionOrigin(values.qr_origin):null;
  const qrSize=Math.min(width-8,height-12,48);
  if(qrEnabled&&(width<30||height<30))throw Error('QR labels need at least 30 × 30 mm. Increase the label dimensions.');
  const labels=numbers.map(number=>{
    if(!qrEnabled)return `<div class="label">${escape(number)}</div>`;
    const record=records.find(record=>record.inventory_number===number);
    if(!record)throw Error('Reload the collection to generate QR labels.');
    const qr=recordQR(record.id,origin);
    if(qrSize/(qr.modules+8)<.4)throw Error('The QR code is too dense for this label. Use a shorter collection address or increase the label dimensions.');
    return `<div class="label qr-label">${qr.svg}<span>${escape(number)}</span></div>`;
  });
  const slots=[...Array(skip).fill('<div class="label"></div>'),...labels];const pages=[];
  for(let offset=0;offset<slots.length;offset+=capacity)pages.push(`<section class="sheet">${slots.slice(offset,offset+capacity).join('')}</section>`);
  const font=Math.min(16,(width-4)*72/25.4/5.2);
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>GrooveShelf inventory labels</title><style>@page{size:${values.paper};margin:0}*{box-sizing:border-box}body{margin:0;background:#ddd}.sheet{width:${paper[0]}mm;height:${paper[1]}mm;padding:${my}mm ${mx}mm;display:grid;grid-template-columns:repeat(${columns},${width}mm);grid-auto-rows:${height}mm;gap:${gy}mm ${gx}mm;align-content:start;background:white;margin:0 auto 8mm;break-after:page;overflow:hidden}.sheet:last-child{break-after:auto}.label{display:flex;align-items:center;justify-content:center;font:bold ${font}pt monospace;white-space:nowrap;border:1px dashed #bbb}.qr-label{flex-direction:column;gap:1.5mm;font-size:10pt}.qr-label svg{width:${qrSize}mm;height:${qrSize}mm;flex:none;display:block;background:white}@media print{body{background:white}.sheet{margin:0}.label{border:0}}</style></head><body>${pages.join('')}</body></html>`;
  return {html,pages:pages.length,rows,columns,capacity};
}

export function createLabels({api,escape}) {
  const $=selector=>document.querySelector(selector);let records=[];let selected=new Set();let generation=0;let documentHtml='';
  function invalidate(){documentHtml='';$('#labels-output').hidden=true;$('#labels-preview').removeAttribute('srcdoc');}
  function render(){
    const visible=records.filter(record=>record.inventory_number.toLowerCase().includes($('#labels-filter').value.trim().toLowerCase()));
    $('#labels-count').textContent=`${selected.size} selected · ${visible.length} visible`;
    $('#labels-records').innerHTML=visible.map(record=>`<label><input type="checkbox" data-label-record="${escape(record.id)}" ${selected.has(record.id)?'checked':''}> ${escape(record.inventory_number)}</label>`).join('')||'<p class="muted">No LP numbers match.</p>';
    $('#labels-records').querySelectorAll('input').forEach(input=>input.addEventListener('change',()=>{if(input.checked)selected.add(input.dataset.labelRecord);else selected.delete(input.dataset.labelRecord);invalidate();$('#labels-count').textContent=`${selected.size} selected · ${visible.length} visible`;}));
  }
  $('#labels-open').addEventListener('click',async()=>{
    const current=++generation;records=[];selected.clear();$('#labels-filter').value='';$('#labels-form [name=qr_origin]').value=savedOrigin();invalidate();render();$('#labels-error').textContent='Loading LP numbers…';$('#labels').showModal();
    try{const data=await api('/records');if(current!==generation)return;records=data;render();$('#labels-error').textContent=records.length?'':'Your collection is empty. Add records before printing labels.';}
    catch(error){if(current===generation)$('#labels-error').textContent=error.message;}
  });
  $('#labels-close').addEventListener('click',()=>$('#labels').close());
  $('#labels').addEventListener('close',()=>{generation++;invalidate();});
  $('#labels-filter').addEventListener('input',render);
  $('#labels-select').addEventListener('click',()=>{for(const record of records)if(record.inventory_number.toLowerCase().includes($('#labels-filter').value.trim().toLowerCase()))selected.add(record.id);invalidate();render();});
  $('#labels-clear').addEventListener('click',()=>{selected.clear();invalidate();render();});
  $('#labels-qr').addEventListener('change',event=>{$('#labels-qr-address').hidden=!event.target.checked;$('#labels-form [name=qr_origin]').disabled=!event.target.checked;invalidate();});
  $('#labels-form').addEventListener('input',invalidate);
  $('#labels-form').addEventListener('submit',event=>{
    event.preventDefault();invalidate();$('#labels-error').textContent='';
    try{const result=labelDocument(records.filter(record=>selected.has(record.id)).map(record=>record.inventory_number),Object.fromEntries(new FormData(event.target)),escape,records);if($('#labels-qr').checked)rememberOrigin(collectionOrigin(event.target.elements.qr_origin.value));documentHtml=result.html;$('#labels-preview').srcdoc=documentHtml;$('#labels-output').hidden=false;$('#labels-print').disabled=true;$('#labels-layout').textContent=`${result.pages} ${result.pages===1?'page':'pages'} · ${result.columns} columns × ${result.rows} rows · ${selected.size} labels`;}catch(error){$('#labels-error').textContent=error.message;}
  });
  function fitPreview(){
    if(!documentHtml)return;
    const frame=$('#labels-preview');const doc=frame.contentDocument;const sheet=doc?.querySelector('.sheet');if(!sheet)return;
    let style=doc.querySelector('#preview-scale');if(!style){style=doc.createElement('style');style.id='preview-scale';doc.head.append(style);}
    const scale=Math.min(1,Math.max(.1,(frame.clientWidth-24)/parseFloat(frame.contentWindow.getComputedStyle(sheet).width)));
    style.textContent=`@media screen{.sheet{zoom:${scale}}}`;
  }
  $('#labels-preview').addEventListener('load',()=>{fitPreview();$('#labels-print').disabled=!documentHtml;});
  new ResizeObserver(fitPreview).observe($('#labels-preview'));
  $('#labels-print').addEventListener('click',()=>{if(documentHtml){$('#labels-preview').contentWindow.focus();$('#labels-preview').contentWindow.print();}});
  $('#labels-download').addEventListener('click',()=>{if(!documentHtml)return;const url=URL.createObjectURL(new Blob([documentHtml],{type:'text/html;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='grooveshelf-labels.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
}
