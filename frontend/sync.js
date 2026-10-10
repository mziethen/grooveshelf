import { releaseNotesMarkup } from './release-notes.js';
import { pressingMarkup } from './pressings.js';
export function createDiscogsSync({api, escape, reload, currentRecord, renderCurrent}) {
  const $ = selector => document.querySelector(selector);
  let plan = null;
  let running = false;
  let generation = 0;
  let expiryTimer;
  let retryCopy;
  let missingAction;
  let review = null;
  let planDeadline = 0;
  let fieldMapping=null,fieldDefinitions=null,fieldGeneration=0,fieldsBusy=false;
  const personalLabels={media_condition:'Record condition',sleeve_condition:'Sleeve condition',notes:'Personal notes'};
  function personalValue(value) {return value == null ? 'Not graded' : value === '' ? '(empty)' : String(value);}
  $('#sync-fields-open').addEventListener('click',async()=>{
    if(running||fieldsBusy)return;
    const current=++fieldGeneration;fieldsBusy=true;fieldDefinitions=null;
    $('#sync-field-error').textContent='';$('#sync-field-account').textContent='Loading fields for the connected account…';
    $('#sync-field-preview').disabled=true;$('#sync-field-dialog').showModal();
    try {
      const data=await api('/discogs/sync/fields');if(current!==fieldGeneration)return;
      fieldDefinitions=data;$('#sync-field-account').textContent=`Connected as ${data.username} · account ${data.account_id}`;
      for(const field of Object.keys(personalLabels)) {
        const select=$('#sync-field-'+field);
        select.innerHTML='<option value="">Do not import</option>'+data.fields.map(item=>`<option value="${escape(String(item.id))}">${escape(item.name)} · field ${escape(String(item.id))}</option>`).join('');
        select.value=fieldMapping?.account_id===data.account_id ? String(fieldMapping[field]||'') : '';
      }
      $('#sync-field-preview').disabled=false;
    } catch(error) {if(current===fieldGeneration)$('#sync-field-error').textContent=error.message;}
    finally {if(current===fieldGeneration)fieldsBusy=false;}
  });
  $('#sync-field-cancel').addEventListener('click',()=>$('#sync-field-dialog').close());
  $('#sync-field-dialog').addEventListener('close',()=>{fieldGeneration++;fieldsBusy=false;});
  $('#sync-field-form').addEventListener('submit',event=>{
    event.preventDefault();if(fieldsBusy||!fieldDefinitions)return;
    const next={account_id:fieldDefinitions.account_id};
    for(const field of Object.keys(personalLabels))next[field]=$('#sync-field-'+field).value?Number($('#sync-field-'+field).value):null;
    const ids=Object.values(next).filter(value=>typeof value==='number');
    if(new Set(ids).size!==ids.length){$('#sync-field-error').textContent='Choose a different Discogs field for each local field.';return;}
    fieldMapping=next;$('#sync-field-dialog').close();preview();
  });
  async function preview() {
    const current = ++generation;
    clearTimeout(expiryTimer);
    plan = null; review = null;
    if ($('#sync-review').open) $('#sync-review').close();
    $('#sync-apply').textContent = 'Review selected changes';
    $('#sync-apply').disabled = true;
    $('#sync-preview').disabled = $('#sync-fields-open').disabled = true;
    $('#sync-results').replaceChildren();
    $('#sync-notices').replaceChildren();
    $('#sync-error').textContent = '';
    $('#sync-status').textContent = 'Reading your Discogs collection…';
    try {
      const data = await api('/discogs/sync/preview',fieldMapping?{method:'POST',body:JSON.stringify(fieldMapping)}:{});
      if (current !== generation) return;
      plan = data; planDeadline = Date.now() + data.expires_in_seconds * 1000;
      $('#sync-status').textContent = `Connected as ${data.username} · ${data.remote_count} Discogs copies. Choose the changes you want to apply. Only Vinyl releases are offered for import.`;
      $('#sync-last').textContent = data.last_success_at ? `Last successful sync change: ${new Date(data.last_success_at).toLocaleString()}` : 'No sync changes have been applied yet.';
      $('#sync-results').innerHTML = data.actions.map(action => `<article class="sync-entry" data-action="${escape(action.id)}"><h3>${escape(action.inventory_number || action.artist || 'Discogs copy')} · ${escape(action.title)}</h3><p class="muted">${action.kind === 'remote' ? `Discogs instance ${action.instance_id}` : 'GrooveShelf copy'} · Release ${action.release_id}</p><a class="attribution" href="${escape(action.source_url)}" target="_blank" rel="noopener">Data provided by Discogs</a>${action.kind === 'rating' ? `<p>Rating · GrooveShelf: ${escape(ratingLabel(action.local_rating))} · Discogs: ${escape(ratingLabel(action.remote_rating))}</p>` : action.kind === 'personal' ? `<div class="sync-field-values"><p>${escape(personalLabels[action.field])} · Discogs field: ${escape(action.definition.name)}</p><p>GrooveShelf: ${escape(personalValue(action.local_value))}</p><p>Discogs: ${escape(personalValue(action.remote_value))}</p></div>` : ''}<label>Action<select><option value="skip">Keep unchanged</option>${action.kind === 'remote' ? `<option value="import">Import ${action.matches.length ? 'as an additional copy' : 'into GrooveShelf'}</option>${action.matches.map(match => `<option value="link:${escape(match.id)}">Match ${escape(match.inventory_number)} · ${escape(match.title)}</option>`).join('')}` : action.kind === 'rating' ? `<option value="rating_import">Use Discogs rating · ${escape(ratingLabel(action.remote_rating))}</option>` : action.kind === 'personal' ? `<option value="personal_import">Use Discogs ${escape(personalLabels[action.field].toLowerCase())}</option>` : '<option value="export">Add this copy to Discogs</option>'}</select></label><p class="sync-result" role="status"></p></article>`).join('') || '<p class="muted">No additions are ready to synchronize.</p>';
      $('#sync-notices').innerHTML = data.notices.map(notice => `<li>${escape(notice.message)}${notice.copy_id && notice.kind === 'unlinked' ? ` <button type="button" data-open-copy="${escape(notice.copy_id)}">Choose release</button>` : notice.copy_id && notice.kind === 'uncertain' ? ` <button type="button" data-review-export="${escape(notice.copy_id)}">Review failed export</button>` : ['remote_missing','release_conflict','account_conflict'].includes(notice.kind) && notice.action_id ? ` <button type="button" data-remove-link="${escape(notice.action_id)}">${notice.kind === 'account_conflict' ? 'Review account conflict' : notice.kind === 'release_conflict' ? 'Review release conflict' : 'Review missing link'}</button>` : ''}</li>`).join('');
      $('#sync-notices').querySelectorAll('[data-open-copy]').forEach(button => button.addEventListener('click', () => {
        $('#sync-dialog').close(); location.hash = `record/${button.dataset.openCopy}`;
      }));
      $('#sync-notices').querySelectorAll('[data-review-export]').forEach(button => button.addEventListener('click', () => {
        retryCopy = button.dataset.reviewExport;
        $('#export-retry-check').checked = false;
        $('#export-retry-error').textContent = '';
        $('#export-retry-dialog').showModal();
      }));
      $('#sync-notices').querySelectorAll('[data-remove-link]').forEach(button => button.addEventListener('click', () => {
        if (running || !plan) return;
        const notice = data.notices.find(item => item.action_id === button.dataset.removeLink);
        missingAction = {plan_id:plan.plan_id, action_id:notice.action_id};
        $('#missing-link-copy').textContent = notice.message;
        const conflict = notice.kind === 'release_conflict', accountConflict = notice.kind === 'account_conflict';
        $('#missing-link-title').textContent = accountConflict ? 'Review previous Discogs account' : conflict ? 'Review changed Discogs release' : 'Remove missing Discogs link';
        $('#missing-link-confirm').textContent = accountConflict ? 'Remove previous-account link' : conflict ? 'Remove conflicting link' : 'Remove missing link';
        $('#missing-link-scope').textContent = accountConflict ? 'GrooveShelf rechecks the connected account and saved local association. The previous account cannot be checked with the current credentials and will not be contacted. Matching or exporting to the new account requires a separate fresh preview.' : 'GrooveShelf checks Discogs again before removing the link. To match another copy or add it to Discogs, choose that action in a fresh sync preview.';
        $('#missing-link-check').checked = false;
        $('#missing-link-error').textContent = '';
        $('#missing-link-dialog').showModal();
      }));
      $('#sync-results').querySelectorAll('select').forEach(select => select.addEventListener('change', updateSelection));
      updateSelection();
      expiryTimer = setTimeout(() => {
        if (running) return;
        plan = null; $('#sync-results').replaceChildren(); $('#sync-notices').replaceChildren();
        $('#sync-apply').disabled = true;
        if ($('#sync-review').open) { $('#sync-review-confirm').disabled = true; $('#sync-review-error').textContent = 'This preview has expired. Go back and refresh it before applying changes.'; }
        $('#sync-status').textContent = 'This preview has expired. Refresh it before applying changes.';
      }, data.expires_in_seconds * 1000);
    } catch (error) { if (current === generation) $('#sync-error').textContent = error.message; }
    finally { if (current === generation) $('#sync-preview').disabled = $('#sync-fields-open').disabled = false; }
  }
  $('#sync-open').addEventListener('click', () => {$('#sync-dialog').showModal(); preview();});
  $('#sync-preview').addEventListener('click', preview);
  $('#sync-cancel').addEventListener('click', () => {if (!running) $('#sync-dialog').close();});
  $('#sync-dialog').addEventListener('cancel', event => {if (running) event.preventDefault();});
  $('#sync-dialog').addEventListener('close', () => {generation++; clearTimeout(expiryTimer); plan=null;review=null;fieldMapping=null;fieldDefinitions=null;fieldGeneration++;if ($('#sync-field-dialog').open) $('#sync-field-dialog').close();if ($('#sync-review').open) $('#sync-review').close();});
  function selectedChanges() {
    return [...$('#sync-results').querySelectorAll('[data-action]')]
      .filter(row => row.querySelector('select').value !== 'skip' && !row.querySelector('select').disabled)
      .map(row => ({row, value:row.querySelector('select').value, action:plan.actions.find(action => action.id === row.dataset.action)}));
  }
  function ratingLabel(value) {return value == null ? 'Unrated' : `${value}/5`;}
  function updateSelection() {
    const count = plan ? selectedChanges().length : 0;
    $('#sync-apply').disabled = running || !count;
    $('#sync-apply').textContent = count ? `Review ${count} ${count === 1 ? 'change' : 'changes'}` : 'Review selected changes';
  }
  $('#sync-review-back').addEventListener('click', () => {if (!running) $('#sync-review').close();});
  $('#sync-review').addEventListener('close', () => {review = null;});
  $('#sync-review').addEventListener('cancel', event => {if (running) event.preventDefault();});
  $('#sync-apply').addEventListener('click', () => {
    if (!plan || running) return;
    $('#sync-error').textContent = '';
    const changes = selectedChanges();
    const copies = new Set();
    for (const {value,action} of changes) {
      const [choice,copyId] = value.split(':');
      const id = choice === 'link' ? copyId : ['export','rating_import','personal_import'].includes(choice) ? action.copy_id : null;
      const selectionKey = choice === 'personal_import' ? `${id}:${action.field}` : choice === 'rating_import' ? `${id}:rating` : id;
      if (id && copies.has(selectionKey)) {$('#sync-error').textContent = 'Choose only one action for each GrooveShelf copy. A copy cannot be matched twice or matched and exported together.';return;}
      if (id) copies.add(selectionKey);
    }
    if (!changes.length) return;
    review = {plan, generation, changes};
    const counts = {import:0,link:0,export:0,rating_import:0,personal_import:0};
    for (const {value} of changes) counts[value.split(':')[0]]++;
    $('#sync-review-summary').textContent = `${counts.import} ${counts.import === 1 ? 'import' : 'imports'} into GrooveShelf · ${counts.link} ${counts.link === 1 ? 'copy match' : 'copy matches'} · ${counts.export} ${counts.export === 1 ? 'addition' : 'additions'} to Discogs (${plan.username}).${counts.rating_import ? ` ${counts.rating_import} rating ${counts.rating_import === 1 ? 'update' : 'updates'} in GrooveShelf.` : ''}${counts.personal_import ? ` ${counts.personal_import} personal field ${counts.personal_import === 1 ? 'update' : 'updates'} in GrooveShelf.` : ''}`;
    $('#sync-review-items').innerHTML = changes.map(({value,action}) => {
      const [choice,copyId] = value.split(':');
      const match = action.matches?.find(item => item.id === copyId);
      const destination = choice === 'personal_import' ? `Update ${action.inventory_number} in GrooveShelf · ${personalLabels[action.field]}: ${personalValue(action.local_value)} → ${personalValue(action.remote_value)}` : choice === 'rating_import' ? `Update ${action.inventory_number} in GrooveShelf · Rating: ${ratingLabel(action.local_rating)} → ${ratingLabel(action.remote_rating)}` : choice === 'import' ? 'Import into GrooveShelf · a new LP number will be assigned' : choice === 'link' ? `Match Discogs instance ${action.instance_id} to ${match.inventory_number} · ${match.title}` : `Add ${action.inventory_number} to Discogs (${plan.username}) · Uncategorised folder`;
      return `<li><h3>${escape(action.title)}</h3><p>${escape(destination)}</p><p class="muted">Release ${escape(action.release_id)}${['remote','rating','personal'].includes(action.kind) ? ` · Discogs instance ${escape(action.instance_id)}` : ''}</p><a class="attribution" href="${escape(action.source_url)}" target="_blank" rel="noopener">Data provided by Discogs</a></li>`;
    }).join('');
    $('#sync-review-error').textContent = '';
    $('#sync-review-confirm').disabled = false;
    $('#sync-review').showModal();
  });
  $('#sync-review-confirm').addEventListener('click', async () => {
    if (!review || running) return;
    if (review.plan !== plan || review.generation !== generation || Date.now() >= planDeadline || review.changes.some(({row,value}) => !row.isConnected || row.querySelector('select').value !== value)) {
      $('#sync-review-error').textContent = 'The preview or selected changes have changed. Go back and review a fresh preview.';
      $('#sync-review-confirm').disabled = true;return;
    }
    const {changes} = review;
    const planId = plan.plan_id;
    running = true;
    $('#sync-review-confirm').disabled = true;
    $('#sync-review').close();
    $('#sync-apply').disabled = $('#sync-preview').disabled = $('#sync-fields-open').disabled = $('#sync-cancel').disabled = true;
    $('#sync-error').textContent = '';
    $('#sync-results').querySelectorAll('select').forEach(select => {select.disabled = true;});
    let completed = 0, failed = false;
    try {
      for (let index=0; index<changes.length; index++) {
        const {row,value} = changes[index];
        const [choice, copyId] = value.split(':');
        $('#sync-status').textContent = `Applying change ${index+1} of ${changes.length}…`;
        try {
          const result = await api('/discogs/sync/apply', {method:'POST',body:JSON.stringify({plan_id:planId,action_id:row.dataset.action,choice,copy_id:copyId || null,...(['rating_import','personal_import'].includes(choice) ? {confirmed:true} : {})})});
          row.querySelector('.sync-result').textContent = `${result.status === 'imported' ? `Imported as ${result.inventory_number}` : result.status === 'personal_imported' ? 'Personal field updated in GrooveShelf' : result.status === 'rating_imported' ? 'Rating updated in GrooveShelf' : result.status === 'linked' ? 'Copies matched' : 'Added to Discogs'}.`;
          row.dataset.applied = 'true';completed++;
        } catch (error) {
          failed = true;
          row.querySelector('.sync-result').textContent = error.message;
          for (const pending of changes.slice(index+1)) pending.row.querySelector('.sync-result').textContent = 'Not attempted. Refresh the preview before trying again.';
          $('#sync-error').textContent = changes.some(change=>change.value === 'export') ? 'Sync stopped. Completed changes are retained. An unconfirmed export may have reached Discogs; refresh the preview before retrying.' : 'Sync stopped. Completed changes are retained. Refresh the preview to review current values before retrying.';
          break;
        }
      }
      $('#sync-status').textContent = failed ? `${completed} of ${changes.length} changes applied · 1 failed or unconfirmed · ${changes.length-completed-1} not attempted.` : `${completed} ${completed === 1 ? 'change' : 'changes'} applied. Refresh the preview to check the current state.`;
      try {await reload();if (currentRecord()) await renderCurrent();}
      catch(error) {$('#sync-error').textContent += ` Changes are retained, but the local view could not refresh: ${error.message}`;}
    } finally {
      running = false;
      clearTimeout(expiryTimer);
      plan = null; $('#sync-apply').disabled = true;
      $('#sync-apply').textContent = 'Review selected changes';
      $('#sync-preview').disabled = $('#sync-fields-open').disabled = $('#sync-cancel').disabled = false;
    }
  });

  $('#missing-link-cancel').addEventListener('click', () => {if (!running) $('#missing-link-dialog').close();});
  $('#missing-link-dialog').addEventListener('cancel', event => {if (running) event.preventDefault();});
  $('#missing-link-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (running || !missingAction) return;
    if (!plan || plan.plan_id !== missingAction.plan_id) {
      $('#missing-link-error').textContent = 'This preview has expired. Close this dialog and refresh the preview.';
      return;
    }
    running = true;
    $('#missing-link-confirm').disabled = $('#missing-link-cancel').disabled = true;
    $('#missing-link-error').textContent = '';
    try {
      await api('/discogs/sync/apply', {method:'POST',body:JSON.stringify({...missingAction,choice:'detach',confirmed:$('#missing-link-check').checked})});
      $('#missing-link-dialog').close();
      await preview();
    } catch (error) {$('#missing-link-error').textContent = error.message;}
    finally {
      running = false;
      $('#missing-link-confirm').disabled = $('#missing-link-cancel').disabled = false;
    }
  });

  $('#export-retry-cancel').addEventListener('click', () => $('#export-retry-dialog').close());
  $('#export-retry-form').addEventListener('submit', async event => {
    event.preventDefault(); $('#export-retry-confirm').disabled = true;
    try {
      await api(`/records/${retryCopy}/discogs-export/retry`, {method:'POST',body:JSON.stringify({checked_discogs:$('#export-retry-check').checked})});
      $('#export-retry-dialog').close(); await preview();
    } catch (error) { $('#export-retry-error').textContent = error.message; }
    finally { $('#export-retry-confirm').disabled = false; }
  });

  let releaseRecord;
  let releaseId;
  let releaseGeneration = 0;
  let releaseExpiry;
  $('#link-release').addEventListener('click', () => {
    clearTimeout(releaseExpiry);
    releaseRecord = currentRecord().id;
    releaseId = null; releaseGeneration++;
    $('#release-id').value = currentRecord().discogs_release_id || '';
    $('#release-preview').replaceChildren(); $('#release-error').textContent = '';
    $('#release-save').disabled = true;
    $('#release-dialog').showModal();
  });
  $('#release-load').addEventListener('click', async () => {
    clearTimeout(releaseExpiry);
    const id = Number($('#release-id').value);
    const current = ++releaseGeneration;
    releaseId = null; $('#release-save').disabled = true;
    $('#release-error').textContent = ''; $('#release-preview').replaceChildren();
    if (!Number.isSafeInteger(id) || id < 1) {$('#release-error').textContent = 'Enter the numeric Discogs release ID.';return;}
    $('#release-load').disabled = true;
    try {
      const data = await api(`/metadata/discogs/releases/${id}`);
      if (current !== releaseGeneration) return;
      $('#release-preview').innerHTML = `<h3>${escape(data.title)}</h3><p>${escape(data.artist)} · ${escape(data.year || '')}</p><a class="attribution" href="${escape(data.source_url)}" target="_blank" rel="noopener">Data provided by Discogs</a>${pressingMarkup(data, escape)}${releaseNotesMarkup(data, escape)}<p class="muted">Confirm that this is your exact pressing. Your local album details, LP number, tag and listening history will be retained.</p>`;
      if (!data.is_vinyl) throw new Error('This is not a Vinyl release. Choose your vinyl pressing.');
      releaseId = id; $('#release-save').disabled = false;
      if (data.metadata_expires_at) releaseExpiry = setTimeout(() => {
        releaseId=null;$('#release-save').disabled=true;$('#release-preview').replaceChildren();
        $('#release-error').textContent='This preview has expired. Preview the release again.';
      }, Math.max(0,data.metadata_expires_at*1000-Date.now()));
    } catch (error) {if (current === releaseGeneration) $('#release-error').textContent = error.message;}
    finally {$('#release-load').disabled = false;}
  });
  $('#release-id').addEventListener('input', () => {releaseGeneration++;releaseId=null;$('#release-save').disabled=true;$('#release-preview').replaceChildren();});
  $('#release-cancel').addEventListener('click', () => $('#release-dialog').close());
  $('#release-dialog').addEventListener('close', () => {releaseGeneration++;clearTimeout(releaseExpiry);});
  $('#release-save').addEventListener('click', async () => {
    if (!releaseId) return;
    $('#release-save').disabled = true;
    try {
      await api(`/records/${releaseRecord}/discogs-release`, {method:'PUT',body:JSON.stringify({release_id:releaseId})});
      $('#release-dialog').close();await reload();await renderCurrent();
    } catch (error) {$('#release-error').textContent=error.message;}
    finally {$('#release-save').disabled=false;}
  });
}
