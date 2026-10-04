export function creditsMarkup(record, escape) {
  const expired = !record.show_expired_metadata && record.metadata_expires_at && record.metadata_expires_at * 1000 <= Date.now();
  const credits = record.credits || [];
  if (!credits.length || expired || record.metadata_status === 'unavailable') return '';
  const source = record.credits_source_url || '';
  const safeSource = /^https:\/\/www\.discogs\.com\/(release|master)\/[1-9][0-9]*$/.test(source);
  const reference = safeSource && source === record.reference_release_url;
  return `<details class="album-credits"><summary>Album &amp; track credits <span>${credits.length} ${credits.length === 1 ? 'credit' : 'credits'}</span></summary><p class="muted credit-provenance">${reference ? 'Credits from the reference release; your pressing may differ.' : 'Credits from the selected Discogs entry.'}</p><ul>${credits.map(credit => `<li><strong>${escape(credit.name)}</strong><span>${escape(credit.role)}</span>${credit.tracks ? `<small>Scope: ${escape(credit.tracks)}</small>` : ''}</li>`).join('')}</ul>${safeSource ? `<a class="attribution" href="${escape(source)}" target="_blank" rel="noopener noreferrer">Credits provided by Discogs</a>` : ''}</details>`;
}
