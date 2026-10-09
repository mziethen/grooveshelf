export function createSettings({api,onSaved}) {
  const $=selector=>document.querySelector(selector);let generation=0;
  function fill(data){try { const saved=localStorage.getItem('grooveshelf-startup');$('#settings-form').elements.startup_view.value=['collection','archive','listening'].includes(saved)?saved:'last'; } catch { $('#settings-form').elements.startup_view.value='last'; }for(const name of ['automatic_refresh','confirm_import','show_expired_metadata'])$('#settings-form').elements[name].checked=data[name];}
  $('#settings-open').addEventListener('click',async()=>{
    const current=++generation;$('#settings-save').disabled=true;$('#settings-status').textContent='Loading settings…';$('#settings').showModal();
    try{const data=await api('/settings');if(current!==generation)return;fill(data);$('#settings-save').disabled=false;$('#settings-status').textContent='Discogs settings apply to this installation. Startup view applies only to this browser.';}
    catch(error){if(current===generation)$('#settings-status').textContent=error.message;}
  });
  $('#settings-close').addEventListener('click',()=>$('#settings').close());
  $('#settings').addEventListener('close',()=>{generation++;});
  $('#settings-form').addEventListener('submit',async event=>{
    event.preventDefault();const current=++generation;$('#settings-save').disabled=true;
    const startup=event.target.elements.startup_view.value;
    const values=Object.fromEntries(['automatic_refresh','confirm_import','show_expired_metadata'].map(name=>[name,event.target.elements[name].checked]));
    try{const saved=await api('/settings',{method:'PUT',body:JSON.stringify(values)});if(current!==generation)return;try { localStorage.setItem('grooveshelf-startup',startup); } catch { throw new Error('Installation settings saved, but this browser could not remember the startup view. Check browser storage.'); } $('#settings-status').textContent='Settings saved.';await onSaved(saved);}
    catch(error){if(current===generation)$('#settings-status').textContent=error.message;}
    finally{if(current===generation)$('#settings-save').disabled=false;}
  });
}
