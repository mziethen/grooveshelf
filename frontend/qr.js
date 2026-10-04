import qrcode from './vendor/qrcode-generator.js';

export function collectionOrigin(value) {
  let url;
  try {url=new URL(value);} catch {throw Error('Enter a full collection address, for example http://grooveshelf.local:8080.');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Use an HTTP or HTTPS collection address without credentials, a path, query or fragment.');
  if(url.origin.length>300)throw Error('Use a shorter collection address.');
  return url.origin;
}
export function savedOrigin() {
  try {const saved=localStorage.getItem('grooveshelf-qr-origin');if(saved)return collectionOrigin(saved);} catch {}
  return location.origin;
}
export function rememberOrigin(origin) {try {localStorage.setItem('grooveshelf-qr-origin',origin);} catch {}}
export function recordLink(id,origin) {
  if(!/^[a-zA-Z0-9-]{1,100}$/.test(id||''))throw Error('A copy identifier is invalid. Reload the collection.');
  return `${collectionOrigin(origin)}/#record/${id}`;
}
export function recordQR(id,origin) {
  const url=recordLink(id,origin),code=qrcode(0,'M');code.addData(url,'Byte');code.make();
  return {url,modules:code.getModuleCount(),svg:code.createSvgTag({cellSize:1,margin:4,scalable:true})};
}
export function createRecordQR({currentRecord}) {
  const $=selector=>document.querySelector(selector);let record=null,svg='';
  function generate() {
    svg='';$('#qr-preview').replaceChildren();$('#qr-output').hidden=true;$('#qr-error').textContent='';
    try {
      const origin=collectionOrigin($('#qr-origin').value),result=recordQR(record.id,origin);
      rememberOrigin(origin);$('#qr-origin').value=origin;svg=result.svg;$('#qr-preview').innerHTML=svg;
      $('#qr-link').value=result.url;$('#qr-download').disabled=false;$('#qr-output').hidden=false;
    } catch(error) {$('#qr-error').textContent=error.message;$('#qr-download').disabled=true;}
  }
  $('#show-qr').addEventListener('click',()=>{
    record=currentRecord();if(!record)return;$('#qr-copy').textContent=`${record.inventory_number} · ${record.title}`;
    $('#qr-origin').value=savedOrigin();$('#record-qr').showModal();generate();
  });
  $('#qr-close').addEventListener('click',()=>$('#record-qr').close());
  $('#qr-form').addEventListener('submit',event=>{event.preventDefault();generate();});
  $('#qr-origin').addEventListener('input',()=>{svg='';$('#qr-output').hidden=true;$('#qr-preview').replaceChildren();$('#qr-download').disabled=true;});
  $('#qr-download').addEventListener('click',()=>{
    if(!svg)return;const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));const link=document.createElement('a');
    link.href=url;link.download=`grooveshelf-${record.inventory_number}-qr.svg`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
}
