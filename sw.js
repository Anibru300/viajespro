/**
 * 3P VIAJESPRO - Service Worker v5.1
 * Con actualización automática y caché mejorado
 */

const CACHE_NAME = 'viajespro-v5.1.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './ux-improvements.css',
  './modules/darkmode.css',
  './firebase-config.js',
  './db.js',
  './app.js',
  './ux-improvements.js',
  './manifest.json',
  './modules/auth.js',
  './modules/storage.js',
  './modules/database.js',
  './modules/utils.js'
];

// Instalar y cachear recursos estáticos
self.addEventListener('install', (event) => {
  console.log('[SW v5.1] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW v5.1] Cacheando recursos estáticos');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activar y limpiar cachés antiguos
self.addEventListener('activate', (event) => {
  console.log('[SW v5.1] Activando...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW v5.1] Eliminando caché antigua:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia de caché: Cache First, luego Network
self.addEventListener('fetch', (event) => {
  // Solo manejar GET
  if (event.request.method !== 'GET') return;
  
  // No interceptar requests de Firebase (Firestore, Auth, Storage)
  if (event.request.url.includes('firebase') || 
      event.request.url.includes('googleapis') ||
      event.request.url.includes('gstatic')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((cached) => {
        // Si está en caché, devolverlo
        if (cached) {
          // Actualizar caché en segundo plano
          fetch(event.request)
            .then((response) => {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, response);
              });
            })
            .catch(() => {});
          
          return cached;
        }
        
        // Si no está en caché, fetch y guardar
        return fetch(event.request)
          .then((response) => {
            // Solo cachear respuestas válidas
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
            
            return response;
          })
          .catch(() => {
            // Fallback para imágenes
            if (event.request.destination === 'image') {
              return new Response('Imagen no disponible offline', { 
                status: 503, 
                statusText: 'Offline' 
              });
            }
          });
      })
  );
});

// Escuchar mensajes del cliente
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  
  if (event.data === 'getVersion') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

// Sincronización en segundo plano (para cuando vuelva la conexión)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-gastos') {
    console.log('[SW v5.1] Sincronizando gastos pendientes...');
    // Aquí se podría implementar lógica de sincronización
  }
});

// Notificaciones push (para futuras implementaciones)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || 'ViajesPro', {
        body: data.body || 'Tienes una notificación',
        icon: './assets/icons/icon-192x192.png',
        badge: './assets/icons/icon-72x72.png',
        data: data
      })
    );
  }
});
