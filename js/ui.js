/* Sky Watch · ui.js · Time machine, chips and filters, modes, sheets, Tonight, settings, diagnostics, snapshots.
   All app files share one global scope and must load in order: core, data, view, render, cards, sensing, ui, main. */
'use strict';
  // ---------- time ----------
  function setOffset(ms) {
    S.offset = ms; S.jump++; trailsAt = 0; S.starsAt = 0; S.planetsAt = 0;
    $('#scrub').value = clamp(Math.round((ms - S.tmBase) / 60000), -120, 120);
  }
  function goLive() { S.tmBase = 0; S.rate = 1; setOffset(0); $('#scrub').value = 0; }
  function timeJump(target, msg) {
    S.tmBase = target - Date.now(); setOffset(S.tmBase); $('#scrub').value = 0; closeSheets();
    const far = Math.abs(S.tmBase) > SAT_RANGE;
    toast((msg ? msg + ' ' : 'Showing ' + new Date(target).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) + '. ') + (far ? 'Satellites only show within 3 weeks of today; stars, planets and the Moon are exact. ' : '') + 'Tap the orange bar for live.', 5000);
  }
  $('#scrub').addEventListener('input', e => { S.scrubbing = true; setOffset(S.tmBase + parseInt(e.target.value, 10) * 60000); });
  $('#scrub').addEventListener('change', () => { S.scrubbing = false; });
  $('#liveBtn').addEventListener('click', () => openSheet('sheetTime'));
  $('#notLive').addEventListener('click', () => { goLive(); toast('Back to live.'); });
  $('#famPill').addEventListener('click', () => { setFamily(null); toast('Family highlight off.'); });
  function buildTime() {
    const pad = n => String(n).padStart(2, '0'), d = simNow();
    const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const at = (days, h, m) => { const x = new Date(); x.setDate(x.getDate() + days); x.setHours(h, m || 0, 0, 0); return x.getTime(); };
    const picks = [['Tonight at 10 PM', at(new Date().getHours() >= 22 ? 1 : 0, 22)], ['Tomorrow before dawn', at(1, 5, 30)]];
    try { if (S.libs.astro) { const fm = window.Astronomy.SearchMoonPhase(180, new Date(), 40); if (fm) { const x = new Date(fm.date); picks.push(['Next full Moon · ' + dfmt(x), x.getTime()]); } } } catch (e) { /* ignore */ }
    const sh = nextShowers(new Date(), 3).find(x => x.zhr >= 10); if (sh) { const x = new Date(sh.peak); x.setDate(x.getDate() + 1); x.setHours(3, 0, 0, 0); picks.push([sh.name + ' peak night · ' + dfmt(x), x.getTime()]); }
    picks.push(['Apollo 11 lands on the Moon · Jul 20, 1969', Date.UTC(1969, 6, 20, 20, 17)]);
    picks.push(['Halley’s Comet’s last visit · Feb 9, 1986', Date.UTC(1986, 1, 9, 10, 0)]);
    $('#timeBody').innerHTML = `
      <div class="sec-label">Jump to any date and time</div>
      <div class="inline"><input type="datetime-local" id="tmInput" step="60" value="${local}" aria-label="Date and time" style="flex:1 1 200px"><button type="button" class="btn primary small" id="tmGo">Go</button></div>
      <div class="sec-label">Quick picks</div>
      <div class="list">${picks.map((pk, i) => `<div class="event go" role="button" tabindex="0" data-tm="${i}"><div class="grow"><div class="h"><b>${esc(pk[0])}</b></div><div class="m">${esc(new Date(pk[1]).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }).toUpperCase())}</div></div></div>`).join('')}</div>
      <div class="sec-label">Playback speed</div>
      <div class="seg" id="rateSeg">${[[0, 'Pause'], [1, '1×'], [10, '10×'], [100, '100×'], [1000, '1000×']].map(r => `<button type="button" data-r="${r[0]}" aria-pressed="${S.rate === r[0]}">${r[1]}</button>`).join('')}</div>
      <p class="muted" style="margin:0">At 100× a whole ISS orbit takes under a minute. At 1000× you watch the night sky turn.</p>
      <button type="button" class="btn" id="tmLive">Back to live</button>
      <p class="muted" style="margin:0;font-size:11.5px">Satellites only show within about 3 weeks of today, because orbit data can’t predict further. Stars, planets and the Moon are exact for any date.</p>`;
    $('#tmGo').onclick = () => { const v = $('#tmInput').value; const t = new Date(v).getTime(); if (!isFinite(t)) return toast('Pick a date and time first.'); timeJump(t); };
    $$('#timeBody [data-tm]').forEach(el => el.onclick = () => { const pk = picks[+el.dataset.tm]; timeJump(pk[1], 'Showing ' + pk[0].split(' · ')[0] + '.'); });
    $$('#rateSeg button').forEach(b => b.onclick = () => { S.rate = +b.dataset.r; S.jump++; buildTime(); toast(S.rate === 0 ? 'Time paused.' : S.rate === 1 ? 'Normal speed.' : 'Playing at ' + S.rate + '×.'); });
    $('#tmLive').onclick = () => { goLive(); closeSheets(); toast('Back to live.'); };
  }

  // ---------- chips & filters ----------
  function renderChips() {
    if (S.world !== 'sky' && WORLDS[S.world]) {
      const wd = WORLDS[S.world], cur = wchip(S.world);
      $('#chips').innerHTML = wd.chips.map(([id, n]) => `<button type="button" class="chip glass" data-p="${id}" aria-pressed="${cur === id}">${esc(n)}</button>`).join('');
      $$('#chips .chip').forEach(b => b.onclick = () => { WSTATE.chip[S.world] = b.dataset.p; ls.set('wchips', WSTATE.chip); if (wd.onChip) wd.onChip(b.dataset.p); renderChips(); select(S.sel && S.sel.world === S.world ? S.sel : null); });
      return;
    }
    if (S.view === 'deep') {
      const c = [['all', 'Everything'], ['eye', 'Naked eye'], ['bino', 'Binoculars'], ['galaxy', 'Galaxies'], ['nebula', 'Nebulae'], ['cluster', 'Clusters']];
      $('#chips').innerHTML = c.map(([id, n]) => `<button type="button" class="chip glass" data-p="${id}" aria-pressed="${S.deepPreset === id}">${n}</button>`).join('');
      $$('#chips .chip').forEach(b => b.onclick = () => { S.deepPreset = b.dataset.p; renderChips(); });
      return;
    }
    if (S.view === 'meteor') {
      const now = simNow(), feat = featuredShower(now), list = activeShowers(now).concat(nextShowers(now, 5)).filter((x, i, a) => a.findIndex(y => y.name === x.name) === i).slice(0, 6);
      $('#chips').innerHTML = list.map(sh => `<button type="button" class="chip glass" data-p="${esc(sh.name)}" aria-pressed="${feat && feat.name === sh.name}">${esc(sh.name)} <span class="n">${sh.peak.toLocaleDateString([], { month: 'short', day: 'numeric' })}</span></button>`).join('');
      $$('#chips .chip').forEach(b => b.onclick = () => { S.feat = b.dataset.p; cardFor = null; renderChips(); updateCard(simNow(), true); });
      return;
    }
    const counts = { all: Sats.list.length, stations: 0, starlink: 0, new: 0 };
    for (const s of Sats.list) { if (s.groups.has('stations')) counts.stations++; if (s.groups.has('starlink')) counts.starlink++; if (s.groups.has('last-30-days')) counts.new++; }
    const chips = [['all', 'Everything', counts.all], ['visible', 'Visible now'], ['const', 'Constellations'], ['stations', 'Stations', counts.stations], ['starlink', 'Starlink', counts.starlink], ['new', 'New launches', counts.new]];
    $('#chips').innerHTML = chips.map(([id, n, c]) => `<button type="button" class="chip glass" data-p="${id}" aria-pressed="${S.preset === id}">${n}${c ? ` <span class="n">${fmt(c)}</span>` : ''}</button>`).join('');
    $$('#chips .chip').forEach(b => b.onclick = () => {
      S.preset = b.dataset.p;
      if (S.preset === 'starlink' && !Sats.status.starlink) { S.f.groups.starlink = true; loadGroup('starlink'); }
      if (S.preset === 'new' && !Sats.status['last-30-days']) { S.f.groups['last-30-days'] = true; loadGroup('last-30-days'); }
      rebuildActive(); renderChips(); if (!S.sel) select(null);
      if (S.preset === 'const') toast('Constellations: satellites hidden. Tap a constellation name to learn about it.');
      if (S.preset === 'visible') toast('Showing satellites bright enough to see by eye right now.');
    });
  }
  function sw(on) { return `<button type="button" class="switch" role="switch" aria-checked="${on}"><span></span></button>`; }
  function renderCountryType() {
    const seg = (id, opts, cur) => `<div class="seg" id="${id}">${opts.map(o => `<button type="button" data-v="${o[0]}" aria-pressed="${cur === o[0]}">${o[1]}</button>`).join('')}</div>`;
    $('#ctBox').innerHTML = seg('countrySeg', [['all', 'All'], ['us', 'USA'], ['china', 'China'], ['russia', 'Russia'], ['europe', 'Europe'], ['other', 'Other']], S.f.country || 'all') +
      seg('typeSeg', [['all', 'All'], ['pay', 'Satellites'], ['rb', 'Rocket stages'], ['deb', 'Debris']], S.f.otype || 'all');
    $$('#countrySeg button').forEach(b => b.onclick = () => { S.f.country = b.dataset.v; saveFilters(); rebuildActive(); renderCountryType(); });
    $$('#typeSeg button').forEach(b => b.onclick = () => { S.f.otype = b.dataset.v; saveFilters(); rebuildActive(); renderCountryType(); if (b.dataset.v === 'deb' && !S.f.groups['cosmos-2251-debris']) toast('Tip: turn on the debris groups above to see the big debris clouds.'); });
  }
  function renderGroupList() {
    const el = $('#groupList'); if (!el) return;
    el.innerHTML = GROUPS.map(gr => {
      const st = Sats.status[gr.id];
      const n = typeof st === 'number' ? fmt(st) : st === 'loading' ? 'loading…' : st === 'error' ? 'offline' : '';
      return `<div class="li" data-g="${gr.id}"><span class="swatch" style="border-color:${gr.col}"></span><div class="grow"><span class="t">${esc(gr.name)}</span><span class="s">${esc(gr.sub)}</span></div><span class="n">${n}</span>${sw(!!S.f.groups[gr.id])}</div>`;
    }).join('');
    $$('#groupList .li').forEach(li => { $('.switch', li).onclick = () => {
      const id = li.dataset.g; S.f.groups[id] = !S.f.groups[id]; saveFilters();
      if (S.f.groups[id] && !Sats.status[id]) loadGroup(id);
      rebuildActive(); renderGroupList();
    }; });
  }
  function renderLayers() {
    const L = [['stars', 'Stars', 'brightest ~100 stars'], ['lines', 'Constellation lines', 'stick figures and names'], ['planets', 'Planets, Moon and Sun', ''], ['meteors', 'Meteor showers', 'radiant and best place to look when one is active'], ['trails', 'Satellite paths', 'where it came from and where it is going'], ['grid', 'Altitude rings', '20°, 40°, 60°, 80° above the horizon']];
    $('#layerList').innerHTML = L.map(([k, t, s]) => `<div class="li" data-k="${k}"><div class="grow"><span class="t">${t}</span>${s ? `<span class="s">${s}</span>` : ''}</div>${sw(!!S.f.layers[k])}</div>`).join('');
    $$('#layerList .li').forEach(li => { $('.switch', li).onclick = () => { const k = li.dataset.k; S.f.layers[k] = !S.f.layers[k]; saveFilters(); renderLayers(); }; });
  }
  function renderHeight() {
    $('#hMin').value = S.f.hMin; $('#hMax').value = S.f.hMax;
    const lo = H_STEPS[S.f.hMin], hi = H_STEPS[S.f.hMax];
    $('#hLabel').textContent = (lo === 0 && hi > 1e8) ? 'ANY' : (fmt(dv(lo)) + ' – ' + (hi > 1e8 ? 'ANY' : fmt(dv(hi)) + ' ' + DU()));
  }
  $('#hMin').addEventListener('input', e => { S.f.hMin = Math.min(parseInt(e.target.value, 10), S.f.hMax - 1); renderHeight(); rebuildActive(); saveFilters(); });
  $('#hMax').addEventListener('input', e => { S.f.hMax = Math.max(parseInt(e.target.value, 10), S.f.hMin + 1); renderHeight(); rebuildActive(); saveFilters(); });
  function renderDensity() { $$('#densitySeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S.f.density)); }
  $$('#densitySeg button').forEach(b => b.onclick = () => { S.f.density = b.dataset.v; saveFilters(); renderDensity(); });
  $('#search').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase(), out = $('#searchResults');
    if (q.length < 2) { out.innerHTML = ''; return; }
    const res = [];
    for (const s of Sats.list) { if (s.name.toLowerCase().includes(q) || String(s.id) === q || (SPECIAL[s.id] || '').toLowerCase().includes(q)) { res.push(s); if (res.length >= 8) break; } }
    for (const s of STARS) if (s.name.toLowerCase().includes(q) && res.length < 10) res.push(s);
    for (const p of PLANETS) if (p.name.toLowerCase().includes(q)) res.push(p);
    for (const c of CONST) if (c.name.toLowerCase().includes(q)) res.push(c);
    for (const d of DSOS) if ((d.name + ' ' + d.id).toLowerCase().includes(q) && res.length < 14) res.push(d);
    for (const pb of PROBES.concat([JWST])) if ((pb.name + ' ' + (pb.short || '')).toLowerCase().includes(q)) res.push(pb);
    out.innerHTML = res.length ? res.map((s, i) => `<button type="button" data-i="${i}"><span>${esc(s.kind === 'sat' ? s.name : s.name)}</span><span>${s.kind === 'sat' ? 'NORAD ' + s.id : s.kind === 'dso' ? DSO_TYPE[s.type].toUpperCase() : s.kind === 'probe' ? 'SPACECRAFT' : s.kind === 'const' ? 'CONSTELLATION' : s.kind.toUpperCase()}</span></button>`).join('') : '<p class="muted">No match in the loaded data. Turn on more groups above.</p>';
    $$('button', out).forEach(b => b.onclick = () => {
      const o = res[+b.dataset.i]; closeSheets();
      if ((o.kind === 'dso' || o.kind === 'probe') && S.view !== 'deep') setView('deep');
      select(o);
      if (S.mode === 'sky') { const v = o.kind === 'sat' ? (o.v ? satDir(o, simNow().getTime()) : null) : o.v; if (v) { S.viewAz = azOf(v); S.viewAlt = clamp(altOf(v), -10, 85); } }
      toast('Tracking ' + o.name + '. Follow the arrow if it is out of view.');
    });
  });

  // ---------- modes ----------
  function setView(v) {
    S.view = v; S.sel = null; cardFor = null;
    document.body.classList.toggle('v-deep', v === 'deep'); document.body.classList.toggle('v-meteor', v === 'meteor');
    $$('#modeSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v));
    if (v !== 'meteor') S.autoCatch = false;
    if (v === 'meteor') S.featObj = null;
    renderChips(); select(null);
    if (v === 'meteor') { const f = featuredShower(simNow()); if (f) { S.featObj = Object.assign({}, f, { rv: radiantVec(f, simNow()), alt: altOf(radiantVec(f, simNow())) }); updateCard(simNow(), true); } }
    toast(v === 'deep' ? 'Deep space: galaxies, nebulae, clusters and far-away spacecraft.' : v === 'meteor' ? 'Meteor mode: the radiant and the best place to look.' : 'Orbit: everything circling Earth.');
  }
  $$('#modeSeg button').forEach(b => b.onclick = () => setView(b.dataset.v));
  $$('#modeSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === 'orbit'));

  // ---------- sheets ----------
  function openSheet(id) {
    closeSheets(true);
    const s = $('#' + id); s.classList.add('open'); s.setAttribute('aria-hidden', 'false'); $('#scrim').classList.add('on');
    if (id === 'sheetFilters') { renderGroupList(); renderCountryType(); renderLayers(); renderHeight(); renderDensity(); }
    if (id === 'sheetTonight') buildTonight();
    if (id === 'sheetSettings') buildSettings();
    if (id === 'sheetGallery') buildGallery();
    if (id === 'sheetTime') buildTime();
  }
  function closeSheets() { $$('.sheet').forEach(s => { s.classList.remove('open'); s.setAttribute('aria-hidden', 'true'); }); $('#scrim').classList.remove('on'); }
  $('#scrim').onclick = () => closeSheets();
  $$('[data-close]').forEach(b => b.onclick = () => closeSheets());
  $('#filterBtn').onclick = () => openSheet('sheetFilters');
  $('#tonightBtn').onclick = () => openSheet('sheetTonight');
  $('#gearBtn').onclick = () => openSheet('sheetSettings');
  $('#galleryBtn').onclick = () => openSheet('sheetGallery');
  $('#alignBtn').onclick = () => { if (S.mode === 'ar') setAlign(!S.align); else enterAR(); };
  $('#lockChip').onclick = () => { if (S.mode === 'ar') setAlign(true); else enterAR(); };
  function setRed(on, quiet) {
    S.red = on; document.body.classList.toggle('red', S.red); $('#redBtn').setAttribute('aria-pressed', S.red);
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = S.red ? '#000000' : '#02030a';
    if (!quiet) toast(S.red ? 'Red night mode on. Your eyes stay dark-adapted.' : 'Red night mode off.');
  }
  let autoRedDone = false;
  function autoRed() {
    if (!S.f.autoRed || autoRedDone || S.red || S.mode !== 'ar' || !SUN.v || S.offset !== 0) return;
    if (altOf(SUN.v) < -10) { autoRedDone = true; setRed(true, true); toast('It’s dark out, so red night mode switched on. Tap the moon button to turn it off.', 4500); }
  }
  $('#redBtn').onclick = () => {
    autoRedDone = true;
    S.red = !S.red; document.body.classList.toggle('red', S.red); $('#redBtn').setAttribute('aria-pressed', S.red);
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = S.red ? '#000000' : '#02030a';
    toast(S.red ? 'Red night mode on. Your eyes stay dark-adapted.' : 'Red night mode off.');
  };

  // ---------- tonight / events ----------
  let tonightDirty = true, tonightCache = null;
  const ICON = {
    pass: '<path d="M3 17c4-8 14-8 18 0"/><circle cx="12" cy="9" r="2"/>',
    train: '<path d="M4 18l16-12"/><circle cx="7" cy="16" r="1"/><circle cx="11" cy="13" r="1"/><circle cx="15" cy="10" r="1"/>',
    launch: '<path d="M12 2c3 3 4 7 4 11l-4 3-4-3c0-4 1-8 4-11z"/><path d="M10 19l2 3 2-3"/>',
    reentry: '<path d="M17 3l-8 8"/><path d="M13 3h4v4"/><path d="M9 11c-3 3-5 6-5 9 3 0 6-2 9-5"/>',
    boost: '<path d="M12 20V4"/><path d="M6 10l6-6 6 6"/>',
    aurora: '<path d="M3 18c3-6 6-9 9-9s6 3 9 9"/><path d="M6 18c2-4 4-6 6-6s4 2 6 6"/>',
    meteor: '<path d="M4 20L20 4"/><path d="M14 4h6v6"/>',
    planet: '<circle cx="12" cy="12" r="5"/><path d="M3 15c4 2 14-2 18-6"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'
  };
  function evGo(go, ...a) { return evRow(...a).replace('<div class="event">', `<div class="event go" role="button" tabindex="0" data-go="${esc(go)}" aria-label="Show in the sky">`); }
  // Tapping a Tonight item: close the panel, show live time, select the object and swing to it (or to its next pass).
  function goTo(go) {
    closeSheets();
    const k = go.split(':')[0], v = go.slice(go.indexOf(':') + 1);
    if (k === 'shower') { S.feat = v; setView('meteor'); return; }
    if (k === 'transit') {
      const [id, tt, body] = v.split(':'), st = Sats.byId.get(+id); if (!st) return;
      if (S.view !== 'orbit') setView('orbit');
      S.pinned.add(st.id); rebuildActive();
      S.rate = 1; timeJump(+tt - 15000, 'Jumping to 15 s before the ' + SPECIAL[st.id] + ' crosses the ' + body + '.');
      select(st);
      const bv = bodyDir(body, new Date(+tt));
      if (S.mode === 'sky') { S.viewAz = azOf(bv); S.viewAlt = clamp(altOf(bv), 2, 85); S.zoom = 5; }
      else toast('Point at the ' + body + ', ' + cardinal(azOf(bv)) + ' ' + Math.round(altOf(bv)) + '° up. Pinch to zoom in.', 5000);
      return;
    }
    let o = null;
    if (k === 'sat' || k === 'new') o = Sats.byId.get(+v);
    else if (k === 'planet') o = PLANETS.find(p => p.name === v);
    else if (k === 'moon') o = MOON;
    if (!o) { toast('That object is not loaded right now.'); return; }
    if (S.offset !== 0) setOffset(0);
    if (S.view !== 'orbit') setView('orbit');
    if (S.preset === 'const') S.preset = 'all';
    if (k === 'new') S.preset = 'new';
    if (o.kind === 'sat') { S.pinned.add(o.id); rebuildActive(); computeSat(o, epochCtx(simNow())); }
    renderChips(); select(o);
    const dir = o.kind === 'sat' ? (o.v ? satDir(o, simNow().getTime()) : null) : o.v;
    const nm = o.kind === 'sat' ? (SPECIAL[o.id] || o.name) : o.name;
    if (dir && altOf(dir) > 0) {
      if (S.mode === 'sky') { S.viewAz = azOf(dir); S.viewAlt = clamp(altOf(dir), 5, 85); }
      toast(S.mode === 'ar' ? nm + ' is up now. Follow the arrow at the edge of the screen.' : 'Showing ' + nm + ' live.');
    } else toast(nm + ' is below your horizon right now.' + (o.kind === 'sat' ? ' Its next visible pass is drawn in the sky.' : ''), 4000);
  }
  function evRow(icon, color, title, when, desc, meta) {
    return `<div class="event"><div class="ico" style="color:${color};background:color-mix(in srgb, ${color} 14%, transparent)"><svg viewBox="0 0 24 24">${ICON[icon]}</svg></div><div class="grow"><div class="h"><b>${title}</b><span style="color:${color}">${when}</span></div>${desc ? `<div class="d">${desc}</div>` : ''}${meta ? `<div class="m">${meta}</div>` : ''}</div></div>`;
  }
  async function cachedJSON(key, url, ttl) {
    const c = await idb.get(key);
    if (c && Date.now() - c.t < ttl) return c.data;
    try { const r = await fetch(url); if (!r.ok) throw new Error(r.status); const data = await r.json(); idb.set(key, { t: Date.now(), data }); return data; }
    catch (e) { return c ? c.data : null; }
  }
  function geomagLat(lat, lon) {
    const pl = 80.7 * D2R, plo = -72.7 * D2R, p = lat * D2R, l = lon * D2R;
    return Math.asin(Math.sin(p) * Math.sin(pl) + Math.cos(p) * Math.cos(pl) * Math.cos(l - plo)) * R2D;
  }
  async function buildTonight() {
    const body = $('#tonightBody');
    if (tonightCache && !tonightDirty && Date.now() - tonightCache.t < 10 * 60e3) { body.innerHTML = tonightCache.html; wireTonight(); return; }
    body.innerHTML = '<p class="muted">Working out tonight’s sky for your location…</p>';
    if (!S.libs.sat) await libSat;
    const now = new Date(), o = S.obs, parts = [];
    let evCount = 0;
    $('#tonightTitle').textContent = 'Tonight · ' + dfmt(now);
    // conditions
    let sunset = null, dark = null;
    if (S.libs.astro) {
      try {
        const A = window.Astronomy, ob = new A.Observer(o.lat, o.lon, 0);
        const ss = A.SearchRiseSet('Sun', ob, -1, now, 1); sunset = ss && ss.date;
        const dk = A.SearchAltitude('Sun', ob, -1, now, 1, -12); dark = dk && dk.date;
      } catch (e) { /* ignore */ }
    }
    const conds = `<div class="conds"><div><span>MOON</span><span>${MOON.v ? Math.round(MOON.frac * 100) + '%' : '—'}</span></div><div><span>SUNSET</span><span>${sunset ? tfmt(sunset).replace(' ', '') : '—'}</span></div><div><span>DARK</span><span>${dark ? tfmt(dark).replace(' ', '') : '—'}</span></div><div><span>SUN</span><span>${SUN.v ? Math.round(altOf(SUN.v)) + '°' : '—'}</span></div></div>`;
    const cf = await cloudForecast();
    parts.push(conds.replace('<div><span>SUN</span><span>' + (SUN.v ? Math.round(altOf(SUN.v)) + '°' : '—') + '</span></div>', '<div><span>CLOUDS</span><span>' + (cloudAt(cf, Date.now()) != null ? Math.round(cloudAt(cf, Date.now())) + '%' : '—') + '</span></div>'));
    parts.push('<div class="sec-label">Cloud forecast</div>' + cloudHTML(cf));
    parts.push(`<p class="muted mono" style="margin:-6px 0 0;font-size:10.5px">${S.locSource === 'gps' ? 'YOUR GPS LOCATION' : S.locSource === 'manual' ? 'LOCATION SET BY HAND' : 'APPROXIMATE LOCATION, SET IT IN SETTINGS'} · ${o.lat.toFixed(1)}°, ${o.lon.toFixed(1)}°</p>`);

    // station passes
    const passSats = [25544, 48274, 20580].map(id => Sats.byId.get(id)).filter(Boolean);
    const passes = [];
    for (const s of passSats) { const ps = await findPasses(s, now, 24, { visibleOnly: true, max: 3 }); ps.forEach(p => passes.push({ s, p })); }
    passes.sort((a, b) => a.p.vStart - b.p.vStart);
    if (passes.length) {
      const best = passes.slice().sort((a, b) => (b.p.maxEl - b.p.mag * 4) - (a.p.maxEl - a.p.mag * 4))[0];
      const bp = best.p, nm = SPECIAL[best.s.id]; S.bestPass = best;
      const mins = Math.round((bp.vStart - Date.now()) / 60000);
      parts.push(`<div class="sec-label">Best pass</div><div class="hero"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><div class="mono" style="font-size:9.5px;letter-spacing:1.4px;color:var(--accent)">${esc(nm.toUpperCase())} FLYOVER</div><div style="font:700 20px var(--display)">${dfmt(new Date(bp.vStart))}</div></div><div style="text-align:right"><div class="mono" style="font-size:20px;font-weight:600">${tfmt(new Date(bp.vStart))}</div><div class="mono" style="font-size:9.5px;color:var(--dim)">${mins > 0 ? 'IN ' + (mins >= 60 ? Math.floor(mins / 60) + 'H ' : '') + (mins % 60) + 'M' : 'NOW'}</div></div></div>
        <div class="mono" style="font-size:10.5px;color:var(--dim);display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span>RISES ${cardinal(bp.vStartAz)}</span><span>MAX ${Math.round(bp.maxEl)}°</span><span>SETS ${cardinal(bp.vEndAz)}</span><span>MAG ${bp.mag.toFixed(1)}</span>${cloudAt(cf, bp.vStart) != null ? '<span>CLOUD ' + Math.round(cloudAt(cf, bp.vStart)) + '%</span>' : ''}<span>${Math.max(1, Math.round((bp.vEnd - bp.vStart) / 60000))} MIN</span></div>
        <div class="row"><button type="button" class="btn primary small" data-remind="${best.s.id}:${bp.vStart}:${Math.round(bp.vStartAz)}">Remind me</button><button type="button" class="btn small" data-go="sat:${best.s.id}">Show me</button><button type="button" class="btn small" data-cal="${best.s.id}">Add to calendar</button><button type="button" class="btn small" data-preview="${bp.maxT}" data-sel="${best.s.id}">Preview</button></div></div>`);
      evCount++;
      const rest = passes.filter(x => x !== best).slice(0, 5);
      if (rest.length) parts.push('<div class="list">' + rest.map(x => evGo('sat:' + x.s.id, 'pass', '#5ad1ff', esc(SPECIAL[x.s.id]) + ' pass', tfmt(new Date(x.p.vStart)), '', `${dfmt(new Date(x.p.vStart)).toUpperCase()} · ${cardinal(x.p.vStartAz)}→${cardinal(x.p.vEndAz)} · MAX ${Math.round(x.p.maxEl)}° · MAG ${x.p.mag.toFixed(1)}`)).join('') + '</div>');
    } else parts.push('<div class="sec-label">Station passes</div><p class="muted">No visible ISS, Tiangong or Hubble passes in the next 24 hours from here. They are only visible near dawn and dusk, when you are in darkness but they are still in sunlight.</p>');

    // orbit events
    const ev = [];
    // fresh Starlink trains
    const groups = new Map();
    for (const s of Sats.list) if (s.groups.has('starlink')) { const k = s.launch; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
    const trainsL = [...groups.entries()].map(([k, a]) => ({ k, a, med: a.map(s => s.meanAlt).sort((x, y) => x - y)[a.length >> 1] })).filter(x => x.a.length >= 8 && x.med < 430).sort((a, b) => a.med - b.med).slice(0, 2);
    for (const tr of trainsL) {
      const lead = tr.a[tr.a.length >> 1];
      const ps = await findPasses(lead, now, 48, { visibleOnly: true, max: 1 });
      const p = ps[0];
      ev.push(evGo('sat:' + lead.id, 'train', '#8fb8ff', 'Starlink train · launch ' + esc('20' + tr.k.slice(0, 2) + '-' + tr.k.slice(2)), p ? tfmt(new Date(p.vStart)) : 'NOT VISIBLE SOON',
        `${tr.a.length} satellites still climbing to their final orbit, so they fly in a line. Fresh trains are the brightest.`,
        `AVG HEIGHT ${fmt(tr.med)} KM${p ? ' · ' + dfmt(new Date(p.vStart)).toUpperCase() + ' · ' + cardinal(p.vStartAz) + '→' + cardinal(p.vEndAz) + ' · MAX ' + Math.round(p.maxEl) + '°' : ''}`));
      evCount++;
    }
    // maneuvers
    for (const m of S.events.filter(e => e.type === 'maneuver')) {
      ev.push(evGo('sat:' + m.id, 'boost', '#7cf2b0', esc(m.name) + (m.delta > 0 ? ' raised its orbit' : ' lowered its orbit'), 'DETECTED', `Its average height changed by ${Math.abs(m.delta).toFixed(1)} km since the last data update. That means an engine burn.`, ''));
      evCount++;
    }
    // reentry watch
    const decaying = Sats.list.filter(s => s.perigee < 220 && s.perigee > 80 && !SPECIAL[s.id]).sort((a, b) => a.perigee - b.perigee).slice(0, 4);
    for (const s of decaying) {
      ev.push(evGo('sat:' + s.id, 'reentry', '#ff8a7a', 'Reentry watch: ' + esc(prettyName(s.name)), s.perigee < 180 ? 'DAYS' : 'WEEKS', s.perigee < 180 ? 'Low enough that air drag will bring it down within days.' : 'Dropping toward reentry in the coming weeks.', `LOWEST POINT ${fmt(s.perigee)} KM · NORAD ${s.id}`));
      evCount++;
    }
    // new launches in orbit
    const recent = new Map();
    for (const s of Sats.list) if (s.groups.has('last-30-days')) { if (!recent.has(s.launch)) recent.set(s.launch, []); recent.get(s.launch).push(s); }
    const recentL = [...recent.values()].sort((a, b) => b[0].launch.localeCompare(a[0].launch)).slice(0, 3);
    for (const a of recentL) ev.push(evGo('new:' + a[0].id, 'launch', '#ff9ad0', 'New in orbit: ' + esc(prettyName(a[0].name.replace(/-\d+$/, ''))), a.length + ' OBJECT' + (a.length > 1 ? 'S' : ''), '', `LAUNCH ${esc(a[0].intl.slice(0, 5))} · ${fmt(a[0].meanAlt)} KM · TAP "NEW LAUNCHES" TO SEE THEM`));
    // upcoming launches (The Space Devs)
    const ll = await cachedJSON('ll2', 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=6&mode=list', 3600e3);
    if (ll && ll.results) {
      for (const L of ll.results.filter(x => new Date(x.net) - now < 7 * 864e5).slice(0, 4)) {
        const d = new Date(L.net), hrs = (d - now) / 3600e3;
        ev.push(evRow('launch', '#5ad1ff', esc(L.name), hrs < 0 ? 'NOW' : hrs < 48 ? 'T−' + Math.floor(hrs) + 'H ' + Math.round((hrs % 1) * 60) + 'M' : dfmt(d).toUpperCase(), esc((L.lsp_name || (L.launch_service_provider && L.launch_service_provider.name) || '') + (L.location || (L.pad && L.pad.location && L.pad.location.name) ? ' · ' + (L.location || L.pad.location.name) : '')), `${dfmt(d).toUpperCase()} ${tfmt(d)} · ${esc(((L.status && (L.status.abbrev || L.status.name)) || '').toUpperCase())}`));
        if (hrs < 24) evCount++;
      }
    }
    // ISS / Tiangong crossing the Moon or Sun
    try {
      const tr = (await findTransits(10)).slice(0, 4);
      const rows = tr.map(x => {
        const nm = SPECIAL[x.s.id], d = new Date(x.t), hit = x.sep < 0.25;
        const when = dfmt(d).toUpperCase() + ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
        const desc = hit ? `Crosses the ${x.body} as seen from your spot. The crossing lasts about ${x.dur.toFixed(1)} s.` : `Misses the ${x.body} by ${x.sep.toFixed(1)}° from here. Move about ${fmt(Math.max(1, Math.round(dv(x.dist))))} ${du()} to see it cross.`;
        return evGo('transit:' + x.s.id + ':' + x.t + ':' + x.body, x.body === 'Sun' ? 'boost' : 'moon', x.body === 'Sun' ? '#ffd37a' : '#c9d6f5', nm + ' × ' + x.body + (hit ? ' · DIRECT HIT' : ''), when, desc,
          `${x.body.toUpperCase()} ${Math.round(x.el)}° UP · ${cardinal(x.az)}${x.body === 'Sun' ? ' · NEVER LOOK AT THE SUN WITHOUT A SOLAR FILTER' : ''}`);
      });
      parts.push('<div class="sec-label">ISS crossing the Moon or Sun · next 10 days</div>' + (rows.length ? '<div class="list">' + rows.join('') + '</div><p class="muted" style="margin:0;font-size:11px">Exact times firm up as the day gets closer, so check again the day before. Tap one to jump to that second.</p>' : '<p class="muted">No close crossings from your location in the next 10 days.</p>'));
    } catch (e) { /* skip */ }
    parts.push('<div class="sec-label">Happening in orbit</div>');
    parts.push(ev.length ? '<div class="list">' + ev.join('') + '</div>' : '<p class="muted">Loading orbit events needs the satellite data. Check your connection, then reopen this.</p>');

    // sky
    const sk = [];
    if (S.libs.astro) {
      try {
        const A = window.Astronomy, ob = new A.Observer(o.lat, o.lon, 0);
        for (const p of PLANETS.slice(0, 5)) {
          const up = p.v && altOf(p.v) > 0;
          let when = up ? 'UP NOW' : '';
          if (!up) { const r = A.SearchRiseSet(p.name, ob, +1, now, 1); if (r) when = 'RISES ' + tfmt(r.date); }
          sk.push(evGo('planet:' + p.name, 'planet', '#ffd37a', p.name, when, '', `MAG ${p.mag.toFixed(1)}${p.v ? ' · ' + cardinal(azOf(p.v)) + ' · ' + Math.round(altOf(p.v)) + '°' : ''}`));
        }
        const mr = A.SearchRiseSet('Moon', ob, +1, now, 1), ms = A.SearchRiseSet('Moon', ob, -1, now, 1);
        sk.unshift(evGo('moon', 'moon', '#c9d6f5', moonPhaseName(MOON.phase), Math.round(MOON.frac * 100) + '% LIT', MOON.frac > 0.6 ? 'A bright Moon washes out faint satellites and meteors.' : 'A dim Moon means darker skies.', `${mr ? 'RISES ' + tfmt(mr.date) : ''}${mr && ms ? ' · ' : ''}${ms ? 'SETS ' + tfmt(ms.date) : ''}`));
      } catch (e) { /* ignore */ }
    }
    // meteors
    const act = activeShowers(now), nxt = nextShowers(now, 2);
    for (const sh of nxt) {
      const isAct = act.some(a => a.name === sh.name);
      const days = Math.round((sh.peak - now) / 864e5);
      const lst = gmst(now) + o.lon * D2R, p0 = precess(sh.ra, sh.dec, now);
      const hToTransit = wrap360((p0.ra - lst) * R2D) / 15 / 1.0027379;
      const transit = new Date(now.getTime() + hToTransit * 3600e3);
      sk.push(evGo('shower:' + sh.name, 'meteor', '#ffb45a', sh.name, days === 0 ? 'PEAKS TONIGHT' : days > 0 ? 'PEAK IN ' + days + ' D' : 'ACTIVE', `${isAct ? 'Active now. ' : ''}Up to ~${sh.zhr} an hour under a dark sky. The radiant is highest around ${tfmt(transit)}.`, `PEAK ${sh.peak.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase()} · ${sh.v} KM/S · FROM ${esc(sh.parent.toUpperCase())}`));
    }
    // aurora
    const kp = await cachedJSON('kp', 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json', 3 * 3600e3);
    if (kp && kp.length) {
      let maxKp = 0;
      for (const row of kp) {
        const tt = Array.isArray(row) ? row[0] : row.time_tag, v = parseFloat(Array.isArray(row) ? row[1] : row.kp);
        const td = new Date(String(tt).replace(' ', 'T') + 'Z');
        if (isFinite(v) && td > now && td - now < 864e5) maxKp = Math.max(maxKp, v);
      }
      const gm = Math.abs(geomagLat(o.lat, o.lon)), need = clamp((66.5 - gm) / 2, 0, 9);
      const chance = maxKp >= need ? 'POSSIBLE' : maxKp >= need - 1.5 ? 'OUTSIDE CHANCE' : 'UNLIKELY';
      sk.push(evRow('aurora', '#7cf2b0', 'Aurora', chance, chance === 'UNLIKELY' ? 'Geomagnetic activity is too low to reach your latitude.' : 'Look low on the northern horizon after dark, away from city lights. Phone cameras pick it up better than eyes.', `KP FORECAST MAX ${maxKp.toFixed(1)} · YOU NEED ~KP ${need.toFixed(0)}`));
      if (chance === 'POSSIBLE') evCount++;
    }
    parts.push('<div class="sec-label">In the sky</div><div class="list">' + sk.join('') + '</div>');
    parts.push('<p class="muted" style="font-size:11px">Orbit data: CelesTrak. Launches: The Space Devs. Space weather: NOAA SWPC. Pass times are predictions; times can shift by a minute as data ages.</p>');
    const html = parts.join('');
    tonightCache = { t: Date.now(), html }; tonightDirty = false;
    body.innerHTML = html; wireTonight();
    const b = $('#evBadge'); b.hidden = !evCount; b.textContent = evCount;
  }
  function wireTonight() {
    $$('#tonightBody [data-go]').forEach(el => { el.onclick = () => goTo(el.dataset.go); el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTo(el.dataset.go); } }; });
    $$('[data-cal]').forEach(b => b.onclick = () => { if (S.bestPass) passToCalendar(S.bestPass.s, S.bestPass.p); });
    $$('[data-remind]').forEach(b => b.onclick = () => { const [id, t, az] = b.dataset.remind.split(':').map(Number); const s = Sats.byId.get(id); if (s) addAlarm(s, { vStart: t, vStartAz: az }); });
    $$('[data-preview]').forEach(b => b.onclick = () => { closeSheets(); setOffset(+b.dataset.preview - Date.now()); const s = Sats.byId.get(+b.dataset.sel); if (s) select(s); toast('Previewing the pass at its highest point. Tap LIVE to return.'); });
  }

  // ---------- settings ----------
  function buildSettings() {
    const o = S.obs, ages = GROUPS.filter(gr => Sats.age[gr.id]).map(gr => `<div class="kv"><span>${esc(gr.name)}</span><span>${fmt(Sats.status[gr.id] || 0)} · ${((Date.now() - Sats.age[gr.id]) / 3600e3).toFixed(1)} H OLD</span></div>`).join('');
    $('#settingsBody').innerHTML = `
      <div class="sec-label">Display</div>
      <div class="seg" id="unitSeg"><button type="button" data-v="km" aria-pressed="${!PREF.miles}">Kilometres</button><button type="button" data-v="mi" aria-pressed="${PREF.miles}">Miles</button></div>
      <div class="seg" id="clockSeg"><button type="button" data-v="12" aria-pressed="${!PREF.h24}">12-hour clock</button><button type="button" data-v="24" aria-pressed="${PREF.h24}">24-hour clock</button></div>
      <div class="li"><div class="grow"><span class="t">Red mode after dark</span><span class="s">Switches red night mode on by itself in camera view once it is properly dark</span></div><button type="button" class="switch" role="switch" id="autoRedSw" aria-checked="${!!S.f.autoRed}"><span></span></button></div>
      <button type="button" class="btn small" id="tipsAgain" style="align-self:flex-start">Show the tips again</button>
      <div class="li"><div class="grow"><span class="t">Battery saver</span><span class="s">Slower redraws when you hold still, lower camera resolution, less frequent star lock. Turns on by itself under 20%.</span></div><button type="button" class="switch" role="switch" id="saverSw" aria-checked="${!!S.f.saver}"><span></span></button></div>
      <div class="sec-label">Location</div>
      <p class="muted" style="margin:0">${S.locSource === 'gps' ? 'Using your GPS location' : S.locSource === 'manual' ? 'Set by hand' : 'Approximate, based on your time zone'}: <span class="mono">${o.lat.toFixed(3)}°, ${o.lon.toFixed(3)}°</span></p>
      <div class="inline"><input id="latIn" inputmode="decimal" aria-label="Latitude" placeholder="Latitude" value="${o.lat.toFixed(3)}"><input id="lonIn" inputmode="decimal" aria-label="Longitude" placeholder="Longitude" value="${o.lon.toFixed(3)}"></div>
      <div class="inline"><button type="button" class="btn small" id="locSave">Use these</button><button type="button" class="btn small" id="locGps">Use GPS</button></div>
      <div class="sec-label">Camera field of view <span class="mono" id="fovLabel">${S.fov}°</span></div>
      <input type="range" id="fovIn" min="40" max="90" step="1" value="${S.fov}" aria-label="Camera field of view">
      <p class="muted" style="margin:0">If labels drift apart from the real stars toward the edges of the screen, adjust this until they line up. Most phone main cameras are 64–70°.</p>
      <div class="sec-label">Compass</div>
      <div class="li"><div class="grow"><span class="t">Automatic star lock</span><span class="s">When bright stars show in the camera, use them to correct the compass by itself</span></div><button type="button" class="switch" role="switch" id="autoStarSw" aria-checked="${!!S.f.autoStar}"><span></span></button></div>
      <div class="kv"><span>Current compass correction</span><span>${S.hcorr.toFixed(1)}°</span></div>
      <div class="inline"><button type="button" class="btn small" id="setAlign">Align now</button><button type="button" class="btn small" id="clrAlign">Clear correction</button></div>
      <div class="li"><div class="grow"><span class="t">Show what the camera detects</span><span class="s">Green circles on the lights star lock can see, to check it is working</span></div><button type="button" class="switch" role="switch" id="detSw" aria-checked="${!!S.f.showDetect}"><span></span></button></div>
      <div class="sec-label">Haptic pings</div>
      <div class="seg" id="hapSeg"><button type="button" data-v="off">Off</button><button type="button" data-v="visible">Visible ones</button><button type="button" data-v="all">Everything</button></div>
      <p class="muted" style="margin:0">Buzzes when a satellite crosses the middle of the screen in camera view. Android phones only; iPhones don’t let websites vibrate.</p>
      <div class="sec-label">Meteor auto-catch sensitivity</div>
      <div class="seg" id="sensSeg"><button type="button" data-v="low">Low</button><button type="button" data-v="med">Medium</button><button type="button" data-v="high">High</button></div>
      <p class="muted" style="margin:0">Lower if it saves planes or flicker; higher if it misses faint meteors.</p>
      <div class="sec-label">Orbit data <button type="button" class="btn small" id="refresh">Refresh now</button></div>
      <div>${ages || '<p class="muted">Nothing loaded yet.</p>'}</div>
      <div class="sec-label">Check everything</div>
      <p class="muted" style="margin:0">Tests every data source and sensor. If something is not working, screenshot this and send it to whoever is helping you.</p>
      <button type="button" class="btn small" id="diagBtn" style="align-self:flex-start">Run check</button>
      <div id="diagOut"></div>
      <div class="sec-label">About</div>
      <p class="muted" style="margin:0">Sky Watch v1. Satellite positions use SGP4 (satellite.js) with CelesTrak orbit data, cached on this phone for offline use. Planets and the Moon use Astronomy Engine. Brightness is an estimate. Snapshots stay on this phone and never include your location.</p>`;
    $('#locSave').onclick = () => { const la = parseFloat($('#latIn').value), lo = parseFloat($('#lonIn').value); if (isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) { setLocation(la, lo, 'manual'); toast('Location set.'); buildSettings(); } else toast('Enter latitude −90 to 90 and longitude −180 to 180.'); };
    $('#locGps').onclick = async () => { toast('Finding you…'); const ok = await requestGPS(); toast(ok ? 'Location updated from GPS.' : 'Could not get GPS. Check location permission.'); buildSettings(); };
    $('#fovIn').oninput = e => { S.fov = +e.target.value; ls.set('fov', S.fov); $('#fovLabel').textContent = S.fov + '°'; };
    $('#setAlign').onclick = () => { closeSheets(); setAlign(true); };
    $('#autoStarSw').onclick = () => { S.f.autoStar = !S.f.autoStar; saveFilters(); buildSettings(); };
    $$('#unitSeg button').forEach(b => b.onclick = () => { PREF.miles = b.dataset.v === 'mi'; savePref(); tonightDirty = true; buildSettings(); });
    $$('#clockSeg button').forEach(b => b.onclick = () => { PREF.h24 = b.dataset.v === '24'; savePref(); tonightDirty = true; buildSettings(); });
    $('#saverSw').onclick = () => { S.f.saver = !S.f.saver; saveFilters(); buildSettings(); toast(S.f.saver ? 'Battery saver on.' + (S.mode === 'ar' ? ' Tap Camera later to apply the lower camera resolution.' : '') : 'Battery saver off.'); };
    $('#autoRedSw').onclick = () => { S.f.autoRed = !S.f.autoRed; saveFilters(); buildSettings(); };
    $('#tipsAgain').onclick = () => { closeSheets(); showTips(0); };
    $('#diagBtn').onclick = runDiagnostics;
    $('#detSw').onclick = () => { S.f.showDetect = !S.f.showDetect; saveFilters(); buildSettings(); };
    $$('#hapSeg button').forEach(b => { b.setAttribute('aria-pressed', b.dataset.v === S.f.haptics); b.onclick = () => { S.f.haptics = b.dataset.v; saveFilters(); buildSettings(); try { navigator.vibrate && navigator.vibrate(20); } catch (e) { /* ignore */ } }; });
    $$('#sensSeg button').forEach(b => { b.setAttribute('aria-pressed', b.dataset.v === S.f.catchSens); b.onclick = () => { S.f.catchSens = b.dataset.v; saveFilters(); buildSettings(); }; });
    $('#clrAlign').onclick = () => { S.hcorr = 0; ls.set('hcorr', 0); S.alignedAt = 0; ls.set('alignedAt', 0); toast('Compass correction cleared.'); buildSettings(); };
    $('#refresh').onclick = async () => { toast('Refreshing orbit data…'); await Promise.all(GROUPS.filter(gr => S.f.groups[gr.id] || Sats.status[gr.id]).map(gr => loadGroup(gr.id, true))); tonightDirty = true; toast('Orbit data refreshed.'); buildSettings(); };
  }

  // ---------- diagnostics ----------
  async function runDiagnostics() {
    const out = $('#diagOut'), rows = [];
    const row = (k, ok, v) => rows.push(`<div class="kv"><span>${ok === true ? '✓' : ok === false ? '✗' : '•'} ${esc(k)}</span><span>${esc(v)}</span></div>`);
    const render = () => { out.innerHTML = rows.join(''); };
    out.innerHTML = '<p class="muted">Checking…</p>';
    row('App version', null, 'v16 · ' + (navigator.serviceWorker && navigator.serviceWorker.controller ? 'offline ready' : 'online only'));
    row('Orbit math library', S.libs.sat, S.libs.sat ? 'loaded' : 'missing');
    row('Planet library', S.libs.astro, S.libs.astro ? 'loaded' : 'missing');
    for (const gr of GROUPS) if (Sats.status[gr.id] != null) row('CelesTrak · ' + gr.name, typeof Sats.status[gr.id] === 'number', typeof Sats.status[gr.id] === 'number' ? fmt(Sats.status[gr.id]) + ' · ' + ((Date.now() - (Sats.age[gr.id] || Date.now())) / 3600e3).toFixed(1) + ' h old' : String(Sats.status[gr.id]));
    row('Location', S.locSource === 'gps' || S.locSource === 'manual' || S.locSource === 'saved', S.locSource + ' · ' + S.obs.lat.toFixed(2) + ', ' + S.obs.lon.toFixed(2));
    row('View', null, S.mode === 'ar' ? 'camera' : 'sky');
    if (S.mode === 'ar') {
      row('Motion sensors', !!S.gotOrient, S.gotOrient ? (performance.now() - S.lastOrient < 1000 ? 'live' : 'paused') : 'no data');
      row('Compass', S.absolute, S.absolute ? (S.compassAcc != null ? '±' + Math.round(S.compassAcc) + '°' : 'absolute') : 'relative only: use Align');
      row('Camera', !!cam.videoWidth, cam.videoWidth ? cam.videoWidth + '×' + cam.videoHeight : 'no picture');
      row('Star / Sun / Moon lock', ST.last ? Date.now() - ST.last < 60000 : null, ST.last ? (ST.src || 'Star') + ' · ' + Math.round((Date.now() - ST.last) / 1000) + ' s ago' : 'not yet' + (ST.seen != null ? ' · ' + ST.seen + ' lights seen' : ''));
    }
    row('Compass correction', null, S.hcorr.toFixed(1) + '°');
    row('Drawing work', (S.work || 0) < 14, Math.round(S.work || 0) + ' ms per frame · resolution ×' + DPR);
    row('Battery saver', null, saverOn() ? (S.autoSaver ? 'on (low battery)' : 'on') : 'off');
    if (S.battery) row('Battery', S.battery.level > 0.2 || S.battery.charging, Math.round(S.battery.level * 100) + '%' + (S.battery.charging ? ' · charging' : ''));
    row('Vibration', 'vibrate' in navigator, 'vibrate' in navigator ? 'supported' : 'not on this phone');
    render();
    const probe = async (name, url) => { const t0 = performance.now(); try { const r = await fetch(url, { cache: 'no-store' }); row(name, r.ok, r.ok ? 'reachable · ' + Math.round(performance.now() - t0) + ' ms' : 'HTTP ' + r.status); } catch (e) { row(name, false, 'blocked or offline'); } render(); };
    await Promise.all([
      probe('Satellite details (CelesTrak SATCAT)', 'https://celestrak.org/satcat/records.php?CATNR=25544&FORMAT=JSON'),
      probe('Crew and launches (The Space Devs)', 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=1&mode=list'),
      probe('Cloud forecast (Open-Meteo)', 'https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&hourly=cloud_cover&forecast_days=1'),
      probe('Aurora (NOAA SWPC)', 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json')
    ]);
    row('Crew list', CREW ? Object.keys(CREW).length > 0 : null, CREW ? Object.values(CREW).reduce((a, c) => a + c.people.length, 0) + ' people found' : 'not loaded yet');
    render();
  }

  // ---------- snapshots ----------
  async function snapshot(tag) {
    const c = document.createElement('canvas'); c.width = sky.width; c.height = sky.height;
    const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    if (S.mode === 'ar' && cam.videoWidth && !S.noFeed) {
      const vw = cam.videoWidth, vh = cam.videoHeight, sc = Math.max(c.width / vw, c.height / vh) * S.zoom, dw = vw * sc, dh = vh * sc;
      if (S.red) x.filter = 'grayscale(1) brightness(0.55)';
      x.drawImage(cam, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
      x.filter = 'none';
      if (S.red) { x.globalCompositeOperation = 'multiply'; x.fillStyle = '#ff1a0a'; x.fillRect(0, 0, c.width, c.height); x.globalCompositeOperation = 'source-over'; }
    }
    x.drawImage(sky, 0, 0);
    // caption strip
    const now = simNow(), fwd = [-VM[2], -VM[5], -VM[8]], s = DPR;
    const gr = x.createLinearGradient(0, c.height - 90 * s, 0, c.height); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.75)');
    x.fillStyle = gr; x.fillRect(0, c.height - 90 * s, c.width, 90 * s);
    x.fillStyle = C('#ffffff'); x.font = `700 ${14 * s}px "Space Grotesk", Inter, sans-serif`; x.fillText('SKY WATCH' + (tag ? ' · ' + tag : ''), 16 * s, c.height - 40 * s);
    x.font = `500 ${10 * s}px "JetBrains Mono", monospace`; x.fillStyle = C('#c9d6f5');
    x.fillText(`${now.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }).toUpperCase()} · AZ ${azOf(fwd).toFixed(0)}° · ALT ${altOf(fwd).toFixed(0)}° · ${fmt((S.counts || {}).inView || 0)} SATELLITES IN FRAME`, 16 * s, c.height - 22 * s);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
    if (!blob) { toast('Could not save the snapshot.'); return; }
    const tc = document.createElement('canvas'), tw = 240, th = Math.round(240 * c.height / c.width); tc.width = tw; tc.height = th;
    tc.getContext('2d').drawImage(c, 0, 0, tw, th);
    const thumb = tc.toDataURL('image/jpeg', 0.7);
    const shot = { id: Date.now(), t: now.getTime(), blob, thumb };
    await idb.addShot(shot);
    setGalleryThumb(thumb);
    const fl = $('#flash'); fl.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => fl.classList.remove('on')));
    try { navigator.vibrate && navigator.vibrate(30); } catch (e) { /* ignore */ }
    if (!tag) toast('Snapshot saved. Tap the thumbnail to share it.');
  }
  function setGalleryThumb(src) { $('#galleryBtn').innerHTML = src ? `<img alt="" src="${src}">` : '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 16l5-5 4 4 3-3 6 6"/></svg>'; }
  let galTab = 'log';
  function setGalTab(t) {
    galTab = t; $$('#galTabs button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === t));
    $('#logPane').hidden = t !== 'log'; $('#shotPane').hidden = t !== 'shots'; $('#snapBtn').hidden = t !== 'shots';
    if (t === 'log') buildLog();
  }
  $$('#galTabs button').forEach(b => b.onclick = () => setGalTab(b.dataset.v));
  async function buildGallery() {
    setGalTab(galTab);
    const shots = (await idb.shots()).sort((a, b) => b.id - a.id);
    $('#shotEmpty').hidden = shots.length > 0;
    $('#shotGrid').innerHTML = shots.map(sh => `<button type="button" data-id="${sh.id}" aria-label="Snapshot from ${esc(new Date(sh.t).toLocaleString())}"><img alt="" src="${sh.thumb}"></button>`).join('');
    $$('#shotGrid button').forEach(b => b.onclick = () => openViewer(shots.find(s => s.id === +b.dataset.id)));
  }
  let viewing = null, viewURL = null;
  function openViewer(sh) {
    viewing = sh; if (viewURL) URL.revokeObjectURL(viewURL); viewURL = URL.createObjectURL(sh.blob);
    $('#viewerImg').src = viewURL; $('#viewer').hidden = false;
  }
  $('#vClose').onclick = () => { $('#viewer').hidden = true; };
  $('#vDelete').onclick = async () => { if (!viewing) return; await idb.delShot(viewing.id); $('#viewer').hidden = true; buildGallery(); const rest = (await idb.shots()).sort((a, b) => b.id - a.id); setGalleryThumb(rest[0] && rest[0].thumb); };
  $('#vShare').onclick = async () => {
    if (!viewing) return;
    const name = 'skywatch-' + new Date(viewing.t).toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.jpg';
    const file = new File([viewing.blob], name, { type: 'image/jpeg' });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Sky Watch' }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = viewURL; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  };
  $('#snapBtn').onclick = () => { closeSheets(); setTimeout(() => snapshot('').then(buildGallery).catch(e => toast('Snapshot failed: ' + e.message)), 350); };
  // clear view: only the sky and its labels
  function setClear(on) {
    S.clear = on; document.body.classList.toggle('clear', on); $('#clearBar').hidden = !on;
    if (on) { $('#feedBtn').hidden = S.mode !== 'ar'; $('#feedBtn').textContent = S.noFeed ? 'Camera on' : 'Camera off'; }
    zoneAt = 0;
  }
  $('#clearBtn').onclick = () => setClear(true);
  $('#unclearBtn').onclick = () => setClear(false);
  $('#feedBtn').onclick = () => { S.noFeed = !S.noFeed; cam.classList.toggle('nofeed', S.noFeed); $('#feedBtn').textContent = S.noFeed ? 'Camera on' : 'Camera off'; };

