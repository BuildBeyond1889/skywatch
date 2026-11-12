/* Sky Watch · core.js · Utilities, storage, math, astronomy, catalogs, state, page elements, colours, library loading.
   All app files share one global scope and must load in order: core, data, view, render, cards, sensing, ui, main. */
'use strict';
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
  const PREF = (() => { try { return Object.assign({ miles: false, h24: false }, JSON.parse(localStorage.getItem('skywatch.prefs') || '{}')); } catch (e) { return { miles: false, h24: false }; } })();
  const savePref = () => { try { localStorage.setItem('skywatch.prefs', JSON.stringify(PREF)); } catch (e) { /* ignore */ } };
  const H12 = () => (PREF.h24 ? { hour12: false } : {});
  const tfmt = d => d.toLocaleTimeString([], Object.assign({ hour: 'numeric', minute: '2-digit' }, H12()));
  const dv = km => PREF.miles ? km * 0.621371 : km;            // distance value in the chosen unit
  const du = () => PREF.miles ? 'mi' : 'km';                    // unit label
  const DU = () => PREF.miles ? 'MI' : 'KM';
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
  for (const c of CONST) { c.kind = 'const'; const m = new Set(); c.lines.forEach(p => { m.add(p[0]); m.add(p[1]); }); c.members = [...m]; for (const s of m) s.con = s.con || c.name; }
  const SHOWERS = window.SKY_SHOWERS || [];
  // What each figure is, and the month it is best placed in the evening sky (northern hemisphere).
  const CONST_INFO = { 'Orion': ['The Hunter', 'January'], 'Ursa Major': ['The Great Bear, home of the Big Dipper', 'April'], 'Ursa Minor': ['The Little Bear, with Polaris the North Star at its tail', 'June'],
    'Cassiopeia': ['The Queen, a W-shape opposite the Big Dipper', 'November'], 'Cygnus': ['The Swan, also called the Northern Cross', 'September'], 'Lyra': ['The Lyre, a small harp holding brilliant Vega', 'August'],
    'Aquila': ['The Eagle', 'August'], 'Leo': ['The Lion', 'April'], 'Gemini': ['The Twins, Castor and Pollux', 'February'], 'Taurus': ['The Bull, with the Pleiades on its shoulder', 'December'],
    'Auriga': ['The Charioteer', 'January'], 'Canis Major': ['The Great Dog, home of Sirius, the brightest star', 'February'], 'Scorpius': ['The Scorpion, with red Antares at its heart', 'July'],
    'Crux': ['The Southern Cross', 'May'], 'Centaurus': ['The Centaur, home of our nearest star system', 'May'], 'Pegasus': ['The Winged Horse, marked by the Great Square', 'October'],
    'Andromeda': ['The Chained Princess, with the Andromeda Galaxy', 'November'], 'Perseus': ['The Hero who rescued Andromeda', 'December'], 'Boötes': ['The Herdsman, led by orange Arcturus', 'June'],
    'Virgo': ['The Maiden', 'May'], 'Corvus': ['The Crow', 'May'], 'Aries': ['The Ram', 'December'], 'Sagittarius': ['The Archer, whose stars form a teapot', 'August'],
    'Libra': ['The Scales', 'June'], 'Cepheus': ['The King, husband of Cassiopeia', 'October'] };
  const PLANETS = [
    { name: 'Mercury', col: '#d8c8b0' }, { name: 'Venus', col: '#fff6dc' }, { name: 'Mars', col: '#ffb08a' },
    { name: 'Jupiter', col: '#ffe8c8' }, { name: 'Saturn', col: '#f1dca5' }, { name: 'Uranus', col: '#c8f0ff' }, { name: 'Neptune', col: '#a8c4ff' }
  ].map(p => ({ kind: 'planet', ...p, v: null, mag: 9, dist: 0 }));
  const MOON = { kind: 'moon', name: 'Moon', v: null, frac: 0.5, phase: 0, distKm: 384400, mag: -10 };
  const SUN = { kind: 'sun', name: 'Sun', v: null, mag: -26.7 };
  const DSO_COL = { galaxy: '#c9b8ff', nebula: '#ff9ad0', cluster: '#a9c8ff', globular: '#ffe2b8', planetary: '#7cf2d8', remnant: '#8fd0ff', blackhole: '#ffb45a' };
  const DSO_TYPE = { galaxy: 'Galaxy', nebula: 'Nebula', cluster: 'Star cluster', globular: 'Globular cluster', planetary: 'Planetary nebula', remnant: 'Supernova remnant', blackhole: 'Black hole' };
  const DSOS = (window.SKY_DSO || []).map(d => ({ kind: 'dso', id: d[0], name: d[1], type: d[2], raH: d[3], decD: d[4], mag: d[5], size: d[6], ly: d[7], fact: d[8], v: null }));
  const PROBES = (window.SKY_PROBES || []).map(p => ({ kind: 'probe', ...p, v: null }));
  const JWST = { kind: 'probe', name: 'James Webb Space Telescope', short: 'JWST', jwst: true, v: null, launched: 2021, kms: 0.2, fact: 'Orbits the Sun–Earth L2 point 1.5 million km away, on the side of Earth facing away from the Sun. Its position here is approximate.' };
  const dsoLabel = d => (/^M\d+$/.test(d.id) && d.name !== d.id ? d.id + ' ' : '') + d.name;
  function seeWith(d) { if (d.type === 'blackhole') return 'RADIO ONLY'; if (d.mag <= 4.5) return 'NAKED EYE'; if (d.mag <= 7.5) return 'BINOCULARS'; return 'TELESCOPE'; }
  function probeAU(p, date) { return p.au2025 + p.auPerYr * ((date.getTime() - Date.UTC(2025, 0, 1)) / (365.25 * 864e5)); }
  function lyText(ly) { return ly >= 1e6 ? (ly / 1e6).toFixed(ly >= 1e7 ? 0 : 1) + ' million ly' : fmt(ly) + ' ly'; }

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
    alarms: [], events: [], planetsAt: 0, starsAt: 0, libs: { sat: false, astro: false },
    dprCap: 2, collapse: {}, noFeed: false, clear: false, rate: 1, tmBase: 0, family: null,
    view: 'orbit', deepPreset: 'all', feat: null, featObj: null, autoCatch: false, caught: 0, angVel: 0
  };
  S.f.groups = Object.assign(Object.fromEntries(GROUPS.map(g => [g.id, g.on])), S.f.groups || {});
  S.f.layers = Object.assign({ stars: true, lines: true, planets: true, meteors: true, grid: true, trails: true }, S.f.layers || {});
  if (S.f.autoStar == null) S.f.autoStar = true;
  if (!S.f.haptics) S.f.haptics = 'visible';
  if (!S.f.catchSens) S.f.catchSens = 'med';
  if (S.f.showDetect == null) S.f.showDetect = false;
  const saveFilters = () => ls.set('filters', S.f);
  const simNow = () => new Date(Date.now() + S.offset);

  // ---------- DOM ----------
  const cam = $('#cam'), sky = $('#sky'), g = sky.getContext('2d'), tape = $('#tape'), tg = tape.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, S.dprCap || 2);
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

