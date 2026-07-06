// GET/PUT /api/flags — server-side management of feature_flags.
//
// GET  /api/flags                → list all flags (any signed-in provider)
// PUT  /api/flags?key=<flag_key>  → upsert a flag (admin role only)
//                                    body: { enabled?, description?, provider_allowlist? }
//
// Reads are also possible directly from the client via supabase.from('feature_flags')
// (there's an anon SELECT policy). This endpoint is primarily for the admin UI
// to WRITE flags without needing the client to hold the service_role key.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return

  const supabase = admin()

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('feature_flags').select('*').order('key')
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ flags: data || [] })
  }

  if (req.method === 'PUT') {
    if (!auth.provider?.is_admin) return res.status(403).json({ error: 'Admin role required' })

    const { key } = req.query || {}
    if (!key) return res.status(400).json({ error: 'key query param required' })

    const b = req.body || {}
    const row = {
      key: String(key),
      updated_at: new Date().toISOString(),
      updated_by: auth.provider.id,
    }
    if (b.enabled !== undefined)            row.enabled = !!b.enabled
    if (b.description !== undefined)        row.description = b.description || null
    if (b.provider_allowlist !== undefined) row.provider_allowlist = Array.isArray(b.provider_allowlist) ? b.provider_allowlist : null

    const { data, error } = await supabase
      .from('feature_flags')
      .upsert(row, { onConflict: 'key' })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ flag: data })
  }

  if (req.method === 'DELETE') {
    if (!auth.provider?.is_admin) return res.status(403).json({ error: 'Admin role required' })
    const { key } = req.query || {}
    if (!key) return res.status(400).json({ error: 'key query param required' })
    const { error } = await supabase.from('feature_flags').delete().eq('key', String(key))
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
