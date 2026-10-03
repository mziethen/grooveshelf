export function createStatistics({api,escape,onOpen}) {
  const $=selector=>document.querySelector(selector);let generation=0;let expiry;
  function clear(){clearTimeout(expiry);$('#stats-result').replaceChildren();}
  async function load(){
    clear();const current=++generation;$('#stats-status').textContent='Loading listening statistics…';
    const params=new URLSearchParams();for(const name of ['start','end'])if($('#stats-'+name).value)params.set(name,$('#stats-'+name).value);
    try{
      const data=await api(`/statistics?${params}`);if(current!==generation)return;
      const records=items=>items.length?`<ol>${items.map(r=>`<li><button type="button" data-stats-record="${escape(r.id)}">${escape(r.inventory_number)} · ${escape(r.artist)} · ${escape(r.title)}</button>${r.plays!==undefined?` <span>${r.plays} plays</span>`:''}</li>`).join('')}</ol>`:'<p class="muted">No records in this group.</p>';
      $('#stats-status').textContent=`${data.total_plays} recorded ${data.total_plays===1?'play':'plays'} in this date range.`;
      $('#stats-result').innerHTML=`${data.deleted_copy_plays?`<p class="muted">${data.deleted_copy_plays} plays belong to removed copies and are included in monthly totals.</p>`:''}<h3>Most played copies</h3>${data.most_played.length?records(data.most_played):'<p class="muted">No listening events in this date range.</p>'}<h3>Plays by month</h3>${data.months.length?`<table><thead><tr><th>Month</th><th>Plays</th></tr></thead><tbody>${data.months.map(m=>`<tr><td>${escape(m.month)}</td><td>${m.plays}</td></tr>`).join('')}</tbody></table>`:'<p class="muted">No monthly totals yet.</p>'}<h3>Never played · lifetime</h3>${records(data.never_played)}`;
      $('#stats-result').querySelectorAll('[data-stats-record]').forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.statsRecord;$('#statistics').close();onOpen(id);}));
      // Provider labels must disappear even while a statistics dialog stays open.
      const deadlines=[...data.most_played,...data.never_played].map(r=>r.metadata_expires_at*1000).filter(value=>value>Date.now());
      if(deadlines.length)expiry=setTimeout(()=>{clear();$('#stats-status').textContent='Apply dates to refresh expired album information.';},Math.max(1,Math.min(...deadlines)-Date.now()+1));
    }catch(error){if(current===generation)$('#stats-status').textContent=error.message;}
  }
  $('#stats-open').addEventListener('click',()=>{$('#statistics').showModal();load();});
  $('#stats-close').addEventListener('click',()=>$('#statistics').close());
  $('#statistics').addEventListener('close',()=>{generation++;clear();});
  $('#stats-form').addEventListener('submit',event=>{event.preventDefault();load();});
  $('#stats-clear').addEventListener('click',()=>{$('#stats-form').reset();load();});
}
