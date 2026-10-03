const $ = (selector) => document.querySelector(selector);
const state = { records: [], view: localStorage.getItem('grooveshelf-view') || 'grid', selected: null, editing: null, request: 0 };
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
  return `<div class="cover"><div class="disc" aria-hidden="true"></div><span class="cover-number">${escape(record.inventory_number)}</span></div>`;
}
function render() {
  $('#count').textContent = `${state.records.length} ${state.records.length === 1 ? 'record' : 'records'}`;
  $('#grid-view').setAttribute('aria-pressed', state.view === 'grid');
  $('#table-view').setAttribute('aria-pressed', state.view === 'table');
  const target = $('#collection');
  target.className = state.view === 'grid' ? 'grid' : 'table-wrap';
  if (!state.records.length) {
    target.className = '';
    target.innerHTML = `<div class="empty"><h3>${$('#search').value ? 'Nothing here just yet.' : 'Your shelf is waiting.'}</h3><p>${$('#search').value ? 'Try a different artist, album, track or inventory number.' : 'Add your first record and start making<br>a little home for your collection.'}</p>${$('#search').value ? '' : '<button class="primary" id="empty-add">＋ Add your first record</button>'}</div>`;
    $('#empty-add')?.addEventListener('click', () => openEditor());
    return;
  }
  if (state.view === 'grid') target.innerHTML = state.records.map(r => `<button class="record-card" data-record="${escape(r.id)}">${cover(r)}<h3>${escape(r.title)}</h3><p>${escape(r.artist)}</p><div class="record-meta"><span>${escape(r.inventory_number)}</span><span>${escape(r.format)}${r.year ? ` · ${r.year}` : ''}</span></div></button>`).join('');
  else target.innerHTML = `<table><thead><tr><th>Inventory</th><th>Album</th><th>Artist</th><th>Format</th><th>Year</th></tr></thead><tbody>${state.records.map(r => `<tr><td>${escape(r.inventory_number)}</td><td><button data-record="${escape(r.id)}">${escape(r.title)}</button></td><td>${escape(r.artist)}</td><td>${escape(r.format)}</td><td>${r.year ?? '—'}</td></tr>`).join('')}</tbody></table>`;
  target.querySelectorAll('[data-record]').forEach(button => button.addEventListener('click', () => { location.hash = `record/${button.dataset.record}`; }));
}
async function load() {
  const request = ++state.request;
  $('#message').textContent = 'Loading your collection…';
  try {
    const records = await api(`/records?q=${encodeURIComponent($('#search').value)}`);
    if (request !== state.request) return;
    state.records = records; $('#message').textContent = ''; render();
  } catch (error) { if (request === state.request) $('#message').textContent = `${error.message} Check that the server is available.`; }
}
async function route() {
  const match = location.hash.match(/^#record\/([a-zA-Z0-9-]+)$/);
  if (!match) { if ($('#details').open) $('#details').close(); return; }
  try {
    const record = await api(`/records/${match[1]}`);
    if (location.hash !== `#record/${match[1]}`) return;
    state.selected = record;
    $('#detail-error').textContent = '';
    $('#detail-content').innerHTML = `<div class="detail-intro">${cover(record)}<div><p class="eyebrow">${escape(record.inventory_number)} · ${escape(record.format)}</p><h2>${escape(record.title)}</h2><p>${escape(record.artist)}</p><p class="muted">${record.year || 'Release year not added'}</p></div></div><h3>Track list</h3>${record.tracks.length ? `<ol class="detail-tracks">${record.tracks.map(t => `<li><span>${escape(t.position) || '—'}</span>${escape(t.title)}</li>`).join('')}</ol>` : '<p class="muted">No tracks added yet.</p>'}${record.notes ? `<h3>Notes</h3><p class="notes">${escape(record.notes)}</p>` : ''}<p class="muted"><small>Cover art has not been added yet. Internet metadata is coming in a later update.</small></p>`;
    if (!$('#details').open) $('#details').showModal();
  } catch (error) { $('#message').textContent = error.message; location.hash = ''; }
}
function openEditor(record = null) {
  state.editing = record;
  const form = $('#record-form'); form.reset();
  $('#form-error').textContent = '';
  $('#editor-title').textContent = record ? 'Edit your record' : 'Add a record';
  if (record) {
    for (const key of ['inventory_number','artist','title','format','year','notes']) form.elements[key].value = record[key] ?? '';
    form.elements.tracks.value = record.tracks.map(t => t.position ? `${t.position} | ${t.title}` : t.title).join('\n');
  }
  $('#editor').showModal();
}
$('#record-form').addEventListener('submit', async event => {
  event.preventDefault(); $('#save').disabled = true; $('#form-error').textContent = '';
  const values = Object.fromEntries(new FormData(event.target));
  const tracks = values.tracks.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const separator = line.indexOf('|');
    return separator < 0 ? { position: '', title: line } : { position: line.slice(0, separator).trim(), title: line.slice(separator + 1).trim() };
  });
  try {
    const record = await api(state.editing ? `/records/${state.editing.id}` : '/records', {method: state.editing ? 'PUT' : 'POST', body: JSON.stringify({...values, year: values.year ? Number(values.year) : null, tracks})});
    $('#editor').close(); await load();
    if (location.hash === `#record/${record.id}`) await route(); else location.hash = `record/${record.id}`;
  } catch (error) { $('#form-error').textContent = error.message; }
  finally { $('#save').disabled = false; }
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
await load(); await route();
