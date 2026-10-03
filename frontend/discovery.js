export function createDiscovery({api,escape,cover,coverFallbacks,hideExpired,onOpen}) {
  const $=selector=>document.querySelector(selector);let generation=0;let selected=null;let expiry;
  function clear(){clearTimeout(expiry);selected=null;$('#discover-result').replaceChildren();$('#discover-details').hidden=true;}
  async function find(){
    const previous=selected?.id;clear();const current=++generation;
    $('#discover-status').textContent='Choosing a record…';$('#discover-another').disabled=true;
    try{
      const params=new URLSearchParams({mode:$('#discover-mode').value});if(previous)params.set('previous',previous);
      const data=await api(`/discovery?${params}`);if(current!==generation)return;
      if(!data.record){$('#discover-status').textContent=data.collection_count?'No records match this selection. Choose another group.':'Your collection is empty. Add a record to get suggestions.';return;}
      selected=hideExpired(data.record);
      function render(){selected=hideExpired(selected);$('#discover-result').innerHTML=`${cover(selected)}<h3>${escape(selected.title)}</h3><p>${escape(selected.artist)}</p><p class="muted">${escape(selected.inventory_number)} · ${selected.play_count} plays</p>${selected.source_url?`<a href="${escape(selected.source_url)}" target="_blank" rel="noopener">Data provided by Discogs</a>`:''}`;coverFallbacks($('#discover-result'));}
      render();$('#discover-details').hidden=false;
      $('#discover-status').textContent=`${data.candidate_count} eligible ${data.candidate_count===1?'copy':'copies'}.`;
      if(selected.metadata_expires_at*1000>Date.now())expiry=setTimeout(render,selected.metadata_expires_at*1000-Date.now()+1);
    }catch(error){if(current===generation)$('#discover-status').textContent=error.message;}
    finally{if(current===generation)$('#discover-another').disabled=false;}
  }
  $('#discover-open').addEventListener('click',()=>{$('#discovery').showModal();find();});
  $('#discover-mode').addEventListener('change',()=>{clear();find();});
  $('#discover-another').addEventListener('click',find);
  $('#discover-close').addEventListener('click',()=>$('#discovery').close());
  $('#discovery').addEventListener('close',()=>{generation++;clear();});
  $('#discover-details').addEventListener('click',()=>{const id=selected?.id;if(id){$('#discovery').close();onOpen(id);}});
}
