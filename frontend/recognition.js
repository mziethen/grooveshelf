export function createCoverRecognition({api,onSearch,escape,onOpen}) {
  const $=selector=>document.querySelector(selector);
  let generation=0,busy=false,url=null,original=null,prepared=null,rotation=0;
  function clearImage(){if(url)URL.revokeObjectURL(url);url=null;$('#recognition-image').removeAttribute('src');$('#recognition-image').hidden=true;}
  function showImage(file){clearImage();url=URL.createObjectURL(file);$('#recognition-image').src=url;$('#recognition-image').hidden=false;}
  function clearResults(){$('#recognition-review').hidden=true;$('#recognition-text').value='';$('#recognition-matches').replaceChildren();}
  function controls(){
    $('#recognition-read').disabled=busy||!$('#recognition-file').files[0];
    $('#recognition-match').disabled=busy||!$('#recognition-file').files[0];
    $('#recognition-rotate').disabled=busy||!original;
    $('#recognition-original').disabled=busy||!original||prepared===original;
    $('#recognition-matches').querySelectorAll('button').forEach(button=>button.disabled=busy);
    $('#recognition-file').disabled=busy;
    $('#recognition-search').disabled=busy||!$('#recognition-text').value.trim();
  }
  function reset(){generation++;busy=false;original=prepared=null;rotation=0;clearImage();$('#recognition-file').value='';$('#recognition-status').textContent='';clearResults();$('#cover-recognition').open=false;controls();}
  $('#recognition-file').addEventListener('change',()=>{
    generation++;original=prepared=null;rotation=0;clearImage();clearResults();$('#recognition-status').textContent='';
    const file=$('#recognition-file').files[0];
    if(file){
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){$('#recognition-status').textContent='Choose a JPEG, PNG or WebP photo up to 5 MiB.';$('#recognition-file').value='';}
      else {original=prepared=file;showImage(file);}
    }
    controls();
  });
  $('#recognition-original').addEventListener('click',()=>{
    if(busy||!original)return;
    generation++;rotation=0;prepared=original;showImage(prepared);clearResults();$('#recognition-status').textContent='Original photo restored. Read the text or compare covers again.';controls();
  });
  $('#recognition-rotate').addEventListener('click',async()=>{
    if(busy||!original)return;
    const current=++generation,sourceUrl=URL.createObjectURL(original),nextRotation=(rotation+1)%4;
    busy=true;controls();
    try{
      const image=new Image();image.src=sourceUrl;await image.decode();
      if(current!==generation)return;
      if(image.naturalWidth*image.naturalHeight>24_000_000||Math.max(image.naturalWidth,image.naturalHeight)>8192)throw Error('Choose an image with at most 24 megapixels and sides no larger than 8192 pixels.');
      const scale=Math.min(1,2048/Math.max(image.naturalWidth,image.naturalHeight));
      const width=Math.max(1,Math.round(image.naturalWidth*scale)),height=Math.max(1,Math.round(image.naturalHeight*scale));
      const canvas=document.createElement('canvas');canvas.width=nextRotation%2?height:width;canvas.height=nextRotation%2?width:height;
      const context=canvas.getContext('2d');if(!context)throw Error('Photo rotation is unavailable in this browser.');
      context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.translate(canvas.width/2,canvas.height/2);context.rotate(nextRotation*Math.PI/2);context.drawImage(image,-width/2,-height/2,width,height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));
      if(current!==generation)return;
      if(!blob||blob.size>5*1024*1024)throw Error('This photo could not be prepared. Try a smaller JPEG, PNG or WebP image.');
      prepared=new File([blob],'cover-rotated.jpg',{type:'image/jpeg'});rotation=nextRotation;showImage(prepared);clearResults();$('#recognition-status').textContent=`Photo rotated ${rotation*90}° clockwise from the original. Read the text or compare covers again.`;
    }catch(error){if(current===generation)$('#recognition-status').textContent=error.message||'The photo could not be rotated. Choose a complete JPEG, PNG or WebP image.';}
    finally{URL.revokeObjectURL(sourceUrl);if(current===generation){busy=false;controls();}}
  });
  $('#recognition-read').addEventListener('click',async()=>{
    const file=prepared;if(busy||!file)return;
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
    const file=prepared;if(busy||!file)return;
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
