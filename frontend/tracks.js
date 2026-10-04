const durationPattern = /^(?:[0-9]{1,3}:[0-5][0-9]|[0-9]{1,2}:[0-5][0-9]:[0-5][0-9])$/;

export function trackLine(track) {
  const title = track.position || track.duration ? `${track.position || ''} | ${track.title}` : track.title;
  return track.duration ? `${title} | ${track.duration}` : title;
}

export function parseTracks(text, original = []) {
  return text.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    // Preserve untouched imported titles, including titles containing pipes.
    const existing = original.find(track => trackLine(track).trim() === line);
    if (existing) return {...existing};
    const separator = line.indexOf('|');
    if (separator < 0) return {position:'', title:line};
    const track = {position:line.slice(0,separator).trim(), title:line.slice(separator+1).trim()};
    const last = track.title.lastIndexOf('|');
    if (last >= 0) {
      const suffix = track.title.slice(last+1).trim();
      if (durationPattern.test(suffix)) {
        track.duration = suffix; track.title = track.title.slice(0,last).trim();
      } else if (suffix.includes(':')) {
        throw new Error('Use m:ss or h:mm:ss for track durations, for example 3:45.');
      }
    }
    return track;
  });
}

export function trackMarkup(track, escape) {
  return `<li><span class="track-position">${escape(track.position) || '—'}</span><div class="track-title">${escape(track.title)}</div>${track.duration ? `<time class="track-duration">${escape(track.duration)}</time>` : ''}</li>`;
}
