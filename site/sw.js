// Offline: network first, cache as a fallback. The list goes only to api.github.com; nothing of it passes through here.
const VERSION = 'today-x0.0.7';
const FILES = ['./', 'index.html', 'tokens.css', 'styles.css', 'chrome.js', 'core.js', 'store.js', 'github.js', 'app.js', 'manifest.webmanifest',
  'fonts/Inter-Regular.woff2', 'fonts/Inter-Medium.woff2', 'fonts/Inter-SemiBold.woff2', 'fonts/Inter-Bold.woff2', 'fonts/jetbrains-mono-latin-400-normal.woff2', 'fonts/jetbrains-mono-latin-500-normal.woff2', 'favicon.svg'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(FILES.map((f) => c.add(f)))).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('today-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
