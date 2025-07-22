const CACHE_NAME = 'faceauth-cache-v1.2'; // Updated cache version

const urlsToCache = [
  '/',
  '/offline.html', // Offline fallback page
  '/admin', // Admin login page
  '/employee_login', // Employee login page
  '/employee_signup', // Employee signup page
  '/employee', // Employee dashboard
  '/attendance', // Employee attendance history
  '/admin/dashboard', // Admin dashboard
  '/admin/regularization', // Admin regularization history
  '/admin/employees', // Admin employee management

  // Static assets (CSS)
  '/static/css/home.css',
  '/static/css/admin.css',
  '/static/css/employee_dashboard.css',
  '/static/css/employee_login.css',
  '/static/css/employee_signup.css',
  '/static/css/admin_dashboard.css', // Assuming this covers admin_emp_manage and admin_regularization styling

  // Static assets (JavaScript)
  '/static/js/home.js',
  '/static/js/admin.js',
  '/static/js/employee.js',
  '/static/js/attendance.js',
  '/static/js/employee_login.js',
  '/static/js/employee_signup.js',
  '/static/js/admin_dashboard.js',
  '/static/js/admin_emp_manage.js',
  '/static/js/admin_regularization.js',

  // Icons and Manifest
  '/static/manifest.json',
  '/static/assets/icons/icon-192.png', // Corrected path from manifest
  '/static/assets/icons/icon-512.png', // Corrected path from manifest
  '/static/icons/icon-192x192.png', // Assuming these are also used, based on templates
  '/static/icons/icon-512x512.png', // Assuming these are also used, based on templates
  '/static/assets/images/innova.png',

  

  // Bootstrap and other external CDN assets (if you want to cache them for full offline capability)
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
  'https://code.jquery.com/jquery-3.7.1.min.js',
  'https://cdn.datatables.net/2.0.8/css/dataTables.bootstrap5.min.css',
  'https://cdn.datatables.net/2.0.8/js/jquery.dataTables.min.js',
  'https://cdn.datatables.net/2.0.8/js/dataTables.bootstrap5.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
];

// Install service worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching assets');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('Service Worker: Failed to cache assets:', error);
      })
  );
});

// Activate service worker and clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch from cache, then network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // Return cached response if found
      if (response) {
        return response;
      }
      // Else, fetch from network
      return fetch(event.request).catch(error => {
        console.error('Service Worker: Fetch failed:', event.request.url, error);
        // Serve the offline fallback page
        return caches.match('/offline.html'); // Ensure this path matches your Flask route
      });
    })
  );
});