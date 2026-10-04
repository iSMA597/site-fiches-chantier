/* Service worker : fonctionnement hors ligne (cache de l'application). Changer VERSION à chaque mise à jour. */
var VERSION = 'fiches-v1.3.0';
var FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'js/app.js', 'js/fiche-xlsx.js',
  'js/vendor/exceljs.min.js', 'js/vendor/supabase.js', 'js/vendor/idb-keyval.js', 'js/config.js', 'js/cloud.js', 'js/plateforme.js',
  'modele/contenu.json', 'modele/fiche_modele.xlsx', 'config/chantiers.json',
  'icons/logo.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];
// toujours revalidés auprès du serveur : page d'entrée et configuration (bascule production sans délai)
function toujoursFrais(req, url) {
  return req.mode === 'navigate' || /\/$|\/index\.html$|\/js\/config\.js$/.test(url.pathname);
}

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return c.addAll(FILES.map(function (f) { return new Request(f, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // réseau d'abord ; seules les bonnes réponses vont en cache ; repli sur le cache si erreur ou hors ligne
  e.respondWith(fetch(e.request, toujoursFrais(e.request, url) ? { cache: 'no-cache' } : undefined).then(function (r) {
    if (r && r.ok && r.type === 'basic') {
      var copie = r.clone();
      e.waitUntil(caches.open(VERSION).then(function (c) { return c.put(e.request, copie); }));
      return r;
    }
    return caches.match(e.request, { ignoreSearch: true }).then(function (m) { return m || r; });
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true }).then(function (m) {
      return m || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error());
    });
  }));
});
