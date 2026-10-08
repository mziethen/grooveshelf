import { pressingMarkup } from './pressings.js';
export function createDiscogsSync({api, escape, reload, currentRecord, renderCurrent}) {
  const $ = selector => document.querySelector(selector);
  let plan = null;
  let running = false;
  let generation = 0;
  let expiryTimer;
  let retryCopy;
  let missingAction;
  async function preview() {
    const current = ++generation;
    clearTimeout(expiryTimer);
    plan = null;
    $('#sync-apply').disabled = true;
    $('#sync-preview').disabled = true;
    $('#sync-results').replaceChildren();
    $('#sync-notices').replaceChildren();
    $('#sync-error').textContent = '';
    $('#sync-status').textContent = 'Reading your Discogs collection…';
    try {
      const data = await api('/discogs/sync/preview');
      if (current !== generation) return;
      plan = data;
      $('#sync-status').textContent = `Connected as ${data.username} · ${data.remote_count} Discogs copies. Choose the changes you want to apply. Only Vinyl releases are offered for import.`;
      $('#sync-last').textContent = data.last_success_at ? `Last successful sync change: ${new Date(data.last_success_at).toLocaleString()}` : 'No sync changes have been applied yet.';
      $('#sync-results').innerHTML = data.actions.map(action => `<article class="sync-entry" data-action="${escape(action.id)}"><h3>${escape(action.inventory_number || action.artist || 'Discogs copy')} · ${escape(action.title)}</h3><p class="muted">${action.kind === 'remote' ? `Discogs instance ${action.instance_id}` : 'GrooveShelf copy'} · Release ${action.release_id}</p><a class="attribution" href="${escape(action.source_url)}" target="_blank" rel="noopener">Data provided by Discogs</a><label>Action<select><option value="skip">Keep unchanged</option>${action.kind === 'remote' ? `<option value="import">Import ${action.matches.length ? 'as an additional copy' : 'into GrooveShelf'}</option>${action.matches.map(match => `<option value="link:${escape(match.id)}">Match ${escape(match.inventory_number)} · ${escape(match.title)}</option>`).join('')}` : '<option value="export">Add this copy to Discogs</option>'}</select></label><p class="sync-result" role="status"></p></article>`).join('') || '<p class="muted">No additions are ready to synchronize.</p>';
      $('#sync-notices').innerHTML = data.notices.map(notice => `<li>${escape(notice.message)}${notice.copy_id && notice.kind === 'unlinked' ? ` <button type="button" data-open-copy="${escape(notice.copy_id)}">Choose release</button>` : notice.copy_id && notice.kind === 'uncertain' ? ` <button type="button" data-review-export="${escape(notice.copy_id)}">Review failed export</button>` : notice.kind === 'remote_missing' && notice.action_id ? ` <button type="button" data-remove-link="${escape(notice.action_id)}">Review missing link</button>` : ''}</li>`).join('');
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
        $('#missing-link-copy').textContent = `${notice.inventory_number}: the linked Discogs collection copy is missing.`;
        $('#missing-link-check').checked = false;
        $('#missing-link-error').textContent = '';
        $('#missing-link-dialog').showModal();
      }));
      $('#sync-apply').disabled = !data.actions.length;
      expiryTimer = setTimeout(() => {
        if (running) return;
        plan = null; $('#sync-results').replaceChildren(); $('#sync-notices').replaceChildren();
        $('#sync-apply').disabled = true;
        $('#sync-status').textContent = 'This preview has expired. Refresh it before applying changes.';
      }, data.expires_in_seconds * 1000);
    } catch (error) { if (current === generation) $('#sync-error').textContent = error.message; }
    finally { $('#sync-preview').disabled = false; }
  }
  $('#sync-open').addEventListener('click', () => {$('#sync-dialog').showModal(); preview();});
  $('#sync-preview').addEventListener('click', preview);
  $('#sync-cancel').addEventListener('click', () => {if (!running) $('#sync-dialog').close();});
  $('#sync-dialog').addEventListener('cancel', event => {if (running) event.preventDefault();});
  $('#sync-dialog').addEventListener('close', () => {generation++; clearTimeout(expiryTimer); plan=null;});
  $('#sync-apply').addEventListener('click', async () => {
    if (!plan || running) return;
    const changes = [...$('#sync-results').querySelectorAll('[data-action]')].filter(row => row.querySelector('select').value !== 'skip' && !row.querySelector('select').disabled);
    if (!changes.length) {$('#sync-error').textContent = 'Choose at least one change in the preview.'; return;}
    running = true;
    $('#sync-apply').disabled = $('#sync-preview').disabled = $('#sync-cancel').disabled = true;
    $('#sync-error').textContent = '';
    $('#sync-results').querySelectorAll('select').forEach(select => {select.disabled = true;});
    try {
      for (let index=0; index<changes.length; index++) {
        const row = changes[index];
        const [choice, copyId] = row.querySelector('select').value.split(':');
        $('#sync-status').textContent = `Applying change ${index+1} of ${changes.length}…`;
        try {
          const result = await api('/discogs/sync/apply', {method:'POST',body:JSON.stringify({plan_id:plan.plan_id,action_id:row.dataset.action,choice,copy_id:copyId || null})});
          row.querySelector('.sync-result').textContent = `${result.status === 'imported' ? `Imported as ${result.inventory_number}` : result.status === 'linked' ? 'Copies matched' : 'Added to Discogs'}.`;
          row.dataset.applied = 'true';
        } catch (error) {
          row.querySelector('.sync-result').textContent = error.message;
          $('#sync-error').textContent = 'Sync stopped. Completed changes are retained. Refresh the preview to review the remaining changes.';
          break;
        }
      }
      $('#sync-status').textContent = 'Sync changes processed. Refresh the preview to check the current state.';
      await reload();
      if (currentRecord()) await renderCurrent();
    } finally {
      running = false;
      // A new preview is required after partial success or an uncertain outcome.
      plan = null; $('#sync-apply').disabled = true;
      $('#sync-preview').disabled = $('#sync-cancel').disabled = false;
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
      $('#release-preview').innerHTML = `<h3>${escape(data.title)}</h3><p>${escape(data.artist)} · ${escape(data.year || '')}</p><a class="attribution" href="${escape(data.source_url)}" target="_blank" rel="noopener">Data provided by Discogs</a>${pressingMarkup(data, escape)}<p class="muted">Confirm that this is your exact pressing. Your local album details, LP number, tag and listening history will be retained.</p>`;
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
