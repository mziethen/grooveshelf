export function createBackups({api,escape}) {
  const $=s=>document.querySelector(s);let generation=0,busy=false;
  const controls=()=>['backups-save','backups-enabled','backups-create','backups-refresh'].forEach(id=>$('#'+id).disabled=busy);
  function show(data) {
    $('#backups-enabled').checked=data.enabled;
    $('#backups-status').textContent=`${data.backup_count} saved backup${data.backup_count===1?'':'s'}. ${data.last_created_at ? 'Last created '+new Date(data.last_created_at).toLocaleString()+'. ' : 'No saved backups yet. '}${data.next_due_at ? 'Next scheduled backup '+new Date(data.next_due_at).toLocaleString()+'.' : 'Daily backups are off.'}`;
    $('#backups-error').textContent=data.error||'';
    $('#backups-list').innerHTML=(data.archives||[]).map(a=>`<p><a href="/api/backups/${encodeURIComponent(a.filename)}" download="${escape(a.filename)}">Download backup · ${escape(new Date(a.created_at).toLocaleString())}</a> <small>${escape((a.size_bytes/1024/1024).toFixed(1))} MB</small></p>`).join('');
  }
  async function request(method='GET',body) {
    if(busy)return;
    const current=++generation;busy=true;controls();$('#backups-error').textContent='';$('#backups-status').textContent=method==='POST'?'Creating and verifying a complete backup…':'Loading backup status…';
    try {const data=await api('/backups',{method,...(body?{body:JSON.stringify(body)}:{})});if(current===generation)show(data);}
    catch(error){if(current===generation){$('#backups-error').textContent=error.message;$('#backups-status').textContent='The request could not be completed. Refresh status to check saved backups.';}}
    finally {busy=false;controls();if(current!==generation&&$('#backups').open)request();}
  }
  $('#backups-open').addEventListener('click',()=>{$('#backups').showModal();request();});
  $('#backups-close').addEventListener('click',()=>$('#backups').close());
  $('#backups').addEventListener('close',()=>{generation++;});
  $('#backups-refresh').addEventListener('click',()=>request());
  $('#backups-create').addEventListener('click',()=>request('POST'));
  $('#backups-form').addEventListener('submit',e=>{e.preventDefault();request('PUT',{enabled:$('#backups-enabled').checked});});
}
