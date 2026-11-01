const CACHE = '12shagov-shell-v3';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './steps.js', './exercises.js', './storage.js', './content.js', './model.js', './manifest.webmanifest', './icon.svg', './data/content.json', './data/sources.json'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('12shagov-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const scopePath = new URL(self.registration.scope).pathname;
  const relativePath = url.pathname.slice(scopePath.length);
  // No user data, original documents or arbitrary URLs go into the cache.
  const allowed = ASSETS.map(asset => asset.replace('./', '')).includes(relativePath);
  if (!allowed) return;
  event.respondWith(fetch(event.request).then(async response => {
    if (!response.ok) return (await caches.match(event.request)) || response;
    const copy = response.clone();
    event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    return response;
  }).catch(() => caches.match(event.request)));
});
