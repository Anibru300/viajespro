/**
 * 3P VIAJESPRO - Service Worker v5.0 (con soporte para actualizaciones)
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
  './manifest.json',
  './firebase-config.js'
  // Agrega aquí otros archivos que quieras cachear
];

// Instalación: cachear archivos estáticos
self.addEventListener('install', (event) => {
  console.log('[SW v5.0] Instalando...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW v5.0] Cacheado correctamente');
        return self.skipWaiting(); // Activar inmediatamente
      })
  );
});

// Activación: limpiar cachés antiguas
self.addEventListener('activate', (event) => {
  console.log('[SW v5.0] Activando...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Eliminando caché antigua:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim()) // Tomar control de todas las páginas
  );
});

// Estrategia de caché: network first, fallback a caché
self.addEventListener('fetch', (event) => {
  // Ignorar solicitudes que no sean GET
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Si la respuesta es válida, clonarla y guardarla en caché
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Si falla la red, buscar en caché
        return caches.match(event.request);
      })
  );
});

// Escuchar mensajes del cliente (para notificar actualización)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Opcional: notificaciones push (si las usas en el futuro)
self.addEventListener('push', (event) => {
  const options = {
    body: event.data.text(),
    icon: './assets/icons/icon-192x192.png',
    badge: './assets/icons/icon-192x192.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    }
  };
  event.waitUntil(
    self.registration.showNotification('3P Control de Gastos', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('./')
  );
});

console.log('[SW v5.0] Cargado');
