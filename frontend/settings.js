export function createSettings({api,onSaved}) {
  const $=selector=>document.querySelector(selector);let generation=0;
  function fill(data){for(const name of ['automatic_refresh','confirm_import'])$('#settings-form').elements[name].checked=data[name];}
  $('#settings-open').addEventListener('click',async()=>{
    const current=++generation;$('#settings-save').disabled=true;$('#settings-status').textContent='Loading settings…';$('#settings').showModal();
    try{const data=await api('/settings');if(current!==generation)return;fill(data);$('#settings-save').disabled=false;$('#settings-status').textContent='These settings apply to this GrooveShelf installation.';}
    catch(error){if(current===generation)$('#settings-status').textContent=error.message;}
  });
  $('#settings-close').addEventListener('click',()=>$('#settings').close());
  $('#settings').addEventListener('close',()=>{generation++;});
  $('#settings-form').addEventListener('submit',async event=>{
    event.preventDefault();const current=++generation;$('#settings-save').disabled=true;
    const values=Object.fromEntries(['automatic_refresh','confirm_import'].map(name=>[name,event.target.elements[name].checked]));
    try{await api('/settings',{method:'PUT',body:JSON.stringify(values)});if(current!==generation)return;$('#settings-status').textContent='Settings saved.';await onSaved();}
    catch(error){if(current===generation)$('#settings-status').textContent=error.message;}
    finally{if(current===generation)$('#settings-save').disabled=false;}
  });
}
