// A simple Service Worker to satisfy PWA requirements
self.addEventListener('install', (e) => {
  console.log('[Service Worker] Install');
});

self.addEventListener('fetch', (e) => {
  // Just pass the request through (no complex caching yet)
  e.respondWith(fetch(e.request));
});