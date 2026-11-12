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
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
async function overpass(key, q, ttl) {
  const c = await idb.get(key);
  if (c && Date.now() - c.t < ttl) return c.data;
  for (const base of OVERPASS) {
    try {
      const ac = new AbortController(), to = setTimeout(() => ac.abort(), 35000);
      const r = await fetch(base + '?data=' + encodeURIComponent(q), { signal: ac.signal }).finally(() => clearTimeout(to)); if (!r.ok) throw new Error(r.status);
      const data = await r.json(); if (!data || !data.elements || (data.remark && /error|timed out/i.test(data.remark) && !data.elements.length)) throw new Error('bad');
      idb.set(key, { t: Date.now(), data }); return data;
    } catch (e) { /* try the next mirror */ }
  }
  return c && c.data ? c.data : null;
}
function ecefDeltaToEnu(dx, dy, dz) { const o = S.obs; return [-o.sl * dx + o.cl * dy, -o.sp * o.cl * dx - o.sp * o.sl * dy + o.cp * dz, o.cp * o.cl * dx + o.cp * o.sl * dy + o.sp * dz]; }
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
  // ---------- Peel the Earth: stand on the ground and look down through each layer, to scale ----------
  const PEEL = [
    { name: 'Crust', r: 6370, info: ['0–35 km down: 5–10 km under oceans, up to 70 km under mountains', 'Surface ~15 °C, ~1,000 °C at its base', 'Solid rock: granite under continents, basalt under oceans', 'About 1% of Earth’s volume. The deepest hole ever dug reached only 12 km'],  col: '#9a7650', hot: '#c79a68', depth: '0–35 km (7 km under oceans, up to 70 km under mountains)', temp: 'up to about 1,000 °C at its base', state: 'Solid rock', made: 'granite under continents, basalt under oceans', fact: 'Compared with the whole Earth it is thinner than an apple’s skin. Every mine, well and tunnel ever dug barely scratches it.' },
    { name: 'Upper mantle', r: 6336, info: ['35–660 km down · 625 km thick', '~500 °C at the top, ~1,900 °C at the bottom', 'Solid peridotite (green olivine) that creeps a few cm a year; partly molten 100–200 km down', 'The tectonic plates ride on it · ~26% of Earth’s volume'],  col: '#b4472a', hot: '#e0663a', depth: '35–660 km', temp: 'about 500–1,900 °C', state: 'Solid, but it creeps like very stiff putty', made: 'peridotite, rich in green olivine', fact: 'It flows a few centimetres a year. That slow churning drags the continents around and builds mountains.' },
    { name: 'Lower mantle', r: 5711, info: ['660–2,890 km down · 2,230 km thick', '~1,900 °C at the top, ~3,700 °C at the bottom', 'Solid bridgmanite: hot enough to melt, but up to 1.3 million atmospheres keep it solid', 'The biggest layer: ~56% of Earth’s volume'],  col: '#c9602c', hot: '#f08a3c', depth: '660–2,890 km', temp: 'about 1,900–3,700 °C', state: 'Solid, squeezed by enormous pressure', made: 'bridgmanite, the most common mineral on Earth', fact: 'The biggest layer: more than half of Earth’s volume. The rock is so compressed that its crystals rearrange into forms that can’t exist at the surface.' },
    { name: 'Outer core', r: 3480, info: ['2,890–5,150 km down · 2,260 km thick', '~4,000 °C at the top, ~5,700 °C at the bottom', 'Liquid iron and nickel, churning as Earth spins', 'Its flow generates Earth’s magnetic field · ~16% of volume'],  col: '#e8862a', hot: '#ffc04d', depth: '2,890–5,150 km', temp: 'about 4,000–5,700 °C', state: 'Liquid metal', made: 'molten iron and nickel', fact: 'This ocean of liquid metal swirls as the Earth spins, and that motion generates Earth’s magnetic field, the one that makes compasses work and shields us from the solar wind.' },
    { name: 'Inner core', r: 1220, info: ['5,150 km down to the centre at 6,371 km · 1,220 km radius', '~5,400 °C, about as hot as the Sun’s surface', 'Solid iron and nickel, squeezed by 3.6 million atmospheres', 'About 70% the Moon’s size; grows ~1 mm a year · 0.7% of volume'],  col: '#ff9d2e', hot: '#ffe08a', depth: '5,150–6,371 km', temp: 'about 5,400 °C, as hot as the surface of the Sun', state: 'Solid metal ball', made: 'iron and nickel', fact: 'It is about 70% the size of the Moon. The pressure is so great that the iron stays solid despite the heat. It grows about a millimetre a year as the liquid around it freezes, and it spins slightly out of step with the rest of the planet.' }
  ];
  // Seen from where you stand: each layer is a sphere around Earth's centre 6,371 km below your feet,
  // so it fills the directions within asin(r / 6371) of straight down. That makes the real scale obvious:
  // the crust is a thin band just under the horizon, the inner core a small disc right below you.
  const topR = i => i === 0 ? 6371 : PEEL[i].r;
  const capAlt = i => i === 0 ? -0.3 : -(90 - Math.asin(topR(i) / 6371) * R2D);
  // Screen polygon for all directions below (alt < 0) or above (alt > 0) a constant altitude, clipped at the camera plane.
  function capPath(alt) {
    const P = [], E = 1e-4, out = [];
    for (let az = 0; az < 360; az += 4) P.push(project(vecAA(az, alt)));
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], ai = a.d > E, bi = b.d > E;
      if (ai) out.push(a);
      if (ai !== bi) { const k = (E - a.d) / (b.d - a.d); out.push({ cx: a.cx + k * (b.cx - a.cx), cy: a.cy + k * (b.cy - a.cy), d: E }); }
    }
    if (out.length < 3) return false;
    g.beginPath(); out.forEach((q, i) => { const x = W / 2 + FOC * q.cx / q.d, y = H / 2 - FOC * q.cy / q.d; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
    return true;
  }
  function ring(alt, col, w, dash) {
    g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash || []); g.beginPath(); let pen = false;
    for (let az = 0; az <= 360; az += 3) { const p = project(vecAA(az, alt)); if (p.ok && Math.abs(p.x) < 4 * W && Math.abs(p.y) < 4 * H) { pen ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); pen = true; } else pen = false; }
    g.stroke(); g.setLineDash([]);
  }
  function fillLayer(i, alpha) {
    if (alpha <= 0.01 || !capPath(capAlt(i))) return;
    g.save(); g.globalAlpha = alpha; g.clip();
    const nd = project([0, 0, -1]), cx = nd.ok ? nd.x : W / 2, cy = nd.ok ? nd.y : H * 2;
    if (i === 0) { // grassland surface, darker towards your feet
      g.fillStyle = C('#4f9a45'); g.fillRect(0, 0, W, H);
      for (const [a, c] of [[-8, 0.12], [-20, 0.12], [-40, 0.12], [-65, 0.12]]) if (capPath(a)) { g.fillStyle = C('#1d4a22', c); g.fill(); }
      g.strokeStyle = C('#d8f5c8', 0.12); g.lineWidth = 1;
      for (let az = 0; az < 360; az += 20) { g.beginPath(); let pen = false; for (let al = -1; al >= -89; al -= 4) { const p = project(vecAA(az, al)); if (p.ok) { pen ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); pen = true; } else pen = false; } g.stroke(); }
      for (const al of [-3, -8, -15, -30, -60]) ring(al, C('#d8f5c8', 0.1), 1);
    } else {
      const L = PEEL[i], rr = Math.hypot(W, H) * (i >= 3 ? 0.7 : 1.4);
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr); gr.addColorStop(0, C(L.hot)); gr.addColorStop(0.6, C(L.col)); gr.addColorStop(1, C('#2a0e04'));
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      // slow convection / spin texture
      const spin = Date.now() / (i === 4 ? 900 : 3000);
      for (let k = 0; k < 14; k++) { const a = spin + k * 0.45, rad = (60 + k * 37) % rr; g.fillStyle = C(L.hot, 0.1); g.beginPath(); g.arc(cx + Math.cos(a) * rad, cy + Math.sin(a * 1.2) * rad * 0.6, 40 + (k % 4) * 18, 0, 6.283); g.fill(); }
      if (i >= 3 && nd.ok) {
        const rpx = Math.abs(project(vecAA(azOf(viewFwd()), capAlt(i))).y - cy) || 80;
        for (let k = 0; k < 8; k++) { const ph = spin + k * Math.PI / 8; g.strokeStyle = C('#2a0e04', Math.sin(ph) > 0 ? 0.3 : 0.1); g.lineWidth = 1.2; g.beginPath(); g.ellipse(cx, cy, Math.max(Math.abs(Math.cos(ph)) * rpx, 0.5), rpx, 0, 0, 6.283); g.stroke(); }
      }
    }
    g.restore();
  }
  function wrapText(txt, maxW) {
    const words = txt.split(' '), lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur); return lines;
  }
  const peelTap = { kind: 'peelinfo', tap() { st.peelOpen = !st.peelOpen; ls.set('peelOpen', st.peelOpen); try { navigator.vibrate && navigator.vibrate(10); } catch (e) { /* ignore */ } } };
  function callout(i, ax, ay) {
    const L = PEEL[i], bw = Math.min(W - 24, 330), pad = 12, open = st.peelOpen;
    g.font = '500 12px Inter, system-ui, sans-serif';
    const rows = []; if (open) L.info.forEach((t, k) => wrapText(t, bw - pad * 2 - 12).forEach((ln, j) => rows.push([ln, k, j])));
    else { let t = L.info[0]; while (t.length > 4 && g.measureText(t + '…').width > bw - pad * 2 - 12) t = t.slice(0, -1); rows.push([t === L.info[0] ? t : t.trim() + '…', 0, 0]); }
    const bh = 34 + rows.length * 16 + 8, bx = (W - bw) / 2, by = Math.max(ZONE.top + 8, ZONE.bot - bh - 10);
    if (ax != null && (ay < by - 10 || ay > by + bh + 10)) { g.strokeStyle = C(L.hot, 0.8); g.lineWidth = 1.2; g.beginPath(); g.moveTo(clamp(ax, bx + 20, bx + bw - 20), ay < by ? by : by + bh); g.lineTo(ax, ay); g.stroke(); g.fillStyle = C(L.hot); g.beginPath(); g.arc(ax, ay, 3.5, 0, 6.283); g.fill(); }
    g.fillStyle = C('#05070f', 0.84); roundRect(bx, by, bw, bh, 12); g.fill(); g.strokeStyle = C(L.hot, 0.55); g.lineWidth = 1; roundRect(bx, by, bw, bh, 12); g.stroke();
    g.textBaseline = 'top';
    g.fillStyle = C('#ffffff'); g.font = '700 15px "Space Grotesk", Inter, sans-serif'; g.fillText(L.name, bx + pad, by + 10);
    g.font = MONO; g.fillStyle = C(L.hot); g.textAlign = 'right'; g.fillText((open ? 'LESS ▴' : 'MORE ▾') + '  ·  ' + (i + 1) + '/5', bx + bw - pad, by + 13); g.textAlign = 'left';
    for (let x = bx + bh / 2; x <= bx + bw - bh / 2 + 1; x += bh / 2) hits.push({ x, y: by + bh / 2, r: bh / 2, o: peelTap, pr: 10 });
    g.font = '500 12px Inter, system-ui, sans-serif';
    rows.forEach(([ln, k, j], n) => { const y = by + 34 + n * 16; if (j === 0) { g.fillStyle = C(L.hot); g.beginPath(); g.arc(bx + pad + 3, y + 7, 2.2, 0, 6.283); g.fill(); } g.fillStyle = C('#e6ecff', k === 0 ? 1 : 0.86); g.fillText(ln, bx + pad + 12, y); });
    g.textBaseline = 'alphabetic';
    return by + bh;
  }
  function drawPeel(t) {
    const step = st.peel || 0, k = clamp((performance.now() - (st.peelAt || 0)) / 700, 0, 1), ease = 1 - Math.pow(1 - k, 3);
    // sky above: deep blue overhead, paler at the horizon
    g.fillStyle = C('#5d95d0'); g.fillRect(0, 0, W, H);
    for (let a = 2; a < 90; a += 4) if (capPath(a)) { g.fillStyle = C('#0b2350', 0.075); g.fill(); }
    // layers already peeled: see-through bands so you can see how thin or thick they are
    for (let i = 0; i < step; i++) if (capPath(capAlt(i))) { g.fillStyle = C(i === 0 ? '#7a5a3a' : PEEL[i].col, i === 0 ? 0.35 : 0.22); g.fill(); }
    // the layer you're looking at, fading in when you go back up
    fillLayer(step, st.prevPeel != null && st.prevPeel > step ? ease : 1);
    // the layer you just peeled, fading away
    if (st.prevPeel != null && st.prevPeel < step && k < 1) fillLayer(st.prevPeel, 1 - ease);
    // every boundary drawn to scale, with its depth where you're facing
    const vaz = azOf(viewFwd());
    for (let i = 0; i < PEEL.length; i++) {
      const al = capAlt(i), L = PEEL[i], below = i > step;
      if (i > 0) ring(al, C(L.hot, below ? 0.35 : 0.85), below ? 1 : 1.5, below ? [5, 6] : null);
      const p = project(vecAA(vaz, al)); if (!onScreen(p, -10)) continue;
      const depth = i === 0 ? 'SURFACE' : L.depth.split(' ')[0].split('–')[0] + ' KM DOWN';
      label(st.placed, p.x, p.y, 0, i === 0 ? 'Horizon · ground level' : 'Top of the ' + L.name.toLowerCase(), depth + ' · ' + Math.abs(al).toFixed(1) + '° BELOW HORIZON', C('#ffffff', below ? 0.7 : 1), C(i === 0 ? '#d8f5c8' : L.hot), i === step ? 9 : 4, i === step);
    }
    ring(0, C('#eaf4ff', 0.6), 1.2);
    // the info box, pointing at the layer under your feet
    const nd = project([0, 0, -1]); let ax = null, ay = null;
    if (onScreen(nd, -20)) { ax = nd.x; ay = nd.y; } else { const p = project(vecAA(vaz, (capAlt(step) - 90) / 2)); if (onScreen(p, -20)) { ax = p.x; ay = p.y; } }
    callout(step, ax, ay);
    if (altOf(viewFwd()) > -5) {
      g.font = '600 14px Inter, sans-serif'; g.fillStyle = C('#ffffff'); g.textAlign = 'center';
      g.fillText('↓ Look down: the layers are under your feet, to scale', W / 2, ZONE.top + 24); g.textAlign = 'left';
    }
  }
  function peelHome() {
    const L = PEEL[st.peel || 0];
    return `<div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">${esc(L.name)}</div><div class="card-sub mono">${esc(L.depth.toUpperCase())}</div></div><span class="tag" style="color:${L.hot}">${st.peel + 1} / ${PEEL.length}</span></div>
      <div class="seg" id="peelSeg">${PEEL.map((p, i) => `<button type="button" data-i="${i}" aria-pressed="${i === st.peel}">${esc(p.name.replace('Upper ', 'Up. ').replace('Lower ', 'Low. ').replace('Outer ', 'Out. ').replace('Inner ', 'Inn. '))}</button>`).join('')}</div>
      <div class="about"><div class="kv"><span>State</span><span>${esc(L.state.toUpperCase())}</span></div><div class="kv"><span>Temperature</span><span>${esc(L.temp.toUpperCase())}</span></div><div class="kv"><span>Made of</span><span>${esc(L.made.toUpperCase())}</span></div></div>
      <div class="card-foot"><span>${esc(L.fact)}</span></div>`;
  }
  function draw(now, placed, t, ar) {
    if (wchip('ground') === 'peel') { st.placed = placed; drawPeel(t); return; }
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
    wireHome(card) { $$('#peelSeg button', card).forEach(b => b.onclick = e => { e.stopPropagation(); const n = +b.dataset.i; if (n === st.peel) return; st.prevPeel = st.peel; st.peel = n; st.peelAt = performance.now(); if (S.mode === 'sky') S.viewAlt = [-25, -25, -45, -70, -86][n]; cardFor = null; updateCard(simNow(), true); try { navigator.vibrate && navigator.vibrate(15); } catch (er) { /* ignore */ } }); },
    onChip(id) {
      if (id === 'peel') { st.peel = st.peel || 0; st.peelOpen = ls.get('peelOpen', false); if (!S.noFeed) { st.peelFeed = true; S.noFeed = true; cam.classList.add('nofeed'); } S.collapse.worldhome = true; if (S.mode === 'sky') S.viewAlt = -25; toast('Peel the Earth: every layer under your feet, drawn to scale. Tap a layer to peel.'); }
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
  const st = { towers: [], power: [], subs: [], dcs: [], stations: [], rbNear: [], loadedFor: null, at: 0, status: {}, carrier: ls.get('carrier', ''), dial: 'FM' };
  const isCell = x => x.type === 'Cell / radio mast';
  // The tower your phone is most likely using: the nearest site of your carrier (a website can't read the real one).
  function servingTower() { let best = null; for (const x of st.towers) { if (!isCell(x) || x.src !== 'FCC' || x.dist > 40) continue; if (st.carrier && !x.ops.includes(st.carrier)) continue; if (!best || x.dist < best.dist) best = x; } return best; }
  const towerOf = sn => st.towers.find(x => Math.abs(x.lat - sn.lat) < 0.0008 && Math.abs(x.lon - sn.lon) < 0.001);
  const centerOf = e => e.lat != null ? [e.lat, e.lon] : e.center ? [e.center.lat, e.center.lon] : e.geometry ? [e.geometry.reduce((a, n) => a + n.lat, 0) / e.geometry.length, e.geometry.reduce((a, n) => a + n.lon, 0) / e.geometry.length] : null;
  function addTower(e, near) {
    const t = e.tags || {}, c = centerOf(e); if (!c || !/^(mast|tower|communications_tower)$/.test(t.man_made || '')) return;
    if (st.towers.some(x => Math.abs(x.lat - c[0]) < 6e-4 && Math.abs(x.lon - c[1]) < 8e-4)) return;
    const comm = (t['tower:type'] || '') + ' ' + (t['communication:television'] ? 'television' : '') + ' ' + (t['communication:radio'] ? 'radio' : '');
    const h = parseFloat(t.height) || (near ? 35 : 120);
    const kind = /broadcast|radio|television/.test(comm) ? 'Broadcast tower' : h >= 100 ? 'Tall radio mast' : 'Cell / radio mast';
    st.towers.push({ world: 'infra', kind: 'tower', name: t.name || t['name:en'] || kind, type: kind, op: t.operator || '', h, lat: c[0], lon: c[1], tags: t, dist: gcKm(S.obs.lat, S.obs.lon, c[0], c[1]) });
  }
  const FCC = 'https://maps.nccs.nasa.gov/mapping/rest/services/hifld_open/communications/FeatureServer/';
  const AGOL_CELL = 'https://services.arcgis.com/0ZRg6WRC7mxSLyKX/ArcGIS/rest/services/Cellular_Towers/FeatureServer/0/';
  async function fcc(layer, km, cnt, base) {
    const L = S.obs.lat, N = S.obs.lon, dl = km / 111, dn = km / (111 * Math.max(Math.cos(L * D2R), 0.2));
    const key = 'fcc' + (base ? 'A' : '') + layer + ':' + L.toFixed(2) + ',' + N.toFixed(2) + ':' + km;
    const c = await idb.get(key); if (c && c.data && Date.now() - c.t < 14 * 864e5) return c.data;
    const url = (base || FCC + layer + '/') + 'query?where=1%3D1&geometry=' + [N - dn, L - dl, N + dn, L + dl].map(v => v.toFixed(4)).join(',') + '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&outSR=4326&resultRecordCount=' + cnt + '&f=geojson';
    try {
      const ac = new AbortController(), to = setTimeout(() => ac.abort(), 30000);
      const r = await fetch(url, { signal: ac.signal }).finally(() => clearTimeout(to)); if (!r.ok) throw new Error(r.status);
      const j = await r.json(); if (!j || !Array.isArray(j.features)) throw new Error('bad');
      idb.set(key, { t: Date.now(), data: j.features }); return j.features;
    } catch (e) { return c && c.data ? c.data : null; }
  }
  // One tower often carries many licences (several FM stations, three carriers): merge anything within ~80 m.
  function addFcc(lat, lon, type, name, op, h, src) {
    const near = st.towers.find(x => Math.abs(x.lat - lat) < 0.0008 && Math.abs(x.lon - lon) < 0.001);
    if (near) {
      if (name && !near.calls.includes(name)) near.calls.push(name);
      if (op && !near.ops.includes(op)) near.ops.push(op);
      if (type === 'Broadcast tower' && near.type !== 'Broadcast tower') near.type = 'Broadcast tower';
      if (h > near.h) near.h = h;
      near.name = near.calls.length ? near.calls.slice(0, 3).join(' · ') + (near.calls.length > 3 ? ' +' + (near.calls.length - 3) : '') : near.ops.slice(0, 3).join(' / ') + ' cell site';
      near.op = near.ops.slice(0, 2).join(' / ');
      return;
    }
    st.towers.push({ world: 'infra', kind: 'tower', type, name: name || (op ? op + ' cell site' : type), calls: name ? [name] : [], ops: op ? [op] : [], op: op || '', h: h || (type === 'Broadcast tower' ? 120 : 40), lat, lon, tags: {}, src, dist: gcKm(S.obs.lat, S.obs.lon, lat, lon) });
  }
  function loadFcc() {
    const ll = f => f.geometry && f.geometry.coordinates ? [f.geometry.coordinates[1], f.geometry.coordinates[0]] : null;
    const done = () => { st.towers.sort((a, b) => a.dist - b.dist); cardFor = null; };
    st.status.fccCell = 'loading'; st.status.fccBroadcast = 'loading';
    // cell sites (FCC licence locations) within ~5 miles
    // ArcGIS Online copy first (it allows requests from any website), the NASA mirror as a fallback
    fcc(0, 8, 1500, AGOL_CELL).then(fs => fs || fcc(3, 8, 600)).then(fs => {
      st.status.fccCell = fs ? 'ok' : 'error';
      for (const f of fs || []) {
        const c = ll(f), p0 = f.properties || {}, p = {}; if (!c) continue;
        for (const k in p0) p[k.toLowerCase()] = p0[k];
        if (p.licstatus && !/^a/i.test(p.licstatus)) continue;
        addFcc(c[0], c[1], 'Cell / radio mast', '', carrier(p.licensee || ''), +p.allstruc || +p.supstruc || 0, 'FCC');
      }
      done();
    });
    // FM, AM and TV transmitters out to ~100 miles
    // ArcGIS Online copies of the FCC FM and digital TV layers first (found through their public item records), NASA mirror as a fallback
    const viaItem = async (item, layer, cnt) => {
      try {
        let base = ls.get('agolItem:' + item, '');
        if (!base) { const r = await fetch('https://www.arcgis.com/sharing/rest/content/items/' + item + '?f=json'); const j = await r.json(); if (!j || !j.url) throw new Error('no url'); base = j.url.replace(/\/+$/, ''); if (/FeatureServer$|MapServer$/.test(base)) base += '/0'; base += '/'; ls.set('agolItem:' + item, base); }
        const fs = await fcc(item.slice(0, 6), 160, cnt, base); if (fs) return fs;
      } catch (e) { /* fall through */ }
      return fcc(layer, 160, cnt);
    };
    Promise.all([viaItem('4cd9d7ee6cb347bcb4815c6f292a32b2', 4, 400), fcc(0, 160, 200), viaItem('2bfd434d9263401eadae464a9c26104f', 11, 200)]).then(([fm, am, tv]) => {
      st.status.fccBroadcast = fm || am || tv ? 'ok' : 'error';
      for (const [list, band] of [[fm, 'FM'], [am, 'AM'], [tv, 'TV']]) for (const f of list || []) {
        const c = ll(f), p0 = f.properties || {}, p = {}; if (!c) continue;
        for (const k in p0) p[k.toLowerCase()] = typeof p0[k] === 'string' ? p0[k].trim() : p0[k];
        if (p.status && /^(CP|DEL|CAN)/i.test(p.status)) continue;
        const freq = band === 'FM' ? (p.frequency ? ' ' + parseFloat(p.frequency) : '') : band === 'AM' ? (p.frequency ? ' ' + parseFloat(p.frequency) + ' kHz' : '') : (p.channel ? ' ch ' + p.channel : '');
        addFcc(c[0], c[1], 'Broadcast tower', (p.callsign || band) + freq, titleCase(p.licensee || ''), +p.haat > 0 ? Math.min(+p.haat, 600) : 0, 'FCC');
        const f0 = parseFloat(band === 'TV' ? p.channel : p.frequency);
        if (p.callsign && !st.stations.some(x => x.call === p.callsign && x.band === band)) st.stations.push({ call: p.callsign, band, freq: isFinite(f0) ? f0 : 0, state: p.state || '', city: titleCase(p.city || ''), op: titleCase(p.licensee || ''), service: p.service || '', lat: c[0], lon: c[1], dist: gcKm(S.obs.lat, S.obs.lon, c[0], c[1]) });
      }
      done();
    });
  }
  const carrier = t => /cellco|verizon/i.test(t) ? 'Verizon' : /cingular|at&t|at & t/i.test(t) ? 'AT&T' : /t-mobile|sprint|omnipoint|voicestream/i.test(t) ? 'T-Mobile' : /dish|boost/i.test(t) ? 'Boost/Dish' : /us cellular|united states cellular/i.test(t) ? 'UScellular' : titleCase(t);
  // Find a station in radio-browser.info, the directory Lu Cube's radio search uses, so we can hand over the exact name to search.
  const RBH = ['de1.api.radio-browser.info', 'de2.api.radio-browser.info', 'fi1.api.radio-browser.info', 'nl1.api.radio-browser.info'];
  const USST = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico' };
  // Streams Lu Cube can play: it keeps only MP3/AAC, not HLS, so a copied name always finds a station there.
  const playable = x => { const u = (x.url_resolved || x.url || '').trim(), c = (x.codec || '').toUpperCase(); return /^https?:\/\//.test(u) && !(x.hls == 1 || x.hls === true) && ['MP3', 'AAC', 'AAC+'].includes(c) && (x.name || '').trim(); };
  async function rbGet(q) {
    for (const h of RBH) {
      try { const res = await fetch(`https://${h}/json/stations/search?${new URLSearchParams(Object.assign({ countrycode: 'US', hidebroken: 'true', order: 'clickcount', reverse: 'true' }, q))}`); if (res.ok) return await res.json(); } catch (e) { /* next server */ }
    }
    return null;
  }
  async function rbLookup(sn) {
    const base = sn.call.split(/[-\s]/)[0].toUpperCase(), key = 'rb3:' + sn.call;
    const c = ls.get(key, null); if (c && Date.now() - c.t < 30 * 864e5) return c.r;
    const word = new RegExp('(^|[^A-Z])' + base + '([^A-Z]|$)'), fq = String(sn.freq || ''), stName = USST[(sn.state || '').toUpperCase()] || '';
    const nearTower = x => { const la = parseFloat(x.geo_lat), lo = parseFloat(x.geo_long); return isFinite(la) && isFinite(lo) && (la || lo) && gcKm(la, lo, sn.lat, sn.lon) < 150; };
    const hasFreq = x => fq && new RegExp('(^|[^0-9.])' + fq.replace('.', '\\.') + '([^0-9]|$)').test(x.name || '');
    let ok = false, hit = null;
    // 1. the call sign in the station's name (WNYC 93.9 FM) or its website (wnyc.org)
    const a = await rbGet({ name: base, limit: '30' });
    if (a) { ok = true; hit = a.filter(playable).find(x => word.test((x.name || '').toUpperCase()) && (!/\d{2,3}\.\d/.test(x.name) || sn.band !== 'FM' || hasFreq(x))) || null; }
    // 2. the frequency in the name, from a station in the same state or near the tower (e.g. "103.5 KTU")
    if (!hit && fq) {
      const b = await rbGet({ name: fq, limit: '150' });
      if (b) { ok = true; hit = b.filter(playable).find(x => hasFreq(x) && ((stName && (x.state || '').toLowerCase().includes(stName.toLowerCase())) || nearTower(x) || (x.homepage || '').toLowerCase().includes(base.toLowerCase()))) || null; }
    }
    const r = hit ? { name: hit.name.replace(/\s+/g, ' ').trim().slice(0, 60), state: hit.state || '' } : ok ? false : null;
    if (r !== null) ls.set(key, { t: Date.now(), r });
    return r;
  }
  function wireCopy(card) {
    $$('[data-copy]', card).forEach(b => b.onclick = async e => {
      e.stopPropagation(); const txt = b.dataset.copy; let ok = false;
      try { await navigator.clipboard.writeText(txt); ok = true; } catch (er) { /* fall back below */ }
      if (!ok) { try { const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (er) { /* ignore */ } }
      b.textContent = ok ? 'COPIED ✓' : 'SELECT IT'; toast(ok ? 'Copied “' + txt + '”. ' + (ANDROID ? 'Switch to Lu Cube and paste it in radio search (🔎).' : 'Paste it in Lu Cube’s radio search (🔎).') : 'Press and hold the name to copy it.');
      try { navigator.vibrate && navigator.vibrate(12); } catch (er) { /* ignore */ }
      if (ok && !ANDROID) setTimeout(() => window.open('https://buildbeyond1889.github.io/LuCube/app/', '_blank', 'noopener'), 450);
    });
  }
  // Radio anywhere on Earth: stations in Lu Cube's directory whose studio is within 250 km (works outside the US too).
  async function loadRbNear() {
    const key = S.obs.lat.toFixed(1) + ',' + S.obs.lon.toFixed(1); st.rbNear = []; st.status.rbNear = 'loading'; cardFor = null;
    try {
      let cc = ls.get('cc:' + key, null);
      if (cc === null) { const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${S.obs.lat}&longitude=${S.obs.lon}&localityLanguage=en`); const j = await r.json(); cc = (j && j.countryCode) || ''; ls.set('cc:' + key, cc); }
      if (!cc) { st.status.rbNear = 'ok'; st.rbNearNote = 'No country here, so no local stations.'; cardFor = null; return; }
      const list = await rbGet({ countrycode: cc, has_geo_info: 'true', limit: '800' });
      if (!list) { st.status.rbNear = 'error'; cardFor = null; return; }
      const seen = new Set();
      st.rbNear = list.filter(playable).map(x => ({ world: 'infra', kind: 'rbst', name: x.name.replace(/\s+/g, ' ').trim().slice(0, 60), lat: parseFloat(x.geo_lat), lon: parseFloat(x.geo_long), tags: (x.tags || '').split(',').slice(0, 2).join(' · '), city: x.state || '' }))
        .filter(x => isFinite(x.lat) && isFinite(x.lon) && (x.lat || x.lon)).map(x => Object.assign(x, { dist: gcKm(S.obs.lat, S.obs.lon, x.lat, x.lon) }))
        .filter(x => x.dist < 1500 && !seen.has(x.name.toLowerCase()) && seen.add(x.name.toLowerCase())).sort((a, b) => a.dist - b.dist);
      const close = st.rbNear.filter(x => x.dist < 250);
      st.rbNear = close.length ? close.slice(0, 60) : st.rbNear.slice(0, 12);
      st.rbNearNote = close.length ? '' : st.rbNear.length ? 'Nothing within 250 km. These are the nearest, ' + kmTxt(st.rbNear[0].dist) + ' and more away.' : 'No Lu Cube stations anywhere near here.';
      st.status.rbNear = 'ok';
    } catch (e) { st.status.rbNear = 'error'; }
    cardFor = null;
  }
  // "Cube Compatible": check every FM/AM station against Lu Cube's directory, one at a time, and mark its tower.
  const markCube = sn => { if (sn.rb && sn.rb.name) { const t = towerOf(sn); if (t) t.cube = true; } };
  async function runCubeScan() {
    if (st.cubeBusy) return; st.cubeBusy = true;
    const list = st.stations.filter(sn => sn.band !== 'TV');
    st.cubeTotal = list.length; st.cubeDone = 0;
    for (const sn of list) {
      if (sn.rb === undefined || sn.rb === null) { sn.rb = 'busy'; sn.rb = await rbLookup(sn); }
      else if (sn.rb === 'busy') { while (sn.rb === 'busy') await new Promise(r => setTimeout(r, 200)); }
      markCube(sn); st.cubeDone++; cardFor = null;
    }
    st.cubeBusy = false; cardFor = null;
  }
  const ANDROID = /Android/i.test(navigator.userAgent);
  const titleCase = t => t.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase()).replace(/\b(Llc|Inc|Lp|Usa|Ii|Iii)\b/g, m => m.toUpperCase());
  async function load(force) {
    for (const gid of ['geo', 'gnss']) if (!Sats.status[gid]) loadGroup(gid);
    const key = S.obs.lat.toFixed(2) + ',' + S.obs.lon.toFixed(2);
    if (st.loadedFor === key && !force) return; st.loadedFor = key;
    st.towers = []; st.power = []; st.subs = []; st.dcs = []; st.stations = []; st.cubeDone = undefined;
    loadFcc(); loadRbNear();
    const L = S.obs.lat, N = S.obs.lon, tag = '["man_made"~"^(mast|tower|communications_tower)$"]';
    const bb = km => { const dl = km / 111, dn = km / (111 * Math.max(Math.cos(L * D2R), 0.2)); return [(L - dl).toFixed(3), (N - dn).toFixed(3), (L + dl).toFixed(3), (N + dn).toFixed(3)].join(','); };
    const towersDone = (j, near, which) => { st.status[which] = j ? 'ok' : 'error'; for (const e of (j && j.elements) || []) { const t = e.tags || {}; if (/data_center|exchange/.test(t.telecom || '')) { const c = centerOf(e); if (c) st.dcs.push({ world: 'infra', kind: 'dc', name: t.name || (t.telecom === 'exchange' ? 'Telephone exchange' : 'Data centre'), op: t.operator || '', lat: c[0], lon: c[1] }); } else addTower(e, near); } st.towers.sort((a, b) => a.dist - b.dist); cardFor = null; };
    let chain = Promise.resolve();
    const queue = fn => (chain = chain.then(fn, fn));
    // 2. every mapped mast and communication tower within about 15 miles, plus data centres
    st.status.near = 'loading';
    queue(() => overpass('infraNear2:' + key, `[out:json][timeout:25][bbox:${bb(25)}];(nwr["man_made"="mast"];nwr["man_made"="tower"]["tower:type"~"communication|broadcast"];nwr["man_made"="communications_tower"];nwr["telecom"~"data_center|exchange"];);out center tags 500;`, 7 * 864e5)
      .then(j => towersDone(j, true, 'near')));
    // 3. the power grid: transmission lines and substations
    st.status.power = 'loading';
    queue(() => overpass('infraPower2:' + key, `[out:json][timeout:30][bbox:${bb(25)}];(way["power"="line"];way["power"="substation"];node["power"="substation"];way["power"="plant"]["plant:output:electricity"];);out geom 900;`, 14 * 864e5)
      .then(j => {
        st.status.power = j ? 'ok' : 'error';
        for (const e of (j && j.elements) || []) {
          const t = e.tags || {}, c = centerOf(e); if (!c) continue;
          if (t.power === 'substation') st.subs.push({ world: 'infra', kind: 'sub', name: t.name || 'Electrical substation', op: t.operator || '', volt: t.voltage || '', lat: c[0], lon: c[1] });
          else if (t.power === 'plant') st.subs.push({ world: 'infra', kind: 'sub', plant: true, name: t.name || 'Power plant', op: t.operator || '', volt: t['plant:source'] || '', lat: c[0], lon: c[1] });
          else if (e.geometry && e.geometry.length > 1) { const gm = e.geometry, step = Math.max(1, Math.floor(gm.length / 40)); st.power.push({ world: 'infra', kind: 'power', name: t.name || (t.power === 'line' ? 'High-voltage line' : 'Power line'), volt: t.voltage || '', op: t.operator || '', geom: gm.filter((n, i) => i % step === 0 || i === gm.length - 1), h: t.power === 'line' ? 0.03 : 0.012 }); }
        }
        cardFor = null;
      }));
    // (big broadcast towers now come from FCC licence data, so the slow 100-mile map query is gone)
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
      for (const sb of st.subs) { sb.v = geoEnu(sb.lat, sb.lon, sb.plant ? 0.05 : 0.005); const p = project(sb.v); if (!onScreen(p, 4)) continue; g.strokeStyle = C(sb.plant ? '#ff6b5e' : '#ffb45a'); g.lineWidth = 1.5; g.strokeRect(p.x - 5, p.y - 5, 10, 10); if (sb.plant) { g.beginPath(); g.moveTo(p.x - 3, p.y + 2); g.lineTo(p.x, p.y - 3); g.lineTo(p.x + 3, p.y + 2); g.stroke(); } hits.push({ x: p.x, y: p.y, r: 20, o: sb, pr: 3 }); label(placed, p.x, p.y, 6, sb.name, (sb.plant ? 'POWER PLANT' + (sb.volt ? ' · ' + sb.volt.toUpperCase() : '') : 'SUBSTATION') + ' · ' + kmTxt(Math.hypot(...sb.v)), C('#fff1d6'), C(sb.plant ? '#ff8a7a' : '#ffb45a'), 3); }
    }
    if (chip === 'all' || chip === 'towers' || chip === 'cube') {
      if (performance.now() - (st.locCheck || 0) > 2000) { st.locCheck = performance.now(); if (st.loadedFor !== S.obs.lat.toFixed(2) + ',' + S.obs.lon.toFixed(2)) load(); }
      const cube = chip === 'cube';
      if (cube) for (const x of st.rbNear || []) { x.v = geoEnu(x.lat, x.lon, 0.03); const p = project(x.v); if (!onScreen(p, 4)) continue; g.fillStyle = C('#ffc21a'); g.beginPath(); g.arc(p.x, p.y, 4, 0, 6.283); g.fill(); g.strokeStyle = C('#ffc21a', 0.6); g.lineWidth = 1.4; g.beginPath(); g.arc(p.x, p.y, 8, -2.4, -0.7); g.stroke(); hits.push({ x: p.x, y: p.y, r: 18, o: x, pr: 4 }); label(placed, p.x, p.y, 7, x.name, 'LU CUBE · ' + kmTxt(x.dist) + ' · STUDIO', C('#ffffff'), C('#ffc21a'), x === S.sel ? 9 : 3, x === S.sel); if (x === S.sel) drawReticle(p, t, '#ffc21a'); }
      if (cube && !st.cubeBusy && st.cubeDone !== st.stations.filter(sn => sn.band !== 'TV').length) runCubeScan();
      st.sv = cube ? null : servingTower();
      for (const tw of st.towers) {
        if (cube && !tw.cube) continue;
        tw.v = geoEnu(tw.lat, tw.lon, tw.h / 1000); const p = project(tw.v); if (!onScreen(p, 4)) continue;
        const col = cube ? '#ffc21a' : tw.type === 'Cell / radio mast' ? '#5ad1ff' : '#ff9ad0', d = Math.hypot(...tw.v), hidden = altOf(tw.v) < -0.05 && d > 25;
        if (hidden) g.globalAlpha = 0.55;
        g.strokeStyle = C(col); g.lineWidth = 1.5; g.beginPath(); g.moveTo(p.x, p.y + 9); g.lineTo(p.x, p.y - 4); g.moveTo(p.x - 5, p.y + 9); g.lineTo(p.x, p.y - 4); g.lineTo(p.x + 5, p.y + 9); g.stroke();
        const ph = ((t + tw.lat * 1e5) % 1800) / 1800; g.strokeStyle = C(col, 0.6 * (1 - ph)); g.beginPath(); g.arc(p.x, p.y - 4, 4 + ph * 14, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
        hits.push({ x: p.x, y: p.y, r: 20, o: tw, pr: 4 });
        g.globalAlpha = 1;
        if (cube) { const n = st.stations.filter(sn => sn.rb && sn.rb.name && towerOf(sn) === tw); if (!tw.cubeTxt || tw.cubeN !== n.length) { tw.cubeN = n.length; tw.cubeTxt = n.map(sn => sn.freq + ' ' + sn.call.split('-')[0]).slice(0, 3).join(' · ') + (n.length > 3 ? ' +' + (n.length - 3) : ''); } label(placed, p.x, p.y, 8, tw.cubeTxt, 'ON LU CUBE · ' + kmTxt(d) + (hidden ? ' · BEYOND HORIZON' : ''), C('#ffffff'), C('#ffc21a'), tw === S.sel ? 9 : 6, tw === S.sel); }
        else if (tw !== st.sv && (tw.type !== 'Cell / radio mast' || d < 8 || tw === S.sel)) label(placed, p.x, p.y, 8, tw.name !== tw.type ? tw.name : tw.op || tw.type, (tw.op && tw.name !== tw.type ? tw.op.toUpperCase() + ' · ' : '') + kmTxt(d) + (hidden ? ' · BEYOND HORIZON' : ''), C('#ffffff'), C(col), tw === S.sel ? 9 : 4, tw === S.sel);
        if (tw === S.sel) drawReticle(p, t, col);
      }
      // your phone's likely link: packets flowing down from the tower to the bottom of the screen
      const sv = st.sv;
      if (sv && sv.v) {
        const p = project(sv.v), x0 = W / 2, y0 = ZONE.bot - 4;
        if (onScreen(p, 0)) {
          const gr = g.createLinearGradient(p.x, p.y, x0, y0); gr.addColorStop(0, C('#5ad1ff', 0.9)); gr.addColorStop(1, C('#5ad1ff', 0.15));
          g.strokeStyle = gr; g.lineWidth = 2; g.setLineDash([2, 7]); g.lineDashOffset = -(t / 40) % 9; g.beginPath(); g.moveTo(p.x, p.y - 4); g.lineTo(x0, y0); g.stroke(); g.setLineDash([]); g.lineDashOffset = 0;
          for (let k = 0; k < 4; k++) { const f = ((t / 1400) + k / 4) % 1, x = p.x + (x0 - p.x) * f, y = p.y - 4 + (y0 - p.y + 4) * f; g.fillStyle = C('#bff0ff', 0.9 * (1 - f)); g.beginPath(); g.arc(x, y, 2.6, 0, 6.283); g.fill(); }
          g.strokeStyle = C('#5ad1ff', 0.9); g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y - 4, 12 + 3 * Math.sin(t / 300), 0, 6.283); g.stroke();
          label(placed, p.x, p.y, 14, 'Your phone’s likely tower', (st.carrier || 'NEAREST CELL SITE').toUpperCase() + ' · ' + kmTxt(Math.hypot(...sv.v)), C('#ffffff'), C('#5ad1ff'), 9, true);
        } else {
          g.font = MONO; g.fillStyle = C('#bff0ff'); g.textAlign = 'center';
          g.fillText('YOUR LIKELY TOWER · ' + kmTxt(sv.dist) + ' ' + cardinal(azOf(sv.v)) + ' · TURN TO FIND IT', W / 2, ZONE.bot - 10); g.textAlign = 'left';
        }
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
    if (o.kind === 'rbst') return close + `<div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">${esc(o.name)}</div><div class="card-sub mono">LU CUBE STATION · ${kmTxt(o.dist)} AWAY${o.city ? ' · ' + esc(o.city.toUpperCase()) : ''}</div></div></div>
        <div style="display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:10px;background:rgba(255,194,26,.1);border:1px solid rgba(255,194,26,.35)"><span style="flex:1;min-width:0"><span class="mono" style="display:block;font-size:9px;color:#ffc21a;letter-spacing:.06em">LU CUBE SEARCH</span><span style="user-select:text;-webkit-user-select:text;font-size:13px">${esc(o.name)}</span></span><button type="button" class="btn small" data-copy="${esc(o.name)}">${ANDROID ? 'COPY' : 'COPY &amp; OPEN'}</button></div>
        <div class="card-foot"><span>${o.tags ? esc(o.tags) + '. ' : ''}The dot is where the station says its studio is, from the radio-browser.info directory; its transmitter may be elsewhere.</span></div>`;
    if (o.kind === 'tower') {
      const t = o.tags || {}, d = Math.hypot(...(o.v || [0, 0, 0]));
      const extra = ['height', 'communication:mobile_phone', 'communication:television', 'communication:radio', 'communication:microwave'].filter(k => t[k]).map(k => `<div class="kv"><span>${esc(k.replace('communication:', '').replace('_', ' '))}</span><span>${esc(t[k])}</span></div>`).join('');
      return close + `<div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">${esc(o.name)}</div><div class="card-sub mono">${esc(o.type.toUpperCase())}${o.op ? ' · ' + esc(o.op.toUpperCase()) : ''}</div></div></div><div class="stats">${stat('AWAY', fmt(dv(d).toFixed(1)), du())}${stat('BEARING', azOf(o.v || [0, 1, 0]).toFixed(0), '°')}${stat('HEIGHT', Math.round(o.h), 'm')}${stat('ELEV', altOf(o.v || [0, 1, 0]).toFixed(1), '°')}</div>${extra ? '<div class="about">' + extra + '</div>' : ''}${o === servingTower() ? `<div class="card-foot"><span><b>Probably your phone’s tower.</b> It’s the nearest ${esc(st.carrier || 'cell')} site. Phones usually connect to the closest site with a clear path, but busy or blocked sites hand you to the next one.</span></div>` : ''}${(() => { const ss = st.stations.filter(sn => towerOf(sn) === o).sort((a, b) => a.band.localeCompare(b.band) || a.freq - b.freq); for (const sn of ss) if (sn.band !== 'TV' && sn.rb === undefined) { sn.rb = 'busy'; rbLookup(sn).then(r => { sn.rb = r; markCube(sn); cardFor = null; }); }
        return ss.length ? `<div class="srch">${ss.map(sn => `<div class="srch-row" style="display:block"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><span><b>${sn.band === 'TV' ? 'CH ' + sn.freq : sn.freq + (sn.band === 'AM' ? ' kHz' : ' MHz')}</b>&nbsp; ${esc(sn.call)}</span><span class="mono" style="font-size:10px">${esc(sn.band)}${sn.city ? ' · ' + esc(sn.city.toUpperCase()) : ''}</span></div>${sn.band === 'TV' ? '' : sn.rb && sn.rb.name ? `<div style="display:flex;gap:10px;align-items:center;margin-top:6px;padding:8px 10px;border-radius:10px;background:rgba(255,194,26,.1);border:1px solid rgba(255,194,26,.35)"><span style="flex:1;min-width:0"><span class="mono" style="display:block;font-size:9px;color:#ffc21a;letter-spacing:.06em">LU CUBE SEARCH</span><span style="user-select:text;-webkit-user-select:text;font-size:13px">${esc(sn.rb.name)}</span></span><button type="button" class="btn small" data-copy="${esc(sn.rb.name)}">${ANDROID ? 'COPY' : 'COPY &amp; OPEN'}</button></div>` : `<div class="mono muted" style="font-size:10px;margin-top:4px">${sn.rb === 'busy' ? 'LOOKING FOR ITS ONLINE STREAM…' : sn.rb === false ? 'AIR ONLY · NO ONLINE STREAM FOUND' : 'COULDN’T CHECK FOR AN ONLINE STREAM'}</div>`}</div>`).join('')}</div><div class="muted" style="font-size:11px">${ANDROID ? 'Copy a name, switch to Lu Cube and paste it in its radio search (🔎).' : 'COPY &amp; OPEN copies the name and opens Lu Cube. Paste it in its radio search (🔎).'}</div>` : o.calls && o.calls.length > 1 ? `<div class="card-foot"><span>Licences on this tower: ${esc(o.calls.join(', '))}</span></div>` : ''; })()}${o.ops && o.ops.length > 1 ? `<div class="card-foot"><span>Operators: ${esc(o.ops.join(', '))}</span></div>` : ''}<span class="muted" style="font-size:11px">${o.src === 'FCC' ? 'FCC licence data (via HIFLD). Positions are where the licence says the antenna is.' : 'Map data © OpenStreetMap contributors. Not every mast is mapped.'}</span>`;
    }
    if (o.kind === 'power' || o.kind === 'sub' || o.kind === 'dc') {
      const d = Math.hypot(...(o.v || [0, 0, 0]));
      return close + `<div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">${esc(o.name)}</div><div class="card-sub mono">${o.volt && !o.plant ? esc(o.volt.split(';').map(v => Math.round(+v / 1000) + ' kV').join(' / ')) + ' · ' : o.plant && o.volt ? esc(o.volt.toUpperCase()) + ' · ' : ''}${o.op ? esc(o.op.toUpperCase()) + ' · ' : ''}${kmTxt(d)} AWAY</div></div></div><div class="card-foot"><span>${o.kind === 'power' ? 'High-voltage lines carry power from plants to substations, which step it down for your street.' : o.plant ? 'Where your electricity is made.' : o.kind === 'sub' ? 'Substations step high-voltage power down to the levels your neighbourhood uses.' : 'Where the internet you use physically lives: servers, routers and cooling.'}</span></div><span class="muted" style="font-size:11px">Map data © OpenStreetMap contributors</span>`;
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
    start: () => load(false), stop() {}, draw, card, compact,
    home(now) {
      const s = st.status, busy = Object.values(s).includes('loading'), bad = Object.values(s).includes('error');
      const tw = st.towers.slice(0, 6).concat(st.towers.filter(x => x.type !== 'Cell / radio mast').slice(0, 4)).filter((x, i, arr) => arr.indexOf(x) === i), cells = st.towers.filter(x => x.type === 'Cell / radio mast').length;
      const rows = tw.map((x, i) => { const v = geoEnu(x.lat, x.lon, x.h / 1000); return `<button type="button" class="srch-row" data-tw="${st.towers.indexOf(x)}"><span>${esc(x.name)}${x.type === 'Cell / radio mast' ? ' <small class="muted">CELL</small>' : ''}</span><span>${kmTxt(x.dist)} ${cardinal(azOf(v))}${altOf(v) < -0.05 && x.dist > 25 ? ' · BEYOND HORIZON' : ''}</span></button>`; }).join('');
      return `<div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">Nearest towers</div><div class="card-sub mono">${cells} CELL SITES WITHIN 5 MI · ${st.towers.length - cells} BROADCAST WITHIN 100 MI · ${st.power.length} POWER LINES · ${st.subs.length} SUBSTATIONS/PLANTS</div></div></div>
        <div class="seg" id="carrierSeg">${['', 'Verizon', 'AT&T', 'T-Mobile'].map(c => `<button type="button" data-c="${esc(c)}" aria-pressed="${st.carrier === c}">${c || 'Any carrier'}</button>`).join('')}</div>
        ${(() => { const sv = servingTower(); return sv ? `<div class="srch"><button type="button" class="srch-row" data-tw="${st.towers.indexOf(sv)}"><span><b style="color:#5ad1ff">Your likely tower</b> · ${esc(sv.name)}</span><span>${kmTxt(sv.dist)} ${cardinal(azOf(geoEnu(sv.lat, sv.lon, sv.h / 1000)))}</span></button></div>` : ''; })()}
        <div class="srch">${rows || `<p class="muted" style="margin:0">${busy ? 'Loading map data… this can take up to a minute the first time.' : 'No broadcast towers are mapped near you.'}</p>`}</div>
        ${(st.rbNear && st.rbNear.length) || st.rbNearNote ? `<details id="rbNearList"${st.rbOpen ? ' open' : ''}><summary class="mono" style="cursor:pointer;font-size:11px;letter-spacing:.06em">LU CUBE STATIONS NEAR HERE · ${(st.rbNear || []).length}</summary>${st.rbNearNote ? `<p class="muted" style="margin:6px 0 0">${esc(st.rbNearNote)}</p>` : ''}<div class="srch" style="max-height:240px;overflow:auto">${(st.rbNear || []).map(x => `<div class="srch-row" style="display:flex;gap:10px;align-items:center"><span style="flex:1;min-width:0"><span style="user-select:text;-webkit-user-select:text">${esc(x.name)}</span><small class="mono muted" style="display:block">${kmTxt(x.dist)} ${cardinal(bearingTo(S.obs.lat, S.obs.lon, x.lat, x.lon))}${x.tags ? ' · ' + esc(x.tags.toUpperCase()) : ''}</small></span><button type="button" class="btn small" data-copy="${esc(x.name)}">${ANDROID ? 'COPY' : 'COPY &amp; OPEN'}</button></div>`).join('')}</div></details>` : ''}
        ${st.stations.length ? `<details id="radioDial"${st.dialOpen ? ' open' : ''}><summary class="mono" style="cursor:pointer;font-size:11px;letter-spacing:.06em">RADIO DIAL · ${st.stations.filter(x => x.band !== 'TV').length} STATIONS · ${st.stations.filter(x => x.band === 'TV').length} TV</summary>
          <div class="seg" id="dialSeg">${['FM', 'AM', 'TV'].map(b => `<button type="button" data-b="${b}" aria-pressed="${st.dial === b}">${b}</button>`).join('')}</div>
          <div class="srch" style="max-height:220px;overflow:auto">${st.stations.filter(x => x.band === st.dial).sort((a, b) => a.freq - b.freq).map(sn => `<button type="button" class="srch-row" data-sn="${st.stations.indexOf(sn)}"><span><b>${st.dial === 'TV' ? 'CH ' + sn.freq : sn.freq + (st.dial === 'AM' ? ' kHz' : '')}</b> ${esc(sn.call)}${sn.city ? ' · ' + esc(sn.city) : ''}</span><span>${kmTxt(sn.dist)} ${cardinal(bearingTo(S.obs.lat, S.obs.lon, sn.lat, sn.lon))}</span></button>`).join('') || '<p class="muted" style="margin:0">None found nearby.</p>'}</div></details>` : ''}
        ${st.cubeTotal ? `<div class="muted mono" style="font-size:10px">LU CUBE CHECK · ${st.cubeDone}/${st.cubeTotal} STATIONS · ${st.stations.filter(x => x.rb && x.rb.name).length} PLAYABLE · ${st.stations.filter(x => x.rb === null).length} COULDN’T CHECK</div>` : ''}
        <div class="muted mono" style="font-size:10px">${[['rbNear', 'LU CUBE NEARBY'], ['fccCell', 'FCC CELL SITES'], ['fccBroadcast', 'FCC FM/AM/TV'], ['near', 'OSM MASTS'], ['power', 'OSM POWER']].map(([k, n]) => n + ' ' + (s[k] === 'ok' ? '✓' : s[k] === 'error' ? '✕' : '…')).join(' · ')}</div>
        ${bad ? '<div class="card-actions"><button type="button" class="btn small" id="infraRetry">Some sources failed. Try again</button></div>' : ''}
        <span class="muted" style="font-size:11px">Towers: FCC licence data via HIFLD, plus OpenStreetMap. Power: © OpenStreetMap contributors.</span>`;
    },
    homeCompact() { const tw = st.towers.find(x => x.type !== 'Cell / radio mast'); return `<button type="button" class="mini"><b>${st.towers.length} towers</b><span class="mono">${tw ? 'NEAREST BROADCAST ' + kmTxt(tw.dist) : Object.values(st.status).includes('loading') ? 'LOADING MAP DATA…' : 'TAP FOR DETAILS'}</span></button>`; },
    wire(card) { wireCopy(card); },
    wireHome(card) {
      $$('[data-tw]', card).forEach(b => b.onclick = () => { const x = st.towers[+b.dataset.tw]; if (!x) return; x.v = geoEnu(x.lat, x.lon, x.h / 1000); select(x); if (S.mode === 'sky') { S.viewAz = azOf(x.v); S.viewAlt = 2; S.zoom = 3; } });
      const r = $('#infraRetry', card); if (r) r.onclick = () => { load(true); };
      $$('#carrierSeg button', card).forEach(b => b.onclick = e => { e.stopPropagation(); st.carrier = b.dataset.c; ls.set('carrier', st.carrier); cardFor = null; updateCard(simNow(), true); });
      $$('#dialSeg button', card).forEach(b => b.onclick = e => { e.stopPropagation(); st.dial = b.dataset.b; cardFor = null; updateCard(simNow(), true); });
      const dl = $('#radioDial', card); if (dl) dl.ontoggle = () => { st.dialOpen = dl.open; };
      const rn = $('#rbNearList', card); if (rn) rn.ontoggle = () => { st.rbOpen = rn.open; };
      wireCopy(card);
      $$('[data-sn]', card).forEach(b => b.onclick = () => { const sn = st.stations[+b.dataset.sn], x = sn && towerOf(sn); if (!x) return; x.v = geoEnu(x.lat, x.lon, x.h / 1000); select(x); if (S.mode === 'sky') { S.viewAz = azOf(x.v); S.viewAlt = 2; S.zoom = 3; } });
    },
    chips: [['all', 'Everything'], ['space', 'Satellites'], ['towers', 'Towers'], ['cube', 'Cube Compatible'], ['power', 'Power grid']],
    hud: () => wchip('infra') === 'cube' ? '<b>' + st.towers.filter(x => x.cube).length + '</b> CUBE TOWERS · <b>' + (st.rbNear || []).length + '</b> STATIONS' + (st.cubeBusy ? ' · CHECKING ' + st.cubeDone + '/' + st.cubeTotal : '') : '<b>' + st.towers.length + '</b> TOWERS · <b>' + st.power.length + '</b> LINES', below: true,
    view: { alt: 8 }
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
  const st = { parts: [], lines: null, linesFor: '' };
  // Earth's main field as a tilted dipole: field lines r = L·cos²(magnetic latitude), drawn from the southern footpoint to the northern one.
  function fieldLines() {
    const key = S.obs.lat.toFixed(2) + ',' + S.obs.lon.toFixed(2);
    if (st.lines && st.linesFor === key) return st.lines;
    const pole = GEOMAG.dipolePole(new Date()), pl = pole.lat * D2R, po = pole.lon * D2R;
    const z = [Math.cos(pl) * Math.cos(po), Math.cos(pl) * Math.sin(po), Math.sin(pl)];
    const o = [S.obs.x, S.obs.y, S.obs.z], on = Math.hypot(...o), ou = o.map(v => v / on);
    const dz = ou[0] * z[0] + ou[1] * z[1] + ou[2] * z[2];
    let x = [ou[0] - dz * z[0], ou[1] - dz * z[1], ou[2] - dz * z[2]]; const xn = Math.hypot(...x); x = x.map(v => v / xn);
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    const lamObs = Math.asin(clamp(dz, -1, 1)), L0 = 1 / Math.cos(lamObs) ** 2;
    const lines = [];
    const add = (L, phiDeg, main) => {
      const lam1 = Math.acos(Math.sqrt(1 / L)), phi = phiDeg * D2R, pts = [];
      for (let k = 0; k <= 120; k++) {
        const lam = -lam1 + 2 * lam1 * k / 120, r = 6371 * L * Math.cos(lam) ** 2;
        const a = r * Math.cos(lam) * Math.cos(phi), b = r * Math.cos(lam) * Math.sin(phi), c = r * Math.sin(lam);
        const e = [x[0] * a + y[0] * b + z[0] * c, x[1] * a + y[1] * b + z[1] * c, x[2] * a + y[2] * b + z[2] * c];
        pts.push(ecefDeltaToEnu(e[0] - S.obs.x, e[1] - S.obs.y, e[2] - S.obs.z));
      }
      lines.push({ L, phi: phiDeg, pts, main, apex: pts[60], top: (L - 1) * 6371 });
      if (main) st.L0 = L - 1;
    };
    // lines that rise over your sky and loop out into space (the line through your own feet just dives into the ground)
    add(L0 + 1, 0, true);
    for (const d of [-50, -35, -20, -10, 10, 20, 35, 50]) { add(L0 + 1, d, false); add(L0 + 3, d, false); }
    for (const d of [-25, 25]) add(L0 + 0.5, d, false);
    add(L0 + 6, 0, false);
    st.lines = lines; st.linesFor = key;
    return lines;
  }
  function fieldHere() { return GEOMAG.field(S.obs.lat, S.obs.lon, 0, simNow()); }
  function draw(now, placed, t, ar) {
    dimStars(0.4);
    const f = fieldHere(), b = [f.Y / f.F, f.X / f.F, -f.Z / f.F]; // East, North, Up
    // the big picture: field lines looping through space from the southern hemisphere to the northern
    const flow = -(Date.now() / 30) % 400;
    for (const ln of fieldLines()) {
      let prev = null, prevUp = false;
      for (const v of ln.pts) {
        const p = project(v), up = altOf(v) > 0;
        if (prev && up && prevUp && p.ok && prev.ok && Math.abs(p.x - prev.x) < W * 2 && Math.abs(p.y - prev.y) < H * 2) {
          g.strokeStyle = C('#7cf2d8', ln.main ? 0.85 : 0.45); g.lineWidth = ln.main ? 2.4 : 1.4;
          g.setLineDash([16, 10]); g.lineDashOffset = flow;
          g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(p.x, p.y); g.stroke();
        }
        prev = p; prevUp = up;
      }
      g.setLineDash([]); g.lineDashOffset = 0;
      if (ln.main) { const pa = project(ln.apex); if (onScreen(pa, 0) && altOf(ln.apex) > 0) label(placed, pa.x, pa.y, 6, 'Earth’s field line', 'LOOPS ' + kmTxt(ln.top) + ' ABOVE THE EQUATOR', C('#ffffff'), C('#7cf2d8'), 6, true); }
    }
    // streaming field lines: short segments drifting along the field direction
    const real = Date.now();
    while (st.parts.length < 220) st.parts.push({ p: [(Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60], a: Math.random() });
    for (const q of st.parts) {
      q.a += 0.004; if (q.a > 1) { q.a = 0; q.p = [(Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60]; }
      const s = (q.a - 0.5) * 50, p0 = [q.p[0] + b[0] * s, q.p[1] + b[1] * s, q.p[2] + b[2] * s], p1 = [p0[0] + b[0] * 14, p0[1] + b[1] * 14, p0[2] + b[2] * 14];
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
      <div class="card-foot"><span>The long dashed loops are Earth’s field lines: they leave the planet in the southern hemisphere, arc out into space and dive back in up north. The highlighted one loops ${kmTxt(((st.L0 || 3)) * 6371)} above the equator; the dashes flow the way the field points. Only the parts above your horizon are drawn.</span></div>
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
    view: { alt: 10, az: 180 }
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
