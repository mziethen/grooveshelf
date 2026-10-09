// Browsing preferences never mutate collection records or listening history.
export function createCollectionBrowser({escape, onChange}) {
  const $ = selector => document.querySelector(selector);
  const optionMarkup = new Map();
  const orders = new Set(['inventory','inventory-desc','artist','artist-desc','title','title-desc','year','year-desc']);
  const collator = new Intl.Collator('en', {numeric:true, sensitivity:'base'});
  try { const stored = localStorage.getItem('grooveshelf-sort'); if (orders.has(stored)) $('#collection-sort').value = stored; } catch {}
  function options(selector, values, label) {
    const select = $(selector), selected = select.value;
    const choices = [...new Set([...values.filter(Boolean), ...(selected ? [selected] : [])])].sort(collator.compare);
    const markup = `<option value="">${label}</option>` + choices.map(value => `<option value="${escape(value)}">${escape(value)}</option>`).join('');
    // Keep focus, selection and option nodes intact during unchanged heartbeats.
    if (optionMarkup.get(selector) !== markup) { optionMarkup.set(selector,markup); select.innerHTML = markup; select.value = selected; }
  }
  for (const id of ['collection-sort','filter-favorites','filter-genre','filter-location']) $('#'+id).addEventListener('change', () => {
    if (id === 'collection-sort') { try { localStorage.setItem('grooveshelf-sort', $('#collection-sort').value); } catch {} }
    onChange();
  });
  return {
    active: () => $('#filter-favorites').checked || Boolean($('#filter-genre').value || $('#filter-location').value),
    clear() { $('#filter-favorites').checked = false; $('#filter-genre').value = $('#filter-location').value = ''; },
    records(records) {
      options('#filter-genre', records.flatMap(record => record.genres || []), 'All genres');
      options('#filter-location', records.map(record => record.storage_location), 'All locations');
      const genre = $('#filter-genre').value, location = $('#filter-location').value;
      const result = records.filter(record => (!$('#filter-favorites').checked || record.favorite) && (!genre || (record.genres || []).includes(genre)) && (!location || record.storage_location === location));
      const order = $('#collection-sort').value, descending = order.endsWith('-desc');
      const field = order.split('-')[0];
      result.sort((a,b) => {
        let comparison;
        if (field === 'year') {
          if (a.year == null || b.year == null) return (a.year == null) - (b.year == null) || collator.compare(a.inventory_number,b.inventory_number);
          comparison = a.year - b.year;
        } else comparison = collator.compare(a[field === 'inventory' ? 'inventory_number' : field] || '', b[field === 'inventory' ? 'inventory_number' : field] || '');
        return (descending ? -comparison : comparison) || (field === 'artist' ? collator.compare(a.title,b.title) : 0) || collator.compare(a.inventory_number,b.inventory_number);
      });
      return result;
    }
  };
}
