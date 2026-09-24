const CACHE_NAME = 'papercut-shell-v2'
const SHELL = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const isNavigation = event.request.mode === 'navigate'
  event.respondWith((isNavigation ? fetch(event.request).catch(() => caches.match('/index.html')) : caches.match(event.request).then((cached) => cached || fetch(event.request))).then((response) => {
    if (!response) throw new Error('Offline shell unavailable')
    if (event.request.url.startsWith(self.location.origin)) {
      const copy = response.clone()
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
    }
    return response
  }))
})