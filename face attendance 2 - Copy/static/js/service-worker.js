const CACHE_NAME = 'face-attend-v1';
const ASSETS = [
  '/',
  '/static/style.css',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/templates/home.html',
  '/templates/login.html',
  '/templates/signup.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  // Cache-first strategy for static assets
  if (event.request.url.includes('/static/')) {
    event.respondWith(
      caches.match(event.request)
        .then((cached) => cached || fetch(event.request))
    );
    return;
  }

  // Network-first strategy for API calls
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('/offline.html'))
    );
    return;
  }

  // Default behavior
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match('/offline.html'))
  );
});