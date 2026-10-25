// Command palette (⌘K / Ctrl+K) and single-key shortcuts. Shortcuts never fire while typing or in a dialog.
export function createPalette({escape,records,openRecord,commands}) {
  const $=selector=>document.querySelector(selector);
  const dialog=$('#command-palette'),input=$('#palette-input'),list=$('#palette-results');
  let items=[],index=0,opener=null;
  const normalize=value=>String(value??'').toLocaleLowerCase();
  function results(text) {
    const query=text.trim();
    const onlyCommands=query.startsWith('>'),onlyNumbers=query.startsWith('#');
    const term=normalize(query.replace(/^[>#]\s*/,''));
    const copies=onlyCommands?[]:records().filter(r=>onlyNumbers?normalize(r.inventory_number).includes(term):!term||[r.inventory_number,r.title,r.artist,r.storage_location].some(v=>normalize(v).includes(term))).slice(0,term?8:5)
      .map(r=>({group:'Copies',label:r.title,detail:`${r.inventory_number} · ${r.artist}${r.storage_location?` · ${r.storage_location}`:''}`,keys:'↵',run:()=>openRecord(r.id)}));
    const actions=onlyNumbers?[]:commands().filter(c=>!term||normalize(`${c.group} ${c.label} ${c.keywords||''}`).includes(term)).slice(0,term?12:9).map(c=>({...c,group:c.group||'Commands'}));
    return [...copies,...actions];
  }
  function render() {
    items=results(input.value);index=Math.min(index,Math.max(0,items.length-1));
    let group='';
    list.innerHTML=items.map((item,i)=>{
      const header=item.group!==group?`<li role="presentation" class="palette-group">${escape(group=item.group)}</li>`:'';
      return `${header}<li id="palette-item-${i}" role="option" aria-selected="${i===index}" data-index="${i}"><span class="palette-label">${escape(item.label)}${item.detail?` <span class="muted">${escape(item.detail)}</span>`:''}</span>${item.keys?`<kbd>${escape(item.keys)}</kbd>`:''}</li>`;
    }).join('')||'<li role="presentation" class="muted palette-empty">No copies or commands match.</li>';
    input.setAttribute('aria-activedescendant',items.length?`palette-item-${index}`:'');
    list.querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest'});
  }
  function run(i) {
    const item=items[i];if(!item)return;
    opener=null;dialog.close();item.run();
  }
  function open(prefix='') {
    if(dialog.open)return;
    opener=document.activeElement;
    document.querySelectorAll('dialog[open]').forEach(other=>other.close());
    input.value=prefix;index=0;render();dialog.showModal();input.focus();
  }
  input.addEventListener('input',()=>{index=0;render();});
  input.addEventListener('keydown',event=>{
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(items.length){index=(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;render();}}
    else if(event.key==='Enter'){event.preventDefault();run(index);}
  });
  list.addEventListener('click',event=>{const option=event.target.closest('[data-index]');if(option)run(Number(option.dataset.index));});
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>{if(opener?.isConnected)opener.focus();opener=null;});
  return {open,get isOpen(){return dialog.open;}};
}

export function createShortcuts({palette,archive,workspace,setWorkspace,actions}) {
  const $=selector=>document.querySelector(selector);
  let prefix=null,prefixTimer;
  const go={w:'wishlist-open',s:'stats-open',d:'sync-open',l:'labels-open',b:'bulk-open',p:'discover-open',e:'settings-open',k:'backups-open'};
  $('#shortcuts-close').addEventListener('click',()=>$('#shortcuts-dialog').close());
  document.addEventListener('keydown',event=>{
    if((event.metaKey||event.ctrlKey)&&!event.altKey&&event.key.toLowerCase()==='k'){event.preventDefault();palette.open();return;}
    if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.isComposing)return;
    if(event.target.closest?.('input,textarea,select,[contenteditable=""],[contenteditable=true]'))return;
    if(document.querySelector('dialog[open]')||document.body.classList.contains('nav-open'))return;
    if(event.altKey){
      const digit=event.code.match(/^Digit([1-9])$/);
      if(digit&&actions.savedFilter(Number(digit[1])-1))event.preventDefault();
      return;
    }
    const key=event.key;
    if(prefix==='g'){
      prefix=null;clearTimeout(prefixTimer);
      const target=key==='c'?()=>setWorkspace('collection'):key==='a'?()=>setWorkspace('archive'):go[key]?()=>$('#'+go[key]).click():null;
      if(target){event.preventDefault();target();}
      return;
    }
    const archiveOpen=workspace()==='archive';
    const handlers={
      'g':()=>{prefix='g';prefixTimer=setTimeout(()=>{prefix=null;},1200);},
      '/':()=>{$('#search').focus();$('#search').select();},
      '1':()=>setWorkspace('collection'),'2':()=>setWorkspace('archive'),'3':()=>setWorkspace('listening'),
      'n':()=>$('#add').click(),
      '?':()=>$('#shortcuts-dialog').showModal(),
      ...(archiveOpen?{
        'j':()=>archive.move(1),'k':()=>archive.move(-1),'ArrowDown':()=>archive.move(1),'ArrowUp':()=>archive.move(-1),
        'x':()=>archive.toggleActive(),
        'Enter':()=>archive.active()&&archive.act('open'),
        'f':()=>archive.act('favorite'),
        'e':()=>archive.selected().length&&$('#selection-edit').click(),
        'm':()=>archive.selected().length&&$('#selection-move').click(),
        'Escape':()=>archive.clear()
      }:{})
    };
    // Arrow and Enter keys keep their native meaning on focused buttons and links.
    if((key==='Enter'||key.startsWith('Arrow'))&&event.target.closest?.('button,a,summary'))return;
    const handler=handlers[key];
    if(handler){const result=handler();if(result!==false)event.preventDefault();}
  });
}
