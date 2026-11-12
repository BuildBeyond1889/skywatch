/* Sky Watch · main.js · Start screen, camera/sky start, tips, service worker and boot.
   All app files share one global scope and must load in order: core, data, view, render, cards, sensing, ui, main. */
'use strict';
  // ---------- start ----------
  const TIPS = [
    ['Point it at the sky', 'Hold your phone flat for a second so the compass locks on, then raise it. Labels stick to the real sky. Drag to look past the camera; it snaps back.'],
    ['Tap anything', 'Satellites, stars, planets and constellations all have cards: what it is, who owns it, who is aboard, and when you can next see it.'],
    ['Tonight', 'The sun button at the top lists passes, Starlink trains, launches, Moon and Sun crossings and the cloud forecast. Tap an item to swing straight to it.'],
    ['Modes and time', 'Switch between Orbit, Deep space and Meteors under the compass. Tap the time under the slider for the time machine and fast-forward.']
  ];
  function showTips(step) {
    step = step || 0; const box = $('#tips');
    if (step >= TIPS.length) { box.hidden = true; ls.set('tipsDone', true); return; }
    box.hidden = false;
    box.innerHTML = `<div class="tip-card glass"><div class="mono tip-step">${step + 1} / ${TIPS.length}</div><b>${esc(TIPS[step][0])}</b><p>${esc(TIPS[step][1])}</p><div class="row"><button type="button" class="btn small" id="tipSkip">Skip</button><div class="spacer"></div><button type="button" class="btn small primary" id="tipNext">${step === TIPS.length - 1 ? 'Got it' : 'Next'}</button></div></div>`;
    $('#tipNext').onclick = () => showTips(step + 1);
    $('#tipSkip').onclick = () => showTips(TIPS.length);
  }
  function showHUD() {
    if (!S.started && !ls.get('tipsDone', false)) setTimeout(() => showTips(0), 900);
    $('#top').hidden = false; $('#lower').hidden = false;
    $('#start').classList.add('gone'); setTimeout(() => { $('#start').hidden = true; }, 600);
    S.started = true; resize(); keepAwake();
  }
  async function enterAR() {
    // iOS needs the motion permission requested inside the tap
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') { toast('Motion access was declined, so camera view cannot follow your phone. Using sky view.', 5000); return startSkyMode(); }
      }
    } catch (e) { /* not iOS */ }
    if (!S.sensorsOn) { startSensors(); S.sensorsOn = true; }
    stopCamera();
    try { await startCamera(); }
    catch (e) { toast('Camera unavailable: ' + String(e.message || e.name).replace(/\.$/, '') + '. Using sky view.', 5000); return startSkyMode(); }
    S.mode = 'ar'; document.body.classList.add('ar'); S.lastOrient = performance.now(); S.arStart = performance.now();
    S.gotOrient = false; S.noSensorWarned = false; S.q = null; S.qT = null; S.dragYaw = 0; S.dragPitch = 0; S.zoom = 1;
    cam.classList.toggle('nofeed', S.noFeed);
    const first = !S.started;
    showHUD(); updateModeBtn();
    if (first) requestGPS(); else toast('Camera view is back.');
  }
  $('#startAR').onclick = enterAR;
  // In sky view the pill next to the status chip turns into a "Camera" button that restarts camera view.
  function updateModeBtn() {
    const b = $('#alignBtn');
    if (S.mode === 'ar') { b.textContent = 'Align'; b.setAttribute('aria-label', 'Align with a star'); }
    else { b.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:-2px;margin-right:6px"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Camera'; b.setAttribute('aria-label', 'Switch to camera view'); }
  }
  function startSkyMode() {
    releaseAwake();
    S.mode = 'sky'; document.body.classList.remove('ar'); cam.hidden = true; stopCamera();
    const first = !S.started;
    showHUD(); updateModeBtn(); if (first) requestGPS();
  }
  $('#startSky').onclick = startSkyMode;

  // service worker for offline use
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const hadSW = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadSW || reloaded) return;
      reloaded = true;
      if (!S.started) location.reload(); else toast('Sky Watch updated. Close and reopen it to get the new version.', 5000);
    });
  }

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
