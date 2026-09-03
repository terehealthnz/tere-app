// GET /api/acc-audit-bundle?claim_id=X or ?claim_number=X
//
// Assembles the full evidence dossier for a single ACC claim so an admin
// can hand it to an ACC auditor as a single deliverable. Includes: claim
// row, consultation, patient identity, provider identity, injury coding,
// consent record, status timeline (converted → submitted → invoiced →
// paid/declined with ISO timestamps), ACC's raw responses, linked
// prescriptions + radiology referrals, and every audit_logs row that
// touched this claim or its consultation.
//
// Auth: admin, billing_admin, or supervisor (regular provider cannot pull
// audit bundles — they see their own claims via /api/acc-claims but the
// full evidence dossier is admin-side). The access itself is audit-logged
// with the supplied reason.
//
// ?format=pdf returns a PDF via buildAccAuditBundlePdf (deferred import).

import { createClient } from '@supabase/supabase-js'
import { getClientIp } from './_client-ip.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
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

// Timeline entries in ascending order. Skips null timestamps.
function buildTimeline(claim, consult) {
  const rows = []
  const push = (at, event, detail) => { if (at) rows.push({ at, event, detail }) }
  push(consult?.acc_converted_at,    'converted_to_acc',   `Provider converted consult to ACC (${consult?.acc_read_code || '—'} · ${consult?.acc_body_part || '—'})`)
  push(consult?.acc_consent_obtained_at, 'consent_obtained', 'Provider attested patient consent to ACC billing')
  push(claim?.submitted_at,          'claim_submitted',    `Claim ${claim.claim_number} submitted (${claim.service_code}, $${((claim.amount_claimed || 0) / 100).toFixed(2)})`)
  push(claim?.invoice_submitted_at,  'invoice_emailed',    `Invoice ${claim.invoice_number || claim.claim_number} emailed to providerinvoices@acc.co.nz`)
  push(claim?.paid_at,               'paid',               `ACC paid $${((claim.amount_paid || 0) / 100).toFixed(2)}`)
  if (claim?.status === 'declined' && claim.decline_reason) {
    push(claim.raw_response?.decline_at || claim.submitted_at, 'declined', claim.decline_reason)
  }
  return rows.sort((a, b) => new Date(a.at) - new Date(b.at))
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const provider = req.auth?.provider
  const role = roleSnapshot(provider)
  if (!['admin', 'billing_admin', 'supervisor'].includes(role)) {
    return res.status(403).json({ error: 'Admin, billing_admin, or supervisor role required' })
  }

  const { claim_id, claim_number, format, reason, reason_notes } = req.query || {}
  if (!claim_id && !claim_number) {
    return res.status(400).json({ error: 'claim_id or claim_number required' })
  }
  if (!reason || !ALLOWED_REASONS.has(String(reason))) {
    return res.status(400).json({ error: `reason required (one of: ${[...ALLOWED_REASONS].join(', ')})` })
  }

  const supabase = admin()

  // ── Fetch claim ─────────────────────────────────────────────────────────────
  let claimQ = supabase.from('acc_claims').select('*')
  claimQ = claim_id ? claimQ.eq('id', claim_id) : claimQ.eq('claim_number', claim_number)
  const { data: claim, error: claimErr } = await claimQ.maybeSingle()
  if (claimErr) { console.error('[acc-audit-bundle] claim:', claimErr); return res.status(500).json({ error: 'Server error' }) }
  if (!claim) return res.status(404).json({ error: 'Claim not found' })

  // ── Fetch consultation ──────────────────────────────────────────────────────
  let consult = null
  if (claim.consultation_id) {
    const { data } = await supabase.from('consultations').select('*').eq('id', claim.consultation_id).maybeSingle()
    consult = data || null
  }

  // ── Fetch patient (best-effort) ─────────────────────────────────────────────
  let patient = null
  if (consult?.patient_nhi) {
    const { data } = await supabase.from('patients').select('id, first_name, last_name, dob, nhi, phone, email, address').eq('nhi', consult.patient_nhi).maybeSingle()
    patient = data || null
  }

  // ── Fetch provider (as recorded on the claim) ───────────────────────────────
  let providerRec = null
  if (claim.provider_id) {
    const { data } = await supabase.from('providers').select('id, first_name, last_name, email, hpi_number, acc_provider_number, provider_type').eq('id', claim.provider_id).maybeSingle()
    providerRec = data || null
  }

  // ── Fetch linked prescriptions ──────────────────────────────────────────────
  let prescriptions = []
  if (claim.consultation_id) {
    const { data } = await supabase.from('prescriptions').select('id, drug_name, strength, dose_instructions, quantity, refills, controlled, status, created_at').eq('consultation_id', claim.consultation_id).order('created_at')
    prescriptions = data || []
  }

  // ── Fetch linked radiology referrals ────────────────────────────────────────
  let radiologyReferrals = []
  if (claim.consultation_id) {
    const { data } = await supabase.from('radiology_referrals').select('id, modality, region, urgency, clinical_details, status, created_at').eq('consultation_id', claim.consultation_id).order('created_at')
    radiologyReferrals = data || []
  }

  // ── Fetch audit_logs rows touching this claim or its consultation ───────────
  let auditRows = []
  {
    // Two-shot: (resource_type='acc_claims' AND resource_id=claim.id)
    //        ∪ (consultation_id=claim.consultation_id)
    const results = await Promise.all([
      supabase.from('audit_logs').select('created_at, event_type, provider_name, provider_role, reason, reason_notes, ip').eq('resource_type', 'acc_claims').eq('resource_id', claim.id),
      claim.consultation_id
        ? supabase.from('audit_logs').select('created_at, event_type, provider_name, provider_role, reason, reason_notes, ip').eq('consultation_id', claim.consultation_id).limit(200)
        : Promise.resolve({ data: [] }),
    ])
    const seen = new Set()
    for (const { data } of results) {
      for (const row of (data || [])) {
        const k = `${row.created_at}|${row.event_type}|${row.provider_name}`
        if (seen.has(k)) continue
        seen.add(k)
        auditRows.push(row)
      }
    }
    auditRows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }

  // ── Record this access in the audit log ─────────────────────────────────────
  try {
    await supabase.from('audit_logs').insert({
      event_type:      'acc_audit_bundle_export',
      provider_id:     provider.id,
      provider_name:   `${provider.first_name || ''} ${provider.last_name || ''}`.trim() || null,
      provider_role:   role,
      consultation_id: claim.consultation_id || null,
      patient_ref:     claim.patient_nhi || null,
      resource_type:   'acc_claims',
      resource_id:     claim.id,
      reason:          String(reason),
      reason_notes:    reason_notes ? String(reason_notes).slice(0, 500) : null,
      metadata:        { claim_number: claim.claim_number, format: format === 'pdf' ? 'pdf' : 'json' },
      ip:              getClientIp(req),
      user_agent:      req.headers['user-agent'] || null,
    })
  } catch (e) {
    console.error('[acc-audit-bundle] audit write failed:', e.message)
  }

  const bundle = {
    generated_at:   new Date().toISOString(),
    generated_by:   { id: provider.id, name: `${provider.first_name || ''} ${provider.last_name || ''}`.trim(), role },
    reason:         String(reason),
    reason_notes:   reason_notes || null,
    claim:          claim,
    consultation:   consult ? {
      id: consult.id,
      created_at: consult.created_at,
      completed_at: consult.completed_at,
      consultation_type: consult.consultation_type,
      chief_complaint: consult.chief_complaint,
      acc_eligible: consult.acc_eligible,
      acc_injury_date: consult.acc_injury_date,
      acc_injury_details: consult.acc_injury_details,
      acc_body_part: consult.acc_body_part,
      acc_read_code: consult.acc_read_code,
      acc_employer: consult.acc_employer,
      acc_converted_at: consult.acc_converted_at,
      acc_converted_by: consult.acc_converted_by,
      acc_consent_obtained_at: consult.acc_consent_obtained_at,
      acc_consent_by_provider_id: consult.acc_consent_by_provider_id,
      clinical_notes: consult.clinical_notes,
      doctor_notes: consult.doctor_notes,
      admin_notes: consult.admin_notes,
    } : null,
    patient:        patient,
    provider:       providerRec,
    timeline:       buildTimeline(claim, consult),
    prescriptions:  prescriptions,
    radiology_referrals: radiologyReferrals,
    audit_trail:    auditRows,
  }

  if (format === 'pdf') {
    try {
      const { buildAccAuditBundlePdf } = await import('./_pdf-builders.js')
      const pdf = await buildAccAuditBundlePdf(bundle)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="acc-audit-${claim.claim_number || claim.id}.pdf"`)
      return res.status(200).send(pdf)
    } catch (e) {
      console.error('[acc-audit-bundle] pdf failed:', e)
      return res.status(500).json({ error: 'PDF generation failed', detail: e.message })
    }
  }

  return res.status(200).json({ bundle })
}
