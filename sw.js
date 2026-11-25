// Network-first so new builds show up right away; cache keeps it working offline.
const CACHE = 'dynasty-v7';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/ui.js', 'js/sim.js', 'js/names.js', 'js/battle.js', 'js/battleview.js', 'js/worldmap.js', 'js/you.js', 'js/duelview.js', 'assets/world/world.js', 'assets/world/terrain.png', 'assets/world/buildings.png', 'assets/world/monsters.png', 'assets/units/units.js', 'assets/ammo.png', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
