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
  // Preferred: Supabase JWT (Authorization: Bearer ...). Fallback: the
  // sessionStorage-based provider id set by the existing PIN clinician login.
  // Dynamic import avoids a circular dep with supabase.js.
  if (!headers['Authorization']) {
    try {
      const { supabase } = await import('./supabase')
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (token) headers['Authorization'] = `Bearer ${token}`
    } catch {}
  }
  if (!headers['Authorization'] && !headers['x-provider-id']) {
    try {
      const providerId = typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem('providerId')
        : null
      if (providerId) headers['x-provider-id'] = providerId
    } catch {}
  }

  // Practice mode toggle. When the provider has flipped the practice
  // toggle in the header, sessionStorage.practice_mode = '1'. Every
  // /api/ call carries the header so server endpoints filter
  // is_practice accordingly. Server ignores the header for
  // onboarding-gated providers (they're always in practice regardless)
  // and for admins unless they've explicitly enabled it.
  if (typeof sessionStorage !== 'undefined') {
    try {
      if (sessionStorage.getItem('practice_mode') === '1') {
        headers['x-practice-mode'] = 'true'
      }
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

  const res = await fetch(path, { ...options, headers })
  return res
}
