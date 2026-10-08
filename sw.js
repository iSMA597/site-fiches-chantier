self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (c) { return c.indexOf('fiches-v1') === 0; }).map(function (c) { return caches.delete(c); }));
  }).then(function () { return self.registration.unregister(); }));
});
