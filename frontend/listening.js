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
  let stationAvailable = false;
  let stationRecords = [];
  let assignmentNotice = null;
  let assignmentGeneration = 0;
  let assignmentScanSequence = null;
  let assignmentSaving = false;
  function setText(selector, text) {
    const element = $(selector);
    if (element.textContent !== text) element.textContent = text;
  }
  function readerFeedback(status) {
    const messages = {
      connected: 'Reader connected. Ready to scan.',
      simulation: 'Test scan mode. This test does not use a physical reader.',
      disconnected: 'Reader disconnected. Check the cable and restart the reader bridge. Existing listening sessions continue.',
      error: 'Reader error. Check the reader and restart its bridge. Existing listening sessions continue.'
    };
    const text = messages[status] || 'Reader status is not available.';
    for (const selector of ['#station-reader-state', '#detail-reader-state']) {
      const element = $(selector); element.hidden = false; element.dataset.state = status || 'unknown';
      setText(selector, text);
    }
  }
  function scanFeedback(text) {
    for (const selector of ['#station-feedback', '#detail-station-feedback']) {
      $(selector).hidden = !text; setText(selector, text);
    }
  }
  function stationSelection(resetReplacement = true) {
    const record = stationRecords.find(record => record.id === $('#station-record').value);
    if (resetReplacement) $('#station-tag-replace').checked = false;
    $('#station-tag-replace-label').hidden = !record?.nfc_uid;
    $('#station-tag-save').disabled = assignmentSaving || !record;
    $('#station-tag-summary').textContent = record
      ? `${record.inventory_number} · ${record.artist} · ${record.title}. ${record.nfc_uid ? `Existing tag: ${record.nfc_uid}. Confirm replacement to remove its association.` : 'This record has no tag yet.'}`
      : 'No matching records. Change your search to choose a record.';
  }
  function filterStationRecords() {
    const query = $('#station-record-search').value.trim().toLocaleLowerCase();
    const previous = $('#station-record').value;
    const matches = stationRecords.filter(record => `${record.inventory_number} ${record.artist} ${record.title}`.toLocaleLowerCase().includes(query));
    $('#station-record').innerHTML = matches.map(record => `<option value="${escape(record.id)}">${escape(record.inventory_number)} · ${escape(record.artist)} · ${escape(record.title)}</option>`).join('');
    if (matches.some(record => record.id === previous)) $('#station-record').value = previous;
    $('#station-record-count').textContent = `${matches.length} of ${stationRecords.length} records`;
    stationSelection();
  }
  $('#station-record-search').addEventListener('input', filterStationRecords);
  $('#station-record').addEventListener('change', () => stationSelection());
  $('#station-tag-editor').addEventListener('close', () => { assignmentGeneration++; });
  async function pollStation() {
    if (!stationId || document.hidden || polling) return;
    polling=true;
    $('#station-panel').hidden=false;
    try {
      const station=await api(`/stations/${encodeURIComponent(stationId)}`);
      latestStation=station; stationAvailable=true;
      $('#station-retry').hidden=true; $('#detail-station-retry').hidden=true;
      $('#station-assign').disabled=false; $('#detail-assign-unknown').disabled=false;
      readerFeedback(station.reader_status);
      if (assignmentNotice && assignmentNotice.sequence !== station.scan_sequence) assignmentNotice=null;
      scanFeedback(assignmentNotice?.text || (station.unknown_uid ? 'Unknown tag scanned. Choose a record to assign it.' : station.session && ['pending','completed'].includes(station.session.status) ? 'Tag recognized. This record is linked to the listening session.' : ''));
      const session=station.session;
      let text='Listening station is ready. Waiting for scans.';
      if(session?.status==='pending') text=`${station.name} · Listening in progress · ${Math.floor(session.remaining_seconds/60)}:${String(session.remaining_seconds%60).padStart(2,'0')} until this play is recorded`;
      else if(session?.status==='completed') text='Play recorded. End this session before listening to the same record again.';
      else if(session?.status==='canceled') text='Listening session canceled. No play was recorded.';
      else if(session?.status==='ended') text='Session ended. Ready for your next record.';
      if (station.unknown_uid && !session) text='Waiting for tag assignment. No listening session has started.';
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
      const sessionStatus=session?.status || '';
      const changed=observedSequence!==station.scan_sequence || observedStatus!==sessionStatus;
      if(!blocked && changed) {
        observedSequence=station.scan_sequence;observedStatus=sessionStatus;
        if(session && ['pending','completed'].includes(session.status) && !station.unknown_uid) {
          if(location.hash!==`#record/${session.copy_id}`) location.hash=`record/${session.copy_id}`;
          else await renderCurrent();
        }
        await reload();
      }
    } catch(error){
      stationAvailable=false;
      const text=`Station unavailable: ${error.message}. Check the server connection; automatic checks continue.`;
      for (const selector of ['#station-reader-state','#detail-reader-state']) {
        $(selector).hidden=false; $(selector).dataset.state='error'; setText(selector,text);
      }
      $('#station-retry').hidden=false; $('#detail-station-retry').hidden=false;
      $('#station-assign').disabled=true; $('#detail-assign-unknown').disabled=true;
    }
    finally{polling=false;}
  }
  $('#station-retry').addEventListener('click', pollStation);
  $('#detail-station-retry').addEventListener('click', pollStation);
  $('#detail-assign-unknown').addEventListener('click',()=>$('#station-assign').click());
  $('#detail-station-end').addEventListener('click',()=>$('#station-end').click());
  $('#station-end').addEventListener('click',async()=>{
    $('#station-end').disabled=true;
    try { await api(`/stations/${encodeURIComponent(stationId)}/end`,{method:'POST'});await pollStation(); }
    catch(error){$('#station-status').textContent=error.message;}
    finally{$('#station-end').disabled=false;}
  });
  $('#station-assign').addEventListener('click',async()=>{
    if (!stationAvailable || !latestStation?.unknown_uid || $('#station-tag-editor').open) return;
    const generation=++assignmentGeneration;
    $('#station-tag-error').textContent='';
    assignmentScanSequence=latestStation.scan_sequence;
    $('#station-tag-uid').textContent=latestStation.unknown_uid;
    stationRecords=[];
    $('#station-record-search').value=''; $('#station-record').replaceChildren();
    $('#station-tag-summary').textContent='Loading your records…';
    $('#station-record-count').textContent='';
    $('#station-tag-replace').checked=false; $('#station-tag-replace-label').hidden=true;
    $('#station-tag-save').disabled=true; $('#station-tag-editor').showModal();
    try {
      const all=await api('/records');
      if (generation!==assignmentGeneration) return;
      stationRecords=all; filterStationRecords();
      if(!all.length) $('#station-tag-summary').textContent='Add a record before assigning this tag.';
    }catch(error){if(generation===assignmentGeneration) $('#station-tag-error').textContent=error.message;}
  });
  $('#station-tag-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if (assignmentSaving || $('#station-tag-save').disabled) return;
    const selected=stationRecords.find(record=>record.id===$('#station-record').value);
    if (!selected) return;
    const uid=$('#station-tag-uid').textContent;
    const generation=assignmentGeneration;
    const sequence=assignmentScanSequence;
    assignmentSaving=true;
    $('#station-tag-save').disabled=true; $('#station-tag-error').textContent='';
    for (const selector of ['#station-record-search','#station-record','#station-tag-replace']) $(selector).disabled=true;
    try {
      await api(`/tags/${encodeURIComponent(uid)}`,{method:'PUT',body:JSON.stringify({copy_id:selected.id,replace:$('#station-tag-replace').checked})});
      assignmentNotice={sequence,text:`Tag ${uid} assigned to ${selected.inventory_number} · ${selected.title}. Remove and scan it again to start listening.`};
      scanFeedback(assignmentNotice.text);
      if(generation===assignmentGeneration) $('#station-tag-editor').close();
      await reload();await pollStation();
    }catch(error){if(generation===assignmentGeneration) $('#station-tag-error').textContent=error.message;}
    finally{
      assignmentSaving=false;
      for (const selector of ['#station-record-search','#station-record','#station-tag-replace']) $(selector).disabled=false;
      if ($('#station-tag-editor').open) stationSelection(false);
    }
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
