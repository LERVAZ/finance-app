/* Service worker: aplikace se otevře i bez signálu (data z tabulky se ale načítají vždy online, nic citlivého se neukládá). */
var CACHE = 'finance-v1';
var FILES = ['./', 'index.html', 'css/base.css', 'js/config.js', 'js/auth.js', 'js/shim.js', 'js/logic.js', 'js/core.js', 'js/ui.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); })); self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }));
  self.clients.claim();
});
// Vlastní soubory: nejdřív síť (ať se hned projeví nová verze), bez sítě z mezipaměti. Google API se nikdy neukládá.
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(function (r) {
    var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); return r;
  }).catch(function () { return caches.match(e.request); }));
});
