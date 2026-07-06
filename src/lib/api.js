const API_KEY = import.meta.env.VITE_TERE_API_KEY || ''

export async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-tere-api-key': API_KEY,
    ...(options.headers || {}),
  }
  // Don't force Content-Type for FormData (browser sets boundary automatically)
  if (options.body instanceof FormData) delete headers['Content-Type']

  // Attach current Supabase session as a bearer token so server-side endpoints
  // that call requireProvider() can identify the caller. Dynamic import avoids
  // a circular dependency with supabase.js.
  if (!headers['Authorization']) {
    try {
      const { supabase } = await import('./supabase')
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (token) headers['Authorization'] = `Bearer ${token}`
    } catch {}
  }

  const res = await fetch(path, { ...options, headers })
  return res
}
