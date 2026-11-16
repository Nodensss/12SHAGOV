const CACHE = '12shagov-shell-v12';
const ASSETS = ['./game/art/alcohol.webp', './game/art/gambling.webp', './game/art/games.webp', './game/art/phone.webp', './game/art/nicotine.webp', './game/art/shopping.webp', './game/art/neutral.webp', './game/art/ui-frame.svg', './game/art/ui-grain.svg', './game/art/drugs.webp', './game/art/foe-whisper.webp', './game/art/foe-stash.webp', './game/art/foe-company.webp', './game/art/foe-craving.webp', './', './index.html', './styles.css', './app.js', './steps.js', './exercises.js', './storage.js', './content.js', './model.js', './reader.js', './manifest.webmanifest', './icon.svg', './data/content.json', './data/sources.json', './game/', './game/index.html', './game/game.css', './game/game.js', './game/engine.js', './game/battle.js', './game/data/skills.json', './game/data/items.json', './game/data/trials/trial01-trap.json', './game/data/chapters/step02-group.json', './game/data/chapters/step02-bench.json', './game/data/chapters/step02-lena.json', './game/data/chapters/step02-river.json', './game/data/chapters/step02-morning.json', './game/data/chapters/step02-night.json', './game/data/chapters/step03-message.json', './game/data/chapters/step03-shift.json', './game/data/chapters/step03-key.json', './game/data/chapters/step03-family.json', './game/data/chapters/step03-rain.json', './game/data/chapters/step03-decision.json', './game/data/fights/fight01-whisper.json', './game/data/fights/fight02-stash.json', './game/data/fights/fight03-company.json', './game/data/fights/fight04-craving.json', './game/art/foe-whisper.svg', './game/art/foe-stash.svg', './game/art/foe-company.svg', './game/art/foe-craving.svg', './game/data/episodes.json', './game/data/vocab.json', './game/art/neutral.svg', './game/art/alcohol.svg', './game/art/drugs.svg', './game/art/gambling.svg', './game/art/games.svg', './game/art/phone.svg', './game/art/nicotine.svg', './game/art/shopping.svg', './game/data/chapters/step01-only-once.json', './game/data/chapters/step01-stash.json', './game/data/chapters/step01-sister.json', './game/data/chapters/step01-door.json'];
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
