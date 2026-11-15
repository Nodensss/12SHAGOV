/* Офлайн-кэш для установки как веб-приложения (PWA). В APK не используется. */
var CACHE = 'shagi-v9-cinematic-entity';
var FILES = [
  './',
  'index.html',
  'research.html',
  'css/app.css',
  'css/intro.css',
  'js/content.js',
  'js/intro.js',
  'fonts/cormorant-garamond-cyrillic-600-italic.woff2',
  'fonts/cormorant-garamond-latin-600-italic.woff2',
  'fonts/cormorant-sc-cyrillic-700-normal.woff2',
  'fonts/cormorant-sc-latin-700-normal.woff2',
  'js/app.js',
  'js/step-core.js',
  'js/step-content.js',
  'js/step-vault.js',
  'js/step-engine.js',
  'js/step-import-core.js',
  'js/step-file-reader.js',
  'js/step-materials.js',
  'js/step-bundle-core.js',
  'js/step-bundle.js',
  'vendor/fflate.js',
  'vendor/pdfjs/pdf.mjs',
  'vendor/pdfjs/pdf.worker.mjs',
  'js/step-journal.js',
  'css/step-engine.css',
  'css/step-one-cinematic.css',
  'images/step01-abyss.png',
  'images/intro-entity-closed.png',
  'images/intro-entity-open.png',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* Сначала сеть (чтобы обновления доходили), при отсутствии сети — кэш. */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
        return hit || caches.match('index.html');
      });
    })
  );
});
