var CACHE = 'pdv-v4';
var FILES = [
  '/ouro-rua/SistemaTerminal.html',
  '/ouro-rua/engine.min.js',
  '/ouro-rua/logo-login.png',
  '/ouro-rua/logo-main.png',
  '/ouro-rua/logo-ticket.png',
  '/ouro-rua/logo-print.png'
];

self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c) { return c.addAll(FILES); }));
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  var url = e.request.url;
  if (url.includes('supabase.co') || url.includes('api.qrserver.com')) {
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var network = fetch(e.request).then(function(res) {
        if (res.ok) {
          caches.open(CACHE).then(function(c) { c.put(e.request, res.clone()); });
        }
        return res;
      });
      return cached || network;
    })
  );
});
