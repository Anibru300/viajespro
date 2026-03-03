/**
 * 3P VIAJESPRO - Service Worker v5.0
 */

const CACHE_NAME = 'viajespro-v5.0.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './ux-improvements.css',
  './db.js',
  './app.js',
  './ux-improvements.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  console.log('[SW v5.0] Instalando...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW v5.0] Cacheado');
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW v5.0] Activando...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Eliminando cache antigua:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request)
      .then((cached) => cached || fetch(event.request))
  );
});

console.log('[SW v5.0] Cargado');
