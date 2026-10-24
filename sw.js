// Service Worker: App offline verfügbar machen.
const CACHE = 'fittrack-v3';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/db.js',
  './js/ui.js',
  './js/calc.js',
  './js/training.js',
  './js/progress.js',
  './js/nutrition.js',
  './js/food-sources.js',
  './js/scanner.js',
  './js/ai.js',
  './js/settings.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Diese Dienste brauchen immer das Netz und werden nie zwischengespeichert.
const NETWORK_ONLY = ['api.anthropic.com', 'openfoodfacts.org'];

self.addEventListener('install', (event) => {
  // cache: 'reload' umgeht den HTTP-Cache von GitHub Pages (10 Minuten), sonst landen alte Dateien im neuen Cache.
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (NETWORK_ONLY.some((host) => url.hostname.endsWith(host))) return;

  // Bibliotheken vom CDN: einmal laden, dann aus dem Cache (Versionen sind fest).
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
        return res;
      })),
    );
    return;
  }

  // Eigene Dateien: Netz zuerst (damit Updates ankommen), sonst Cache.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(new Request(request.url, { cache: 'no-cache', credentials: 'same-origin' })).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      }).catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html'))),
    );
  }
});
