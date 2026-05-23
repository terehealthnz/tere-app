const API_KEY = import.meta.env.VITE_TERE_API_KEY || ''

export async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-tere-api-key': API_KEY,
    ...(options.headers || {}),
  }
  // Don't force Content-Type for FormData (browser sets boundary automatically)
  if (options.body instanceof FormData) delete headers['Content-Type']

  const res = await fetch(path, { ...options, headers })
  return res
}
