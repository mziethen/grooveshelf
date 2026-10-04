export function renderCoverGallery(root, {images = [], selected = null, escape, onSelect}) {
  root.innerHTML = `<p class="muted">Choose an image to preview and use as your cover.</p><div class="cover-gallery">${images.map((image, index) => `<button type="button" data-image="${escape(image.id)}" aria-pressed="${image.id === selected}" aria-label="Select image ${index + 1}"><img src="${escape(image.preview_url)}" alt="Discogs image ${index + 1}" loading="lazy"><span>Image ${index + 1}${image.type === 'primary' ? ' · Primary' : ''}</span></button>`).join('')}</div><div class="cover-preview" hidden><img alt="Selected Discogs image"><p class="error" hidden>This image could not be loaded. Choose another image or retry later.</p></div><button type="button" class="cover-default" aria-pressed="${!selected}">Use default cover</button>${images.length ? '' : '<p class="muted">No images are available for this entry.</p>'}`;
  const preview = root.querySelector('.cover-preview');
  const large = preview.querySelector('img');
  large.addEventListener('error', () => { large.hidden = true; preview.querySelector('p').hidden = false; });
  function choose(id) {
    selected = id;
    root.querySelectorAll('[data-image]').forEach(button => button.setAttribute('aria-pressed', button.dataset.image === id));
    root.querySelector('.cover-default').setAttribute('aria-pressed', !id);
    const image = images.find(image => image.id === id);
    preview.hidden = !image;
    preview.querySelector('p').hidden = true;
    large.hidden = false;
    if (image) large.src = image.preview_url;
    else large.removeAttribute('src');
    onSelect(id);
  }
  root.querySelectorAll('[data-image]').forEach(button => button.addEventListener('click', () => choose(button.dataset.image)));
  root.querySelector('.cover-default').addEventListener('click', () => choose(null));
  if (selected) choose(selected);
}

export function createCoverPicker({api, escape, currentRecord, reload, renderCurrent}) {
  const $ = selector => document.querySelector(selector);
  let recordId;
  let selected;
  let generation = 0;
  let expiryTimer;
  $('#choose-cover').addEventListener('click', async () => {
    const current = ++generation;
    recordId = currentRecord().id;
    $('#cover-picker-error').textContent = '';
    $('#cover-picker-gallery').replaceChildren();
    $('#cover-picker-save').disabled = true;
    $('#cover-picker-status').textContent = 'Loading available images…';
    $('#cover-picker').showModal();
    try {
      const data = await api(`/records/${recordId}/cover-options`);
      if (current !== generation) return;
      selected = data.selected_id;
      $('#cover-picker-status').textContent = data.selection_status === 'missing' ? 'Your selected image is no longer available. Choose another image or use the default cover.' : (data.show_expired_metadata && data.metadata_expires_at * 1000 <= Date.now() ? 'Saved images may be outdated. Only cached images are available; refresh this record to download missing images.' : 'Your choice applies only to this record.');
      $('#cover-picker-source').href = data.source_url;
      $('#cover-picker-source').hidden = false;
      renderCoverGallery($('#cover-picker-gallery'), {images:data.images, selected, escape, onSelect:id => {selected=id;}});
      $('#cover-picker-save').disabled = false;
      clearTimeout(expiryTimer);
      if (data.metadata_expires_at && !data.show_expired_metadata) expiryTimer = setTimeout(() => {
        $('#cover-picker-gallery').replaceChildren();
        $('#cover-picker-save').disabled = true;
        $('#cover-picker-status').textContent = 'These images have expired. Close and reopen the picker to refresh them.';
      }, Math.max(0, data.metadata_expires_at * 1000 - Date.now()));
    } catch (error) { if (current === generation) $('#cover-picker-error').textContent = error.message; }
  });
  $('#cover-picker').addEventListener('close', () => {generation++; clearTimeout(expiryTimer); $('#cover-picker-source').hidden = true;});
  $('#cover-picker-cancel').addEventListener('click', () => $('#cover-picker').close());
  $('#cover-picker-save').addEventListener('click', async () => {
    $('#cover-picker-save').disabled = true;
    try {
      await api(`/records/${recordId}/cover`, {method:'PUT',body:JSON.stringify({image_id:selected})});
      $('#cover-picker').close(); await reload(); await renderCurrent();
    } catch (error) { $('#cover-picker-error').textContent = error.message; }
    finally { $('#cover-picker-save').disabled = false; }
  });
}
