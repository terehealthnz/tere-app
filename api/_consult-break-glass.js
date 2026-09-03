// /api/consult-break-glass — logs a break-glass access grant for an off-queue
// consultation (task #414). Records reason + reason_notes; server-side
// consultations GET checks for a recent entry to allow the chart to load.
//
// POST { consultationId, reason, reasonNotes }
//   → 200 { ok: true, granted_at }
//   → 400 if bad input
//
// The unlock lasts 60 minutes per (provider, consult) via audit_logs lookup.

import { createClient } from '@supabase/supabase-js'
import { getClientIp } from './_client-ip.js'
import { raiseSecurityAlert } from './_security-alert.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
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

function roleSnapshot(p) {
  if (!p) return null
  if (p.is_billing_admin) return 'billing_admin'
  if (p.is_supervisor)    return 'supervisor'
  if (p.is_admin)         return 'admin'
  if (p.is_provider)      return 'provider'
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const provider = req.auth?.provider
  if (!provider) return res.status(401).json({ error: 'Provider auth required' })

  const { consultationId, reason, reasonNotes } = req.body || {}
  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })
  if (!reason || !ALLOWED_REASONS.has(String(reason))) {
    return res.status(400).json({ error: `reason required, one of: ${[...ALLOWED_REASONS].join(', ')}` })
  }
  const notes = String(reasonNotes || '').trim()
  if (notes.length < 20) {
    return res.status(400).json({ error: 'reasonNotes required (≥ 20 chars — this goes in the audit trail)' })
  }

  const supabase = admin()

  // Fetch the target consult for context in the audit row + alert body.
  const { data: consult } = await supabase.from('consultations')
    .select('id, patient_nhi, patient_first_name, patient_last_name, status, created_at')
    .eq('id', consultationId).maybeSingle()
  if (!consult) return res.status(404).json({ error: 'Consultation not found' })

  const providerName = `${provider.first_name || ''} ${provider.last_name || ''}`.trim() || null
  const patientName = [consult.patient_first_name, consult.patient_last_name].filter(Boolean).join(' ') || null

  await supabase.from('audit_logs').insert({
    event_type:      'consult_break_glass_access',
    provider_id:     provider.id,
    provider_name:   providerName,
    provider_role:   roleSnapshot(provider),
    consultation_id: consultationId,
    patient_ref:     consult.patient_nhi || null,
    resource_type:   'consultation',
    resource_id:     consultationId,
    reason:          String(reason),
    reason_notes:    notes.slice(0, 2000),
    metadata:        { consult_status: consult.status, consult_created: consult.created_at, patient_name: patientName },
    ip:              getClientIp(req),
    user_agent:      req.headers['user-agent']?.slice(0, 400) || null,
  })

  // Fire a warn-severity security event so admin sees off-queue access at
  // scale (nightly cron picks up a spike). Not critical — this IS the
  // legitimate pathway — but the volume is worth tracking.
  raiseSecurityAlert(req, {
    eventType: 'consult_break_glass_access',
    severity:  'warn',
    summary:   `${providerName || 'Provider'} opened off-queue chart for ${patientName || consult.patient_nhi || 'patient'}`,
    metadata:  { consultation_id: consultationId, reason, consult_status: consult.status },
  }).catch(() => {})

  return res.status(200).json({ ok: true, granted_at: new Date().toISOString() })
}
