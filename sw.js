/**
 * ============================================================================
 * SERVICE WORKER - PORTAL MAESTRO (V9.2.6 - RBAC & MESA DE AUDITORIA)
 * Responsável pelo cache da aplicação e por receber Notificações em Background.
 * ============================================================================
 */

importScripts("https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js");
importScripts("https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js");

// ⚠️ ATENÇÃO: COLE AQUI AS CREDENCIAIS DO SEU FIREBASE (As mesmas do app.js)
const firebaseConfig = {
    apiKey: "COLE_SUA_API_KEY",
    authDomain: "COLE_SEU_PROJECT_ID.firebaseapp.com",
    projectId: "COLE_SEU_PROJECT_ID",
    storageBucket: "COLE_SEU_PROJECT_ID.appspot.com",
    messagingSenderId: "COLE_SEU_SENDER_ID",
    appId: "COLE_SEU_APP_ID"
};

try {
  firebase.initializeApp(firebaseConfig);
} catch (e) {
  console.log("Firebase SW já inicializado ou erro na configuração.");
}

// V9.2.6: NOME ATUALIZADO PARA FORÇAR DOWNLOAD DA NOVA INTERFACE WEB
const CACHE_NAME = 'maestro-cache-v9.2.6'; 
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './js_global.js',
  './icone.png',
  './manifest.json'
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
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// 4. Receção de PUSH em BACKGROUND (App fechada ou em segundo plano)
if (firebase.messaging.isSupported()) {
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const notificationTitle = payload.notification.title || "Novo Aviso - Maestro";
    const notificationOptions = {
      body: payload.notification.body,
      icon: payload.notification.icon || './icone.png',
      badge: './icone.png',
      vibrate: [200, 100, 200, 100, 200], // Vibração padrão de alerta
      data: payload.data || { click_action: "/" }, // Para onde ir ao clicar
      requireInteraction: true // Mantém a notificação no ecrã até o utilizador interagir (em dispositivos compatíveis)
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
}

// 5. Ação ao CLICAR na Notificação (Abrir a App)
self.addEventListener('notificationclick', (event) => {
  event.notification.close(); // Fecha a notificação do sistema
  
  // Lê a rota para onde a notificação deve apontar (geralmente a raiz do portal)
  const urlToOpen = new URL(event.notification.data.click_action || "/", self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Se a App já estiver aberta num separador, foca nesse separador
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Se a App estiver fechada, abre um novo separador/janela PWA
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
