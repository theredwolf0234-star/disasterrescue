// Service Worker for RESCUE AI - Offline Emergency Resilience
const CACHE_NAME = 'rescue-ai-cache-v4';
const STATIC_ASSETS = [
  './',
  './index.html',
  './authority.html',
  './css/style.css',
  './js/api.js',
  './js/socket.js',
  './js/citizen-app.js',
  './js/citizen-map.js',
  './js/voice-sos.js',
  './assets/icon.png',
  './manifest.json'
];

// Install: Immediately skip waiting to take over stale workers
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate: Immediately purge all legacy caches (v1, v2, etc.) and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Purging obsolete cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: NETWORK-FIRST for all navigation & static assets
// Guarantees live production updates are served immediately when online.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-only for API, Socket.IO, or non-GET requests
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) {
    return;
  }

  // Network-First strategy
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to offline cache ONLY when network is unavailable
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
