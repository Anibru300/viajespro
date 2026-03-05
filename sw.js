/**
 * 3P VIAJESPRO - Service Worker v5.0 (con actualización automática)
 */

const CACHE_NAME = 'viajespro-v5.0.1'; // antes era viajespro-v5.0.0
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './ux-improvements.css',
  './db.js',
  './app.js',
  './ux-improvements.js',
  './manifest.json',
  './firebase-config.js'
];

self.addEventListener('install', (event) => {
  console.log('[SW v5.0] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW v5.0] Activando...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request)
      .then((cached) => cached || fetch(event.request))
  );
});

// Escuchar mensajes del cliente para forzar actualización
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
