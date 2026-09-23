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
import { getClientIp } from './_client-ip.js'

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

// UUID v1-v5 shape. consultation_id is typed UUID in Postgres, so anything
// else round-trips as 22P02 and blows up the audit_log_write_failed alert.
// Blacklock IDOR probes hit this dozens of times per scan.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
  // Validate UUID shape up front — Postgres 22P02 on malformed UUIDs otherwise
  // trips the audit_log_write_failed critical alert on every IDOR probe.
  // If a caller passes a garbage consultation_id, drop it (preserving the
  // attempted value in metadata for forensics) instead of failing the write.
  let safeConsultationId = null
  let invalidConsultationId = null
  if (consultation_id != null) {
    if (typeof consultation_id === 'string' && UUID_RE.test(consultation_id)) {
      safeConsultationId = consultation_id
    } else {
      invalidConsultationId = String(consultation_id).slice(0, 128)
    }
  }
  let safeResourceId = null
  if (resource_id != null) {
    // resource_id is TEXT in the schema so anything serialises, but cap
    // length to keep the row bounded.
    safeResourceId = String(resource_id).slice(0, 128)
  }

  const provider = req.auth?.provider || {}
  const provider_id   = provider.id || null
  const provider_name = provider.first_name || provider.last_name
    ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
    : null
  const provider_role = roleSnapshot(provider)
  const ip = getClientIp(req)
  const user_agent = req.headers['user-agent'] || null

  const mergedMetadata = metadata && typeof metadata === 'object' ? { ...metadata } : {}
  if (invalidConsultationId) mergedMetadata.invalid_consultation_id = invalidConsultationId

  const supabase = admin()
  const { error } = await supabase.from('audit_logs').insert({
    event_type: action,
    provider_id,
    provider_name,
    provider_role,
    consultation_id: safeConsultationId,
    patient_ref: patient_ref || null,
    resource_type: resource_type || null,
    resource_id: safeResourceId,
    reason: reason || null,
    reason_notes: reason_notes || null,
    metadata: Object.keys(mergedMetadata).length ? mergedMetadata : null,
    ip,
    user_agent,
  })

  // Degrade gracefully if the migration hasn't been applied yet.
  if (error && (error.message?.includes('does not exist') || error.message?.includes('schema cache'))) {
    return res.status(200).json({ ok: true, skipped: 'audit_logs table missing' })
  }
  if (error) {
    console.error('[audit-log] error failed:', error)
    // Integrity signal: an audit-log write failure could indicate an attacker
    // trying to prevent audit-trail creation. Raise a critical alert so we
    // notice even if the primary op silently 500s.
    import('./_security-alert.js').then(({ raiseSecurityAlert }) => {
      raiseSecurityAlert(req, {
        eventType: 'audit_log_write_failed',
        severity:  'alert',
        critical:  true,
        summary:   `audit_logs write failed for ${action}`,
        metadata:  { action, error: error.message, resource_type: resource_type || null, consultation_id: consultation_id || null },
      }).catch(() => {})
    }).catch(() => {})
    return res.status(500).json({ error: 'Server error' })
  }
  return res.status(200).json({ ok: true })
}
