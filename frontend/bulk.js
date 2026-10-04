import {populatePersonalOptions} from './personal.js';

export function createBulkEditor({api,escape,onSaved}) {
  const $=selector=>document.querySelector(selector);
  const dialog=$('#bulk-editor'),form=$('#bulk-form');
  let records=[],selected=new Set(),generation=0,loading=false,busy=false,reviewed=null;
  populatePersonalOptions(form);
  for(const [name,label] of [['rating','ratings'],['media_condition','record conditions'],['sleeve_condition','sleeve conditions']]) {
    const select=form.elements[name];
    select.options[0].textContent=name==='rating'?'Clear rating':'Clear condition';
    select.prepend(new Option(`Keep existing ${label}`,'__keep',true,true));
  }
  const matches=record=>{
    const query=$('#bulk-filter').value.trim().toLowerCase();
    return !query||[record.inventory_number,record.artist,record.title,record.storage_location].join(' ').toLowerCase().includes(query);
  };
  function count() {
    $('#bulk-count').textContent=`${selected.size} selected · ${records.filter(matches).length} matching`;
    $('#bulk-review').disabled=loading||!selected.size||selected.size>500||records.filter(record=>selected.has(record.id)).length!==selected.size;
    $('#bulk-select').disabled=loading||!records.some(matches);
    $('#bulk-clear').disabled=loading||!selected.size;
  }
  function render() {
    const visible=records.filter(matches);
    $('#bulk-records').innerHTML=visible.map(record=>`<label><input type="checkbox" data-bulk-record="${escape(record.id)}" ${selected.has(record.id)?'checked':''}><span><strong>${escape(record.inventory_number)}</strong><span>${escape(record.title)} · ${escape(record.artist)}</span><small>${escape(record.storage_location)||'No storage location'}</small></span></label>`).join('')||'<p class="muted">No copies match this selection.</p>';
    count();
  }
  async function reload() {
    const current=++generation;loading=true;records=[];reviewed=null;
    $('#bulk-error').textContent='';$('#bulk-status').textContent='Loading records…';$('#bulk-reload').disabled=true;render();
    try {
      const data=await api('/records');if(current!==generation)return;
      records=data;selected=new Set([...selected].filter(id=>records.some(record=>record.id===id)));
      $('#bulk-status').textContent=records.length?'':'Your collection is empty. Add records before using bulk edit.';
    } catch(error) {if(current===generation)$('#bulk-error').textContent=error.message;}
    finally {if(current===generation){loading=false;$('#bulk-reload').disabled=false;render();}}
  }
  function draft(){reviewed=null;$('#bulk-draft').hidden=false;$('#bulk-confirmation').hidden=true;$('#bulk-title').textContent='Edit multiple records';}
  $('#bulk-open').addEventListener('click',()=>{
    form.reset();selected.clear();$('#bulk-filter').value='';$('#bulk-location-row').hidden=true;form.elements.storage_location.disabled=true;draft();dialog.showModal();reload();
  });
  for(const id of ['bulk-close','bulk-cancel'])$('#'+id).addEventListener('click',()=>{if(!busy)dialog.close();});
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  dialog.addEventListener('close',()=>{generation++;reviewed=null;});
  $('#bulk-filter').addEventListener('input',render);
  $('#bulk-records').addEventListener('change',event=>{
    const input=event.target.closest('[data-bulk-record]');if(!input)return;
    if(input.checked)selected.add(input.dataset.bulkRecord);else selected.delete(input.dataset.bulkRecord);count();
  });
  $('#bulk-select').addEventListener('click',()=>{records.filter(matches).forEach(record=>selected.add(record.id));render();});
  $('#bulk-clear').addEventListener('click',()=>{selected.clear();render();});
  $('#bulk-reload').addEventListener('click',reload);
  $('#bulk-location-change').addEventListener('change',event=>{$('#bulk-location-row').hidden=!event.target.checked;form.elements.storage_location.disabled=!event.target.checked;});
  $('#bulk-back').addEventListener('click',()=>{if(busy)return;draft();$('#bulk-error').textContent='';$('#bulk-review').focus();});
  form.addEventListener('submit',event=>{
    event.preventDefault();$('#bulk-error').textContent='';if(loading||busy)return;
    const changes={},summary=[];
    if($('#bulk-location-change').checked){changes.storage_location=form.elements.storage_location.value.trim();summary.push(`Storage location: ${changes.storage_location||'Clear location'}`);}
    for(const [name,label] of [['rating','Rating'],['media_condition','Record condition'],['sleeve_condition','Sleeve condition']]) {
      const select=form.elements[name];if(select.value==='__keep')continue;
      changes[name]=name==='rating'?(select.value?Number(select.value):null):(select.value||null);
      summary.push(`${label}: ${select.selectedOptions[0].textContent}`);
    }
    if(form.elements.favorite.value!=='__keep'){changes.favorite=form.elements.favorite.value==='true';summary.push(`Favorites: ${changes.favorite?'Add to favorites':'Remove from favorites'}`);}
    if(!selected.size||selected.size>500){$('#bulk-error').textContent='Select between 1 and 500 copies.';return;}
    if(!Object.keys(changes).length){$('#bulk-error').textContent='Choose at least one field to change.';return;}
    const chosen=records.filter(record=>selected.has(record.id));
    reviewed={record_ids:chosen.map(record=>record.id),changes};
    $('#bulk-title').textContent='Review bulk changes';$('#bulk-review-count').textContent=`Update ${chosen.length} ${chosen.length===1?'copy':'copies'}`;
    $('#bulk-changes').innerHTML=summary.map(text=>`<li>${escape(text)}</li>`).join('');
    $('#bulk-review-records').innerHTML=chosen.map(record=>`<li><strong>${escape(record.inventory_number)}</strong><span>${escape(record.title)} · ${escape(record.artist)}</span></li>`).join('');
    $('#bulk-draft').hidden=true;$('#bulk-confirmation').hidden=false;$('#bulk-review-count').tabIndex=-1;$('#bulk-review-count').focus();
  });
  $('#bulk-apply').addEventListener('click',async()=>{
    if(busy||!reviewed)return;busy=true;$('#bulk-error').textContent='';$('#bulk-status').textContent='Applying changes…';
    for(const id of ['bulk-close','bulk-back','bulk-apply'])$('#'+id).disabled=true;
    try {const result=await api('/records/bulk-personal',{method:'PATCH',body:JSON.stringify(reviewed)});dialog.close();await onSaved(result.updated_count);}
    catch(error){$('#bulk-error').textContent=error.message;$('#bulk-status').textContent='';}
    finally {busy=false;for(const id of ['bulk-close','bulk-back','bulk-apply'])$('#'+id).disabled=false;}
  });
}
