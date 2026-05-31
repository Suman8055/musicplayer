'use strict';
const CACHE = 'mbx-shell-v4.1.29';
// Derive base path from SW location so this works on any subdirectory (prod or staging)
const BASE = self.location.pathname.replace(/\/sw\.js.*$/, '') || '';
const SHELL = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/manifest.json',
  BASE + '/sw.js',
  BASE + '/icon-192.png',
  BASE + '/icon-512.png',
  BASE + '/apple-touch-icon.png',
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
      // clients.claim() makes new SW take control immediately, then all clients
      // get a 'controllerchange' event and reload — ensuring the new HTML is served.
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // Static assets — cache-first
  const isStatic = /\.(png|jpg|svg|ico|webp|woff2?)$/.test(url.pathname)
    || url.pathname.endsWith('manifest.json');
  if (isStatic) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    })));
    return;
  }

  // sw.js itself — always network-first so the browser always sees the latest version
  if (url.pathname.endsWith('sw.js')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // HTML documents — network-first with cache fallback (ensures fresh HTML on every load)
  if (e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Everything else — network with cache fallback
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
