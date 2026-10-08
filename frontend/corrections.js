export function createCorrections({api, escape, currentRecord, onSaved}) {
  const $=selector=>document.querySelector(selector);
  const labels={artist:'Artist',title:'Album title',year:'Saved year',tracks:'Track list'};
  let generation=0, preview=null, recordId=null, saving=false, expiryTimer;
  function valueMarkup(field,value){
    if(field==='tracks') return value?.length ? `<ol>${value.map(track=>`<li>${escape(track.position || '')} ${escape(track.title)}${track.duration ? ` · ${escape(track.duration)}` : ''}</li>`).join('')}</ol>` : '<p class="muted">No tracks provided</p>';
    return `<p>${value===null || value===undefined ? 'Not provided' : escape(value)}</p>`;
  }
  $('#review-corrections').addEventListener('click',async()=>{
    if(saving || $('#corrections').open) return;
    const current=++generation; recordId=currentRecord().id;preview=null;
    clearTimeout(expiryTimer);$('#corrections-fields').replaceChildren();$('#corrections-error').textContent='';
    $('#corrections-source').hidden=true;$('#corrections-save').disabled=true;
    $('#corrections-status').textContent='Loading your corrections…';$('#corrections').showModal();
    try{
      const data=await api(`/records/${recordId}/corrections`);
      if(current!==generation)return;preview=data;
      $('#corrections-status').textContent=data.fields.length ? `${data.inventory_number} · Snapshot checked ${data.metadata_checked_at ? new Date(data.metadata_checked_at*1000).toLocaleString() : 'at an unknown time'}.${data.metadata_status==='stale' ? ' These saved values may be outdated.' : ''}` : 'This record has no protected metadata corrections.';
      $('#corrections-source').href=data.source_url;$('#corrections-source').hidden=false;
      $('#corrections-fields').innerHTML=data.fields.map(item=>`<fieldset class="correction-field"><legend>${labels[item.field]}</legend><div class="correction-comparison"><section><h3>Your saved value</h3>${valueMarkup(item.field,item.current)}</section><section><h3>Saved Discogs value</h3>${item.available ? valueMarkup(item.field,item.provider) : '<p class="muted">No usable provider value is saved for this field.</p>'}</section></div><label class="checkbox-label"><input type="radio" name="${item.field}" value="keep" checked> Keep my correction</label><label class="checkbox-label"><input type="radio" name="${item.field}" value="provider" ${item.available ? '' : 'disabled'}> Use saved Discogs value</label><p class="muted">Using Discogs removes protection for this field, allowing future refreshes to update it.</p></fieldset>`).join('');
      $('#corrections-save').disabled=!data.fields.length;
      if(data.metadata_expires_at) expiryTimer=setTimeout(()=>{
        if(current!==generation)return;
        if(data.show_expired_metadata){$('#corrections-status').textContent=`${data.inventory_number} · Snapshot checked ${data.metadata_checked_at ? new Date(data.metadata_checked_at*1000).toLocaleString() : 'at an unknown time'}. These saved values are older than six hours and may be outdated.`;return;}
        preview=null;$('#corrections-fields').replaceChildren();$('#corrections-save').disabled=true;
        $('#corrections-status').textContent='This Discogs snapshot has expired. Close the review and refresh the record before comparing again.';
      },Math.max(0,data.metadata_expires_at*1000-Date.now()));
    }catch(error){if(current===generation){$('#corrections-status').textContent='The review could not be loaded.';$('#corrections-error').textContent=error.message;}}
  });
  $('#corrections-form').addEventListener('submit',async event=>{
    event.preventDefault();if(saving || !preview || $('#corrections-save').disabled)return;
    const current=generation, id=recordId, revision=preview.revision;
    const choices=Object.fromEntries(preview.fields.map(item=>[item.field,event.target.elements[item.field].value]));
    saving=true;$('#corrections-save').disabled=true;$('#corrections-error').textContent='';
    $('#corrections-fields').querySelectorAll('input').forEach(input=>input.disabled=true);
    try{
      await api(`/records/${id}/corrections`,{method:'PUT',body:JSON.stringify({revision,choices})});
      if(current===generation)$('#corrections').close();await onSaved();
    }catch(error){if(current===generation)$('#corrections-error').textContent=error.message;}
    finally{
      saving=false;
      if(current===generation && preview){
        $('#corrections-save').disabled=false;
        for(const item of preview.fields)event.target.querySelectorAll(`input[name="${item.field}"]`).forEach(input=>input.disabled=input.value==='provider'&&!item.available);
      }
    }
  });
  for(const id of ['corrections-close','corrections-cancel'])$('#'+id).addEventListener('click',()=>$('#corrections').close());
  $('#corrections').addEventListener('close',()=>{generation++;clearTimeout(expiryTimer);preview=null;});
}
