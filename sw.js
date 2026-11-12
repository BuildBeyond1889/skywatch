/* Sky Watch service worker: app shell network-first, libraries and fonts cache-first, so the app opens offline. */
const V = 'skywatch-v2';
const SHELL = ['./', './index.html', './app.js', './stars.js', './deep.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './icon-180.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  const lib = /(^|\.)(cdn\.jsdelivr\.net|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.hostname);
  if (u.origin === self.location.origin) {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(V).then(cc => cc.put(req, c)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
  } else if (lib) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const c = res.clone(); caches.open(V).then(cc => cc.put(req, c)); return res; })));
  }
});
