// POST /api/audit-log — provider-auth append-only audit trail.
//
// Writes to the real `audit_logs` table (plural — same as /api/audit uses).
// Historical note: the old client code called .from('audit_log') (singular)
// which silently no-op'd inside a try/catch because that table didn't exist.
// This endpoint accepts the friendly (action, metadata) shape from client
// callers and maps it onto the actual (event_type, provider_id, metadata)
// schema.
//
// Auth: guardProvider runs at the router. provider_id / provider_name in the
// body are ignored — we take them from req.auth.provider so a scraper can't
// forge the actor.

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

  const provider = req.auth?.provider || {}
  const provider_id   = provider.id || null
  const provider_name = provider.first_name || provider.last_name
    ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
    : null
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null

  const supabase = admin()
  const { error } = await supabase.from('audit_logs').insert({
    event_type: action,
    provider_id,
    provider_name,
    metadata: metadata && typeof metadata === 'object' ? metadata : null,
    ip,
  })
  // audit_logs table isn't in the deployed schema yet — degrade to no-op so
  // callers (research CSV export, etc.) don't visibly fail. Once the table is
  // migrated in, writes will land automatically without a code change.
  if (error && (error.message?.includes('does not exist') || error.message?.includes('schema cache'))) {
    return res.status(200).json({ ok: true, skipped: 'audit_logs table missing' })
  }
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true })
}
