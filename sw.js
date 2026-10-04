/* Service worker : fonctionnement hors ligne (cache de l'application). Changer VERSION à chaque mise à jour. */
var VERSION = 'fiches-v1.2.0';
var FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'js/app.js', 'js/fiche-xlsx.js',
  'js/vendor/exceljs.min.js', 'js/vendor/supabase.js', 'js/vendor/idb-keyval.js', 'js/config.js', 'js/cloud.js', 'js/plateforme.js', 'modele/contenu.json', 'modele/fiche_modele.xlsx', 'config/chantiers.json',
  'icons/logo.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // réseau d'abord (mises à jour), cache si hors ligne
  e.respondWith(fetch(e.request).then(function (r) {
    var copy = r.clone();
    caches.open(VERSION).then(function (c) { c.put(e.request, copy); });
    return r;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true });
  }));
});
