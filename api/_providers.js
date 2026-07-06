// GET/PATCH /api/providers — provider-side reads and admin updates on the
// providers table. Runs with service_role, requires an authenticated provider
// (guardProvider). Login flow uses the separate /api/provider-auth endpoint —
// this one is for staff-facing management.
//
// GET   /api/providers                        → active providers, ordered by first_name
// GET   /api/providers?filter=active-full     → wider column projection
// GET   /api/providers?id=<uuid>&columns=…    → single row, optional column projection
// PATCH /api/providers?id=<uuid>              → admin-only update, column allowlist

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Columns admin can PATCH on a provider row. Deliberately excluded: id, email
// (identity — change via a dedicated flow), pin_hash / password columns
// (change via /api/change-password), created_at.
const UPDATE_ALLOWLIST = new Set([
  'first_name', 'last_name', 'credential', 'specialty', 'color',
  'is_active', 'is_admin', 'is_provider', 'is_supervisor', 'is_available',
  'availability_message',
  'can_prescribe', 'can_refer', 'can_acc',
  'prescriber_number', 'cpn',
])

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return

  const supabase = admin()

  if (req.method === 'GET') {
    const { id, filter, columns } = req.query || {}

    if (id) {
      const cols = columns
        ? String(columns).split(',').map(c => c.trim()).filter(Boolean).join(', ')
        : '*'
      const { data, error } = await supabase.from('providers').select(cols).eq('id', id).maybeSingle()
      if (error) return res.status(500).json({ error: error.message })
      if (!data)  return res.status(404).json({ error: 'Provider not found' })
      return res.status(200).json({ provider: data })
    }

    if (filter === 'active-full') {
      const { data, error } = await supabase
        .from('providers')
        .select('id, first_name, last_name, credential, specialty, color, is_active, is_available, is_provider, is_admin, is_supervisor, can_prescribe, can_refer, can_acc, prescriber_number, cpn, availability_message')
        .eq('is_active', true)
        .order('first_name')
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ providers: data || [] })
    }

    // Default: modest projection, only active + is_provider rows.
    const { data, error } = await supabase
      .from('providers')
      .select('id, first_name, last_name, credential, specialty, color, is_active, is_admin, is_provider, is_available, availability_message')
      .order('first_name')
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ providers: data || [] })
  }

  if (req.method === 'PATCH') {
    if (!auth.provider?.is_admin) {
      return res.status(403).json({ error: 'Admin role required to update providers' })
    }
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id query param required' })

    const raw = req.body || {}
    const patch = {}
    for (const [k, v] of Object.entries(raw)) {
      if (UPDATE_ALLOWLIST.has(k)) patch[k] = v
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No allowed columns in patch' })
    }
    patch.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('providers')
      .update(patch)
      .eq('id', id)
      .select()
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ provider: data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
