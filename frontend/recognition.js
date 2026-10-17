export function createCoverRecognition({api,onSearch}) {
  const $=selector=>document.querySelector(selector);
  let generation=0,busy=false,url=null;
  function clearImage(){if(url)URL.revokeObjectURL(url);url=null;$('#recognition-image').removeAttribute('src');$('#recognition-image').hidden=true;}
  function controls(){
    $('#recognition-read').disabled=busy||!$('#recognition-file').files[0];
    $('#recognition-file').disabled=busy;
    $('#recognition-search').disabled=busy||!$('#recognition-text').value.trim();
  }
  function reset(){generation++;busy=false;clearImage();$('#recognition-file').value='';$('#recognition-text').value='';$('#recognition-status').textContent='';$('#recognition-review').hidden=true;$('#cover-recognition').open=false;controls();}
  $('#recognition-file').addEventListener('change',()=>{
    generation++;clearImage();$('#recognition-review').hidden=true;$('#recognition-text').value='';$('#recognition-status').textContent='';
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
  $('#recognition-search').addEventListener('click',async()=>{
    const text=$('#recognition-text').value.trim();if(busy||!text)return;
    const current=generation;busy=true;controls();
    try{await onSearch(text);}finally{if(current===generation){busy=false;controls();}}
  });
  return {reset};
}
