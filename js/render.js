/* Sky Watch · render.js · Frame loop and everything drawn on the sky: grid, stars, constellations, satellites, deep sky, meteors, arrows.
   All app files share one global scope and must load in order: core, data, view, render, cards, sensing, ui, main. */
'use strict';
  // ---------- rendering ----------
  let hits = [], lastFrame = performance.now(), cardAt = 0, tick = 0, zoneAt = 0;
  const ZONE = { top: 150, bot: 9999 };
  function updateZones() {
    const top = $('#top'), low = $('#lower');
    if (S.clear) { ZONE.top = 66; const cd = $('#card'); ZONE.bot = cd.hidden ? H - 10 : cd.getBoundingClientRect().top - 6; return; }
    ZONE.top = top.hidden ? 0 : top.getBoundingClientRect().bottom + 6;
    let b = H;
    if (!low.hidden) for (const el of [$('#card'), $('#timebar')]) if (!el.hidden) { b = Math.min(b, el.getBoundingClientRect().top - 6); }
    ZONE.bot = b;
  }
  const FONT = '600 11px Inter, system-ui, sans-serif', MONO = '500 9px "JetBrains Mono", ui-monospace, monospace';
  // Battery: full speed only while the view is moving; otherwise 30 fps (15 fps with Battery saver).
  const saverOn = () => !!(S.f.saver || S.autoSaver);
  function frame() {
    requestAnimationFrame(frame);
    const t0 = performance.now();
    const moving = S.dragging || ptrs.size > 0 || S.angVel > 1.5 || Math.abs(S.rate) > 1.5 || S.scrubbing || Math.hypot(S.dragYaw, S.dragPitch) > 0.05;
    // while a menu is open or a list is being scrolled, the sky barely redraws so scrolling stays smooth
    const busyUI = S.sheetOpen || t0 - (S.uiScrollAt || 0) < 400;
    const gap = busyUI ? 250 : saverOn() ? (moving ? 33 : 66) : (moving ? 0 : 33);
    if (t0 - lastFrame < gap - 3) return;
    const nowP = t0, dt = clamp((nowP - lastFrame) / 1000, 0, 0.1); lastFrame = nowP; tick++;
    S.ft = (S.ft || 16) * 0.95 + 0.05 * dt * 1000;
    if (S.rate !== 1) S.offset += (S.rate - 1) * dt * 1000;
    if ((S.work || 0) > 18 && nowP - (S.perfAt || 0) > 2500 && S.dprCap > 1) { S.dprCap = Math.max(1, S.dprCap - 0.5); S.perfAt = nowP; resize(); }
    if (!S.obs) return;
    const now = simNow(), tms = now.getTime();
    try {
      if (S.mode === 'ar' && S.started && !S.gotOrient && nowP - S.arStart > 4000 && !S.noSensorWarned) {
        S.noSensorWarned = true;
        toast('No motion sensors found. Drag to look around instead.', 4000);
        S.mode = 'sky'; document.body.classList.remove('ar'); cam.hidden = true; stopCamera(); updateModeBtn(); releaseAwake();
        toast('Tap Camera at the top to try camera view again.', 4000);
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
      if (tms - S.starsAt > 1000 || Math.abs(tms - S.starsAt) > 5000 || Math.abs(S.rate) > 1.5) { updateStars(now); S.starsAt = tms; }
      if (Math.abs(tms - S.planetsAt) > 5000) { updatePlanets(now); S.planetsAt = tms; }
      if (nowP - zoneAt > 1000) { zoneAt = nowP; updateZones(); }
      if (S.world === 'sky') updateSats(now, S.scrubbing ? 10 : saverOn() || (S.work || 0) > 14 ? 3 : 6);
      draw(now);
      starTrack(nowP);
      meteorWatch(nowP);
      S.work = (S.work || 8) * 0.9 + 0.1 * (performance.now() - t0);
      if (nowP - cardAt > 250) {
        autoRed(); cardAt = nowP; updateHUD(now); updateCard(now); checkAlarms(); }
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
    const bg = (!ar || S.noFeed) && !S.photo;
    if (bg) drawSkyBackground(sunAlt);
    if (bg && S.f.layers.stars && sunAlt < -8) drawMilkyWay(now);
    if (S.f.layers.grid) drawGrid(ar);
    const world = S.world !== 'sky' ? WORLDS[S.world] : null;
    if (!(world && world.id === 'ground' && wchip('ground') === 'peel')) drawHorizon((ar && !S.noFeed) || !!S.photo || (world && world.below));
    const placed = [];
    if (world) { world.draw(now, placed, t, ar); drawArrows(t, placed); if (S.align) drawAlignTargets(); return; }
    const dens = { few: { star: 0.6, sat: 5 }, smart: { star: 1.6, sat: 12 }, all: { star: 2.7, sat: 45 } }[S.f.density] || { star: 1.6, sat: 12 };
    const starDim = ar ? 1 : clamp(1 - (sunAlt + 4) / 10, 0.25, 1);
    if (S.view === 'deep') drawDeep(placed, t);

    // constellation lines
    const conMode = S.view === 'orbit' && S.preset === 'const';
    if ((S.f.layers.lines && S.f.layers.stars) || conMode) {
      g.lineWidth = conMode ? 1.6 : 1; g.strokeStyle = C('#9db0ff', (conMode ? 0.75 : 0.38) * starDim);
      g.beginPath();
      for (const c of CONST) for (const [a, b] of c.lines) {
        if (!a.v || !b.v) continue;
        const pa = project(a.v), pb = project(b.v);
        if (!pa.ok || !pb.ok) continue;
        if (!onScreen(pa, 400) && !onScreen(pb, 400)) continue;
        g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y);
      }
      g.stroke();
      g.font = conMode ? '600 12.5px "Space Grotesk", Inter, sans-serif' : '500 10.5px "Space Grotesk", Inter, sans-serif';
      S.conCount = 0;
      for (const c of CONST) {
        let sx = 0, sy = 0, n = 0;
        for (const s of c.members) { if (!s.v) continue; const p = project(s.v); if (onScreen(p, 0) && altOf(s.v) > -1) { sx += p.x; sy += p.y; n++; } }
        if (n >= 2 && sy / n + 18 > ZONE.top + 10 && sy / n + 18 < ZONE.bot) {
          g.fillStyle = C(c === S.sel ? '#ffffff' : '#afbef5', (conMode ? 0.95 : 0.75) * starDim);
          drawSpaced(c.name.toUpperCase(), sx / n, sy / n + 18, 3.5); S.conCount++;
          hits.push({ x: sx / n, y: sy / n + 14, r: 40, o: c, pr: 0 });
        }
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
        if (s.mag <= (conMode ? 2.7 : dens.star) || s === S.sel || (S.sel && S.sel.kind === 'const' && S.sel.members.includes(s))) label(placed, p.x, p.y, r, s.name, s.ly ? fmt(s.ly) + ' LY' : '', C('#e8eeff', 0.9 * starDim), C('#93a3c9', 0.9 * starDim), 1);
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
    if (S.view === 'meteor') drawMeteorMode(now, placed, sunAlt);
    else if (S.f.layers.meteors && S.view === 'orbit') drawRadiants(now, placed, sunAlt);
    if (S.view === 'orbit' && !conMode) drawSats(t, placed, dens, sunAlt);
    if (S.sel && S.sel.kind === 'const') {
      g.lineWidth = 2.4; g.strokeStyle = C('#ffffff', 0.85); g.beginPath();
      for (const [a, b] of S.sel.lines) { if (!a.v || !b.v) continue; const pa = project(a.v), pb = project(b.v); if (pa.ok && pb.ok) { g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); } }
      g.stroke();
    }
    if (typeof drawLaunches === 'function') drawLaunches(now, placed, t);
    if (typeof drawDeepTime === 'function') drawDeepTime(now, placed, t);
    drawArrows(t, placed);
    if (S.align) drawAlignTargets();
    if (S.f.showDetect && ST.pts && performance.now() - ST.ptsAt < 1600 && S.mode === 'ar') {
      g.strokeStyle = C('#7cf2b0', 0.9); g.lineWidth = 1;
      for (const q of ST.pts) { g.beginPath(); g.arc(q.x, q.y, 7, 0, 6.283); g.stroke(); }
    }
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
  const SAT_RANGE = 21 * 864e5;
  function drawSats(t, placed, dens, sunAlt) {
    if (!S.libs.sat) return;
    if (Math.abs(t - Date.now()) > SAT_RANGE) { S.counts = { up: 0, inView: 0 }; return; }
    const fam = S.family;
    let up = 0, inView = 0;
    const buckets = new Map(), cands = [], near = [];
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
      const isFam = fam && s.launch === fam.key;
      const key = isFam ? 'FAM' : s.lit ? gcol : '#56607e';
      let b = buckets.get(key); if (!b) { b = []; buckets.set(key, b); } b.push(p.x, p.y, (isFam ? 4 : s.lit ? (s.mag < 3 ? 3.2 : 2.4) : 2) + (s.rcs > 5 ? 0.8 : 0));
      hits.push({ x: p.x, y: p.y, r: 20, o: s, pr: SPECIAL[s.id] ? 6 : 2 });
      const dc = Math.hypot(p.x - W / 2, p.y - H / 2); if (dc < FOC * Math.tan(3 * D2R)) near.push({ s, d: dc });
      let score = 0;
      if (s === S.sel) score += 1e6;
      if (SPECIAL[s.id]) score += 1e4;
      if (S.pinned.has(s.id)) score += 5e3;
      if (s.groups.has('last-30-days')) score += 60;
      const visNow = s.lit && sunAlt < -4 && s.mag < 5.5;
      if (visNow) score += 300 - s.mag * 20;           // things you can actually see win
      else if (s.lit) score += 40 - s.mag * 4;
      if (s.h > 2000) score -= 120;                     // far GPS / geostationary sats rarely matter
      if (s.groups.has('visual')) score += 25;
      if (isFam) score += 400;
      cands.push({ s, p, score });
    }
    for (const [col, arr] of buckets) {
      if (col === 'FAM') {
        g.fillStyle = C('#ffd37a', 0.22);
        for (let i = 0; i < arr.length; i += 3) { g.beginPath(); g.arc(arr[i], arr[i + 1], 7, 0, 6.283); g.fill(); }
        g.fillStyle = C('#ffd37a');
      } else g.fillStyle = C(col, (col === '#56607e' ? 0.75 : 0.95) * (fam ? 0.25 : 1));
      for (let i = 0; i < arr.length; i += 3) { const z = arr[i + 2]; g.fillRect(arr[i] - z / 2, arr[i + 1] - z / 2, z, z); }
    }
    if (fam) { let fu = 0; for (const x of A) if (x.launch === fam.key && x.ok && x.v && satDir(x, t)[2] > 0) fu++; fam.up = fu; }
    S.counts = { up, inView };
    near.sort((a, b) => a.d - b.d); centerEvents(near, sunAlt);
    cands.sort((a, b) => b.score - a.score);
    // trails for the most interesting few
    const trailSats = cands.filter(c => SPECIAL[c.s.id] && c.s !== S.sel).slice(0, 3).map(c => c.s);
    if (S.sel && S.sel.kind === 'sat' && S.sel.ok) trailSats.unshift(S.sel);
    if (S.f.layers.trails) { updateTrails(new Date(t), trailSats); for (const s of trailSats) drawTrail(s, t); }
    drawPassPath(t, placed);
    let n = 0;
    for (const c of cands) {
      if (n >= dens.sat && c.score < 1e3) break;
      const s = c.s, gcol = (GBY.get(s.prim) || GROUPS[0]).col;
      if (!s.lit && S.f.density !== 'all' && c.score < 1e3) continue; // dark satellites stay unlabeled unless asked
      if (s.h > 2000 && S.f.density === 'few' && c.score < 1e3) continue;
      const big = !!SPECIAL[s.id] || s === S.sel;
      const sz = big ? 11 : 8;
      g.lineWidth = big ? 1.6 : 1.2;
      g.strokeStyle = s.lit ? C(gcol) : C('#7d8db3');
      if (!s.lit) g.setLineDash([2, 2]);
      g.strokeRect(c.p.x - sz / 2, c.p.y - sz / 2, sz, sz);
      g.setLineDash([]);
      const nm = SPECIAL[s.id] || prettyName(s.name);
      const sub = s.lit ? fmt(dv(s.h)) + ' ' + DU() + (s.mag < 8 ? ' · MAG ' + s.mag.toFixed(1) : '') : 'IN SHADOW · ' + fmt(dv(s.h)) + ' ' + DU();
      if (label(placed, c.p.x, c.p.y, sz / 2 + 2, nm, sub, s.lit ? C(big ? '#ffffff' : '#e6f6ff') : C('#aeb9d6'), C(s.lit ? '#a9c7e8' : '#8592b1'), 3, big)) n++;
      if (s === S.sel) drawReticle(c.p, t, gcol);
    }
  }
  // Friendlier satellite names: "STARLINK-31234" -> "Starlink 31234", "GSAT0225 (GALILEO 29)" -> "Galileo 29", "COSMOS 2251 DEB" -> "Cosmos 2251 debris".
  const KEEP_CAPS = new Set(['ISS', 'CSS', 'GPS', 'NOAA', 'GOES', 'HST', 'USA', 'SL', 'ESA', 'NASA', 'TDRS', 'DMSP', 'QZS', 'IRNSS', 'GSAT', 'SES', 'CZ', 'II', 'III', 'IV', 'BIIF', 'BIIR', 'BIIRM', 'BIII']);
  const nameCache = new Map();
  function prettyName(n) {
    let r = nameCache.get(n); if (r) return r;
    let x = n.trim();
    const m = x.match(/^(.*?)\s*\((.+)\)\s*$/);
    if (m) x = /[A-Z]{3,}/.test(m[2]) && !/^(PRN|C\d|SVN)/.test(m[2]) ? m[2] : m[1];
    x = x.replace(/ DEB$/, ' debris').replace(/ R\/B$/, ' rocket').replace(/^STARLINK-/, 'STARLINK ').replace(/^ONEWEB-/, 'ONEWEB ');
    x = x.split(/(\s+|-)/).map(w => /^[A-Z]{2,}$/.test(w) && !KEEP_CAPS.has(w) ? w[0] + w.slice(1).toLowerCase() : w).join('');
    x = x.replace(/^Beidou/, 'BeiDou').replace(/^Oneweb/, 'OneWeb');
    r = x.length > 20 ? x.slice(0, 19) + '…' : x;
    nameCache.set(n, r); return r;
  }
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
    const ph = (((t % 2400) + 2400) % 2400) / 2400;
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
      if (sh.zhr < 10) continue;
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
  // ---------- deep space mode ----------
  function deepShown(d) {
    const pr = S.deepPreset, sw = seeWith(d);
    return pr === 'all' || (pr === 'eye' && sw === 'NAKED EYE') || (pr === 'bino' && (sw === 'NAKED EYE' || sw === 'BINOCULARS')) ||
      (pr === 'galaxy' && d.type === 'galaxy') || (pr === 'nebula' && /nebula|planetary|remnant/.test(d.type)) || (pr === 'cluster' && /cluster|globular/.test(d.type));
  }
  function probeSub(pb) {
    if (pb.jwst) return 'L2 · 1.5M KM · APPROX.';
    const au = probeAU(pb, simNow());
    return (au * 0.1496).toFixed(1) + 'B KM · LIGHT ' + (au * 8.317 / 60).toFixed(1) + ' H';
  }
  function drawDeep(placed, t) {
    let n = 0;
    for (const d of DSOS) {
      if (!d.v || altOf(d.v) < -0.5 || !deepShown(d)) continue;
      const p = project(d.v); if (!onScreen(p, 80)) continue;
      n++;
      const col = DSO_COL[d.type] || '#ffffff';
      const r = clamp(FOC * Math.tan(d.size / 120 * D2R), 6, 160), mr = clamp(r * 0.5, 9, 22);
      if (d.type === 'blackhole') {
        const gr = g.createRadialGradient(p.x, p.y, 3, p.x, p.y, 26); gr.addColorStop(0, C(col, 0.55)); gr.addColorStop(1, C(col, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, 26, 0, 6.283); g.fill();
        g.strokeStyle = C(col); g.lineWidth = 2; g.beginPath(); g.ellipse(p.x, p.y, 15, 5, -0.35, 0, 6.283); g.stroke();
        g.fillStyle = C('#000000'); g.beginPath(); g.arc(p.x, p.y, 5, 0, 6.283); g.fill();
      } else {
        const a = clamp(0.55 - Math.min(d.mag, 9) * 0.045, 0.12, 0.5) * (0.85 + 0.15 * Math.sin(t / 1600 + d.raH));
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        gr.addColorStop(0, C(col, a)); gr.addColorStop(0.4, C(col, a * 0.45)); gr.addColorStop(1, C(col, 0));
        g.fillStyle = gr; g.save();
        if (d.type === 'galaxy') { g.translate(p.x, p.y); g.rotate(-0.5); g.scale(1, 0.42); g.translate(-p.x, -p.y); }
        g.beginPath(); g.arc(p.x, p.y, r, 0, 6.283); g.fill(); g.restore();
        if (d.type === 'cluster' || d.type === 'globular') {
          let sd = d.raH * 1000 | 0; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
          g.fillStyle = C('#ffffff', 0.75);
          for (let k = 0; k < (d.type === 'globular' ? 26 : 14); k++) { const rr = r * 0.45 * Math.sqrt(rnd()), aa = rnd() * 6.283; g.fillRect(p.x + Math.cos(aa) * rr, p.y + Math.sin(aa) * rr, 1.3, 1.3); }
        }
        g.strokeStyle = C(col, 0.75); g.lineWidth = 1; g.setLineDash(d.type === 'nebula' ? [3, 3] : []);
        g.beginPath(); g.arc(p.x, p.y, mr, 0, 6.283); g.stroke(); g.setLineDash([]);
      }
      if (d === S.sel) drawReticle(p, t, col);
      hits.push({ x: p.x, y: p.y, r: clamp(r, 26, 60), o: d, pr: 4 });
      label(placed, p.x, p.y, mr, dsoLabel(d), lyText(d.ly).toUpperCase() + ' · ' + seeWith(d), C('#ffffff'), C(col), 4, d === S.sel || d.mag < 4.5 || d.type === 'blackhole');
    }
    for (const pb of PROBES.concat([JWST])) {
      if (!pb.v || altOf(pb.v) < -0.5) continue;
      const p = project(pb.v); if (!onScreen(p, 10)) continue;
      n++;
      g.strokeStyle = C('#ffd37a'); g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(p.x, p.y - 8); g.lineTo(p.x + 8, p.y); g.lineTo(p.x, p.y + 8); g.lineTo(p.x - 8, p.y); g.closePath(); g.stroke();
      g.fillStyle = C('#ffd37a'); g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      if (pb === S.sel) drawReticle(p, t, '#ffd37a');
      hits.push({ x: p.x, y: p.y, r: 28, o: pb, pr: 6 });
      label(placed, p.x, p.y, 10, pb.short || pb.name, probeSub(pb), C('#fff1d6'), C('#c9b58c'), 5, true);
    }
    S.deepCount = n;
  }

  // ---------- meteor mode ----------
  function radiantVec(sh, now) { const p0 = precess(sh.ra, sh.dec, now); return refract(eqToEnu(p0.ra, p0.dec, gmst(now) + S.obs.lon * D2R, S.obs)); }
  function featuredShower(now) {
    const pool = activeShowers(now).concat(nextShowers(now, 12));
    if (S.feat) { const f = pool.find(x => x.name === S.feat); if (f) return f; }
    const act = activeShowers(now).sort((a, b) => b.zhr - a.zhr);
    return act.find(x => x.zhr >= 10) || nextShowers(now, 1)[0] || act[0];
  }
  function bestViewVec(v) {
    const d = v[2]; let perp = [-d * v[0], -d * v[1], 1 - d * v[2]];
    const pn = Math.hypot(perp[0], perp[1], perp[2]); if (pn < 1e-6) perp = [0, 1, 0]; else perp = perp.map(x => x / pn);
    const a = 45 * D2R;
    return [v[0] * Math.cos(a) + perp[0] * Math.sin(a), v[1] * Math.cos(a) + perp[1] * Math.sin(a), v[2] * Math.cos(a) + perp[2] * Math.sin(a)];
  }
  function drawMeteorMode(now, placed, sunAlt) {
    const t = now.getTime(), feat = featuredShower(now);
    if (!feat) return;
    for (const sh of nextShowers(now, 6)) {
      if (sh.name === feat.name || sh.start - now > 45 * 864e5) continue;
      const v = radiantVec(sh, now); if (altOf(v) < 0) continue;
      const p = project(v); if (!onScreen(p, 10)) continue;
      g.strokeStyle = C('#ffb45a', 0.5); g.lineWidth = 1; g.setLineDash([2, 4]); g.beginPath(); g.arc(p.x, p.y, 10, 0, 6.283); g.stroke(); g.setLineDash([]);
      hits.push({ x: p.x, y: p.y, r: 24, o: { kind: 'shower', ...sh }, pr: 3 });
      label(placed, p.x, p.y, 12, sh.name, 'PEAK ' + sh.peak.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase(), C('#ffe2b8', 0.8), C('#c9a072'), 2);
    }
    const v = radiantVec(feat, now), alt = altOf(v);
    S.featObj = Object.assign({}, feat, { rv: v, alt });
    // example meteor paths: show which way meteors travel, outward from the radiant
    const e1n = [v[1], -v[0], 0], l1 = Math.hypot(e1n[0], e1n[1]) || 1, e1 = [e1n[0] / l1, e1n[1] / l1, 0];
    const e2 = [v[1] * e1[2] - v[2] * e1[1], v[2] * e1[0] - v[0] * e1[2], v[0] * e1[1] - v[1] * e1[0]];
    const along = (beta, th) => { const cb = Math.cos(beta), sb = Math.sin(beta), c = Math.cos(th), s = Math.sin(th); return [v[0] * c + (e1[0] * cb + e2[0] * sb) * s, v[1] * c + (e1[1] * cb + e2[1] * sb) * s, v[2] * c + (e1[2] * cb + e2[2] * sb) * s]; };
    const realT = Date.now();
    for (let k = 0; k < 7; k++) {
      const per = 2600 + k * 730, cyc = Math.floor((realT + k * 977) / per), ph = ((realT + k * 977) % per) / per;
      if (ph > 0.28) continue;
      let sd = (cyc * 7919 + k * 104729) % 2147483647; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      const beta = rnd() * 6.283, th0 = (12 + rnd() * 25) * D2R, len = (10 + rnd() * 14) * D2R, pr = ph / 0.28;
      const head = along(beta, th0 + len * pr), tail = along(beta, th0 + len * Math.max(0, pr - 0.45));
      if (head[2] < 0.02 || tail[2] < 0.02) continue;
      const ph1 = project(head), pt = project(tail); if (!ph1.ok || !pt.ok) continue;
      const a = Math.sin(pr * Math.PI);
      const gr = g.createLinearGradient(pt.x, pt.y, ph1.x, ph1.y); gr.addColorStop(0, C('#ffd9a8', 0)); gr.addColorStop(1, C('#ffffff', 0.9 * a));
      g.strokeStyle = gr; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(pt.x, pt.y); g.lineTo(ph1.x, ph1.y); g.stroke(); g.lineCap = 'butt';
    }
    if (alt > -2) {
      const p = project(v);
      if (onScreen(p, 30)) {
        g.strokeStyle = C('#ffb45a'); g.lineWidth = 1.5; g.setLineDash([3, 3]);
        g.save(); g.translate(p.x, p.y); g.rotate(t / 6000); g.beginPath(); g.arc(0, 0, 18, 0, 6.283); g.stroke(); g.restore(); g.setLineDash([]);
        const ring = ((realT % 2800) / 2800);
        g.strokeStyle = C('#ffb45a', 0.7 * (1 - ring)); g.lineWidth = 1; g.beginPath(); g.arc(p.x, p.y, 10 + ring * 30, 0, 6.283); g.stroke();
        g.fillStyle = C('#ffd08a'); g.beginPath(); g.arc(p.x, p.y, 3.5, 0, 6.283); g.fill();
        hits.push({ x: p.x, y: p.y, r: 28, o: { kind: 'shower', ...feat }, pr: 5 });
        label(placed, p.x, p.y, 20, feat.name + ' radiant', 'METEORS FLY OUT FROM HERE', C('#ffffff'), C('#ffcf8a'), 6, true);
      }
      const bv = bestViewVec(v), pb = project(bv);
      if (onScreen(pb, 60)) {
        const rad = FOC * Math.tan(12 * D2R);
        g.fillStyle = C('#ffb45a', 0.05); g.beginPath(); g.arc(pb.x, pb.y, rad, 0, 6.283); g.fill();
        g.strokeStyle = C('#ffb45a', 0.55 + 0.25 * Math.sin(realT / 700)); g.lineWidth = 1.3; g.setLineDash([5, 6]);
        g.beginPath(); g.arc(pb.x, pb.y, rad, 0, 6.283); g.stroke(); g.setLineDash([]);
        label(placed, pb.x - 45, pb.y, 0, 'Best view', 'LONGEST TRAILS · ' + Math.round(altOf(bv)) + '° UP', C('#ffffff'), C('#ffcf8a'), 5, true);
      }
    }
  }

  function drawArrows(t, placed) {
    const targets = [];
    if (S.sel && S.sel.v) targets.push(S.sel);
    const sel = S.sel;
    if (S.view === 'orbit' && sel && sel.kind === 'sat' && sel.passPath && sel.next && sel.next !== 'none' && sel.v && satDir(sel, t)[2] < 0 && t < sel.next.vStart) {
      let best = null; for (const q of sel.passPath) if (!best || Math.abs(q.t - sel.next.vStart) < Math.abs(best.t - sel.next.vStart)) best = q;
      if (best) targets.splice(targets.indexOf(sel), 1, { kind: 'passstart', name: (SPECIAL[sel.id] || sel.name) + ' appears here', v: best.v, o: sel });
    }
    if (S.world === 'sky' && S.view === 'orbit') {
      for (const s of Sats.prio) if (s.ok && s !== S.sel) targets.push(s);
      for (const id of S.pinned) { const s = Sats.byId.get(id); if (s && s.ok && s !== S.sel && !SPECIAL[id]) targets.push(s); }
    } else if (S.view === 'meteor' && S.featObj && S.featObj.rv) targets.push({ kind: 'radiant', name: S.featObj.name + ' radiant', v: S.featObj.rv, o: S.featObj });
    else if (S.view === 'deep') { for (const pb of PROBES.concat([JWST])) if (pb !== S.sel) targets.push(pb); const m31 = DSOS.find(d => d.id === 'M31'); if (m31 && m31 !== S.sel) targets.push(m31); }
    let used = 0;
    for (const o of targets) {
      const v = o.kind === 'sat' ? satDir(o, t) : o.v;
      if (!v || (altOf(v) < 0 && !(S.world !== 'sky' && WORLDS[S.world].below))) continue;
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
      const nm = o.kind === 'sat' ? (SPECIAL[o.id] || prettyName(o.name)) : (o.short || o.name);
      const az = azOf(v);
      g.font = '700 10px Inter, sans-serif'; const tw = Math.max(g.measureText(nm.toUpperCase()).width, 60);
      let lx = x - Math.cos(ang) * 22 - tw / 2, ly = y - Math.sin(ang) * 22 - 12;
      lx = clamp(lx, 6, W - tw - 6); ly = clamp(ly, ZONE.top + 4, Math.max(ZONE.top + 4, ZONE.bot - 34));
      const box = { x: lx - 6, y: ly - 4, w: tw + 12, h: 30 };
      const clash = (placed || []).some(q => box.x < q.x + q.w && box.x + box.w > q.x && box.y < q.y + q.h && box.y + box.h > q.y);
      if (clash) { hits.push({ x, y, r: 30, o: o.kind === 'radiant' ? { kind: 'shower', ...o.o } : o.kind === 'passstart' ? o.o : o, pr: 9 }); if (++used >= 4) break; continue; }
      if (placed) placed.push(box);
      g.fillStyle = C('#050a1a', 0.7); roundRect(lx - 6, ly - 4, tw + 12, 30, 6); g.fill();
      g.fillStyle = C('#e6f6ff'); g.textBaseline = 'top'; g.fillText(nm.toUpperCase(), lx, ly);
      g.font = MONO; g.fillStyle = C('#93a9cc'); g.fillText(cardinal(az) + ' · ' + Math.round(altOf(v)) + '° UP', lx, ly + 13);
      g.textBaseline = 'alphabetic';
      hits.push({ x, y, r: 30, o: o.kind === 'radiant' ? { kind: 'shower', ...o.o } : o.kind === 'passstart' ? o.o : o, pr: 9 });
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

