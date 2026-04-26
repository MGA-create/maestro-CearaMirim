/**
 * ============================================================================
 * SERVICE WORKER - PORTAL MAESTRO (V8.8)
 * Responsável pela instalação do PWA e suporte Offline básico.
 * ============================================================================
 */

const CACHE_NAME = 'maestro-cache-v8.8';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './js_global.js',
  './icone.png'
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

// 3. Estratégia de Fetch: Tenta Rede primeiro, cai para Cache se offline
self.addEventListener('fetch', (event) => {
  // Ignora pedidos para a API da Google (devem ser sempre live)
  if (event.request.url.includes('script.google.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
