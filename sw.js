/* Service Worker — PDV Monte de Ouro — cache-first + stale-while-revalidate */
var CACHE = 'pdv-v3';
var APP   = '/ouro-rua/SistemaTerminal.html';

self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c) { return c.add(APP); }));
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  var url = e.request.url;
  if (url.includes('supabase.co') || url.includes('qrserver.com') || e.request.method !== 'GET') return;

  if (url.includes('SistemaTerminal.html') || url.endsWith('/ouro-rua/') || url.endsWith('/ouro-rua')) {
    e.respondWith(
      caches.open(CACHE).then(function(cache) {
        return cache.match(e.request).then(function(cached) {
          var fresh = fetch(e.request).then(function(resp) {
            if (resp && resp.ok) cache.put(e.request, resp.clone());
            return resp;
          }).catch(function() { return cached; });
          return cached || fresh;
        });
      })
    );
    return;
  }

  if (url.includes('github.io')) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        return cached || fetch(e.request).then(function(resp) {
          if (resp && resp.ok) caches.open(CACHE).then(function(c) { c.put(e.request, resp.clone()); });
          return resp;
        });
      })
    );
  }
});
