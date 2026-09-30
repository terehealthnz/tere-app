// Nuclear reset button — for when a provider's PWA/browser is stuck on a
// stale bundle. Symptoms:
//   - queue shows empty even though patients are in it
//   - buttons that should exist (per latest deploy) don't render
//   - modal that should appear on click doesn't
//   - any "the fix shipped but I can't see it" report
//
// The controllerchange auto-reload chain in main.jsx SHOULD handle this
// on its own after a SW version bump — but iOS Safari PWA throttles SW
// updates in standalone mode, and the load/visibilitychange listeners
// don't always fire reliably from a cold app-icon launch. This is the
// user-driven escape hatch when auto-reload fails.
//
// Usage: bind to a menu item labelled "Force refresh app".

export async function forceRefreshApp({ confirm = true } = {}) {
  if (confirm) {
    const ok = window.confirm(
      'Force refresh the app?\n\n' +
      'This clears all cached files and reloads from scratch. ' +
      'Any unsaved notes on this page will be lost.\n\n' +
      'Use this if the app seems stuck on old data or the queue looks wrong.'
    )
    if (!ok) return false
  }

  // 1) Unregister every service worker for this origin. Prevents the
  //    stale SW from re-intercepting the reload.
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map(r => r.unregister().catch(() => {})))
    }
  } catch {}

  // 2) Nuke every Cache Storage entry. If we skip this, the old SW's
  //    cached HTML/JS could still be served on the next fetch before
  //    the new SW installs.
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map(k => caches.delete(k).catch(() => {})))
    }
  } catch {}

  // 3) Hard reload. `location.reload()` alone will re-use the browser's
  //    memory/disk cache for the HTML shell; we've already killed the SW
  //    cache above so the network fetch will go through. Some browsers
  //    treat 'true' as forceReload but it's non-standard; the SW purge
  //    above is what actually guarantees freshness.
  window.location.reload()
  return true
}

// Scoped Plan B: called from queue-page load handler when the server's
// x-min-client-version header doesn't match the build ID embedded in this
// bundle. Silent (no confirm) because it only fires from the queue page,
// where nothing is unsaved. Guarded against reload loops via sessionStorage:
// if we already reloaded once this session and the mismatch persists,
// stop trying (probably a server env-var misconfig — don't torch the
// user's session in a tight loop).
const STALE_RELOAD_KEY = 'tere_stale_bundle_reloaded'

export async function checkAndReloadIfStale(serverVersion) {
  const clientVersion = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : null
  if (!serverVersion || !clientVersion) return false
  // Local dev: server sends 'dev', client also 'dev' → match, no reload.
  // Also skip when either side is 'dev' — that's the local dev sentinel
  // and shouldn't trigger reloads in staging/prod either.
  if (serverVersion === 'dev' || clientVersion === 'dev') return false
  if (serverVersion === clientVersion) return false
  // Loop guard — only auto-reload once per session for this SHA.
  try {
    const already = sessionStorage.getItem(STALE_RELOAD_KEY)
    if (already === serverVersion) {
      console.warn('[stale-bundle] mismatch persists after reload — server env misconfig?', { clientVersion, serverVersion })
      return false
    }
    sessionStorage.setItem(STALE_RELOAD_KEY, serverVersion)
  } catch {}
  console.log('[stale-bundle] auto-reloading:', { clientVersion, serverVersion })
  await forceRefreshApp({ confirm: false })
  return true
}
