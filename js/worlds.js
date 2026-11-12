/* Sky Watch · worlds.js · The other ways to look: Ground X-ray, Invisible infrastructure, Contrail ID, Night migration, Magnetic field.
   Each world draws its own layer on the same camera/compass engine and supplies its own chips, cards and readout.
   Loads after ui.js and before main.js. */
'use strict';

// ---------- shared helpers ----------
// Direction (East, North, Up, in km) from you to any point on, above or inside the Earth.
function geoEnu(lat, lon, hKm) {
  const p = makeObs(lat, lon, hKm), o = S.obs;
  const dx = p.x - o.x, dy = p.y - o.y, dz = p.z - o.z;
  return [-o.sl * dx + o.cl * dy, -o.sp * o.cl * dx - o.sp * o.sl * dy + o.cp * dz, o.cp * o.cl * dx + o.cp * o.sl * dy + o.sp * dz];
}
function gcKm(la1, lo1, la2, lo2) {
  const p1 = la1 * D2R, p2 = la2 * D2R, dl = (lo2 - lo1) * D2R;
  return 6371 * Math.acos(clamp(Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl), -1, 1));
}
function bearingTo(la1, lo1, la2, lo2) {
  const p1 = la1 * D2R, p2 = la2 * D2R, dl = (lo2 - lo1) * D2R;
  return wrap360(Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) * R2D);
}
// Move a lat/lon by metres east/north (small distances).
function offsetLL(lat, lon, eM, nM) { return [lat + nM / 111320, lon + eM / (111320 * Math.cos(lat * D2R))]; }
const kmTxt = km => fmt(Math.round(dv(km))) + ' ' + DU();
function dimStars(alpha) {
  for (const s of STARS) { if (!s.v || altOf(s.v) < 0 || s.mag > 2.2) continue; const p = project(s.v); if (!onScreen(p, 4)) continue; g.fillStyle = C(s.col, alpha); g.beginPath(); g.arc(p.x, p.y, clamp(2.6 - 0.5 * s.mag, 0.8, 3.5), 0, 6.283); g.fill(); }
}
function polyline(pts, col, width, dash) {
  g.strokeStyle = col; g.lineWidth = width; g.setLineDash(dash || []); g.beginPath(); let pen = false;
  for (const v of pts) { const p = project(v); if (p.ok && Math.abs(p.x) < 4 * W && Math.abs(p.y) < 4 * H) { pen ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); pen = true; } else pen = false; }
  g.stroke(); g.setLineDash([]);
}
async function overpass(key, q, ttl) {
  return cachedJSON(key, 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(q), ttl);
}
const viewFwd = () => VM ? [-VM[2], -VM[5], -VM[8]] : [0, 1, 0];
// Convert a local (E, N, U) direction to Earth-centred coordinates.
function enuToEcef(v) {
  const o = S.obs;
  return [-o.sl * v[0] - o.sp * o.cl * v[1] + o.cp * o.cl * v[2], o.cl * v[0] - o.sp * o.sl * v[1] + o.cp * o.sl * v[2], o.cp * v[1] + o.sp * v[2]];
}
function ecefToLL(x, y, z) { return [Math.atan2(z, Math.hypot(x, y)) * R2D, Math.atan2(y, x) * R2D]; }

// World cities used for "through the Earth" labels and naming exit points.
const CITIES = [['Tokyo', 35.68, 139.69], ['Delhi', 28.61, 77.21], ['Shanghai', 31.23, 121.47], ['São Paulo', -23.55, -46.63], ['Mexico City', 19.43, -99.13], ['Cairo', 30.04, 31.24], ['Mumbai', 19.08, 72.88], ['Beijing', 39.90, 116.41], ['Dhaka', 23.81, 90.41], ['Osaka', 34.69, 135.50],
  ['New York', 40.71, -74.01], ['Karachi', 24.86, 67.01], ['Buenos Aires', -34.60, -58.38], ['Istanbul', 41.01, 28.98], ['Kolkata', 22.57, 88.36], ['Manila', 14.60, 120.98], ['Lagos', 6.52, 3.38], ['Rio de Janeiro', -22.91, -43.17], ['Moscow', 55.76, 37.62], ['Los Angeles', 34.05, -118.24],
  ['Paris', 48.86, 2.35], ['London', 51.51, -0.13], ['Jakarta', -6.21, 106.85], ['Lima', -12.05, -77.04], ['Bangkok', 13.76, 100.50], ['Seoul', 37.57, 126.98], ['Bogotá', 4.71, -74.07], ['Chicago', 41.88, -87.63], ['Tehran', 35.69, 51.39], ['Hong Kong', 22.32, 114.17],
  ['Johannesburg', -26.20, 28.05], ['Singapore', 1.35, 103.82], ['Sydney', -33.87, 151.21], ['Melbourne', -37.81, 144.96], ['Perth', -31.95, 115.86], ['Auckland', -36.85, 174.76], ['Honolulu', 21.31, -157.86], ['Anchorage', 61.22, -149.90], ['Reykjavík', 64.15, -21.94], ['Cape Town', -33.92, 18.42],
  ['Nairobi', -1.29, 36.82], ['Dubai', 25.20, 55.27], ['Riyadh', 24.71, 46.68], ['Madrid', 40.42, -3.70], ['Rome', 41.90, 12.50], ['Berlin', 52.52, 13.40], ['Athens', 37.98, 23.73], ['Toronto', 43.65, -79.38], ['Vancouver', 49.28, -123.12], ['Miami', 25.76, -80.19],
  ['Houston', 29.76, -95.37], ['Denver', 39.74, -104.99], ['Santiago', -33.45, -70.67], ['Havana', 23.11, -82.37], ['Lisbon', 38.72, -9.14], ['Dakar', 14.72, -17.47], ['Casablanca', 33.57, -7.59], ['Addis Ababa', 9.03, 38.74], ['Kinshasa', -4.44, 15.27], ['Luanda', -8.84, 13.23],
  ['Antananarivo', -18.88, 47.51], ['Colombo', 6.93, 79.86], ['Kathmandu', 27.72, 85.32], ['Ulaanbaatar', 47.89, 106.91], ['Vladivostok', 43.12, 131.89], ['Taipei', 25.03, 121.57], ['Hanoi', 21.03, 105.85], ['Port Moresby', -9.44, 147.18], ['Fiji (Suva)', -18.14, 178.44], ['Tahiti (Papeete)', -17.54, -149.57],
  ['McMurdo Station', -77.85, 166.67], ['North Pole', 90, 0], ['South Pole', -90, 0], ['Easter Island', -27.11, -109.35], ['Galápagos', -0.95, -90.97], ['Nuuk', 64.18, -51.72], ['Svalbard', 78.22, 15.65], ['Kerguelen Islands', -49.35, 70.22], ['Tristan da Cunha', -37.07, -12.31], ['Hawaii (Hilo)', 19.72, -155.08]];
const OCEANS = [['the Pacific Ocean', 0, -160, 5500], ['the Pacific Ocean', -30, -130, 4500], ['the Pacific Ocean', 30, 170, 4000], ['the Atlantic Ocean', 20, -40, 3000], ['the South Atlantic', -30, -15, 3000], ['the Indian Ocean', -20, 80, 3500], ['the Southern Ocean', -60, 60, 3000], ['the Southern Ocean', -60, -120, 3000], ['the Arctic Ocean', 82, 0, 1500]];
function placeName(lat, lon) {
  let best = null;
  for (const c of CITIES) { const d = gcKm(lat, lon, c[1], c[2]); if (!best || d < best.d) best = { n: c[0], d }; }
  if (best.d < 400) return 'near ' + best.n;
  let oc = null; for (const o of OCEANS) { const d = gcKm(lat, lon, o[1], o[2]); if (d < o[3] && (!oc || d < oc.d)) oc = { n: o[0], d }; }
  return oc ? 'in ' + oc.n + ', ' + fmt(Math.round(dv(best.d))) + ' ' + du() + ' from ' + best.n : fmt(Math.round(dv(best.d))) + ' ' + du() + ' from ' + best.n;
}

const WORLDS = {};
const WSTATE = { chip: ls.get('wchips', {}) };
const wchip = id => WSTATE.chip[id] || 'all';

// ======================================================================
// GROUND X-RAY: earthquakes at their real depth, cities through the Earth, what your line of sight passes through, rock and tunnels under you.
// ======================================================================
WORLDS.ground = (() => {
  const st = { quakes: [], col: null, surf: null, tunnels: [], stations: [], loadedFor: null };
  const LAYERS = [[6336, 'crust'], [5711, 'upper mantle'], [3480, 'lower mantle'], [1220, 'outer core (liquid iron)'], [0, 'inner core (solid iron)']];
  // Lengths of a straight line from you, in your view direction, through each layer of the Earth.
  function rayThrough(dirEnu) {
    const d = enuToEcef(dirEnu), dn = Math.hypot(...d), u = d.map(x => x / dn);
    const O = [S.obs.x, S.obs.y, S.obs.z], R0 = Math.hypot(...O);
    const b = O[0] * u[0] + O[1] * u[1] + O[2] * u[2];
    if (b >= 0) return null; // looking up or level: no ground in that direction
    const tExit = -2 * b * (6371 / R0);
    const hits = (r) => { const c = R0 * R0 - r * r, disc = b * b - c; if (disc < 0) return null; const s = Math.sqrt(disc); return [-b - s, -b + s]; };
    const parts = []; let prevIn = 0;
    const radii = [6371, 6336, 5711, 3480, 1220];
    const names = ['crust', 'upper mantle', 'lower mantle', 'outer core', 'inner core'];
    let total = 0;
    for (let i = 0; i < radii.length; i++) {
      const outer = hits(radii[i]), inner = i + 1 < radii.length ? hits(radii[i + 1]) : null;
      if (!outer) break;
      const len = (outer[1] - Math.max(outer[0], 0)) - (inner ? inner[1] - inner[0] : 0);
      if (len > 0.5) parts.push([names[i], len]);
      total = Math.max(total, outer[1]);
      prevIn = i;
    }
    const exit = [O[0] + u[0] * tExit, O[1] + u[1] * tExit, O[2] + u[2] * tExit], ll = ecefToLL(...exit);
    const deepest = Math.sqrt(Math.max(0, R0 * R0 - b * b));
    return { parts, total: tExit, exitLat: ll[0], exitLon: ll[1], deepest: 6371 - deepest };
  }
  async function load() {
    const key = S.obs.lat.toFixed(2) + ',' + S.obs.lon.toFixed(2);
    if (st.loadedFor === key) return; st.loadedFor = key;
    cachedJSON('usgs', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson', 10 * 60e3).then(j => {
      st.quakes = ((j && j.features) || []).map(f => ({ world: 'ground', kind: 'quake', name: 'M' + (f.properties.mag || 0).toFixed(1) + ' earthquake', mag: f.properties.mag || 0, place: f.properties.place || '', t: f.properties.time, url: f.properties.url, tsunami: f.properties.tsunami, felt: f.properties.felt, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], depth: f.geometry.coordinates[2] || 0 }));
      tonightDirty = true;
    });
    const o = S.obs;
    cachedJSON('mstrat:' + key, 'https://macrostrat.org/api/v2/geologic_units/map?lat=' + o.lat.toFixed(4) + '&lng=' + o.lon.toFixed(4), 30 * 864e5).then(j => { const d = j && j.success && j.success.data; st.surf = d && d[0] || null; cardFor = null; });
    cachedJSON('mcol:' + key, 'https://macrostrat.org/api/v2/units?lat=' + o.lat.toFixed(4) + '&lng=' + o.lon.toFixed(4) + '&response=long', 30 * 864e5).then(j => { const d = j && j.success && j.success.data; st.col = d && d.length ? d.slice().sort((a, b) => a.t_age - b.t_age) : []; cardFor = null; });
    const q = `[out:json][timeout:25];(way(around:2500,${o.lat},${o.lon})["railway"="subway"];way(around:2500,${o.lat},${o.lon})["railway"~"rail|light_rail"]["tunnel"="yes"];way(around:2500,${o.lat},${o.lon})["highway"]["tunnel"="yes"];node(around:2500,${o.lat},${o.lon})["station"="subway"];);out geom;`;
    overpass('tun:' + key, q, 7 * 864e5).then(j => {
      const els = (j && j.elements) || [];
      st.tunnels = els.filter(e => e.type === 'way' && e.geometry).map(e => ({ world: 'ground', kind: 'tunnel', name: (e.tags && (e.tags.name || e.tags.ref)) || (e.tags && e.tags.railway === 'subway' ? 'Subway tunnel' : e.tags && e.tags.highway ? 'Road tunnel' : 'Rail tunnel'), sub: e.tags && e.tags.railway ? (e.tags.railway === 'subway' ? 'Subway' : 'Rail tunnel') : 'Road tunnel', geom: e.geometry }));
      st.stations = els.filter(e => e.type === 'node').map(e => ({ world: 'ground', kind: 'station', name: (e.tags && e.tags.name) || 'Subway station', lat: e.lat, lon: e.lon }));
    });
  }
  // ---------- Peel the Earth: hover in space and look down at each layer in turn ----------
  const PEEL = [
    { name: 'Crust', r: 6370, col: '#9a7650', hot: '#c79a68', depth: '0–35 km (7 km under oceans, up to 70 km under mountains)', temp: 'up to about 1,000 °C at its base', state: 'Solid rock', made: 'granite under continents, basalt under oceans', fact: 'Compared with the whole Earth it is thinner than an apple’s skin. Every mine, well and tunnel ever dug barely scratches it.' },
    { name: 'Upper mantle', r: 6336, col: '#b4472a', hot: '#e0663a', depth: '35–660 km', temp: 'about 500–1,900 °C', state: 'Solid, but it creeps like very stiff putty', made: 'peridotite, rich in green olivine', fact: 'It flows a few centimetres a year. That slow churning drags the continents around and builds mountains.' },
    { name: 'Lower mantle', r: 5711, col: '#c9602c', hot: '#f08a3c', depth: '660–2,890 km', temp: 'about 1,900–3,700 °C', state: 'Solid, squeezed by enormous pressure', made: 'bridgmanite, the most common mineral on Earth', fact: 'The biggest layer: more than half of Earth’s volume. The rock is so compressed that its crystals rearrange into forms that can’t exist at the surface.' },
    { name: 'Outer core', r: 3480, col: '#e8862a', hot: '#ffc04d', depth: '2,890–5,150 km', temp: 'about 4,000–5,700 °C', state: 'Liquid metal', made: 'molten iron and nickel', fact: 'This ocean of liquid metal swirls as the Earth spins, and that motion generates Earth’s magnetic field, the one that makes compasses work and shields us from the solar wind.' },
    { name: 'Inner core', r: 1220, col: '#ff9d2e', hot: '#ffe08a', depth: '5,150–6,371 km', temp: 'about 5,400 °C, as hot as the surface of the Sun', state: 'Solid metal ball', made: 'iron and nickel', fact: 'It is about 70% the size of the Moon. The pressure is so great that the iron stays solid despite the heat. It grows about a millimetre a year as the liquid around it freezes, and it spins slightly out of step with the rest of the planet.' }
  ];
  function sphereOutline(center, r) {
    const cl = Math.hypot(...center), c = center.map(x => x / cl), a = Math.asin(clamp(r / cl, 0, 0.99999));
    let u = [c[1], -c[0], 0]; if (Math.hypot(...u) < 1e-6) u = [1, 0, 0]; const un = Math.hypot(...u); u = u.map(x => x / un);
    const w = [c[1] * u[2] - c[2] * u[1], c[2] * u[0] - c[0] * u[2], c[0] * u[1] - c[1] * u[0]];
    const pts = [];
    for (let k = 0; k <= 72; k++) { const f = k / 72 * 6.283, ca = Math.cos(a), sa = Math.sin(a); pts.push([c[0] * ca + (u[0] * Math.cos(f) + w[0] * Math.sin(f)) * sa, c[1] * ca + (u[1] * Math.cos(f) + w[1] * Math.sin(f)) * sa, c[2] * ca + (u[2] * Math.cos(f) + w[2] * Math.sin(f)) * sa]); }
    return pts;
  }
  function drawPeel(t) {
    // empty space all round: stars below the horizon too, because the planet is see-through
    g.fillStyle = C('#010208'); g.fillRect(0, 0, W, H);
    for (const s of STARS) { if (!s.v) continue; const p = project(s.v); if (!onScreen(p, 4)) continue; g.fillStyle = C(s.col, 0.85); g.beginPath(); g.arc(p.x, p.y, clamp(2.8 - 0.55 * s.mag, 0.8, 3.8), 0, 6.283); g.fill(); }
    const centre = geoEnu(S.obs.lat, S.obs.lon, -6371), pc = project(centre);
    const step = st.peel || 0;
    for (let i = 0; i < PEEL.length; i++) {
      if (i > step) break;
      const L = PEEL[i], pts = sphereOutline(centre, L.r).map(v => project(v)).filter(p => p.ok);
      if (pts.length < 8) continue;
      g.beginPath(); pts.forEach((p, k) => k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath();
      if (i < step) { // see-through shell
        g.fillStyle = C(L.col, 0.025); g.fill(); g.strokeStyle = C(L.hot, 0.45); g.lineWidth = 1.2; g.setLineDash([5, 6]); g.stroke(); g.setLineDash([]);
        continue;
      }
      // the solid layer you are looking at, lit from inside
      let rad = 0; if (pc.ok) for (const p of pts) rad = Math.max(rad, Math.hypot(p.x - pc.x, p.y - pc.y));
      const cx = pc.ok ? pc.x : W / 2, cy = pc.ok ? pc.y : H;
      const gr = g.createRadialGradient(cx - rad * 0.25, cy - rad * 0.3, rad * 0.05, cx, cy, Math.max(rad, 1));
      gr.addColorStop(0, C(L.hot)); gr.addColorStop(0.7, C(L.col)); gr.addColorStop(1, C('#2a0e04'));
      g.fillStyle = gr; g.fill();
      if (rad > 0 && rad < W * 3) {
        g.fillStyle = C(L.hot, 0.18); g.beginPath(); g.arc(cx, cy, rad * 1.25, 0, 6.283); g.fill();
        // spinning: meridian lines sweeping round
        g.save(); g.beginPath(); pts.forEach((p, k) => k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath(); g.clip();
        const spin = Date.now() / 2600;
        for (let k = 0; k < 8; k++) {
          const ph = spin + k * Math.PI / 8, rx = Math.abs(Math.cos(ph)) * rad;
          g.strokeStyle = C('#2a0e04', Math.sin(ph) > 0 ? 0.35 : 0.12); g.lineWidth = 1.2;
          g.beginPath(); g.ellipse(cx, cy, Math.max(rx, 0.5), rad, 0, 0, 6.283); g.stroke();
        }
        for (const lat of [-0.6, -0.3, 0, 0.3, 0.6]) { g.strokeStyle = C('#2a0e04', 0.2); g.beginPath(); g.ellipse(cx, cy + lat * rad, rad * Math.sqrt(1 - lat * lat), rad * 0.18 * Math.sqrt(1 - lat * lat), 0, 0, 6.283); g.stroke(); }
        g.restore();
      }
    }
    if (pc.ok && onScreen(pc, 0) && step === PEEL.length - 1) {
      // nothing else to label; the ball speaks for itself
    }
  }
  function peelHome() {
    const L = PEEL[st.peel || 0];
    return `<div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">${esc(L.name)}</div><div class="card-sub mono">${esc(L.depth.toUpperCase())}</div></div><span class="tag" style="color:${L.hot}">${st.peel + 1} / ${PEEL.length}</span></div>
      <div class="seg" id="peelSeg">${PEEL.map((p, i) => `<button type="button" data-i="${i}" aria-pressed="${i === st.peel}">${esc(p.name.replace('Upper ', 'Up. ').replace('Lower ', 'Low. ').replace('Outer ', 'Out. ').replace('Inner ', 'Inn. '))}</button>`).join('')}</div>
      <div class="about"><div class="kv"><span>State</span><span>${esc(L.state.toUpperCase())}</span></div><div class="kv"><span>Temperature</span><span>${esc(L.temp.toUpperCase())}</span></div><div class="kv"><span>Made of</span><span>${esc(L.made.toUpperCase())}</span></div></div>
      <div class="card-foot"><span>${esc(L.fact)} Look straight down to see it.</span></div>`;
  }
  function draw(now, placed, t, ar) {
    if (wchip('ground') === 'peel') { drawPeel(t); return; }
    // a faint see-through Earth below the horizon
    if (!ar || S.noFeed) {
      const hz = project(vecAA(azOf(viewFwd()), 0));
      const y0 = hz.ok ? clamp(hz.y, -H, 2 * H) : (altOf(viewFwd()) < 0 ? -10 : H + 10);
      const gr = g.createLinearGradient(0, y0, 0, H); gr.addColorStop(0, C('#3a2414', 0.55)); gr.addColorStop(1, C('#1a0d06', 0.85));
      g.fillStyle = gr; g.fillRect(0, Math.max(0, y0), W, H);
    }
    dimStars(0.35);
    const chip = wchip('ground');
    // depth rings straight below you
    // cities through the Earth
    if (chip === 'all' || chip === 'cities') {
      for (const c of CITIES) {
        const v = geoEnu(c[1], c[2], 0), p = project(v); if (!onScreen(p, 10)) continue;
        const chord = Math.hypot(...v);
        g.fillStyle = C('#7cf2d8', 0.9); g.beginPath(); g.arc(p.x, p.y, 3, 0, 6.283); g.fill();
        const o = st.cityObj && st.cityObj[c[0]] || ((st.cityObj = st.cityObj || {})[c[0]] = { world: 'ground', kind: 'city', name: c[0], lat: c[1], lon: c[2] });
        o.v = v;
        hits.push({ x: p.x, y: p.y, r: 22, o, pr: 2 });
        label(placed, p.x, p.y, 4, c[0], kmTxt(chord) + (altOf(v) < 0 ? ' THROUGH EARTH' : ''), C('#e6fff8'), C('#7cc9b4'), 2);
      }
    }
    // earthquakes at their real depth
    if (chip === 'all' || chip === 'quakes') {
      const nowMs = Date.now();
      const qs = st.quakes.slice().sort((a, b) => b.mag - a.mag);
      for (const q of qs) {
        q.v = geoEnu(q.lat, q.lon, -q.depth); const p = project(q.v); if (!onScreen(p, 20)) continue;
        const ageH = (nowMs - q.t) / 3600e3, col = ageH < 24 ? '#ff6b5e' : ageH < 72 ? '#ffb45a' : '#ffd37a';
        const r = clamp(2 + (q.mag - 2.5) * 3.2, 3, 22);
        g.strokeStyle = C(col, 0.9); g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, r, 0, 6.283); g.stroke();
        g.fillStyle = C(col, 0.25); g.fill();
        if (ageH < 6) { const ph = (t % 2000) / 2000; g.strokeStyle = C(col, 0.7 * (1 - ph)); g.beginPath(); g.arc(p.x, p.y, r + ph * 22, 0, 6.283); g.stroke(); }
        hits.push({ x: p.x, y: p.y, r: Math.max(18, r + 4), o: q, pr: 4 });
        if (q.mag >= 4.5 || q === S.sel) label(placed, p.x, p.y, r + 2, 'M' + q.mag.toFixed(1) + ' · ' + (ageH < 1 ? Math.round(ageH * 60) + ' min ago' : ageH < 48 ? Math.round(ageH) + ' h ago' : Math.round(ageH / 24) + ' d ago'), Math.round(dv(q.depth)) + ' ' + DU() + ' DEEP · ' + kmTxt(Math.hypot(...q.v)) + ' AWAY', C('#ffffff'), C(col), 4, q === S.sel);
        if (q === S.sel) drawReticle(p, t, col);
      }
    }
    // tunnels and stations right under you
    if (chip === 'all' || chip === 'under') {
      for (const tn of st.tunnels) {
        const pts = tn.geom.map(n => geoEnu(n.lat, n.lon, -0.018));
        polyline(pts, C(tn.sub === 'Subway' ? '#5ad1ff' : '#c9a8ff', 0.85), 2.5);
        const mid = pts[pts.length >> 1]; tn.v = mid; const p = project(mid);
        if (onScreen(p, 0)) { hits.push({ x: p.x, y: p.y, r: 26, o: tn, pr: 3 }); label(placed, p.x, p.y, 4, tn.name, tn.sub.toUpperCase() + ' · ~18 M DOWN', C('#e6f6ff'), C('#5ad1ff'), 3); }
      }
      for (const sn of st.stations) {
        sn.v = geoEnu(sn.lat, sn.lon, -0.015); const p = project(sn.v); if (!onScreen(p, 4)) continue;
        g.fillStyle = C('#5ad1ff'); g.fillRect(p.x - 4, p.y - 4, 8, 8);
        hits.push({ x: p.x, y: p.y, r: 22, o: sn, pr: 3 }); label(placed, p.x, p.y, 6, sn.name, kmTxt(Math.hypot(...sn.v)) + ' AWAY', C('#e6f6ff'), C('#5ad1ff'), 3);
      }
    }
    // straight down: the centre of the Earth and the point on the far side
    const down = geoEnu(S.obs.lat, S.obs.lon, -6371), pd = project(down);
    if (onScreen(pd, 0)) {
      g.strokeStyle = C('#ffd37a', 0.9); g.lineWidth = 1.5; g.beginPath(); g.arc(pd.x, pd.y, 14, 0, 6.283); g.stroke();
      g.beginPath(); g.moveTo(pd.x - 20, pd.y); g.lineTo(pd.x + 20, pd.y); g.moveTo(pd.x, pd.y - 20); g.lineTo(pd.x, pd.y + 20); g.stroke();
      const anti = { world: 'ground', kind: 'antipode', name: 'Straight down', lat: -S.obs.lat, lon: wrap180(S.obs.lon + 180), v: down };
      hits.push({ x: pd.x, y: pd.y, r: 30, o: anti, pr: 5 });
      label(placed, pd.x, pd.y, 16, 'Centre of the Earth', kmTxt(6371) + ' DOWN · FAR SIDE ' + kmTxt(12742), C('#ffffff'), C('#ffd37a'), 6, true);
    }
  }
  function home(now) {
    if (wchip('ground') === 'peel') return peelHome();
    const f = viewFwd(), r = rayThrough(f);
    if (!r) return `<div class="card-head"><div style="flex:1"><div class="card-title">Ground X-ray</div><div class="card-sub mono">POINT YOUR PHONE AT THE GROUND</div></div></div><div class="card-foot"><span>Tilt the phone down to see earthquakes at their real depth, cities through the planet, and what your line of sight passes through.</span></div>${rockHTML()}`;
    return `<div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">Your line of sight</div><div class="card-sub mono">LOOKING ${Math.round(-altOf(f))}° DOWN, ${cardinal(azOf(f))} · ${kmTxt(r.total)} OF ROCK</div></div></div>
      <div class="about"><span class="muted" style="font-size:11px">A straight line goes through the outer layers twice, on the way in and on the way out.</span>${r.parts.map(p => `<div class="kv"><span>${esc(p[0])}</span><span>${kmTxt(p[1])}</span></div>`).join('')}<div class="kv"><span>Deepest point</span><span>${kmTxt(r.deepest)} BELOW THE SURFACE</span></div></div>
      <div class="card-foot"><span>It comes out ${esc(placeName(r.exitLat, r.exitLon))}.</span></div>${rockHTML()}`;
  }
  function homeCompact(now) {
    if (wchip('ground') === 'peel') { const L = PEEL[st.peel || 0]; return `<div class="seg" id="peelSeg">${PEEL.map((p, i) => `<button type="button" data-i="${i}" aria-pressed="${i === st.peel}">${esc(p.name.split(' ').map(w => w[0].toUpperCase() + w.slice(1, 4)).join(' '))}</button>`).join('')}</div><button type="button" class="mini"><b>${esc(L.name)}</b><span class="mono">${esc(L.depth.split(' (')[0].toUpperCase())} · ${esc(L.state.split(',')[0].toUpperCase())}</span></button>`; }
    const f = viewFwd(), r = rayThrough(f);
    return `<button type="button" class="mini"><b>${r ? 'Through ' + kmTxt(r.total) : 'Point down'}</b><span class="mono">${r ? esc(('EXITS ' + placeName(r.exitLat, r.exitLon)).toUpperCase()) : 'TILT TO SEE THROUGH THE EARTH'}</span></button>`;
  }
  function rockHTML() {
    const s = st.surf, c = st.col;
    if (!s && !(c && c.length)) return '<div class="about"><span class="muted" style="font-size:12px">Looking up the rock under you…</span></div>';
    let h = '<div class="about"><b>Under your feet</b>';
    if (s) h += `<div class="kv"><span>${esc(s.name || s.strat_name || 'Surface rock')}</span><span>${esc((s.lith || '').slice(0, 40))}${s.t_int_age != null ? ' · ' + fmt(Math.round(s.t_int_age)) + '–' + fmt(Math.round(s.b_int_age)) + ' MYR' : ''}</span></div>`;
    if (c && c.length) {
      let depth = 0;
      for (const u of c.slice(0, 7)) { const th = u.max_thick || u.min_thick || 0; h += `<div class="kv"><span>${esc(u.unit_name || u.strat_name_long || 'Layer')}</span><span>${fmt(Math.round(depth))}–${fmt(Math.round(depth + th))} M · ${fmt(Math.round(u.t_age))}–${fmt(Math.round(u.b_age))} MYR</span></div>`; depth += th; }
    }
    return h + '<span class="muted" style="font-size:11px">Rock data: Macrostrat. Ages in millions of years.</span></div>';
  }
  function card(o, now) {
    const close = '<button type="button" id="cardClose" aria-label="Close details">×</button>';
    if (o.kind === 'quake') {
      const ageH = (Date.now() - o.t) / 3600e3, dist = Math.hypot(...geoEnu(o.lat, o.lon, -o.depth)), surf = gcKm(S.obs.lat, S.obs.lon, o.lat, o.lon);
      return close + `<div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">${esc(o.name)}</div><div class="card-sub mono">${esc(o.place.toUpperCase())}</div></div>${o.tsunami ? '<span class="tag" style="color:#ff8a7a">Tsunami alert</span>' : ''}</div>
        <div class="stats">${stat('MAG', o.mag.toFixed(1))}${stat('DEPTH', fmt(Math.round(dv(o.depth))), du())}${stat('AWAY', fmt(Math.round(dv(surf))), du())}${stat('WHEN', ageH < 48 ? Math.round(ageH) + ' h' : Math.round(ageH / 24) + ' d', 'ago')}</div>
        <div class="card-foot"><span>${new Date(o.t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}. Straight-line distance through the Earth to where it broke: ${kmTxt(dist)}.${o.felt ? ' ' + fmt(o.felt) + ' people reported feeling it.' : ''}</span></div>
        <div class="card-actions"><a class="btn small" href="${esc(o.url)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;text-decoration:none">USGS details</a></div>`;
    }
    if (o.kind === 'city' || o.kind === 'antipode') {
      const v = o.v || geoEnu(o.lat, o.lon, 0), chord = Math.hypot(...v), surf = gcKm(S.obs.lat, S.obs.lon, o.lat, o.lon), depth = 6371 - Math.sqrt(Math.max(0, 6371 * 6371 - (chord / 2) ** 2));
      return close + `<div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">${esc(o.kind === 'antipode' ? 'The far side of the Earth' : o.name)}</div><div class="card-sub mono">${o.kind === 'antipode' ? esc(placeName(o.lat, o.lon).toUpperCase()) : 'THROUGH THE EARTH'}</div></div></div>
        <div class="stats">${stat('STRAIGHT', fmt(Math.round(dv(chord))), du())}${stat('SURFACE', fmt(Math.round(dv(surf))), du())}${stat('DEEPEST', fmt(Math.round(dv(depth))), du())}${stat('DOWN', Math.max(0, -altOf(v)).toFixed(0), '°')}</div>
        <div class="card-foot"><span>A tunnel straight there would bottom out ${kmTxt(depth)} down. If you dropped a ball into it (no air, no friction) gravity alone would get it there in about 42 minutes, whatever the distance.</span></div>`;
    }
    if (o.kind === 'tunnel' || o.kind === 'station') {
      const d = Math.hypot(...(o.v || [0, 0, 0]));
      return close + `<div class="card-head"><div style="flex:1"><div class="card-title">${esc(o.name)}</div><div class="card-sub mono">${esc((o.sub || 'Subway station').toUpperCase())} · ABOUT 15–20 M DOWN</div></div></div><div class="card-foot"><span>${kmTxt(d)} from you. Depth is a typical value; tunnels vary.</span></div><span class="muted" style="font-size:11px">Map data © OpenStreetMap contributors</span>`;
    }
    return '';
  }
  function compact(o, now) {
    const close = '<button type="button" id="cardClose" aria-label="Close details">×</button>';
    const sub = o.kind === 'quake' ? esc(o.place.toUpperCase()) : o.kind === 'city' ? kmTxt(Math.hypot(...(o.v || [0, 0, 0]))) + ' THROUGH THE EARTH' : '';
    return close + `<button type="button" class="mini"><b>${esc(o.kind === 'antipode' ? 'Far side of the Earth' : o.name)}</b><span class="mono">${sub}</span></button>`;
  }
  return {
    id: 'ground', name: 'Ground X-ray', sub: 'Earthquakes, cities and rock through the planet', below: true, icon: '<path d="M3 9h18M5 14h14M8 19h8"/><circle cx="12" cy="5" r="2"/>',
    start: load, stop() { if (st.peelFeed) { st.peelFeed = false; S.noFeed = false; cam.classList.remove('nofeed'); } }, draw, home, homeCompact, card, compact,
    wireHome(card) { $$('#peelSeg button', card).forEach(b => b.onclick = e => { e.stopPropagation(); st.peel = +b.dataset.i; cardFor = null; updateCard(simNow(), true); }); },
    onChip(id) {
      if (id === 'peel') { st.peel = st.peel || 0; if (!S.noFeed) { st.peelFeed = true; S.noFeed = true; cam.classList.add('nofeed'); } S.collapse.worldhome = true; if (S.mode === 'sky') S.viewAlt = -89; toast('Peel the Earth: you’re floating in space. Look straight down.'); }
      else if (st.peelFeed) { st.peelFeed = false; S.noFeed = false; cam.classList.remove('nofeed'); }
      cardFor = null;
    },
    chips: [['all', 'Everything'], ['quakes', 'Earthquakes'], ['cities', 'Cities'], ['under', 'Under me'], ['peel', 'Peel the Earth']],
    hud: () => '<b>' + st.quakes.length + '</b> QUAKES THIS WEEK',
    view: { alt: -35 }
  };
})();

// ======================================================================
// INVISIBLE INFRASTRUCTURE: the geostationary belt, navigation satellites, cell and broadcast towers, power lines, data centres.
// ======================================================================
WORLDS.infra = (() => {
  const st = { towers: [], power: [], subs: [], dcs: [], loadedFor: null, at: 0 };
  async function load() {
    for (const gid of ['geo', 'gnss']) if (!Sats.status[gid]) loadGroup(gid);
    const key = S.obs.lat.toFixed(2) + ',' + S.obs.lon.toFixed(2);
    if (st.loadedFor === key) return; st.loadedFor = key;
    const o = S.obs, L = o.lat, N = o.lon;
    const q = `[out:json][timeout:25];(node(around:7000,${L},${N})["man_made"~"^(mast|tower|communications_tower)$"];way(around:7000,${L},${N})["man_made"~"^(mast|tower|communications_tower)$"];node(around:7000,${L},${N})["telecom"~"data_center|exchange"];way(around:7000,${L},${N})["telecom"="data_center"];node(around:5000,${L},${N})["power"="substation"];way(around:5000,${L},${N})["power"="substation"];way(around:3500,${L},${N})["power"~"^(line|minor_line)$"];);out geom;`;
    const j = await overpass('infra:' + key, q, 7 * 864e5);
    const els = (j && j.elements) || [];
    const center = e => e.lat != null ? [e.lat, e.lon] : e.geometry ? [e.geometry.reduce((a, n) => a + n.lat, 0) / e.geometry.length, e.geometry.reduce((a, n) => a + n.lon, 0) / e.geometry.length] : null;
    for (const e of els) {
      const t = e.tags || {}, c = center(e); if (!c) continue;
      if (/mast|tower/.test(t.man_made || '')) {
        const comm = t['tower:type'] || (t['communication:mobile_phone'] ? 'communication' : '') || (t['communication:radio'] || t['communication:television'] ? 'broadcasting' : '');
        if (!comm && !/communications_tower/.test(t.man_made)) continue;
        const kind = /broadcast|radio|television/.test(comm) || t['communication:television'] || t['communication:radio'] ? 'Broadcast tower' : 'Cell / radio mast';
        st.towers.push({ world: 'infra', kind: 'tower', name: t.name || kind, type: kind, op: t.operator || t['operator:wikidata'] && '' || '', h: parseFloat(t.height) || 40, lat: c[0], lon: c[1], tags: t });
      } else if (/data_center|exchange/.test(t.telecom || '')) st.dcs.push({ world: 'infra', kind: 'dc', name: t.name || (t.telecom === 'exchange' ? 'Telephone exchange' : 'Data centre'), op: t.operator || '', lat: c[0], lon: c[1] });
      else if (t.power === 'substation') st.subs.push({ world: 'infra', kind: 'sub', name: t.name || 'Electrical substation', op: t.operator || '', volt: t.voltage || '', lat: c[0], lon: c[1] });
      else if (/line/.test(t.power || '') && e.geometry) st.power.push({ world: 'infra', kind: 'power', name: t.name || (t.power === 'line' ? 'High-voltage line' : 'Power line'), volt: t.voltage || '', op: t.operator || '', geom: e.geometry, h: t.power === 'line' ? 0.03 : 0.012 });
    }
    cardFor = null;
  }
  // geostationary and navigation satellites (computed here every second)
  function satsOf(gid) { return Sats.list.filter(s => s.groups.has(gid)); }
  function updateSatsHere(now) {
    if (now.getTime() - st.at < 1000) return; st.at = now.getTime();
    if (!S.libs.sat) return;
    const ctx = epochCtx(now);
    for (const s of satsOf('geo').concat(satsOf('gnss'))) computeSat(s, ctx);
  }
  function draw(now, placed, t, ar) {
    dimStars(0.4);
    const chip = wchip('infra');
    if (chip === 'all' || chip === 'space') {
      updateSatsHere(now);
      // the Clarke belt: 35,786 km above the equator
      const belt = []; for (let d = -82; d <= 82; d += 2) belt.push(geoEnu(0, S.obs.lon + d, 35786));
      polyline(belt.filter(v => altOf(v) > -2), C('#ffd37a', 0.6), 2, [8, 6]);
      const top = geoEnu(0, S.obs.lon, 35786), pt = project(top);
      if (onScreen(pt, 0)) label(placed, pt.x, pt.y, 8, 'Geostationary belt', 'EVERY SATELLITE DISH AIMS AT THIS ARC', C('#ffffff'), C('#ffd37a'), 6, true);
      const beltObj = { world: 'infra', kind: 'belt', name: 'Geostationary belt', v: top };
      if (onScreen(pt, 0)) hits.push({ x: pt.x, y: pt.y, r: 30, o: beltObj, pr: 2 });
      for (const s of satsOf('geo')) {
        if (!s.ok || !s.v || s.v[2] < 0) continue; const p = project(s.v); if (!onScreen(p, 4)) continue;
        g.fillStyle = C('#ffd37a'); g.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
        hits.push({ x: p.x, y: p.y, r: 16, o: Object.assign(s, { world: 'infra' }), pr: 3 });
        if (/DIRECTV|ECHOSTAR|SES|INTELSAT|GALAXY|GOES|SIRIUS|XM|TELSTAR|ANIK|AMC|EUTELSAT|ASTRA|NILESAT|ARABSAT|HISPASAT|STAR ONE|VIASAT|JUPITER/.test(s.name)) label(placed, p.x, p.y, 3, prettyName(s.name), 'GEO · ' + kmTxt(s.range), C('#fff1d6'), C('#c9b58c'), 2);
        if (s === S.sel) drawReticle(p, t, '#ffd37a');
      }
      for (const s of satsOf('gnss')) {
        if (!s.ok || !s.v || s.v[2] < 0) continue; const p = project(s.v); if (!onScreen(p, 4)) continue;
        g.strokeStyle = C('#7cf2b0'); g.lineWidth = 1.4; g.beginPath(); g.moveTo(p.x, p.y - 5); g.lineTo(p.x + 5, p.y); g.lineTo(p.x, p.y + 5); g.lineTo(p.x - 5, p.y); g.closePath(); g.stroke();
        hits.push({ x: p.x, y: p.y, r: 18, o: Object.assign(s, { world: 'infra' }), pr: 3 });
        label(placed, p.x, p.y, 6, prettyName(s.name), 'NAVIGATION · ' + kmTxt(s.h), C('#e6fff0'), C('#7cc9a0'), 3);
        if (s === S.sel) drawReticle(p, t, '#7cf2b0');
      }
    }
    if (chip === 'all' || chip === 'power') {
      for (const pl of st.power) { const pts = pl.geom.map(n => geoEnu(n.lat, n.lon, pl.h)); polyline(pts, C('#ffb45a', 0.75), pl.h > 0.02 ? 2 : 1.2); const mid = pts[pts.length >> 1]; pl.v = mid; const p = project(mid); if (onScreen(p, 0)) { hits.push({ x: p.x, y: p.y, r: 24, o: pl, pr: 2 }); if (pl.h > 0.02) label(placed, p.x, p.y, 4, pl.name, (pl.volt ? Math.round(+pl.volt.split(';')[0] / 1000) + ' KV · ' : '') + kmTxt(Math.hypot(...mid)), C('#fff1d6'), C('#ffb45a'), 2); } }
      for (const sb of st.subs) { sb.v = geoEnu(sb.lat, sb.lon, 0.005); const p = project(sb.v); if (!onScreen(p, 4)) continue; g.strokeStyle = C('#ffb45a'); g.lineWidth = 1.5; g.strokeRect(p.x - 5, p.y - 5, 10, 10); hits.push({ x: p.x, y: p.y, r: 20, o: sb, pr: 3 }); label(placed, p.x, p.y, 6, sb.name, 'SUBSTATION · ' + kmTxt(Math.hypot(...sb.v)), C('#fff1d6'), C('#ffb45a'), 3); }
    }
    if (chip === 'all' || chip === 'towers') {
      for (const tw of st.towers) {
        tw.v = geoEnu(tw.lat, tw.lon, tw.h / 1000); const p = project(tw.v); if (!onScreen(p, 4)) continue;
        const col = tw.type === 'Broadcast tower' ? '#ff9ad0' : '#5ad1ff', d = Math.hypot(...tw.v);
        g.strokeStyle = C(col); g.lineWidth = 1.5; g.beginPath(); g.moveTo(p.x, p.y + 9); g.lineTo(p.x, p.y - 4); g.moveTo(p.x - 5, p.y + 9); g.lineTo(p.x, p.y - 4); g.lineTo(p.x + 5, p.y + 9); g.stroke();
        const ph = ((t + tw.lat * 1e5) % 1800) / 1800; g.strokeStyle = C(col, 0.6 * (1 - ph)); g.beginPath(); g.arc(p.x, p.y - 4, 4 + ph * 14, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
        hits.push({ x: p.x, y: p.y, r: 20, o: tw, pr: 4 });
        label(placed, p.x, p.y, 8, tw.op || tw.type, (tw.op ? tw.type.toUpperCase() + ' · ' : '') + kmTxt(d), C('#ffffff'), C(col), 4);
        if (tw === S.sel) drawReticle(p, t, col);
      }
      for (const dc of st.dcs) { dc.v = geoEnu(dc.lat, dc.lon, 0.01); const p = project(dc.v); if (!onScreen(p, 4)) continue; g.fillStyle = C('#c9a8ff'); g.fillRect(p.x - 4, p.y - 4, 8, 8); hits.push({ x: p.x, y: p.y, r: 20, o: dc, pr: 3 }); label(placed, p.x, p.y, 6, dc.name, (dc.op ? dc.op.toUpperCase() + ' · ' : '') + kmTxt(Math.hypot(...dc.v)), C('#f1e8ff'), C('#c9a8ff'), 3); }
    }
  }
  function card(o, now) {
    const close = '<button type="button" id="cardClose" aria-label="Close details">×</button>';
    if (o.kind === 'sat') {
      const v = o.v || [0, 1, 0], geo = o.groups.has('geo');
      return close + `<div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">${esc(prettyName(o.name))}</div><div class="card-sub mono">${geo ? 'GEOSTATIONARY · HANGS STILL IN YOUR SKY' : 'NAVIGATION SATELLITE'} · NORAD ${o.id}</div></div></div>
        <div class="stats">${stat('AZ', azOf(v).toFixed(1), '°')}${stat('ELEV', altOf(v).toFixed(1), '°')}${stat('ALT', fmt(Math.round(dv(o.h))), du())}${stat('SIGNAL', (o.range / 299792).toFixed(3), 's')}</div>
        <div class="card-foot"><span>${geo ? `To aim a satellite dish at it, point it to compass bearing ${azOf(v).toFixed(1)}° true (${cardinal(azOf(v))}) and tilt it ${altOf(v).toFixed(1)}° up.` : 'Your phone’s GPS may be using this one right now. It takes about 12 hours to circle the Earth.'}</span></div>${aboutHTML(o)}`;
    }
    if (o.kind === 'belt') return close + `<div class="card-head"><div style="flex:1"><div class="card-title">The geostationary belt</div><div class="card-sub mono">35,786 KM ABOVE THE EQUATOR</div></div></div><div class="card-foot"><span>At exactly this height a satellite circles the Earth once a day, so it seems to hang still in your sky. That is why satellite TV dishes never move. Hundreds of TV, weather and military satellites sit along this arc.</span></div>`;
    if (o.kind === 'tower') {
      const t = o.tags || {}, d = Math.hypot(...(o.v || [0, 0, 0]));
      const extra = ['height', 'communication:mobile_phone', 'communication:television', 'communication:radio', 'communication:microwave'].filter(k => t[k]).map(k => `<div class="kv"><span>${esc(k.replace('communication:', '').replace('_', ' '))}</span><span>${esc(t[k])}</span></div>`).join('');
      return close + `<div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">${esc(o.name)}</div><div class="card-sub mono">${esc(o.type.toUpperCase())}${o.op ? ' · ' + esc(o.op.toUpperCase()) : ''}</div></div></div><div class="stats">${stat('AWAY', fmt(dv(d).toFixed(1)), du())}${stat('BEARING', azOf(o.v || [0, 1, 0]).toFixed(0), '°')}${stat('HEIGHT', Math.round(o.h), 'm')}${stat('ELEV', altOf(o.v || [0, 1, 0]).toFixed(1), '°')}</div>${extra ? '<div class="about">' + extra + '</div>' : ''}<span class="muted" style="font-size:11px">Map data © OpenStreetMap contributors. Not every mast is mapped.</span>`;
    }
    if (o.kind === 'power' || o.kind === 'sub' || o.kind === 'dc') {
      const d = Math.hypot(...(o.v || [0, 0, 0]));
      return close + `<div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">${esc(o.name)}</div><div class="card-sub mono">${o.volt ? esc(o.volt.split(';').map(v => Math.round(+v / 1000) + ' kV').join(' / ')) + ' · ' : ''}${o.op ? esc(o.op.toUpperCase()) + ' · ' : ''}${kmTxt(d)} AWAY</div></div></div><div class="card-foot"><span>${o.kind === 'power' ? 'High-voltage lines carry power from plants to substations, which step it down for your street.' : o.kind === 'sub' ? 'Substations step high-voltage power down to the levels your neighbourhood uses.' : 'Where the internet you use physically lives: servers, routers and cooling.'}</span></div><span class="muted" style="font-size:11px">Map data © OpenStreetMap contributors</span>`;
    }
    return '';
  }
  function compact(o) {
    const close = '<button type="button" id="cardClose" aria-label="Close details">×</button>';
    const v = o.v || [0, 1, 0];
    return close + `<button type="button" class="mini"><b>${esc(o.kind === 'sat' ? prettyName(o.name) : o.name)}</b><span class="mono">${o.kind === 'sat' ? 'AZ ' + azOf(v).toFixed(1) + '° · ELEV ' + altOf(v).toFixed(1) + '°' : kmTxt(Math.hypot(...v)) + ' AWAY'}</span></button>`;
  }
  return {
    id: 'infra', name: 'Invisible infrastructure', sub: 'Satellite belts, towers, power lines, data centres', icon: '<path d="M12 21V9"/><path d="M8 21l4-12 4 12"/><path d="M7 6a7 7 0 0 1 10 0M4.5 3.5a11 11 0 0 1 15 0"/>',
    start: load, stop() {}, draw, card, compact,
    chips: [['all', 'Everything'], ['space', 'Satellites'], ['towers', 'Towers'], ['power', 'Power grid']],
    hud: () => '<b>' + st.towers.length + '</b> TOWERS · <b>' + st.power.length + '</b> LINES',
    view: { alt: 25 }
  };
})();

// ======================================================================
// CONTRAIL ID: live aircraft, and where their contrails are now after drifting on the high-altitude wind.
// ======================================================================
WORLDS.contrail = (() => {
  const st = { planes: [], at: 0, src: '', wind: null, busy: false, err: '' };
  const AIRLINES = { AAL: 'American', DAL: 'Delta', UAL: 'United', JBU: 'JetBlue', SWA: 'Southwest', ASA: 'Alaska', NKS: 'Spirit', FFT: 'Frontier', AAY: 'Allegiant', SKW: 'SkyWest', RPA: 'Republic', ENY: 'Envoy', JIA: 'PSA', EDV: 'Endeavor', ASH: 'Mesa', FDX: 'FedEx', UPS: 'UPS', GTI: 'Atlas Air', ACA: 'Air Canada', WJA: 'WestJet', BAW: 'British Airways', VIR: 'Virgin Atlantic', AFR: 'Air France', DLH: 'Lufthansa', KLM: 'KLM', UAE: 'Emirates', QTR: 'Qatar Airways', ETD: 'Etihad', THY: 'Turkish', SWR: 'Swiss', AUA: 'Austrian', SAS: 'SAS', ICE: 'Icelandair', EIN: 'Aer Lingus', IBE: 'Iberia', TAP: 'TAP Portugal', AZA: 'ITA', RYR: 'Ryanair', EZY: 'easyJet', AMX: 'Aeroméxico', VOI: 'Volaris', CMP: 'Copa', AVA: 'Avianca', LAN: 'LATAM', TAM: 'LATAM Brasil', KAL: 'Korean Air', AAR: 'Asiana', ANA: 'ANA', JAL: 'Japan Airlines', CPA: 'Cathay Pacific', SIA: 'Singapore Airlines', QFA: 'Qantas', ANZ: 'Air New Zealand', ETH: 'Ethiopian', CLX: 'Cargolux', ABX: 'ABX Air', PAC: 'Polar Air', CKS: 'Kalitta', EJA: 'NetJets', XOJ: 'XOJET', LXJ: 'Flexjet', CES: 'China Eastern', CCA: 'Air China', CSN: 'China Southern', AIC: 'Air India', ELY: 'El Al', SVA: 'Saudia', RAM: 'Royal Air Maroc', SAA: 'South African' };
  const TYPES = { B738: 'Boeing 737-800', B739: 'Boeing 737-900', B737: 'Boeing 737-700', B38M: 'Boeing 737 MAX 8', B39M: 'Boeing 737 MAX 9', B752: 'Boeing 757-200', B753: 'Boeing 757-300', B763: 'Boeing 767-300', B764: 'Boeing 767-400', B772: 'Boeing 777-200', B77W: 'Boeing 777-300ER', B77L: 'Boeing 777-200LR', B788: 'Boeing 787-8', B789: 'Boeing 787-9', B78X: 'Boeing 787-10', B744: 'Boeing 747-400', B748: 'Boeing 747-8', A319: 'Airbus A319', A320: 'Airbus A320', A20N: 'Airbus A320neo', A321: 'Airbus A321', A21N: 'Airbus A321neo', A332: 'Airbus A330-200', A333: 'Airbus A330-300', A339: 'Airbus A330-900neo', A359: 'Airbus A350-900', A35K: 'Airbus A350-1000', A388: 'Airbus A380', BCS1: 'Airbus A220-100', BCS3: 'Airbus A220-300', E75L: 'Embraer 175', E75S: 'Embraer 175', E170: 'Embraer 170', E190: 'Embraer 190', E290: 'Embraer E190-E2', CRJ2: 'Bombardier CRJ200', CRJ7: 'Bombardier CRJ700', CRJ9: 'Bombardier CRJ900', DH8D: 'Dash 8-400', AT76: 'ATR 72-600', MD11: 'McDonnell Douglas MD-11', GLF6: 'Gulfstream G650', GLEX: 'Bombardier Global Express', C68A: 'Cessna Citation Latitude', CL35: 'Challenger 350', PC12: 'Pilatus PC-12', C172: 'Cessna 172' };
  async function poll() {
    if (st.busy || Date.now() - st.at < 10000 || !S.obs) return; st.busy = true;
    const o = S.obs, nm = 110, lat = o.lat.toFixed(3), lon = o.lon.toFixed(3);
    const srcs = [['adsb.fi', `https://opendata.adsb.fi/api/v3/lat/${lat}/lon/${lon}/dist/${nm}`], ['adsb.lol', `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${nm}`], ['airplanes.live', `https://api.airplanes.live/v2/point/${lat}/${lon}/${nm}`]];
    for (const [name, url] of srcs) {
      try {
        const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status);
        const j = await r.json(), ac = j.ac || j.aircraft || [];
        const now = Date.now();
        st.planes = ac.filter(a => a.lat != null && a.lon != null && typeof a.alt_baro === 'number').map(a => {
          const old = st.planes.find(p => p.hex === a.hex);
          const pl = old || { world: 'contrail', kind: 'plane', hex: a.hex };
          return Object.assign(pl, { name: (a.flight || '').trim() || a.r || a.hex, call: (a.flight || '').trim(), reg: a.r || '', type: a.t || '', desc: a.desc || '', lat: a.lat, lon: a.lon, altFt: a.alt_baro, gs: a.gs || 0, track: a.track != null ? a.track : a.true_heading || 0, vrate: a.baro_rate || 0, sq: a.squawk || '', fix: now - ((a.seen_pos || 0) * 1000) });
        });
        st.src = name; st.err = ''; st.at = Date.now(); st.busy = false; return;
      } catch (e) { st.err = 'Could not reach live aircraft data.'; }
    }
    st.at = Date.now(); st.busy = false;
  }
  async function loadWind() {
    const o = S.obs;
    const j = await cachedJSON('wind250:' + o.lat.toFixed(1) + ',' + o.lon.toFixed(1), 'https://api.open-meteo.com/v1/forecast?latitude=' + o.lat.toFixed(2) + '&longitude=' + o.lon.toFixed(2) + '&hourly=wind_speed_250hPa,wind_direction_250hPa,temperature_250hPa,relative_humidity_250hPa&forecast_days=1&timezone=auto', 3600e3);
    if (!j || !j.hourly) return;
    const off = (j.utc_offset_seconds || 0) * 1000; let best = 0, bd = 1e15;
    j.hourly.time.forEach((tt, i) => { const d = Math.abs(Date.parse(tt + ':00Z') - off - Date.now()); if (d < bd) { bd = d; best = i; } });
    st.wind = { spd: j.hourly.wind_speed_250hPa[best] / 3.6, dir: j.hourly.wind_direction_250hPa[best], temp: j.hourly.temperature_250hPa[best], rh: j.hourly.relative_humidity_250hPa[best] };
  }
  // Rough contrail outlook from temperature and humidity at cruise height.
  function outlook() {
    const w = st.wind; if (!w) return { txt: 'unknown', mins: 15 };
    if (w.temp > -40) return { txt: 'unlikely (too warm up there)', mins: 1 };
    if (w.rh >= 70) return { txt: 'long-lasting, spreading', mins: 40 };
    if (w.rh >= 50) return { txt: 'medium, a few minutes', mins: 12 };
    return { txt: 'short, fading fast', mins: 3 };
  }
  // Where a plane is now (projected forward from its last report) and where its contrail is.
  function planeNow(p, t) {
    const dtS = (t - p.fix) / 1000, v = p.gs * 0.5144;
    const e = v * Math.sin(p.track * D2R) * dtS, n = v * Math.cos(p.track * D2R) * dtS;
    const ll = offsetLL(p.lat, p.lon, e, n);
    return geoEnu(ll[0], ll[1], p.altFt * 0.0003048);
  }
  function trail(p, t, mins) {
    const out = [], v = p.gs * 0.5144, w = st.wind || { spd: 0, dir: 0 };
    const we = -w.spd * Math.sin(w.dir * D2R), wn = -w.spd * Math.cos(w.dir * D2R); // wind blows towards the opposite of "from"
    const dt0 = (t - p.fix) / 1000;
    for (let k = 0; k <= mins * 60; k += 20) {
      const back = dt0 - k; // seconds of flight from the last report to the time this bit of trail was made
      const e = v * Math.sin(p.track * D2R) * back + we * k, n = v * Math.cos(p.track * D2R) * back + wn * k;
      const ll = offsetLL(p.lat, p.lon, e, n); out.push({ k, v: geoEnu(ll[0], ll[1], p.altFt * 0.0003048 - k * 0.0005) });
    }
    return out;
  }
  function draw(now, placed, t, ar) {
    poll();
    if (!st.wind && !st.windBusy) { st.windBusy = true; loadWind(); }
    dimStars(0.35);
    const chip = wchip('contrail'), ol = outlook();
    const real = Date.now();
    for (const p of st.planes) {
      const cruise = p.altFt >= 26000;
      if (chip === 'contrail' && !cruise) continue;
      if (chip === 'low' && p.altFt > 10000) continue;
      const v = planeNow(p, real); p.v = v;
      if (altOf(v) < 0) continue;
      // ghost contrail
      if (cruise && ol.mins > 1) {
        const tr = trail(p, real, ol.mins);
        g.lineCap = 'round';
        for (let i = 1; i < tr.length; i++) {
          const a = project(tr[i - 1].v), b = project(tr[i].v); if (!a.ok || !b.ok) continue;
          const age = tr[i].k / (ol.mins * 60);
          g.strokeStyle = C('#ffffff', 0.55 * (1 - age)); g.lineWidth = 2 + age * 5; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
          if (i % 3 === 0 && onScreen(b, 0)) hits.push({ x: b.x, y: b.y, r: 18, o: p, pr: 1, ago: tr[i].k });
        }
        g.lineCap = 'butt';
      }
      const pp = project(v); if (!onScreen(pp, 10)) continue;
      // plane glyph pointing along its screen motion
      const ahead = project(geoEnu(...offsetLL(p.lat, p.lon, Math.sin(p.track * D2R) * 3000, Math.cos(p.track * D2R) * 3000), p.altFt * 0.0003048));
      const ang = ahead.ok ? Math.atan2(ahead.y - pp.y, ahead.x - pp.x) : 0, col = cruise ? '#ffffff' : p.altFt < 10000 ? '#ffb45a' : '#a9d9f0';
      g.save(); g.translate(pp.x, pp.y); g.rotate(ang); g.fillStyle = C(col);
      g.beginPath(); g.moveTo(9, 0); g.lineTo(-6, -2); g.lineTo(-6, 2); g.closePath(); g.fill();
      g.fillRect(-2, -7, 3, 14); g.fillRect(-7, -3, 2, 6);
      g.restore();
      hits.push({ x: pp.x, y: pp.y, r: 22, o: p, pr: 5 });
      label(placed, pp.x, pp.y, 10, p.call || p.reg || p.hex.toUpperCase(), (p.type ? p.type + ' · ' : '') + (PREF.miles ? fmt(Math.round(p.altFt)) + ' FT' : fmt(Math.round(p.altFt * 0.3048)) + ' M'), C('#ffffff'), C(col), 4, p === S.sel);
      if (p === S.sel) drawReticle(pp, t, col);
    }
  }
  function airline(p) { const pre = (p.call || '').slice(0, 3).toUpperCase(); return /^[A-Z]{3}\d/.test(p.call || '') ? AIRLINES[pre] || pre : ''; }
  function home() {
    const ol = outlook(), w = st.wind, n = st.planes.length, hi = st.planes.filter(p => p.altFt >= 26000).length;
    return `<div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">Contrail ID</div><div class="card-sub mono">${n} PLANES WITHIN 200 KM · ${hi} HIGH ENOUGH FOR CONTRAILS</div></div></div>
      <div class="card-foot"><span>Ghost lines show where each high plane’s contrail should be now, drifted by the wind at 10 km up. Line one up with a real contrail and tap it to see which plane made it.</span></div>
      <div class="about"><div class="kv"><span>Contrails right now</span><span>${esc(ol.txt.toUpperCase())}</span></div>${w ? `<div class="kv"><span>Wind at cruise height</span><span>${Math.round(dv(w.spd * 3.6))} ${du()}/H FROM ${cardinal(w.dir)}</span></div><div class="kv"><span>Air at cruise height</span><span>${Math.round(w.temp)}°C · ${Math.round(w.rh)}% HUMIDITY</span></div>` : ''}</div>
      <span class="muted" style="font-size:11px">${st.err ? esc(st.err) + ' ' : ''}Live aircraft: ${esc(st.src || 'adsb.fi / adsb.lol / airplanes.live')} (community ADS-B receivers). Winds: Open-Meteo.</span>`;
  }
  function homeCompact() { const ol = outlook(); return `<button type="button" class="mini"><b>${st.planes.length} planes</b><span class="mono">CONTRAILS: ${esc(ol.txt.toUpperCase())}</span></button>`; }
  function card(p, now) {
    const close = '<button type="button" id="cardClose" aria-label="Close details">×</button>';
    const v = p.v || [0, 1, 0], al = airline(p), ty = TYPES[p.type] || p.desc || p.type || 'Unknown type';
    const ago = S.lastHitAgo ? Math.round(S.lastHitAgo / 60) : null;
    return close + `<div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">${esc(p.call || p.reg || p.hex.toUpperCase())}${al ? ' · ' + esc(al) : ''}</div><div class="card-sub mono">${esc(ty.toUpperCase())}${p.reg ? ' · ' + esc(p.reg) : ''}</div></div>${p.altFt >= 26000 ? '<span class="tag" style="color:#ffffff">Contrail height</span>' : ''}</div>
      <div class="stats">${stat('ALT', PREF.miles ? fmt(Math.round(p.altFt)) : fmt(Math.round(p.altFt * 0.3048)), PREF.miles ? 'ft' : 'm')}${stat('SPEED', Math.round(dv(p.gs * 1.852)), du() + '/h')}${stat('AWAY', fmt(Math.round(dv(Math.hypot(...v)))), du())}${stat('HEADING', Math.round(p.track), '°')}</div>
      ${ago != null && ago > 0 ? `<div class="card-foot"><span>The bit of contrail you tapped was made about ${ago} minute${ago === 1 ? '' : 's'} ago.</span></div>` : ''}
      <div class="card-foot mono"><span>${cardinal(azOf(v))} · ${altOf(v).toFixed(0)}° UP</span><span>${p.vrate > 300 ? 'CLIMBING' : p.vrate < -300 ? 'DESCENDING' : 'LEVEL'}</span></div>
      <div class="card-actions">${p.call ? `<a class="btn small" style="display:inline-flex;align-items:center;text-decoration:none" target="_blank" rel="noopener" href="https://www.flightaware.com/live/flight/${encodeURIComponent(p.call)}">Route on FlightAware</a>` : ''}</div>`;
  }
  function compact(p) { const close = '<button type="button" id="cardClose" aria-label="Close details">×</button>'; return close + `<button type="button" class="mini"><b>${esc(p.call || p.hex.toUpperCase())}</b><span class="mono">${esc((TYPES[p.type] || p.type || '').toUpperCase())} · ${PREF.miles ? fmt(Math.round(p.altFt)) + ' FT' : fmt(Math.round(p.altFt * 0.3048)) + ' M'}</span></button>`; }
  return {
    id: 'contrail', name: 'Contrail ID', sub: 'Which plane made that contrail', icon: '<path d="M3 20l8-8"/><path d="M13 10l8-7-2 8-6 1z"/>',
    start() { st.at = 0; poll(); loadWind(); }, stop() {}, draw, home, homeCompact, card, compact,
    chips: [['all', 'All planes'], ['contrail', 'Contrail makers'], ['low', 'Low flyers']],
    hud: () => '<b>' + st.planes.length + '</b> PLANES',
    view: { alt: 45 }
  };
})();

// ======================================================================
// NIGHT MIGRATION: an estimate of tonight's bird migration from the season and the winds, drawn as flocks crossing your sky.
// ======================================================================
WORLDS.migrate = (() => {
  const st = { fc: null, parts: [], last: 0 };
  async function load() {
    const o = S.obs;
    const j = await cachedJSON('mig:' + o.lat.toFixed(1) + ',' + o.lon.toFixed(1), 'https://api.open-meteo.com/v1/forecast?latitude=' + o.lat.toFixed(2) + '&longitude=' + o.lon.toFixed(2) + '&hourly=wind_speed_850hPa,wind_direction_850hPa,precipitation,cloud_cover&forecast_days=2&timezone=auto', 3600e3);
    st.fc = j && j.hourly ? j : null; cardFor = null;
  }
  // Seasonal heading and strength (northern hemisphere pattern; flipped south of the equator).
  function season(date) {
    const doy = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 864e5), south = S.obs.lat < 0;
    const gauss = (c, w) => Math.exp(-0.5 * ((doy - c) / w) ** 2);
    let spring = gauss(south ? 285 : 125, 22), fall = gauss(south ? 95 : 270, 30);
    const isSpring = spring > fall, str = Math.max(spring, fall);
    return { str, heading: isSpring ? (south ? 200 : 25) : (south ? 20 : 205), name: str < 0.08 ? 'off-season' : isSpring ? 'spring migration' : 'autumn migration', isSpring };
  }
  function forecast(now) {
    const se = season(now), out = { ...se, level: 0, wind: null, rain: 0 };
    let sunset = null, dark = null;
    try { if (S.libs.astro) { const A = window.Astronomy, ob = new A.Observer(S.obs.lat, S.obs.lon, 0); const ss = A.SearchRiseSet('Sun', ob, -1, new Date(now.getTime() - 6 * 3600e3), 1); sunset = ss && ss.date; } } catch (e) { /* ignore */ }
    out.sunset = sunset; out.peak = sunset ? new Date(sunset.getTime() + 2.5 * 3600e3) : null;
    let tail = 0;
    if (st.fc && out.peak) {
      const h = st.fc.hourly, off = (st.fc.utc_offset_seconds || 0) * 1000; let bi = 0, bd = 1e15;
      h.time.forEach((tt, i) => { const d = Math.abs(Date.parse(tt + ':00Z') - off - out.peak.getTime()); if (d < bd) { bd = d; bi = i; } });
      const spd = h.wind_speed_850hPa[bi] / 3.6, dir = h.wind_direction_850hPa[bi];
      out.wind = { spd, dir }; out.rain = h.precipitation[bi] || 0;
      const towards = wrap360(dir + 180); tail = spd * Math.cos((towards - se.heading) * D2R);
    }
    let lv = se.str * (1 + clamp(tail / 8, -0.8, 1.2));
    if (out.rain > 0.5) lv *= 0.25;
    out.level = clamp(lv, 0, 2); out.tail = tail;
    out.label = out.level < 0.1 ? 'Very low' : out.level < 0.35 ? 'Low' : out.level < 0.7 ? 'Moderate' : out.level < 1.1 ? 'High' : 'Very high';
    return out;
  }
  function species(se) {
    if (se.str < 0.08) return 'Few songbirds migrate this time of year; you may still see geese or owls.';
    return se.isSpring ? 'Mostly warblers, thrushes, vireos, tanagers, orioles and sparrows heading to their breeding grounds.' : 'Mostly warblers, thrushes, sparrows and blackbirds heading south; later in autumn, more sparrows, juncos and waterfowl.';
  }
  function draw(now, placed, t, ar) {
    if (!st.fc && !st.busy) { st.busy = true; load(); }
    dimStars(0.6);
    const f = forecast(now), sunA = SUN.v ? altOf(SUN.v) : -20, night = sunA < -6;
    const n = Math.round(clamp(f.level, 0, 1.6) * 160 * (night ? 1 : 0.25));
    const real = Date.now(), dt = Math.min(0.1, (real - (st.last || real)) / 1000); st.last = real;
    const hd = f.heading * D2R, w = f.wind || { spd: 0, dir: 0 };
    const ve = 11 * Math.sin(hd) - w.spd * Math.sin(w.dir * D2R) * 0.6, vn = 11 * Math.cos(hd) - w.spd * Math.cos(w.dir * D2R) * 0.6;
    while (st.parts.length < n) st.parts.push({ e: (Math.random() - 0.5) * 6000, n: (Math.random() - 0.5) * 6000, u: 250 + Math.random() * 1300, ph: Math.random() * 6.28 });
    st.parts.length = Math.min(st.parts.length, n);
    const speedUp = 25; // drawn faster than real so the motion is visible
    for (const p of st.parts) {
      p.e += ve * dt * speedUp; p.n += vn * dt * speedUp;
      if (Math.hypot(p.e, p.n) > 3200) { p.e = -p.e * 0.95; p.n = -p.n * 0.95; }
      const v = [p.e / 1000, p.n / 1000, p.u / 1000], pp = project(v); if (!onScreen(pp, 10)) continue;
      const d = Math.hypot(p.e, p.n, p.u), sz = clamp(2400 / d, 1.5, 7), flap = Math.sin(real / 140 + p.ph) * 0.5;
      const ah = project([(p.e + ve * 40) / 1000, (p.n + vn * 40) / 1000, p.u / 1000]), ang = ah.ok ? Math.atan2(ah.y - pp.y, ah.x - pp.x) : 0;
      g.save(); g.translate(pp.x, pp.y); g.rotate(ang);
      g.strokeStyle = C('#e6f0ff', clamp(1.4 - d / 3000, 0.25, 0.85)); g.lineWidth = 1.2; g.beginPath();
      g.moveTo(-sz, -sz * (0.8 + flap)); g.lineTo(0, 0); g.lineTo(-sz, sz * (0.8 + flap)); g.stroke(); g.restore();
    }
    // heading arrow on the horizon
    const hv = vecAA(f.heading, 8), ph = project(hv);
    if (onScreen(ph, 0)) label(placed, ph.x, ph.y, 0, 'Birds heading ' + cardinal(f.heading), f.label.toUpperCase() + ' MIGRATION · ' + f.name.toUpperCase(), C('#ffffff'), C('#a9d9f0'), 5, true);
    st.f = f;
  }
  function home(now) {
    const f = st.f || forecast(now);
    return `<div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">Tonight: ${esc(f.label)} migration</div><div class="card-sub mono">${esc(f.name.toUpperCase())} · ESTIMATE, NOT LIVE RADAR</div></div></div>
      <div class="stats">${stat('HEADING', cardinal(f.heading))}${stat('HEIGHT', PREF.miles ? '1–5k' : '300–1,500', PREF.miles ? 'ft' : 'm')}${stat('PEAK', f.peak ? tfmt(f.peak).replace(' ', '') : '—')}${stat('TAILWIND', f.wind ? (f.tail > 1 ? 'YES' : f.tail < -1 ? 'NO' : 'WEAK') : '—')}</div>
      <div class="card-foot"><span>${esc(species(f))} On busy nights, stand somewhere quiet and listen for their short flight calls overhead.</span></div>
      <div class="card-foot"><span>Estimated from the season and tonight’s winds${f.rain > 0.5 ? ' (rain will ground many birds)' : ''}. The flocks drawn here are an illustration. For real radar counts, see BirdCast.</span></div>
      <div class="card-actions"><a class="btn small" style="display:inline-flex;align-items:center;text-decoration:none" target="_blank" rel="noopener" href="https://dashboard.birdcast.info/">Live radar on BirdCast</a>${f.peak ? '<button type="button" class="btn small" id="migPeak">Show the peak hour</button>' : ''}</div>`;
  }
  function homeCompact(now) { const f = st.f || forecast(now); return `<button type="button" class="mini"><b>${esc(f.label)} migration</b><span class="mono">HEADING ${cardinal(f.heading)} · PEAK ${f.peak ? tfmt(f.peak).toUpperCase() : '—'}</span></button>`; }
  function wireHome(card) { const b = $('#migPeak', card); if (b && st.f && st.f.peak) b.onclick = () => timeJump(st.f.peak.getTime(), 'Showing the estimated peak of tonight’s migration.'); }
  return {
    id: 'migrate', name: 'Night migration', sub: 'Tonight’s bird migration overhead', icon: '<path d="M3 9c3 0 4 2 6 2s3-2 6-2"/><path d="M9 16c2 0 3 1.5 4.5 1.5S16 16 18 16"/>',
    start() { load(); }, stop() {}, draw, home, homeCompact, wireHome, card: () => '', compact: () => '',
    chips: [['all', 'Tonight']],
    hud: () => st.f ? '<b>' + esc(st.f.label.toUpperCase()) + '</b> MIGRATION' : '',
    view: { alt: 50 }
  };
})();

// ======================================================================
// MAGNETIC FIELD: Earth's field lines flowing through where you stand, magnetic vs true north, the dip, and the aurora direction.
// ======================================================================
WORLDS.mag = (() => {
  const st = { parts: [] };
  function fieldHere() { return GEOMAG.field(S.obs.lat, S.obs.lon, 0, simNow()); }
  function draw(now, placed, t, ar) {
    dimStars(0.4);
    const f = fieldHere(), b = [f.Y / f.F, f.X / f.F, -f.Z / f.F]; // East, North, Up
    // streaming field lines: short segments drifting along the field direction
    const real = Date.now();
    while (st.parts.length < 220) st.parts.push({ p: [(Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60], a: Math.random() });
    for (const q of st.parts) {
      q.a += 0.004; if (q.a > 1) { q.a = 0; q.p = [(Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60]; }
      const s = (q.a - 0.5) * 50, p0 = [q.p[0] + b[0] * s, q.p[1] + b[1] * s, q.p[2] + b[2] * s], p1 = [p0[0] + b[0] * 4, p0[1] + b[1] * 4, p0[2] + b[2] * 4];
      if (Math.hypot(...p0) < 6) continue;
      const a = project(p0), c = project(p1); if (!a.ok || !c.ok || (!onScreen(a, 0) && !onScreen(c, 0))) continue;
      const fade = Math.sin(q.a * Math.PI);
      const gr = g.createLinearGradient(a.x, a.y, c.x, c.y); gr.addColorStop(0, C('#7cf2d8', 0)); gr.addColorStop(1, C('#7cf2d8', 0.75 * fade));
      g.strokeStyle = gr; g.lineWidth = 1.6; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(c.x, c.y); g.stroke();
    }
    // where the field points (down towards magnetic north) and where it comes from
    for (const [vec, name, sub] of [[b, 'Field points here', 'DIPS ' + Math.abs(f.incl).toFixed(0) + '° ' + (f.incl > 0 ? 'INTO THE GROUND' : 'UP')], [b.map(x => -x), 'Field comes from here', 'FROM THE SOUTHERN HEMISPHERE']]) {
      const p = project(vec); if (!onScreen(p, 0)) continue;
      g.strokeStyle = C('#7cf2d8'); g.lineWidth = 1.8; g.beginPath(); g.arc(p.x, p.y, 12, 0, 6.283); g.stroke();
      g.beginPath(); g.arc(p.x, p.y, 3, 0, 6.283); g.fillStyle = C('#7cf2d8'); g.fill();
      label(placed, p.x, p.y, 14, name, sub, C('#ffffff'), C('#7cf2d8'), 6, true);
      hits.push({ x: p.x, y: p.y, r: 30, o: { world: 'mag', kind: 'fieldpt', name, v: vec }, pr: 5 });
    }
    // magnetic north vs true north on the horizon
    const mn = vecAA(wrap360(f.decl), 0), tn = vecAA(0, 0), pm = project(mn), pt = project(tn);
    if (onScreen(pt, 0)) { g.fillStyle = C('#ffffff'); g.fillRect(pt.x - 1, pt.y - 22, 2, 22); label(placed, pt.x, pt.y - 22, 2, 'True north', 'THE REAL POLE', C('#ffffff'), C('#c9d6f5'), 5); }
    if (onScreen(pm, 0)) { g.fillStyle = C('#ff8a7a'); g.fillRect(pm.x - 1, pm.y - 22, 2, 22); label(placed, pm.x, pm.y - 22, 2, 'Compass north', Math.abs(f.decl).toFixed(1) + '° ' + (f.decl < 0 ? 'WEST' : 'EAST') + ' OF TRUE', C('#ffffff'), C('#ff8a7a'), 5); }
    polyline(Array.from({ length: 21 }, (_, i) => vecAA(f.decl * i / 20, 2)), C('#ff8a7a', 0.6), 2);
    // the geomagnetic pole (through the Earth) and the aurora direction
    const pole = GEOMAG.dipolePole(now), pv = geoEnu(pole.lat, pole.lon, 0), pp = project(pv);
    if (onScreen(pp, 0)) { g.strokeStyle = C('#b59cff'); g.lineWidth = 1.5; g.beginPath(); g.arc(pp.x, pp.y, 10, 0, 6.283); g.stroke(); label(placed, pp.x, pp.y, 12, 'Geomagnetic north pole', kmTxt(Math.hypot(...pv)) + ' THROUGH THE EARTH', C('#ffffff'), C('#b59cff'), 4, true); hits.push({ x: pp.x, y: pp.y, r: 26, o: { world: 'mag', kind: 'pole', name: 'Geomagnetic north pole', v: pv, lat: pole.lat, lon: pole.lon }, pr: 4 }); }
    const aur = vecAA(bearingTo(S.obs.lat, S.obs.lon, pole.lat, pole.lon), 10), pa = project(aur);
    if (onScreen(pa, 0)) { g.fillStyle = C('#7cf2b0', 0.12); g.fillRect(pa.x - 80, pa.y - 6, 160, 24); label(placed, pa.x, pa.y, 0, 'Aurora would glow here', 'LOW TOWARDS THE GEOMAGNETIC POLE', C('#e6fff0'), C('#7cf2b0'), 3); }
  }
  function home(now) {
    const f = fieldHere();
    return `<div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">Earth’s magnetic field here</div><div class="card-sub mono">IGRF MODEL · ${Math.abs(S.obs.lat).toFixed(1)}°${S.obs.lat >= 0 ? 'N' : 'S'} ${Math.abs(S.obs.lon).toFixed(1)}°${S.obs.lon >= 0 ? 'E' : 'W'}</div></div></div>
      <div class="stats">${stat('DECL', Math.abs(f.decl).toFixed(1) + '° ' + (f.decl < 0 ? 'W' : 'E'))}${stat('DIP', Math.abs(f.incl).toFixed(1), '°')}${stat('STRENGTH', fmt(Math.round(f.F)), 'nT')}${stat('HORIZ', fmt(Math.round(f.H)), 'nT')}</div>
      <div class="card-foot"><span>A compass here points ${Math.abs(f.decl).toFixed(1)}° ${f.decl < 0 ? 'west' : 'east'} of true north, and a free-swinging needle would tilt ${Math.abs(f.incl).toFixed(0)}° ${f.incl > 0 ? 'down' : 'up'}. The field is about ${Math.round(f.F / 1000)} microtesla: roughly a hundred times weaker than a fridge magnet.</span></div>
      <div class="card-foot"><span>Sky Watch uses this to turn your phone’s magnetic heading into true north, so labels line up with the real sky.</span></div>`;
  }
  function homeCompact() { const f = fieldHere(); return `<button type="button" class="mini"><b>Compass ${Math.abs(f.decl).toFixed(1)}° ${f.decl < 0 ? 'W' : 'E'}</b><span class="mono">DIP ${Math.abs(f.incl).toFixed(0)}° · ${fmt(Math.round(f.F))} NT</span></button>`; }
  function card(o) {
    const close = '<button type="button" id="cardClose" aria-label="Close details">×</button>';
    if (o.kind === 'pole') return close + `<div class="card-head"><div style="flex:1"><div class="card-title">Geomagnetic north pole</div><div class="card-sub mono">${o.lat.toFixed(1)}°N ${Math.abs(o.lon).toFixed(1)}°W · NORTHERN CANADA / GREENLAND</div></div></div><div class="card-foot"><span>The axis of Earth’s main magnet comes out here, about ${kmTxt(gcKm(S.obs.lat, S.obs.lon, o.lat, o.lon))} away over the surface. Aurora form in a ring around it, so the closer you are, the more often you can see them. (Compasses actually point to a different spot, the dip pole near 86°N, which is drifting towards Siberia by about 40 km a year.)</span></div>`;
    return close + `<div class="card-head"><div style="flex:1"><div class="card-title">${esc(o.name)}</div><div class="card-sub mono">THE DIRECTION OF EARTH’S FIELD WHERE YOU STAND</div></div></div><div class="card-foot"><span>Field lines leave the Earth in the southern hemisphere, arc over the equator and dive back in up north. Here they run ${cardinal(azOf(o.v))} and ${altOf(o.v) < 0 ? 'downwards' : 'upwards'} at ${Math.abs(altOf(o.v)).toFixed(0)}°.</span></div>`;
  }
  function compact(o) { const close = '<button type="button" id="cardClose" aria-label="Close details">×</button>'; return close + `<button type="button" class="mini"><b>${esc(o.name)}</b><span class="mono">${cardinal(azOf(o.v))} · ${altOf(o.v).toFixed(0)}°</span></button>`; }
  return {
    id: 'mag', name: 'Magnetic field', sub: 'Field lines, compass error and the aurora direction', below: true, icon: '<path d="M6 4v8a6 6 0 0 0 12 0V4"/><path d="M6 8h4M14 8h4"/>',
    start() {}, stop() {}, draw, home, homeCompact, card, compact,
    chips: [['all', 'Field lines']],
    hud: () => { const f = fieldHere(); return 'DECL <b>' + f.decl.toFixed(1) + '°</b> · DIP <b>' + f.incl.toFixed(0) + '°</b>'; },
    view: { alt: -45, az: 0 }
  };
})();

// ---------- choosing a world ----------
const WORLD_LIST = [
  { id: 'sky', name: 'Sky', sub: 'Satellites, stars, planets and events', icon: '<circle cx="12" cy="12" r="3"/><path d="M3 12c3-4 15-4 18 0M12 3v2M12 19v2"/>' },
  WORLDS.ground, WORLDS.infra, WORLDS.contrail, WORLDS.migrate, WORLDS.mag
];
function worldTilesHTML(cur) {
  return WORLD_LIST.map(w => `<button type="button" class="wtile" data-w="${w.id}" aria-pressed="${cur === w.id}"><svg viewBox="0 0 24 24" aria-hidden="true">${w.icon}</svg><b>${esc(w.name)}</b><span>${esc(w.sub)}</span></button>`).join('');
}
function renderWorldTiles() {
  const box = $('#worldTiles'); if (!box) return;
  box.innerHTML = worldTilesHTML(S.world);
  $$('.wtile', box).forEach(b => b.onclick = () => { S.world = b.dataset.w; ls.set('world', S.world); renderWorldTiles(); $('#startEyebrow').textContent = (WORLD_LIST.find(w => w.id === S.world) || WORLD_LIST[0]).name.toUpperCase(); });
}
function setWorld(id, quiet) {
  const prev = S.world;
  if (prev && prev !== id && WORLDS[prev]) WORLDS[prev].stop();
  S.world = id; ls.set('world', id);
  WORLD_LIST.forEach(w => document.body.classList.toggle('w-' + w.id, w.id === id));
  S.sel = null; cardFor = null;
  const wd = WORLDS[id];
  if (wd) {
    wd.start();
    if (S.mode === 'sky' && wd.view) { S.viewAlt = wd.view.alt; if (wd.view.az != null) S.viewAz = wd.view.az; }
  } else if (S.mode === 'sky' && S.viewAlt < 0) S.viewAlt = 28;
  $('#worldName').textContent = (WORLD_LIST.find(w => w.id === id) || WORLD_LIST[0]).name;
  renderChips(); select(null);
  if (!quiet && prev !== id) toast((WORLD_LIST.find(w => w.id === id) || WORLD_LIST[0]).name + (wd && wd.below ? '. Point the phone down too.' : '.'));
}
function openWorlds() {
  $('#worldSheetTiles').innerHTML = worldTilesHTML(S.world);
  $$('#worldSheetTiles .wtile').forEach(b => b.onclick = () => { closeSheets(); setWorld(b.dataset.w); });
  openSheet('sheetWorlds');
}
$('#worldPill').onclick = openWorlds;
renderWorldTiles();
