/* Sky Watch · view.js · Phone orientation, smoothing, camera field of view and projection onto the screen.
   All app files share one global scope and must load in order: core, data, view, render, cards, sensing, ui, main. */
'use strict';
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
    S.qT = m2q(R); S.gotOrient = true;
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
      const q0 = S.q;
      S.q = slerp(S.q, S.qT, 1 - Math.pow(1 - k, dt * 60));
      S.angVel = S.angVel * 0.85 + 0.15 * (qAngle(q0, S.q) / Math.max(dt, 1e-3));
      M = mmul(rz(-(S.hcorr + (S.absolute ? S.decl : 0))), q2m(S.q));
      M = mmul(M, mmul(ry(-S.dragYaw), rx(S.dragPitch)));
    } else {
      const f = vecAA(S.viewAz, S.viewAlt), up = [0, 0, 1];
      let r = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]];
      const rn = Math.hypot(r[0], r[1], r[2]) || 1; r = r.map(x => x / rn);
      const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      M = [r[0], u[0], -f[0], r[1], u[1], -f[1], r[2], u[2], -f[2]];
      if (S.photo && S.roll) M = mmul(M, rz(S.roll));
    }
    return M;
  }
  function focal() {
    let long = Math.max(W, H), sc = 1;
    if (S.photo) { long = Math.max(S.photo.w, S.photo.h) * Math.min(W / S.photo.w, H / S.photo.h); }
    else if (S.mode === 'ar' && cam.videoWidth) {
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

