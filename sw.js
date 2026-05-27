'use strict';
const CACHE = 'mbx-shell-v3.6.0';
const SHELL = [
  '/',
  '/musicplayer/',
  '/musicplayer/index.html',
  '/musicplayer/manifest.json',
  '/musicplayer/sw.js',
  '/musicplayer/icon-192.png',
  '/musicplayer/icon-512.png',
  '/musicplayer/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // let API calls pass through unmodified

  // Static assets (icons, sw, manifest) — cache-first, fast
  const isStatic = /\.(png|jpg|svg|ico|webp|woff2?)$/.test(url.pathname)
    || url.pathname.endsWith('manifest.json')
    || url.pathname.endsWith('sw.js');
  if (isStatic) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    })));
    return;
  }

  // HTML documents — stale-while-revalidate: serve cache instantly, refresh in background
  if (e.request.destination === 'document') {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        const fetchPromise = fetch(e.request).then(r => {
          cache.put(e.request, r.clone());
          return r;
        }).catch(() => null);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Everything else — network with cache fallback
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
