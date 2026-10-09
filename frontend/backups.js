export function createBackups({api,escape}) {
  const $=s=>document.querySelector(s);let generation=0,busy=false;
  const controls=()=>['backups-save','backups-enabled','backups-create','backups-refresh'].forEach(id=>$('#'+id).disabled=busy);
  const inspectionControls=()=>document.querySelectorAll('[data-inspect-backup]').forEach(button=>button.disabled=busy);
  function show(data) {
    $('#backups-enabled').checked=data.enabled;
    $('#backups-status').textContent=`${data.backup_count} saved backup${data.backup_count===1?'':'s'}. ${data.last_created_at ? 'Last created '+new Date(data.last_created_at).toLocaleString()+'. ' : 'No saved backups yet. '}${data.next_due_at ? 'Next scheduled backup '+new Date(data.next_due_at).toLocaleString()+'.' : 'Daily backups are off.'}`;
    $('#backups-error').textContent=data.error||'';
    $('#backups-list').innerHTML=(data.archives||[]).map(a=>`<p><a href="/api/backups/${encodeURIComponent(a.filename)}" download="${escape(a.filename)}">Download backup · ${escape(new Date(a.created_at).toLocaleString())}</a> <small>${escape((a.size_bytes/1024/1024).toFixed(1))} MB</small> <button type="button" data-inspect-backup="${escape(a.filename)}">Check backup</button></p>`).join('');
  }
  async function request(method='GET',body) {
    if(busy)return;
    const current=++generation;busy=true;controls();inspectionControls();$('#backup-inspection').hidden=true;$('#backups-error').textContent='';$('#backups-status').textContent=method==='POST'?'Creating and verifying a complete backup…':'Loading backup status…';
    try {const data=await api('/backups',{method,...(body?{body:JSON.stringify(body)}:{})});if(current===generation)show(data);}
    catch(error){if(current===generation){$('#backups-error').textContent=error.message;$('#backups-status').textContent='The request could not be completed. Refresh status to check saved backups.';}}
    finally {busy=false;controls();inspectionControls();if(current!==generation&&$('#backups').open)request();}
  }
  async function inspect(filename) {
    if(busy)return;
    const current=++generation;busy=true;controls();inspectionControls();
    $('#backup-inspection').hidden=false;
    $('#backup-inspection-status').textContent='Checking archive integrity and collection contents…';
    $('#backup-inspection-details').replaceChildren();
    try {
      const data=await api('/backups/'+encodeURIComponent(filename)+'/inspect',{method:'POST'});
      if(current!==generation)return;
      $('#backup-inspection-status').textContent='Verified. Archive checksums and collection integrity passed. Restore into a separate destination using the archive guide.';
      const labels={records:'Records',albums:'Albums',photos:'Personal photos',nfc_tags:'NFC associations',plays:'Recorded plays',wishlist:'Active wishes',cached_covers:'Cached covers'};
      $('#backup-inspection-details').innerHTML=`<p>${escape(data.filename)}</p><p>Created: ${escape(data.created_at ? new Date(data.created_at).toLocaleString() : 'Not recorded')}</p><dl>${Object.entries(labels).map(([key,label])=>`<dt>${label}</dt><dd>${escape(String(data.counts[key]))}</dd>`).join('')}</dl><p class="muted">This check does not change your collection. Cached provider data keeps its original expiry.</p>`;
    } catch(error) {if(current===generation)$('#backup-inspection-status').textContent=error.message;}
    finally {busy=false;controls();inspectionControls();if(current!==generation&&$('#backups').open)request();}
  }
  $('#backups-list').addEventListener('click',event=>{const button=event.target.closest('[data-inspect-backup]');if(button)inspect(button.dataset.inspectBackup);});
  $('#backups-open').addEventListener('click',()=>{$('#backups').showModal();request();});
  $('#backups-close').addEventListener('click',()=>$('#backups').close());
  $('#backups').addEventListener('close',()=>{generation++;});
  $('#backups-refresh').addEventListener('click',()=>request());
  $('#backups-create').addEventListener('click',()=>request('POST'));
  $('#backups-form').addEventListener('submit',e=>{e.preventDefault();request('PUT',{enabled:$('#backups-enabled').checked});});
}
