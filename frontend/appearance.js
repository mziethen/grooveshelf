export function createAppearance() {
  const $=selector=>document.querySelector(selector);
  const names={gallery:'Gallery',studio:'Studio',listening:'Listening Room'};
  function theme(value){
    document.documentElement.dataset.theme=value;
    document.querySelector('meta[name="theme-color"]').content={gallery:'#f3f0e9',studio:'#f2f4f7',listening:'#141d19'}[value];
    $('#theme-name').textContent=names[value];
    document.querySelectorAll('[data-theme]').forEach(button=>{if(button.tagName==='BUTTON')button.setAttribute('aria-pressed',button.dataset.theme===value);});
  }
  theme(document.documentElement.dataset.theme||'gallery');
  document.querySelectorAll('.theme-options button').forEach(button=>button.addEventListener('click',()=>{theme(button.dataset.theme);try{localStorage.setItem('grooveshelf-theme',button.dataset.theme);}catch{}$('.theme-picker').open=false;$('.theme-picker summary').focus();}));
  document.addEventListener('click',event=>{if(!event.target.closest('.theme-picker'))$('.theme-picker').open=false;});
  const mobile=matchMedia('(max-width: 900px)');let opened=false;
  function close(returnFocus=true){opened=false;document.body.classList.remove('nav-open');$('#nav-shade').hidden=true;$('#nav-toggle').setAttribute('aria-expanded','false');$('#app-navigation').removeAttribute('role');$('#app-navigation').removeAttribute('aria-modal');$('#app-main').inert=false;$('.topbar').inert=false;$('#app-navigation').inert=true;if(returnFocus)$('#nav-toggle').focus();}
  function open(){opened=true;document.body.classList.add('nav-open');$('#app-navigation').inert=false;$('#app-navigation').setAttribute('role','dialog');$('#app-navigation').setAttribute('aria-modal','true');$('#nav-shade').hidden=false;$('#nav-toggle').setAttribute('aria-expanded','true');$('#app-main').inert=true;$('.topbar').inert=true;$('.theme-picker').open=false;$('#nav-close').focus();}
  $('#nav-toggle').addEventListener('click',()=>opened?close():open());
  $('#nav-close').addEventListener('click',()=>close());$('#nav-shade').addEventListener('click',()=>close());
  $('#app-navigation').addEventListener('click',event=>{if(opened&&event.target.closest('a,button')?.id!=='nav-close'&&event.target.closest('a,button'))close(false);},true);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){$('.theme-picker').open=false;if(opened){event.preventDefault();close();}}
    if(opened&&event.key==='Tab'){
      const items=[...$('#app-navigation').querySelectorAll('button,a[href],summary')].filter(element=>element.getClientRects().length);const first=items[0],last=items.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('close',()=>{if(!document.querySelector('dialog[open]')&&(!document.activeElement||document.activeElement===document.body||document.activeElement.closest('[inert]')))$('#nav-toggle').focus();}));
  mobile.addEventListener('change',()=>close(false));close(false);
}
