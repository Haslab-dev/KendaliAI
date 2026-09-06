// KendaliAI Service Worker for Standalone App Installation
// NOTE: "dont make it local first app or cache the app"
// Network-only passthrough: NO caching or offline interception.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clear any legacy caches if they exist
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  // Always fetch fresh from network directly without caching
  event.respondWith(fetch(event.request));
});
