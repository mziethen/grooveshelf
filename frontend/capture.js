export function createCapture({api,escape,currentIdentity}) {
  const $=selector=>document.querySelector(selector);
  const form=$('#record-form');let generation=0;let editorGeneration=0;let timer;let lastQuery='';let lastMatches='';let editing=false;
  function clear(){lastQuery='';lastMatches='';$('#duplicate-confirm').checked=false;$('#duplicate-panel').hidden=true;$('#duplicate-results').replaceChildren();}
  function query(){const identity=currentIdentity();return {artist:form.elements.artist.value,title:form.elements.title.value,discogs_master_id:identity.masterId,discogs_release_id:identity.releaseId,exclude_id:identity.editingId};}
  async function check(required=false,forSave=false) {
    if(forSave)clearTimeout(timer);
    const values=query();const fingerprint=JSON.stringify(values);const current=++generation;
    if(!values.discogs_master_id&&!values.discogs_release_id&&(!values.artist.trim()||!values.title.trim())){clear();return true;}
    try {
      const data=await api('/capture/duplicates',{method:'POST',body:JSON.stringify(values)});
      if(current!==generation)return false;
      if(!Array.isArray(data.matches))throw new Error('Unexpected duplicate response.');
      const matches=JSON.stringify(data.matches.map(match=>match.id));
      if(fingerprint!==lastQuery||matches!==lastMatches)$('#duplicate-confirm').checked=false;
      lastQuery=fingerprint;lastMatches=matches;
      $('#duplicate-panel').hidden=!data.total;
      $('#duplicate-confirm-row').hidden=editing;
      $('#duplicate-results').innerHTML=data.matches.map(match=>`<li><a href="/#record/${encodeURIComponent(match.id)}" target="_blank" rel="noopener">${escape(match.inventory_number)} · ${escape(match.artist)} · ${escape(match.title)}</a><small>${escape(match.reason)}</small></li>`).join('');
      $('#duplicate-count').textContent=data.total>data.matches.length?`Showing ${data.matches.length} of ${data.total} possible matches.`:`${data.total} existing ${data.total===1?'copy':'copies'} may match.`;
      $('#capture-status').textContent='';
      return !required||!data.total||$('#duplicate-confirm').checked;
    } catch(error){if(current===generation)$('#capture-status').textContent='Duplicate checking is unavailable. You can still save; review your collection if needed.';return current===generation;}
  }
  function changed(){generation++;clearTimeout(timer);$('#duplicate-confirm').checked=false;timer=setTimeout(()=>check(),250);}
  for(const name of ['artist','title'])form.elements[name].addEventListener('input',changed);
  async function suggest(after=null) {
    const current=editorGeneration;const initial=form.elements.inventory_number.value;
    try {
      const data=await api(`/capture/next-inventory${after?`?after=${encodeURIComponent(after)}`:''}`);
      if(current!==editorGeneration||!$('#editor').open||form.elements.inventory_number.value!==initial)return;
      if(/^LP-(?!00000)[0-9]{5}$/.test(data.inventory_number||''))form.elements.inventory_number.value=data.inventory_number;
    } catch(error){if(current===editorGeneration)$('#capture-status').textContent='A free LP number could not be suggested. Enter an unused number manually.';}
  }
  $('#suggest-inventory').addEventListener('click',()=>suggest());
  $('#editor').addEventListener('close',()=>{generation++;editorGeneration++;clearTimeout(timer);});
  return {
    reset(isEditing,after=null){generation++;editorGeneration++;clearTimeout(timer);editing=isEditing;clear();$('#capture-status').textContent='';$('#capture-next-options').hidden=isEditing;$('#save-next').hidden=isEditing;$('#suggest-inventory').hidden=isEditing;if(!isEditing)suggest(after);},
    changed,check
  };
}
