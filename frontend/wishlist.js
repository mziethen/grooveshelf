export function createWishlist({api,escape,onAcquire}) {
  const $=selector=>document.querySelector(selector);
  let wishes=[];
  let editing=null;
  let deleting=null;
  let masterId=null;
  let listGeneration=0;
  let searchGeneration=0;
  let expiryTimer;
  let filterTimer;
  async function reload() {
    const current=++listGeneration;
    $('#wish-list-error').textContent='';
    try {
      const data=await api(`/wishlist?q=${encodeURIComponent($('#wish-filter').value)}`);
      if(current!==listGeneration)return;
      wishes=data;$('#wish-count').textContent=`${data.length} ${data.length===1?'wish':'wishes'}`;
      $('#wish-list').innerHTML=data.map(wish=>`<article class="wish-entry"><h3>${escape(wish.title)}</h3><p>${escape(wish.artist)}</p>${wish.notes?`<p class="notes muted">${escape(wish.notes)}</p>`:''}${wish.source_url?`<a class="attribution" href="${escape(wish.source_url)}" target="_blank" rel="noopener">View album on Discogs</a>`:''}<div class="actions"><button data-edit-wish="${escape(wish.id)}">Edit wish</button><button data-delete-wish="${escape(wish.id)}" class="danger">Remove wish</button><button data-acquire-wish="${escape(wish.id)}" class="primary">I bought this record</button></div></article>`).join('') || `<p class="muted">${$('#wish-filter').value?'No wishes match your search.':'Your wishlist is empty. Add an album you would like to find.'}</p>`;
      const find=id=>wishes.find(wish=>wish.id===id);
      $('#wish-list').querySelectorAll('[data-edit-wish]').forEach(button=>button.addEventListener('click',()=>openEditor(find(button.dataset.editWish))));
      $('#wish-list').querySelectorAll('[data-delete-wish]').forEach(button=>button.addEventListener('click',()=>{
        deleting=find(button.dataset.deleteWish);$('#wish-delete-title').textContent=deleting.title;$('#wish-delete-error').textContent='';$('#wish-delete').showModal();
      }));
      $('#wish-list').querySelectorAll('[data-acquire-wish]').forEach(button=>button.addEventListener('click',()=>{
        const wish=find(button.dataset.acquireWish);$('#wishlist-dialog').close();onAcquire(wish);
      }));
    }catch(error){if(current===listGeneration)$('#wish-list-error').textContent=error.message;}
  }
  function source() {
    const link=$('#wish-source');link.hidden=!masterId;$('#wish-unlink').hidden=!masterId;
    if(masterId)link.href=`https://www.discogs.com/master/${masterId}`;
  }
  function openEditor(wish=null) {
    editing=wish;masterId=wish?.discogs_master_id||null;searchGeneration++;clearTimeout(expiryTimer);
    $('#wish-form').reset();$('#wish-editor-title').textContent=wish?'Edit a wish':'Add a wish';
    for(const name of ['artist','title','notes'])$('#wish-form').elements[name].value=wish?.[name]||'';
    $('#wish-error').textContent='';$('#wish-search-message').textContent='Optional: link a Discogs album. Your own artist, title and notes stay as entered.';
    $('#wish-search-results').replaceChildren();source();$('#wish-editor').showModal();
  }
  $('#wishlist-open').addEventListener('click',()=>{$('#wishlist-dialog').showModal();reload();});
  $('#wishlist-close').addEventListener('click',()=>$('#wishlist-dialog').close());
  $('#wishlist-dialog').addEventListener('close',()=>{listGeneration++;clearTimeout(filterTimer);});
  $('#wish-add').addEventListener('click',()=>openEditor());
  $('#wish-filter').addEventListener('input',()=>{clearTimeout(filterTimer);filterTimer=setTimeout(reload,200);});
  $('#wish-cancel').addEventListener('click',()=>$('#wish-editor').close());
  $('#wish-editor').addEventListener('close',()=>{searchGeneration++;clearTimeout(expiryTimer);});
  $('#wish-unlink').addEventListener('click',()=>{masterId=null;source();});
  $('#wish-search').addEventListener('click',async()=>{
    const form=$('#wish-form');const artist=form.elements.artist.value;const title=form.elements.title.value;
    if(!artist.trim()&&!title.trim()){$('#wish-search-message').textContent='Enter an artist or album title before searching.';return;}
    const current=++searchGeneration;clearTimeout(expiryTimer);$('#wish-search').disabled=true;
    $('#wish-search-results').replaceChildren();$('#wish-search-message').textContent='Searching Discogs…';
    try{
      const data=await api(`/metadata/discogs/search?${new URLSearchParams({artist,title,page:1})}`);
      if(current!==searchGeneration)return;
      $('#wish-search-message').textContent=data.results.length?'Choose an album reference. Saving still requires your own artist and title.':'No matching albums. You can save a wish without a Discogs link.';
      $('#wish-search-results').innerHTML=data.results.map(result=>`<div class="discogs-result"><button type="button" data-wish-master="${result.id}">${escape(result.title)}</button><a href="${escape(result.source_url)}" target="_blank" rel="noopener">Data provided by Discogs</a></div>`).join('');
      $('#wish-search-results').querySelectorAll('[data-wish-master]').forEach(button=>button.addEventListener('click',()=>{
        masterId=Number(button.dataset.wishMaster);source();$('#wish-search-results').replaceChildren();clearTimeout(expiryTimer);
        $('#wish-search-message').textContent='Album reference selected. Your entered details have not been changed.';
      }));
      expiryTimer=setTimeout(()=>{$('#wish-search-results').replaceChildren();$('#wish-search-message').textContent='These results have expired. Search again for current results.';},600000);
    }catch(error){if(current===searchGeneration)$('#wish-search-message').textContent=error.message;}
    finally{$('#wish-search').disabled=false;}
  });
  $('#wish-form').addEventListener('submit',async event=>{
    event.preventDefault();$('#wish-save').disabled=true;$('#wish-error').textContent='';
    try{
      await api(editing?`/wishlist/${editing.id}`:'/wishlist',{method:editing?'PUT':'POST',body:JSON.stringify({...Object.fromEntries(new FormData(event.target)),discogs_master_id:masterId})});
      $('#wish-editor').close();await reload();
    }catch(error){$('#wish-error').textContent=error.message;}
    finally{$('#wish-save').disabled=false;}
  });
  $('#wish-delete-cancel').addEventListener('click',()=>$('#wish-delete').close());
  $('#wish-delete-confirm').addEventListener('click',async()=>{
    $('#wish-delete-confirm').disabled=true;
    try{await api(`/wishlist/${deleting.id}`,{method:'DELETE'});$('#wish-delete').close();await reload();}
    catch(error){$('#wish-delete-error').textContent=error.message;}
    finally{$('#wish-delete-confirm').disabled=false;}
  });
}
