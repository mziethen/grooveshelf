const grades=[['M','Mint'],['NM','Near Mint'],['VG+','Very Good Plus'],['VG','Very Good'],['G+','Good Plus'],['G','Good'],['F','Fair'],['P','Poor']];
export function populatePersonalOptions(root) {
  for(const name of ['rating','media_condition','sleeve_condition']) {
    const select=root.querySelector(`[name="${name}"]`);
    const options=name==='rating'?Array.from({length:5},(_,i)=>[String(i+1),`${i+1} ${i?'stars':'star'}`]):[...grades,...(name==='sleeve_condition'?[['Generic','Generic sleeve'],['No Cover','No cover']]:[])];
    select.replaceChildren(new Option(name==='rating'?'Not rated':'Not graded',''),...options.map(([value,label])=>new Option(name==='rating'?label:`${label} (${value})`,value)));
  }
}
export function personalPayload(values) {
  return {...values,rating:values.rating?Number(values.rating):null,media_condition:values.media_condition||null,sleeve_condition:values.sleeve_condition||null};
}
export function createPersonalUI({api,escape,currentRecord,reload,renderCurrent}) {
  const $=selector=>document.querySelector(selector);
  const form=$('#personal-form');populatePersonalOptions(form);
  let copyId;
  $('#edit-personal').addEventListener('click',()=>{
    const record=currentRecord();copyId=record.id;
    for(const name of ['rating','media_condition','sleeve_condition','notes'])form.elements[name].value=record[name]??'';
    $('#personal-error').textContent='';$('#personal-editor').showModal();
  });
  $('#personal-cancel').addEventListener('click',()=>$('#personal-editor').close());
  form.addEventListener('submit',async event=>{
    event.preventDefault();$('#personal-save').disabled=true;
    try {
      await api(`/records/${copyId}/personal`,{method:'PUT',body:JSON.stringify(personalPayload(Object.fromEntries(new FormData(form))))});
      $('#personal-editor').close();await reload();await renderCurrent();
    }catch(error){$('#personal-error').textContent=error.message;}
    finally{$('#personal-save').disabled=false;}
  });
  return {details(record) {
    const label=value=>{const grade=grades.find(([key])=>key===value);return grade?`${grade[1]} (${grade[0]})`:value||'Not graded';};
    $('#personal-summary').innerHTML=`<h3>Your copy</h3><dl class="personal-summary"><div><dt>Rating</dt><dd>${record.rating?`${'★'.repeat(record.rating)} · ${record.rating}/5`:'Not rated'}</dd></div><div><dt>Record condition</dt><dd>${escape(label(record.media_condition))}</dd></div><div><dt>Sleeve condition</dt><dd>${escape(label(record.sleeve_condition))}</dd></div></dl>`;
  }};
}
