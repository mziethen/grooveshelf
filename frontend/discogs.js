import { renderCoverGallery } from './covers.js';
export function createDiscogsSearch({ api, escape, onImport }) {
  const root = document.querySelector('#discogs-tools');
  let generation = 0;
  let expiryTimer;
  let page = 1;
  let query = null;
  const output = root.querySelector('#discogs-results');
  const message = root.querySelector('#discogs-message');
  const next = root.querySelector('#discogs-next');
  const previous = root.querySelector('#discogs-previous');
  const search = root.querySelector('#discogs-search');
  async function find(targetPage = 1) {
    const form = document.querySelector('#record-form');
    query = targetPage === 1 ? { artist: form.elements.artist.value, title: form.elements.title.value } : query;
    if (!query.artist.trim() && !query.title.trim()) { message.textContent = 'Enter an artist or album title below, then search.'; return; }
    clearTimeout(expiryTimer);
    const current = ++generation;
    output.replaceChildren(); message.textContent = 'Searching Discogs…'; search.disabled = true;
    next.hidden = previous.hidden = true;
    try {
      const params = new URLSearchParams({ ...query, page: targetPage });
      const data = await api(`/metadata/discogs/search?${params}`);
      if (generation !== current) return;
      page = targetPage;
      message.textContent = data.results.length ? 'Choose an album to preview its details.' : 'No matching albums found. Try different words or enter the record manually.';
      output.innerHTML = data.results.map(r => `<div class="discogs-result"><button type="button" data-master="${r.id}">${escape(r.title)} <span class="muted">${escape(r.year || '')}</span></button><a href="${escape(r.source_url)}" target="_blank" rel="noopener">Data provided by Discogs</a></div>`).join('');
      previous.hidden = page <= 1; next.hidden = page >= data.pages;
      output.querySelectorAll('[data-master]').forEach(button => button.addEventListener('click', () => preview(Number(button.dataset.master))));
    } catch (error) { if (generation === current) message.textContent = error.message; }
    finally { search.disabled = false; }
  }
  async function preview(masterId) {
    clearTimeout(expiryTimer);
    const current = ++generation;
    message.textContent = 'Loading album preview…'; next.hidden = previous.hidden = true;
    try {
      const data = await api(`/metadata/discogs/masters/${masterId}`);
      if (current !== generation) return;
      output.innerHTML = `<div class="metadata-preview"><h3>${escape(data.title)}</h3><p>${escape(data.artist)}${data.year ? ` · ${data.year}` : ''}</p><p class="muted">${data.tracks.length} tracks${data.genres.length ? ` · ${escape(data.genres.join(', '))}` : ''}</p><a href="${escape(data.source_url)}" target="_blank" rel="noopener">Data provided by Discogs</a><ol class="preview-tracks">${data.tracks.map(t => `<li>${escape(t.position)} ${escape(t.title)}</li>`).join('')}</ol><div id="discogs-cover-gallery"></div><button type="button" id="discogs-use" class="primary">Use these details</button></div>`;
      let selectedCover = null;
      renderCoverGallery(output.querySelector('#discogs-cover-gallery'), {images:data.images || [], escape, onSelect:id => {selectedCover=id;}});
      if (data.metadata_expires_at) expiryTimer = setTimeout(() => {
        generation++; output.replaceChildren();
        message.textContent = 'This preview has expired. Search again to load current details and images.';
      }, Math.max(0, data.metadata_expires_at * 1000 - Date.now()));
      message.textContent = 'Review this album before using its details. Nothing is saved yet.';
      output.querySelector('#discogs-use').addEventListener('click', () => {
        clearTimeout(expiryTimer); onImport({...data, cover_image_id:selectedCover}); output.replaceChildren();
        message.textContent = 'Details added to the form. Review or edit them, then save your record.';
      });
    } catch (error) { if (current === generation) message.textContent = error.message; }
  }
  search.addEventListener('click', () => find());
  next.addEventListener('click', () => find(page + 1));
  previous.addEventListener('click', () => find(page - 1));
  return {
    reset(editing) {
      clearTimeout(expiryTimer); generation++; page = 1; query = null; root.hidden = editing;
      output.replaceChildren(); message.textContent = 'Optional: enter an artist or album title, then find matching albums.';
      next.hidden = previous.hidden = true; search.disabled = false;
    },
    close() { clearTimeout(expiryTimer); generation++; }
  };
}
