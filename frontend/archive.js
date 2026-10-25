// Archive workspace: dense table, multi-selection and an inspector. Selection never changes records by itself.
export function createArchive({api,escape,cover,attribution,coverFallbacks,onOpen,onEdit,onBulk,onLabels,reload}) {
  const $=selector=>document.querySelector(selector);
  const selected=new Set();
  let records=[],activeId=null,focusKey=null,onChange=()=>{},inspectorMarkup='';
  const ago=value=>{
    if(!value)return 'Never';
    const days=Math.floor((Date.now()-Date.parse(value))/86400000);
    return days<1?'Today':days<2?'Yesterday':days<14?`${days} days ago`:days<60?`${Math.round(days/7)} weeks ago`:days<730?`${Math.round(days/30)} months ago`:`${Math.round(days/365)} years ago`;
  };
  const condition=r=>`${r.media_condition||'—'} / ${r.sleeve_condition||'—'}`;
  const rating=r=>r.rating?`${r.rating}/5`:'—';
  function prune() {
    for(const id of selected)if(!records.some(r=>r.id===id))selected.delete(id);
    if(activeId&&!records.some(r=>r.id===activeId))activeId=null;
  }
  function markup(list) {
    records=list;prune();
    const all=list.length>0&&list.every(r=>selected.has(r.id));
    return `<table class="archive-table"><thead><tr><th class="select-col"><input type="checkbox" data-select-all aria-label="Select all shown copies" ${all?'checked':''}></th><th>Inventory</th><th>Album</th><th>Artist</th><th>Year</th><th>Format</th><th>Location</th><th>Media / Sleeve</th><th>Rating</th><th class="numeric">Plays</th><th>Last played</th><th>NFC</th></tr></thead><tbody>${list.map(r=>`<tr data-row="${escape(r.id)}" class="${r.id===activeId?'active ':''}${selected.has(r.id)?'selected':''}"><td class="select-col"><input type="checkbox" data-select="${escape(r.id)}" aria-label="Select ${escape(r.inventory_number)}" ${selected.has(r.id)?'checked':''}></td><td class="mono"><button type="button" class="inspect" data-inspect="${escape(r.id)}" aria-label="Inspect ${escape(r.inventory_number)}">${escape(r.inventory_number)}</button></td><td><button data-record="${escape(r.id)}">${escape(r.title)}</button></td><td>${escape(r.artist)}${attribution(r)}</td><td class="mono">${r.year ?? '—'}</td><td>${escape(r.format)}</td><td>${escape(r.storage_location)||'—'}</td><td class="mono">${escape(condition(r))}</td><td class="mono">${rating(r)}</td><td class="mono numeric">${r.play_count||0}</td><td class="muted">${ago(r.last_played_at)}</td><td class="mono ${r.nfc_uid?'':'missing'}">${r.nfc_uid?'Tag':'No tag'}</td></tr>`).join('')}</tbody></table>`;
  }
  function bind(target) {
    target.querySelectorAll('[data-select]').forEach(input=>input.addEventListener('change',()=>{toggle(input.dataset.select,input.checked);focusKey=`[data-select="${CSS.escape(input.dataset.select)}"]`;}));
    target.querySelector('[data-select-all]')?.addEventListener('change',event=>{
      for(const r of records)event.target.checked?selected.add(r.id):selected.delete(r.id);
      focusKey='[data-select-all]';changed();
    });
    target.querySelectorAll('[data-inspect]').forEach(button=>button.addEventListener('click',()=>{activeId=button.dataset.inspect;focusKey=`[data-inspect="${CSS.escape(activeId)}"]`;changed();}));
    if(focusKey){target.querySelector(focusKey)?.focus({preventScroll:true});focusKey=null;}
  }
  function toggle(id,value=!selected.has(id)) {value?selected.add(id):selected.delete(id);activeId=id;changed();}
  function changed() {onChange();}
  function bar(visible) {
    const count=selected.size;
    $('#selection-bar').hidden=!visible||!count;
    $('#selection-count').textContent=`${count} selected`;
  }
  function inspector(visible) {
    const record=visible&&records.find(r=>r.id===activeId);
    $('#inspector').hidden=!visible;
    const next=record?`<div class="inspector-head">${cover(record)}<div><p class="eyebrow">${escape(record.inventory_number)} · ${escape(record.format)}</p><h2>${escape(record.title)}</h2><p>${escape(record.artist)}${record.year?` · ${escape(record.year)}`:''}</p>${attribution(record)}</div></div><div class="inspector-actions"><button type="button" data-inspector="open">Open details <kbd>↵</kbd></button><button type="button" data-inspector="edit">Edit</button><button type="button" data-inspector="play">Log play now</button><button type="button" data-inspector="favorite" aria-pressed="${record.favorite?'true':'false'}">${record.favorite?'★ Favorite':'☆ Favorite'} <kbd>F</kbd></button></div><dl class="inspector-facts"><dt>Location</dt><dd>${escape(record.storage_location)||'—'}</dd><dt>Media / Sleeve</dt><dd class="mono">${escape(condition(record))}</dd><dt>Rating</dt><dd class="mono">${rating(record)}</dd><dt>NFC tag</dt><dd class="mono">${escape(record.nfc_uid)||'No tag'}</dd><dt>Discogs</dt><dd>${record.discogs_release_id?`Release ${escape(record.discogs_release_id)}`:'No exact release'}</dd><dt>Plays</dt><dd>${record.play_count||0} · last ${ago(record.last_played_at).toLowerCase()}</dd><dt>Genres</dt><dd>${escape([...(record.genres||[]),...(record.styles||[])].join(' · '))||'—'}</dd></dl>${record.notes?`<h3>Notes</h3><p class="notes">${escape(record.notes)}</p>`:''}<p id="inspector-error" class="error" role="alert"></p>`:'<p class="muted inspector-empty">Select a copy with its LP number, or move with <kbd>J</kbd> / <kbd>K</kbd>, to inspect it here.</p>';
    if(next===inspectorMarkup)return;
    inspectorMarkup=next;$('#inspector').innerHTML=next;coverFallbacks($('#inspector'));
    $('#inspector').querySelectorAll('[data-inspector]').forEach(button=>button.addEventListener('click',()=>act(button.dataset.inspector)));
  }
  async function act(action) {
    const record=records.find(r=>r.id===activeId);if(!record)return;
    if(action==='open')return onOpen(record.id);
    if(action==='edit')return onEdit(record.id);
    const button=$(`#inspector [data-inspector="${action}"]`);if(button)button.disabled=true;
    try {
      if(action==='favorite')await api(`/records/${record.id}/favorite`,{method:'PUT',body:JSON.stringify({favorite:!record.favorite})});
      if(action==='play')await api(`/records/${record.id}/plays`,{method:'POST',body:JSON.stringify({played_at:new Date().toISOString()})});
      await reload();
    } catch(error) {const target=$('#inspector-error');if(target)target.textContent=error.message;}
    finally {const current=$(`#inspector [data-inspector="${action}"]`);if(current)current.disabled=false;}
  }
  $('#selection-edit').addEventListener('click',()=>onBulk([...selected]));
  $('#selection-move').addEventListener('click',()=>onBulk([...selected],{location:true}));
  $('#selection-labels').addEventListener('click',()=>onLabels());
  $('#selection-clear').addEventListener('click',()=>{selected.clear();changed();});
  return {
    markup,bind,bar,inspector,act,
    set onChange(fn){onChange=fn;},
    selected:()=>[...selected],
    clear(){if(!selected.size)return false;selected.clear();changed();return true;},
    toggleActive(){if(activeId)toggle(activeId);},
    active:()=>records.find(r=>r.id===activeId)||null,
    move(delta){
      if(!records.length)return;
      const index=records.findIndex(r=>r.id===activeId);
      const next=records[Math.max(0,Math.min(records.length-1,index<0?0:index+delta))];
      activeId=next.id;focusKey=`[data-inspect="${CSS.escape(next.id)}"]`;changed();
      document.querySelector(`#collection [data-row="${CSS.escape(next.id)}"]`)?.scrollIntoView({block:'nearest'});
    }
  };
}
