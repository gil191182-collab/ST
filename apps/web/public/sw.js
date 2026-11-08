// Service worker de la app instalable.
// Regla: NO se guardan datos de clientes en el teléfono. Solo se guarda una
// página de "sin conexión" para mostrarla si no hay internet.
const CACHE = 'logistics-v1';
const OFFLINE = '/offline.html';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, '/icons/icon-192.png'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Solo las navegaciones (abrir una pantalla). La API y los archivos van siempre a la red.
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});
