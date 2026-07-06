const API_KEY = import.meta.env.VITE_TERE_API_KEY || ''

export async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-tere-api-key': API_KEY,
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

  const res = await fetch(path, { ...options, headers })
  return res
}
