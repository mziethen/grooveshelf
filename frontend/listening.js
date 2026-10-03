export function createListeningUI({ api, escape, reload, currentRecord, renderCurrent }) {
  const $ = selector => document.querySelector(selector);
  let history = [];
  let eventToEdit = null;
  let eventToDelete = null;
  let tagRecord = null;
  let tagToRemove = null;
  const localDate = value => {
    const date = new Date(value || Date.now());
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
  };
  const displayDate = value => new Date(value).toLocaleString();
  function openPlay(event = null) {
    eventToEdit = event;
    $('#play-title').textContent = event ? 'Correct this play' : 'Add a listening event';
    $('#play-date').value = localDate(event?.played_at);
    $('#play-error').textContent = ''; $('#play-editor').showModal();
  }
  async function loadHistory(record) {
    try {
      const events = await api(`/records/${record.id}/plays`);
      if (currentRecord()?.id !== record.id || !$('#play-history')) return;
      history = events;
      $('#play-history').innerHTML = events.length ? events.map(event => `<li><div><time>${escape(displayDate(event.played_at))}</time><small>${event.origin === 'nfc' ? 'NFC' : 'Added manually'}</small></div><div><button type="button" data-edit-play="${escape(event.id)}">Edit</button><button type="button" data-remove-play="${escape(event.id)}" class="danger">Remove</button></div></li>`).join('') : '<li class="muted">No listening events yet.</li>';
      $('#play-history').querySelectorAll('[data-edit-play]').forEach(button => button.addEventListener('click', () => openPlay(history.find(e => e.id === button.dataset.editPlay))));
      $('#play-history').querySelectorAll('[data-remove-play]').forEach(button => button.addEventListener('click', () => {
        eventToDelete = button.dataset.removePlay; $('#remove-play-error').textContent = ''; $('#remove-play').showModal();
      }));
    } catch (error) { if (currentRecord()?.id === record.id && $('#history-error')) $('#history-error').textContent = error.message; }
  }
  $('#play-form').addEventListener('submit', async event => {
    event.preventDefault(); $('#play-save').disabled = true; $('#play-error').textContent = '';
    try {
      const playedAt = new Date($('#play-date').value);
      if (Number.isNaN(playedAt.getTime())) throw new Error('Choose a valid date and time.');
      await api(eventToEdit ? `/plays/${eventToEdit.id}` : `/records/${currentRecord().id}/plays`, {method: eventToEdit ? 'PUT' : 'POST',body:JSON.stringify({played_at:playedAt.toISOString()})});
      $('#play-editor').close(); await reload(); await renderCurrent();
    } catch (error) { $('#play-error').textContent = error.message; }
    finally { $('#play-save').disabled = false; }
  });
  $('#play-cancel').addEventListener('click',()=>$('#play-editor').close());
  $('#remove-play-cancel').addEventListener('click',()=>$('#remove-play').close());
  $('#remove-play-confirm').addEventListener('click',async()=>{
    $('#remove-play-confirm').disabled=true;
    try { await api(`/plays/${eventToDelete}`,{method:'DELETE'}); $('#remove-play').close(); await reload(); await renderCurrent(); }
    catch(error){$('#remove-play-error').textContent=error.message;}
    finally{$('#remove-play-confirm').disabled=false;}
  });
  $('#favorite').addEventListener('click',async()=>{
    $('#favorite').disabled=true;
    try { const record=currentRecord(); await api(`/records/${record.id}/favorite`,{method:'PUT',body:JSON.stringify({favorite:!record.favorite})}); await reload(); await renderCurrent(); }
    catch(error){$('#detail-error').textContent=error.message;}
    finally{$('#favorite').disabled=false;}
  });
  $('#tag-form').addEventListener('submit',async event=>{
    event.preventDefault();$('#tag-save').disabled=true;$('#tag-error').textContent='';
    try { await api(`/tags/${encodeURIComponent($('#tag-uid').value)}`,{method:'PUT',body:JSON.stringify({copy_id:tagRecord.id,replace:$('#tag-replace').checked})}); $('#tag-editor').close(); await reload(); await renderCurrent(); }
    catch(error){$('#tag-error').textContent=error.message;}
    finally{$('#tag-save').disabled=false;}
  });
  $('#tag-cancel').addEventListener('click',()=>$('#tag-editor').close());
  $('#remove-tag-cancel').addEventListener('click',()=>$('#remove-tag').close());
  $('#remove-tag-confirm').addEventListener('click',async()=>{
    $('#remove-tag-confirm').disabled=true;
    try { await api(`/tags/${encodeURIComponent(tagToRemove)}`,{method:'DELETE'});$('#remove-tag').close();await reload();await renderCurrent(); }
    catch(error){$('#remove-tag-error').textContent=error.message;}
    finally{$('#remove-tag-confirm').disabled=false;}
  });
  const stationId = new URLSearchParams(location.search).get('station');
  let latestStation = null;
  let observedSequence = -1;
  let observedStatus = '';
  let polling = false;
  async function pollStation() {
    if (!stationId || document.hidden || polling) return;
    polling=true;
    $('#station-panel').hidden=false;
    try {
      const station=await api(`/stations/${encodeURIComponent(stationId)}`);
      latestStation=station;
      const session=station.session;
      let text='Listening station is ready. Waiting for scans.';
      if(session?.status==='pending') text=`${station.name} · Listening in progress · ${Math.floor(session.remaining_seconds/60)}:${String(session.remaining_seconds%60).padStart(2,'0')} until this play is recorded`;
      else if(session?.status==='completed') text='Play recorded. End this session before listening to the same record again.';
      else if(session?.status==='canceled') text='Listening session canceled. No play was recorded.';
      else if(session?.status==='ended') text='Session ended. Ready for your next record.';
      const readerMessage = station.reader_status === 'error' ? 'Reader reported an error. ' : station.reader_status === 'disconnected' ? 'No reader heartbeat. ' : station.reader_status === 'simulation' ? 'Test scan mode. ' : '';
      text = readerMessage + text;
      $('#station-status').textContent=text;
      $('#station-unknown').hidden=!station.unknown_uid;
      $('#station-uid').textContent=station.unknown_uid || '';
      $('#detail-station-status').hidden=false;
      $('#detail-station-status').textContent=station.unknown_uid ? `Unknown tag ${station.unknown_uid}. Assign it to a record before listening.` : text;
      $('#detail-station-actions').hidden=false;
      $('#detail-assign-unknown').hidden=!station.unknown_uid;
      $('#detail-station-end').hidden=!session || !['pending','completed'].includes(session.status);
      $('#detail-station-end').textContent=session?.status==='pending'?'Cancel listening':'End session';
      $('#station-end').hidden=!session || !['pending','completed'].includes(session.status);
      $('#station-end').textContent=session?.status==='pending'?'Cancel listening':'End session';
      const blocked=Boolean(document.querySelector('dialog[open]:not(#details)'));
      const changed=observedSequence!==station.scan_sequence || observedStatus!==session?.status;
      if(!blocked && changed) {
        observedSequence=station.scan_sequence;observedStatus=session?.status || '';
        if(session && ['pending','completed'].includes(session.status) && !station.unknown_uid) {
          if(location.hash!==`#record/${session.copy_id}`) location.hash=`record/${session.copy_id}`;
          else await renderCurrent();
        }
        await reload();
      }
    } catch(error){$('#station-status').textContent=`Station unavailable: ${error.message}`;}
    finally{polling=false;}
  }
  $('#detail-assign-unknown').addEventListener('click',()=>$('#station-assign').click());
  $('#detail-station-end').addEventListener('click',()=>$('#station-end').click());
  $('#station-end').addEventListener('click',async()=>{
    $('#station-end').disabled=true;
    try { await api(`/stations/${encodeURIComponent(stationId)}/end`,{method:'POST'});await pollStation(); }
    catch(error){$('#station-status').textContent=error.message;}
    finally{$('#station-end').disabled=false;}
  });
  $('#station-assign').addEventListener('click',async()=>{
    $('#station-tag-error').textContent='';
    try {
      const all=await api('/records');
      $('#station-record').innerHTML=all.map(record=>`<option value="${escape(record.id)}">${escape(record.inventory_number)} · ${escape(record.title)}</option>`).join('');
      if(!all.length)throw new Error('Add a record before assigning a tag.');
      $('#station-tag-uid').textContent=latestStation.unknown_uid;
      $('#station-tag-replace').checked=false;$('#station-tag-editor').showModal();
    }catch(error){$('#station-status').textContent=error.message;}
  });
  $('#station-tag-form').addEventListener('submit',async event=>{
    event.preventDefault();$('#station-tag-save').disabled=true;
    try {
      await api(`/tags/${encodeURIComponent($('#station-tag-uid').textContent)}`,{method:'PUT',body:JSON.stringify({copy_id:$('#station-record').value,replace:$('#station-tag-replace').checked})});
      $('#station-tag-editor').close();await reload();await pollStation();
      $('#station-status').textContent='Tag assigned. Remove and scan it again to start listening.';
    }catch(error){$('#station-tag-error').textContent=error.message;}
    finally{$('#station-tag-save').disabled=false;}
  });
  $('#station-tag-cancel').addEventListener('click',()=>$('#station-tag-editor').close());
  if(stationId) { setInterval(pollStation,1000);pollStation(); }
  return {
    details(record) {
      $('#favorite').textContent=record.favorite?'★ Favorite':'☆ Add to favorites';
      $('#favorite').setAttribute('aria-pressed',Boolean(record.favorite));
      $('#listening-details').innerHTML=`<div class="listening-summary"><span><strong>${record.play_count || 0}</strong> recorded plays</span><span class="muted">${record.last_played_at ? `Last played ${escape(displayDate(record.last_played_at))}` : 'Not played yet'}</span></div><div class="section-heading"><h3>Listening history</h3><button id="add-play" type="button">Add a play</button></div><ul id="play-history" class="play-history"></ul><p id="history-error" class="error" role="alert"></p><div class="section-heading"><p><small>NFC tag: ${escape(record.nfc_uid || 'Not assigned')}</small></p><button id="assign-tag" type="button">${record.nfc_uid?'Replace tag':'Assign tag'}</button></div>${record.nfc_uid?'<button id="remove-tag-open" type="button" class="danger">Remove tag association</button>':''}`;
      $('#add-play').addEventListener('click',()=>openPlay());
      $('#assign-tag').addEventListener('click',()=>{
        tagRecord=record;$('#tag-uid').value=record.nfc_uid || '';$('#tag-replace').checked=false;$('#tag-error').textContent='';$('#tag-editor').showModal();
      });
      $('#remove-tag-open')?.addEventListener('click',()=>{tagToRemove=record.nfc_uid;$('#remove-tag-error').textContent='';$('#remove-tag').showModal();});
      loadHistory(record);
    }
  };
}
