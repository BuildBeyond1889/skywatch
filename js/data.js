/* Sky Watch · data.js · Satellites (CelesTrak + SGP4), filters, passes, stars, planets, Moon, meteor showers.
   All app files share one global scope and must load in order: core, data, view, render, cards, sensing, ui, main. */
'use strict';
  // ---------- satellites ----------
  const Sats = { list: [], byId: new Map(), active: [], cursor: 0, age: {}, status: {}, prio: [] };
  function parseTLE(text, gid) {
    const lines = text.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(Boolean);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const l1 = lines[i];
      if (l1[0] === '1' && lines[i + 1] && lines[i + 1][0] === '2') {
        const name = i > 0 && lines[i - 1][0] !== '1' && lines[i - 1][0] !== '2' ? lines[i - 1].trim() : 'NORAD ' + l1.slice(2, 7).trim();
        out.push(makeSat(name.replace(/^0 /, ''), l1, lines[i + 1], gid));
        i++;
      }
    }
    return out.filter(Boolean);
  }
  function makeSat(name, l1, l2, gid) {
    const id = parseInt(l1.slice(2, 7), 10);
    if (!id) return null;
    const yy = parseInt(l1.slice(18, 20), 10), doy = parseFloat(l1.slice(20, 32));
    const epoch = Date.UTC(yy < 57 ? 2000 + yy : 1900 + yy, 0, 1) + (doy - 1) * 864e5;
    const mm = parseFloat(l2.slice(52, 63)), ecc = parseFloat('0.' + l2.slice(26, 33).trim()), inc = parseFloat(l2.slice(8, 16));
    const a = Math.cbrt(398600.4418 / Math.pow(mm * 2 * Math.PI / 86400, 2));
    const intl = l1.slice(9, 17).trim();
    return { kind: 'sat', id, name, l1, l2, groups: new Set([gid]), prim: gid, intl, launch: intl.slice(0, 5), epoch, mm, ecc, inc,
      perigee: a * (1 - ecc) - 6378.137, apogee: a * (1 + ecc) - 6378.137, meanAlt: a - 6378.137, period: 1440 / mm,
      rec: null, v: null, rate: [0, 0, 0], ts: 0, jump: -1, ok: false, lit: false, mag: 99, range: 0, h: 0, spd: 0 };
  }
  function satRec(s) {
    if (s.rec === null) { try { s.rec = window.satellite.twoline2satrec(s.l1, s.l2); } catch (e) { s.rec = false; } }
    return s.rec;
  }
  function addSats(arr) {
    for (const s of arr) {
      const ex = Sats.byId.get(s.id);
      if (ex) {
        ex.groups.add(s.prim);
        if (GROUPS.findIndex(gr => gr.id === s.prim) < GROUPS.findIndex(gr => gr.id === ex.prim)) ex.prim = s.prim;
        if (s.epoch > ex.epoch) { ex.l1 = s.l1; ex.l2 = s.l2; ex.epoch = s.epoch; ex.rec = null; ex.mm = s.mm; ex.perigee = s.perigee; ex.apogee = s.apogee; ex.meanAlt = s.meanAlt; }
      } else { Sats.byId.set(s.id, s); Sats.list.push(s); }
    }
  }
  const TLE_TTL = 4 * 3600e3;
  async function loadGroup(gid, force) {
    if (Sats.status[gid] === 'loading') return;
    Sats.status[gid] = 'loading'; renderGroupList();
    const key = 'tle:' + gid;
    const cached = await idb.get(key);
    let text = null, t = 0;
    if (cached && !force && Date.now() - cached.t < TLE_TTL) { text = cached.text; t = cached.t; }
    else {
      try {
        const r = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=' + encodeURIComponent(gid) + '&FORMAT=tle', { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const body = await r.text();
        if (!/^1 /m.test(body)) throw new Error('no data');
        text = body; t = Date.now();
        if (gid === 'stations') await checkReboost(body);
        idb.set(key, { t, text });
      } catch (e) {
        if (cached) { text = cached.text; t = cached.t; }
      }
    }
    if (!text) { Sats.status[gid] = 'error'; renderGroupList(); setStatus(); return; }
    const arr = parseTLE(text, gid);
    addSats(arr);
    Sats.age[gid] = t; Sats.status[gid] = arr.length;
    rebuildActive(); renderGroupList(); setStatus(); renderChips();
    loadSatcatGroup(gid);
  }
  async function loadEnabledGroups() {
    const ids = GROUPS.filter(gr => S.f.groups[gr.id]).map(gr => gr.id);
    if (!ids.includes('stations')) ids.unshift('stations');
    // stations first so the ISS shows up fast; others in parallel after
    await loadGroup(ids[0]);
    await Promise.all(ids.slice(1).map(id => loadGroup(id)));
  }
  function setStatus() {
    const n = Sats.list.length;
    const el = $('#startStatus');
    if (!el) return;
    if (!S.libs.sat) el.textContent = 'Loading orbit math…';
    else if (n) el.textContent = fmt(n) + ' satellites loaded · ready';
    else if (Object.values(Sats.status).includes('error')) el.textContent = 'Could not reach CelesTrak. Check your connection.';
  }
  async function checkReboost(text) {
    try {
      const prev = (await idb.get('stationsPrev')) || {};
      const now = {};
      for (const s of parseTLE(text, 'stations')) now[s.id] = { alt: s.meanAlt, epoch: s.epoch, name: s.name };
      for (const id of [25544, 48274]) {
        const a = prev[id], b = now[id];
        if (a && b && b.epoch > a.epoch && Math.abs(b.alt - a.alt) > 0.6) {
          S.events.push({ type: 'maneuver', id, name: SPECIAL[id], delta: b.alt - a.alt, t: b.epoch });
        }
      }
      idb.set('stationsPrev', now);
    } catch (e) { /* ignore */ }
  }
  function passGroup(s) {
    if (S.pinned.has(s.id) || s === S.sel || (S.family && s.launch === S.family.key)) return true;
    const pr = S.preset;
    if (pr === 'stations') return s.groups.has('stations');
    if (pr === 'starlink') return s.groups.has('starlink');
    if (pr === 'new') return s.groups.has('last-30-days');
    for (const gid of s.groups) if (S.f.groups[gid]) return true;
    return false;
  }
  const COUNTRY_SETS = { us: ['US'], china: ['PRC'], russia: ['CIS'], europe: ['ESA', 'FR', 'GER', 'IT', 'UK', 'EUME', 'EUTE', 'SES', 'SPN', 'NETH', 'LUXE', 'ASRA', 'BEL', 'DEN', 'FIN', 'SWED', 'NOR', 'POL'] };
  function ownerOf(s) {
    if (s.owner) return s.owner;
    if (s.groups.has('starlink') || s.groups.has('kuiper')) return 'US';
    if (s.groups.has('oneweb')) return 'UK';
    const n = s.name.toUpperCase();
    if (/^BEIDOU|^YAOGAN|^SHIYAN|^TIANHE|^CSS|^SHENZHOU|^TIANZHOU|^FENGYUN|^GAOFEN|^CZ-/.test(n)) return 'PRC';
    if (/^COSMOS|^GLONASS|^SOYUZ|^PROGRESS|^METEOR-M|^SL-/.test(n)) return 'CIS';
    if (/^GSAT0|^GALILEO|^SENTINEL|^METOP|^METEOSAT/.test(n)) return 'ESA';
    if (/^NAVSTAR|^GPS|^USA |^NOAA|^GOES|^STARLINK|^IRIDIUM|^TDRS/.test(n)) return 'US';
    return '';
  }
  function typeOf(s) { if (s.otype) return s.otype; const n = s.name.toUpperCase(); return / DEB/.test(n) ? 'DEB' : / R\/B/.test(n) ? 'R/B' : 'PAY'; }
  function passCountryType(s) {
    const c = S.f.country || 'all', ty = S.f.otype || 'all';
    if (c !== 'all') { const o = ownerOf(s); if (c === 'other' ? (!o || Object.values(COUNTRY_SETS).some(a => a.includes(o))) : !(COUNTRY_SETS[c] || []).includes(o)) return false; }
    if (ty !== 'all') { const t = typeOf(s); if (ty === 'pay' ? t !== 'PAY' : ty === 'rb' ? t !== 'R/B' : t !== 'DEB') return false; }
    return true;
  }
  // Bulk catalog data (owner, type, radar size) for the non-megaconstellation groups, cached a week.
  async function loadSatcatGroup(gid) {
    if (/^(starlink|oneweb|kuiper)$/.test(gid)) return;
    const key = 'satcatg:' + gid; let rows = null;
    const c = await idb.get(key);
    if (c && Date.now() - c.t < 7 * 864e5) rows = c.rows;
    else {
      try {
        const r = await fetch('https://celestrak.org/satcat/records.php?GROUP=' + encodeURIComponent(gid) + '&FORMAT=CSV');
        const txt = await r.text(), lines = txt.trim().split(/\r?\n/), hd = lines.shift().split(',');
        const iN = hd.indexOf('NORAD_CAT_ID'), iO = hd.indexOf('OWNER'), iT = hd.indexOf('OBJECT_TYPE'), iR = hd.indexOf('RCS');
        if (iN < 0) throw new Error('bad');
        rows = lines.map(l => { const f = l.split(','); return [+f[iN], f[iO], f[iT], parseFloat(f[iR])]; });
        idb.set(key, { t: Date.now(), rows });
      } catch (e) { rows = c ? c.rows : null; }
    }
    if (!rows) return;
    for (const [id, o, t, rcs] of rows) { const s = Sats.byId.get(id); if (s) { s.owner = o; s.otype = t; if (isFinite(rcs)) s.rcs = rcs; } }
    rebuildActive();
  }
  function passFilter(s) {
    if (s.rec === false) return false;
    if (!passGroup(s)) return false;
    if (!(S.pinned.has(s.id) || s === S.sel) && !passCountryType(s)) return false;
    if (S.pinned.has(s.id) || s === S.sel || (S.family && s.launch === S.family.key)) return true;
    const lo = H_STEPS[S.f.hMin], hi = H_STEPS[S.f.hMax];
    return s.meanAlt >= lo && s.meanAlt <= hi;
  }
  function rebuildActive() {
    Sats.active = Sats.list.filter(passFilter);
    Sats.cursor = 0;
    const pr = Sats.list.filter(s => SPECIAL[s.id] && passGroup(s));
    Sats.prio = pr;
  }

  // Satellite state at a moment: ENU unit direction, range, sunlit, estimated brightness.
  function epochCtx(date) {
    const gm = gmst(date), sun = sunEci(date), o = S.obs, cg = Math.cos(gm), sg = Math.sin(gm);
    return { date, gm, cg, sg, sun, ox: o.x * cg - o.y * sg, oy: o.x * sg + o.y * cg, oz: o.z, sunAlt: altOf(eqToEnu(sun.ra, sun.dec, gm + o.lon * D2R, o)) };
  }
  function satState(s, ctx) {
    const rec = satRec(s); if (!rec) return null;
    let pv;
    try { pv = window.satellite.propagate(rec, ctx.date); } catch (e) { return null; }
    const p = pv && pv.position;
    if (!p || typeof p !== 'object' || !isFinite(p.x)) return null;
    const o = S.obs, cg = ctx.cg, sg = ctx.sg;
    const xf = p.x * cg + p.y * sg, yf = -p.x * sg + p.y * cg, zf = p.z;
    const dx = xf - o.x, dy = yf - o.y, dz = zf - o.z;
    const E = -o.sl * dx + o.cl * dy;
    const N = -o.sp * o.cl * dx - o.sp * o.sl * dy + o.cp * dz;
    const U = o.cp * o.cl * dx + o.cp * o.sl * dy + o.sp * dz;
    const r = Math.hypot(dx, dy, dz), rr = Math.hypot(p.x, p.y, p.z);
    const sun = ctx.sun, dot = p.x * sun.x + p.y * sun.y + p.z * sun.z;
    let lit = true;
    if (dot < 0) { const px = p.x - dot * sun.x, py = p.y - dot * sun.y, pz = p.z - dot * sun.z; if (Math.hypot(px, py, pz) < 6371) lit = false; }
    let mag = 99;
    if (lit) {
      const ox = ctx.ox - p.x, oy = ctx.oy - p.y, oz = ctx.oz - p.z, on = Math.hypot(ox, oy, oz);
      const cb = clamp((ox * sun.x + oy * sun.y + oz * sun.z) / on, -1, 1), b = Math.acos(cb);
      const F = Math.max(1e-3, (Math.sin(b) + (Math.PI - b) * cb) / Math.PI);
      const std = (GBY.get(s.prim) || { std: 6 }).std + (s.id === 25544 ? -1.3 : s.id === 20580 ? -2 : 0);
      mag = std + 5 * Math.log10(r / 1000) - 2.5 * Math.log10(F / 0.3183);
    }
    const v = pv.velocity;
    return { E: E / r, N: N / r, U: U / r, r, lit, mag, h: rr - 6371, spd: v ? Math.hypot(v.x, v.y, v.z) : 0 };
  }
  function computeSat(s, ctx) {
    const st = satState(s, ctx);
    if (!st) { s.ok = false; return; }
    const t = ctx.date.getTime();
    if (s.jump === S.jump && s.v && Math.abs(t - s.ts) > 150 && Math.abs(t - s.ts) < 6000 * Math.max(1, Math.abs(S.rate))) {
      const dt = (t - s.ts) / 1000;
      s.rate = [(st.E - s.v[0]) / dt, (st.N - s.v[1]) / dt, (st.U - s.v[2]) / dt];
    } else if (s.jump !== S.jump) s.rate = [0, 0, 0];
    s.v = [st.E, st.N, st.U]; s.ts = t; s.jump = S.jump; s.ok = true;
    s.lit = st.lit; s.mag = st.mag; s.range = st.r; s.h = st.h; s.spd = st.spd;
  }
  function satDir(s, t) {
    const lim = 8 * Math.max(1, Math.abs(S.rate)), k = clamp((t - s.ts) / 1000, -lim, lim);
    return [s.v[0] + s.rate[0] * k, s.v[1] + s.rate[1] * k, s.v[2] + s.rate[2] * k];
  }
  function updateSats(now, budget) {
    if (!S.libs.sat || !S.obs) return;
    const ctx = epochCtx(now);
    S.ctx = ctx;
    for (const s of Sats.prio) computeSat(s, ctx);
    if (S.sel && S.sel.kind === 'sat') computeSat(S.sel, ctx);
    const A = Sats.active; if (!A.length) return;
    const t0 = performance.now(); let n = 0;
    while (n < A.length) {
      computeSat(A[Sats.cursor], ctx);
      Sats.cursor = (Sats.cursor + 1) % A.length; n++;
      if ((n & 31) === 0 && performance.now() - t0 > budget) break;
    }
  }
  // Trails: past and predicted path for a handful of objects.
  const trails = new Map();
  let trailsAt = 0;
  function updateTrails(now, ids) {
    if (!S.libs.sat) return;
    const t = now.getTime();
    if (t - trailsAt < 2000 && Math.abs(t - trailsAt) < 60000) return;
    trailsAt = t; trails.clear();
    for (const s of ids) {
      const pts = [];
      for (let k = -150; k <= 300; k += 10) {
        const st = satState(s, epochCtx(new Date(t + k * 1000)));
        if (st) pts.push({ k, v: [st.E, st.N, st.U], lit: st.lit });
      }
      trails.set(s.id, pts);
    }
  }

  // Pass prediction: scan ahead in 30-second steps.
  async function findPasses(s, start, hours, opts) {
    opts = opts || {};
    const out = [], step = 30e3, end = start.getTime() + hours * 3600e3;
    let cur = null, n = 0;
    for (let t = start.getTime(); t < end; t += step) {
      const ctx = epochCtx(new Date(t));
      const st = satState(s, ctx);
      if (!st) break;
      const el = Math.asin(clamp(st.U, -1, 1)) * R2D;
      const vis = el > 10 && st.lit && ctx.sunAlt < -6;
      if (el > 10) {
        if (!cur) cur = { start: t, end: t, maxEl: el, maxT: t, startAz: azOf([st.E, st.N]), endAz: 0, vis: false, vStart: 0, vEnd: 0, mag: 99 };
        cur.end = t; cur.endAz = azOf([st.E, st.N]);
        if (el > cur.maxEl) { cur.maxEl = el; cur.maxT = t; }
        if (vis) { cur.vis = true; if (!cur.vStart) { cur.vStart = t; cur.vStartAz = azOf([st.E, st.N]); } cur.vEnd = t; cur.vEndAz = azOf([st.E, st.N]); cur.mag = Math.min(cur.mag, st.mag); }
      } else if (cur) {
        if (!opts.visibleOnly || cur.vis) out.push(cur);
        cur = null;
        if (out.length >= (opts.max || 3)) break;
      }
      if (++n % 300 === 0) await sleep(0);
    }
    return out;
  }

  // Proper motion of bright stars, milliarcseconds a year (RA·cos Dec, Dec). Over thousands of years these visibly reshape constellations.
  const STAR_PM = { Arcturus: [-1093.4, -1999.4], Sirius: [-546.0, -1223.1], Procyon: [-716.6, -1034.6], 'Rigil Kentaurus': [-3679.3, 473.7], Vega: [200.9, 286.2], Altair: [536.2, 385.3], Aldebaran: [63.5, -188.9], Pollux: [-626.6, -45.8], Capella: [75.5, -427.1], Rigel: [1.3, 0.5], Betelgeuse: [27.5, 11.3], Polaris: [44.5, -11.9], Spica: [-42.5, -31.7], Antares: [-12.1, -23.3], Fomalhaut: [329.2, -164.2], Deneb: [2.0, 1.6], Regulus: [-248.7, 5.6], Achernar: [88.0, -40.1], Canopus: [19.9, 23.2], Castor: [-191.5, -145.2], Thuban: [-56.5, 17.2], Kochab: [-32.3, 12.0], Dubhe: [-134.1, -34.7], Merak: [81.4, 33.5], Phecda: [107.8, 11.2], Megrez: [103.6, 7.8], Alioth: [111.7, -8.2], Mizar: [121.2, -22.0], Alkaid: [-121.2, -15.0], Bellatrix: [-8.1, -13.0], Denebola: [-497.7, -114.7], Mirfak: [24.1, -26.0], Hadar: [-33.3, -23.2], Acrux: [-35.8, -14.7], Mimosa: [-42.9, -16.2], Gacrux: [28.2, -265.1], Algol: [2.4, -1.4] };
  // ---------- sky bodies ----------
  function updateStars(now) {
    if (!S.obs) return;
    const lst = gmst(now) + S.obs.lon * D2R;
    if (!S.precessedFor || Math.abs(now - S.precessedFor) > 864e5 * 30) {
      const yrs = (now.getTime() - 946728000000) / 31557600000;
      for (const s of STARS.concat(DSOS)) {
        let rh = s.raH, dd = s.decD; const pm = STAR_PM[s.name];
        if (pm && s.kind === 'star') { dd += pm[1] * yrs / 3.6e6; rh += pm[0] * yrs / 3.6e6 / Math.max(Math.cos(s.decD * D2R), 0.05) / 15; }
        const p = precess(rh, dd, now); s.ra = p.ra; s.dec = p.dec;
      }
      for (const pb of PROBES) { const p = precess(pb.ra, pb.dec, now); pb.raP = p.ra; pb.decP = p.dec; }
      S.precessedFor = now.getTime();
    }
    for (const s of STARS) s.v = refract(eqToEnu(s.ra, s.dec, lst, S.obs));
    for (const c of CONST) { const v = [0, 0, 0]; for (const m of c.members) if (m.v) { v[0] += m.v[0]; v[1] += m.v[1]; v[2] += m.v[2]; } const n = Math.hypot(v[0], v[1], v[2]) || 1; c.v = v.map(x => x / n); }
    for (const d of DSOS) d.v = refract(eqToEnu(d.ra, d.dec, lst, S.obs));
    for (const pb of PROBES) pb.v = refract(eqToEnu(pb.raP, pb.decP, lst, S.obs));
    const su = sunEci(now);
    JWST.v = refract(eqToEnu(su.ra + Math.PI, -su.dec, lst, S.obs));
    SUN.v = refract(eqToEnu(su.ra, su.dec, lst, S.obs));
  }
  function updatePlanets(now) {
    if (!S.libs.astro || !S.obs) return;
    const A = window.Astronomy;
    try {
      const ob = new A.Observer(S.obs.lat, S.obs.lon, S.obs.hKm * 1000);
      for (const p of PLANETS) {
        const eq = A.Equator(p.name, now, ob, true, true);
        const hz = A.Horizon(now, ob, eq.ra, eq.dec, 'normal');
        p.v = vecAA(hz.azimuth, hz.altitude); p.dist = eq.dist;
        try { p.mag = A.Illumination(p.name, now).mag; } catch (e) { p.mag = 6; }
      }
      const eq = A.Equator('Moon', now, ob, true, true);
      const hz = A.Horizon(now, ob, eq.ra, eq.dec, 'normal');
      MOON.v = vecAA(hz.azimuth, hz.altitude); MOON.distKm = eq.dist * 149597870.7;
      const il = A.Illumination('Moon', now); MOON.frac = il.phase_fraction; MOON.mag = il.mag;
      MOON.phase = A.MoonPhase(now);
      const se = A.Equator('Sun', now, ob, true, true), sh = A.Horizon(now, ob, se.ra, se.dec, 'normal');
      SUN.v = vecAA(sh.azimuth, sh.altitude);
    } catch (e) { /* keep last values */ }
  }
  function moonPhaseName(ph) {
    const p = wrap360(ph);
    if (p < 10 || p >= 350) return 'New Moon';
    if (p < 80) return 'Waxing crescent';
    if (p < 100) return 'First quarter';
    if (p < 170) return 'Waxing gibbous';
    if (p < 190) return 'Full Moon';
    if (p < 260) return 'Waning gibbous';
    if (p < 280) return 'Last quarter';
    return 'Waning crescent';
  }
  function showerDates(sh, year) {
    const mk = (md, y) => new Date(y, md[0] - 1, md[1], 12);
    let start = mk(sh.start, year), peak = mk(sh.peak, year), end = mk(sh.end, year);
    if (end < start) { // wraps the new year
      if (peak < start) { start = mk(sh.start, year - 1); }
      else { end = mk(sh.end, year + 1); }
    }
    return { start, peak, end };
  }
  function activeShowers(now) {
    const out = [];
    for (const sh of SHOWERS) {
      for (const y of [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]) {
        const d = showerDates(sh, y);
        if (now >= d.start && now <= d.end) out.push({ ...sh, ...d });
      }
    }
    return out;
  }
  function nextShowers(now, n) {
    const list = [];
    for (const sh of SHOWERS) for (const y of [now.getFullYear(), now.getFullYear() + 1]) {
      const d = showerDates(sh, y);
      if (d.end > now) list.push({ ...sh, ...d });
    }
    return list.sort((a, b) => a.peak - b.peak).slice(0, n);
  }

