// ════════════════════════════════════════════════
// SiPOP – Service Worker
// Meng-cache "app shell" (HTML/JS/manifest/ikon) agar
// aplikasi tetap bisa DIBUKA & DIISI meski tanpa internet.
// Pengiriman data laporan (ke Google Apps Script) TIDAK
// pernah di-cache — selalu mencoba jaringan langsung,
// dan jika gagal, ditangani sebagai antrian offline oleh app.js.
// ════════════════════════════════════════════════

var CACHE_NAME = 'sipop-shell-v1';

var APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ── INSTALL: simpan app shell ke cache ──
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        return cache.addAll(APP_SHELL);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

// ── ACTIVATE: bersihkan cache versi lama ──
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) { return key !== CACHE_NAME; })
          .map(function (key) { return caches.delete(key); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// ── FETCH: strategi berbeda untuk shell vs data laporan ──
self.addEventListener('fetch', function (event) {
  var req = event.request;

  // Permintaan non-GET (POST kirim laporan) atau ke Apps Script:
  // JANGAN dicampuri Service Worker, biarkan app.js yang menangani
  // (termasuk logika antrian offline saat gagal).
  if (req.method !== 'GET' || req.url.indexOf('script.google.com') !== -1) {
    return;
  }

  // Untuk file app shell sendiri: cache-first, lalu perbarui di
  // latar belakang jika ada koneksi (stale-while-revalidate).
  event.respondWith(
    caches.match(req).then(function (cached) {
      var fetchAndUpdate = fetch(req)
        .then(function (fresh) {
          if (fresh && fresh.status === 200) {
            var copy = fresh.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(req, copy);
            });
          }
          return fresh;
        })
        .catch(function () {
          // Tidak ada koneksi: andalkan cache saja
          return cached;
        });

      return cached || fetchAndUpdate;
    })
  );
});
