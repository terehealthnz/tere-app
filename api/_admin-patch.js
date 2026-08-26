// POST /api/admin-patch — service-role update for validation_readings /
// validation_subjects tables.
//
// Auth: TERE_API_KEY header (legacy path — pre-dates the guardProvider
// migration). Kept because the validation dashboard uses a shared PIN
// for the interface and the write path is table-allowlisted server-side.
// Every write is now audit_logs-tracked (pen test 2026-08-23 M-6).

import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = req.headers['x-tere-api-key'] || req.body?.apiKey
  if (auth !== process.env.TERE_API_KEY) return res.status(401).json({ error: 'Unauthorized' })

  const { table, id, patch, reason } = req.body
  if (!table || !id || !patch) return res.status(400).json({ error: 'Missing table, id, or patch' })

  // Allowlist — only permit patching validation tables
  const allowed = ['validation_readings', 'validation_subjects']
  if (!allowed.includes(table)) return res.status(403).json({ error: 'Table not permitted' })

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  // Snapshot the pre-state for audit — we want to record what changed, not
  // just that a change happened. Best-effort; a fetch failure doesn't block
  // the write.
  let before = null
  try {
    const { data } = await supabase.from(table).select('*').eq('id', id).maybeSingle()
    before = data
  } catch {}

  const { data, error } = await supabase.from(table).update(patch).eq('id', id).select()
  if (error) { console.error('[admin-patch] error failed:', error); return res.status(500).json({ error: 'Server error' }) }

  // Audit trail. Fire-and-forget — a logging failure never rolls back the
  // update itself. Uses the same audit_logs table as clinical PHI access.
  try {
    const diff = {}
    if (before) {
      for (const [k, v] of Object.entries(patch)) {
        diff[k] = { from: before[k] ?? null, to: v }
      }
    }
    await supabase.from('audit_logs').insert({
      event_type:    'admin_patch',
      provider_id:   null,
      provider_name: 'admin (TERE_API_KEY)',
      provider_role: 'admin',
      resource_type: table,
      resource_id:   String(id),
      reason:        reason || 'other',
      reason_notes:  reason ? null : 'admin-patch called without reason (legacy TERE_API_KEY path)',
      metadata:      { patch, diff },
      ip:            req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null,
      user_agent:    req.headers['user-agent'] || null,
    })
  } catch (e) {
    console.error('[admin-patch] audit_logs write failed:', e?.message || e)
  }

  return res.status(200).json({ ok: true, data })
}
