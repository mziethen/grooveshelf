// Listening room: album stage with sides, spinning record and ambient light, plus the idle screen. Opening it never records a play.
export function createListeningRoom({api, escape, cover, coverFallbacks, hideExpired, onChoose}) {
  const $ = selector => document.querySelector(selector);
  let sideRecord = null, side = null, suggestion = null, suggestionRequest = 0, clockTimer;
  let spinning = true;
  try { spinning = localStorage.getItem('grooveshelf-listening-spin') !== 'off'; } catch {}
  const seconds = value => { const parts = String(value || '').split(':').map(Number); return parts.length >= 2 && parts.every(Number.isFinite) ? parts.reduce((total, part) => total * 60 + part, 0) : null; };
  function sides(tracks) {
    const groups = new Map();
    for (const track of tracks) {
      const name = String(track.position || '').match(/^([A-Z])\d*/i)?.[1]?.toUpperCase();
      if (!name) return [];
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(track);
    }
    return [...groups].map(([name, list]) => {
      const total = list.map(t => seconds(t.duration));
      return {name, count: list.length, minutes: total.every(v => v != null) ? Math.max(1, Math.round(total.reduce((a, b) => a + b, 0) / 60)) : null};
    });
  }
  const dateLabel = value => new Date(value).toLocaleDateString(undefined, {day: 'numeric', month: 'long', year: new Date(value).getFullYear() === new Date().getFullYear() ? undefined : 'numeric'});
  function history(r) {
    if (!r.play_count) return 'Not played yet — this could be its first evening.';
    return `${r.play_count} ${r.play_count === 1 ? 'play' : 'plays'} so far${r.last_played_at ? ` · last on ${escape(dateLabel(r.last_played_at))}` : ''}`;
  }
  function album(r, {attribution, staleNotice, trackMarkup}) {
    const groups = sides(r.tracks || []);
    const tracks = (r.tracks || []).map(t => trackMarkup(t, escape).replace('<li>', `<li data-side="${escape(String(t.position || '').match(/^([A-Z])/i)?.[1]?.toUpperCase() || '')}">`)).join('');
    return `<div class="listening-stage"><div class="listening-glow" aria-hidden="true"></div><figure class="listening-art"><div class="listening-vinyl" aria-hidden="true"><span class="vinyl-label"><span class="vinyl-side"></span></span></div>${cover(r)}<figcaption>${escape(r.inventory_number)} · ${escape(r.format)}${r.storage_location ? ` · ${escape(r.storage_location)}` : ''}</figcaption></figure><div class="listening-copy"><p class="eyebrow">ON THE TURNTABLE</p><h2>${escape(r.title)}</h2><p class="listening-artist">${escape(r.artist)}${r.year ? `<span> · ${escape(r.year)}</span>` : ''}</p>${attribution(r)}${staleNotice}${groups.length > 1 ? `<div class="listening-sides" role="group" aria-label="Choose a side">${groups.map(g => `<button type="button" data-side-button="${escape(g.name)}" aria-pressed="false">Side ${escape(g.name)} <span>${g.minutes ? `${g.minutes} min` : `${g.count} ${g.count === 1 ? 'track' : 'tracks'}`}</span></button>`).join('')}</div>` : ''}<details class="listening-tracklist"><summary>Track list · ${(r.tracks || []).length} tracks</summary><ol class="tracks">${tracks}</ol>${r.tracks?.length ? '' : '<p class="muted">No saved tracks for this album.</p>'}</details>${r.notes ? `<blockquote class="listening-note">“${escape(r.notes)}”</blockquote>` : '<p class="listening-note">A record to spend time with.</p>'}<p class="listening-history">${history(r)}</p><p class="muted listening-help">Album view only. Plays are recorded through your listening station or the record’s listening history.</p></div></div>`;
  }
  function applySide(target, record) {
    const groups = sides(record.tracks || []);
    if (sideRecord !== record.id) { sideRecord = record.id; side = groups[0]?.name || null; }
    if (!groups.some(g => g.name === side)) side = groups[0]?.name || null;
    target.querySelectorAll('[data-side-button]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.sideButton === side)));
    target.querySelectorAll('.listening-tracklist li[data-side]').forEach(item => { item.hidden = groups.length > 1 && item.dataset.side !== side; });
    const label = target.querySelector('.vinyl-side'); if (label) label.textContent = side ? `SIDE ${side}` : 'GROOVESHELF';
  }
  function glow(target) {
    const image = target.querySelector('.listening-art .cover img');
    const stage = target.querySelector('.listening-stage');
    if (!image || !stage) return;
    const tint = () => {
      try {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 12;
        const context = canvas.getContext('2d', {willReadFrequently: true}); context.drawImage(image, 0, 0, 12, 12);
        const pixels = context.getImageData(0, 0, 12, 12).data; let r = 0, g = 0, b = 0, weight = 0;
        for (let i = 0; i < pixels.length; i += 4) { const w = 1 + Math.max(pixels[i], pixels[i+1], pixels[i+2]) - Math.min(pixels[i], pixels[i+1], pixels[i+2]); r += pixels[i] * w; g += pixels[i+1] * w; b += pixels[i+2] * w; weight += w; }
        stage.style.setProperty('--glow', `rgb(${Math.round(r / weight)} ${Math.round(g / weight)} ${Math.round(b / weight)})`);
      } catch {}
    };
    if (image.complete && image.naturalWidth) tint(); else image.addEventListener('load', tint, {once: true});
  }
  function enhance(target, record) {
    target.querySelectorAll('[data-side-button]').forEach(button => button.addEventListener('click', () => {
      side = button.dataset.sideButton; applySide(target, record);
      const details = target.querySelector('.listening-tracklist'); if (details) details.open = true;
    }));
    applySide(target, record); glow(target); spin(spinning); $('#listening-spin').hidden = false;
  }
  function refresh(target, record) { applySide(target, record); }
  function spin(value) {
    spinning = value;
    document.body.classList.toggle('listening-still', !value);
    $('#listening-spin').setAttribute('aria-pressed', String(value));
    $('#listening-spin').textContent = value ? 'Pause the spin' : 'Let it spin';
    try { localStorage.setItem('grooveshelf-listening-spin', value ? 'on' : 'off'); } catch {}
  }
  function ambient(value) {
    const on = value ?? !document.body.classList.contains('listening-ambient');
    document.body.classList.toggle('listening-ambient', on);
    $('#listening-ambient').setAttribute('aria-pressed', String(on));
    $('#listening-ambient-exit').hidden = !on;
    if (on) $('#listening-ambient-exit').focus(); else if (document.activeElement === $('#listening-ambient-exit') || !document.activeElement || document.activeElement === document.body) $('#listening-ambient').focus();
  }
  function clock() {
    const element = $('#listening-clock'); if (!element) { clearInterval(clockTimer); clockTimer = null; return; }
    const text = new Date().toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit'});
    if (element.textContent !== text) element.textContent = text;
  }
  async function suggest(previous) {
    const request = ++suggestionRequest; const target = $('#listening-suggestion'); if (!target) return;
    try {
      let data = await api(`/discovery?${new URLSearchParams({mode: 'recent', ...(previous ? {previous} : {})})}`);
      if (!data?.record) data = await api(`/discovery?${new URLSearchParams({mode: 'all', ...(previous ? {previous} : {})})}`);
      if (request !== suggestionRequest || !$('#listening-suggestion')) return;
      suggestion = data?.record ? hideExpired(data.record) : null;
      if (!suggestion) { target.hidden = true; return; }
      const s = suggestion;
      target.hidden = false;
      target.innerHTML = `<div class="suggestion-cover">${cover(s)}</div><div class="suggestion-copy"><p class="eyebrow">TONIGHT, PERHAPS</p><h3>${escape(s.title)}</h3><p>${escape(s.artist)}${s.storage_location ? ` · ${escape(s.storage_location)}` : ''} · ${s.last_played_at ? `last played ${escape(dateLabel(s.last_played_at))}` : 'not played yet'}</p></div><div class="suggestion-actions"><button type="button" data-suggestion="open">Show this album</button><button type="button" data-suggestion="next">Another idea</button></div>`;
      coverFallbacks(target);
      target.querySelector('[data-suggestion=open]').addEventListener('click', () => onChoose(s.id));
      target.querySelector('[data-suggestion=next]').addEventListener('click', () => suggest(s.id));
    } catch { if (request === suggestionRequest && $('#listening-suggestion')) $('#listening-suggestion').hidden = true; }
  }
  function idle(target) {
    target.innerHTML = `<div class="listening-stage listening-idle"><div class="listening-glow" aria-hidden="true"></div><p id="listening-clock" class="listening-clock"></p><div class="empty"><h2>Make room for a record.</h2><p>Lay a sleeve on your listening station’s reader, or choose an album above.</p><p class="muted">Opening this view does not record a play.</p></div><section id="listening-suggestion" class="listening-suggestion" aria-label="A suggestion for tonight" hidden></section></div>`;
    $('#listening-spin').hidden = true;
    clock(); if (!clockTimer) clockTimer = setInterval(clock, 15000);
    suggest();
  }
  $('#listening-spin').addEventListener('click', () => spin(!spinning));
  $('#listening-ambient').addEventListener('click', () => ambient());
  $('#listening-ambient-exit').addEventListener('click', () => ambient(false));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.body.classList.contains('listening-ambient') && !document.querySelector('dialog[open]')) { event.preventDefault(); ambient(false); } });
  spin(spinning);
  return {album, enhance, refresh, idle, ambient};
}
