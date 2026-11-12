/* Sky Watch · cards.js · Top readouts, detail cards, families, satellite details, station crews, spotter log, haptics, Moon/Sun crossings, clouds, calendar.
   All app files share one global scope and must load in order: core, data, view, render, cards, sensing, ui, main. */
'use strict';
  // ---------- HUD ----------
  function updateHUD(now) {
    if (!VM) return;
    const fwd = [-VM[2], -VM[5], -VM[8]];
    const az = azOf(fwd), alt = altOf(fwd);
    $('#roAz').textContent = az.toFixed(1) + '°';
    $('#roAlt').textContent = alt.toFixed(1) + '°';
    $('#roFov').textContent = Math.round(vfovDeg()) + '°';
    const rc = $('#roCount');
    if (S.world !== 'sky') { rc.innerHTML = WORLDS[S.world].hud(now); }
    else
    if (S.view === 'orbit' && S.preset === 'const') rc.innerHTML = '<b>' + (S.conCount || 0) + '</b> CONSTELLATIONS IN VIEW';
    else if (S.view === 'orbit') { if (!$('#roUp')) rc.innerHTML = '<b id="roUp">0</b> UP · <b id="roView">0</b> IN VIEW'; if (S.counts) { $('#roUp').textContent = fmt(S.counts.up); $('#roView').textContent = fmt(S.counts.inView); } }
    else if (S.view === 'deep') rc.innerHTML = '<b>' + (S.deepCount || 0) + '</b> DEEP-SKY IN VIEW';
    else rc.innerHTML = S.featObj ? 'RADIANT <b>' + Math.round(S.featObj.alt) + '°</b> UP' : '';
    drawTape(az);
    const dot = $('#lockDot'), txt = $('#lockText'), acc = $('#lockAcc');
    dot.className = 'dot';
    if (S.mode !== 'ar') { txt.textContent = 'Sky view'; acc.textContent = ''; dot.classList.add('warn'); }
    else if (performance.now() - S.lastOrient > 1500) { txt.textContent = 'Sensors paused'; acc.textContent = ''; dot.classList.add('warn', 'pulse'); }
    else if (!S.absolute) { txt.textContent = 'No compass'; acc.textContent = 'ALIGN'; dot.classList.add('bad', 'pulse'); }
    else if (ST.last && Date.now() - ST.last < 20000) { txt.textContent = (ST.src || 'Star') + ' lock'; acc.textContent = '±' + Math.max(0.1, ST.rms).toFixed(1) + '°'; dot.classList.add('pulse'); }
    else if (S.alignedAt && Date.now() - S.alignedAt < 6 * 3600e3) { txt.textContent = 'Aligned'; acc.textContent = '±0.5°'; dot.classList.add('pulse'); }
    else { txt.textContent = 'Compass'; acc.textContent = S.compassAcc != null ? '±' + Math.round(S.compassAcc) + '°' : '±10°'; dot.classList.add('warn'); }
    const nl = $('#notLive');
    if (S.offset === 0) nl.hidden = true;
    else {
      nl.hidden = false;
      const m = Math.round(S.offset / 60000), sameDay = now.toDateString() === new Date().toDateString();
      const when = sameDay ? tfmt(now).toUpperCase() + ' (' + (Math.abs(m) >= 60 ? (Math.abs(m) / 60).toFixed(1).replace('.0', '') + ' H' : Math.abs(m) + ' MIN') + (m < 0 ? ' AGO' : ' AHEAD') + ')'
        : now.toLocaleString([], { year: Math.abs(S.offset) > 300 * 864e5 ? 'numeric' : undefined, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).toUpperCase();
      $('#notLiveText').textContent = (S.rate === 0 ? 'PAUSED · ' : S.rate !== 1 ? S.rate + '× · ' : 'NOT LIVE · ') + when + (Math.abs(S.offset) > SAT_RANGE ? ' · NO SATELLITES' : '');
    }
    const fp = $('#famPill');
    if (!S.family) fp.hidden = true; else { fp.hidden = false; $('#famText').textContent = S.family.label.toUpperCase() + ' · ' + (S.family.up || 0) + ' UP'; }
    const lb = $('#liveBtn');
    if (S.offset === 0 && S.rate === 1) { lb.classList.remove('off'); $('#liveText').textContent = 'LIVE ' + now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }); }
    else { lb.classList.add('off'); $('#liveText').textContent = now.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }).toUpperCase() + ' · TIME MACHINE'; }
    if (S.offset === 0 && S.rate === 1) $('#liveText').textContent += ' · TIME MACHINE';
  }
  function drawTape(az) {
    const w = tape.width / DPR, h = tape.height / DPR;
    tg.setTransform(DPR, 0, 0, DPR, 0, 0); tg.clearRect(0, 0, w, h);
    const pxPerDeg = 4.2;
    tg.font = '400 10px "JetBrains Mono", monospace'; tg.textAlign = 'center';
    const lo = Math.floor((az - w / 2 / pxPerDeg) / 5) * 5, hi = az + w / 2 / pxPerDeg;
    for (let d = lo; d <= hi; d += 5) {
      const x = w / 2 + (d - az) * pxPerDeg, dd = wrap360(d), major = dd % 15 === 0;
      tg.strokeStyle = C('#c8d7ff', major ? 0.75 : 0.4); tg.lineWidth = 1;
      tg.beginPath(); tg.moveTo(x, h); tg.lineTo(x, h - (major ? 12 : 7)); tg.stroke();
      if (major) {
        const n = { 0: 'N', 90: 'E', 180: 'S', 270: 'W', 45: 'NE', 135: 'SE', 225: 'SW', 315: 'NW' }[dd];
        tg.fillStyle = C(n ? '#ffffff' : '#8fa0c8'); tg.font = n ? '600 11px "JetBrains Mono", monospace' : '400 10px "JetBrains Mono", monospace';
        tg.fillText(n || String(dd), x, 15);
      }
    }
    tg.fillStyle = C('#5ad1ff'); tg.fillRect(w / 2 - 0.75, 0, 1.5, h);
    tg.beginPath(); tg.moveTo(w / 2 - 5, 0); tg.lineTo(w / 2 + 5, 0); tg.lineTo(w / 2, 6); tg.closePath(); tg.fill();
  }

  // ---------- detail card ----------
  let cardFor = null;
  function select(o) {
    S.sel = o; cardFor = null;
    rebuildActive();
    if (o && o.kind === 'sat') { computeSat(o, epochCtx(simNow())); o.next = null; nextPassFor(o); }
    $('#card').hidden = !o && (S.world !== 'sky' ? !WORLDS[S.world].home : S.view === 'orbit' && S.preset !== 'stations');
    updateCard(simNow(), true);
  }
  async function nextPassFor(s) {
    const res = await findPasses(s, simNow(), 48, { visibleOnly: true, max: 1 });
    if (S.sel === s) {
      s.next = res[0] || 'none'; cardFor = null;
      s.passPath = null;
      if (s.next !== 'none') {
        const pts = [];
        for (let tt = s.next.start - 60e3; tt <= s.next.end + 60e3; tt += 10e3) { const st = satState(s, epochCtx(new Date(tt))); if (st) pts.push({ t: tt, v: [st.E, st.N, st.U], lit: st.lit }); }
        s.passPath = pts;
        // in sky view, swing round to where the pass will be if it is below the horizon now
        const cur = s.v ? satDir(s, simNow().getTime()) : null;
        if (S.mode === 'sky' && cur && cur[2] < 0 && pts.length) {
          let hi = pts[0]; for (const q of pts) if (Math.abs(q.t - s.next.maxT) < Math.abs(hi.t - s.next.maxT)) hi = q;
          S.viewAz = azOf(hi.v); S.viewAlt = clamp(altOf(hi.v) - 8, 5, 80);
        }
      }
      updateCard(simNow(), true);
    }
  }
  // The selected satellite's next visible pass, drawn across the sky with times, so you know where to look.
  function drawPassPath(t, placed) {
    const s = S.sel;
    if (!s || s.kind !== 'sat' || !s.passPath || !s.next || s.next === 'none' || t > s.next.end) return;
    const gcol = (GBY.get(s.prim) || GROUPS[0]).col;
    g.lineWidth = 2; let prev = null;
    for (const q of s.passPath) {
      if (q.v[2] < 0) { prev = null; continue; }
      const p = project(q.v);
      if (!p.ok) { prev = null; continue; }
      if (prev) { g.setLineDash(q.lit ? [6, 5] : [2, 6]); g.strokeStyle = C(gcol, q.lit ? 0.75 : 0.35); g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(p.x, p.y); g.stroke(); }
      prev = p;
    }
    g.setLineDash([]);
    const mark = (tm, title) => {
      let best = null; for (const q of s.passPath) if (!best || Math.abs(q.t - tm) < Math.abs(best.t - tm)) best = q;
      if (!best) return;
      const p = project(best.v); if (!onScreen(p, 0)) return;
      g.fillStyle = C(gcol); g.beginPath(); g.arc(p.x, p.y, 4, 0, 6.283); g.fill();
      const dd = new Date(tm), day = dd.toDateString() === new Date().toDateString() ? '' : dd.toLocaleDateString([], { weekday: 'short' }).toUpperCase() + ' ';
      label(placed, p.x, p.y, 6, title, day + tfmt(dd).toUpperCase() + ' · ' + Math.round(altOf(best.v)) + '° UP', C('#ffffff'), C('#a9d9f0'), 6, true);
    };
    const nm = SPECIAL[s.id] || prettyName(s.name);
    if (t < s.next.vStart) mark(s.next.vStart, nm + ' appears');
    mark(s.next.maxT, 'Highest');
    mark(s.next.vEnd, 'Fades');
  }
  function stat(k, v, u) { return `<div><span>${k}</span><span class="mono">${v}${u ? `<small> ${u}</small>` : ''}</span></div>`; }
  function updateCard(now, force) {
    let o = S.sel; const card = $('#card');
    if (!o) {
      if (S.world !== 'sky') { if (!WORLDS[S.world].home) return; o = { kind: 'worldhome' }; }
      else if (S.view === 'orbit' && S.preset !== 'stations') return;
      else o = { kind: S.view === 'meteor' ? 'meteorhome' : S.view === 'deep' ? 'deephome' : 'stationhome' };
    }
    const t = now.getTime();
    let html = '';
    if (o.kind === 'launch') html = launchCard(o, now);
    else if (o.kind === 'worldhome') html = WORLDS[S.world].home(now);
    else if (o.world && WORLDS[o.world]) html = WORLDS[o.world].card(o, now);
    else if (o.kind === 'sat') {
      const v = o.v ? satDir(o, t) : null, alt = v ? altOf(v) : -90, az = v ? azOf(v) : 0;
      const gr = GBY.get(o.prim) || GROUPS[0];
      const status = alt < 0 ? '<span class="tag dark">Below horizon</span>' : o.lit ? '<span class="tag lit">Sunlit</span>' : '<span class="tag dark">In shadow</span>';
      const isNew = o.groups.has('last-30-days') ? '<span class="tag new">New</span>' : '';
      const ageD = (Date.now() - o.epoch) / 864e5;
      let next = 'Finding next visible pass…';
      if (o.next === 'none') next = 'No visible pass in the next 48 h';
      else if (o.next) next = `Next visible: <b>${dfmt(new Date(o.next.vStart))} ${tfmt(new Date(o.next.vStart))}</b> · max ${Math.round(o.next.maxEl)}° · ${cardinal(o.next.vStartAz)}→${cardinal(o.next.vEndAz)}`;
      html = `<button type="button" id="cardClose" aria-label="Close details">×</button>
        <div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">${esc(SPECIAL[o.id] ? SPECIAL[o.id] + ' · ' + o.name : o.name)}</div>
        <div class="card-sub mono">NORAD ${o.id} · ${esc(o.intl || '—')} · ${esc(gr.name.toUpperCase())} · ${o.inc.toFixed(1)}° INC</div></div></div>
        <div class="inline">${status}${isNew}</div>
        <div class="stats">${stat('ALT', fmt(dv(o.h)), du())}${stat('VEL', dv(o.spd).toFixed(2), du() + '/s')}${stat('RANGE', fmt(dv(o.range)), du())}${stat('MAG', o.lit && alt > 0 ? o.mag.toFixed(1) : '—')}</div>
        <div class="card-foot mono"><span>${cardinal(az)} ${az.toFixed(0)}° · ${alt.toFixed(1)}° UP</span><span>ORBIT ${fmt(dv(o.perigee))}×${fmt(dv(o.apogee))} ${DU()} · ${o.period.toFixed(0)} MIN</span><span>DATA ${ageD.toFixed(1)} D OLD</span></div>
        <div class="card-foot"><span>${next}</span></div>
        ${aboutHTML(o)}${S.family && S.family.key === o.launch ? `<div class="about"><b>${esc(S.family.label)}</b><span class="muted" style="font-size:12px">${esc(S.family.story)}</span><div class="kv"><span>Highlighted</span><span>${S.family.n} OBJECTS · ${S.family.up || 0} ABOVE YOU NOW</span></div></div>` : ''}${o.id === 25544 || o.id === 48274 ? crewHTML(o.id) : ''}
        <div class="card-actions">${o.next && o.next !== 'none' ? '<button type="button" class="btn small" id="calBtn">Add to calendar</button><button type="button" class="btn small" id="remindBtn">Remind me</button>' : ''}<button type="button" class="btn small" id="seenBtn">Seen it</button><button type="button" class="btn small" id="famBtn">${S.family && S.family.key === o.launch ? 'Hide family' : 'Show family (' + Sats.list.filter(x => x.launch === o.launch).length + ')'}</button><button type="button" class="btn small" id="jumpBtn">${o.next && o.next !== 'none' ? 'Preview pass' : 'Centre it'}</button></div>`;
    } else if (o.kind === 'star') {
      const alt = altOf(o.v), az = azOf(o.v), yr = new Date().getFullYear();
      html = `<button type="button" id="cardClose" aria-label="Close details">×</button>
        <div class="card-head"><div style="flex:1"><div class="card-title">${esc(o.name)}</div><div class="card-sub mono">STAR${o.con ? ' · ' + esc(o.con.toUpperCase()) : ''}</div></div></div>
        <div class="stats">${stat('MAG', o.mag.toFixed(2))}${stat('DIST', o.ly ? fmt(o.ly) : '—', 'ly')}${stat('LIGHT LEFT', o.ly ? (yr - Math.round(o.ly) < 0 ? Math.abs(yr - Math.round(o.ly)) + ' BC' : String(yr - Math.round(o.ly))) : '—')}${stat('ALT', alt.toFixed(1), '°')}</div>
        <div class="card-foot mono"><span>${cardinal(az)} ${az.toFixed(0)}°</span><span>${o.ly ? 'THE LIGHT YOU SEE LEFT ' + fmt(Math.round(o.ly)) + ' YEARS AGO' : ''}</span></div>`;
    } else if (o.kind === 'planet' || o.kind === 'moon' || o.kind === 'sun') {
      const alt = o.v ? altOf(o.v) : 0, az = o.v ? azOf(o.v) : 0;
      let st = '';
      if (o.kind === 'planet') { const lm = o.dist * 8.317; st = stat('MAG', o.mag.toFixed(1)) + stat('DIST', o.dist.toFixed(2), 'AU') + stat('LIGHT', lm < 120 ? lm.toFixed(1) : (lm / 60).toFixed(1), lm < 120 ? 'min' : 'h') + stat('ALT', alt.toFixed(1), '°'); }
      else if (o.kind === 'moon') st = stat('LIT', Math.round(o.frac * 100), '%') + stat('DIST', fmt(dv(o.distKm)), du()) + stat('PHASE', moonPhaseName(o.phase).split(' ')[0]) + stat('ALT', alt.toFixed(1), '°');
      else st = stat('ALT', alt.toFixed(1), '°') + stat('AZ', az.toFixed(0), '°') + stat('LIGHT', '8.3', 'min') + stat('MAG', '−26.7');
      html = `<button type="button" id="cardClose" aria-label="Close details">×</button>
        <div class="card-head"><div style="flex:1"><div class="card-title">${esc(o.kind === 'moon' ? moonPhaseName(o.phase) : o.name)}</div><div class="card-sub mono">${o.kind === 'planet' ? 'PLANET' : o.kind === 'moon' ? 'THE MOON' : 'THE SUN · NEVER LOOK AT IT DIRECTLY'}</div></div></div>
        <div class="stats">${st}</div><div class="card-foot mono"><span>${cardinal(az)} ${az.toFixed(0)}°</span></div>
        ${o.kind === 'planet' ? '<div class="card-actions"><button type="button" class="btn small" id="seenBtn">Seen it</button></div>' : ''}`;
    } else if (o.kind === 'shower') {
      html = `<button type="button" id="cardClose" aria-label="Close details">×</button>
        <div class="card-head"><div style="flex:1"><div class="card-title">${esc(o.name)}</div><div class="card-sub mono">METEOR SHOWER · FROM ${esc(o.parent.toUpperCase())}</div></div></div>
        <div class="stats">${stat('PEAK', o.peak.toLocaleDateString([], { month: 'short', day: 'numeric' }))}${stat('RATE', '~' + o.zhr, '/hr')}${stat('SPEED', o.v, 'km/s')}${stat('ENDS', o.end.toLocaleDateString([], { month: 'short', day: 'numeric' }))}</div>
        <div class="card-foot"><span>Look about 45° away from the radiant, toward the darkest part of the sky. Rates are for a very dark sky; city skies show far fewer.</span></div>
        <div class="card-actions"><button type="button" class="btn small" id="showerCal">Add peak to calendar</button>${S.view !== 'meteor' ? '<button type="button" class="btn small" id="toMeteor">Open meteor mode</button>' : ''}</div>`;
    } else if (o.kind === 'meteorhome') {
      const f = S.featObj; if (!f) return;
      const days = Math.round((f.peak - now) / 864e5), active = now >= f.start && now <= f.end;
      const moonUp = MOON.v && altOf(MOON.v) > 0, sunA = SUN.v ? altOf(SUN.v) : -30;
      const rate = Math.round(f.zhr * Math.max(0, Math.sin(f.alt * D2R)) * 0.45 * (moonUp ? 1 - 0.6 * MOON.frac : 1));
      const lst = gmst(now) + S.obs.lon * D2R, p0 = precess(f.ra, f.dec, now);
      const transit = new Date(now.getTime() + wrap360((p0.ra - lst) * R2D) / 15 / 1.0027379 * 3600e3);
      const tag = active ? (Math.abs(days) <= 1 ? 'Peak now' : days > 0 ? 'Active · peak in ' + days + ' d' : 'Active') : 'Peak in ' + days + ' d';
      const nowLine = !active ? 'Not active yet. It starts ' + f.start.toLocaleDateString([], { month: 'short', day: 'numeric' }) + '.' : f.alt < 0 ? 'The radiant is below the horizon now. It is highest around ' + tfmt(transit) + '.' : sunA > -6 ? 'Wait for full darkness. The radiant is highest around ' + tfmt(transit) + '.' : 'About ' + rate + ' an hour from a suburban sky right now' + (moonUp && MOON.frac > 0.5 ? ' (the bright Moon hides faint ones).' : '.');
      const catchBtn = S.mode === 'ar' ? `<button type="button" class="btn small" id="catchBtn" aria-pressed="${S.autoCatch}">${S.autoCatch ? '<span class="catch"><span class="dot pulse"></span>Auto-catch on · ' + S.caught + ' caught</span>' : 'Auto-catch meteors'}</button>` : '';
      html = `<div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">${esc(f.name)}</div><div class="card-sub mono">FROM ${esc(f.parent.toUpperCase())}</div></div><span class="tag" style="color:#ffcf8a">${tag}</span></div>
        <div class="stats">${stat('RATE', '~' + f.zhr, '/hr')}${stat('SPEED', f.v, 'km/s')}${stat('BEST', tfmt(transit).replace(' ', ''))}${stat('MOON', moonUp ? Math.round(MOON.frac * 100) + '%' : 'DOWN')}</div>
        <div class="card-foot"><span>${nowLine}</span></div>
        <div class="card-actions"><button type="button" class="btn small" id="showerCal">Add peak to calendar</button>${catchBtn}</div>
        ${S.autoCatch ? '<div class="card-foot"><span>Rest the phone on something still, pointed at the "Best view" ring. Anything that streaks across gets saved to Snapshots.</span></div>' : ''}`;
    } else if (o.kind === 'stationhome') {
      const rows = stationRows(now).map(r => `<button type="button" class="srch-row" data-sat="${r.s.id}"><span>${esc(r.name)}</span><span>${r.where}</span></button>`).join('');
      html = `<div class="card-head"><div style="flex:1"><div class="card-title">Space stations</div><div class="card-sub mono">${stationRows(now).filter(r => r.up).length} ABOVE YOUR HORIZON NOW · TAP ONE TO TRACK IT</div></div></div><div class="srch">${rows || '<p class="muted">Loading station data…</p>'}</div>`;
    } else if (o.kind === 'deephome') {
      const au = p => probeAU(p, now);
      const rows = PROBES.map(p => { const a = p.v ? altOf(p.v) : -90; return `<button type="button" class="srch-row" data-probe="${esc(p.name)}"><span>${esc(p.name)}</span><span>${(au(p) * 0.1496).toFixed(1)}B KM · ${a > 0 ? cardinal(azOf(p.v)) + ' ' + Math.round(a) + '° UP' : 'BELOW HORIZON'}</span></button>`; }).join('');
      html = `<div class="card-head"><div style="flex:1"><div class="card-title">Deep space</div><div class="card-sub mono">SATELLITES HIDDEN · ${DSOS.length} SHOWPIECES · 4 SPACECRAFT</div></div></div>
        <div class="srch">${rows}<button type="button" class="srch-row" data-probe="JWST"><span>James Webb Space Telescope</span><span>1.5M KM · ${JWST.v && altOf(JWST.v) > 0 ? cardinal(azOf(JWST.v)) + ' ' + Math.round(altOf(JWST.v)) + '° UP' : 'BELOW HORIZON'}</span></button></div>`;
    } else if (o.kind === 'const') {
      const info = CONST_INFO[o.name] || ['', ''], alt = altOf(o.v), az = azOf(o.v);
      const bright = o.members.slice().sort((a, b) => a.mag - b.mag)[0];
      html = `<button type="button" id="cardClose" aria-label="Close details">×</button>
        <div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">${esc(o.name)}</div><div class="card-sub mono">CONSTELLATION · ${esc(info[0].split(',')[0].toUpperCase())}</div></div></div>
        <div class="stats">${stat('BRIGHTEST', esc(bright.name))}${stat('STARS', o.members.length, 'drawn')}${stat('BEST', info[1].slice(0, 3).toUpperCase())}${stat('ALT', alt.toFixed(0), '°')}</div>
        <div class="card-foot"><span>${esc(info[0])}. Best placed in the evening sky in ${esc(info[1])}.</span></div>
        <div class="card-foot mono"><span>${alt > 0 ? cardinal(az) + ' ' + az.toFixed(0) + '° · ' + alt.toFixed(0) + '° UP' : 'BELOW YOUR HORIZON NOW'}</span></div>`;
    } else if (o.kind === 'dso') {
      const alt = altOf(o.v), az = azOf(o.v), yr = new Date().getFullYear();
      const left = o.ly >= 1e6 ? (o.ly / 1e6).toFixed(1) + ' million years ago' : o.ly > yr ? fmt(Math.round(o.ly - yr)) + ' BC' : 'in ' + (yr - Math.round(o.ly)) + ' AD';
      html = `<button type="button" id="cardClose" aria-label="Close details">×</button>
        <div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">${esc(dsoLabel(o))}</div><div class="card-sub mono">${esc(DSO_TYPE[o.type].toUpperCase())} · ${esc(o.id)}</div></div><span class="tag" style="color:${DSO_COL[o.type]}">${seeWith(o)}</span></div>
        <div class="stats">${stat('DIST', o.ly >= 1e6 ? (o.ly / 1e6).toFixed(1) + 'M' : fmt(o.ly), 'ly')}${stat('MAG', o.mag > 50 ? '—' : o.mag.toFixed(1))}${stat('SIZE', o.size ? (o.size >= 60 ? (o.size / 60).toFixed(1) + '°' : o.size + "'") : '—')}${stat('ALT', alt.toFixed(1), '°')}</div>
        <div class="card-foot"><span>${esc(o.fact)}</span></div>
        <div class="card-foot mono"><span>${cardinal(az)} ${az.toFixed(0)}°</span><span>THE LIGHT YOU SEE LEFT ${esc(left.toUpperCase())}</span></div>
        <div class="card-actions"><button type="button" class="btn small" id="seenBtn">Seen it</button></div>`;
    } else if (o.kind === 'probe') {
      const alt = o.v ? altOf(o.v) : 0, az = o.v ? azOf(o.v) : 0;
      const au = o.jwst ? 0.01 : probeAU(o, now), km = au * 1.496e8;
      const st = o.jwst ? stat('DIST', '1.5', 'M km') + stat('SIGNAL', '5', 's') + stat('LAUNCHED', '2021') + stat('ALT', alt.toFixed(1), '°')
        : stat('DIST', (km / 1e9).toFixed(2), 'B km') + stat('SIGNAL', (au * 8.317 / 60).toFixed(1), 'h') + stat('SPEED', o.kms, 'km/s') + stat('ALT', alt.toFixed(1), '°');
      html = `<button type="button" id="cardClose" aria-label="Close details">×</button>
        <div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">${esc(o.name)}</div><div class="card-sub mono">SPACECRAFT · LAUNCHED ${o.launched}${o.jwst ? '' : ' · ' + au.toFixed(1) + ' AU FROM THE SUN'}</div></div></div>
        <div class="stats">${st}</div>
        <div class="card-foot"><span>${esc(o.fact)}</span></div>
        <div class="card-foot mono"><span>${alt > 0 ? cardinal(az) + ' ' + az.toFixed(0) + '° · ' + alt.toFixed(1) + '° UP' : 'BELOW YOUR HORIZON NOW'}</span><span>DIRECTION APPROXIMATE</span></div>`;
    }
    const ck = /home$/.test(o.kind) ? o.kind : 'detail';
    const collapsed = S.collapse[ck] != null ? S.collapse[ck] : ck !== 'detail';
    if (collapsed) html = compactFor(o, now);
    html = `<button type="button" id="cardToggle" aria-label="${collapsed ? 'Show more' : 'Show less'}" aria-expanded="${!collapsed}"><span></span></button>` + html;
    const key = html.length + ':' + html.slice(0, 200) + ':' + html.slice(-300);
    if (!force && key === cardFor) return;
    cardFor = key;
    card.innerHTML = html;
    card.classList.toggle('collapsed', collapsed);
    const flip = () => { S.collapse[ck] = !collapsed; cardFor = null; updateCard(simNow(), true); zoneAt = 0; };
    $('#cardToggle', card).onclick = flip;
    const mini = $('.mini', card); if (mini) mini.onclick = flip;
    const cc = $('#cardClose', card); if (cc) cc.onclick = () => select(null);
    if (o.kind === 'worldhome' && WORLDS[S.world].wireHome) WORLDS[S.world].wireHome(card);
    if (o.world && WORLDS[o.world] && WORLDS[o.world].wire) WORLDS[o.world].wire(card, o);
    if (o.kind === 'launch') launchWire(card, o);
    const sb = $('#seenBtn', card); if (sb) sb.onclick = () => logSeen(o);
    const fb = $('#famBtn', card); if (fb) fb.onclick = () => setFamily(S.family && S.family.key === o.launch ? null : o);
    const cb = $('#calBtn', card); if (cb) cb.onclick = () => passToCalendar(o, o.next);
    const sc = $('#showerCal', card); if (sc) sc.onclick = () => { const f = o.kind === 'meteorhome' ? S.featObj : o; showerToCalendar(f); };
    const tm = $('#toMeteor', card); if (tm) tm.onclick = () => { S.feat = o.name; setView('meteor'); };
    const ca = $('#catchBtn', card); if (ca) ca.onclick = () => { S.autoCatch = !S.autoCatch; cardFor = null; toast(S.autoCatch ? 'Auto-catch on. Keep the phone still and the screen on.' : 'Auto-catch off.'); updateCard(simNow(), true); };
    $$('[data-sat]', card).forEach(b => b.onclick = () => { const st = Sats.byId.get(+b.dataset.sat); if (!st) return; select(st); const v = st.v && satDir(st, simNow().getTime()); if (v && altOf(v) > 0 && S.mode === 'sky') { S.viewAz = azOf(v); S.viewAlt = clamp(altOf(v), -10, 85); } if (v && altOf(v) <= 0) toast((SPECIAL[st.id] || st.name) + ' is below your horizon right now. Its card shows the next visible pass.'); });
    $$('[data-probe]', card).forEach(b => b.onclick = () => { const pb = b.dataset.probe === 'JWST' ? JWST : PROBES.find(x => x.name === b.dataset.probe); select(pb); if (S.mode === 'sky' && pb.v) { S.viewAz = azOf(pb.v); S.viewAlt = clamp(altOf(pb.v), -10, 85); } });
    const rb = $('#remindBtn', card); if (rb) rb.onclick = () => addAlarm(o, o.next);
    const jb = $('#jumpBtn', card); if (jb) jb.onclick = () => {
      if (o.next && o.next !== 'none') { setOffset(o.next.maxT - Date.now()); computeSat(o, epochCtx(simNow())); toast('Previewing the pass at its highest point. Tap LIVE to return.'); }
      if (S.mode === 'sky' && o.v) { const v = satDir(o, simNow().getTime()); S.viewAz = azOf(v); S.viewAlt = clamp(altOf(v), -10, 85); }
    };
  }

  // Every object in the stations group: where it is now, or when it next rises above 10 degrees.
  function stationRows(now) {
    if (!CREW) loadCrew();
    const list = Sats.list.filter(x => x.groups.has('stations')).sort((a, b) => (SPECIAL[b.id] ? 1 : 0) - (SPECIAL[a.id] ? 1 : 0) || a.name.localeCompare(b.name)).slice(0, 14);
    return list.map(st => {
      if (!st.v || st.jump !== S.jump) computeSat(st, epochCtx(now));
      const v = st.v ? satDir(st, now.getTime()) : null, alt = v ? altOf(v) : -90, up = alt > 0;
      if (!up && (st.riseFor == null || Math.abs(st.riseFor - now.getTime()) > 600e3) && !st.riseBusy) {
        st.riseBusy = true; st.riseFor = now.getTime();
        findPasses(st, now, 24, { max: 1 }).then(r => { st.rise = r[0] ? r[0].start : 0; st.riseBusy = false; cardFor = null; });
      }
      const where = up ? cardinal(azOf(v)) + ' ' + Math.round(alt) + '° UP' + (st.lit ? '' : ' · SHADOW') : st.rise ? 'RISES ' + tfmt(new Date(st.rise)).replace(' ', '') : st.rise === 0 ? 'NO PASS IN 24 H' : 'BELOW HORIZON';
      const crewN = CREW && CREW[st.id] ? CREW[st.id].people.length : 0;
      return { s: st, name: SPECIAL[st.id] || st.name, up, where: where + (crewN ? ' · ' + crewN + ' ABOARD' : '') };
    });
  }
  // Collapsed card: one line, or a sideways strip for the spacecraft list.
  function compactFor(o, now) {
    if (o.kind === 'launch') return launchCompact(o, now);
    if (o.kind === 'worldhome') return WORLDS[S.world].homeCompact ? WORLDS[S.world].homeCompact(now) : '';
    if (o.world && WORLDS[o.world]) return WORLDS[o.world].compact(o, now);
    if (o.kind === 'stationhome') {
      const rows = stationRows(now);
      return rows.length ? `<div class="strip">${rows.map(r => `<button type="button" data-sat="${r.s.id}"><b>${esc(prettyName(r.name))}</b><span>${r.where}</span></button>`).join('')}</div>` : '<p class="muted" style="margin:0">Loading station data…</p>';
    }
    const close = '<button type="button" id="cardClose" aria-label="Close details">×</button>';
    const line = (b, sp) => `<button type="button" class="mini"><b>${esc(b)}</b><span class="mono">${sp}</span></button>`;
    const pos = v => v ? cardinal(azOf(v)) + ' ' + Math.round(altOf(v)) + '° UP' : '';
    if (o.kind === 'deephome') {
      const items = PROBES.concat([JWST]).map(p => { const a = p.v ? altOf(p.v) : -90; return `<button type="button" data-probe="${p.jwst ? 'JWST' : esc(p.name)}"><b>${esc(p.short || p.name)}</b><span>${p.jwst ? '1.5M KM' : (probeAU(p, now) * 0.1496).toFixed(1) + 'B KM'} · ${a > 0 ? pos(p.v) : 'BELOW'}</span></button>`; }).join('');
      return `<div class="strip">${items}</div>`;
    }
    if (o.kind === 'meteorhome') {
      const f = S.featObj; if (!f) return '';
      const days = Math.round((f.peak - now) / 864e5), lst = gmst(now) + S.obs.lon * D2R, p0 = precess(f.ra, f.dec, now);
      const transit = new Date(now.getTime() + wrap360((p0.ra - lst) * R2D) / 15 / 1.0027379 * 3600e3);
      return line(f.name, (days > 0 ? 'PEAK IN ' + days + ' D' : 'PEAK NOW') + ' · BEST ' + tfmt(transit).replace(' ', '') + ' · RADIANT ' + Math.round(f.alt) + '°' + (S.autoCatch ? ' · CATCHING (' + S.caught + ')' : ''));
    }
    if (o.kind === 'sat') { const v = o.v ? satDir(o, now.getTime()) : null; return close + line(SPECIAL[o.id] || o.name, fmt(dv(o.h)) + ' ' + DU() + ' · ' + (v && altOf(v) < 0 ? 'BELOW HORIZON' : o.lit ? 'MAG ' + o.mag.toFixed(1) + ' · ' + pos(v) : 'IN SHADOW · ' + pos(v))); }
    if (o.kind === 'const') return close + line(o.name, esc(((CONST_INFO[o.name] || [''])[0].split(',')[0]).toUpperCase()) + ' · ' + pos(o.v));
    if (o.kind === 'star') return close + line(o.name, 'MAG ' + o.mag.toFixed(1) + (o.ly ? ' · ' + fmt(o.ly) + ' LY' : '') + ' · ' + pos(o.v));
    if (o.kind === 'dso') return close + line(dsoLabel(o), lyText(o.ly).toUpperCase() + ' · ' + seeWith(o) + ' · ' + pos(o.v));
    if (o.kind === 'probe') return close + line(o.short || o.name, (o.jwst ? '1.5M KM' : (probeAU(o, now) * 0.1496).toFixed(1) + 'B KM') + ' · ' + (o.v && altOf(o.v) > 0 ? pos(o.v) : 'BELOW HORIZON'));
    if (o.kind === 'shower') return close + line(o.name, 'PEAK ' + o.peak.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase() + ' · ~' + o.zhr + '/HR');
    return close + line(o.kind === 'moon' ? moonPhaseName(o.phase) : o.name, (o.mag != null && o.kind !== 'moon' ? 'MAG ' + o.mag.toFixed(1) + ' · ' : '') + pos(o.v));
  }

  // ---------- family: everything from the same launch (or the same breakup) ----------
  const FAMILY_STORY = {
    '93036': ['Cosmos 2251 debris', 'In February 2009 the dead Russian satellite Cosmos 2251 hit the working Iridium 33 at about 11.7 km/s, the first accidental crash between two satellites. Every highlighted piece came from it.'],
    '97051': ['Iridium 33 debris', 'The other half of the 2009 collision with Cosmos 2251. The pieces are still circling Earth.'],
    '99025': ['Fengyun-1C debris', 'In January 2007 China destroyed its own old weather satellite with a missile, making the biggest debris cloud ever recorded: over 3,000 tracked pieces.'],
    '82092': ['Cosmos 1408 debris', 'In November 2021 Russia blew up Cosmos 1408 with a missile test. The ISS crew had to shelter in their capsules as the cloud passed.'],
    '98067': ['The ISS family', 'Everything sharing the ISS’s launch code: the station itself plus small satellites released from its airlock.']
  };
  function familyOf(s) {
    const key = s.launch, n = Sats.list.filter(x => x.launch === key).length;
    const code = (+key.slice(0, 2) < 57 ? '20' : '19') + key.slice(0, 2) + '-' + key.slice(2);
    const st = FAMILY_STORY[key];
    if (st) return { key, n, label: st[0], story: st[1] };
    if (s.groups.has('starlink')) return { key, n, label: 'Starlink launch ' + code, story: n + ' satellites launched together on one rocket. New batches fly in a line, a “train”, before spreading out to their final orbits.' };
    return { key, n, label: 'Launch ' + code, story: n + ' loaded object' + (n === 1 ? '' : 's') + ' from the same launch: satellites, the rocket stage and any debris it left.' };
  }
  function setFamily(s) {
    S.family = s ? familyOf(s) : null; rebuildActive(); cardFor = null;
    if (S.family) toast(S.family.label + ': ' + S.family.n + ' objects highlighted in gold.', 3500);
  }

  // ---------- what is it: CelesTrak satellite catalog ----------
  const OWNERS = { US: 'United States', PRC: 'China', CIS: 'Russia (former USSR)', ESA: 'European Space Agency', JPN: 'Japan', IND: 'India', FR: 'France', UK: 'United Kingdom', GER: 'Germany', IT: 'Italy', CA: 'Canada', SKOR: 'South Korea', ISRA: 'Israel', ISS: 'International (ISS partners)', EUME: 'EUMETSAT (Europe)', EUTE: 'Eutelsat', ITSO: 'Intelsat', SES: 'SES', GLOB: 'Globalstar', ORB: 'ORBCOMM', IRID: 'Iridium', O3B: 'O3b / SES', AB: 'Arab League (Arabsat)', BRAZ: 'Brazil', ARGN: 'Argentina', AUS: 'Australia', UAE: 'United Arab Emirates', TURK: 'Turkey', NZ: 'New Zealand', SAFR: 'South Africa', LUXE: 'Luxembourg', NOR: 'Norway', SPN: 'Spain', NETH: 'Netherlands', FIN: 'Finland', SWED: 'Sweden', SING: 'Singapore', TWN: 'Taiwan', INDO: 'Indonesia', MEX: 'Mexico', KAZ: 'Kazakhstan', UKR: 'Ukraine', IRAN: 'Iran', NKOR: 'North Korea', PAKI: 'Pakistan', ASRA: 'Austria', BEL: 'Belgium', DEN: 'Denmark', POL: 'Poland', CHLE: 'Chile', PER: 'Peru', THAI: 'Thailand', VTNM: 'Vietnam', SAUD: 'Saudi Arabia', QAT: 'Qatar', EGYP: 'Egypt', NIG: 'Nigeria', TBD: 'Unknown' };
  const SITES = { AFETR: 'Cape Canaveral, Florida', AFWTR: 'Vandenberg, California', TYMSC: 'Baikonur, Kazakhstan', PLMSC: 'Plesetsk, Russia', VOSTO: 'Vostochny, Russia', KYMSC: 'Kapustin Yar, Russia', JSC: 'Jiuquan, China', XSC: 'Xichang, China', TSC: 'Taiyuan, China', WSC: 'Wenchang, China', YSLA: 'Yellow Sea (sea launch), China', FRGUI: 'Kourou, French Guiana', SRILR: 'Sriharikota, India', TNSTA: 'Tanegashima, Japan', KSCUT: 'Uchinoura, Japan', RLLB: 'Mahia, New Zealand', WRAS: 'Wallops, Virginia', ERAS: 'Air launch (east coast)', KODAK: 'Kodiak, Alaska', SEAL: 'Sea Launch platform', SNMLP: 'San Marco platform, Kenya', NSC: 'Naro, South Korea', SEMLS: 'Semnan, Iran', YAVNE: 'Palmachim, Israel', SADOL: 'Submarine launch, Barents Sea' };
  const STATUS = { '+': 'Working', '-': 'Not working', P: 'Partly working', B: 'Backup', S: 'Spare', X: 'Extended mission', D: 'Decayed', '?': 'Unknown' };
  function purposeOf(s, info) {
    const n = s.name.toUpperCase(), t = info && info.OBJECT_TYPE;
    if (t === 'R/B' || / R\/B/.test(n)) return 'Spent rocket stage left in orbit after a launch';
    if (t === 'DEB' || / DEB/.test(n)) return 'Debris: a fragment from a breakup, collision or launch';
    if (s.id === 25544) return 'International Space Station: crewed laboratory, continuously occupied since 2000';
    if (s.id === 48274) return 'Tiangong, China’s crewed space station';
    if (s.id === 20580) return 'Hubble Space Telescope';
    if (/STARLINK/.test(n)) return 'Starlink internet satellite (SpaceX)';
    if (/ONEWEB/.test(n)) return 'OneWeb internet satellite';
    if (/KUIPER/.test(n)) return 'Amazon Kuiper internet satellite';
    if (/SOYUZ|PROGRESS|DRAGON|CYGNUS|SHENZHOU|TIANZHOU|STARLINER|HTV/.test(n)) return 'Spacecraft visiting a space station';
    if (/GPS|NAVSTAR|GALILEO|GSAT0|GLONASS|COSMOS 2[45]\d\d|BEIDOU|QZS|IRNSS|NAVIC/.test(n)) return 'Navigation satellite (GPS-type positioning)';
    if (/GOES|NOAA|METEOSAT|METOP|HIMAWARI|FENGYUN|FY-|DMSP|SUOMI|JPSS|METEOR-M|ELEKTRO/.test(n)) return 'Weather satellite';
    if (/IRIDIUM|GLOBALSTAR|ORBCOMM|INTELSAT|SES|EUTELSAT|ASTRA|INMARSAT|VIASAT|ECHOSTAR|DIRECTV|TELESAT|ARABSAT|TDRS/.test(n)) return 'Communications satellite';
    if (/LANDSAT|SENTINEL|WORLDVIEW|PLANET|FLOCK|SKYSAT|SPOT|PLEIADES|TERRA|AQUA|AURA|ICESAT|GRACE|CRYOSAT|RESURS|GAOFEN|ZIYUAN|CARTOSAT|RADARSAT|TERRASAR|COSMO-SKYMED|ICEYE|CAPELLA|SWOT/.test(n)) return 'Earth-watching satellite (imaging or climate)';
    if (/HST|CHANDRA|SWIFT|FERMI|NUSTAR|TESS|XMM|INTEGRAL|GAIA|NEOWISE|AGILE|ASTROSAT|HXMT|EINSTEIN/.test(n)) return 'Space telescope or science observatory';
    if (/USA |NROL|LACROSSE|YAOGAN|KOSMOS|COSMOS/.test(n)) return 'Military or government satellite';
    if (s.groups.has('science')) return 'Science satellite';
    if (s.groups.has('weather')) return 'Weather satellite';
    if (s.groups.has('gnss')) return 'Navigation satellite';
    if (s.groups.has('stations')) return 'Spacecraft at a space station';
    return t === 'PAY' ? 'Satellite (payload)' : 'Object in orbit';
  }
  function satInfo(s) {
    if (s.info !== undefined) return s.info;
    s.info = null;
    (async () => {
      const key = 'satcat:' + s.id, c = await idb.get(key);
      if (c && Date.now() - c.t < 30 * 864e5) { s.info = c.d; cardFor = null; return; }
      try {
        const r = await fetch('https://celestrak.org/satcat/records.php?CATNR=' + s.id + '&FORMAT=JSON');
        const j = await r.json(), d = Array.isArray(j) ? j[0] : j;
        if (!d || !d.NORAD_CAT_ID) throw new Error('none');
        s.info = d; idb.set(key, { t: Date.now(), d });
      } catch (e) { s.info = c ? c.d : false; }
      cardFor = null;
    })();
    return null;
  }
  function aboutHTML(s) {
    const info = satInfo(s);
    const purpose = purposeOf(s, info || null);
    if (info === null) return `<div class="about"><b>${esc(purpose)}</b><span class="muted">Loading owner and launch details…</span></div>`;
    if (!info) return `<div class="about"><b>${esc(purpose)}</b></div>`;
    const yr = new Date().getFullYear(), ld = info.LAUNCH_DATE ? new Date(info.LAUNCH_DATE + 'T12:00:00Z') : null;
    const age = ld ? yr - ld.getUTCFullYear() : null;
    const rcs = parseFloat(info.RCS), size = isFinite(rcs) ? (rcs >= 1 ? 'Large' : rcs >= 0.1 ? 'Medium' : 'Small') + ' (radar size ' + (rcs >= 10 ? Math.round(rcs) : rcs.toFixed(2)) + ' m²)' : '';
    const rows = [
      ['Owner', OWNERS[info.OWNER] || info.OWNER || '—'],
      ['Launched', ld ? ld.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) + (age ? ' · ' + age + ' yr ago' : '') : '—'],
      ['From', SITES[info.LAUNCH_SITE] || info.LAUNCH_SITE || '—'],
      ['Status', STATUS[info.OPS_STATUS_CODE] || (info.OBJECT_TYPE === 'PAY' ? 'Unknown' : 'Not a working satellite')]
    ];
    if (size) rows.push(['Size', size]);
    return `<div class="about"><b>${esc(purpose)}</b>${rows.map(r => `<div class="kv"><span>${r[0]}</span><span>${esc(r[1])}</span></div>`).join('')}</div>`;
  }

  // ---------- who is aboard the stations ----------
  let CREW = null, crewBusy = false;
  function stationKey(name) { name = String(name || ''); return /international/i.test(name) ? 25544 : /tiangong|tianhe|china/i.test(name) ? 48274 : 0; }
  function natOf(a) {
    if (!a) return '';
    if (Array.isArray(a.nationality)) return a.nationality.map(n => n.name || n.nationality_name || '').filter(Boolean).join(', ');
    return a.nationality || '';
  }
  async function loadCrew() {
    if (CREW || crewBusy) return; crewBusy = true;
    const out = {};
    const add = (id, p, exp) => { if (!id) return; (out[id] = out[id] || { exp, people: [] }).people.push(p); if (exp && !out[id].exp) out[id].exp = exp; };
    const now = Date.now();
    try {
      let data = await cachedJSON('crew22', 'https://ll.thespacedevs.com/2.2.0/expedition/?is_active=true&mode=detailed&limit=10&ordering=-start', 6 * 3600e3);
      if (!data || !data.results) data = await cachedJSON('crew23', 'https://ll.thespacedevs.com/2.3.0/expeditions/?is_active=true&mode=detailed&limit=10&ordering=-start', 6 * 3600e3);
      for (const ex of (data && data.results) || []) {
        const st = new Date(ex.start).getTime(), en = ex.end ? new Date(ex.end).getTime() : Infinity;
        if (!(st <= now && en > now)) continue;
        const sid = stationKey(ex.spacestation && ex.spacestation.name);
        for (const c of ex.crew || []) {
          const a = c.astronaut || {};
          add(sid, { name: a.name, country: natOf(a), agency: (a.agency && (a.agency.abbrev || a.agency.name)) || '', role: (c.role && c.role.role) || '', launched: a.last_flight ? new Date(a.last_flight).getTime() : st }, ex.name);
        }
      }
    } catch (e) { /* fall through */ }
    if (!Object.keys(out).length) {
      try {
        const j = await cachedJSON('crewcq', 'https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json', 6 * 3600e3);
        for (const p of (j && j.people) || []) {
          const sid = p.iss ? 25544 : /shenzhou|tiangong/i.test(p.spacecraft || '') ? 48274 : 0;
          add(sid, { name: p.name, country: p.country || '', agency: p.agency || '', role: p.position || '', launched: p.launched ? p.launched * 1000 : 0 }, sid === 25544 ? (j.iss_expedition ? 'Expedition ' + j.iss_expedition : '') : '');
        }
      } catch (e) { /* none */ }
    }
    CREW = out; crewBusy = false; cardFor = null;
  }
  function crewHTML(id) {
    if (!CREW) { loadCrew(); return '<div class="about"><span class="muted">Checking who is aboard…</span></div>'; }
    const c = CREW[id];
    if (!c || !c.people.length) return '<div class="about"><span class="muted">Crew list unavailable right now.</span></div>';
    const now = Date.now();
    return `<div class="about"><div class="sec-label" style="margin:0">${c.people.length} aboard now${c.exp ? ' · ' + esc(c.exp) : ''}</div>${c.people.map(p => {
      const days = p.launched ? Math.max(0, Math.floor((now - p.launched) / 864e5)) : null;
      return `<div class="crew"><div><b>${esc(p.name || 'Unknown')}</b><span>${esc([p.role, p.agency].filter(Boolean).join(' · '))}</span></div><div class="mono"><span>${esc(p.country || '')}</span><span>${days != null ? days + ' DAYS UP' : ''}</span></div></div>`;
    }).join('')}</div>`;
  }

  // ---------- spotter log ----------
  const LOG = { list: ls.get('log', []) };
  const BADGES = [
    ['first', 'First sighting', 'Log anything you have seen'], ['iss', 'Saw the ISS', ''], ['css', 'Saw Tiangong', ''], ['hst', 'Saw Hubble', ''],
    ['train', 'Starlink train', 'Spot a fresh Starlink still climbing'], ['ten', '10 satellites', ''], ['fifty', '50 satellites', ''], ['hundred', '100 satellites', ''],
    ['night3', '3 nights in a row', ''], ['deep', 'Deep-sky hunter', 'Log a galaxy, nebula or cluster'], ['planet', 'Planet spotter', 'Log a planet'], ['meteor', 'Meteor catcher', 'Auto-catch a meteor']
  ];
  const nightOf = t => { const d = new Date(t - 12 * 3600e3); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  function logStats() {
    const L = LOG.list, sats = new Set(L.filter(e => e.k === 'sat').map(e => e.id));
    const nights = [...new Set(L.map(e => nightOf(e.t)))].map(n => new Date(n + 'T12:00:00').getTime()).sort((a, b) => a - b);
    let streak = nights.length ? 1 : 0, best = streak;
    for (let i = 1; i < nights.length; i++) { streak = Math.round((nights[i] - nights[i - 1]) / 864e5) === 1 ? streak + 1 : 1; best = Math.max(best, streak); }
    const has = id => L.some(e => e.k === 'sat' && e.id === id);
    const earned = new Set();
    if (L.length) earned.add('first');
    if (has(25544)) earned.add('iss'); if (has(48274)) earned.add('css'); if (has(20580)) earned.add('hst');
    if (L.some(e => e.train)) earned.add('train');
    if (sats.size >= 10) earned.add('ten'); if (sats.size >= 50) earned.add('fifty'); if (sats.size >= 100) earned.add('hundred');
    if (best >= 3) earned.add('night3');
    if (L.some(e => e.k === 'dso')) earned.add('deep'); if (L.some(e => e.k === 'planet')) earned.add('planet'); if (L.some(e => e.k === 'meteor')) earned.add('meteor');
    return { sats: sats.size, total: L.length, nights: nights.length, best, earned };
  }
  function logSeen(o, extra) {
    if (o.kind === 'sat') {
      const v = o.v && satDir(o, Date.now());
      if (!v || altOf(v) < 0) { toast((SPECIAL[o.id] || o.name) + ' is below your horizon right now, so it can’t be seen. Log it during a pass.'); return; }
      if (!o.lit) { toast((SPECIAL[o.id] || o.name) + ' is in Earth’s shadow right now, so it’s dark. Log it when it’s sunlit.'); return; }
    } else if (o.v && altOf(o.v) < 0) { toast(o.name + ' is below your horizon right now.'); return; }
    if (S.offset !== 0 || S.rate !== 1) { toast('Go back to LIVE time to log a sighting.'); return; }
    const before = logStats().earned;
    const e = Object.assign({ t: Date.now(), k: o.kind, id: o.kind === 'sat' ? o.id : o.name, name: o.kind === 'sat' ? (SPECIAL[o.id] || o.name) : (o.kind === 'dso' ? dsoLabel(o) : o.name) }, extra || {});
    if (o.kind === 'sat') { e.mag = o.mag < 50 ? +o.mag.toFixed(1) : null; e.train = o.groups.has('starlink') && o.meanAlt < 430; const v = o.v && satDir(o, Date.now()); e.alt = v ? Math.round(altOf(v)) : null; }
    const dup = LOG.list.find(x => x.k === e.k && x.id === e.id && Math.abs(x.t - e.t) < 20 * 60e3);
    if (dup) { toast('Already logged ' + e.name + ' this pass.'); return; }
    LOG.list.push(e); ls.set('log', LOG.list);
    const after = logStats().earned, fresh = BADGES.filter(b => after.has(b[0]) && !before.has(b[0]));
    try { navigator.vibrate && navigator.vibrate(fresh.length ? [40, 60, 40, 60, 120] : 40); } catch (er) { /* ignore */ }
    toast(fresh.length ? 'Logged ' + e.name + '. New badge: ' + fresh.map(b => b[1]).join(', ') + '!' : 'Logged ' + e.name + '. ' + logStats().sats + ' different satellites seen so far.', 4000);
    cardFor = null;
  }
  function buildLog() {
    const st = logStats(), L = LOG.list.slice().sort((a, b) => b.t - a.t);
    $('#logPane').innerHTML = `<div class="conds"><div><span>SATELLITES</span><span>${st.sats}</span></div><div><span>SIGHTINGS</span><span>${st.total}</span></div><div><span>NIGHTS</span><span>${st.nights}</span></div><div><span>BEST RUN</span><span>${st.best}</span></div></div>
      <div class="sec-label">Badges · ${st.earned.size}/${BADGES.length}</div>
      <div class="badges">${BADGES.map(b => `<div class="badge${st.earned.has(b[0]) ? ' on' : ''}"><b>${esc(b[1])}</b>${b[2] ? `<span>${esc(b[2])}</span>` : ''}</div>`).join('')}</div>
      <div class="sec-label">Sightings</div>
      ${L.length ? '<div class="list">' + L.slice(0, 80).map(e => `<div class="li"><div class="grow"><span class="t">${esc(e.name)}</span><span class="s mono">${esc(new Date(e.t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).toUpperCase())}${e.alt != null ? ' · ' + e.alt + '° UP' : ''}${e.mag != null ? ' · MAG ' + e.mag : ''}</span></div><span class="n">${esc((e.k === 'dso' ? 'DEEP SKY' : e.k).toUpperCase())}</span></div>`).join('') + '</div>'
        : '<p class="muted">Nothing logged yet. In camera view, when a sunlit satellite crosses the middle of the screen, Sky Watch buzzes and asks "Seen it?". Tap to log it. You can also tap "Seen it" on any card.</p>'}`;
  }

  // ---------- haptic pings and "Seen it?" prompts ----------
  const PING = { at: 0, last: new Map(), seenFor: null, seenAt: 0 };
  function centerEvents(near, sunAlt) {
    const now = performance.now();
    // near: on-screen satellites close to the centre, nearest first
    if (S.mode !== 'ar' || S.f.haptics === 'off' || S.dragging) return;
    for (const c of near) {
      const vis = c.s.lit && sunAlt < -4 && c.s.mag < 5.5;
      if (S.f.haptics === 'visible' && !vis) continue;
      if (c.d > FOC * Math.tan(2 * D2R)) continue;
      const lt = PING.last.get(c.s.id) || 0;
      if (now - lt < 15000 || now - PING.at < 400) continue;
      PING.last.set(c.s.id, now); PING.at = now;
      try { navigator.vibrate && navigator.vibrate(vis ? 18 : 8); } catch (e) { /* ignore */ }
      if (vis && PING.seenFor !== c.s.id) showSeen(c.s);
      break;
    }
  }
  function showSeen(s) {
    PING.seenFor = s.id; PING.seenAt = performance.now();
    const b = $('#seenPill'); b.hidden = false;
    $('#seenText').textContent = 'Seen ' + (SPECIAL[s.id] || prettyName(s.name)) + '? Tap to log';
    b.onclick = () => { logSeen(s); b.hidden = true; };
    clearTimeout(PING.hideT); PING.hideT = setTimeout(() => { b.hidden = true; PING.seenFor = null; }, 7000);
  }

  // ---------- ISS (and Tiangong) crossing the Moon or Sun ----------
  function bodyDir(name, date) {
    const lst = gmst(date) + S.obs.lon * D2R;
    if (name === 'Sun') { const su = sunEci(date); return refract(eqToEnu(su.ra, su.dec, lst, S.obs)); }
    const A = window.Astronomy, ob = new A.Observer(S.obs.lat, S.obs.lon, S.obs.hKm * 1000);
    const eq = A.Equator('Moon', date, ob, true, true), hz = A.Horizon(date, ob, eq.ra, eq.dec, 'normal');
    return vecAA(hz.azimuth, hz.altitude);
  }
  let transitCache = null;
  async function findTransits(days) {
    if (transitCache && Date.now() - transitCache.t < 3600e3 && transitCache.lat === S.obs.lat) return transitCache.list;
    const out = [];
    for (const id of [25544, 48274]) {
      const s = Sats.byId.get(id); if (!s) continue;
      const passes = await findPasses(s, new Date(), days * 24, { max: 400 });
      let n = 0;
      for (const p of passes) {
        if (p.maxEl < 12) continue;
        const t0 = p.start - 150e3, t1 = p.end + 150e3, mid = new Date(p.maxT);
        for (const body of ['Sun', 'Moon']) {
          if (body === 'Moon' && !S.libs.astro) continue;
          const bv0 = bodyDir(body, new Date(t0)), bv1 = bodyDir(body, new Date(t1));
          if (altOf(bodyDir(body, mid)) < 4) continue;
          let best = null;
          for (let t = t0; t <= t1; t += 2000) {
            const k = (t - t0) / (t1 - t0), bv = [bv0[0] + (bv1[0] - bv0[0]) * k, bv0[1] + (bv1[1] - bv0[1]) * k, bv0[2] + (bv1[2] - bv0[2]) * k];
            const st = satState(s, epochCtx(new Date(t))); if (!st) continue;
            const sv = refract([st.E, st.N, st.U]), bn = Math.hypot(...bv), sn = Math.hypot(...sv);
            const sep = Math.acos(clamp((sv[0] * bv[0] + sv[1] * bv[1] + sv[2] * bv[2]) / bn / sn, -1, 1)) * R2D;
            if (!best || sep < best.sep) best = { t, sep, el: altOf(sv), range: st.r, sv };
          }
          if (!best || best.sep > 3) continue;
          // refine to a tenth of a second and measure how fast it moves across the sky
          let fine = best;
          for (let t = best.t - 2500; t <= best.t + 2500; t += 100) {
            const k = (t - t0) / (t1 - t0), bv = [bv0[0] + (bv1[0] - bv0[0]) * k, bv0[1] + (bv1[1] - bv0[1]) * k, bv0[2] + (bv1[2] - bv0[2]) * k];
            const st = satState(s, epochCtx(new Date(t))); if (!st) continue;
            const sv = refract([st.E, st.N, st.U]), sep = Math.acos(clamp((sv[0] * bv[0] + sv[1] * bv[1] + sv[2] * bv[2]) / Math.hypot(...bv) / Math.hypot(...sv), -1, 1)) * R2D;
            if (sep < fine.sep) fine = { t, sep, el: altOf(sv), range: st.r, sv };
          }
          const a = satState(s, epochCtx(new Date(fine.t - 500))), b = satState(s, epochCtx(new Date(fine.t + 500)));
          const speed = a && b ? Math.acos(clamp(a.E * b.E + a.N * b.N + a.U * b.U, -1, 1)) * R2D : 1;
          out.push({ s, body, t: fine.t, sep: fine.sep, el: fine.el, range: fine.range, dur: 0.52 / Math.max(speed, 0.01), dist: fine.sep * D2R * fine.range / Math.max(Math.sin(Math.max(fine.el, 10) * D2R), 0.17), az: azOf(fine.sv) });
        }
        if (++n % 5 === 0) await sleep(0);
      }
    }
    out.sort((x, y) => x.sep - y.sep);
    transitCache = { t: Date.now(), lat: S.obs.lat, list: out };
    return out;
  }

  // ---------- cloud forecast (Open-Meteo) ----------
  async function cloudForecast() {
    const o = S.obs, key = 'clouds:' + o.lat.toFixed(1) + ',' + o.lon.toFixed(1);
    const j = await cachedJSON(key, 'https://api.open-meteo.com/v1/forecast?latitude=' + o.lat.toFixed(2) + '&longitude=' + o.lon.toFixed(2) + '&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high&forecast_days=3&timezone=auto', 3600e3);
    if (!j || !j.hourly || !j.hourly.time) return null;
    const off = (j.utc_offset_seconds || 0) * 1000;
    return j.hourly.time.map((tt, i) => ({ t: Date.parse(tt + ':00Z') - off, c: j.hourly.cloud_cover[i], low: (j.hourly.cloud_cover_low || [])[i], high: (j.hourly.cloud_cover_high || [])[i] }));
  }
  function cloudAt(cf, t) { if (!cf) return null; let b = null; for (const h of cf) if (!b || Math.abs(h.t - t) < Math.abs(b.t - t)) b = h; return b && Math.abs(b.t - t) < 2 * 3600e3 ? b.c : null; }
  function cloudHTML(cf) {
    if (!cf) return '<p class="muted">Cloud forecast unavailable right now.</p>';
    const now = Date.now(), hrs = cf.filter(h => h.t >= now - 3600e3).slice(0, 24);
    const dark = h => sunAltAt(new Date(h.t + 1800e3), S.obs) < -6;
    // tonight's clear window
    const night = hrs.filter(dark); let win = null, cur = null;
    for (const h of night) { if (h.c < 30) { if (!cur) cur = { a: h.t, b: h.t }; else if (h.t - cur.b <= 3600e3) cur.b = h.t; else { if (!win || cur.b - cur.a > win.b - win.a) win = cur; cur = { a: h.t, b: h.t }; } } else { if (cur && (!win || cur.b - cur.a > win.b - win.a)) win = cur; cur = null; } }
    if (cur && (!win || cur.b - cur.a > win.b - win.a)) win = cur;
    let sum;
    if (win) sum = win.b === win.a ? 'Clearest around ' + tfmt(new Date(win.a)) : 'Clear from ' + tfmt(new Date(win.a)) + ' to ' + tfmt(new Date(win.b + 3600e3));
    else if (night.length) { const m = night.reduce((x, y) => y.c < x.c ? y : x); sum = m.c > 80 ? 'Cloudy all night' : 'Best chance around ' + tfmt(new Date(m.t)) + ' (' + Math.round(m.c) + '% cloud)'; }
    else sum = 'No dark hours in the next day';
    const bars = hrs.map((h, i) => {
      const c = Math.round(h.c), col = c < 30 ? 'var(--good)' : c < 65 ? 'var(--warn)' : 'var(--dim)', d = new Date(h.t);
      return `<div class="cb${dark(h) ? ' night' : ''}" title="${tfmt(d)}: ${c}% cloud"><i style="height:${Math.max(4, c)}%;background:${col}"></i>${i % 3 === 0 ? `<span>${d.toLocaleTimeString([], Object.assign({ hour: 'numeric' }, H12())).replace(' ', '').toLowerCase()}</span>` : ''}</div>`;
    }).join('');
    return `<div class="hero" style="gap:8px"><div class="row" style="justify-content:space-between"><b style="font:700 16px var(--display)">${esc(sum)}</b><span class="mono" style="font-size:10px;color:var(--dim)">NOW ${Math.round(hrs[0] ? hrs[0].c : 0)}%</span></div><div class="cbars" role="img" aria-label="Cloud cover for the next 24 hours">${bars}</div><div class="mono" style="font-size:9.5px;color:var(--dim)">BAR HEIGHT = % OF SKY COVERED · SHADED = DARK HOURS · OPEN-METEO</div></div>`;
  }

  // ---------- calendar reminders (work even when the app is closed) ----------
  const icsDate = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const icsEsc = s => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
  function saveICS(file, title, start, end, desc, alarmMin) {
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sky Watch//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:' + start + '-' + Math.random().toString(36).slice(2) + '@skywatch', 'DTSTAMP:' + icsDate(Date.now()),
      'DTSTART:' + icsDate(start), 'DTEND:' + icsDate(end), 'SUMMARY:' + icsEsc(title), 'DESCRIPTION:' + icsEsc(desc),
      'BEGIN:VALARM', 'TRIGGER:-PT' + alarmMin + 'M', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(title), 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const a = document.createElement('a'); a.href = url; a.download = file + '.ics'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('Calendar event created. Add it, and your phone will remind you even with Sky Watch closed.', 4500);
  }
  function passToCalendar(s, p) {
    if (!p || p === 'none') return;
    const nm = SPECIAL[s.id] || s.name;
    saveICS(nm.replace(/\W+/g, '-').toLowerCase() + '-pass', nm + ' flyover (' + Math.round(p.maxEl) + '° high)', p.vStart, Math.max(p.vEnd, p.vStart + 60e3),
      `Look ${cardinal(p.vStartAz)}. It rises in the ${cardinal(p.vStartAz)}, climbs to ${Math.round(p.maxEl)}° at ${tfmt(new Date(p.maxT))}, and sets in the ${cardinal(p.vEndAz)}. Brightness about magnitude ${p.mag.toFixed(1)}. Open Sky Watch to follow it.`, 3);
  }
  function showerToCalendar(f) {
    if (!f) return;
    const pk = new Date(f.peak); pk.setHours(22, 0, 0, 0);
    saveICS(f.name.replace(/\W+/g, '-').toLowerCase() + '-peak', f.name + ' meteor shower peak', pk.getTime(), pk.getTime() + 7 * 3600e3,
      `Up to ~${f.zhr} meteors an hour under a dark sky. Get away from lights, let your eyes adjust for 20 minutes, and look about 45° away from the radiant. Open Sky Watch's meteor mode to find it.`, 30);
  }

