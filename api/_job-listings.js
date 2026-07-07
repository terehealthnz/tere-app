// /api/job-listings — job listing CRUD.
//
// GET is public (careers page displays active listings). Everything else is
// admin-only — job_listings drives the /careers page so an unrestricted write
// would let anyone post fake listings on the public site.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const WRITE_ALLOWLIST = new Set([
  'title', 'location', 'employment_type',
  'short_description', 'full_description',
  'requirements', 'is_active',
])

function projectPayload(raw) {
  const patch = {}
  for (const [k, v] of Object.entries(raw || {})) {
    if (WRITE_ALLOWLIST.has(k)) patch[k] = v
  }
  return patch
}

export default async function handler(req, res) {
  const supabase = admin()

  // GET is public — /careers page and /careers/apply?job=<id> read this anon.
  // Writes require admin, checked inline below.
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('job_listings')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ listings: data || [] })
  }

  // Writes: authenticate as provider inline (not in AUTH_REQUIRED_ROUTES since
  // GET is public), then require admin.
  const auth = await guardProvider(req, res)
  if (!auth) return
  if (!auth.provider?.is_admin) return res.status(403).json({ error: 'Admin required' })

  if (req.method === 'POST') {
    const payload = projectPayload(req.body)
    if (!payload.title) return res.status(400).json({ error: 'title required' })
    const { data, error } = await supabase
      .from('job_listings')
      .insert(payload)
      .select()
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ listing: data })
  }

  if (req.method === 'PATCH') {
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id query param required' })
    const patch = projectPayload(req.body)
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No allowed columns in patch' })
    }
    const { error } = await supabase
      .from('job_listings')
      .update(patch)
      .eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id query param required' })
    const { error } = await supabase
      .from('job_listings')
      .delete()
      .eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
