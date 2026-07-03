/* Bump CACHE when you change any shell file to push updates to installed apps. */
const CACHE = 'today-v6';
const SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/pwa/manifest.webmanifest',
  '/pwa/icon-192.png',
  '/pwa/icon-512.png',
  '/pwa/apple-touch-icon.png',
  '/fonts/Gotham-Book.otf',
  '/fonts/Gotham-Bold.otf',
  '/fonts/CargoD.otf',
  '/fonts/Roboto-Light.ttf',
  '/fonts/Roboto-Regular.ttf',
  '/fonts/Roboto-Medium.ttf',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // Never cache the API — always hit the network.
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(req).catch(() => new Response('{"items":[]}', {
      headers: { 'content-type': 'application/json' }, status: 503,
    })));
    return;
  }

  // Shell: stale-while-revalidate so the app opens instantly and updates in the background.
  e.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req).then(res => {
        if (res && res.status === 200 && req.method === 'GET') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
