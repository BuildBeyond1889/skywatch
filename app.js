/* Sky Watch v1. Live AR sky tracker: satellites (CelesTrak + SGP4), stars, constellations, planets, Moon,
   meteor radiants, events. Everything runs in the browser; orbit data is cached for offline use. */
'use strict';
(function () {
  // ---------- utilities ----------
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const wrap360 = a => ((a % 360) + 360) % 360;
  const wrap180 = a => { a = wrap360(a); return a > 180 ? a - 360 : a; };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, d = 0) => Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const tfmt = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const dfmt = d => d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const CARD = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const cardinal = az => CARD[Math.round(wrap360(az) / 22.5) % 16];
  const ls = {
    get(k, d) { try { const v = localStorage.getItem('skywatch.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('skywatch.' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  };
  const idb = (() => {
    let p = null;
    function open() {
      if (p) return p;
      p = new Promise((res, rej) => {
        try {
          const r = indexedDB.open('skywatch', 1);
          r.onupgradeneeded = () => {
            const db = r.result;
            if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
            if (!db.objectStoreNames.contains('shots')) db.createObjectStore('shots', { keyPath: 'id' });
          };
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        } catch (e) { rej(e); }
      });
      return p;
    }
    function run(store, mode, fn) {
      return open().then(db => new Promise((res, rej) => {
        const t = db.transaction(store, mode);
        const rq = fn(t.objectStore(store));
        t.oncomplete = () => res(rq ? rq.result : undefined);
        t.onerror = t.onabort = () => rej(t.error);
      }));
    }
    return {
      get: k => run('kv', 'readonly', s => s.get(k)).catch(() => undefined),
      set: (k, v) => run('kv', 'readwrite', s => s.put(v, k)).catch(() => {}),
      shots: () => run('shots', 'readonly', s => s.getAll()).catch(() => []),
      addShot: o => run('shots', 'readwrite', s => s.put(o)).catch(() => {}),
      delShot: id => run('shots', 'readwrite', s => s.delete(id)).catch(() => {})
    };
  })();

  // ---------- matrices & quaternions (row-major 3x3) ----------
  function mmul(a, b) {
    return [
      a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
      a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
      a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8]
    ];
  }
  const mv = (a, v) => [a[0] * v[0] + a[1] * v[1] + a[2] * v[2], a[3] * v[0] + a[4] * v[1] + a[5] * v[2], a[6] * v[0] + a[7] * v[1] + a[8] * v[2]];
  const rx = d => { const c = Math.cos(d * D2R), s = Math.sin(d * D2R); return [1, 0, 0, 0, c, -s, 0, s, c]; };
  const ry = d => { const c = Math.cos(d * D2R), s = Math.sin(d * D2R); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
  const rz = d => { const c = Math.cos(d * D2R), s = Math.sin(d * D2R); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
  function m2q(m) {
    const tr = m[0] + m[4] + m[8]; let w, x, y, z, s;
    if (tr > 0) { s = Math.sqrt(tr + 1) * 2; w = 0.25 * s; x = (m[7] - m[5]) / s; y = (m[2] - m[6]) / s; z = (m[3] - m[1]) / s; }
    else if (m[0] > m[4] && m[0] > m[8]) { s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2; w = (m[7] - m[5]) / s; x = 0.25 * s; y = (m[1] + m[3]) / s; z = (m[2] + m[6]) / s; }
    else if (m[4] > m[8]) { s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2; w = (m[2] - m[6]) / s; x = (m[1] + m[3]) / s; y = 0.25 * s; z = (m[5] + m[7]) / s; }
    else { s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2; w = (m[3] - m[1]) / s; x = (m[2] + m[6]) / s; y = (m[5] + m[7]) / s; z = 0.25 * s; }
    return [w, x, y, z];
  }
  function q2m(q) {
    const [w, x, y, z] = q;
    return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
      2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
      2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
  }
  function slerp(a, b, t) {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    if (d < 0) { b = b.map(v => -v); d = -d; }
    if (d > 0.9995) { const r = a.map((v, i) => v + (b[i] - v) * t); const n = Math.hypot(r[0], r[1], r[2], r[3]); return r.map(v => v / n); }
    const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return a.map((v, i) => v * wa + b[i] * wb);
  }
  const qAngle = (a, b) => 2 * Math.acos(clamp(Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]), 0, 1)) * R2D;
  const azOf = v => wrap360(Math.atan2(v[0], v[1]) * R2D);
  const altOf = v => Math.asin(clamp(v[2] / (Math.hypot(v[0], v[1], v[2]) || 1), -1, 1)) * R2D;
  const vecAA = (az, alt) => { const a = az * D2R, h = alt * D2R; return [Math.cos(h) * Math.sin(a), Math.cos(h) * Math.cos(a), Math.sin(h)]; };

  // ---------- astronomy ----------
  const jd = date => date.getTime() / 864e5 + 2440587.5;
  function gmst(date) {
    const d = jd(date) - 2451545.0, T = d / 36525;
    return wrap360(280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - T * T * T / 38710000) * D2R;
  }
  function sunEci(date) {
    const n = jd(date) - 2451545;
    const g = (357.528 + 0.9856003 * n) * D2R;
    const lam = (280.460 + 0.9856474 * n + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R;
    const eps = (23.439 - 0.0000004 * n) * D2R;
    const x = Math.cos(lam), y = Math.cos(eps) * Math.sin(lam), z = Math.sin(eps) * Math.sin(lam);
    return { x, y, z, ra: Math.atan2(y, x), dec: Math.asin(z) };
  }
  function makeObs(lat, lon, hKm) {
    const a = 6378.137, f = 1 / 298.257223563, e2 = f * (2 - f);
    const p = lat * D2R, l = lon * D2R, sp = Math.sin(p), cp = Math.cos(p), sl = Math.sin(l), cl = Math.cos(l);
    const N = a / Math.sqrt(1 - e2 * sp * sp);
    return { lat, lon, hKm, sp, cp, sl, cl, x: (N + hKm) * cp * cl, y: (N + hKm) * cp * sl, z: (N * (1 - e2) + hKm) * sp };
  }
  function eqToEnu(ra, dec, lst, o) {
    const H = lst - ra, sd = Math.sin(dec), cd = Math.cos(dec), ch = Math.cos(H), sh = Math.sin(H);
    return [-cd * sh, sd * o.cp - cd * ch * o.sp, sd * o.sp + cd * ch * o.cp];
  }
  // Atmospheric refraction (Saemundsson): lifts objects near the horizon by up to ~0.6 degrees.
  function refract(v) {
    const n = Math.hypot(v[0], v[1], v[2]) || 1, u = v[2] / n;
    if (u < -0.03 || u > 0.26) return v;
    const h = Math.asin(u) * R2D;
    const R = 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * D2R) / 60;
    const h2 = (h + R) * D2R, hz = Math.hypot(v[0], v[1]) || 1e-9, c = Math.cos(h2) * n / hz;
    return [v[0] * c, v[1] * c, Math.sin(h2) * n];
  }
  function precess(raH, decD, date) {
    const T = (jd(date) - 2451545) / 36525, as = D2R / 3600;
    const zeta = (2306.2181 * T + 0.30188 * T * T) * as, z = (2306.2181 * T + 1.09468 * T * T) * as, th = (2004.3109 * T - 0.42665 * T * T) * as;
    const ra = raH * 15 * D2R, dec = decD * D2R;
    const A = Math.cos(dec) * Math.sin(ra + zeta);
    const B = Math.cos(th) * Math.cos(dec) * Math.cos(ra + zeta) - Math.sin(th) * Math.sin(dec);
    const C = Math.sin(th) * Math.cos(dec) * Math.cos(ra + zeta) + Math.cos(th) * Math.sin(dec);
    return { ra: Math.atan2(A, B) + z, dec: Math.asin(clamp(C, -1, 1)) };
  }
  function sunAltAt(date, o) {
    const s = sunEci(date), v = eqToEnu(s.ra, s.dec, gmst(date) + o.lon * D2R, o);
    return altOf(v);
  }

  // ---------- catalogs ----------
  const STAR_COL = { b: '#cfdcff', w: '#f2f5ff', y: '#fff1d0', o: '#ffd2a1', r: '#ffb48a' };
  const STARS = (window.SKY_STARS || []).map(s => ({ kind: 'star', name: s[0], raH: s[1], decD: s[2], mag: s[3], col: STAR_COL[s[4]] || '#ffffff', ly: s[5], v: null }));
  const STAR_BY = new Map(STARS.map(s => [s.name, s]));
  const CONST = (window.SKY_CONSTELLATIONS || []).map(c => ({ name: c[0], lines: c[1].map(p => [STAR_BY.get(p[0]), STAR_BY.get(p[1])]).filter(p => p[0] && p[1]) }));
  for (const c of CONST) { const m = new Set(); c.lines.forEach(p => { m.add(p[0]); m.add(p[1]); }); c.members = [...m]; for (const s of m) s.con = s.con || c.name; }
  const SHOWERS = window.SKY_SHOWERS || [];
  const PLANETS = [
    { name: 'Mercury', col: '#d8c8b0' }, { name: 'Venus', col: '#fff6dc' }, { name: 'Mars', col: '#ffb08a' },
    { name: 'Jupiter', col: '#ffe8c8' }, { name: 'Saturn', col: '#f1dca5' }, { name: 'Uranus', col: '#c8f0ff' }, { name: 'Neptune', col: '#a8c4ff' }
  ].map(p => ({ kind: 'planet', ...p, v: null, mag: 9, dist: 0 }));
  const MOON = { kind: 'moon', name: 'Moon', v: null, frac: 0.5, phase: 0, distKm: 384400, mag: -10 };
  const SUN = { kind: 'sun', name: 'Sun', v: null, mag: -26.7 };

  // Satellite groups (CelesTrak GP groups). std = standard magnitude at 1,000 km range, half lit.
  const GROUPS = [
    { id: 'stations', name: 'Space stations', sub: 'ISS, Tiangong and visiting craft', col: '#5ad1ff', std: -0.5, on: true },
    { id: 'last-30-days', name: 'New launches', sub: 'everything launched in the last 30 days', col: '#ff9ad0', std: 5, on: true },
    { id: 'visual', name: 'Brightest satellites', sub: 'the ~150 easiest to see by eye', col: '#f4f7ff', std: 3.5, on: true },
    { id: 'science', name: 'Science', sub: 'Hubble and research satellites', col: '#7cf2b0', std: 4.5, on: true },
    { id: 'starlink', name: 'Starlink', sub: 'SpaceX internet, ~10,000 satellites', col: '#8fb8ff', std: 5.2, on: true },
    { id: 'oneweb', name: 'OneWeb', sub: 'Eutelsat internet constellation', col: '#b59cff', std: 7, on: false },
    { id: 'kuiper', name: 'Amazon Kuiper', sub: 'Amazon internet constellation', col: '#c9a8ff', std: 6.5, on: false },
    { id: 'weather', name: 'Weather', sub: 'NOAA, GOES, Meteosat and more', col: '#9ff0d0', std: 5.5, on: false },
    { id: 'gnss', name: 'GPS & navigation', sub: 'GPS, Galileo, GLONASS, BeiDou (high and faint)', col: '#ffd37a', std: 10, on: false },
    { id: 'cosmos-2251-debris', name: 'Debris: Cosmos 2251', sub: 'from the 2009 satellite collision', col: '#8091b8', std: 9, on: false },
    { id: 'iridium-33-debris', name: 'Debris: Iridium 33', sub: 'the other half of that collision', col: '#8091b8', std: 9, on: false }
  ];
  const GBY = new Map(GROUPS.map(g => [g.id, g]));
  const SPECIAL = { 25544: 'ISS', 48274: 'Tiangong', 20580: 'Hubble' };
  const H_STEPS = [0, 200, 300, 400, 500, 600, 800, 1000, 1500, 2000, 5000, 20000, 36000, 50000, 1e9];

  // ---------- state ----------
  const S = {
    mode: 'sky', started: false,
    obs: null, locSource: 'approx', locName: '',
    fov: ls.get('fov', 66), zoom: 1,
    hcorr: ls.get('hcorr', 0), alignedAt: ls.get('alignedAt', 0),
    red: false, offset: 0, jump: 0,
    viewAz: 135, viewAlt: 28,
    q: null, qT: null, lastOrient: 0, absolute: false, iosOff: null, iosCal: false, compassAcc: null,
    dragYaw: 0, dragPitch: 0, dragging: false,
    sel: null, pinned: new Set(),
    preset: 'all', align: false,
    f: Object.assign({ groups: Object.fromEntries(GROUPS.map(g => [g.id, g.on])), hMin: 0, hMax: 14, density: 'smart',
      layers: { stars: true, lines: true, planets: true, meteors: true, grid: true, trails: true } }, ls.get('filters', {})),
    alarms: [], events: [], planetsAt: 0, starsAt: 0, libs: { sat: false, astro: false }
  };
  S.f.groups = Object.assign(Object.fromEntries(GROUPS.map(g => [g.id, g.on])), S.f.groups || {});
  S.f.layers = Object.assign({ stars: true, lines: true, planets: true, meteors: true, grid: true, trails: true }, S.f.layers || {});
  const saveFilters = () => ls.set('filters', S.f);
  const simNow = () => new Date(Date.now() + S.offset);

  // ---------- DOM ----------
  const cam = $('#cam'), sky = $('#sky'), g = sky.getContext('2d'), tape = $('#tape'), tg = tape.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    sky.width = Math.round(W * DPR); sky.height = Math.round(H * DPR);
    const r = tape.getBoundingClientRect();
    tape.width = Math.max(1, Math.round(r.width * DPR)); tape.height = Math.max(1, Math.round(r.height * DPR));
  }
  window.addEventListener('resize', resize);

  let toastT = 0;
  function toast(msg, ms = 2800) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms);
  }

  // ---------- red-mode-aware colors ----------
  const redCache = new Map();
  function C(hex, a) {
    let col = hex;
    if (S.red) {
      col = redCache.get(hex);
      if (!col) {
        const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
        const l = (0.42 * r + 0.78 * gg + 0.22 * b) / 255 / 1.42;
        col = '#' + [Math.round(clamp(40 + l * 235, 0, 255)), Math.round(l * 26), Math.round(l * 10)].map(x => x.toString(16).padStart(2, '0')).join('');
        redCache.set(hex, col);
      }
    }
    if (a == null || a >= 1) return col;
    const n = parseInt(col.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ---------- library loading ----------
  function loadScript(urls) {
    return new Promise(res => {
      const tryOne = i => {
        if (i >= urls.length) return res(false);
        const s = document.createElement('script');
        s.src = urls[i]; s.async = true;
        s.onload = () => res(true);
        s.onerror = () => { s.remove(); tryOne(i + 1); };
        document.head.appendChild(s);
      };
      tryOne(0);
    });
  }
  const libSat = loadScript(['https://cdn.jsdelivr.net/npm/satellite.js@5.0.0/dist/satellite.min.js', 'https://unpkg.com/satellite.js@5.0.0/dist/satellite.min.js', 'vendor/satellite.min.js'])
    .then(ok => { S.libs.sat = ok && !!window.satellite; return S.libs.sat; });
  const libAstro = loadScript(['https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/astronomy.browser.min.js', 'https://unpkg.com/astronomy-engine@2.1.19/astronomy.browser.min.js', 'vendor/astronomy.browser.min.js'])
    .then(ok => { S.libs.astro = ok && !!window.Astronomy; return S.libs.astro; });

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
    if (S.pinned.has(s.id) || s === S.sel) return true;
    const pr = S.preset;
    if (pr === 'stations') return s.groups.has('stations');
    if (pr === 'starlink') return s.groups.has('starlink');
    if (pr === 'new') return s.groups.has('last-30-days');
    for (const gid of s.groups) if (S.f.groups[gid]) return true;
    return false;
  }
  function passFilter(s) {
    if (s.rec === false) return false;
    if (!passGroup(s)) return false;
    if (S.pinned.has(s.id) || s === S.sel) return true;
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
    if (s.jump === S.jump && s.v && t - s.ts > 150 && t - s.ts < 6000) {
      const dt = (t - s.ts) / 1000;
      s.rate = [(st.E - s.v[0]) / dt, (st.N - s.v[1]) / dt, (st.U - s.v[2]) / dt];
    } else if (s.jump !== S.jump) s.rate = [0, 0, 0];
    s.v = [st.E, st.N, st.U]; s.ts = t; s.jump = S.jump; s.ok = true;
    s.lit = st.lit; s.mag = st.mag; s.range = st.r; s.h = st.h; s.spd = st.spd;
  }
  function satDir(s, t) {
    const k = clamp((t - s.ts) / 1000, -8, 8);
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

  // ---------- sky bodies ----------
  function updateStars(now) {
    if (!S.obs) return;
    const lst = gmst(now) + S.obs.lon * D2R;
    if (!S.precessedFor || Math.abs(now - S.precessedFor) > 864e5 * 30) {
      for (const s of STARS) { const p = precess(s.raH, s.decD, now); s.ra = p.ra; s.dec = p.dec; }
      S.precessedFor = now.getTime();
    }
    for (const s of STARS) s.v = refract(eqToEnu(s.ra, s.dec, lst, S.obs));
    const su = sunEci(now);
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

  // ---------- view orientation ----------
  function eulerMat(a, b, gm) { return mmul(mmul(rz(a), rx(b)), ry(gm)); }
  function screenAngle() { return (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 0); }
  function onOrient(e) {
    if (e.alpha == null && e.beta == null) return;
    if (e.type === 'deviceorientation' && S.hasAbsEvent) return;
    const raw = eulerMat(e.alpha || 0, e.beta || 0, e.gamma || 0);
    let R = raw;
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
      // iOS: alpha is relative; tie it to the magnetometer heading.
      const ch = e.webkitCompassHeading;
      const top = mv(raw, [0, 1, 0]), fwd = mv(raw, [0, 0, -1]);
      const topH = Math.hypot(top[0], top[1]), fwdH = Math.hypot(fwd[0], fwd[1]);
      const cands = [];
      if (topH > 0.3) cands.push(wrap180(ch - azOf(top)));
      if (fwdH > 0.3) cands.push(wrap180(ch - azOf(fwd)));
      if (topH > 0.85) { // phone near flat: heading is unambiguous
        const off = wrap180(ch - azOf(top));
        S.iosOff = S.iosOff == null ? off : wrap180(S.iosOff + wrap180(off - S.iosOff) * 0.15);
        S.iosCal = true;
      } else if (cands.length) {
        if (S.iosOff == null) S.iosOff = fwdH > 0.3 ? wrap180(ch - azOf(fwd)) : cands[0];
        else {
          let best = null;
          for (const c of cands) if (best == null || Math.abs(wrap180(c - S.iosOff)) < Math.abs(wrap180(best - S.iosOff))) best = c;
          if (Math.abs(wrap180(best - S.iosOff)) < 25) S.iosOff = wrap180(S.iosOff + wrap180(best - S.iosOff) * 0.03);
        }
      }
      if (S.iosOff != null) R = mmul(rz(-S.iosOff), raw);
      S.absolute = S.iosOff != null;
      S.compassAcc = typeof e.webkitCompassAccuracy === 'number' && e.webkitCompassAccuracy >= 0 ? e.webkitCompassAccuracy : null;
    } else {
      S.absolute = e.type === 'deviceorientationabsolute' || e.absolute === true;
    }
    R = mmul(R, rz(-screenAngle()));
    S.qT = m2q(R);
    if (!S.q) S.q = S.qT;
    S.lastOrient = performance.now();
  }
  function startSensors() {
    if ('ondeviceorientationabsolute' in window) {
      S.hasAbsEvent = true;
      window.addEventListener('deviceorientationabsolute', onOrient);
    }
    window.addEventListener('deviceorientation', onOrient);
  }
  // Rotation from screen frame to earth (East, North, Up). Camera looks along screen -Z.
  function viewMatrix(dt) {
    let M;
    if (S.mode === 'ar' && S.q) {
      const ang = qAngle(S.q, S.qT);
      const k = clamp(0.1 + ang * 0.07, 0.1, 0.85);
      S.q = slerp(S.q, S.qT, 1 - Math.pow(1 - k, dt * 60));
      M = mmul(rz(-S.hcorr), q2m(S.q));
      M = mmul(M, mmul(ry(-S.dragYaw), rx(S.dragPitch)));
    } else {
      const f = vecAA(S.viewAz, S.viewAlt), up = [0, 0, 1];
      let r = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]];
      const rn = Math.hypot(r[0], r[1], r[2]) || 1; r = r.map(x => x / rn);
      const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      M = [r[0], u[0], -f[0], r[1], u[1], -f[1], r[2], u[2], -f[2]];
    }
    return M;
  }
  function focal() {
    let long = Math.max(W, H), sc = 1;
    if (S.mode === 'ar' && cam.videoWidth) {
      sc = Math.max(W / cam.videoWidth, H / cam.videoHeight);
      long = Math.max(cam.videoWidth, cam.videoHeight) * sc;
    }
    return (long / 2) / Math.tan(S.fov / 2 * D2R) * S.zoom;
  }
  let VM = null, VT = null, FOC = 800;
  function project(v) {
    const t = VT;
    const cx = t[0] * v[0] + t[1] * v[1] + t[2] * v[2];
    const cy = t[3] * v[0] + t[4] * v[1] + t[5] * v[2];
    const cz = t[6] * v[0] + t[7] * v[1] + t[8] * v[2];
    const d = -cz;
    if (d <= 0.05) return { x: 0, y: 0, ok: false, cx, cy, d };
    return { x: W / 2 + FOC * cx / d, y: H / 2 - FOC * cy / d, ok: true, cx, cy, d };
  }
  const onScreen = (p, m = 0) => p.ok && p.x > -m && p.x < W + m && p.y > -m && p.y < H + m;
  const vfovDeg = () => 2 * Math.atan(H / 2 / FOC) * R2D;

  // ---------- rendering ----------
  let hits = [], lastFrame = performance.now(), cardAt = 0, tick = 0, zoneAt = 0;
  const ZONE = { top: 150, bot: 9999 };
  function updateZones() {
    const top = $('#top'), low = $('#lower');
    ZONE.top = top.hidden ? 0 : top.getBoundingClientRect().bottom + 6;
    let b = H;
    if (!low.hidden) for (const el of [$('#card'), $('#timebar')]) if (!el.hidden) { b = Math.min(b, el.getBoundingClientRect().top - 6); }
    ZONE.bot = b;
  }
  const FONT = '600 11px Inter, system-ui, sans-serif', MONO = '500 9px "JetBrains Mono", ui-monospace, monospace';
  function frame() {
    requestAnimationFrame(frame);
    const nowP = performance.now(), dt = clamp((nowP - lastFrame) / 1000, 0, 0.1); lastFrame = nowP; tick++;
    if (!S.obs) return;
    const now = simNow(), tms = now.getTime();
    try {
      if (S.mode === 'ar' && S.started && nowP - S.lastOrient > 2500 && !S.noSensorWarned) {
        S.noSensorWarned = true;
        toast('No motion sensors found. Drag to look around instead.', 4000);
        S.mode = 'sky'; document.body.classList.remove('ar'); cam.hidden = true; stopCamera();
      }
      if (!S.dragging && (S.dragYaw || S.dragPitch)) {
        const k = 1 - Math.pow(0.001, dt);
        S.dragYaw *= 1 - k; S.dragPitch *= 1 - k;
        if (Math.abs(S.dragYaw) < 0.05 && Math.abs(S.dragPitch) < 0.05) { S.dragYaw = 0; S.dragPitch = 0; }
      }
      cam.classList.toggle('dim', Math.hypot(S.dragYaw, S.dragPitch) > 3);
      cam.style.transform = S.zoom > 1.001 ? 'scale(' + S.zoom.toFixed(3) + ')' : '';
      VM = viewMatrix(dt);
      VT = [VM[0], VM[3], VM[6], VM[1], VM[4], VM[7], VM[2], VM[5], VM[8]];
      FOC = focal();
      if (tms - S.starsAt > 1000 || Math.abs(tms - S.starsAt) > 5000) { updateStars(now); S.starsAt = tms; }
      if (Math.abs(tms - S.planetsAt) > 5000) { updatePlanets(now); S.planetsAt = tms; }
      if (nowP - zoneAt > 400) { zoneAt = nowP; updateZones(); }
      updateSats(now, S.scrubbing ? 10 : 6);
      draw(now);
      if (nowP - cardAt > 250) { cardAt = nowP; updateHUD(now); updateCard(now); checkAlarms(); }
    } catch (e) {
      if (!S.errShown) { S.errShown = true; console.error(e); toast('Display error: ' + e.message, 5000); }
    }
  }

  function draw(now) {
    const t = now.getTime();
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.clearRect(0, 0, W, H);
    hits = [];
    const ar = S.mode === 'ar';
    const sunAlt = SUN.v ? altOf(SUN.v) : -30;
    if (!ar) drawSkyBackground(sunAlt);
    if (!ar && S.f.layers.stars && sunAlt < -8) drawMilkyWay(now);
    if (S.f.layers.grid) drawGrid(ar);
    drawHorizon(ar);
    const placed = [];
    const dens = { few: { star: 0.6, sat: 6 }, smart: { star: 1.6, sat: 16 }, all: { star: 2.7, sat: 50 } }[S.f.density] || { star: 1.6, sat: 16 };
    const starDim = ar ? 1 : clamp(1 - (sunAlt + 4) / 10, 0.25, 1);

    // constellation lines
    if (S.f.layers.lines && S.f.layers.stars) {
      g.lineWidth = 1; g.strokeStyle = C('#9db0ff', 0.38 * starDim);
      g.beginPath();
      for (const c of CONST) for (const [a, b] of c.lines) {
        if (!a.v || !b.v) continue;
        const pa = project(a.v), pb = project(b.v);
        if (!pa.ok || !pb.ok) continue;
        if (!onScreen(pa, 400) && !onScreen(pb, 400)) continue;
        g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y);
      }
      g.stroke();
      g.font = '500 10.5px "Space Grotesk", Inter, sans-serif';
      g.fillStyle = C('#afbef5', 0.75 * starDim);
      for (const c of CONST) {
        let sx = 0, sy = 0, n = 0;
        for (const s of c.members) { if (!s.v) continue; const p = project(s.v); if (onScreen(p, 0) && altOf(s.v) > -1) { sx += p.x; sy += p.y; n++; } }
        if (n >= 2 && sy / n + 18 > ZONE.top + 10 && sy / n + 18 < ZONE.bot) drawSpaced(c.name.toUpperCase(), sx / n, sy / n + 18, 3.5);
      }
    }
    // stars
    if (S.f.layers.stars) {
      for (const s of STARS) {
        if (!s.v || altOf(s.v) < -0.5) continue;
        const p = project(s.v); if (!onScreen(p, 10)) continue;
        const r = clamp(3.4 - 0.62 * s.mag, 0.9, 5) * Math.min(1.6, Math.sqrt(S.zoom));
        if (s.mag < 1.5) { g.fillStyle = C(s.col, 0.16 * starDim); g.beginPath(); g.arc(p.x, p.y, r * 2.6, 0, 6.283); g.fill(); }
        g.fillStyle = C(s.col, starDim); g.beginPath(); g.arc(p.x, p.y, r, 0, 6.283); g.fill();
        hits.push({ x: p.x, y: p.y, r: 22, o: s, pr: 1 });
        if (s.mag <= dens.star || s === S.sel) label(placed, p.x, p.y, r, s.name, s.ly ? fmt(s.ly) + ' LY' : '', C('#e8eeff', 0.9 * starDim), C('#93a3c9', 0.9 * starDim), 1);
      }
    }
    // planets, Moon, Sun
    if (S.f.layers.planets) {
      for (const p0 of PLANETS) {
        if (!p0.v || altOf(p0.v) < -0.5 || p0.mag > 7) continue;
        const p = project(p0.v); if (!onScreen(p, 10)) continue;
        const r = clamp(3.6 - 0.5 * p0.mag, 1.6, 5.5);
        g.fillStyle = C(p0.col, 0.2); g.beginPath(); g.arc(p.x, p.y, r * 2.4, 0, 6.283); g.fill();
        g.fillStyle = C(p0.col); g.beginPath(); g.arc(p.x, p.y, r, 0, 6.283); g.fill();
        hits.push({ x: p.x, y: p.y, r: 26, o: p0, pr: 3 });
        label(placed, p.x, p.y, r, p0.name, 'MAG ' + p0.mag.toFixed(1), C('#ffe9c8'), C('#c9b58c'), 5);
      }
      if (MOON.v && altOf(MOON.v) > -1) { const p = project(MOON.v); if (onScreen(p, 30)) { drawMoon(p); hits.push({ x: p.x, y: p.y, r: 30, o: MOON, pr: 4 }); label(placed, p.x, p.y, 12, 'Moon', Math.round(MOON.frac * 100) + '% LIT', C('#f4f7ff'), C('#93a3c9'), 6); } }
      if (SUN.v && altOf(SUN.v) > -1) {
        const p = project(SUN.v);
        if (onScreen(p, 30)) {
          g.strokeStyle = C('#ffd37a'); g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, 11, 0, 6.283); g.stroke();
          for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.beginPath(); g.moveTo(p.x + Math.cos(a) * 15, p.y + Math.sin(a) * 15); g.lineTo(p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20); g.stroke(); }
          hits.push({ x: p.x, y: p.y, r: 30, o: SUN, pr: 4 });
          label(placed, p.x, p.y, 20, 'Sun', 'DO NOT LOOK DIRECTLY', C('#ffd37a'), C('#c9a65c'), 6);
        }
      }
    }
    if (S.f.layers.meteors) drawRadiants(now, placed, sunAlt);
    drawSats(t, placed, dens, sunAlt);
    drawArrows(t);
    if (S.align) drawAlignTargets();
  }
  function drawSpaced(text, x, y, sp) {
    let w = 0; for (const ch of text) w += g.measureText(ch).width + sp;
    let cx = x - w / 2;
    for (const ch of text) { g.fillText(ch, cx, y); cx += g.measureText(ch).width + sp; }
  }
  // The Milky Way: a soft band along the real galactic equator, brightest toward the galactic centre in Sagittarius.
  let MW = null;
  function drawMilkyWay(now) {
    if (!MW) {
      MW = [];
      const aG = 192.85948 * D2R, dG = 27.12825 * D2R, lN = 122.93192 * D2R;
      for (let l = 0; l <= 360; l += 3) {
        const L = l * D2R, d = Math.asin(Math.cos(dG) * Math.cos(lN - L));
        const a = aG + Math.atan2(Math.sin(lN - L), -Math.sin(dG) * Math.cos(lN - L));
        const w = 0.45 + 0.55 * Math.pow(Math.max(0, Math.cos(L)), 2) + (Math.abs(wrap180(l - 80)) < 25 ? 0.2 : 0);
        MW.push({ a, d, w });
      }
    }
    const lst = gmst(now) + S.obs.lon * D2R, wid = FOC * Math.tan(9 * D2R);
    g.lineCap = 'round';
    let prev = null;
    for (const m of MW) {
      const v = eqToEnu(m.a, m.d, lst, S.obs), p = project(v);
      if (prev && p.ok && prev.ok && Math.hypot(p.x - prev.x, p.y - prev.y) < W * 1.5) {
        for (const [lw, al] of [[2.2, 0.035], [1.2, 0.05], [0.45, 0.06]]) {
          g.strokeStyle = C('#b9c3f0', al * m.w); g.lineWidth = wid * lw;
          g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(p.x, p.y); g.stroke();
        }
      }
      prev = p;
    }
    g.lineCap = 'butt';
  }
  function drawSkyBackground(sunAlt) {
    const top = sunAlt > 0 ? '#2f63a8' : sunAlt > -6 ? '#14244f' : sunAlt > -12 ? '#0a1433' : '#050918';
    const hor = sunAlt > 0 ? '#8cb9e6' : sunAlt > -6 ? '#c9805c' : sunAlt > -12 ? '#2a2a52' : '#0b1230';
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, C(top)); gr.addColorStop(1, C(hor));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  function drawHorizon(ar) {
    const pts = [];
    for (let az = 0; az <= 360; az += 3) { const p = project(vecAA(az, 0)); pts.push(p); }
    if (!ar) { // ground fill below the horizon
      const ground = [];
      for (let az = 0; az <= 360; az += 3) { const p = project(vecAA(az, 0)); if (p.ok && p.x > -W && p.x < 2 * W) ground.push(p); }
      ground.sort((a, b) => a.x - b.x);
      g.fillStyle = C('#04060c', 0.96);
      if (ground.length > 1) {
        g.beginPath(); g.moveTo(ground[0].x, H + 10);
        for (const p of ground) g.lineTo(p.x, p.y);
        g.lineTo(ground[ground.length - 1].x, H + 10); g.closePath(); g.fill();
        if (ground[0].x > 0) g.fillRect(0, Math.max(0, ground[0].y), ground[0].x + 1, H);
        if (ground[ground.length - 1].x < W) g.fillRect(ground[ground.length - 1].x - 1, Math.max(0, ground[ground.length - 1].y), W, H);
      } else if (S.viewAlt < 0) { g.fillRect(0, 0, W, H); }
    }
    g.strokeStyle = C('#9db0ff', ar ? 0.35 : 0.5); g.lineWidth = 1;
    g.beginPath(); let pen = false;
    for (const p of pts) { if (p.ok && Math.abs(p.x) < 4 * W) { pen ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); pen = true; } else pen = false; }
    g.stroke();
    g.font = '600 11px "JetBrains Mono", monospace'; g.textAlign = 'center';
    for (const [az, n] of [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']]) {
      const p = project(vecAA(az, 0)); if (!onScreen(p, 0)) continue;
      g.fillStyle = C(n.length === 1 ? '#eef2ff' : '#93a3c9'); g.fillText(n, p.x, p.y + 16);
    }
    g.textAlign = 'left';
  }
  function drawGrid(ar) {
    g.strokeStyle = C('#8ea4ff', ar ? 0.12 : 0.16); g.lineWidth = 1; g.setLineDash([2, 6]);
    g.font = '400 9px "JetBrains Mono", monospace'; g.fillStyle = C('#a0b4f0', 0.55);
    for (const alt of [20, 40, 60, 80]) {
      g.beginPath(); let pen = false, lp = null;
      for (let az = 0; az <= 360; az += 4) {
        const p = project(vecAA(az, alt));
        if (p.ok && Math.abs(p.x) < 4 * W) { pen ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); pen = true; if (onScreen(p, -20)) lp = p; } else pen = false;
      }
      g.stroke();
      if (lp) g.fillText(alt + '°', lp.x + 4, lp.y - 4);
    }
    g.setLineDash([]);
  }
  function drawMoon(p) {
    const r = Math.max(9, FOC * Math.tan(0.26 * D2R));
    let ang = 0;
    if (SUN.v) { const ps = project(SUN.v); ang = ps.ok ? Math.atan2(ps.y - p.y, ps.x - p.x) : Math.atan2(-ps.cy, ps.cx); }
    g.save(); g.translate(p.x, p.y); g.rotate(ang);
    g.fillStyle = C('#1a2040', 0.9); g.beginPath(); g.arc(0, 0, r, 0, 6.283); g.fill();
    const k = MOON.frac, rxE = r * Math.abs(2 * k - 1);
    g.fillStyle = C('#f2f0e6');
    g.beginPath(); g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    g.ellipse(0, 0, Math.max(0.01, rxE), r, 0, Math.PI / 2, -Math.PI / 2, k < 0.5);
    g.fill();
    g.restore();
    g.fillStyle = C('#f2f0e6', 0.08); g.beginPath(); g.arc(p.x, p.y, r * 2.2, 0, 6.283); g.fill();
  }
  function label(placed, x, y, r, t1, t2, c1, c2, prio, boxed) {
    g.font = FONT; const w1 = g.measureText(t1).width; g.font = MONO; const w2 = t2 ? g.measureText(t2).width : 0;
    const w = Math.max(w1, w2) + (boxed ? 14 : 2), h = t2 ? 26 : 14;
    const opts = [[r + 7, -h / 2], [-r - 7 - w, -h / 2], [-w / 2, -r - 6 - h], [-w / 2, r + 6]];
    for (const [ox, oy] of opts) {
      const bx = x + ox, by = y + oy;
      if (bx < 4 || by < ZONE.top || bx + w > W - 4 || by + h > ZONE.bot) continue;
      let clash = false;
      for (const q of placed) if (bx < q.x + q.w && bx + w > q.x && by < q.y + q.h && by + h > q.y) { clash = true; break; }
      if (clash) continue;
      placed.push({ x: bx - 2, y: by - 2, w: w + 4, h: h + 4 });
      const tx = bx + (boxed ? 7 : 1);
      if (boxed) {
        g.fillStyle = C('#050a1a', 0.62); roundRect(bx, by - 3, w, h + 6, 6); g.fill();
        g.strokeStyle = C('#5ad1ff', 0.35); g.lineWidth = 1; roundRect(bx, by - 3, w, h + 6, 6); g.stroke();
      }
      g.font = FONT; g.fillStyle = c1; g.textBaseline = 'top'; g.fillText(t1, tx, by);
      if (t2) { g.font = MONO; g.fillStyle = c2; g.fillText(t2, tx, by + 15); }
      g.textBaseline = 'alphabetic';
      return true;
    }
    return false;
  }
  function roundRect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  function satVisibleNow(s, sunAlt) { return s.lit && sunAlt < -6 && s.mag < 5.2; }
  function drawSats(t, placed, dens, sunAlt) {
    if (!S.libs.sat) return;
    let up = 0, inView = 0;
    const buckets = new Map(), cands = [];
    const visOnly = S.preset === 'visible';
    const A = Sats.active;
    for (let i = 0; i < A.length; i++) {
      const s = A[i];
      if (!s.ok || !s.v) continue;
      const v = satDir(s, t);
      if (v[2] < -0.005) continue;
      up++;
      if (visOnly && !satVisibleNow(s, sunAlt) && s !== S.sel) continue;
      const p = project(v); if (!onScreen(p, 6)) continue;
      inView++;
      const gcol = (GBY.get(s.prim) || GROUPS[0]).col;
      const key = s.lit ? gcol : '#56607e';
      let b = buckets.get(key); if (!b) { b = []; buckets.set(key, b); } b.push(p.x, p.y, s.lit ? (s.mag < 3 ? 3.2 : 2.4) : 2);
      hits.push({ x: p.x, y: p.y, r: 20, o: s, pr: SPECIAL[s.id] ? 6 : 2 });
      let score = 0;
      if (s === S.sel) score += 1e6;
      if (SPECIAL[s.id]) score += 1e4;
      if (S.pinned.has(s.id)) score += 5e3;
      if (s.groups.has('last-30-days')) score += 60;
      if (s.lit) score += 80 - s.mag * 8;
      if (s.groups.has('visual')) score += 25;
      cands.push({ s, p, score });
    }
    for (const [col, arr] of buckets) {
      g.fillStyle = C(col, col === '#56607e' ? 0.75 : 0.95);
      for (let i = 0; i < arr.length; i += 3) { const z = arr[i + 2]; g.fillRect(arr[i] - z / 2, arr[i + 1] - z / 2, z, z); }
    }
    S.counts = { up, inView };
    cands.sort((a, b) => b.score - a.score);
    // trails for the most interesting few
    const trailSats = cands.filter(c => c.s === S.sel || SPECIAL[c.s.id]).slice(0, 4).map(c => c.s);
    if (S.f.layers.trails) { updateTrails(new Date(t), trailSats); for (const s of trailSats) drawTrail(s, t); }
    let n = 0;
    for (const c of cands) {
      if (n >= dens.sat && c.score < 1e3) break;
      const s = c.s, gcol = (GBY.get(s.prim) || GROUPS[0]).col;
      if (!s.lit && n >= dens.sat / 2 && c.score < 1e3) continue;
      const big = !!SPECIAL[s.id] || s === S.sel;
      const sz = big ? 11 : 8;
      g.lineWidth = big ? 1.6 : 1.2;
      g.strokeStyle = s.lit ? C(gcol) : C('#7d8db3');
      if (!s.lit) g.setLineDash([2, 2]);
      g.strokeRect(c.p.x - sz / 2, c.p.y - sz / 2, sz, sz);
      g.setLineDash([]);
      const nm = SPECIAL[s.id] || prettyName(s.name);
      const sub = s.lit ? fmt(s.h) + ' KM' + (s.mag < 8 ? ' · MAG ' + s.mag.toFixed(1) : '') : 'IN SHADOW · ' + fmt(s.h) + ' KM';
      if (label(placed, c.p.x, c.p.y, sz / 2 + 2, nm, sub, s.lit ? C(big ? '#ffffff' : '#e6f6ff') : C('#aeb9d6'), C(s.lit ? '#a9c7e8' : '#8592b1'), 3, big)) n++;
      if (s === S.sel) drawReticle(c.p, t, gcol);
    }
  }
  function prettyName(n) { return n.length > 22 ? n.slice(0, 21) + '…' : n; }
  function drawTrail(s, t) {
    const pts = trails.get(s.id); if (!pts) return;
    const k0 = (t - trailsAt) / 1000;
    const gcol = (GBY.get(s.prim) || GROUPS[0]).col;
    g.lineWidth = 2; let prev = null;
    for (const q of pts) {
      if (q.v[2] < -0.02) { prev = null; continue; }
      const p = project(q.v);
      if (!p.ok) { prev = null; continue; }
      if (prev) {
        const past = q.k <= k0;
        if (past) { const a = clamp(1 - (k0 - q.k) / 150, 0, 1) * 0.75; g.setLineDash([]); g.strokeStyle = C(gcol, a); }
        else { g.setLineDash([4, 6]); g.strokeStyle = C(gcol, 0.45); }
        g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(p.x, p.y); g.stroke();
      }
      prev = p;
    }
    g.setLineDash([]);
  }
  function drawReticle(p, t, col) {
    const ph = (t % 2400) / 2400;
    g.strokeStyle = C(col, 0.7 * (1 - ph)); g.lineWidth = 1;
    g.beginPath(); g.arc(p.x, p.y, 12 + ph * 24, 0, 6.283); g.stroke();
    const s = 15 + Math.sin(t / 290) * 1.5, L = 7;
    g.strokeStyle = C(col); g.lineWidth = 1.6;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.beginPath(); g.moveTo(p.x + sx * s, p.y + sy * (s - L)); g.lineTo(p.x + sx * s, p.y + sy * s); g.lineTo(p.x + sx * (s - L), p.y + sy * s); g.stroke();
    }
  }
  function drawRadiants(now, placed, sunAlt) {
    for (const sh of activeShowers(now)) {
      const p0 = precess(sh.ra, sh.dec, now);
      const v = refract(eqToEnu(p0.ra, p0.dec, gmst(now) + S.obs.lon * D2R, S.obs));
      if (altOf(v) < 0) continue;
      const p = project(v);
      const t = now.getTime();
      if (onScreen(p, 20)) {
        g.strokeStyle = C('#ffb45a'); g.lineWidth = 1.5; g.setLineDash([3, 3]);
        g.save(); g.translate(p.x, p.y); g.rotate(t / 6000); g.beginPath(); g.arc(0, 0, 16, 0, 6.283); g.stroke(); g.restore();
        g.setLineDash([]);
        g.fillStyle = C('#ffd08a'); g.beginPath(); g.arc(p.x, p.y, 3, 0, 6.283); g.fill();
        hits.push({ x: p.x, y: p.y, r: 26, o: { kind: 'shower', ...sh }, pr: 3 });
        label(placed, p.x, p.y, 18, sh.name + ' radiant', 'METEORS FLY OUT FROM HERE', C('#ffe2b8'), C('#ffcf8a'), 4, true);
      }
      // best place to watch: ~45 degrees from the radiant, toward the zenith
      const z = [0, 0, 1], d = v[0] * z[0] + v[1] * z[1] + v[2] * z[2];
      let perp = [z[0] - d * v[0], z[1] - d * v[1], z[2] - d * v[2]]; const pn = Math.hypot(...perp) || 1; perp = perp.map(x => x / pn);
      const a = 45 * D2R, best = [v[0] * Math.cos(a) + perp[0] * Math.sin(a), v[1] * Math.cos(a) + perp[1] * Math.sin(a), v[2] * Math.cos(a) + perp[2] * Math.sin(a)];
      const pb = project(best);
      if (onScreen(pb, 40) && sunAlt < -6) {
        const rad = FOC * Math.tan(12 * D2R);
        g.strokeStyle = C('#ffb45a', 0.55 + 0.25 * Math.sin(t / 700)); g.lineWidth = 1.2; g.setLineDash([5, 6]);
        g.beginPath(); g.arc(pb.x, pb.y, rad, 0, 6.283); g.stroke(); g.setLineDash([]);
        label(placed, pb.x - 40, pb.y, 0, 'Best view', 'LONGEST ' + sh.name.toUpperCase() + ' TRAILS', C('#ffe2b8'), C('#ffcf8a'), 3, true);
      }
    }
  }
  function drawArrows(t) {
    const targets = [];
    if (S.sel && S.sel.v) targets.push(S.sel);
    for (const s of Sats.prio) if (s.ok && s !== S.sel) targets.push(s);
    for (const id of S.pinned) { const s = Sats.byId.get(id); if (s && s.ok && s !== S.sel && !SPECIAL[id]) targets.push(s); }
    let used = 0;
    for (const o of targets) {
      const v = o.kind === 'sat' ? satDir(o, t) : o.v;
      if (!v || altOf(v) < 0) continue;
      const p = project(v);
      if (onScreen(p, -10)) continue;
      let dx = p.cx, dy = -p.cy;
      if (!p.ok && p.d < 0 && Math.hypot(dx, dy) < 1e-6) dx = 1;
      const ang = Math.atan2(dy, dx), m = 34;
      const cyz = (ZONE.top + Math.min(ZONE.bot, H)) / 2, hh = Math.max(60, (Math.min(ZONE.bot, H) - ZONE.top) / 2 - m);
      const sx = (W / 2 - m) / Math.abs(Math.cos(ang) || 1e-6), sy = hh / Math.abs(Math.sin(ang) || 1e-6);
      const k = Math.min(sx, sy), x = W / 2 + Math.cos(ang) * k, y = cyz + Math.sin(ang) * k;
      const nudge = Math.sin(t / 260) * 3;
      g.save(); g.translate(x + Math.cos(ang) * nudge, y + Math.sin(ang) * nudge); g.rotate(ang);
      g.fillStyle = C('#5ad1ff'); g.beginPath(); g.moveTo(9, 0); g.lineTo(-5, -7); g.lineTo(-2, 0); g.lineTo(-5, 7); g.closePath(); g.fill();
      g.restore();
      const nm = o.kind === 'sat' ? (SPECIAL[o.id] || prettyName(o.name)) : o.name;
      const az = azOf(v);
      g.font = '700 10px Inter, sans-serif'; const tw = Math.max(g.measureText(nm.toUpperCase()).width, 60);
      let lx = x - Math.cos(ang) * 22 - tw / 2, ly = y - Math.sin(ang) * 22 - 12;
      lx = clamp(lx, 6, W - tw - 6); ly = clamp(ly, ZONE.top + 4, Math.max(ZONE.top + 4, ZONE.bot - 34));
      g.fillStyle = C('#050a1a', 0.7); roundRect(lx - 6, ly - 4, tw + 12, 30, 6); g.fill();
      g.fillStyle = C('#e6f6ff'); g.textBaseline = 'top'; g.fillText(nm.toUpperCase(), lx, ly);
      g.font = MONO; g.fillStyle = C('#93a9cc'); g.fillText(cardinal(az) + ' · ' + Math.round(altOf(v)) + '° UP', lx, ly + 13);
      g.textBaseline = 'alphabetic';
      hits.push({ x, y, r: 30, o, pr: 9 });
      if (++used >= 4) break;
    }
  }
  function drawAlignTargets() {
    const list = alignTargets();
    for (const o of list) {
      const p = project(o.v); if (!onScreen(p, 0)) continue;
      g.strokeStyle = C('#5ad1ff'); g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, 16, 0, 6.283); g.stroke();
      hits.push({ x: p.x, y: p.y, r: 30, o, pr: 20 });
    }
  }
  function alignTargets() {
    const out = [];
    for (const s of STARS) if (s.mag < 1.6 && s.v && altOf(s.v) > 3) out.push(s);
    for (const p of PLANETS) if (p.v && p.mag < 1.5 && altOf(p.v) > 3) out.push(p);
    if (MOON.v && altOf(MOON.v) > 2) out.push(MOON);
    if (SUN.v && altOf(SUN.v) > 2) out.push(SUN);
    return out;
  }

  // ---------- HUD ----------
  function updateHUD(now) {
    if (!VM) return;
    const fwd = [-VM[2], -VM[5], -VM[8]];
    const az = azOf(fwd), alt = altOf(fwd);
    $('#roAz').textContent = az.toFixed(1) + '°';
    $('#roAlt').textContent = alt.toFixed(1) + '°';
    $('#roFov').textContent = Math.round(vfovDeg()) + '°';
    if (S.counts) { $('#roUp').textContent = fmt(S.counts.up); $('#roView').textContent = fmt(S.counts.inView); }
    drawTape(az);
    const dot = $('#lockDot'), txt = $('#lockText'), acc = $('#lockAcc');
    dot.className = 'dot';
    if (S.mode !== 'ar') { txt.textContent = 'Sky view'; acc.textContent = ''; dot.classList.add('warn'); }
    else if (!S.absolute) { txt.textContent = 'No compass'; acc.textContent = 'ALIGN'; dot.classList.add('bad', 'pulse'); }
    else if (S.alignedAt && Date.now() - S.alignedAt < 6 * 3600e3) { txt.textContent = 'Aligned'; acc.textContent = '±0.5°'; dot.classList.add('pulse'); }
    else { txt.textContent = 'Compass'; acc.textContent = S.compassAcc != null ? '±' + Math.round(S.compassAcc) + '°' : '±10°'; dot.classList.add('warn'); }
    const lb = $('#liveBtn');
    if (S.offset === 0) { lb.classList.remove('off'); $('#liveText').textContent = 'LIVE ' + now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }); }
    else { lb.classList.add('off'); const m = Math.round(S.offset / 60000); $('#liveText').textContent = (m > 0 ? '+' : '−') + Math.abs(m) + ' MIN · ' + tfmt(now) + ' · TAP FOR LIVE'; }
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
    $('#card').hidden = !o;
    if (o) updateCard(simNow(), true);
  }
  async function nextPassFor(s) {
    const res = await findPasses(s, simNow(), 48, { visibleOnly: true, max: 1 });
    if (S.sel === s) { s.next = res[0] || 'none'; cardFor = null; updateCard(simNow(), true); }
  }
  function stat(k, v, u) { return `<div><span>${k}</span><span class="mono">${v}${u ? `<small> ${u}</small>` : ''}</span></div>`; }
  function updateCard(now, force) {
    const o = S.sel, card = $('#card');
    if (!o) return;
    const t = now.getTime();
    let html = '';
    if (o.kind === 'sat') {
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
        <div class="stats">${stat('ALT', fmt(o.h), 'km')}${stat('VEL', o.spd.toFixed(2), 'km/s')}${stat('RANGE', fmt(o.range), 'km')}${stat('MAG', o.lit && alt > 0 ? o.mag.toFixed(1) : '—')}</div>
        <div class="card-foot mono"><span>${cardinal(az)} ${az.toFixed(0)}° · ${alt.toFixed(1)}° UP</span><span>ORBIT ${fmt(o.perigee)}×${fmt(o.apogee)} KM · ${o.period.toFixed(0)} MIN</span><span>DATA ${ageD.toFixed(1)} D OLD</span></div>
        <div class="card-foot"><span>${next}</span></div>
        <div class="card-actions">${o.next && o.next !== 'none' ? '<button type="button" class="btn small" id="remindBtn">Remind me</button>' : ''}<button type="button" class="btn small" id="jumpBtn">${o.next && o.next !== 'none' ? 'Preview pass' : 'Centre it'}</button></div>`;
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
      else if (o.kind === 'moon') st = stat('LIT', Math.round(o.frac * 100), '%') + stat('DIST', fmt(o.distKm), 'km') + stat('PHASE', moonPhaseName(o.phase).split(' ')[0]) + stat('ALT', alt.toFixed(1), '°');
      else st = stat('ALT', alt.toFixed(1), '°') + stat('AZ', az.toFixed(0), '°') + stat('LIGHT', '8.3', 'min') + stat('MAG', '−26.7');
      html = `<button type="button" id="cardClose" aria-label="Close details">×</button>
        <div class="card-head"><div style="flex:1"><div class="card-title">${esc(o.kind === 'moon' ? moonPhaseName(o.phase) : o.name)}</div><div class="card-sub mono">${o.kind === 'planet' ? 'PLANET' : o.kind === 'moon' ? 'THE MOON' : 'THE SUN · NEVER LOOK AT IT DIRECTLY'}</div></div></div>
        <div class="stats">${st}</div><div class="card-foot mono"><span>${cardinal(az)} ${az.toFixed(0)}°</span></div>`;
    } else if (o.kind === 'shower') {
      html = `<button type="button" id="cardClose" aria-label="Close details">×</button>
        <div class="card-head"><div style="flex:1"><div class="card-title">${esc(o.name)}</div><div class="card-sub mono">METEOR SHOWER · FROM ${esc(o.parent.toUpperCase())}</div></div></div>
        <div class="stats">${stat('PEAK', o.peak.toLocaleDateString([], { month: 'short', day: 'numeric' }))}${stat('RATE', '~' + o.zhr, '/hr')}${stat('SPEED', o.v, 'km/s')}${stat('ENDS', o.end.toLocaleDateString([], { month: 'short', day: 'numeric' }))}</div>
        <div class="card-foot"><span>Look about 45° away from the radiant, toward the darkest part of the sky. Rates are for a very dark sky; city skies show far fewer.</span></div>`;
    }
    const key = html.length + ':' + html.slice(0, 200) + ':' + html.slice(-300);
    if (!force && key === cardFor) return;
    cardFor = key;
    card.innerHTML = html;
    $('#cardClose', card).onclick = () => select(null);
    const rb = $('#remindBtn', card); if (rb) rb.onclick = () => addAlarm(o, o.next);
    const jb = $('#jumpBtn', card); if (jb) jb.onclick = () => {
      if (o.next && o.next !== 'none') { setOffset(o.next.maxT - Date.now()); computeSat(o, epochCtx(simNow())); toast('Previewing the pass at its highest point. Tap LIVE to return.'); }
      if (S.mode === 'sky' && o.v) { const v = satDir(o, simNow().getTime()); S.viewAz = azOf(v); S.viewAlt = clamp(altOf(v), -10, 85); }
    };
  }

  // ---------- alarms ----------
  async function addAlarm(s, pass) {
    if (!pass) return;
    if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (e) { /* ignore */ } }
    S.alarms.push({ t: pass.vStart - 120e3, label: (SPECIAL[s.id] || s.name) + ' rises in the ' + cardinal(pass.vStartAz) + ' in 2 minutes. Look up!' });
    toast('Reminder set for ' + tfmt(new Date(pass.vStart - 120e3)) + '. Keep Sky Watch open.');
  }
  function checkAlarms() {
    const now = Date.now();
    for (const a of S.alarms.slice()) {
      if (now >= a.t) {
        S.alarms.splice(S.alarms.indexOf(a), 1);
        toast(a.label, 8000);
        try { navigator.vibrate && navigator.vibrate([200, 100, 200, 100, 400]); } catch (e) { /* ignore */ }
        beep();
        try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Sky Watch', { body: a.label }); } catch (e) { /* ignore */ }
      }
    }
  }
  function beep() {
    try {
      const A = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25].forEach(d => { const o = A.createOscillator(), gn = A.createGain(); o.frequency.value = 880; gn.gain.setValueAtTime(0.0001, A.currentTime + d); gn.gain.exponentialRampToValueAtTime(0.25, A.currentTime + d + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, A.currentTime + d + 0.2); o.connect(gn).connect(A.destination); o.start(A.currentTime + d); o.stop(A.currentTime + d + 0.22); });
    } catch (e) { /* no audio */ }
  }

  // ---------- gestures ----------
  const ptrs = new Map(); let gest = null;
  sky.addEventListener('pointerdown', e => {
    try { sky.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) gest = { type: 'tap', x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, t0: performance.now() };
    else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; gest = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: S.zoom }; }
  });
  sky.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId) || !gest) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gest.type === 'pinch' && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      S.zoom = clamp(gest.z0 * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(gest.d0, 1), 1, 10);
      return;
    }
    if (gest.type === 'tap' && Math.hypot(e.clientX - gest.x0, e.clientY - gest.y0) > 8) { gest.type = 'drag'; S.dragging = true; }
    if (gest.type === 'drag') {
      const dx = e.clientX - gest.lx, dy = e.clientY - gest.ly; gest.lx = e.clientX; gest.ly = e.clientY;
      const k = R2D / FOC;
      if (S.mode === 'ar') { S.dragYaw = clamp(S.dragYaw - dx * k, -180, 180); S.dragPitch = clamp(S.dragPitch + dy * k, -90, 90); }
      else { S.viewAz = wrap360(S.viewAz - dx * k); S.viewAlt = clamp(S.viewAlt + dy * k, -30, 89.5); }
    }
  });
  const endPtr = e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (gest && gest.type === 'tap' && ptrs.size === 0 && performance.now() - gest.t0 < 600) tapAt(e.clientX, e.clientY);
    if (ptrs.size === 0) { gest = null; S.dragging = false; }
    else if (ptrs.size === 1 && gest && gest.type === 'pinch') { const p = [...ptrs.values()][0]; gest = { type: 'drag', lx: p.x, ly: p.y }; }
  };
  sky.addEventListener('pointerup', endPtr);
  sky.addEventListener('pointercancel', endPtr);
  sky.addEventListener('wheel', e => { e.preventDefault(); S.zoom = clamp(S.zoom * Math.exp(-e.deltaY * 0.0015), 1, 10); }, { passive: false });
  function tapAt(x, y) {
    let best = null, bd = 1e9;
    for (const h of hits) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d > h.r) continue;
      const sc = d - h.pr * 4;
      if (sc < bd) { bd = sc; best = h; }
    }
    if (S.align) {
      if (best && (best.o.kind === 'star' || best.o.kind === 'planet' || best.o.kind === 'moon' || best.o.kind === 'sun')) doAlign(best.o);
      return;
    }
    if (best && best.o.kind === 'sat' && best.pr === 9 && S.mode === 'sky') { const v = satDir(best.o, simNow().getTime()); S.viewAz = azOf(v); S.viewAlt = clamp(altOf(v), -10, 85); }
    select(best ? best.o : null);
  }

  // ---------- alignment ----------
  function setAlign(on) {
    S.align = on;
    $('#crosshair').hidden = !on;
    const b = $('#banner');
    if (on) {
      $('#bannerText').textContent = S.mode === 'ar'
        ? 'Put the crosshair on a bright star, planet or the Moon you can really see, hold still, then tap its circle.'
        : 'Alignment fixes compass error in camera view. Start the camera view first.';
      $('#bannerBtns').innerHTML = '<button type="button" class="btn small" id="alignReset">Reset</button><button type="button" class="btn small" id="alignCancel">Cancel</button>';
      $('#alignCancel').onclick = () => setAlign(false);
      $('#alignReset').onclick = () => { S.hcorr = 0; ls.set('hcorr', 0); S.alignedAt = 0; ls.set('alignedAt', 0); toast('Compass correction cleared.'); setAlign(false); };
      b.hidden = false;
    } else b.hidden = true;
  }
  function doAlign(o) {
    if (S.mode !== 'ar') { setAlign(false); return; }
    const M = mmul(rz(-S.hcorr), q2m(S.q));
    const fwd = [-M[2], -M[5], -M[8]];
    const delta = wrap180(azOf(o.v) - azOf(fwd));
    S.hcorr = wrap180(S.hcorr + delta);
    ls.set('hcorr', S.hcorr); S.alignedAt = Date.now(); ls.set('alignedAt', S.alignedAt);
    setAlign(false);
    toast('Aligned on ' + o.name + '. Your compass was off by ' + Math.abs(delta).toFixed(1) + '°.');
  }

  // ---------- camera ----------
  let stream = null;
  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This browser has no camera access here. Open the app over https.');
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    cam.srcObject = stream; cam.hidden = false;
    try { await cam.play(); } catch (e) { /* autoplay will start it */ }
  }
  function stopCamera() { if (stream) { stream.getTracks().forEach(tr => tr.stop()); stream = null; } }
  let wake = null;
  async function keepAwake() { try { if ('wakeLock' in navigator) wake = await navigator.wakeLock.request('screen'); } catch (e) { /* not allowed */ } }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.started) keepAwake(); });

  // ---------- location ----------
  function approxLocation() {
    const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '');
    const map = { 'America/New_York': [40.71, -74.0], 'America/Chicago': [41.88, -87.63], 'America/Denver': [39.74, -104.99], 'America/Phoenix': [33.45, -112.07], 'America/Los_Angeles': [34.05, -118.24], 'America/Anchorage': [61.22, -149.9], 'Pacific/Honolulu': [21.31, -157.86], 'America/Toronto': [43.65, -79.38], 'America/Vancouver': [49.28, -123.12], 'Europe/London': [51.5, -0.12], 'Europe/Paris': [48.86, 2.35], 'Europe/Berlin': [52.52, 13.4], 'Asia/Tokyo': [35.68, 139.69], 'Australia/Sydney': [-33.87, 151.21] };
    return map[tz] || [40.71, -74.0];
  }
  function setLocation(lat, lon, src) {
    S.obs = makeObs(lat, lon, 0.05); S.locSource = src;
    if (src !== 'approx') ls.set('loc', [Math.round(lat * 100) / 100, Math.round(lon * 100) / 100]);
    S.jump++; S.starsAt = 0; S.planetsAt = 0; trailsAt = 0;
    if (S.sel && S.sel.kind === 'sat') { S.sel.next = null; nextPassFor(S.sel); }
    tonightDirty = true;
  }
  function requestGPS() {
    return new Promise(res => {
      if (!navigator.geolocation) return res(false);
      navigator.geolocation.getCurrentPosition(p => { setLocation(p.coords.latitude, p.coords.longitude, 'gps'); res(true); }, () => res(false), { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
    });
  }

  // ---------- time ----------
  function setOffset(ms) {
    S.offset = ms; S.jump++; trailsAt = 0; S.starsAt = 0; S.planetsAt = 0;
    const m = Math.round(ms / 60000);
    $('#scrub').value = clamp(m, -120, 120);
  }
  $('#scrub').addEventListener('input', e => { S.scrubbing = true; setOffset(parseInt(e.target.value, 10) * 60000); });
  $('#scrub').addEventListener('change', () => { S.scrubbing = false; });
  $('#liveBtn').addEventListener('click', () => setOffset(0));

  // ---------- chips & filters ----------
  function renderChips() {
    const counts = { all: Sats.list.length, stations: 0, starlink: 0, new: 0 };
    for (const s of Sats.list) { if (s.groups.has('stations')) counts.stations++; if (s.groups.has('starlink')) counts.starlink++; if (s.groups.has('last-30-days')) counts.new++; }
    const chips = [['all', 'Everything', counts.all], ['visible', 'Visible now'], ['stations', 'Stations', counts.stations], ['starlink', 'Starlink', counts.starlink], ['new', 'New launches', counts.new]];
    $('#chips').innerHTML = chips.map(([id, n, c]) => `<button type="button" class="chip glass" data-p="${id}" aria-pressed="${S.preset === id}">${n}${c ? ` <span class="n">${fmt(c)}</span>` : ''}</button>`).join('');
    $$('#chips .chip').forEach(b => b.onclick = () => {
      S.preset = b.dataset.p;
      if (S.preset === 'starlink' && !Sats.status.starlink) { S.f.groups.starlink = true; loadGroup('starlink'); }
      if (S.preset === 'new' && !Sats.status['last-30-days']) { S.f.groups['last-30-days'] = true; loadGroup('last-30-days'); }
      rebuildActive(); renderChips();
      if (S.preset === 'visible') toast('Showing satellites bright enough to see by eye right now.');
    });
  }
  function sw(on) { return `<button type="button" class="switch" role="switch" aria-checked="${on}"><span></span></button>`; }
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
    $('#hLabel').textContent = (lo === 0 && hi > 1e8) ? 'ANY' : (fmt(lo) + ' – ' + (hi > 1e8 ? 'ANY' : fmt(hi) + ' KM'));
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
    out.innerHTML = res.length ? res.map((s, i) => `<button type="button" data-i="${i}"><span>${esc(s.kind === 'sat' ? s.name : s.name)}</span><span>${s.kind === 'sat' ? 'NORAD ' + s.id : s.kind.toUpperCase()}</span></button>`).join('') : '<p class="muted">No match in the loaded data. Turn on more groups above.</p>';
    $$('button', out).forEach(b => b.onclick = () => {
      const o = res[+b.dataset.i]; closeSheets(); select(o);
      if (S.mode === 'sky') { const v = o.kind === 'sat' ? (o.v ? satDir(o, simNow().getTime()) : null) : o.v; if (v) { S.viewAz = azOf(v); S.viewAlt = clamp(altOf(v), -10, 85); } }
      toast('Tracking ' + o.name + '. Follow the arrow if it is out of view.');
    });
  });

  // ---------- sheets ----------
  function openSheet(id) {
    closeSheets(true);
    const s = $('#' + id); s.classList.add('open'); s.setAttribute('aria-hidden', 'false'); $('#scrim').classList.add('on');
    if (id === 'sheetFilters') { renderGroupList(); renderLayers(); renderHeight(); renderDensity(); }
    if (id === 'sheetTonight') buildTonight();
    if (id === 'sheetSettings') buildSettings();
    if (id === 'sheetGallery') buildGallery();
  }
  function closeSheets() { $$('.sheet').forEach(s => { s.classList.remove('open'); s.setAttribute('aria-hidden', 'true'); }); $('#scrim').classList.remove('on'); }
  $('#scrim').onclick = () => closeSheets();
  $$('[data-close]').forEach(b => b.onclick = () => closeSheets());
  $('#filterBtn').onclick = () => openSheet('sheetFilters');
  $('#tonightBtn').onclick = () => openSheet('sheetTonight');
  $('#gearBtn').onclick = () => openSheet('sheetSettings');
  $('#galleryBtn').onclick = () => openSheet('sheetGallery');
  $('#alignBtn').onclick = () => setAlign(!S.align);
  $('#lockChip').onclick = () => setAlign(true);
  $('#redBtn').onclick = () => {
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
    parts.push(conds);
    parts.push(`<p class="muted mono" style="margin:-6px 0 0;font-size:10.5px">${S.locSource === 'gps' ? 'YOUR GPS LOCATION' : S.locSource === 'manual' ? 'LOCATION SET BY HAND' : 'APPROXIMATE LOCATION, SET IT IN SETTINGS'} · ${o.lat.toFixed(1)}°, ${o.lon.toFixed(1)}°</p>`);

    // station passes
    const passSats = [25544, 48274, 20580].map(id => Sats.byId.get(id)).filter(Boolean);
    const passes = [];
    for (const s of passSats) { const ps = await findPasses(s, now, 24, { visibleOnly: true, max: 3 }); ps.forEach(p => passes.push({ s, p })); }
    passes.sort((a, b) => a.p.vStart - b.p.vStart);
    if (passes.length) {
      const best = passes.slice().sort((a, b) => (b.p.maxEl - b.p.mag * 4) - (a.p.maxEl - a.p.mag * 4))[0];
      const bp = best.p, nm = SPECIAL[best.s.id];
      const mins = Math.round((bp.vStart - Date.now()) / 60000);
      parts.push(`<div class="sec-label">Best pass</div><div class="hero"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><div class="mono" style="font-size:9.5px;letter-spacing:1.4px;color:var(--accent)">${esc(nm.toUpperCase())} FLYOVER</div><div style="font:700 20px var(--display)">${dfmt(new Date(bp.vStart))}</div></div><div style="text-align:right"><div class="mono" style="font-size:20px;font-weight:600">${tfmt(new Date(bp.vStart))}</div><div class="mono" style="font-size:9.5px;color:var(--dim)">${mins > 0 ? 'IN ' + (mins >= 60 ? Math.floor(mins / 60) + 'H ' : '') + (mins % 60) + 'M' : 'NOW'}</div></div></div>
        <div class="mono" style="font-size:10.5px;color:var(--dim);display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span>RISES ${cardinal(bp.vStartAz)}</span><span>MAX ${Math.round(bp.maxEl)}°</span><span>SETS ${cardinal(bp.vEndAz)}</span><span>MAG ${bp.mag.toFixed(1)}</span><span>${Math.max(1, Math.round((bp.vEnd - bp.vStart) / 60000))} MIN</span></div>
        <div class="row"><button type="button" class="btn primary small" data-remind="${best.s.id}:${bp.vStart}:${Math.round(bp.vStartAz)}">Remind me 2 min before</button><button type="button" class="btn small" data-preview="${bp.maxT}" data-sel="${best.s.id}">Preview</button></div></div>`);
      evCount++;
      const rest = passes.filter(x => x !== best).slice(0, 5);
      if (rest.length) parts.push('<div class="list">' + rest.map(x => evRow('pass', '#5ad1ff', esc(SPECIAL[x.s.id]) + ' pass', tfmt(new Date(x.p.vStart)), '', `${dfmt(new Date(x.p.vStart)).toUpperCase()} · ${cardinal(x.p.vStartAz)}→${cardinal(x.p.vEndAz)} · MAX ${Math.round(x.p.maxEl)}° · MAG ${x.p.mag.toFixed(1)}`)).join('') + '</div>');
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
      ev.push(evRow('train', '#8fb8ff', 'Starlink train · launch ' + esc('20' + tr.k.slice(0, 2) + '-' + tr.k.slice(2)), p ? tfmt(new Date(p.vStart)) : 'NOT VISIBLE SOON',
        `${tr.a.length} satellites still climbing to their final orbit, so they fly in a line. Fresh trains are the brightest.`,
        `AVG HEIGHT ${fmt(tr.med)} KM${p ? ' · ' + dfmt(new Date(p.vStart)).toUpperCase() + ' · ' + cardinal(p.vStartAz) + '→' + cardinal(p.vEndAz) + ' · MAX ' + Math.round(p.maxEl) + '°' : ''}`));
      evCount++;
    }
    // maneuvers
    for (const m of S.events.filter(e => e.type === 'maneuver')) {
      ev.push(evRow('boost', '#7cf2b0', esc(m.name) + (m.delta > 0 ? ' raised its orbit' : ' lowered its orbit'), 'DETECTED', `Its average height changed by ${Math.abs(m.delta).toFixed(1)} km since the last data update. That means an engine burn.`, ''));
      evCount++;
    }
    // reentry watch
    const decaying = Sats.list.filter(s => s.perigee < 220 && s.perigee > 80 && !SPECIAL[s.id]).sort((a, b) => a.perigee - b.perigee).slice(0, 4);
    for (const s of decaying) {
      ev.push(evRow('reentry', '#ff8a7a', 'Reentry watch: ' + esc(prettyName(s.name)), s.perigee < 180 ? 'DAYS' : 'WEEKS', s.perigee < 180 ? 'Low enough that air drag will bring it down within days.' : 'Dropping toward reentry in the coming weeks.', `LOWEST POINT ${fmt(s.perigee)} KM · NORAD ${s.id}`));
      evCount++;
    }
    // new launches in orbit
    const recent = new Map();
    for (const s of Sats.list) if (s.groups.has('last-30-days')) { if (!recent.has(s.launch)) recent.set(s.launch, []); recent.get(s.launch).push(s); }
    const recentL = [...recent.values()].sort((a, b) => b[0].launch.localeCompare(a[0].launch)).slice(0, 3);
    for (const a of recentL) ev.push(evRow('launch', '#ff9ad0', 'New in orbit: ' + esc(prettyName(a[0].name.replace(/-\d+$/, ''))), a.length + ' OBJECT' + (a.length > 1 ? 'S' : ''), '', `LAUNCH ${esc(a[0].intl.slice(0, 5))} · ${fmt(a[0].meanAlt)} KM · TAP "NEW LAUNCHES" TO SEE THEM`));
    // upcoming launches (The Space Devs)
    const ll = await cachedJSON('ll2', 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=6&mode=list', 3600e3);
    if (ll && ll.results) {
      for (const L of ll.results.filter(x => new Date(x.net) - now < 7 * 864e5).slice(0, 4)) {
        const d = new Date(L.net), hrs = (d - now) / 3600e3;
        ev.push(evRow('launch', '#5ad1ff', esc(L.name), hrs < 0 ? 'NOW' : hrs < 48 ? 'T−' + Math.floor(hrs) + 'H ' + Math.round((hrs % 1) * 60) + 'M' : dfmt(d).toUpperCase(), esc((L.lsp_name || (L.launch_service_provider && L.launch_service_provider.name) || '') + (L.location || (L.pad && L.pad.location && L.pad.location.name) ? ' · ' + (L.location || L.pad.location.name) : '')), `${dfmt(d).toUpperCase()} ${tfmt(d)} · ${esc(((L.status && (L.status.abbrev || L.status.name)) || '').toUpperCase())}`));
        if (hrs < 24) evCount++;
      }
    }
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
          sk.push(evRow('planet', '#ffd37a', p.name, when, '', `MAG ${p.mag.toFixed(1)}${p.v ? ' · ' + cardinal(azOf(p.v)) + ' · ' + Math.round(altOf(p.v)) + '°' : ''}`));
        }
        const mr = A.SearchRiseSet('Moon', ob, +1, now, 1), ms = A.SearchRiseSet('Moon', ob, -1, now, 1);
        sk.unshift(evRow('moon', '#c9d6f5', moonPhaseName(MOON.phase), Math.round(MOON.frac * 100) + '% LIT', MOON.frac > 0.6 ? 'A bright Moon washes out faint satellites and meteors.' : 'A dim Moon means darker skies.', `${mr ? 'RISES ' + tfmt(mr.date) : ''}${mr && ms ? ' · ' : ''}${ms ? 'SETS ' + tfmt(ms.date) : ''}`));
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
      sk.push(evRow('meteor', '#ffb45a', sh.name, days === 0 ? 'PEAKS TONIGHT' : days > 0 ? 'PEAK IN ' + days + ' D' : 'ACTIVE', `${isAct ? 'Active now. ' : ''}Up to ~${sh.zhr} an hour under a dark sky. The radiant is highest around ${tfmt(transit)}.`, `PEAK ${sh.peak.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase()} · ${sh.v} KM/S · FROM ${esc(sh.parent.toUpperCase())}`));
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
    $$('[data-remind]').forEach(b => b.onclick = () => { const [id, t, az] = b.dataset.remind.split(':').map(Number); const s = Sats.byId.get(id); if (s) addAlarm(s, { vStart: t, vStartAz: az }); });
    $$('[data-preview]').forEach(b => b.onclick = () => { closeSheets(); setOffset(+b.dataset.preview - Date.now()); const s = Sats.byId.get(+b.dataset.sel); if (s) select(s); toast('Previewing the pass at its highest point. Tap LIVE to return.'); });
  }

  // ---------- settings ----------
  function buildSettings() {
    const o = S.obs, ages = GROUPS.filter(gr => Sats.age[gr.id]).map(gr => `<div class="kv"><span>${esc(gr.name)}</span><span>${fmt(Sats.status[gr.id] || 0)} · ${((Date.now() - Sats.age[gr.id]) / 3600e3).toFixed(1)} H OLD</span></div>`).join('');
    $('#settingsBody').innerHTML = `
      <div class="sec-label">Location</div>
      <p class="muted" style="margin:0">${S.locSource === 'gps' ? 'Using your GPS location' : S.locSource === 'manual' ? 'Set by hand' : 'Approximate, based on your time zone'}: <span class="mono">${o.lat.toFixed(3)}°, ${o.lon.toFixed(3)}°</span></p>
      <div class="inline"><input id="latIn" inputmode="decimal" aria-label="Latitude" placeholder="Latitude" value="${o.lat.toFixed(3)}"><input id="lonIn" inputmode="decimal" aria-label="Longitude" placeholder="Longitude" value="${o.lon.toFixed(3)}"></div>
      <div class="inline"><button type="button" class="btn small" id="locSave">Use these</button><button type="button" class="btn small" id="locGps">Use GPS</button></div>
      <div class="sec-label">Camera field of view <span class="mono" id="fovLabel">${S.fov}°</span></div>
      <input type="range" id="fovIn" min="40" max="90" step="1" value="${S.fov}" aria-label="Camera field of view">
      <p class="muted" style="margin:0">If labels drift apart from the real stars toward the edges of the screen, adjust this until they line up. Most phone main cameras are 64–70°.</p>
      <div class="sec-label">Compass</div>
      <div class="kv"><span>Correction from your last alignment</span><span>${S.hcorr.toFixed(1)}°</span></div>
      <div class="inline"><button type="button" class="btn small" id="setAlign">Align now</button><button type="button" class="btn small" id="clrAlign">Clear correction</button></div>
      <div class="sec-label">Orbit data <button type="button" class="btn small" id="refresh">Refresh now</button></div>
      <div>${ages || '<p class="muted">Nothing loaded yet.</p>'}</div>
      <div class="sec-label">About</div>
      <p class="muted" style="margin:0">Sky Watch v1. Satellite positions use SGP4 (satellite.js) with CelesTrak orbit data, cached on this phone for offline use. Planets and the Moon use Astronomy Engine. Brightness is an estimate. Snapshots stay on this phone and never include your location.</p>`;
    $('#locSave').onclick = () => { const la = parseFloat($('#latIn').value), lo = parseFloat($('#lonIn').value); if (isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) { setLocation(la, lo, 'manual'); toast('Location set.'); buildSettings(); } else toast('Enter latitude −90 to 90 and longitude −180 to 180.'); };
    $('#locGps').onclick = async () => { toast('Finding you…'); const ok = await requestGPS(); toast(ok ? 'Location updated from GPS.' : 'Could not get GPS. Check location permission.'); buildSettings(); };
    $('#fovIn').oninput = e => { S.fov = +e.target.value; ls.set('fov', S.fov); $('#fovLabel').textContent = S.fov + '°'; };
    $('#setAlign').onclick = () => { closeSheets(); setAlign(true); };
    $('#clrAlign').onclick = () => { S.hcorr = 0; ls.set('hcorr', 0); S.alignedAt = 0; ls.set('alignedAt', 0); toast('Compass correction cleared.'); buildSettings(); };
    $('#refresh').onclick = async () => { toast('Refreshing orbit data…'); await Promise.all(GROUPS.filter(gr => S.f.groups[gr.id] || Sats.status[gr.id]).map(gr => loadGroup(gr.id, true))); tonightDirty = true; toast('Orbit data refreshed.'); buildSettings(); };
  }

  // ---------- snapshots ----------
  async function snapshot() {
    const c = document.createElement('canvas'); c.width = sky.width; c.height = sky.height;
    const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    if (S.mode === 'ar' && cam.videoWidth) {
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
    x.fillStyle = C('#ffffff'); x.font = `700 ${14 * s}px "Space Grotesk", Inter, sans-serif`; x.fillText('SKY WATCH', 16 * s, c.height - 40 * s);
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
    toast('Snapshot saved. Tap the thumbnail to share it.');
  }
  function setGalleryThumb(src) { $('#galleryBtn').innerHTML = src ? `<img alt="" src="${src}">` : '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 16l5-5 4 4 3-3 6 6"/></svg>'; }
  async function buildGallery() {
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
  $('#shutter').onclick = () => snapshot().catch(e => toast('Snapshot failed: ' + e.message));

  // ---------- start ----------
  function showHUD() {
    $('#top').hidden = false; $('#lower').hidden = false;
    $('#start').classList.add('gone'); setTimeout(() => { $('#start').hidden = true; }, 600);
    S.started = true; resize(); keepAwake();
  }
  $('#startAR').onclick = async () => {
    // iOS needs the motion permission requested inside the tap
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') { toast('Motion access was declined, so camera view cannot follow your phone. Using sky view.', 5000); return startSkyMode(); }
      }
    } catch (e) { /* not iOS */ }
    startSensors();
    try { await startCamera(); }
    catch (e) { toast('Camera unavailable: ' + (e.message || e.name) + '. Using sky view.', 5000); return startSkyMode(); }
    S.mode = 'ar'; document.body.classList.add('ar'); S.lastOrient = performance.now();
    showHUD(); requestGPS();
  };
  function startSkyMode() {
    S.mode = 'sky'; document.body.classList.remove('ar'); cam.hidden = true; stopCamera();
    showHUD(); requestGPS();
  }
  $('#startSky').onclick = startSkyMode;

  // service worker for offline use
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

  // boot
  (async function boot() {
    resize();
    const saved = ls.get('loc', null);
    if (saved) setLocation(saved[0], saved[1], 'saved'); else { const a = approxLocation(); setLocation(a[0], a[1], 'approx'); }
    // pick a nice starting view: toward the ISS later; for now the south-east sky
    renderChips();
    requestAnimationFrame(frame);
    const shots = await idb.shots(); if (shots.length) setGalleryThumb(shots.sort((a, b) => b.id - a.id)[0].thumb);
    await libSat; setStatus();
    if (!S.libs.sat) { $('#startStatus').textContent = 'Could not load the orbit math library. Check your connection.'; return; }
    await loadEnabledGroups();
    libAstro.then(() => { S.planetsAt = 0; });
    setTimeout(() => { if (!$('#sheetTonight').classList.contains('open')) buildTonightQuiet(); }, 4000);
  })();
  async function buildTonightQuiet() {
    try { await buildTonight(); } catch (e) { $('#tonightBody').innerHTML = '<p class="muted">Could not build tonight’s list yet.</p>'; }
  }
})();
