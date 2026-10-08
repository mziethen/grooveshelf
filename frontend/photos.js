export function createPhotos({api,escape,currentRecord,onSaved}) {
  const $=selector=>document.querySelector(selector);
  const types={cover:'Cover',back:'Back cover',label:'Label',matrix:'Matrix'};
  let recordId,items=[],selected=null,generation=0,busy=false,removing=null;
  function controls(){
    $('#photo-upload').disabled=busy||items.length>=12;
    $('#photo-form').querySelectorAll('input,select').forEach(input=>input.disabled=busy);
    $('#photo-use-cover').disabled=busy||!selected||selected.is_cover;
    $('#photo-delete').disabled=busy||!selected;
    $('#photo-album-cover').disabled=busy||!items.some(item=>item.is_cover);
    $('#photo-remove-confirm').disabled=busy;
  }
  function select(id){
    selected=items.find(item=>item.id===id)||null;
    $('#photo-preview').hidden=!selected;
    $('#photo-gallery').querySelectorAll('[data-photo]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.photo===id));
    if(selected){
      $('#photo-preview-title').textContent=types[selected.kind]+(selected.is_cover?' · Selected cover':'');
      $('#photo-preview-image').src=selected.url;$('#photo-preview-image').alt=selected.caption||`${types[selected.kind]} photo`;
      $('#photo-preview-caption').textContent=selected.caption||'No caption added.';
    } else $('#photo-preview-image').removeAttribute('src');
    controls();
  }
  function render(){
    $('#photo-upload-section').open=!items.length;
    $('#photos-status').textContent=items.length?`${items.length} of 12 photos saved for this copy.`:'No personal photos yet. Open Add a photo to save your first image.';
    $('#photo-gallery').innerHTML=items.map(item=>`<button type="button" data-photo="${escape(item.id)}" aria-pressed="false" aria-label="View ${escape(types[item.kind])}${item.caption?' · '+escape(item.caption):''}"><img src="${escape(item.url)}" alt="${escape(item.caption||types[item.kind])}" loading="lazy"><span>${escape(types[item.kind])}${item.is_cover?' · Cover selected':''}</span></button>`).join('');
    $('#photo-gallery').querySelectorAll('[data-photo]').forEach(button=>button.addEventListener('click',()=>select(button.dataset.photo)));
    select(selected?.id || items.find(item=>item.is_cover)?.id || items[0]?.id);
  }
  async function refresh(current){
    const data=await api(`/records/${recordId}/photos`);
    if(current!==generation)return;items=data;render();
  }
  $('#manage-photos').addEventListener('click',async()=>{
    if(busy||$('#photos').open)return;
    const current=++generation;recordId=currentRecord().id;items=[];selected=null;
    $('#photo-form').reset();$('#photo-gallery').replaceChildren();$('#photo-preview').hidden=true;
    $('#photos-error').textContent='';$('#photos-status').textContent='Loading your photos…';controls();$('#photos').showModal();
    try{await refresh(current);}catch(error){if(current===generation){$('#photos-error').textContent=error.message;$('#photos-error').scrollIntoView({block:'nearest'});}}
  });
  async function mutate(action){
    if(busy)return;busy=true;const current=generation;controls();$('#photos-error').textContent='';
    try{await action(current);if(current===generation)await refresh(current);await onSaved();}
    catch(error){if(current===generation){$('#photos-error').textContent=error.message;$('#photos-error').scrollIntoView({block:'nearest'});}}
    finally{busy=false;if(current===generation)controls();}
  }
  $('#photo-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const form=event.target,file=form.elements.file.files[0];
    if(!file)return;
    if(file.size>5*1024*1024){$('#photos-error').textContent='Choose an image up to 5 MiB.';return;}
    const kind=form.elements.kind.value,caption=form.elements.caption.value.trim(),id=recordId;
    await mutate(async current=>{
      const photo=await api(`/records/${id}/photos?${new URLSearchParams({kind,caption})}`,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});
      if(current===generation){selected=photo;form.reset();}
    });
  });
  $('#photo-use-cover').addEventListener('click',()=>{if(!selected)return;const id=recordId,photo_id=selected.id;mutate(()=>api(`/records/${id}/personal-cover`,{method:'PUT',body:JSON.stringify({photo_id})}));});
  $('#photo-album-cover').addEventListener('click',()=>{const id=recordId;mutate(()=>api(`/records/${id}/personal-cover`,{method:'PUT',body:JSON.stringify({photo_id:null})}));});
  $('#photo-delete').addEventListener('click',()=>{
    if(busy||!selected)return;removing={id:selected.id,copy:recordId};
    $('#photo-remove-description').textContent=`${types[selected.kind]}${selected.caption?' · '+selected.caption:''}`;
    $('#photo-remove-error').textContent='';$('#photo-remove').showModal();
  });
  $('#photo-remove-confirm').addEventListener('click',async()=>{
    if(busy||!removing)return;busy=true;controls();const current=generation;$('#photo-remove-error').textContent='';
    try{
      await api(`/records/${removing.copy}/photos/${removing.id}`,{method:'DELETE'});
      $('#photo-remove').close();if(current===generation){selected=null;await refresh(current);}await onSaved();
    }catch(error){$('#photo-remove-error').textContent=error.message;}
    finally{busy=false;controls();}
  });
  $('#photo-remove-cancel').addEventListener('click',()=>$('#photo-remove').close());
  $('#photos-close').addEventListener('click',()=>$('#photos').close());
  $('#photos').addEventListener('close',()=>{generation++;});
}
