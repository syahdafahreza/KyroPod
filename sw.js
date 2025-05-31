// sw.js - A basic service worker
const CACHE_NAME = 'kyropod-cache-v1';
const urlsToCache = [
  '/KyroPod/',
  '/KyroPod/themes/neuromorphic.css',
  '/KyroPod/svg/compact-disc-solid-light.svg',
  '/KyroPod/svg/compact-disc-solid-dark.svg',
  '/KyroPod/fontawesome/css/fontawesome.css',
  '/KyroPod/fontawesome/css/brands.css',
  '/KyroPod/fontawesome/css/solid.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap',
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://cdn.jsdelivr.net/npm/jsmediatags@3.9.7/dist/jsmediatags.min.js',
  '/KyroPod/manifest.json',
  'https://syahdafahreza.github.io/assets/icons/icon192.png',
  'https://syahdafahreza.github.io/assets/icons/icon512.png'
];

// Install event: cache essential assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache:', CACHE_NAME);
        // Penting: Pastikan untuk mengambil ulang aset saat cache baru dibuat
        // Dengan addAll, jika salah satu fetch gagal, seluruh proses caching gagal.
        return cache.addAll(urlsToCache.map(url => new Request(url, { cache: 'reload' })));
      })
      .catch(error => {
        console.error('Failed to cache resources during install:', error);
      })
  );
});

// Fetch event: serve from cache if available, otherwise fetch from network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        // Jika tidak ada di cache, ambil dari jaringan
        return fetch(event.request).then(networkResponse => {
          // Opsional: Jika Anda ingin secara dinamis menambahkan item ke cache yang tidak ada di urlsToCache
          // if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET' /* dan kriteria lain */) {
          //   const responseToCache = networkResponse.clone();
          //   caches.open(CACHE_NAME).then(cache => {
          //     cache.put(event.request, responseToCache);
          //   });
          // }
          return networkResponse;
        }).catch(error => {
          console.error('Fetching failed:', error);
          // Anda bisa mengembalikan halaman fallback offline di sini jika diperlukan
          // throw error;
        });
      }
    )
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME]; // Hanya cache dengan nama saat ini yang dipertahankan
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});