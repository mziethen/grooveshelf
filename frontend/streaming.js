/** Public search destinations; no provider calls or playback tracking. */
export function albumSearchLinks(record) {
  const artist = String(record.artist ?? '').trim();
  const title = String(record.title ?? '').trim();
  const expired = record.metadata_expires_at && record.metadata_expires_at * 1000 <= Date.now();
  const protectedFields = record.protected_fields || [];
  if (!artist || !title || ((expired || record.metadata_status === 'unavailable') &&
      !['artist', 'title'].every(field => protectedFields.includes(field)))) return [];
  const query = `${artist} ${title}`;
  const youtube = new URL('https://www.youtube.com/results');
  youtube.searchParams.set('search_query', query);
  return [
    {label:'Search Spotify', url:`https://open.spotify.com/search/${encodeURIComponent(query)}`},
    {label:'Search YouTube', url:youtube.href},
  ];
}

export function streamingLinksMarkup(record, escape) {
  const links = albumSearchLinks(record);
  if (!links.length) return '';
  return `<section class="streaming-links" aria-labelledby="streaming-heading"><h3 id="streaming-heading">Find this album online</h3><p>Search by artist and album title. Results may include other editions.</p><div>${links.map(link => `<a href="${escape(link.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${link.label}<span aria-hidden="true"> ↗</span></a>`).join('')}</div></section>`;
}
