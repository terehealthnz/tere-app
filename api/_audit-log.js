// POST /api/audit-log — provider-auth append-only audit trail.
//
// Client writes to the `audit_log` table (singular; separate from `audit_logs`
// which is a different table with different columns — see _audit.js). The
// singular table has (action, actor_id, metadata, created_at) and is used for
// admin actions like research data export.
//
// Auth: guardProvider runs at the router. actor_id in the body is discarded;
// we take it from req.auth so a scraper can't forge who took the action.
// action + metadata are echoed through (metadata is a jsonb blob).

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action, metadata } = req.body || {}
  if (!action || typeof action !== 'string') {
    return res.status(400).json({ error: 'action (string) required' })
  }

  const actor_id = req.auth?.provider?.id || null

  const supabase = admin()
  const { error } = await supabase.from('audit_log').insert({
    action,
    actor_id,
    metadata: metadata && typeof metadata === 'object' ? metadata : null,
  })
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true })
}
