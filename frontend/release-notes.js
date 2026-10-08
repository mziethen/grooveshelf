export function releaseNotesMarkup(record, escape) {
  const text = typeof record.description === 'string' ? record.description.trim() : '';
  const expired = !record.show_expired_metadata && record.metadata_expires_at && record.metadata_expires_at * 1000 <= Date.now();
  if (!text || expired || record.metadata_status === 'unavailable') return '';
  const selected = Number.isSafeInteger(record.discogs_release_id) && record.discogs_release_id > 0;
  const source = selected ? record.source_url : record.reference_release_url;
  const safeSource = typeof source === 'string' && /^https:\/\/www\.discogs\.com\/release\/[1-9][0-9]*$/.test(source)
    && (!selected || source === `https://www.discogs.com/release/${record.discogs_release_id}`);
  return `<details class="release-notes"><summary>${selected ? 'Discogs release notes' : 'Reference release notes'}</summary><p class="muted">${selected ? 'Notes for the selected Discogs pressing.' : 'Notes from the album’s reference release; your pressing may differ.'} Your personal notes are kept separately.</p><p class="notes release-notes-text">${escape(text)}</p>${safeSource ? `<a class="attribution" href="${escape(source)}" target="_blank" rel="noopener noreferrer">Release notes provided by Discogs</a>` : ''}</details>`;
}
