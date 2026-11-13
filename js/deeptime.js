/* Sky Watch · deeptime.js · Deep time: a slider from 10,000 BC to 10,000 AD, what was happening around the world,
   famous sky moments, Halley's Comet on any return, and the great supernovae. Loads after extras.js. */
'use strict';

// ---------- dates in deep time (astronomical years: 0 = 1 BC, −2559 = 2560 BC) ----------
const BC = n => 1 - n;
const yearTxt = y => y <= 0 ? fmt(1 - y) + ' BC' : y < 10000 ? 'AD ' + y : fmt(y) + ' AD';
function dateAt(y, mo, d, hLocal, lon) {
  const t = new Date(Date.UTC(2000, mo - 1, d, 0, 0, 0)); t.setUTCFullYear(y, mo - 1, d);
  return t.getTime() + ((hLocal == null ? 22 : hLocal) - (lon == null ? S.obs.lon : lon) / 15) * 3600e3;
}
const yearOf = ms => { const d = new Date(ms); return d.getUTCFullYear() + (d.getUTCMonth() + d.getUTCDate() / 31) / 12; };

// ---------- Halley's Comet: a Kepler orbit (J2000 ecliptic elements) through each recorded perihelion ----------
const HALLEY = { q: 0.58598, e: 0.96714, i: 162.262, node: 58.42, peri: 111.333 };
const HALLEY_T = [-239.4, -163.9, -86.6, -11.7, 66.1, 141.2, 218.4, 295.3, 374.1, 451.5, 530.7, 607.2, 684.8, 760.4, 837.2, 912.6, 989.7, 1066.2, 1145.3, 1222.7, 1301.8, 1378.9, 1456.4, 1531.7, 1607.8, 1682.7, 1759.2, 1835.9, 1910.3, 1986.1, 2061.6, 2134.2];
const yearMs = y => { const yi = Math.floor(y), t = new Date(Date.UTC(2000, 0, 1)); t.setUTCFullYear(yi, 0, 1); return t.getTime() + (y - yi) * 365.25 * 864e5; };
function halleyAt(ms) {
  const y = yearOf(ms); let Tp = null;
  for (const t of HALLEY_T) if (Math.abs(t - y) < 0.6) Tp = t;
  // Before about 1700 the orbit had drifted too far from today’s elements to place the comet honestly.
  if (Tp == null || Tp < 1700 || !window.Astronomy) return null;
  const H = HALLEY, a = H.q / (1 - H.e), n = 0.9856076686 / Math.pow(a, 1.5) * D2R, M = n * (ms - yearMs(Tp)) / 864e5;
  let E = M + H.e * Math.sin(M); for (let k = 0; k < 60; k++) { const dE = (E - H.e * Math.sin(E) - M) / (1 - H.e * Math.cos(E)); E -= dE; if (Math.abs(dE) < 1e-10) break; }
  const xp = a * (Math.cos(E) - H.e), yp = a * Math.sqrt(1 - H.e * H.e) * Math.sin(E), r = Math.hypot(xp, yp);
  const w = H.peri * D2R, O = H.node * D2R, i = H.i * D2R, cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i);
  const xe = (cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp, ye = (sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp, ze = (sw * si) * xp + (cw * si) * yp;
  const ob = 23.4392911 * D2R, X = xe, Y = ye * Math.cos(ob) - ze * Math.sin(ob), Z = ye * Math.sin(ob) + ze * Math.cos(ob);
  let ev; try { ev = Astronomy.HelioVector(Astronomy.Body.Earth, new Date(ms)); } catch (e) { return null; }
  const gx = X - ev.x, gy = Y - ev.y, gz = Z - ev.z, D = Math.hypot(gx, gy, gz);
  const raH = ((Math.atan2(gy, gx) * R2D / 15) + 24) % 24, decD = Math.asin(gz / D) * R2D;
  const mag = 5.5 + 5 * Math.log10(D) + 10 * Math.log10(r);
  return { raH, decD, r, D, mag, Tp };
}
// ---------- the great naked-eye supernovae ----------
const NOVAE = [
  { name: 'Supernova 1006', now: 'Its remnant, SN 1006, glows in X-rays today', raH: 15.0467, decD: -41.95, t: [1006, 5, 1], peak: -7.5, last: 3 * 365 },
  { name: 'Supernova 1054', now: 'It left the Crab Nebula, with a pulsar spinning 30 times a second', raH: 5.5753, decD: 22.0145, t: [1054, 7, 4], peak: -6, last: 653 },
  { name: 'Supernova 1181', now: 'Possibly the remnant 3C 58 or Pa 30 in Cassiopeia', raH: 2.1, decD: 64.8, t: [1181, 8, 6], peak: 0, last: 185 },
  { name: 'Tycho’s Supernova', now: 'Tycho Brahe’s “new star” proved the heavens can change', raH: 0.4217, decD: 64.15, t: [1572, 11, 11], peak: -4, last: 480 },
  { name: 'Kepler’s Supernova', now: 'The last one seen in our galaxy with the naked eye', raH: 17.51, decD: -21.48, t: [1604, 10, 9], peak: -2.5, last: 365 }
];
NOVAE.forEach(n => { n.kind = 'deepobj'; n.sub = 'sn'; n.ms = dateAt(n.t[0], n.t[1], n.t[2], 0, 0); });

// ---------- what was happening around the world (historical years; sky ones carry a moment to jump to) ----------
// [year, title, place, lat, lon, sky moment {m, d, h (local), az, alt, aim}]
const EVENTS = [
  [BC(12000), 'Vega was near the north pole of the sky', 'Seen from anywhere in the north', null, null, { m: 6, d: 21, h: 23, aim: 'pole' }],
  [BC(9600), 'The last Ice Age ends; seas rise worldwide', 'Everywhere', null, null],
  [BC(9500), 'Göbekli Tepe, the oldest known temple, is built', 'Türkiye', 37.2231, 38.9224],
  [BC(9000), 'Farming begins in the Fertile Crescent', 'Jericho', 31.871, 35.444],
  [BC(7000), 'Rice is farmed along the Yangtze', 'China', 30.5, 114.3],
  [BC(6200), 'Doggerland floods and Britain becomes an island', 'North Sea', 54.5, 2.0],
  [BC(4500), 'The Carnac standing stones are raised', 'Brittany, France', 47.5917, -3.0786],
  [BC(3500), 'The first cities rise in Sumer', 'Uruk, Iraq', 31.3222, 45.6367],
  [BC(3200), 'Writing is invented: cuneiform', 'Uruk, Iraq', 31.3222, 45.6367],
  [BC(3100), 'Egypt is united under one king', 'Memphis, Egypt', 29.8445, 31.2503],
  [BC(3000), 'Stonehenge’s first earthwork circle is dug', 'Wiltshire, England', 51.1789, -1.8262],
  [BC(2600), 'Mohenjo-daro thrives in the Indus Valley', 'Pakistan', 27.3294, 68.1389],
  [BC(2560), 'The Great Pyramid is finished, aligned with the pole star Thuban', 'Giza, Egypt', 29.9792, 31.1342, { m: 6, d: 21, h: 23, az: 0, alt: 30, aim: 'pole' }],
  [BC(2500), 'Stonehenge’s great stones frame the midsummer sunrise', 'Wiltshire, England', 51.1789, -1.8262, { m: 6, d: 21, h: 4.4, az: 50, alt: 2 }],
  [BC(2334), 'Sargon founds the Akkadian Empire, the first empire', 'Mesopotamia', 33.1, 44.1],
  [BC(1754), 'Hammurabi’s law code is carved in stone', 'Babylon, Iraq', 32.5355, 44.4275],
  [BC(1600), 'The Nebra sky disc, the oldest known sky map', 'Germany', 51.2842, 11.5208, { m: 3, d: 21, h: 21, az: 270, alt: 25 }],
  [BC(1323), 'Tutankhamun is buried in the Valley of the Kings', 'Egypt', 25.7402, 32.6014],
  [BC(1200), 'The Bronze Age collapse sweeps the Mediterranean', 'Eastern Mediterranean', 35.0, 30.0],
  [BC(1000), 'Polynesian voyagers begin crossing the Pacific by the stars', 'Tonga', -21.1789, -175.1982, { m: 10, d: 1, h: 22, az: 180, alt: 30 }],
  [BC(776), 'The first Olympic Games', 'Olympia, Greece', 37.6379, 21.63],
  [BC(753), 'Rome is founded, by legend', 'Rome', 41.8902, 12.4922],
  [BC(585), 'Thales predicts a solar eclipse that stops a battle', 'Halys River, Türkiye', 39.9, 34.0, { m: 5, d: 28, h: 18.4, aim: 'sun' }],
  [BC(551), 'Confucius is born', 'Qufu, China', 35.597, 116.991],
  [BC(490), 'The Battle of Marathon', 'Greece', 38.1186, 23.9786],
  [BC(432), 'The Parthenon is completed', 'Athens', 37.9715, 23.7267],
  [BC(334), 'Alexander the Great marches into Asia', 'Hellespont', 40.2, 26.4],
  [BC(240), 'The first recorded sighting of Halley’s Comet', 'China', 34.27, 108.94, { m: 5, d: 25, h: 21, note: 'halley' }],
  [BC(221), 'Qin unites China; the first Great Wall is linked', 'China', 40.4319, 116.5704],
  [BC(44), 'Julius Caesar is assassinated', 'Rome', 41.8953, 12.4768],
  [BC(7), 'Jupiter and Saturn meet three times: the Star of Bethlehem?', 'Near Jerusalem', 31.7683, 35.2137, { m: 9, d: 29, h: 21, aim: 'jupiter' }],
  [79, 'Vesuvius buries Pompeii', 'Italy', 40.7486, 14.4842],
  [105, 'Paper is invented in China', 'Luoyang, China', 34.62, 112.45],
  [476, 'The Western Roman Empire falls', 'Ravenna, Italy', 44.4184, 12.2035],
  [537, 'Hagia Sophia is completed', 'Constantinople', 41.0086, 28.9802],
  [600, 'Chichén Itzá rises in the Maya world', 'Yucatán, Mexico', 20.6843, -88.5678],
  [622, 'The Hijra; the Islamic calendar begins', 'Medina', 24.4672, 39.6111],
  [800, 'Charlemagne is crowned emperor', 'Rome', 41.9022, 12.4539],
  [837, 'Halley’s Comet makes its closest pass ever to Earth', 'China', 34.27, 108.94, { m: 4, d: 10, h: 2, note: 'halley' }],
  [1006, 'The brightest supernova in history appears', 'Cairo, Egypt', 30.0444, 31.2357, { m: 5, d: 3, h: 22, aim: 'nova:Supernova 1006' }],
  [1054, 'A supernova bright enough to see by day: the Crab Nebula is born', 'Kaifeng, China', 34.7973, 114.3076, { m: 7, d: 5, h: 4.6, aim: 'nova:Supernova 1054' }],
  [1066, 'Halley’s Comet blazes before the Battle of Hastings', 'England', 50.9115, 0.4876, { m: 4, d: 24, h: 21.5, note: 'halley' }],
  [1150, 'Angkor Wat is built', 'Cambodia', 13.4125, 103.867],
  [1206, 'Genghis Khan unites the Mongols', 'Mongolia', 47.92, 106.92],
  [1300, 'Great Zimbabwe at its height', 'Zimbabwe', -20.2675, 30.9338],
  [1324, 'Mansa Musa’s pilgrimage shows off Mali’s gold', 'Timbuktu', 16.7666, -3.0026],
  [1347, 'The Black Death reaches Europe', 'Messina, Sicily', 38.1938, 15.554],
  [1450, 'Machu Picchu is built', 'Peru', -13.1631, -72.545],
  [1455, 'Gutenberg prints his Bible', 'Mainz, Germany', 49.9929, 8.2473],
  [1492, 'Columbus reaches the Americas', 'Bahamas', 24.06, -74.53],
  [1519, 'Magellan sets out to sail around the world', 'Spain', 36.7781, -6.3515],
  [1543, 'Copernicus puts the Sun at the centre', 'Frombork, Poland', 54.3576, 19.6817],
  [1572, 'Tycho Brahe sees a “new star”', 'Denmark', 56.08, 13.17, { m: 11, d: 11, h: 19, aim: 'nova:Tycho’s Supernova' }],
  [1604, 'Kepler’s Supernova, the last seen in our galaxy', 'Prague', 50.0875, 14.4214, { m: 10, d: 17, h: 18.5, aim: 'nova:Kepler’s Supernova' }],
  [1610, 'Galileo finds four moons circling Jupiter', 'Padua, Italy', 45.4064, 11.8768, { m: 1, d: 7, h: 22, aim: 'jupiter' }],
  [1687, 'Newton explains gravity', 'Cambridge, England', 52.2053, 0.1218],
  [1759, 'Halley’s Comet returns, just as Halley predicted', 'London', 51.5074, -0.1278, { m: 4, d: 20, h: 21, aim: 'comet' }],
  [1776, 'The US Declaration of Independence', 'Philadelphia', 39.9489, -75.15],
  [1781, 'William Herschel discovers Uranus', 'Bath, England', 51.3811, -2.359, { m: 3, d: 13, h: 23, aim: 'uranus' }],
  [1789, 'The French Revolution', 'Paris', 48.8566, 2.3522],
  [1846, 'Neptune is found exactly where maths predicted', 'Berlin', 52.52, 13.405, { m: 9, d: 23, h: 23.5, aim: 'neptune' }],
  [1859, 'The Carrington Event: auroras seen near the tropics', 'Cuba', 23.1136, -82.3666, { m: 9, d: 2, h: 1, az: 0, alt: 25 }],
  [1903, 'The Wright brothers fly', 'Kitty Hawk, USA', 36.0144, -75.6678],
  [1908, 'The Tunguska blast flattens 2,000 km² of forest', 'Siberia', 60.886, 101.894],
  [1910, 'Earth passes through Halley’s Comet’s tail', 'New York', 40.7128, -74.006, { m: 5, d: 15, h: 4, aim: 'comet' }],
  [1945, 'The first atomic bomb is tested', 'New Mexico', 33.6773, -106.4754],
  [1957, 'Sputnik 1, the first satellite', 'Baikonur', 45.92, 63.34],
  [1961, 'Yuri Gagarin, the first human in space', 'Baikonur', 45.92, 63.34],
  [1969, 'Apollo 11 lands on the Moon', 'Houston', 29.5593, -95.09, { m: 7, d: 20, h: 15.3, aim: 'moon' }],
  [1986, 'Halley’s Comet’s last visit', 'Australia', -33.87, 151.21, { m: 4, d: 11, h: 4, aim: 'comet' }],
  [1998, 'The first piece of the ISS is launched', 'Baikonur', 45.92, 63.34],
  [2061, 'Halley’s Comet returns', 'Your sky', null, null, { m: 7, d: 29, h: 21, aim: 'comet' }],
  [2100, 'Polaris is as close to the pole as it ever gets', 'Your sky', null, null, { m: 1, d: 1, h: 22, aim: 'pole' }],
  [2134, 'Halley’s Comet passes close again', 'Your sky', null, null, { m: 3, d: 28, h: 4, aim: 'comet' }],
  [4000, 'Errai in Cepheus takes over as the pole star', 'Your sky', null, null, { m: 1, d: 1, h: 22, aim: 'pole' }],
  [7500, 'Alderamin becomes the pole star', 'Your sky', null, null, { m: 1, d: 1, h: 22, aim: 'pole' }],
  [10000, 'Deneb is near the pole; Arcturus has moved 5° across the sky', 'Your sky', null, null, { m: 6, d: 1, h: 23, aim: 'pole' }],
  [13727, 'Vega is the pole star again', 'Your sky', null, null, { m: 6, d: 21, h: 23, aim: 'pole' }]
];

// ---------- drawing: pole marker, Halley, supernovae ----------
function poleInfo() {
  const north = S.obs.lat >= 0, pv = vecAA(north ? 0 : 180, Math.abs(S.obs.lat));
  let best = null, bd = 99;
  for (const s of STARS) { if (!s.v || s.mag > 4) continue; const d = Math.acos(clamp(s.v[0] * pv[0] + s.v[1] * pv[1] + s.v[2] * pv[2], -1, 1)) * R2D; if (d < bd) { bd = d; best = s; } }
  return { v: pv, north, star: best, sep: bd };
}
function drawDeepTime(now, placed, t) {
  if (S.world !== 'sky') return;
  const lst = gmst(now) + S.obs.lon * D2R;
  // Halley
  if (!DTC.at || Math.abs(performance.now() - DTC.at) > 1000 || Math.abs(t - DTC.t) > 36e5) { DTC.at = performance.now(); DTC.t = t; DTC.h = halleyAt(t); DTC.pole = (DT.on || S.sel === POLE_OBJ) ? poleInfo() : null; }
  const h = DTC.h;
  if (h && h.mag < 9) {
    const p0 = precess(h.raH, h.decD, now), v = refract(eqToEnu(p0.ra, p0.dec, lst, S.obs)), q = project(v);
    HALLEY_OBJ.v = v; HALLEY_OBJ.info = h;
    if (onScreen(q, 40) && altOf(v) > -2) {
      const sq = SUN.v ? project(SUN.v) : null; let dx = 0, dy = -1;
      if (sq && sq.ok) { const L = Math.hypot(q.x - sq.x, q.y - sq.y) || 1; dx = (q.x - sq.x) / L; dy = (q.y - sq.y) / L; }
      const len = clamp(140 / Math.max(h.r, 0.4), 20, 260) * clamp(2.2 - h.mag / 4, 0.3, 1.6);
      const gr = g.createLinearGradient(q.x, q.y, q.x + dx * len, q.y + dy * len); gr.addColorStop(0, C('#dff6ff', 0.75)); gr.addColorStop(1, C('#7cc4ff', 0));
      g.strokeStyle = gr; g.lineCap = 'round';
      for (const [w, sp] of [[9, 0], [4, 0.12], [3, -0.1]]) { g.lineWidth = w; g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x + (dx + sp * dy) * len, q.y + (dy - sp * dx) * len); g.stroke(); }
      const hg = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, 9); hg.addColorStop(0, C('#ffffff')); hg.addColorStop(1, C('#9fe0ff', 0));
      g.fillStyle = hg; g.beginPath(); g.arc(q.x, q.y, 9, 0, 6.283); g.fill();
      label(placed, q.x, q.y, 10, 'Halley’s Comet', 'MAG ' + h.mag.toFixed(1) + ' · ' + fmt(Math.round(h.D * 149.6)) + 'M KM AWAY', C('#ffffff'), C('#9fe0ff'), 9, true);
      hits.push({ x: q.x, y: q.y, r: 30, o: HALLEY_OBJ, pr: 8 });
      if (S.sel === HALLEY_OBJ) drawReticle(q, t, '#9fe0ff');
    }
  } else HALLEY_OBJ.v = null;
  // supernovae, fading over months
  for (const n of NOVAE) {
    const days = (t - n.ms) / 864e5; if (days < -1 || days > n.last) { n.v = null; continue; }
    n.mag = n.peak + (days < 0 ? 4 : 6 - n.peak) * Math.pow(Math.max(days, 0) / n.last, 0.8);
    const p0 = precess(n.raH, n.decD, now); n.v = refract(eqToEnu(p0.ra, p0.dec, lst, S.obs)); const q = project(n.v);
    if (!onScreen(q, 30) || altOf(n.v) < -1) continue;
    const rr = clamp(14 - n.mag * 2.2, 4, 30), gr = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, rr);
    gr.addColorStop(0, C('#ffffff')); gr.addColorStop(0.3, C('#fff3c4', 0.9)); gr.addColorStop(1, C('#ffb45a', 0));
    g.fillStyle = gr; g.beginPath(); g.arc(q.x, q.y, rr, 0, 6.283); g.fill();
    g.strokeStyle = C('#fff3c4', 0.6); g.lineWidth = 1; g.beginPath(); g.moveTo(q.x - rr * 1.6, q.y); g.lineTo(q.x + rr * 1.6, q.y); g.moveTo(q.x, q.y - rr * 1.6); g.lineTo(q.x, q.y + rr * 1.6); g.stroke();
    label(placed, q.x, q.y, rr, n.name, 'MAG ' + n.mag.toFixed(1) + (n.mag < -3.5 ? ' · VISIBLE IN DAYLIGHT' : ''), C('#ffffff'), C('#ffd27a'), 9, true);
    hits.push({ x: q.x, y: q.y, r: 30, o: n, pr: 8 });
    if (S.sel === n) drawReticle(q, t, '#ffd27a');
  }
  // the celestial pole and whichever star is nearest it in this era
  if (DT.on || S.sel === POLE_OBJ) {
    const pi = DTC.pole || poleInfo(), q = project(pi.v); POLE_OBJ.v = pi.v; POLE_OBJ.info = pi;
    if (onScreen(q, 0)) {
      g.strokeStyle = C('#9fe0ff', 0.8); g.lineWidth = 1.2; g.beginPath(); g.arc(q.x, q.y, 10, 0, 6.283); g.moveTo(q.x - 16, q.y); g.lineTo(q.x + 16, q.y); g.moveTo(q.x, q.y - 16); g.lineTo(q.x, q.y + 16); g.stroke();
      label(placed, q.x, q.y, 12, (pi.north ? 'North' : 'South') + ' celestial pole', pi.star && pi.sep < 6 ? 'POLE STAR: ' + pi.star.name.toUpperCase() + ' · ' + pi.sep.toFixed(1) + '° AWAY' : 'NO BRIGHT POLE STAR IN THIS ERA', C('#ffffff'), C('#9fe0ff'), 8, true);
      hits.push({ x: q.x, y: q.y, r: 26, o: POLE_OBJ, pr: 7 });
    }
  }
}
const DTC = { at: 0, t: 0, h: null, pole: null };
const HALLEY_OBJ = { kind: 'deepobj', sub: 'halley', name: 'Halley’s Comet' };
const POLE_OBJ = { kind: 'deepobj', sub: 'pole', name: 'Celestial pole' };
function deepCard(o) {
  const close = '<button type="button" id="cardClose" aria-label="Close details">×</button>';
  if (o.sub === 'halley' && o.info) { const h = o.info; return close + `<div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">Halley’s Comet</div><div class="card-sub mono">RETURN OF ${yearTxt(Math.round(h.Tp))} · EVERY ~76 YEARS</div></div></div><div class="stats">${stat('MAG', h.mag.toFixed(1))}${stat('FROM SUN', h.r.toFixed(2), 'AU')}${stat('FROM EARTH', fmt(Math.round(h.D * 149.6)), 'M KM')}</div><div class="card-foot"><span>A 15 km ball of ice and dust on a 76-year loop. Its tail always points away from the Sun. Position from its orbit, good to a degree or two; the tail is drawn for show.</span></div>`; }
  if (o.sub === 'sn') return close + `<div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">${esc(o.name)}</div><div class="card-sub mono">A DYING STAR EXPLODES · MAG ${o.mag != null ? o.mag.toFixed(1) : ''}</div></div></div><div class="card-foot"><span>${esc(o.now)}. Brightness fades over the months it was recorded; the exact curve is a sketch.</span></div>`;
  if (o.sub === 'pole' && o.info) { const p = o.info; return close + `<div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">${p.north ? 'North' : 'South'} celestial pole</div><div class="card-sub mono">THE SKY TURNS AROUND THIS POINT</div></div></div><div class="card-foot"><span>Earth’s axis wobbles like a spinning top, tracing a circle every 25,800 years, so the pole wanders among the stars. ${p.star && p.sep < 6 ? `In ${yearTxt(Math.round(yearOf(simNow().getTime())))} the nearest bright star is <b>${esc(p.star.name)}</b>, ${p.sep.toFixed(1)}° away.` : 'Right now no bright star sits near it.'} Polaris today, Thuban when the pyramids rose, Vega around AD 13,700.</span></div>`; }
  return close + `<div class="card-title">${esc(o.name)}</div>`;
}
function deepCompact(o) { return `<button type="button" class="mini"><b>${esc(o.name)}</b><span class="mono">${o.sub === 'pole' ? 'THE SKY TURNS AROUND THIS POINT' : o.mag != null ? 'MAG ' + o.mag.toFixed(1) : ''}</span></button>`; }

// ---------- the Deep time panel ----------
const DT = { on: false, year: 2026, filter: 'all', pick: null, list: [] };
// Load a year (one recompute per tap, never while scrolling)
function setDeepYear(y) {
  y = Math.round(clamp(y, -9999, 14000)); DT.year = y;
  S.rate = 1; S.tmBase = dateAt(y, 6, 21, 23) - Date.now(); setOffset(S.tmBase); DTC.at = 0;
  renderHead();
}
function renderHead() {
  $('#dtYear').textContent = yearTxt(DT.year);
  const pi = S.obs ? poleInfo() : null;
  $('#dtPole').textContent = pi && pi.star && pi.sep < 6 ? 'POLE STAR: ' + pi.star.name.toUpperCase() : 'NO POLE STAR IN THIS ERA';
}
function buildWheel() {
  DT.list = EVENTS.filter(e => DT.filter === 'all' || e[5]).sort((a, b) => a[0] - b[0]);
  $('#dtItems').innerHTML = DT.list.map((e, i) => `<div class="dtitem${e[5] ? ' sky' : ''}" data-i="${i}"><b>${yearTxt(e[0])}</b><span>${esc(e[1])}</span></div>`).join('');
  // start on the event nearest the year you're in
  let k = 0, bd = 1e9; DT.list.forEach((e, i) => { const d = Math.abs(e[0] - DT.year); if (d < bd) { bd = d; k = i; } });
  $('#dtWheel').scrollTop = k * 40; pickAt(k);
}
function pickAt(k) {
  k = clamp(k, 0, DT.list.length - 1); if (DT.pick === k && $('.dtitem.on')) return;
  const old = $('.dtitem.on'); if (old) old.classList.remove('on');
  const el = $(`.dtitem[data-i="${k}"]`); if (el) el.classList.add('on');
  DT.pick = k; const e = DT.list[k]; if (!e) return;
  $('#dtWhen').textContent = yearTxt(e[0]).toUpperCase() + (e[5] ? ' · ★ SKY MOMENT' : '');
  $('#dtWhere').textContent = e[1] + ' · ' + e[2];
}
let wheelRaf = 0;
$('#dtWheel').addEventListener('scroll', () => {
  S.uiScrollAt = performance.now();
  if (wheelRaf) return;
  wheelRaf = requestAnimationFrame(() => { wheelRaf = 0; pickAt(Math.round($('#dtWheel').scrollTop / 40)); });
}, { passive: true });
$('#dtItems').addEventListener('click', e => { const it = e.target.closest('.dtitem'); if (!it) return; const k = +it.dataset.i; $('#dtWheel').scrollTo({ top: k * 40, behavior: 'smooth' }); pickAt(k); });
$('#dtGo').onclick = () => { const e = DT.list[DT.pick]; if (!e) return; goEvent(e); $('#deepBar').classList.add('folded'); $('#dtFold').setAttribute('aria-expanded', 'false'); };
$('#dtFold').onclick = () => { const f = $('#deepBar').classList.toggle('folded'); $('#dtFold').setAttribute('aria-expanded', String(!f)); if (!f) buildWheel(); };
$$('.dtfilter button').forEach(b => b.onclick = () => { DT.filter = b.dataset.f; $$('.dtfilter button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); buildWheel(); });
function aimDeep(aim) {
  let v = null;
  if (aim === 'pole') v = poleInfo().v;
  else if (aim === 'comet') { const h = halleyAt(simNow().getTime()); if (h) { const p0 = precess(h.raH, h.decD, simNow()); v = refract(eqToEnu(p0.ra, p0.dec, gmst(simNow()) + S.obs.lon * D2R, S.obs)); select(HALLEY_OBJ); } }
  else if (aim && aim.startsWith('nova:')) { const n = NOVAE.find(x => x.name === aim.slice(5)); if (n) { const p0 = precess(n.raH, n.decD, simNow()); v = refract(eqToEnu(p0.ra, p0.dec, gmst(simNow()) + S.obs.lon * D2R, S.obs)); select(n); } }
  else if (aim === 'sun' && SUN.v) v = SUN.v;
  else if (aim === 'moon' && typeof MOON !== 'undefined' && MOON.v) v = MOON.v;
  else if (aim) { const pl = (typeof PLANETS !== 'undefined' ? PLANETS : []).find(p => p.name.toLowerCase() === aim); if (pl && pl.v) { v = pl.v; select(pl); } }
  return v;
}
function goEvent(e) {
  const mo = e[5] || {};
  if (e[3] != null) jumpTo(e[3], e[4], e[2].split(',')[0], e[1]);
  const lon = e[3] != null ? e[4] : S.obs.lon;
  DT.year = e[0];
  const target = dateAt(e[0], mo.m || 6, mo.d || 21, mo.h != null ? mo.h : 22, lon);
  S.rate = 1; S.tmBase = target - Date.now(); setOffset(S.tmBase); S.starsAt = 0; S.planetsAt = 0; S.precessedFor = 0;
  renderHead();
  // aim once the sky has been recomputed for the new date
  if (S.sel) select(null);
  toast(yearTxt(e[0]) + (e[3] != null ? ' · ' + e[2] : '') + ': ' + e[1] + '.', 4500);
  setTimeout(() => {
    DTC.at = 0; renderHead();
    let v = mo.aim ? aimDeep(mo.aim) : null;
    if (!v && mo.az != null) v = vecAA(mo.az, mo.alt);
    if (v) { if (S.mode === 'sky') { S.viewAz = azOf(v); S.viewAlt = clamp(altOf(v) - 14, -5, 80); S.zoom = 1; } else toast('Look ' + cardinal(azOf(v)) + ', ' + Math.round(altOf(v)) + '° up.', 5000); }
    if (mo.note === 'halley') toast('Halley’s exact spot in the sky this long ago can’t be worked out reliably, so it isn’t drawn. Comets are drawn from 1759 on.', 6000);
    if (v && altOf(v) < 0) toast('It’s below the horizon at this moment. Drag the year or switch places to see it.', 4500);
  }, 450);
}
function openDeepTime() {
  closeSheets(); DT.on = true; document.body.classList.add('deep'); $('#deepBar').hidden = false; $('#deepBar').classList.remove('folded');
  if (S.world !== 'sky') setWorld('sky');
  DT.year = Math.round(yearOf(simNow().getTime()));
  renderHead(); buildWheel();
  toast('Deep time: scroll through history, then tap Take me there. Tap the year to fold the panel away.', 5000);
}
function closeDeepTime() {
  DT.on = false; document.body.classList.remove('deep'); $('#deepBar').hidden = true; S.precessedFor = 0; DTC.at = 0; goLive();
}
$$('#deepBar [data-dy]').forEach(b => b.onclick = () => setDeepYear(DT.year + +b.dataset.dy));
$('#dtClose').onclick = closeDeepTime;
setInterval(() => { if (DT.on && S.obs) renderHead(); }, 3000);
