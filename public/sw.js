/* Tere Health Service Worker — push notifications + offline shell */

// Bump the version any time the cache-shape or fetch handler changes so
// activate() nukes the previous cache. v7→v8: this SW now aggressively
// skips HTML/JS/CSS from the cache entirely (see shouldSkipCache) so
// stale shells can't hand out dead chunk hashes after a deploy.
// v8→v9: forced eviction cycle on 2026-09-16 to clear a stuck AITriage
// chunk (some clients were serving pre-6032c39 code even after hard-refresh).
// v9→v10: forced eviction cycle on 2026-09-29 to push the PWA foreground-
// reload fix (commit 2b4f7f8) to every installed provider PWA. Every
// SW version bump triggers activate() which combined with the
// controllerchange listener in src/main.jsx forces the client to reload
// with the new bundle within one open-cycle of the app.
// v10→v11: launch-eve bundle push 2026-09-30. Forces every installed PWA
// to pick up the queue-visibility gate (in_waiting_room PATCH from
// WaitingRoom mount), patient Leave modal, and Video widget mount fixes
// on next foreground. Without this bump, PWAs keep serving the pre-
// launch bundle until the user manually re-installs the app.
// v11→v12: SW reload-loop fix 2026-10-01. The previous controllerchange
// handler had a module-scoped `refreshing` flag that reset on every reload,
// causing a tight loop on PWAs with slightly-divergent SW state (observed
// after 3 deploys in an hour: unmount-guard + PhonePicker + ACC digest).
// Guard is now sessionStorage-backed with a 60s cooldown so one real
// deploy still auto-propagates but a loop can't form.
// v12→v13: Second reload loop fix 2026-10-01. apiFetch's 401 handler used
// the same clear-on-2xx binary flag pattern, which looped when
// provider-notifications 401'd while consultations 200'd. Switched to
// timestamp cooldown. Bump CACHE so PWAs on v12 pick up v13 immediately.
const CACHE = 'tere-v13'
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
