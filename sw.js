// Saltforge service worker — network-first so deploys go live immediately, with an
// offline cache fallback. Bump CACHE on every deploy. (Pattern: gamedev-kb/pwa-and-service-worker.)
const CACHE = 'saltforge-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './css/app.css?v=1',
  './js/main.js?v=1',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((m) => m || caches.match('./index.html')))
  );
});
