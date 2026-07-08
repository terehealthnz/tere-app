// POST /api/audit-log — provider-auth append-only PHI-access audit trail.
//
// Callers pass a friendly (action, reason, consultation_id, metadata) shape and
// this handler maps it onto the audit_logs schema, snapshotting the actor's
// role at the time of the access (admin / billing_admin / provider / supervisor).
//
// Auth: guardProvider runs at the router. actor identity is sourced from
// req.auth.provider — clients cannot forge it.
//
// This endpoint is the *write* half of PHI access logging. It is called by
// the PhiRevealGate component the moment an admin reveals clinical detail.

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function roleSnapshot(provider) {
  if (!provider) return null
  if (provider.is_billing_admin) return 'billing_admin'
  if (provider.is_supervisor) return 'supervisor'
  if (provider.is_admin) return 'admin'
  if (provider.is_provider) return 'provider'
  return null
}

const ALLOWED_REASONS = new Set([
  'billing_dispute',
  'complaint_investigation',
  'quality_audit',
  'support_ticket_response',
  'patient_request',
  'clinical_care',
  'other',
])

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    action, reason, reason_notes, consultation_id, resource_type, resource_id,
    patient_ref, metadata,
  } = req.body || {}

  if (!action || typeof action !== 'string') {
    return res.status(400).json({ error: 'action (string) required' })
  }
  if (reason && !ALLOWED_REASONS.has(reason)) {
    return res.status(400).json({ error: `reason "${reason}" not in allowlist` })
  }

  const provider = req.auth?.provider || {}
  const provider_id   = provider.id || null
  const provider_name = provider.first_name || provider.last_name
    ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
    : null
  const provider_role = roleSnapshot(provider)
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null
  const user_agent = req.headers['user-agent'] || null

  const supabase = admin()
  const { error } = await supabase.from('audit_logs').insert({
    event_type: action,
    provider_id,
    provider_name,
    provider_role,
    consultation_id: consultation_id || null,
    patient_ref: patient_ref || null,
    resource_type: resource_type || null,
    resource_id: resource_id || null,
    reason: reason || null,
    reason_notes: reason_notes || null,
    metadata: metadata && typeof metadata === 'object' ? metadata : null,
    ip,
    user_agent,
  })

  // Degrade gracefully if the migration hasn't been applied yet.
  if (error && (error.message?.includes('does not exist') || error.message?.includes('schema cache'))) {
    return res.status(200).json({ ok: true, skipped: 'audit_logs table missing' })
  }
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true })
}
