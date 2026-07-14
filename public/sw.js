/* Tere Health Service Worker — push notifications + offline shell */

// Bumped v4 → v5 to invalidate the old cache that was serving stale
// index.html with dead chunk hashes after deploys, causing every button
// click to hit ChunkErrorBoundary → "Something went wrong".
const CACHE = 'tere-v5'
// Static assets that don't rev between deploys — safe to cache.
const SHELL = ['/tere-logo.png', '/manifest.json']

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

// ── Fetch — network-first for HTML/JS (never cache), pass-through for API ─────
//
// The problem this handler solves: after any deploy, the app's index.html
// gets new content-hashed chunk filenames. If the SW hands out a cached
// old index.html, the browser tries to lazy-load JS chunks that were
// deleted on the new deploy → ChunkLoadError → ErrorBoundary → user sees
// "Something went wrong" on every button click.
//
// Rule: HTML documents and JS/CSS chunks are NEVER cached. Static images
// and manifest can be cached (they change rarely and don't break anything).

function shouldSkipCache(request) {
  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/')) return true
  if (url.pathname.endsWith('.js')) return true
  if (url.pathname.endsWith('.css')) return true
  if (url.pathname === '/' || url.pathname.endsWith('.html')) return true
  // 'navigate' mode = top-level document navigation; always fresh
  if (request.mode === 'navigate') return true
  const accept = request.headers.get('Accept') || ''
  if (accept.includes('text/html')) return true
  return false
}

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  if (!request.url.startsWith(self.location.origin)) return  // skip external

  if (shouldSkipCache(request)) return  // let the browser handle — no SW caching

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          try {
            const clone = response.clone()
            caches.open(CACHE).then(c => c.put(request, clone).catch(() => {}))
          } catch {}
        }
        return response
      })
      .catch(() => caches.match(request).then(cached => cached || Response.error()))
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
