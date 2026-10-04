export function pressingMarkup(record, escape) {
  if (record.metadata_status === 'unavailable' || (record.metadata_expires_at && record.metadata_expires_at * 1000 <= Date.now())) return '';
  if (!record.discogs_master_id && !record.discogs_release_id) return '';
  const facts = [['Original release year', record.original_year || 'Not available'],
    ['Pressing year', record.discogs_release_id ? (record.pressing_year || 'Not available') : 'Choose a pressing'],
    ['Country', record.country || 'Not available'],
    ['Catalog number', (record.catalog_numbers || []).join(' · ') || 'Not available']];
  const source = record.original_year_source_url || '';
  const originalSource = /^https:\/\/www\.discogs\.com\/master\/[1-9][0-9]*$/.test(source);
  return `<section class="pressing-details"><h3>Release &amp; pressing</h3><p class="muted">${record.discogs_release_id ? 'Selected Discogs release ' + escape(record.discogs_release_id) + '. Compare these details with your sleeve and labels.' : 'Album linked; an exact pressing has not been selected. Reference release details do not identify your copy.'}</p><dl>${facts.map(([label,value])=>`<dt>${label}</dt><dd>${escape(value)}</dd>`).join('')}</dl>${record.original_year && originalSource ? `<a class="attribution" href="${escape(source)}" target="_blank" rel="noopener noreferrer">Original year from the Discogs master</a>` : ''}</section>`;
}
