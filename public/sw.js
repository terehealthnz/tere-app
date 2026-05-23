/* Tere Health Service Worker — push notifications + offline shell */

const CACHE = 'tere-v2'
const SHELL = ['/', '/provider', '/tere-logo.png', '/manifest.json']

// ── Lifecycle ─────────────────────────────────────────────────────────────────

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL).catch(() => {}))
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// ── Fetch — network-first, fall back to cache ─────────────────────────────────

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  if (request.url.includes('/api/')) return  // never cache API
  if (!request.url.startsWith(self.location.origin)) return  // skip external

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          caches.open(CACHE).then(c => c.put(request, response.clone()))
        }
        return response
      })
      .catch(() =>
        caches.match(request)
          .then(cached => cached || caches.match('/'))
      )
  )
})

// ── Push notifications ────────────────────────────────────────────────────────

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data?.json() || {} } catch {}

  const options = {
    body:             data.body || 'You have a new notification',
    icon:             '/tere-logo.png',
    badge:            '/tere-logo.png',
    tag:              data.tag || 'tere',
    data:             { url: data.url || '/provider' },
    requireInteraction: Boolean(data.requireInteraction),
    vibrate:          [200, 100, 200],
  }
  if (data.actions?.length) options.actions = data.actions

  event.waitUntil(
    self.registration.showNotification(data.title || 'Tere Health', options)
  )
})

// ── Notification click — focus existing tab or open new ───────────────────────

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/provider'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(all => {
      for (const c of all) {
        const path = new URL(c.url).pathname
        if (path.startsWith('/provider') || path.startsWith('/clinician')) {
          c.navigate(url)
          return c.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
