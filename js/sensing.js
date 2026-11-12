/* Sky Watch · sensing.js · Star/Sun/Moon lock, meteor auto-catch, reminders, touch gestures, alignment, camera, location.
   All app files share one global scope and must load in order: core, data, view, render, cards, sensing, ui, main. */
'use strict';
  // ---------- star lock: find bright stars in the camera image and correct the compass ----------
  const ST = { cv: null, cx: null, at: 0, last: 0, n: 0, rms: 0 };
  function grabFrame(o, aw) {
    const vw = cam.videoWidth, vh = cam.videoHeight; if (!vw) return null;
    const ah = Math.max(1, Math.round(aw * vh / vw));
    if (!o.cv) { o.cv = document.createElement('canvas'); o.cx = o.cv.getContext('2d', { willReadFrequently: true }); }
    if (o.cv.width !== aw || o.cv.height !== ah) { o.cv.width = aw; o.cv.height = ah; }
    o.cx.drawImage(cam, 0, 0, aw, ah);
    const d = o.cx.getImageData(0, 0, aw, ah).data, L = new Float32Array(aw * ah);
    for (let i = 0, j = 0; i < L.length; i++, j += 4) L[i] = 0.3 * d[j] + 0.59 * d[j + 1] + 0.11 * d[j + 2];
    return { L, aw, ah };
  }
  function vidToScreen(u, v, aw) {
    const vw = cam.videoWidth, vh = cam.videoHeight, sc = Math.max(W / vw, H / vh) * S.zoom, k = vw / aw;
    return [(W - vw * sc) / 2 + u * k * sc, (H - vh * sc) / 2 + v * k * sc];
  }
  const unproject = (x, y) => mv(VM, [(x - W / 2) / FOC, -(y - H / 2) / FOC, -1]);
  function starTrack(nowP) {
    if (S.mode !== 'ar' || !S.f.autoStar || !cam.videoWidth || !S.q || nowP - ST.at < (saverOn() ? 4000 : 1500)) return;
    ST.at = nowP;
    if (S.angVel > 4 || S.dragging || Math.hypot(S.dragYaw, S.dragPitch) > 0.5 || S.align) return;
    const fwd = unproject(W / 2, H / 2); if (altOf(fwd) > 70 || altOf(fwd) < 3) return;
    const fr = grabFrame(ST, 320); if (!fr) return;
    const { L, aw, ah } = fr; let sum = 0, sum2 = 0;
    for (let i = 0; i < L.length; i++) { sum += L[i]; sum2 += L[i] * L[i]; }
    const mean = sum / L.length, sd = Math.sqrt(Math.max(0, sum2 / L.length - mean * mean));
    if (bodyLock(L, aw, ah, mean)) return;
    if (mean > 110) return; // too bright for stars
    const thr = Math.max(mean + 4 * sd, mean + 28, 45), pts = [];
    for (let y = 4; y < ah - 4; y++) for (let x = 4; x < aw - 4; x++) {
      const i = y * aw + x, l = L[i]; if (l < thr) continue;
      let peak = true;
      for (let dy = -3; dy <= 3 && peak; dy++) for (let dx = -3; dx <= 3; dx++) if ((dx || dy) && L[i + dy * aw + dx] > l) { peak = false; break; }
      if (!peak) continue;
      const ring = (L[i - 4] + L[i + 4] + L[i - 4 * aw] + L[i + 4 * aw] + L[i - 3 * aw - 3] + L[i - 3 * aw + 3] + L[i + 3 * aw - 3] + L[i + 3 * aw + 3]) / 8;
      if (ring > mean + 0.55 * (l - mean)) continue; // extended light, not a point
      const sp = vidToScreen(x + 0.5, y + 0.5, aw); pts.push({ x: sp[0], y: sp[1], l });
    }
    pts.sort((a, b) => b.l - a.l); pts.length = Math.min(pts.length, 30);
    ST.pts = pts; ST.ptsAt = performance.now(); ST.seen = pts.length;
    const preds = [];
    const addP = o => { if (!o.v || altOf(o.v) < 4) return; const p = project(o.v); if (onScreen(p, -12)) preds.push(p); };
    STARS.forEach(s => { if (s.mag < 3.2) { const n0 = preds.length; addP(s); if (preds.length > n0) preds[preds.length - 1].mag = s.mag; } }); PLANETS.forEach(p => { if (p.mag < 2) addP(p); }); addP(MOON);
    if (preds.length < 3 || pts.length < 3) return;
    const R = FOC * Math.tan(8 * D2R), B = 7, bins = new Map();
    preds.forEach((p, pi) => pts.forEach(q => { const dx = q.x - p.x, dy = q.y - p.y; if (dx * dx + dy * dy > R * R) return; const k = Math.round(dx / B) + ',' + Math.round(dy / B); let b = bins.get(k); if (!b) bins.set(k, b = []); b.push({ pi, dx, dy }); }));
    let best = null, bestN = 0;
    for (const [k, b] of bins) {
      const [bx, by] = k.split(',').map(Number), all = [];
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const nb = bins.get((bx + i) + ',' + (by + j)); if (nb) all.push(...nb); }
      const n = new Set(all.map(e => e.pi)).size;
      if (n > bestN) { bestN = n; best = all; }
    }
    if (!best || bestN < 2) return;
    if (bestN === 2) { // two stars only: accept when both are bright and agree closely
      const bright = new Set(best.map(e => e.pi)), ok2 = [...bright].every(pi => (preds[pi].mag || 0) < 1.6);
      const sp = Math.max(...best.map(e => e.dx)) - Math.min(...best.map(e => e.dx)) + Math.max(...best.map(e => e.dy)) - Math.min(...best.map(e => e.dy));
      if (!ok2 || sp / FOC * R2D > 0.6) return;
    }
    const mx = best.reduce((a, e) => a + e.dx, 0) / best.length, my = best.reduce((a, e) => a + e.dy, 0) / best.length;
    const rms = Math.sqrt(best.reduce((a, e) => a + (e.dx - mx) ** 2 + (e.dy - my) ** 2, 0) / best.length) / FOC * R2D;
    const delta = wrap180(azOf(unproject(W / 2 - mx, H / 2 - my)) - azOf(fwd));
    if (Math.abs(delta) > 15) return;
    S.hcorr = wrap180(S.hcorr + delta * 0.6); ls.set('hcorr', S.hcorr);
    ST.last = Date.now(); ST.n = bestN; ST.rms = rms; ST.src = 'Star';
  }
  // Daytime / Moon lock: find the Sun or Moon as a bright blob near where it should be.
  function bodyLock(L, aw, ah, mean) {
    let body = null;
    if (SUN.v && altOf(SUN.v) > 3) { const p = project(SUN.v); if (onScreen(p, -20)) body = { o: SUN, p, thr: 248 }; }
    if (!body && MOON.v && altOf(MOON.v) > 3) { const p = project(MOON.v); if (onScreen(p, -20)) body = { o: MOON, p, thr: Math.max(190, mean + 0.6 * (255 - mean)) }; }
    if (!body) return false;
    const vw = cam.videoWidth, vh = cam.videoHeight, sc = Math.max(W / vw, H / vh) * S.zoom, k = vw / aw;
    const u0 = ((body.p.x - (W - vw * sc) / 2) / sc) / k, v0 = ((body.p.y - (H - vh * sc) / 2) / sc) / k;
    const R = (FOC * Math.tan(12 * D2R)) / sc / k;
    let n = 0, su = 0, sv = 0, minU = 1e9, maxU = -1, minV = 1e9, maxV = -1;
    for (let v = Math.max(0, v0 - R | 0); v < Math.min(ah, v0 + R); v++) for (let u = Math.max(0, u0 - R | 0); u < Math.min(aw, u0 + R); u++) {
      if (L[v * aw + u] < body.thr) continue;
      n++; su += u; sv += v; if (u < minU) minU = u; if (u > maxU) maxU = u; if (v < minV) minV = v; if (v > maxV) maxV = v;
    }
    if (n < 3 || n > 2500) return false;
    const span = Math.max(maxU - minU, maxV - minV);
    if (span > 4 * Math.sqrt(n) + 6) return false; // scattered glare, not one disc
    const sp = vidToScreen(su / n + 0.5, sv / n + 0.5, aw), dx = sp[0] - body.p.x, dy = sp[1] - body.p.y;
    const fwd = unproject(W / 2, H / 2), delta = wrap180(azOf(unproject(W / 2 - dx, H / 2 - dy)) - azOf(fwd));
    if (Math.abs(delta) > 15) return false;
    S.hcorr = wrap180(S.hcorr + delta * 0.5); ls.set('hcorr', S.hcorr);
    ST.last = Date.now(); ST.n = 1; ST.rms = Math.hypot(dx, dy) / FOC * R2D * 0.3; ST.src = body.o === SUN ? 'Sun' : 'Moon';
    return true;
  }

  // ---------- meteor auto-catch: look for a fast streak between camera frames ----------
  const MC = { cv: null, cx: null, at: 0, prev: null, cool: 0 };
  function meteorWatch(nowP) {
    if (!S.autoCatch || S.mode !== 'ar' || S.view !== 'meteor' || !cam.videoWidth) { MC.prev = null; return; }
    if (nowP - MC.at < 110) return; MC.at = nowP;
    if (S.angVel > 1.2) { MC.prev = null; return; }
    const fr = grabFrame(MC, 200); if (!fr) return;
    const { L, aw } = fr, P = MC.prev; MC.prev = L;
    if (!P || P.length !== L.length || nowP < MC.cool) return;
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    const SENS = { low: [50, 5, 16], med: [38, 4, 12], high: [28, 3.2, 9] }[S.f.catchSens] || [38, 4, 12];
    for (let i = 0; i < L.length; i++) if (L[i] - P[i] > SENS[0]) { const x = i % aw, y = (i / aw) | 0; n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; if (n > 600) return; }
    if (n < 6) return;
    const mx = sx / n, my = sy / n, cxx = sxx / n - mx * mx, cyy = syy / n - my * my, cxy = sxy / n - mx * my;
    const tr = cxx + cyy, det = cxx * cyy - cxy * cxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const l1 = tr / 2 + disc, l2 = Math.max(0.05, tr / 2 - disc);
    if (Math.sqrt(l1 / l2) > SENS[1] && 4 * Math.sqrt(l1) > SENS[2]) {
      MC.cool = nowP + 4000; S.caught++; cardFor = null;
      LOG.list.push({ t: Date.now(), k: 'meteor', id: 'meteor-' + Date.now(), name: 'Possible meteor' + (S.featObj ? ' (' + S.featObj.name + ')' : '') }); ls.set('log', LOG.list);
      snapshot('POSSIBLE METEOR').then(() => toast('Caught a possible meteor. It is in your snapshots.'));
    }
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
      S.zoom = clamp(gest.z0 * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(gest.d0, 1), S.photo ? 0.4 : 1, 10);
      return;
    }
    if (gest.type === 'tap' && Math.hypot(e.clientX - gest.x0, e.clientY - gest.y0) > 8) { gest.type = 'drag'; S.dragging = true; }
    if (gest.type === 'drag') {
      const dx = e.clientX - gest.lx, dy = e.clientY - gest.ly; gest.lx = e.clientX; gest.ly = e.clientY;
      const k = R2D / FOC;
      if (S.mode === 'ar') { S.dragYaw = clamp(S.dragYaw - dx * k, -180, 180); S.dragPitch = clamp(S.dragPitch + dy * k, -90, 90); }
      else { S.viewAz = wrap360(S.viewAz - dx * k); S.viewAlt = clamp(S.viewAlt + dy * k, S.world !== 'sky' && WORLDS[S.world].below ? -89.5 : -30, 89.5); }
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
  sky.addEventListener('wheel', e => { e.preventDefault(); S.zoom = clamp(S.zoom * Math.exp(-e.deltaY * 0.0015), S.photo ? 0.4 : 1, 10); }, { passive: false });
  function tapAt(x, y) {
    let best = null, bd = 1e9;
    for (const h of hits) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d > h.r) continue;
      const sc = d - h.pr * 4;
      if (sc < bd) { bd = sc; best = h; }
    }
    if (best && best.o.tap) { best.o.tap(); return; }
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
    const M = mmul(rz(-(S.hcorr + (S.absolute ? S.decl : 0))), q2m(S.q));
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
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: saverOn() ? 960 : 1280 }, height: { ideal: saverOn() ? 540 : 720 } }, audio: false });
    cam.srcObject = stream; cam.hidden = false;
    try { await cam.play(); } catch (e) { /* autoplay will start it */ }
  }
  function stopCamera() { if (stream) { stream.getTracks().forEach(tr => tr.stop()); stream = null; } }
  let wake = null;
  // Keep the screen on only in camera view; sky view lets the phone sleep normally.
  async function keepAwake() { try { if (S.mode === 'ar' && 'wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { /* not allowed */ } }
  function releaseAwake() { try { if (wake) wake.release(); } catch (e) { /* ignore */ } wake = null; }
  // Stop the camera when the app is in the background and bring it back on return.
  let camPaused = false;
  document.addEventListener('visibilitychange', async () => {
    if (!S.started) return;
    if (document.visibilityState === 'hidden') { if (S.mode === 'ar' && stream) { stopCamera(); camPaused = true; } }
    else {
      keepAwake();
      if (camPaused && S.mode === 'ar') { camPaused = false; try { await startCamera(); } catch (e) { toast('Camera did not come back. Tap Camera to restart it.'); } }
    }
  });
  // Turn Battery saver on by itself below 20% when not charging.
  if (navigator.getBattery) navigator.getBattery().then(b => {
    const check = () => {
      const low = b.level <= 0.2 && !b.charging;
      if (low && !S.autoSaver && !S.f.saver) { S.autoSaver = true; toast('Battery under 20%, so Battery saver is on.', 4000); }
      if (!low && S.autoSaver) S.autoSaver = false;
      S.battery = { level: b.level, charging: b.charging };
    };
    check(); b.addEventListener('levelchange', check); b.addEventListener('chargingchange', check);
  }).catch(() => {});

  // ---------- location ----------
  function approxLocation() {
    const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '');
    const map = { 'America/New_York': [40.71, -74.0], 'America/Chicago': [41.88, -87.63], 'America/Denver': [39.74, -104.99], 'America/Phoenix': [33.45, -112.07], 'America/Los_Angeles': [34.05, -118.24], 'America/Anchorage': [61.22, -149.9], 'Pacific/Honolulu': [21.31, -157.86], 'America/Toronto': [43.65, -79.38], 'America/Vancouver': [49.28, -123.12], 'Europe/London': [51.5, -0.12], 'Europe/Paris': [48.86, 2.35], 'Europe/Berlin': [52.52, 13.4], 'Asia/Tokyo': [35.68, 139.69], 'Australia/Sydney': [-33.87, 151.21] };
    return map[tz] || [40.71, -74.0];
  }
  function setLocation(lat, lon, src) {
    S.obs = makeObs(lat, lon, 0.05); S.locSource = src;
    try { S.decl = GEOMAG.field(lat, lon, 0, new Date()).decl; } catch (e) { S.decl = 0; }
    if (src !== 'jump') S.home = [lat, lon, src];
    if (src !== 'approx' && src !== 'jump') ls.set('loc', [Math.round(lat * 100) / 100, Math.round(lon * 100) / 100]);
    S.jump++; S.starsAt = 0; S.planetsAt = 0; trailsAt = 0;
    if (S.sel && S.sel.kind === 'sat') { S.sel.next = null; nextPassFor(S.sel); }
    tonightDirty = true;
  }
  function requestGPS() {
    return new Promise(res => {
      if (!navigator.geolocation) return res(false);
      navigator.geolocation.getCurrentPosition(p => { if (S.travel) { S.home = [p.coords.latitude, p.coords.longitude, 'gps']; return res(true); } setLocation(p.coords.latitude, p.coords.longitude, 'gps'); res(true); }, () => res(false), { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
    });
  }

