/**
 * 3P VIAJESPRO - Service Worker
 * Proporciona funcionalidad offline para la PWA
 */

const CACHE_NAME = 'viajespro-v2.0.0';
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

// Instalaci&oacute;n: Cachear recursos est&aacute;ticos
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Service Worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Cacheando recursos est&aacute;ticos');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Instalaci&oacute;n completa');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Error en instalaci&oacute;n:', error);
      })
  );
});

// Activaci&oacute;n: Limpiar caches antiguas
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando Service Worker...');
  
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
      .then(() => {
        console.log('[SW] Activaci&oacute;n completa');
        return self.clients.claim();
      })
  );
});

// Fetch: Estrategia Cache First, luego Network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // No interceptar solicitudes de API externas
  if (request.url.startsWith('https://cdnjs.cloudflare.com')) {
    return;
  }
  
  // No interceptar solicitudes no GET
  if (request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        // Si est&aacute; en cache, devolverlo
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Si no est&aacute; en cache, hacer fetch
        return fetch(request)
          .then((networkResponse) => {
            // No cachear respuestas no v&aacute;lidas
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }
            
            // Cachear la respuesta para futuras solicitudes
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(request, responseToCache);
              });
            
            return networkResponse;
          })
          .catch((error) => {
            console.error('[SW] Error en fetch:', error);
            // Aqu&iacute; podr&iacute;amos devolver una p&aacute;gina offline personalizada
            throw error;
          });
      })
  );
});

// Manejo de mensajes desde la aplicaci&oacute;n
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// Sincronizaci&oacute;n en background (para cuando hay conexi&oacute;n)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-gastos') {
    console.log('[SW] Sincronizando gastos pendientes...');
    // Aqu&iacute; se implementar&iacute;a la l&oacute;gica de sincronizaci&oacute;n
  }
});

console.log('[SW] Service Worker cargado');
