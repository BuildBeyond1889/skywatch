/* Sky Watch · extras.js · Rocket launches drawn in your own sky, clip recording, and labelling a photo.
   Loads last (after main.js) and uses the shared globals from the other files. */
'use strict';

// ===================== Rocket launches in your sky =====================
// A launch's climb is predicted from a typical two-stage ascent (height and distance downrange over time)
// flown along the azimuth its target orbit needs from that pad. Good to a few degrees: enough to know where to look.
const LAUNCH = { list: [], at: 0, busy: false };
const ASCENT = [[0, 0, 0], [30, 2, 0.3], [60, 10, 2], [90, 24, 8], [120, 42, 22], [150, 65, 48], [165, 75, 62], [200, 95, 100], [240, 118, 160], [300, 145, 270], [360, 165, 410], [420, 180, 580], [480, 192, 780], [530, 200, 950]];
const ASCENT_END = 530;
function ascentAt(s) {
  if (s <= 0) return [0, 0];
  if (s >= ASCENT_END) return [200, 950 + (s - ASCENT_END) * 7.6];
  for (let i = 1; i < ASCENT.length; i++) if (s <= ASCENT[i][0]) { const a = ASCENT[i - 1], b = ASCENT[i], k = (s - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
  return [200, 950];
}
function destLL(lat, lon, azDeg, km) {
  const d = km / 6371, a = azDeg * D2R, p1 = lat * D2R, l1 = lon * D2R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(a));
  const l2 = l1 + Math.atan2(Math.sin(a) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [p2 * R2D, ((l2 * R2D + 540) % 360) - 180];
}
// Which way it flies: from the orbit it's heading for and where the pad is.
function launchAz(L) {
  const txt = (L.name + ' ' + L.mission).toLowerCase(), lat = L.lat, west = L.lon < -100;
  let inc, south = west;
  if (/iss|dragon|cygnus|soyuz|progress|starliner|crew-|axiom|ax-|dream chaser|htv/.test(txt)) { inc = 51.6; south = false; }
  else if (/sso|po|polar|sun-synch/i.test(L.orbit)) inc = 97.6;
  else if (/starlink/.test(txt)) { inc = west ? 53 : 43; south = west || inc === 43; }
  else if (/gto|geo|gso|tli|lunar|helio|mars|hco|l1|l2|sub/i.test(L.orbit)) return 90 + (Math.abs(lat) < 35 ? 0 : 5);
  else if (/meo/i.test(L.orbit)) inc = 55;
  else inc = Math.abs(lat) + 1;
  const s = Math.cos(inc * D2R) / Math.cos(lat * D2R);
  if (Math.abs(s) >= 1) return 90;
  const a = Math.asin(s) * R2D;
  return wrap360(south ? 180 - a : a);
}
async function loadLaunches() {
  if (LAUNCH.busy || Date.now() - LAUNCH.at < 20 * 60e3) return;
  LAUNCH.busy = true; LAUNCH.at = Date.now();
  try {
    const j = await cachedJSON('ll2n', 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=12&mode=normal', 3600e3);
    const out = [];
    for (const r of (j && j.results) || []) {
      const pad = r.pad || {}, lat = parseFloat(pad.latitude), lon = parseFloat(pad.longitude);
      if (!isFinite(lat) || !isFinite(lon)) continue;
      const old = LAUNCH.list.find(x => x.id === r.id);
      const L = old || { kind: 'launch', id: r.id };
      Object.assign(L, {
        name: (r.name || 'Launch').split('|').pop().trim(), rocket: ((r.rocket && r.rocket.configuration && r.rocket.configuration.name) || (r.name || '').split('|')[0]).trim(),
        provider: (r.launch_service_provider && r.launch_service_provider.name) || '', mission: (r.mission && r.mission.name) || '', desc: (r.mission && r.mission.description) || '',
        orbit: (r.mission && r.mission.orbit && (r.mission.orbit.abbrev || r.mission.orbit.name)) || '', net: new Date(r.net).getTime(),
        status: (r.status && (r.status.abbrev || r.status.name)) || '', padName: pad.name || '', place: (pad.location && pad.location.name) || '', lat, lon
      });
      L.az = launchAz(L); L.pathFor = null;
      out.push(L);
    }
    LAUNCH.list = out; cardFor = null;
  } catch (e) { /* try again later */ }
  LAUNCH.busy = false;
}
// Sample the climb every 5 s as directions from where you are.
function launchPath(L) {
  const key = S.obs.lat.toFixed(2) + ',' + S.obs.lon.toFixed(2);
  if (L.pathFor === key) return L.path;
  const pts = [];
  for (let s = 0; s <= 600; s += 5) { const [h, d] = ascentAt(s), [la, lo] = destLL(L.lat, L.lon, L.az, d), v = geoEnu(la, lo, h); pts.push({ s, v, h, alt: altOf(v) }); }
  const vis = pts.filter(p => p.alt > 0.3);
  L.path = pts; L.pathFor = key; L.dist = gcKm(S.obs.lat, S.obs.lon, L.lat, L.lon);
  L.first = vis[0] || null; L.last = vis[vis.length - 1] || null;
  L.peak = vis.reduce((m, p) => !m || p.alt > m.alt ? p : m, null);
  L.v = (L.peak || pts[0]).v;
  return pts;
}
const tPlus = s => 'T+' + Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
function countdown(ms) {
  const a = Math.abs(ms), d = Math.floor(a / 864e5), h = Math.floor(a % 864e5 / 3600e3), m = Math.floor(a % 3600e3 / 60e3), s = Math.floor(a % 60e3 / 1000);
  const body = d ? d + 'D ' + h + 'H' : h ? h + 'H ' + m + 'M' : m + 'M ' + String(s).padStart(2, '0') + 'S';
  return (ms > 0 ? 'T−' : 'T+') + body;
}
// Can you see it? Depends on the Sun for you and for the rocket high up.
function launchLight(L) {
  try {
    const sun = altOf(bodyDir('Sun', new Date(L.net)));
    if (sun > -4) return { k: 'day', txt: 'Daytime launch: hard to see by eye. Look for a bright moving dot or a contrail along the line.' };
    if (sun > -18) return { k: 'twilight', txt: 'Twilight launch: the rocket climbs into sunlight while your sky is dark, so the exhaust can glow like a huge jellyfish. The best kind to watch.' };
    return { k: 'night', txt: 'Night launch: watch for a bright orange flame moving steadily along the line, then a fainter dot after the first stage drops away.' };
  } catch (e) { return { k: '', txt: '' }; }
}
function drawLaunches(now, placed, t) {
  if (S.world !== 'sky') return;
  if (!LAUNCH.list.length || Date.now() - LAUNCH.at > 20 * 60e3) loadLaunches();
  for (const L of LAUNCH.list) {
    const dt = L.net - t, sel = L === S.sel;
    if (!sel && (dt > 72 * 3600e3 || dt < -900e3)) continue;
    const pts = launchPath(L);
    if (!sel && (!L.first || L.dist > 2500)) continue;
    if (!L.first) continue;
    // the predicted climb, only where it's above your horizon
    g.lineCap = 'round';
    for (const pass of [[7, 0.12], [2.2, sel ? 0.95 : 0.7]]) {
      g.strokeStyle = C('#ffb45a', pass[1]); g.lineWidth = pass[0]; g.setLineDash(pass[0] > 3 ? [] : [10, 7]); g.lineDashOffset = -(t / 60) % 17;
      g.beginPath(); let pen = false;
      for (const p of pts) { const q = project(p.v); if (p.alt > 0.3 && q.ok && Math.abs(q.x) < 4 * W) { pen ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y); pen = true; } else pen = false; }
      g.stroke();
    }
    g.setLineDash([]); g.lineDashOffset = 0;
    // time ticks along it
    g.font = MONO;
    for (const [s, nm] of [[60, ''], [150, 'STAGE SEP'], [300, ''], [480, 'ORBIT']]) {
      const p = pts[s / 5]; if (!p || p.alt < 0.3) continue; const q = project(p.v); if (!onScreen(q, 0)) continue;
      g.fillStyle = C('#ffd9a8'); g.beginPath(); g.arc(q.x, q.y, 3, 0, 6.283); g.fill();
      g.fillStyle = C('#ffd9a8', 0.85); g.fillText(tPlus(s) + (nm ? ' ' + nm : ''), q.x + 7, q.y + 3);
    }
    // where it first appears for you
    const f = project(L.first.v);
    if (onScreen(f, 0)) {
      label(placed, f.x, f.y, 10, L.rocket + ' · ' + countdown(dt), (dt > 0 ? 'APPEARS HERE AT ' + tPlus(L.first.s) : 'LAUNCHED') + ' · ' + kmTxt(L.dist) + ' AWAY', C('#ffffff'), C('#ffb45a'), 9, true);
      hits.push({ x: f.x, y: f.y, r: 34, o: L, pr: 6 });
    }
    // live: the rocket itself
    const el = -dt / 1000;
    if (el > 0 && el < 600) {
      const [h, d] = ascentAt(el), [la, lo] = destLL(L.lat, L.lon, L.az, d), v = geoEnu(la, lo, h), q = project(v);
      if (altOf(v) > 0 && onScreen(q, 20)) {
        const gr = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, 26); gr.addColorStop(0, C('#ffffff', 0.95)); gr.addColorStop(0.25, C('#ffd27a', 0.8)); gr.addColorStop(1, C('#ff8a3a', 0));
        g.fillStyle = gr; g.beginPath(); g.arc(q.x, q.y, 26, 0, 6.283); g.fill();
        label(placed, q.x, q.y, 14, 'LIVE · ' + L.rocket, tPlus(el) + ' · ' + Math.round(h) + ' KM UP', C('#ffffff'), C('#ffb45a'), 10, true);
        hits.push({ x: q.x, y: q.y, r: 34, o: L, pr: 8 });
      }
    }
    if (sel && L.peak) { const q = project(L.peak.v); if (onScreen(q, 0)) drawReticle(q, t, '#ffb45a'); }
  }
}
function launchCard(L, now) {
  launchPath(L);
  const dt = L.net - now.getTime(), lt = launchLight(L), close = '<button type="button" id="cardClose" aria-label="Close details">×</button>';
  const seen = L.first ? `From you it rises in the <b>${cardinal(azOf(L.first.v))}</b> about ${tPlus(L.first.s)}, climbs to <b>${Math.round(L.peak.alt)}°</b> up in the ${cardinal(azOf(L.peak.v))} by ${tPlus(L.peak.s)}${L.last && L.last.s < 600 ? ' and sinks out of view by ' + tPlus(L.last.s) : ''}.` : `It stays below your horizon the whole climb from here (${kmTxt(L.dist)} away).`;
  return close + `<div class="card-head"><div style="flex:1;min-width:0"><div class="card-title">${esc(L.rocket)} · ${esc(L.name)}</div><div class="card-sub mono">${esc(L.provider.toUpperCase())}${L.orbit ? ' · ' + esc(L.orbit.toUpperCase()) : ''} · ${esc(L.status.toUpperCase())}</div></div></div>
    <div class="stats">${stat('LAUNCH', countdown(dt))}${stat('AT', tfmt(new Date(L.net)))}${stat('PAD IS', fmt(Math.round(dv(L.dist))), du())}${stat('HEADING', Math.round(L.az), '°')}</div>
    <div class="card-foot"><span>${seen} ${esc(lt.txt)}</span></div>
    <div class="card-foot"><span>${esc(L.padName)}${L.place ? ', ' + esc(L.place) : ''}. ${dfmt(new Date(L.net))}. The line is a prediction from a typical climb, accurate to a few degrees; launch times often slip.</span></div>
    <div class="card-actions"><button type="button" class="btn small primary" id="lPreview">Preview the climb</button></div>`;
}
function launchCompact(L, now) {
  return `<button type="button" class="mini"><b>${esc(L.rocket)}</b><span class="mono">${countdown(L.net - now.getTime())}${L.first ? ' · RISES IN THE ' + cardinal(azOf(L.first.v)) : ' · BELOW YOUR HORIZON'}</span></button>`;
}
function launchWire(card, L) {
  const b = $('#lPreview', card); if (!b) return;
  b.onclick = e => {
    e.stopPropagation(); if (!L.first) { toast('This one stays below your horizon from here.'); return; }
    S.rate = 1; timeJump(L.net + (L.first.s - 20) * 1000, 'Jumping to just before it rises for you. Drag the time slider to watch it climb.');
    select(L); aimAt(L.peak.v);
  };
}
function aimAt(v) {
  if (S.mode === 'sky') { S.viewAz = azOf(v); S.viewAlt = clamp(altOf(v), 3, 80); S.zoom = 1; }
  else toast('Look ' + cardinal(azOf(v)) + ', ' + Math.round(altOf(v)) + '° up.', 5000);
}
async function goLaunch(id) {
  if (!LAUNCH.list.length) { LAUNCH.at = 0; await loadLaunches(); }
  const L = LAUNCH.list.find(x => x.id === id); if (!L) { toast('Couldn’t find that launch’s pad yet. Try again in a moment.'); return; }
  if (S.world !== 'sky') setWorld('sky');
  launchPath(L); select(L);
  if (L.first) aimAt(L.peak.v); else toast(L.rocket + ' stays below your horizon from here.');
}

// ===================== Shared: draw what's on screen into a picture =====================
function photoRect() {
  const P = S.photo; if (!P) return null;
  const sc = Math.min(W / P.w, H / P.h), w = P.w * sc, h = P.h * sc;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}
function composeFrame(x, cw, ch, caption, crop) {
  // crop: the part of the screen to keep (CSS px); defaults to all of it
  const r = crop || { x: 0, y: 0, w: W, h: H }, k = cw / r.w;
  x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = '#000'; x.fillRect(0, 0, cw, ch);
  if (S.photo) { const pr = photoRect(); x.drawImage($('#photoBg'), (pr.x - r.x) * k, (pr.y - r.y) * k, pr.w * k, pr.h * k); }
  else if (S.mode === 'ar' && cam.videoWidth && !S.noFeed) {
    const vw = cam.videoWidth, vh = cam.videoHeight, sc = Math.max(W / vw, H / vh) * S.zoom, dw = vw * sc, dh = vh * sc;
    if (S.red) x.filter = 'grayscale(1) brightness(0.55)';
    x.drawImage(cam, ((W - dw) / 2 - r.x) * k, ((H - dh) / 2 - r.y) * k, dw * k, dh * k); x.filter = 'none';
  }
  x.drawImage(sky, r.x * DPR, r.y * DPR, r.w * DPR, r.h * DPR, 0, 0, cw, ch);
  if (caption) {
    const s = cw / 390;
    const gr = x.createLinearGradient(0, ch - 70 * s, 0, ch); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.72)');
    x.fillStyle = gr; x.fillRect(0, ch - 70 * s, cw, 70 * s);
    x.fillStyle = '#ffffff'; x.font = `700 ${13 * s}px "Space Grotesk", Inter, sans-serif`; x.fillText(caption[0], 14 * s, ch - 32 * s);
    x.font = `500 ${9 * s}px "JetBrains Mono", monospace`; x.fillStyle = '#c9d6f5'; x.fillText(caption[1], 14 * s, ch - 16 * s);
  }
}
const nowCaption = tag => { const d = simNow(); return ['SKY WATCH' + (tag ? ' · ' + tag : ''), d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }).toUpperCase() + ' · ' + S.obs.lat.toFixed(2) + '°, ' + S.obs.lon.toFixed(2) + '°']; };
async function saveToGallery(blob, thumbCanvas, extra) {
  const tc = document.createElement('canvas'), tw = 240, th = Math.round(240 * thumbCanvas.height / thumbCanvas.width); tc.width = tw; tc.height = th;
  tc.getContext('2d').drawImage(thumbCanvas, 0, 0, tw, th);
  const thumb = tc.toDataURL('image/jpeg', 0.7);
  await idb.addShot(Object.assign({ id: Date.now(), t: simNow().getTime(), blob, thumb }, extra || {}));
  setGalleryThumb(thumb);
}

// ===================== Record a clip =====================
const REC = { on: false };
function pickMime() {
  if (!window.MediaRecorder) return null;
  for (const m of ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { /* next */ } }
  return null;
}
function startRecording() {
  if (REC.on) return;
  const mime = pickMime(), c0 = document.createElement('canvas');
  if (!mime || !c0.captureStream) { toast('This browser can’t record video. Snapshots still work.'); return; }
  closeSheets();
  const crop = S.photo ? photoRect() : null, r = crop || { w: W, h: H }, sc = Math.min(DPR, 1280 / Math.max(r.w, r.h));
  const c = c0; c.width = Math.round(r.w * sc / 2) * 2; c.height = Math.round(r.h * sc / 2) * 2;
  const x = c.getContext('2d'), stream = c.captureStream(30), chunks = [];
  let rec; try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6e6 }); } catch (e) { toast('Recording couldn’t start: ' + e.message); return; }
  REC.on = true; REC.t0 = performance.now(); REC.rec = rec;
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = async () => {
    REC.on = false; $('#recBar').hidden = true; document.body.classList.remove('recording');
    const blob = new Blob(chunks, { type: mime.split(';')[0] });
    if (!blob.size) { toast('Nothing was recorded.'); return; }
    await saveToGallery(blob, c, { video: true, mime: mime.split(';')[0] });
    toast('Clip saved. It’s in Your sky → Snapshots.');
  };
  const frame = () => { if (!REC.on) return; composeFrame(x, c.width, c.height, nowCaption('● LIVE'), crop); requestAnimationFrame(frame); };
  frame(); rec.start(500);
  $('#recBar').hidden = false; document.body.classList.add('recording');
  const tick = () => { if (!REC.on) return; const s = (performance.now() - REC.t0) / 1000; $('#recTime').textContent = Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') + ' / 0:30'; if (s >= 30) stopRecording(); else setTimeout(tick, 250); };
  tick();
  try { navigator.vibrate && navigator.vibrate(20); } catch (e) { /* ignore */ }
}
function stopRecording() { if (REC.on && REC.rec && REC.rec.state !== 'inactive') REC.rec.stop(); }

// ===================== Label a photo =====================
// Reads when and where it was taken (and the lens) from the photo itself, sets the sky to that moment,
// then you drag, pinch and twist until the labels sit on what's in the picture.
function readExif(buf) {
  const v = new DataView(buf), out = {};
  if (v.getUint16(0) !== 0xFFD8) return out;
  let o = 2;
  while (o < v.byteLength - 4) {
    const mk = v.getUint16(o), len = v.getUint16(o + 2);
    if (mk === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) { parseTiff(v, o + 10, out); break; }
    if ((mk & 0xFF00) !== 0xFF00) break;
    o += 2 + len;
  }
  return out;
}
function parseTiff(v, t0, out) {
  const le = v.getUint16(t0) === 0x4949, u16 = p => v.getUint16(p, le), u32 = p => v.getUint32(p, le);
  const str = (p, n) => { let s = ''; for (let i = 0; i < n; i++) { const c = v.getUint8(p + i); if (!c) break; s += String.fromCharCode(c); } return s; };
  const rat = p => u32(p) / (u32(p + 4) || 1);
  const ifd = (p, fn) => { const n = u16(p); for (let i = 0; i < n; i++) { const e = p + 2 + i * 12, tag = u16(e), type = u16(e + 2), cnt = u32(e + 4), size = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8][type] * cnt, vp = size > 4 ? t0 + u32(e + 8) : e + 8; fn(tag, type, cnt, vp); } };
  let exifP = 0, gpsP = 0;
  ifd(t0 + u32(t0 + 4), (tag, type, cnt, vp) => { if (tag === 0x8769) exifP = u32(vp); if (tag === 0x8825) gpsP = u32(vp); if (tag === 0x0132 && !out.date) out.date = str(vp, cnt); });
  if (exifP) ifd(t0 + exifP, (tag, type, cnt, vp) => { if (tag === 0x9003) out.date = str(vp, cnt); if (tag === 0x9011) out.off = str(vp, cnt); if (tag === 0xA405) out.f35 = type === 3 ? u16(vp) : u32(vp); });
  if (gpsP) {
    const g0 = {};
    ifd(t0 + gpsP, (tag, type, cnt, vp) => { if (tag === 1 || tag === 3 || tag === 0x10) g0[tag] = str(vp, 2); if (tag === 2 || tag === 4) g0[tag] = rat(vp) + rat(vp + 8) / 60 + rat(vp + 16) / 3600; if (tag === 0x11) g0[tag] = rat(vp); });
    if (g0[2] != null && g0[4] != null) { out.lat = g0[2] * (g0[1] === 'S' ? -1 : 1); out.lon = g0[4] * (g0[3] === 'W' ? -1 : 1); }
    if (g0[0x11] != null) out.dir = g0[0x11];
  }
}
function exifTime(e) {
  const m = e.date && e.date.match(/(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/); if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` + (e.off && /^[+-]\d\d:\d\d$/.test(e.off) ? e.off : '');
  const t = new Date(iso).getTime(); return isFinite(t) ? t : null;
}
async function startPhoto(file) {
  if (!file) return;
  closeSheets();
  let ex = {}; try { ex = readExif(await file.arrayBuffer()); } catch (e) { /* no EXIF: still usable */ }
  const img = $('#photoBg'); if (S.photo && S.photo.url) URL.revokeObjectURL(S.photo.url);
  const url = URL.createObjectURL(file); img.src = url;
  try { await img.decode(); } catch (e) { toast('Couldn’t open that picture.'); return; }
  if (S.mode === 'ar') startSkyMode();
  if (S.world !== 'sky') setWorld('sky');
  const w = img.naturalWidth, h = img.naturalHeight, ar = Math.max(w, h) / Math.min(w, h), longMm = 43.27 * ar / Math.sqrt(ar * ar + 1);
  S.photo = { url, w, h, saved: { fov: S.fov, zoom: S.zoom, alt: S.viewAlt, az: S.viewAz } };
  S.fov = ex.f35 ? 2 * Math.atan(longMm / 2 / ex.f35) * R2D : 70; S.zoom = 1; S.roll = 0; $('#photoRoll').value = 0;
  if (ex.lat != null && Math.abs(ex.lat) <= 90) setLocation(ex.lat, ex.lon, 'photo');
  const t = exifTime(ex);
  if (t) { S.rate = 1; timeJump(t, 'Sky set to when the photo was taken: ' + new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) + '.'); }
  if (ex.dir != null) S.viewAz = ex.dir;
  S.viewAlt = clamp(S.viewAlt, 10, 60);
  img.hidden = false; document.body.classList.add('photo'); document.body.classList.toggle('ptime', !!t); $('#photoBar').hidden = false;
  setTimeout(() => toast((t ? '' : 'No time in this photo, so it’s set to now. Use the time slider. ') + 'Drag and pinch until the labels sit on what’s in your photo. Twist with the slider.', 6500), t ? 3200 : 0);
}
function endPhoto() {
  const P = S.photo; if (!P) return;
  S.fov = P.saved.fov; S.zoom = P.saved.zoom; S.roll = 0; S.photo = null;
  $('#photoBg').hidden = true; URL.revokeObjectURL(P.url); document.body.classList.remove('photo', 'ptime'); $('#photoBar').hidden = true;
  goLive();
}
async function savePhoto() {
  const r = photoRect(); if (!r) return;
  const sc = Math.min(Math.max(DPR, S.photo.w / r.w), 3), c = document.createElement('canvas'); c.width = Math.round(r.w * sc); c.height = Math.round(r.h * sc);
  composeFrame(c.getContext('2d'), c.width, c.height, nowCaption('LABELLED PHOTO'), r);
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.92));
  if (!blob) { toast('Couldn’t save it.'); return; }
  await saveToGallery(blob, c);
  const fl = $('#flash'); fl.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => fl.classList.remove('on')));
  toast('Labelled photo saved. It’s in Your sky → Snapshots.');
}

// ===================== Jump anywhere =====================
function jumpTo(lat, lon, name, about) {
  if (!S.travel && S.obs) S.home = S.home || [S.obs.lat, S.obs.lon, S.locSource];
  S.travel = { name, lat, lon };
  setLocation(lat, lon, 'jump'); closeSheets();
  if (S.mode === 'sky') { S.viewAlt = 45; S.zoom = 1; }
  $('#travelPill').hidden = false; updateTravel();
  toast('You’re at ' + name + (about ? ': ' + about : '') + '. The sky, satellites and radio are live for this spot.' + (S.mode === 'ar' ? ' Your phone is now a window onto its sky.' : ''), 4500);
}
function updateTravel() {
  if (!S.travel) return;
  const off = Math.round(S.travel.lon / 15), d = new Date(Date.now() + S.offset + off * 3600e3);
  const hh = d.getUTCHours(), mm = String(d.getUTCMinutes()).padStart(2, '0'), sun = SUN.v ? altOf(SUN.v) : 0;
  $('#travelTxt').textContent = '📍 ' + S.travel.name.toUpperCase() + ' · ~' + ((hh + 11) % 12 + 1) + ':' + mm + (hh < 12 ? ' AM' : ' PM') + ' · ' + (sun > 0 ? 'DAY' : sun > -12 ? 'TWILIGHT' : 'NIGHT');
}
setInterval(updateTravel, 10000);
function goHome() {
  const h = S.home; S.travel = null; $('#travelPill').hidden = true;
  if (h) setLocation(h[0], h[1], h[2] === 'jump' ? 'manual' : h[2]); else requestGPS();
  toast('Back at your location.');
}
function issUnder() {
  const s = Sats.byId.get(25544); if (!s || !window.satellite) return null;
  try { const rec = s.rec || (s.rec = satellite.twoline2satrec(s.l1, s.l2)), now = simNow(), pv = satellite.propagate(rec, now); if (!pv.position) return null; const gd = satellite.eciToGeodetic(pv.position, satellite.gstime(now)); return [satellite.degreesLat(gd.latitude), satellite.degreesLong(gd.longitude)]; } catch (e) { return null; }
}
// The places list: category chips, a filter that narrows as you type, one scrolling list.
const JUMP = { cat: ls.get('jumpCat', 'all'), q: '' };
const JUMP_SPECIAL = [['Under the ISS', 'Right now, as it flies over', 'iss'], ['Random spot', 'Anywhere on Earth', 'rand']];
function jumpRows() {
  const q = JUMP.q.toLowerCase(), rows = [];
  if (!q && (JUMP.cat === 'all' || JUMP.cat === 'special')) JUMP_SPECIAL.forEach(p => rows.push({ p, cat: '' }));
  for (const [id, nm, list] of PLACE_CATS) {
    if (!q && JUMP.cat !== 'all' && JUMP.cat !== id) continue;
    for (const p of list) if (!q || (p[0] + ' ' + p[1]).toLowerCase().includes(q)) rows.push({ p, cat: nm });
  }
  return rows;
}
function buildJumpGrid() {
  const cats = [['all', 'All']].concat(PLACE_CATS.map(c => [c[0], c[1]]));
  $('#jumpCats').innerHTML = cats.map(([id, nm]) => `<button type="button" class="chip" data-c="${id}" aria-pressed="${JUMP.cat === id}">${esc(nm)}</button>`).join('');
  $$('#jumpCats button').forEach(b => b.onclick = () => { JUMP.cat = b.dataset.c; ls.set('jumpCat', JUMP.cat); buildJumpGrid(); const sb = $('#sheetJump .sheet-body'); if (sb) sb.scrollTop = 0; });
  const rows = jumpRows();
  $('#jumpList').innerHTML = (S.travel ? '<button type="button" class="srch-row" data-j="home"><span><b>↩ Back home</b></span><span>YOUR OWN LOCATION</span></button>' : '') +
    rows.map((r, i) => `<button type="button" class="srch-row" data-j="${i}"><span><b>${esc(r.p[0])}</b><small class="muted" style="display:block;font-size:11.5px">${esc(r.p[1])}</small></span><span>${r.cat && JUMP.cat === 'all' ? esc(r.cat.toUpperCase()) : typeof r.p[2] === 'number' ? Math.abs(r.p[2]).toFixed(1) + '°' + (r.p[2] < 0 ? 'S' : 'N') + ' ' + Math.abs(r.p[3]).toFixed(1) + '°' + (r.p[3] < 0 ? 'W' : 'E') : ''}</span></button>`).join('') +
    (!rows.length ? '<p class="muted" style="margin:8px 0">Not in the list. Press Go to search the whole world.</p>' : '');
  $('#jumpCount').textContent = rows.length + ' PLACES';
  $$('#jumpList [data-j]').forEach(b => b.onclick = () => {
    const k = b.dataset.j; if (k === 'home') { closeSheets(); goHome(); return; }
    const p = rows[+k].p;
    if (p[2] === 'iss') { const ll = issUnder(); if (!ll) { toast('The ISS isn’t loaded yet.'); return; } jumpTo(ll[0], ll[1], 'Under the ISS'); S.viewAlt = 85; return; }
    if (p[2] === 'rand') { const la = Math.asin(Math.random() * 2 - 1) * R2D, lo = Math.random() * 360 - 180; jumpTo(la, lo, la.toFixed(1) + '°, ' + lo.toFixed(1) + '°'); return; }
    jumpTo(p[2], p[3], p[0], p[1]);
  });
}
$('#jumpOpen').onclick = () => { closeSheets(); buildJumpGrid(); setTimeout(() => openSheet('sheetJump'), 60); };
buildJumpGrid();
$('#jumpQ').addEventListener('input', () => { JUMP.q = $('#jumpQ').value.trim(); $('#jumpRes').innerHTML = ''; buildJumpGrid(); });
$('#jumpForm').onsubmit = async e => {
  e.preventDefault(); const q = $('#jumpQ').value.trim(); if (!q) return;
  const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) { jumpTo(+m[1], +m[2], (+m[1]).toFixed(2) + '°, ' + (+m[2]).toFixed(2) + '°'); return; }
  $('#jumpRes').innerHTML = '<p class="muted" style="margin:6px 0">Searching…</p>';
  try {
    const j = await (await fetch('https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&name=' + encodeURIComponent(q))).json();
    const R = (j && j.results) || [];
    $('#jumpRes').innerHTML = R.length ? R.map((r, i) => `<button type="button" class="srch-row" data-r="${i}"><span>${esc(r.name)}</span><span>${esc([r.admin1, r.country].filter(Boolean).join(', ').toUpperCase())}</span></button>`).join('') : '<p class="muted" style="margin:6px 0">Nothing found. Try another spelling, or type latitude, longitude.</p>';
    $$('#jumpRes [data-r]').forEach(b => b.onclick = () => { const r = R[+b.dataset.r]; $('#jumpRes').innerHTML = ''; $('#jumpQ').value = ''; jumpTo(r.latitude, r.longitude, r.name); });
  } catch (er) { $('#jumpRes').innerHTML = '<p class="muted" style="margin:6px 0">Search needs the internet.</p>'; }
};
$('#travelHome').onclick = goHome;
$('#travelRadio').onclick = () => { WSTATE.chip.infra = 'cube'; ls.set('wchips', WSTATE.chip); setWorld('infra'); };

// ===================== Wiring =====================
$('#recBtn').onclick = () => setTimeout(startRecording, 300);
$('#recStop').onclick = stopRecording;
$('#photoBtn').onclick = () => $('#photoFile').click();
$('#photoFile').onchange = e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; startPhoto(f); };
$('#photoRoll').oninput = e => { S.roll = +e.target.value; };
$('#photoSave').onclick = savePhoto;
$('#photoDone').onclick = endPhoto;
