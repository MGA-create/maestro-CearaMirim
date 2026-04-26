/**
 * ============================================================================
 * SERVICE WORKER - PORTAL MAESTRO (V8.8 - OFFLINE-FIRST)
 * Responsável pela instalação do PWA e carregamento instantâneo.
 * ============================================================================
 */

const CACHE_NAME = 'maestro-cache-v8.8.1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './js_global.js',
  './icone.png',
  './manifest.json' // V8.8: Adicionado para garantir a integridade da App offline
];

// 1. Instalação: Guarda os ficheiros estáticos em Cache
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. Ativação: Limpa caches antigos e assume o controlo das abas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => {
            if (cache !== CACHE_NAME) {
              return caches.delete(cache);
            }
          })
        );
      })
    ])
  );
});

// 3. Estratégia de Fetch (Offline-First para ficheiros estáticos)
self.addEventListener('fetch', (event) => {
  // Ignora chamadas para a API da Google e Firebase (estes precisam de rede viva)
  if (event.request.url.includes('script.google.com') || 
      event.request.url.includes('firestore') || 
      event.request.url.includes('googleapis')) {
    return;
  }

  // Interceta pedidos de ficheiros locais (HTML, CSS, JS, PNG)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Se o ficheiro estiver no cache, devolve IMEDIATAMENTE (abertura rápida)
      if (cachedResponse) {
        return cachedResponse;
      }
      // Se não estiver, vai à rede
      return fetch(event.request).catch(() => {
        // Se falhar (sem internet) e for um pedido de página, tenta devolver o index.html
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
