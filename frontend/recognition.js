export function createCoverRecognition({api,onSearch,escape,onOpen}) {
  const $=selector=>document.querySelector(selector);
  let generation=0,busy=false,url=null;
  function clearImage(){if(url)URL.revokeObjectURL(url);url=null;$('#recognition-image').removeAttribute('src');$('#recognition-image').hidden=true;}
  function controls(){
    $('#recognition-read').disabled=busy||!$('#recognition-file').files[0];
    $('#recognition-match').disabled=busy||!$('#recognition-file').files[0];
    $('#recognition-matches').querySelectorAll('button').forEach(button=>button.disabled=busy);
    $('#recognition-file').disabled=busy;
    $('#recognition-search').disabled=busy||!$('#recognition-text').value.trim();
  }
  function reset(){generation++;busy=false;clearImage();$('#recognition-file').value='';$('#recognition-text').value='';$('#recognition-status').textContent='';$('#recognition-review').hidden=true;$('#recognition-matches').replaceChildren();$('#cover-recognition').open=false;controls();}
  $('#recognition-file').addEventListener('change',()=>{
    generation++;clearImage();$('#recognition-review').hidden=true;$('#recognition-text').value='';$('#recognition-status').textContent='';$('#recognition-matches').replaceChildren();
    const file=$('#recognition-file').files[0];
    if(file){
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){$('#recognition-status').textContent='Choose a JPEG, PNG or WebP photo up to 5 MiB.';$('#recognition-file').value='';}
      else {url=URL.createObjectURL(file);$('#recognition-image').src=url;$('#recognition-image').hidden=false;}
    }
    controls();
  });
  $('#recognition-read').addEventListener('click',async()=>{
    const file=$('#recognition-file').files[0];if(busy||!file)return;
    const current=++generation;busy=true;controls();$('#recognition-review').hidden=true;$('#recognition-status').textContent='Reading cover text on your GrooveShelf server…';
    try {
      const data=await api('/capture/cover-text',{method:'POST',headers:{'Content-Type':file.type},body:file});
      if(current!==generation)return;
      $('#recognition-text').value=data.text;
      $('#recognition-review').hidden=false;
      $('#recognition-status').textContent=data.text?'Review and correct the text, then find matching albums. Nothing has been saved.':'No readable text found. Try a clear, straight photo or type the artist and title below.';
      $('#recognition-text').focus();
    }catch(error){if(current===generation)$('#recognition-status').textContent=error.message;}
    finally{if(current===generation){busy=false;controls();}}
  });
  $('#recognition-text').addEventListener('input',controls);
  $('#recognition-match').addEventListener('click',async()=>{
    const file=$('#recognition-file').files[0];if(busy||!file)return;
    const current=++generation;busy=true;controls();$('#recognition-matches').replaceChildren();$('#recognition-status').textContent='Comparing saved collection covers locally…';
    try{
      const data=await api('/capture/cover-matches',{method:'POST',headers:{'Content-Type':file.type},body:file});
      if(current!==generation)return;
      $('#recognition-status').textContent=`Compared ${data.compared} saved covers. ${data.total_matches} possible matches${data.total_matches>data.matches.length?`; showing the first ${data.matches.length}`:''}. ${data.unavailable} copies had no usable saved cover.${data.incomplete?' Comparison stopped at its processing limit; more copies may match.':''}`;
      $('#recognition-matches').innerHTML=data.matches.length?'<p>Compare these suggestions with your photo. Similar artwork does not identify a pressing. Opening a saved record closes this unsaved draft.</p>'+data.matches.map(match=>`<article><h4>${escape(match.inventory_number)} · ${escape(match.title)}</h4><p>${escape(match.artist)}</p><button type="button" data-open-match="${escape(match.id)}">Open ${escape(match.inventory_number)}</button></article>`).join(''):'<p>No similar saved covers found. Try a straight, well-lit photo, read the cover text, or search manually. Only your existing collection is compared.</p>';
      $('#recognition-matches').querySelectorAll('[data-open-match]').forEach(button=>button.addEventListener('click',()=>{if(!busy)onOpen(button.dataset.openMatch);}));
    }catch(error){if(current===generation)$('#recognition-status').textContent=error.message;}
    finally{if(current===generation){busy=false;controls();}}
  });
  $('#recognition-search').addEventListener('click',async()=>{
    const text=$('#recognition-text').value.trim();if(busy||!text)return;
    const current=generation;busy=true;controls();
    try{await onSearch(text);}finally{if(current===generation){busy=false;controls();}}
  });
  return {reset};
}
