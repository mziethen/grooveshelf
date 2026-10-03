import { createCapture } from './capture.js';
import { createWishlist } from './wishlist.js';
import { createPersonalUI, populatePersonalOptions, personalPayload } from './personal.js';
import { createDiscogsSync } from './sync.js';
import { createCoverPicker } from './covers.js';
import { createListeningUI } from './listening.js';
import { createDiscogsSearch } from './discogs.js';
const $ = (selector) => document.querySelector(selector);
const state = { records: [], view: localStorage.getItem('grooveshelf-view') || 'grid', selected: null, editing: null, request: 0, masterId: null, coverImageId: null, wishId: null };
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  if (!response.ok) {
    let message = 'The request could not be completed. Please try again.';
    try { const data = await response.json(); message = typeof data.detail === 'string' ? data.detail : 'Please check the inventory number and required fields.'; } catch {}
    throw new Error(message);
  }
  return response.status === 204 ? null : response.json();
}
function cover(record) {
  const image = /^\/api\/covers\/discogs\/r?[0-9]+(?:\/[a-f0-9]{32}\?v=[0-9.]+)?$/.test(record.cover_url || '') ? `<img src="${escape(record.cover_url)}" alt="Cover of ${escape(record.title)}" loading="lazy">` : '';
  return `<div class="cover">${image}<div class="disc" aria-hidden="true"></div><span class="cover-number">${escape(record.inventory_number)}</span></div>`;
}
function attribution(record, referenceRelease = false) {
  const url = referenceRelease ? (record.reference_release_url || record.source_url) : record.source_url;
  if (!url) return '';
  return `<a class="attribution" href="${escape(url)}" target="_blank" rel="noopener">Data provided by Discogs</a>`;
}
function coverFallbacks(root) {
  root.querySelectorAll('.cover img').forEach(img => img.addEventListener('error', () => img.remove(), {once: true}));
}
let collectionMarkup;
function updateCollection(target, markup) {
  if (collectionMarkup === markup) return false;
  collectionMarkup = markup;
  target.innerHTML = markup;
  return true;
}
function render() {
  scheduleExpiry();
  $('#count').textContent = `${state.records.length} ${state.records.length === 1 ? 'record' : 'records'}`;
  $('#grid-view').setAttribute('aria-pressed', state.view === 'grid');
  $('#table-view').setAttribute('aria-pressed', state.view === 'table');
  const target = $('#collection');
  target.className = state.view === 'grid' ? 'grid' : 'table-wrap';
  if (!state.records.length) {
    target.className = '';
    if (!updateCollection(target, `<div class="empty"><h3>${$('#search').value ? 'Nothing here just yet.' : 'Your shelf is waiting.'}</h3><p>${$('#search').value ? 'Try a different artist, album, track or inventory number.' : 'Add your first record and start making<br>a little home for your collection.'}</p>${$('#search').value ? '' : '<button class="primary" id="empty-add">＋ Add your first record</button>'}</div>`)) return;
    $('#empty-add')?.addEventListener('click', () => openEditor());
    return;
  }
  let markup;
  if (state.view === 'grid') markup = state.records.map(r => `<article class="record-entry"><button class="record-card" data-record="${escape(r.id)}">${cover(r)}<h3>${escape(r.title)}</h3><p>${escape(r.artist)}</p><div class="record-meta"><span>${escape(r.inventory_number)}</span><span>${r.favorite ? '★ ' : ''}${escape(r.format)}${r.year ? ` · ${r.year}` : ''}</span></div></button>${attribution(r)}</article>`).join('');
  else markup = `<table><thead><tr><th>Inventory</th><th>Album</th><th>Artist</th><th>Format</th><th>Year</th></tr></thead><tbody>${state.records.map(r => `<tr><td>${escape(r.inventory_number)}</td><td><button data-record="${escape(r.id)}">${escape(r.title)}</button></td><td>${escape(r.artist)}${attribution(r)}</td><td>${escape(r.format)}</td><td>${r.year ?? '—'}</td></tr>`).join('')}</tbody></table>`;
  if (!updateCollection(target, markup)) return;
  coverFallbacks(target);
  target.querySelectorAll('[data-record]').forEach(button => button.addEventListener('click', () => { location.hash = `record/${button.dataset.record}`; }));
}
async function load() {
  const request = ++state.request;
  if (collectionMarkup === undefined) $('#message').textContent = 'Loading your collection…';
  try {
    const records = await api(`/records?q=${encodeURIComponent($('#search').value)}`);
    if (request !== state.request) return;
    state.records = records.map(hideExpired); $('#message').textContent = ''; render();
  } catch (error) { if (request === state.request) { state.records = state.records.map(hideExpired); render(); $('#message').textContent = `${error.message} Check that the server is available.`; } }
}
async function route() {
  const match = location.hash.match(/^#record\/([a-zA-Z0-9-]+)$/);
  if (!match) { if ($('#details').open) $('#details').close(); return; }
  try {
    const record = await api(`/records/${match[1]}`);
    if (location.hash !== `#record/${match[1]}`) return;
    state.selected = record;
    renderDetails(record);
  } catch (error) { $('#message').textContent = error.message; location.hash = ''; }
}
function renderDetails(record) {
    record = hideExpired(record);
    state.selected = record;
    scheduleExpiry();
    $('#detail-error').textContent = '';
    $('#refresh').hidden = !record.source_url;
    $('#choose-cover').hidden = !record.source_url;
    $('#edit').disabled = record.metadata_status === 'unavailable';
    $('#detail-content').innerHTML = `<div class="detail-intro">${cover(record)}<div><p class="eyebrow">${escape(record.inventory_number)} · ${escape(record.format)}</p><h2>${escape(record.title)}</h2><p>${escape(record.artist)}</p><p class="muted">${record.year || 'Release year not added'}</p>${attribution(record)}</div></div>${record.metadata_status === 'unavailable' ? '<p class="error">Discogs could not be refreshed. Older provider details and covers are hidden; your corrections are retained. Try refreshing again.</p>' : ''}${record.genres.length || record.styles.length ? `<p class="muted">${escape([...record.genres, ...record.styles].join(' · '))}</p>` : ''}${record.labels.length ? `<p class="muted">Reference release labels: ${escape(record.labels.join(', '))}</p>${attribution(record, true)}` : ''}<h3>Track list</h3>${record.tracks.length ? `<ol class="detail-tracks">${record.tracks.map(t => `<li><span>${escape(t.position) || '—'}</span>${escape(t.title)}</li>`).join('')}</ol>` : '<p class="muted">No tracks added yet.</p>'}${record.notes ? `<h3>Notes</h3><p class="notes">${escape(record.notes)}</p>` : ''}${record.description ? `<h3>About this album</h3><p class="notes">${escape(record.description)}</p>${attribution(record, true)}` : ''}${!record.cover_url && record.metadata_status !== 'unavailable' ? '<p class="muted"><small>No cover is available for this record.</small></p>' : ''}${record.cover_selection_status === 'missing' ? '<p class="error">Your selected Discogs image is no longer available. Choose another cover.</p>' : ''}${record.protected_fields.length ? '<p class="muted"><small>Your edited fields are protected during Discogs refreshes.</small></p>' : ''}`;
    coverFallbacks($('#detail-content'));
    personal.details(record);
    listening.details(record);
    if (!$('#details').open) $('#details').showModal();
}
function openEditor(record = null, after = null) {
  state.wishId = null; state.editing = record; state.masterId = null; state.coverImageId = null;
  discogs.reset(Boolean(record));
  const form = $('#record-form'); form.reset();
  $('#form-error').textContent = '';
  $('#editor-title').textContent = record ? 'Edit your record' : 'Add a record';
  if (record) {
    for (const key of ['inventory_number','artist','title','format','year','notes','rating','media_condition','sleeve_condition']) form.elements[key].value = record[key] ?? '';
    form.elements.tracks.value = record.tracks.map(t => t.position ? `${t.position} | ${t.title}` : t.title).join('\n');
  }
  if(!$('#editor').open)$('#editor').showModal();
  capture.reset(Boolean(record),after);
}
$('#record-form').addEventListener('submit', async event => {
  event.preventDefault(); $('#save').disabled = $('#save-next').disabled = true; $('#form-error').textContent = '';
  const formSnapshot=JSON.stringify([...new FormData(event.target)]);
  const addAnother=event.submitter?.id==='save-next'&&!state.editing&&!state.wishId;
  const keepArtist=$('#keep-artist').checked;
  const selectedMaster=state.masterId;
  const values = personalPayload(Object.fromEntries(new FormData(event.target)));
  const tracks = values.tracks.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const separator = line.indexOf('|');
    return separator < 0 ? { position: '', title: line } : { position: line.slice(0, separator).trim(), title: line.slice(separator + 1).trim() };
  });
  try {
    if(!await capture.check(!state.editing,true)) {$('#form-error').textContent='Review the existing copies and confirm that you are adding another physical copy.';return;}
    if(formSnapshot!==JSON.stringify([...new FormData(event.target)])||selectedMaster!==state.masterId){$('#form-error').textContent='Your details changed while checking. Save again to use the current details.';return;}
    const record = await api(state.wishId ? `/wishlist/${state.wishId}/acquire` : state.editing ? `/records/${state.editing.id}` : '/records', {method: state.editing ? 'PUT' : 'POST', body: JSON.stringify({...values, discogs_master_id: state.masterId, cover_image_id: state.coverImageId, year: values.year ? Number(values.year) : null, tracks})});
    if(addAnother){
      openEditor(null,record.inventory_number);
      event.target.elements.format.value=values.format;
      $('#keep-artist').checked=keepArtist;
      if(keepArtist)event.target.elements.artist.value=values.artist;
      $('#capture-status').textContent=`Saved ${record.inventory_number}. Ready for your next record.`;
      event.target.elements[keepArtist?'title':'artist'].focus();
      await load();return;
    }
    $('#editor').close(); await load();
    if (location.hash === `#record/${record.id}`) await route(); else location.hash = `record/${record.id}`;
  } catch (error) { $('#form-error').textContent = error.message; }
  finally { $('#save').disabled = $('#save-next').disabled = false; }
});
createWishlist({api,escape,onAcquire(wish) {
  openEditor();state.wishId=wish.id;$('#save-next').hidden=true;$('#capture-next-options').hidden=true;
  $('#editor-title').textContent='Add your purchased record';
  for(const name of ['artist','title','notes'])$('#record-form').elements[name].value=wish[name];
  if(wish.discogs_master_id)discogs.preview(wish.discogs_master_id);
}});
const capture=createCapture({api,escape,currentIdentity:()=>({masterId:state.masterId,editingId:state.editing?.id||null})});
populatePersonalOptions($('#record-form'));
const personal = createPersonalUI({api,escape,currentRecord:()=>state.selected,reload:load,renderCurrent:route});
const listening = createListeningUI({ api, escape, reload: load, currentRecord: () => state.selected, renderCurrent: route });
const discogs = createDiscogsSearch({ api, escape, onImport(data) {
  state.masterId = data.discogs_master_id; state.coverImageId = data.cover_image_id || null;
  const form = $('#record-form');
  for (const key of ['artist', 'title', 'year']) form.elements[key].value = data[key] ?? '';
  capture.changed();
  form.elements.tracks.value = data.tracks.map(t => t.position ? `${t.position} | ${t.title}` : t.title).join('\n');
}});
createDiscogsSync({api, escape, currentRecord: () => state.selected, reload: load, renderCurrent: route});
createCoverPicker({api, escape, currentRecord: () => state.selected, reload: load, renderCurrent: route});
$('#editor').addEventListener('close', () => discogs.close());
$('#refresh').addEventListener('click', async () => {
  $('#refresh').disabled = true; $('#detail-error').textContent = '';
  try { await api(`/records/${state.selected.id}/refresh`, {method: 'POST'}); await load(); await route(); }
  catch (error) { $('#detail-error').textContent = error.message; }
  finally { $('#refresh').disabled = false; }
});
$('#add').addEventListener('click', () => openEditor());
document.querySelectorAll('.close-editor').forEach(button => button.addEventListener('click', () => $('#editor').close()));
$('#close-details').addEventListener('click', () => { location.hash = ''; });
$('#details').addEventListener('cancel', () => { location.hash = ''; });
$('#edit').addEventListener('click', () => openEditor(state.selected));
$('#delete').addEventListener('click', () => { $('#delete-error').textContent = ''; $('#confirm-delete').showModal(); });
$('#cancel-delete').addEventListener('click', () => $('#confirm-delete').close());
$('#confirm-delete-button').addEventListener('click', async () => {
  const button = $('#confirm-delete-button'); button.disabled = true;
  try { await api(`/records/${state.selected.id}`, { method: 'DELETE' }); $('#confirm-delete').close(); location.hash = ''; await load(); }
  catch (error) { $('#delete-error').textContent = error.message; }
  finally { button.disabled = false; }
});
let timer;
$('#search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 200); });
for (const view of ['grid','table']) $(`#${view}-view`).addEventListener('click', () => { state.view = view; localStorage.setItem('grooveshelf-view', view); render(); });
window.addEventListener('hashchange', route);
function hideExpired(record) {
  if (!record.metadata_expires_at || record.metadata_expires_at * 1000 > Date.now()) return record;
  const result = {...record, metadata_status: 'unavailable', cover_url: null, genres: [], styles: [], labels: [], description: ''};
  for (const [field, fallback] of [['artist', 'Unknown artist'], ['title', 'Metadata temporarily unavailable'], ['year', null], ['tracks', []]]) {
    if (!record.protected_fields.includes(field)) result[field] = fallback;
  }
  return result;
}
let expiryTimer;
function scheduleExpiry() {
  clearTimeout(expiryTimer);
  const deadlines = [...state.records, ...(state.selected ? [state.selected] : [])]
    .map(r => r.metadata_expires_at * 1000).filter(deadline => deadline > Date.now());
  if (deadlines.length) expiryTimer = setTimeout(pollMetadata, Math.max(1, Math.min(...deadlines) - Date.now() + 1));
}
async function pollMetadata() {
  if (document.hidden) return;
  state.records = state.records.map(hideExpired); render();
  if ($('#details').open && state.selected) renderDetails(state.selected);
  await load();
  if ($('#details').open) await route();
}
setInterval(pollMetadata, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) pollMetadata(); });
await load(); await route();
