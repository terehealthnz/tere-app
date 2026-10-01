import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import App from './App'
import './index.css'
import { loadFlags } from './lib/featureFlags'

// Fire-and-forget: warms the flag cache during app boot so the first
// useFeatureFlag() render has data. Failure is silent — flag callers fall
// back to their default (off).
loadFlags().catch(() => {})

// Global unhandled-rejection catcher. Async errors (fetch failures, awaited
// Promises that reject) don't hit React error boundaries. On a long-running
// provider session, an expired cookie / stale JWT typically surfaces as an
// unhandled rejection from an in-flight API call — the component doesn't
// crash, but the user hits a dead loading state. Reload once to recover,
// same session-key guard as the 401 handler in apiFetch so we don't loop.
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (e) => {
    const msg = String(e?.reason?.message || e?.reason || '')
    const authSignal = /401|unauth|session|expired|forbidden|jwt/i.test(msg)
    if (!authSignal) return
    const path = window.location.pathname
    const providerSurface = path.startsWith('/clinician') || path.startsWith('/provider') || path.startsWith('/admin')
    if (!providerSurface) return
    // Shares the same cooldown key as apiFetch's 401 path so an auth-shape
    // rejection and a 401 can't double-fire inside the window. See api.js.
    const AUTH_RELOAD_KEY = 'tere_auth_reload_at'
    const AUTH_RELOAD_COOLDOWN_MS = 60_000
    let lastReloadAt = 0
    try { lastReloadAt = parseInt(sessionStorage.getItem(AUTH_RELOAD_KEY) || '0', 10) } catch {}
    if (Date.now() - lastReloadAt < AUTH_RELOAD_COOLDOWN_MS) return
    try { sessionStorage.setItem(AUTH_RELOAD_KEY, String(Date.now())) } catch {}
    console.warn('[main] auth-shaped unhandled rejection — reloading', { msg })
    window.location.reload()
  })
}

// One-tap test bootstrap. Open a URL like:
//   https://terehealth.co.nz/call?token=<uuid>&consultId=<uuid>
// on any device (phone, laptop) and jump straight into the call as the
// patient side, bypassing triage/payment. Runs BEFORE React mounts so
// PatientCall sees populated sessionStorage on first render. Used for
// Chime 2-device tests and demos — real user flows never carry these
// params.
try {
  const q = new URLSearchParams(window.location.search)
  const token = q.get('token')
  const consultId = q.get('consultId') || q.get('consultationId')
  if (token) sessionStorage.setItem('patient_access_token', token)
  if (consultId) sessionStorage.setItem('consultationId', consultId)
} catch {}

// Boot-time sweep of legacy note-draft keys. Drafts moved from
// localStorage → sessionStorage on 2026-09-23 (Blacklock WEB-0923-0708178226).
// Users who logged in before that deploy but never explicitly signed out
// still carry PHI-carrying rows in localStorage. Sweep them on every boot
// so the fix doesn't wait for an explicit logout. Only note-draft prefixes
// are cleared here; feature-flag cache + device fingerprint stay put.
try {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i)
    if (!key) continue
    if (key.startsWith('tere_notes_draft_') || key.startsWith('tere_notes2_')) {
      try { localStorage.removeItem(key) } catch {}
    }
  }
} catch {}

// Register the service worker. Moved out of index.html inline <script>
// so we can strip 'unsafe-inline' from the CSP script-src (pen-test H-3).
//
// Auto-reload on new SW takeover: when public/sw.js bumps its CACHE
// version, the browser installs the new worker, activate() calls
// self.clients.claim(), and 'controllerchange' fires on this page. At
// that moment the new SW is now in charge but the currently-running JS
// is still the OLD bundle. Force a reload so the user's tab picks up
// the new HTML/JS immediately — no need to close/reopen the PWA
// manually or ping providers to hard-refresh. This makes every deploy
// self-propagating to installed PWAs within one open-cycle. The
// `refreshing` guard prevents the tight-loop that happens if the SW
// claim-then-controllerchange fires while the page is already reloading.
if ('serviceWorker' in navigator) {
  // Reload-loop fix (2026-10-01): the previous `let refreshing = false` guard
  // was module-scoped — it reset to false on every page reload, so a PWA that
  // picked up a new SW could enter a tight loop (install→activate→
  // controllerchange→reload→module reruns→refreshing=false→controllerchange
  // fires on NEXT SW tick→reload again). Observed on iOS PWA on launch-eve
  // after 3 deploys in an hour (unmount-guard + PhonePicker + ACC digest).
  //
  // New rule: once we reload for an SW change, we DO NOT reload again for at
  // least 60 seconds, regardless of how many controllerchange events fire.
  // Guard uses sessionStorage (persists across reloads within the same tab)
  // and a timestamp so a genuinely new deploy an hour later still auto-picks
  // up — we just can't thrash every few seconds.
  const SW_RELOAD_KEY = 'tere_sw_reloaded_at'
  const SW_RELOAD_COOLDOWN_MS = 60_000
  const recentlyReloaded = () => {
    try {
      const t = parseInt(sessionStorage.getItem(SW_RELOAD_KEY) || '0', 10)
      return t > 0 && (Date.now() - t) < SW_RELOAD_COOLDOWN_MS
    } catch { return false }
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recentlyReloaded()) return
    try { sessionStorage.setItem(SW_RELOAD_KEY, String(Date.now())) } catch {}
    window.location.reload()
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then(reg => reg.update())
      .catch(() => {})
  })
  // Also re-check for SW updates whenever the PWA comes back to the
  // foreground. Debounced to at most once per 60s so backgrounding and
  // reopening repeatedly doesn't hammer sw.js and (worst case) feed the
  // controllerchange loop above.
  let lastUpdateCheck = 0
  const checkForUpdate = () => {
    if (document.visibilityState !== 'visible') return
    const now = Date.now()
    if (now - lastUpdateCheck < 60_000) return
    lastUpdateCheck = now
    navigator.serviceWorker.getRegistration('/sw.js')
      .then(reg => reg?.update())
      .catch(() => {})
  }
  document.addEventListener('visibilitychange', checkForUpdate)
  window.addEventListener('focus', checkForUpdate)
}

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    beforeSend(event) {
      // Strip any PHI that might leak into error reports
      if (event.request?.data) {
        const safe = { ...event.request.data }
        const phiKeys = ['patient_first_name','patient_last_name','patient_nhi','patient_dob','patient_email','patient_phone','chief_complaint','clinical_notes','transcript','vitals']
        phiKeys.forEach(k => { if (safe[k]) safe[k] = '[redacted]' })
        event.request.data = safe
      }
      if (event.extra) {
        event.extra = Object.fromEntries(
          Object.entries(event.extra).filter(([k]) => !['nhi','dob','email','phone','name'].some(s => k.toLowerCase().includes(s)))
        )
      }
      return event
    },
  })
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div style={{padding:'2rem',fontFamily:'monospace',background:'#FEF2F2',minHeight:'100vh'}}>
        <h2 style={{color:'#991B1B'}}>App error — please send this to support</h2>
        <pre style={{whiteSpace:'pre-wrap',wordBreak:'break-all',fontSize:'.8rem',color:'#7F1D1D'}}>
          {this.state.error?.toString()}{'\n\n'}{this.state.error?.stack}
        </pre>
      </div>
    )
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </BrowserRouter>
)
