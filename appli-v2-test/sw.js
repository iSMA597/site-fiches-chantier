/* Appli V2 : service worker (fonctionnement hors ligne). Changer VERSION à chaque mise à jour.
   Même stratégie que la v1.3 : réseau d'abord, repli sur le cache si pas de réseau. */
var VERSION = 'fiches-v2-lotC-3';
var FICHIERS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/vendor/exceljs.min.js', 'js/vendor/supabase.js', 'js/vendor/idb-keyval.js',
  'js/config.js', 'js/donnees/serveur.js', 'js/excel/fiche-xlsx.js',
  'js/commun/outils.js', 'js/fiche/gabarit.js', 'js/fiche/brouillon.js', 'js/fiche/photos.js',
  'js/fiche/signature.js', 'js/fiche/assistant.js', 'js/ecrans/connexion.js', 'js/ecrans/accueil.js',
  'js/reseau/reception.js', 'js/reseau/programmation.js', 'js/reseau/notifications.js', 'js/app.js',
  'modele/contenu.json', 'modele/fiche_modele.xlsx',
  'icons/logo.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];
// toujours revalidés : page d'entrée et configuration (bascule de serveur sans délai)
function toujoursFrais(req, url) {
  return req.mode === 'navigate' || /\/$|\/index\.html$|\/js\/config\.js$/.test(url.pathname);
}

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return c.addAll(FICHIERS.map(function (f) { return new Request(f, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
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

// ---------------------------------------------------------------- notifications (lot C)
// le serveur envoie { titre, corps, lien } ; un toucher ouvre l'appli sur la fiche ou le rappel
self.addEventListener('push', function (e) {
  var m = {};
  try { m = e.data ? e.data.json() : {}; } catch (err) { m = { titre: 'Fiches chantier', corps: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(m.titre || 'Fiches chantier', {
    body: m.corps || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { lien: m.lien || '' }, lang: 'fr'
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var cible = new URL(e.notification.data && e.notification.data.lien ? e.notification.data.lien : './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (fenetres) {
    var ouverte = fenetres.filter(function (f) { return f.url.indexOf(self.registration.scope) === 0; })[0];
    if (ouverte) return ouverte.navigate(cible).then(function (f) { return (f || ouverte).focus(); });
    return self.clients.openWindow(cible);
  }));
});
