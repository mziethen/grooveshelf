import { createBackups } from './backups.js';
import { createCollectionBrowser } from './browsing.js';
import { releaseNotesMarkup } from './release-notes.js';
import { pressingMarkup } from './pressings.js';
import { creditsMarkup } from './credits.js';
import { trackLine, parseTracks, trackMarkup } from './tracks.js';
import { streamingLinksMarkup } from './streaming.js';
import { createRecordQR } from './qr.js';
import { createBulkEditor } from './bulk.js';
import { createAppearance } from './appearance.js';
import { createPhotos } from './photos.js';
import { createCorrections } from './corrections.js';
import { createSettings } from './settings.js';
import { createLabels } from './labels.js';
import { createStatistics } from './statistics.js';
import { createDiscovery } from './discovery.js';
import { createCapture } from './capture.js';
import { createWishlist } from './wishlist.js';
import { createPersonalUI, populatePersonalOptions, personalPayload } from './personal.js';
import { createDiscogsSync } from './sync.js';
import { createCoverPicker } from './covers.js';
import { createListeningUI } from './listening.js';
import { createDiscogsSearch } from './discogs.js';
import { createArchive } from './archive.js';
import { createPalette, createShortcuts } from './palette.js';
import { parseQuery, VIEWS } from './query.js';
const $ = (selector) => document.querySelector(selector);
const state = { records: [], view: localStorage.getItem('grooveshelf-view') || 'grid', selected: null, editing: null, request: 0, masterId: null, releaseId: null, coverImageId: null, wishId: null, routeError: null, trackDraft: [], hasLoaded: false, loadError: null };
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
  const image = (/^\/api\/photos\/[a-f0-9-]{36}$/.test(record.cover_url || '') || /^\/api\/covers\/discogs\/r?[0-9]+(?:\/[a-f0-9]{32}\?v=[0-9.]+)?$/.test(record.cover_url || '')) ? `<img src="${escape(record.cover_url)}" alt="Cover of ${escape(record.title)}" loading="lazy">` : '';
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
const startupView = localStorage.getItem('grooveshelf-startup') || 'last';
let workspaceMode = !/^#record\//.test(location.hash) && ['collection','archive','listening'].includes(startupView) ? startupView : state.view === 'table' ? 'archive' : 'collection';
const browsing = createCollectionBrowser({escape,onChange:render});
const archive = createArchive({api, escape, cover, attribution, coverFallbacks,
  onOpen: id => { if (location.hash === `#record/${id}`) route(); else location.hash = `record/${id}`; },
  onEdit: id => { const record = state.records.find(r => r.id === id); if (record) openEditor(record); },
  onBulk: (ids, options) => bulk.open(ids, options),
  onLabels: () => $('#labels-open').click(),
  reload: () => load()});
archive.onChange = () => render();
let listeningRecord = null, listeningMarkup = '', listeningRequest = 0;
function setWorkspace(mode) {
  workspaceMode = mode;
  document.body.dataset.workspace = mode;
  $('#library-screen').hidden = mode === 'listening';
  $('#listening-screen').hidden = mode !== 'listening';
  for (const name of ['collection','archive','listening']) { $('#mode-'+name).setAttribute('aria-pressed', name === mode); $(`#mobile-tabs [data-tab="${name}"]`).setAttribute('aria-pressed', name === mode); }
  $('.intro h1').innerHTML = mode === 'archive' ? 'Everything <em>in its place</em><span>.</span>' : mode === 'listening' ? 'A moment <em>to listen</em><span>.</span>' : 'Your <em>collection</em><span>.</span>';
  $('.intro-description').textContent = mode === 'archive' ? 'Every copy. Every detail. All together.' : mode === 'listening' ? 'Scan your record. Let the album take the room.' : 'The records you love. A place of their own.';
  if (mode !== 'listening') { state.view = mode === 'archive' ? 'table' : 'grid'; localStorage.setItem('grooveshelf-view', state.view); render(); }
}
async function chooseListening(id) {
  const generation = ++listeningRequest;
  $('#listening-view-error').textContent = '';
  try {
    const record = await api(`/records/${id}`);
    if (generation !== listeningRequest) return;
    listeningRecord = hideExpired(record);
    try { localStorage.setItem('grooveshelf-listening-copy', record.id); } catch {}
    renderListening(); scheduleExpiry();
  } catch(error) { if (generation === listeningRequest) $('#listening-view-error').textContent = error.message; }
}
function renderListening() {
  if (!listeningRecord) return;
  listeningRecord = hideExpired(listeningRecord);
  const r = listeningRecord;
  const markup = `<div class="listening-art">${cover(r)}</div><div class="listening-copy"><p class="eyebrow">SELECTED FROM YOUR SHELF</p><h2>${escape(r.title)}</h2><p class="listening-artist">${escape(r.artist)}</p><p class="muted">${escape(r.inventory_number)} · ${escape(r.format)}${r.year ? ` · ${escape(r.year)}` : ''}</p>${attribution(r)}${r.metadata_status === 'stale' ? `<p class="metadata-stale-notice muted">Saved Discogs data · Last checked ${r.metadata_checked_at ? escape(new Date(r.metadata_checked_at * 1000).toLocaleString()) : 'at least six hours ago'}. These details may be outdated.</p>` : ''}<p class="listening-note">A record to spend time with.</p><details class="listening-tracklist"><summary>Track list · ${(r.tracks || []).length} tracks</summary><ol class="tracks">${(r.tracks || []).map(t=>trackMarkup(t,escape)).join('')}</ol>${r.tracks?.length ? '' : '<p class="muted">No saved tracks for this album.</p>'}</details><p class="muted">Album view only. Plays are recorded through your listening station or the record’s listening history.</p></div>`;
  if (markup !== listeningMarkup) {
    const open = $('#listening-album details')?.open;
    const focused = document.activeElement === $('#listening-album summary');
    listeningMarkup = markup; $('#listening-album').innerHTML = markup; coverFallbacks($('#listening-album'));
    $('#listening-album details').open = Boolean(open);
    if (focused) $('#listening-album summary').focus();
  }
  $('#listening-details-open').hidden = false;
  $('#listening-choice').value = r.id;
}
async function enterListening() {
  setWorkspace('listening');
  try {
    const records = await api('/records');
    if (workspaceMode !== 'listening') return;
    $('#listening-choice').innerHTML = '<option value="">Select from your collection</option>' + records.map(r=>`<option value="${escape(r.id)}">${escape(r.inventory_number)} · ${escape(hideExpired(r).title)}</option>`).join('');
    const selected = listeningRecord || state.selected || records.find(r=>r.id===localStorage.getItem('grooveshelf-listening-copy'));
    if (selected && records.some(r=>r.id===selected.id)) await chooseListening(selected.id);
  } catch(error) { $('#listening-view-error').textContent = error.message; }
}
for (const mode of ['collection','archive','listening']) $('#mode-'+mode).addEventListener('click',()=>mode==='listening' ? enterListening() : setWorkspace(mode));
$('#listening-choice').addEventListener('change',event=>{if(event.target.value)chooseListening(event.target.value);else {try { localStorage.removeItem('grooveshelf-listening-copy'); } catch {} ++listeningRequest;listeningRecord=null;listeningMarkup='';$('#listening-album').innerHTML='<div class="empty"><h2>Make room for a record.</h2><p>Choose an album, or scan its NFC tag at your listening station.</p></div>';$('#listening-details-open').hidden=true;}});
$('#app-navigation .nav-item.active').addEventListener('click',()=>setWorkspace('collection'));
$('#listening-details-open').addEventListener('click',()=>{if(listeningRecord)location.hash=`record/${listeningRecord.id}`;});
const SAVED_FILTERS = 'grooveshelf-saved-filters';
function savedFilters() {
  try { const value = JSON.parse(localStorage.getItem(SAVED_FILTERS) || '[]'); return Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()).slice(0, 9) : []; } catch { return []; }
}
function storeFilters(list) { try { localStorage.setItem(SAVED_FILTERS, JSON.stringify(list.slice(0, 9))); } catch {} }
let viewsMarkup = '', statusMarkup = '';
function applyQuery(text) {
  clearTimeout(timer); $('#search').value = text; render(); load();
}
function renderViews(query) {
  const current = $('#search').value.trim(), saved = savedFilters();
  const chip = (label, value, count) => `<button type="button" class="view-chip" data-view="${escape(value)}" aria-pressed="${current === value}">${escape(label)}${count == null ? '' : ` <span>${count}</span>`}</button>`;
  const markup = VIEWS.map(([label, value]) => chip(label, value, state.records.filter(parseQuery(value).test).length)).join('')
    + saved.map((value, index) => `<span class="saved-filter">${chip(value, value)}<button type="button" class="saved-remove" data-remove-filter="${index}" aria-label="Remove saved filter ${escape(value)}">×</button></span>`).join('')
    + (current && !saved.includes(current) && !VIEWS.some(view => view[1] === current) && saved.length < 9 ? '<button type="button" class="view-chip save-filter" id="save-filter">＋ Save filter</button>' : '');
  if (markup !== viewsMarkup) {
    viewsMarkup = markup; $('#quick-views').innerHTML = markup;
    $('#quick-views').querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => applyQuery(button.dataset.view)));
    $('#quick-views').querySelectorAll('[data-remove-filter]').forEach(button => button.addEventListener('click', () => { const list = savedFilters(); list.splice(Number(button.dataset.removeFilter), 1); storeFilters(list); render(); $('#search').focus(); }));
    $('#save-filter')?.addEventListener('click', () => { storeFilters([...savedFilters(), $('#search').value.trim()]); render(); $('#quick-views [data-view][aria-pressed=true]')?.focus(); });
  }
  const status = query.chips.length || query.unknown.length ? `${query.chips.length ? `Filters: ${query.chips.map(escape).join(' · ')}` : ''}${query.unknown.length ? `<span class="error">Not understood: ${query.unknown.map(escape).join(' · ')}. Press ? for the filter syntax.</span>` : ''}` : '';
  if (status !== statusMarkup) { statusMarkup = status; $('#query-status').innerHTML = status; }
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
  const incompleteLabels = {cover:'No cover', tracks:'No tracks', nfc:'No NFC tag'};
  const incompleteActive = Object.keys(incompleteLabels).filter(name=>$('#missing-'+name).checked);
  const incompleteSummary = incompleteActive.map(name=>incompleteLabels[name]).join(' · ');
  $('#incomplete-filter-count').hidden = incompleteActive.length === 0;
  // Leave the summary node stable during unchanged station heartbeats.
  if ($('#incomplete-filter-count').textContent !== incompleteSummary) $('#incomplete-filter-count').textContent = incompleteSummary;
  $('#clear-incomplete-filters').hidden = incompleteActive.length === 0;
  const query = parseQuery($('#search').value);
  renderViews(query);
  const filtered = browsing.active() || query.chips.length > 0 || ['cover','tracks','nfc'].some(name=>$('#missing-'+name).checked);
  const records = browsing.records(state.records).filter(query.test).filter(record=>(!$('#missing-cover').checked||!record.cover_url)&&(!$('#missing-tracks').checked||!record.tracks.length)&&(!$('#missing-nfc').checked||!record.nfc_uid));
  $('#count').textContent = filtered ? `${records.length} of ${state.records.length} records match` : `${records.length} ${records.length === 1 ? 'record' : 'records'}`;
  $('#grid-view').setAttribute('aria-pressed', state.view === 'grid');
  $('#table-view').setAttribute('aria-pressed', state.view === 'table');
  $('#clear-filters').hidden = !($('#search').value || filtered);
  $('#retry-load').hidden = !state.loadError;
  const target = $('#collection');
  const archiveView = state.view === 'table' && records.length > 0 && !(state.loadError && !state.hasLoaded);
  if (!archiveView) { archive.bar(false); archive.inspector(false); }
  if (state.loadError && (!state.hasLoaded || !state.records.length)) {
    target.className = ''; $('#count').textContent = 'Unavailable';
    updateCollection(target, '<div class="empty"><h3>Your collection could not be loaded.</h3><p>Your records have not been changed. Check the server connection and use Retry loading.</p></div>');
    return;
  }
  target.className = state.view === 'grid' ? 'grid' : 'table-wrap';
  if (!records.length) {
    target.className = '';
    if (!updateCollection(target, `<div class="empty"><h3>${($('#search').value || filtered) ? 'No matching records.' : 'Your shelf is waiting.'}</h3><p>${($('#search').value || filtered) ? 'Try different search words or clear your filters.' : 'Add your first record and start making<br>a little home for your collection.'}</p>${($('#search').value || filtered) ? '<button id="empty-clear">Clear search &amp; filters</button>' : '<button class="primary" id="empty-add">＋ Add your first record</button>'}</div>`)) return;
    $('#empty-clear')?.addEventListener('click', clearFilters);
    $('#empty-add')?.addEventListener('click', () => openEditor());
    return;
  }
  let markup;
  if (state.view === 'grid') markup = records.map(r => `<article class="record-entry"><button class="record-card" data-record="${escape(r.id)}">${cover(r)}<h3>${escape(r.title)}</h3><p>${escape(r.artist)}</p><div class="record-meta"><span>${escape(r.inventory_number)}</span><span>${r.favorite ? '★ ' : ''}${escape(r.format)}${r.year ? ` · ${r.year}` : ''}</span></div>${r.storage_location?`<p class="record-location">${escape(r.storage_location)}</p>`:''}</button>${attribution(r)}</article>`).join('');
  else markup = archive.markup(records);
  if (archiveView) { archive.bar(true); archive.inspector(true); }
  if (!updateCollection(target, markup)) return;
  coverFallbacks(target);
  if (state.view === 'table') archive.bind(target);
  target.querySelectorAll('[data-record]').forEach(button => button.addEventListener('click', () => { location.hash = `record/${button.dataset.record}`; }));
}
async function load() {
  const request = ++state.request;
  if (collectionMarkup === undefined) $('#message').textContent = 'Loading your collection…';
  try {
    const records = await api(`/records?q=${encodeURIComponent(parseQuery($('#search').value).text)}`);
    if (request !== state.request) return;
    state.hasLoaded = true; state.loadError = null;
    state.records = records.map(hideExpired); $('#message').textContent = state.routeError || ''; render();
  } catch (error) { if (request === state.request) { state.loadError = error.message; state.records = state.records.map(hideExpired); render(); $('#message').textContent = `${error.message} Check that the server is available.`; } }
}
async function route() {
  const match = location.hash.match(/^#record\/([a-zA-Z0-9-]+)$/);
  if (!match) { if ($('#details').open) $('#details').close(); return; }
  state.routeError = null;
  try {
    const record = await api(`/records/${match[1]}`);
    if (location.hash !== `#record/${match[1]}`) return;
    state.selected = record;
    $('#message').textContent = '';
    renderDetails(record);
    if (workspaceMode === 'listening') { listeningRecord = hideExpired(record); renderListening(); }
  } catch (error) {
    // Keep missing-link feedback visible through background collection refreshes.
    state.routeError = error.message; $('#message').textContent = state.routeError; location.hash = '';
  }
}
function renderDetails(record) {
    const sameRecord = $('#details').open && $('#details').dataset.recordId === record.id;
    const previousNotes = $('#detail-content .release-notes');
    const notesOpen = sameRecord && Boolean(previousNotes?.open);
    const notesFocused = sameRecord && document.activeElement === previousNotes?.querySelector('summary');
    const previousCredits = $('#detail-content .album-credits');
    const creditsOpen = sameRecord && Boolean(previousCredits?.open);
    const creditsFocused = sameRecord && document.activeElement === previousCredits?.querySelector('summary');
    record = hideExpired(record);
    state.selected = record;
    scheduleExpiry();
    $('#detail-error').textContent = '';
    $('#refresh').hidden = !record.source_url;
    $('#review-corrections').hidden = !record.source_url || !record.protected_fields.length;
    $('#choose-cover').hidden = !record.source_url;
    $('#edit').disabled = record.metadata_status === 'unavailable';
    $('#manage-photos').textContent = `Manage photos${record.photo_count ? ` (${record.photo_count})` : ''}`;
    $('#detail-overview').innerHTML = `<div class="detail-intro">${cover(record)}<div><p class="eyebrow">${escape(record.inventory_number)} · ${escape(record.format)}</p><h2 id="detail-title">${escape(record.title)}</h2><p>${escape(record.artist)}</p><p class="muted">${record.year ? 'Saved year: ' + escape(record.year) : 'Saved year not added'}</p>${record.personal_cover_url ? '<p class="muted">Your personal cover photo</p>' : ''}${attribution(record)}${record.metadata_status === 'stale' ? `<p class="metadata-stale-notice muted">Saved Discogs data · Last checked ${record.metadata_checked_at ? escape(new Date(record.metadata_checked_at * 1000).toLocaleString()) : 'at least six hours ago'}. These details may be outdated. You can refresh them in Manage record.</p>` : ''}</div></div>`;
    $('#detail-content').innerHTML = `${record.metadata_status === 'unavailable' ? '<p class="error">Discogs could not be refreshed. Older provider details and covers are hidden; your corrections are retained. Try refreshing again.</p>' : ''}${record.genres.length || record.styles.length ? `<p class="muted">${escape([...record.genres, ...record.styles].join(' · '))}</p>` : ''}${record.labels.length ? `<p class="muted">${record.discogs_release_id ? 'Selected release labels' : 'Reference release labels'}: ${escape(record.labels.join(', '))}</p>${attribution(record, true)}` : ''}<h3>Track list</h3>${record.tracks.length ? `<ol class="detail-tracks">${record.tracks.map(t => trackMarkup(t, escape)).join('')}</ol>` : '<p class="muted">No tracks added yet.</p>'}${record.notes ? `<h3>Notes</h3><p class="notes">${escape(record.notes)}</p>` : ''}${!record.cover_url && record.metadata_status !== 'unavailable' ? '<p class="muted"><small>No cover is available for this record.</small></p>' : ''}${record.cover_selection_status === 'missing' ? '<p class="error">Your selected Discogs image is no longer available. Choose another cover.</p>' : ''}${record.protected_fields.length ? '<p class="muted"><small>Your edited fields are protected during Discogs refreshes.</small></p>' : ''}`;
    $('#detail-content').insertAdjacentHTML('afterbegin', pressingMarkup(record, escape));
    $('#detail-content').insertAdjacentHTML('beforeend', releaseNotesMarkup(record, escape) + creditsMarkup(record, escape) + streamingLinksMarkup(record, escape));
    if (!sameRecord) { $('#record-tools').open = false; $('#details').scrollTop = 0; }
    const currentNotes = $('#detail-content .release-notes');
    if (currentNotes) currentNotes.open = notesOpen;
    if (notesFocused) (currentNotes?.querySelector('summary') || $('#close-details')).focus({preventScroll:true});
    const currentCredits = $('#detail-content .album-credits');
    if (currentCredits) currentCredits.open = creditsOpen;
    if (creditsFocused) (currentCredits?.querySelector('summary') || $('#close-details')).focus({preventScroll:true});
    $('#details').dataset.recordId = record.id;
    coverFallbacks($('#detail-overview'));
    coverFallbacks($('#detail-content'));
    personal.details(record);
    listening.details(record);
    if (!$('#details').open) $('#details').showModal();
}
function openEditor(record = null, after = null) {
  state.trackDraft = record?.tracks || [];
  state.wishId = null; state.editing = record; state.masterId = null; state.releaseId = null; state.coverImageId = null;
  discogs.reset(Boolean(record));
  const form = $('#record-form'); form.reset();
  $('#form-error').textContent = '';
  $('#editor-title').textContent = record ? 'Edit your record' : 'Add a record';
  if (record) {
    for (const key of ['inventory_number','artist','title','format','year','notes','rating','media_condition','sleeve_condition','storage_location']) form.elements[key].value = record[key] ?? '';
    form.elements.tracks.value = record.tracks.map(trackLine).join('\n');
  }
  if(!$('#editor').open)$('#editor').showModal();
  capture.reset(Boolean(record),after);
}
$('#record-form').addEventListener('submit', async event => {
  event.preventDefault(); $('#save').disabled = $('#save-next').disabled = true; $('#form-error').textContent = '';
  const formSnapshot=JSON.stringify([...new FormData(event.target)]);
  const addAnother=event.submitter?.id==='save-next'&&!state.editing&&!state.wishId;
  const keepArtist=$('#keep-artist').checked;
  const selectedMaster=state.masterId;const selectedRelease=state.releaseId;
  const values = personalPayload(Object.fromEntries(new FormData(event.target)));
  try {
    const tracks = parseTracks(values.tracks, state.trackDraft);
    if(!await capture.check(!state.editing,true)) {$('#form-error').textContent='Review the existing copies and confirm that you are adding another physical copy.';return;}
    if(formSnapshot!==JSON.stringify([...new FormData(event.target)])||selectedMaster!==state.masterId||selectedRelease!==state.releaseId){$('#form-error').textContent='Your details changed while checking. Save again to use the current details.';return;}
    const record = await api(state.wishId ? `/wishlist/${state.wishId}/acquire` : state.editing ? `/records/${state.editing.id}` : '/records', {method: state.editing ? 'PUT' : 'POST', body: JSON.stringify({...values, discogs_master_id: state.masterId, discogs_release_id:state.releaseId, cover_image_id: state.coverImageId, year: values.year ? Number(values.year) : null, tracks})});
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
const capture=createCapture({api,escape,currentIdentity:()=>({masterId:state.masterId,releaseId:state.releaseId,editingId:state.editing?.id||null})});
populatePersonalOptions($('#record-form'));
const personal = createPersonalUI({api,escape,currentRecord:()=>state.selected,reload:load,renderCurrent:route});
const listening = createListeningUI({ api, escape, reload: load, currentRecord: () => state.selected, renderCurrent: route, onStationRecord: async id => { if (workspaceMode !== 'listening') return false; await chooseListening(id); return true; } });
const discogs = createDiscogsSearch({ api, escape, onImport(data) {
  state.trackDraft = data.tracks;
  state.masterId = data.discogs_master_id || null; state.releaseId=data.discogs_release_id || null; state.coverImageId = data.cover_image_id || null;
  const form = $('#record-form');
  for (const key of ['artist', 'title', 'year']) form.elements[key].value = data[key] ?? '';
  capture.changed();
  form.elements.tracks.value = data.tracks.map(trackLine).join('\n');
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
$('#add').disabled = false;
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
async function clearFilters() {
  clearTimeout(timer);
  $('#search').value = '';
  browsing.clear();
  for (const name of ['cover','tracks','nfc']) $('#missing-'+name).checked = false;
  $('#search').focus();
  await load();
}
$('#clear-filters').addEventListener('click', clearFilters);
$('#retry-load').addEventListener('click', load);
for (const name of ['cover','tracks','nfc']) $('#missing-'+name).addEventListener('change',render);
$('#clear-incomplete-filters').addEventListener('click', () => {
  for (const name of ['cover','tracks','nfc']) $('#missing-'+name).checked = false;
  $('#incomplete-filters summary').focus();
  render();
});
$('#search').addEventListener('input', () => { $('#clear-filters').hidden = !($('#search').value || browsing.active() || ['cover','tracks','nfc'].some(name=>$('#missing-'+name).checked)); clearTimeout(timer); timer = setTimeout(load, 200); });
for (const view of ['grid','table']) $(`#${view}-view`).addEventListener('click', () => { setWorkspace(view === 'table' ? 'archive' : 'collection'); });
window.addEventListener('hashchange', route);
function hideExpired(record) {
  if (!record.metadata_expires_at || record.metadata_expires_at * 1000 > Date.now()) return record;
  if (record.show_expired_metadata) return {...record, metadata_status: 'stale'};
  const result = {...record, metadata_status: 'unavailable', cover_url: record.personal_cover_url || null, genres: [], styles: [], labels: [], catalog_numbers: [], original_year: null, pressing_year: null, original_year_source_url: null, country: '', credits: [], credits_source_url: null, description: ''};
  for (const [field, fallback] of [['artist', 'Unknown artist'], ['title', 'Metadata temporarily unavailable'], ['year', null], ['tracks', []]]) {
    if (!record.protected_fields.includes(field)) result[field] = fallback;
  }
  return result;
}
let expiryTimer;
function scheduleExpiry() {
  clearTimeout(expiryTimer);
  const deadlines = [...state.records, ...(state.selected ? [state.selected] : []), ...(listeningRecord ? [listeningRecord] : [])]
    .map(r => r.metadata_expires_at * 1000).filter(deadline => deadline > Date.now());
  if (deadlines.length) expiryTimer = setTimeout(pollMetadata, Math.max(1, Math.min(...deadlines) - Date.now() + 1));
}
async function pollMetadata() {
  if (document.hidden) return;
  state.records = state.records.map(hideExpired); render(); renderListening();
  if ($('#details').open && state.selected) renderDetails(state.selected);
  await load();
  if (workspaceMode === 'listening' && listeningRecord) await chooseListening(listeningRecord.id);
  if ($('#details').open) await route();
}
setInterval(pollMetadata, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) pollMetadata(); });
createPhotos({api,escape,currentRecord:()=>state.selected,onSaved:async()=>{await load();await route();}});
createCorrections({api,escape,currentRecord:()=>state.selected,onSaved:async()=>{await load();await route();}});
const appearance = createAppearance();
createBackups({api,escape});
createRecordQR({currentRecord:()=>state.selected});
const bulk = createBulkEditor({api,escape,onSaved:async count=>{await load();$('#message').textContent=`Updated ${count} ${count===1?'record':'records'}.`;}});
createSettings({api,onSaved:async settings=>{
  state.records = state.records.map(record=>hideExpired({...record, show_expired_metadata:settings.show_expired_metadata}));
  if (state.selected) state.selected = hideExpired({...state.selected, show_expired_metadata:settings.show_expired_metadata});
  if (listeningRecord) { listeningRecord = hideExpired({...listeningRecord, show_expired_metadata:settings.show_expired_metadata}); renderListening(); }
  render();
  if ($('#details').open && state.selected) renderDetails(state.selected);
  await load();
  if (workspaceMode === 'listening' && listeningRecord) await chooseListening(listeningRecord.id);
  if ($('#details').open) await route();
}});
createLabels({api,escape});
createStatistics({api,escape,onOpen:id=>{if(location.hash===`#record/${id}`)route();else location.hash=`record/${id}`;}});
createDiscovery({api,escape,cover,coverFallbacks,hideExpired,onOpen:id=>{if(location.hash===`#record/${id}`)route();else location.hash=`record/${id}`;}});
const click = id => () => $('#' + id).click();
const palette = createPalette({escape, records: () => state.records, openRecord: id => { if (location.hash === `#record/${id}`) route(); else location.hash = `record/${id}`; }, commands: () => [
  ...[['collection','Collection','1'],['archive','Archive','2'],['listening','Listening','3']].map(([mode,label,keys]) => ({group:'Go to', label, keys, run: () => mode === 'listening' ? enterListening() : setWorkspace(mode)})),
  {label:'Add a record', keys:'N', keywords:'new copy create capture', run: click('add')},
  ...(archive.selected().length ? [{label:`Edit ${archive.selected().length} selected ${archive.selected().length === 1 ? 'copy' : 'copies'}`, keys:'E', keywords:'bulk selection', run: click('selection-edit')}] : []),
  {label:'Bulk edit', keys:'G B', run: click('bulk-open')},
  {label:'Sync with Discogs', keys:'G D', run: click('sync-open')},
  {label:'Print labels', keys:'G L', keywords:'qr', run: click('labels-open')},
  {label:'Wishlist', keys:'G W', run: click('wishlist-open')},
  {label:'What should I play?', keys:'G P', keywords:'discovery suggestion', run: click('discover-open')},
  {label:'Listening statistics', keys:'G S', run: click('stats-open')},
  {label:'Backups', keys:'G K', run: click('backups-open')},
  {label:'Settings', keys:'G E', run: click('settings-open')},
  ...[...document.querySelectorAll('#export-options a')].map(link => ({label:link.textContent.trim(), keywords:'export download', run: () => link.click()})),
  {label:'Clear search & filters', keywords:'reset', run: clearFilters},
  {label:'Keyboard shortcuts & filter syntax', keys:'?', keywords:'help', run: () => $('#shortcuts-dialog').showModal()},
  ...VIEWS.map(([label, value]) => ({group:'Views', label, detail: value, run: () => applyQuery(value)})),
  ...savedFilters().map((value, index) => ({group:'Saved filters', label: value, keys:`Alt ${index + 1}`, run: () => applyQuery(value)})),
  ...Object.entries(appearance.names).map(([value, label]) => ({group:'Appearance', label:`Use ${label} appearance`, keywords:'theme', run: () => appearance.choose(value)}))
]});
createShortcuts({palette, archive, workspace: () => workspaceMode, setWorkspace: mode => mode === 'listening' ? enterListening() : setWorkspace(mode),
  actions: {savedFilter: index => { const value = savedFilters()[index]; if (!value) return false; applyQuery(value); return true; }}});
$('#palette-open').addEventListener('click', () => palette.open());
$('#mobile-tabs').addEventListener('click', event => {
  const tab = event.target.closest('[data-tab]')?.dataset.tab;
  if (tab === 'commands') palette.open(); else if (tab === 'listening') enterListening(); else if (tab) setWorkspace(tab);
});
setWorkspace(workspaceMode);
await load();
if (workspaceMode === 'listening') await enterListening();
await route();
