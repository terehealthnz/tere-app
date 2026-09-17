// GET /api/provider-sessions — admin listing of provider login sessions.
//
// Query params:
//   ?active=1              — only sessions where ended_at IS NULL
//   ?provider_id=<uuid>    — scope to one provider
//   ?limit=<n>             — default 100, max 500
//   ?from=<iso>&to=<iso>   — filter by started_at
//
// Admin-only (via guardProvider auth arg). Rows are joined to the
// providers table for display name.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const auth = await guardProvider(req, res)
  if (!auth) return
  if (!auth.provider.is_admin) return res.status(403).json({ error: 'Admin only' })

  const q = req.query || {}
  const activeOnly = q.active === '1' || q.active === 'true'
  const providerId = q.provider_id || null
  const from = q.from || null
  const to   = q.to || null
  const limit = Math.min(500, Math.max(1, Number(q.limit) || 100))

  let query = admin()
    .from('provider_sessions')
    .select(`
      id, provider_id, started_at, ended_at, end_reason, ip, user_agent,
      mfa_used, last_seen_at,
      providers ( id, first_name, last_name, email, is_admin, is_supervisor )
    `)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (activeOnly) query = query.is('ended_at', null)
  if (providerId) query = query.eq('provider_id', providerId)
  if (from) query = query.gte('started_at', from)
  if (to)   query = query.lte('started_at', to)

  const { data, error } = await query
  if (error) {
    console.error('[provider-sessions] query failed:', error.message)
    return res.status(500).json({ error: 'Query failed' })
  }
  return res.status(200).json({ sessions: data || [] })
}
