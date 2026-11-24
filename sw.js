const CACHE = 'cafeflow-v33';
const FILES = [
  './',
  './index.html',
  './css/styles.css?v=33',
  './js/main.js?v=33',
  './js/app.js?v=33',
  './js/domain.js',
  './js/storage.js',
  './js/cloud.js',
  './js/supabase-key.mjs',
  './js/sync.js',
  './views/dashboard.html',
  './views/clients.html',
  './views/services.html',
  './views/warehouse.html',
  './views/queue.html',
  './views/quotation.html',
  './views/backup.html?v=32',
  './views/account.html',
  './manifest.webmanifest',
  './assets/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.endsWith('/js/supabase-config.js')) return;

  const isAppAsset = url.pathname === '/' ||
    /\.(css|js|html|webmanifest|svg|png|woff2?)$/i.test(url.pathname);
  if (!isAppAsset) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
