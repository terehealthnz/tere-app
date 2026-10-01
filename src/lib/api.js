// x-tere-api-key has been removed. The router in api/handler.js no longer
// checks a shared secret — real auth is per-endpoint (guardProvider for
// provider work; token verification for patient consult views; Stripe /
// Twilio / ACC signature verification for webhooks; CRON_SECRET for cron
// routes). VITE_TERE_API_KEY can be deleted from the Vercel env.

export async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }
  // Don't force Content-Type for FormData (browser sets boundary automatically)
  if (options.body instanceof FormData) delete headers['Content-Type']

  // Identify the caller to server endpoints that use requireProvider().
  // Preferred: Supabase JWT (Authorization: Bearer ...). Otherwise the
  // HttpOnly `tere_session` cookie sent below via credentials:'include' is
  // resolved by _auth.js. The old x-provider-id header fallback was removed
  // once the cookie rollout stabilised (Blacklock WEB-0923-0655443636).
  if (!headers['Authorization']) {
    try {
      const { supabase } = await import('./supabase')
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (token) headers['Authorization'] = `Bearer ${token}`
    } catch {}
  }

  // Practice mode toggle. When the provider has flipped the practice
  // toggle in the header, sessionStorage.practice_mode = '1'. Every
  // /api/ call carries the header so server endpoints filter
  // is_practice accordingly. Server ignores the header for
  // onboarding-gated providers (they're always in practice regardless)
  // and for admins unless they've explicitly enabled it.
  //
  // ROUTE SCOPE: never send the practice-mode header from admin surfaces.
  // Sandbox data belongs to provider/consult views only. Without this
  // check, a provider who toggled practice mode ON leaks Aroha/David/Emily
  // into their admin queue the moment they switch to the Admin tab —
  // because the sessionStorage flag is session-wide, not route-scoped.
  if (typeof sessionStorage !== 'undefined') {
    try {
      const path = typeof window !== 'undefined' ? window.location.pathname : ''
      const isAdminRoute = path.startsWith('/admin') || path.startsWith('/clinician/admin')
      if (!isAdminRoute && sessionStorage.getItem('practice_mode') === '1') {
        headers['x-practice-mode'] = 'true'
      }
    } catch {}
  }

  // JIT elevation token — attached to every request when available so the
  // server's checkElevation() gate can validate it. Falls off automatically
  // after 5 min (see ElevationModal.getElevationToken).
  if (!headers['x-elevation-token']) {
    try {
      const { getElevationToken } = await import('../components/clinician/ElevationModal')
      const token = getElevationToken()
      if (token) headers['x-elevation-token'] = token
    } catch {}
  }

  // Patient session token — automatically attached to every /api/ call
  // when the browser is in a patient session. Server endpoints exchange
  // this token → consultation_id via resolvePatientAuth() rather than
  // trusting a raw consultation_id in the body. Pen-test M-4/M-5 fix.
  // Set at /api/create-consultation response time (see supabase.js
  // createConsultation) and cleared at post-consult /done navigation.
  if (!headers['x-patient-token'] && typeof sessionStorage !== 'undefined') {
    try {
      const t = sessionStorage.getItem('patient_access_token')
      if (t) headers['x-patient-token'] = t
    } catch {}
  }

  // Include the HttpOnly session cookie on every /api/ call. Same-origin
  // requests would send cookies by default, but explicit `credentials:
  // include` covers the `fetch(...)` polyfill path and any future PWA
  // context. Cookie-based auth closes Blacklock WEB-0923-0655443636.
  const res = await fetch(path, { credentials: 'include', ...options, headers })

  // Note (2026-10-01): previously we cleared `tere_auth_reload` on every 2xx
  // so a future expiry could re-trigger reload. That created a reload loop
  // when one endpoint (e.g. provider-notifications) 401'd while another
  // (e.g. consultations) 200'd — the 2xx cleared the flag, next 401 set it
  // and reloaded again. The 401 path below now uses a timestamp cooldown
  // instead of a binary flag, so we never need to clear it from here.

  // MFA-mandatory: if the server rejects with MFA_REQUIRED, the caller is
  // an authenticated provider who hasn't enrolled TOTP yet. Punt the whole
  // window to the enrollment page — no dashboard access until enrolled.
  // Exception: we're already on the enrollment page (avoid redirect loop)
  // or hitting the enrollment endpoint itself.
  if (res.status === 403 && typeof window !== 'undefined') {
    const alreadyOnMfaPage = window.location.pathname === '/clinician/mfa-required'
    const isMfaEndpoint    = /\/api\/provider-mfa\b/.test(String(path))
    if (!alreadyOnMfaPage && !isMfaEndpoint) {
      // Clone the response before reading body so callers can still consume it
      try {
        const clone = res.clone()
        const body = await clone.json()
        if (body?.error === 'MFA_REQUIRED') {
          window.location.href = '/clinician/mfa-required'
        }
      } catch { /* not a JSON body, or already consumed — safe to ignore */ }
    }
  }

  // 401 auto-recovery: a provider's long-running session can expire mid-flow
  // (Supabase JWT refresh fails, cookie TTL hits, idle re-auth fires in a
  // background tab). The next provider API call returns 401, which many
  // components don't guard — the error bubbles to <ChunkErrorBoundary> and
  // the user sees "Something went wrong" on an otherwise-recoverable
  // state. Instead: reload the current URL once per session. On reload,
  // Supabase auto-refreshes the JWT and the server re-reads the cookie;
  // if auth is genuinely dead the login page handles it, otherwise the
  // user is back in action with the same route. Guarded against loops
  // with a sessionStorage key (same pattern as the chunk-reload path).
  //
  // Only triggers on provider surfaces — patient flows have their own
  // consultation-token recovery and shouldn't force-reload.
  if (res.status === 401 && typeof window !== 'undefined') {
    const pathname = window.location.pathname
    const isProviderSurface =
      pathname.startsWith('/clinician') ||
      pathname.startsWith('/provider') ||
      pathname.startsWith('/admin')
    const isAuthEndpoint =
      /\/api\/(provider-auth|provider-session|provider-logout|provider-mfa|forgot-password|reset-password)\b/.test(String(path))
    if (isProviderSurface && !isAuthEndpoint) {
      // Timestamp cooldown — writes "when we last auto-reloaded" and refuses
      // to reload again within AUTH_RELOAD_COOLDOWN_MS. Previously used a
      // clear-on-2xx binary flag which looped when one endpoint 401'd while
      // another 200'd in the same session (2026-10-01 incident).
      const AUTH_RELOAD_KEY = 'tere_auth_reload_at'
      const AUTH_RELOAD_COOLDOWN_MS = 60_000
      let lastReloadAt = 0
      try { lastReloadAt = parseInt(sessionStorage.getItem(AUTH_RELOAD_KEY) || '0', 10) } catch {}
      if (Date.now() - lastReloadAt >= AUTH_RELOAD_COOLDOWN_MS) {
        try { sessionStorage.setItem(AUTH_RELOAD_KEY, String(Date.now())) } catch {}
        console.warn('[apiFetch] 401 on provider surface — reloading to refresh session', { path })
        window.location.reload()
      }
      // Within cooldown — let the 401 propagate so the caller can show
      // "please log in" copy instead of looping.
    }
  }

  return res
}
