// Shared logout for all four "Sign out" buttons.
//
// Responsibilities:
//   1. POST /api/provider-logout with the stashed session_id so the
//      provider_sessions row gets end_reason='logout' + ended_at.
//   2. Clear the sessionStorage / localStorage the app uses to prove
//      the user is signed in.
//
// Uses navigator.sendBeacon when the caller expects to navigate away
// immediately (default) — sendBeacon queues the POST past the tab
// teardown that a `fetch()` would otherwise be aborted by. Falls back
// to keepalive fetch when sendBeacon isn't available.

function readSessionInfo() {
  return {
    sessionId: sessionStorage.getItem('providerSessionId'),
    providerId: sessionStorage.getItem('providerId'),
  }
}

function fireLogoutRequest(sessionId, providerId) {
  const body = JSON.stringify({ sessionId, providerId })
  const url  = '/api/provider-logout'
  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      const ok = navigator.sendBeacon(url, blob)
      if (ok) return
    }
  } catch { /* fall through to fetch */ }
  try {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch { /* best-effort */ }
}

function wipeClientAuth() {
  try {
    localStorage.removeItem('tere_device')
    localStorage.removeItem('tere_portal')
    sessionStorage.clear()
  } catch { /* ignore quota / privacy-mode errors */ }
}

/**
 * Close the server-side session row and wipe client auth state. Safe to
 * call even if no session was ever opened (e.g. Cloudflare gate rejected
 * the login) — the endpoint 200s on missing sessionId.
 */
export function providerLogout() {
  const { sessionId, providerId } = readSessionInfo()
  if (sessionId || providerId) fireLogoutRequest(sessionId, providerId)
  wipeClientAuth()
}
