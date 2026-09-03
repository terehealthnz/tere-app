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
import { checkElevation } from './_elevation.js'
import { checkAccessBudget } from './_access-budget.js'

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

  // JIT elevation gate — ACC bundle export is the most sensitive read in the
  // system. Fresh MFA required (< 5 min old) even inside an active session.
  const elev = await checkElevation(req, { required: true })
  if (!elev.ok) return res.status(elev.status).json({ error: elev.error, requires_elevation: true })

  // Daily export budget — block at limit.
  const budget = await checkAccessBudget(provider.id, 'export')
  if (budget.status === 'block') {
    return res.status(429).json({ error: `Daily export limit reached (${budget.used}/${budget.limit}). Ask an admin to lift your override or wait until tomorrow.`, budget })
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

  // ── Related consults on same claim (claim history stitch, task #344) ────────
  // ACC audits typically ask for the full treatment episode, not just the
  // consult that filed the claim. Find sibling consults linked by claim_number
  // OR same patient + same injury date (fallback when NZ CN not yet propagated).
  let relatedConsults = []
  if (claim.claim_number) {
    const { data } = await supabase.from('consultations')
      .select('id, created_at, consultation_type, chief_complaint, acc_injury_date, acc_read_code, acc_body_part, doctor_notes, admin_notes, clinical_notes')
      .eq('acc_claim_number', claim.claim_number)
      .order('created_at')
    relatedConsults = (data || []).filter(row => row.id !== claim.consultation_id)
  }
  if (!relatedConsults.length && consult?.patient_nhi && consult?.acc_injury_date) {
    const { data } = await supabase.from('consultations')
      .select('id, created_at, consultation_type, chief_complaint, acc_injury_date, acc_read_code, acc_body_part, doctor_notes, admin_notes, clinical_notes')
      .eq('patient_nhi', consult.patient_nhi)
      .eq('acc_injury_date', consult.acc_injury_date)
      .order('created_at')
    relatedConsults = (data || []).filter(row => row.id !== claim.consultation_id)
  }

  // ── Outcome measures across the whole claim (task #345) ─────────────────────
  let outcomeMeasures = []
  if (claim.claim_number) {
    const { data } = await supabase.from('consultation_outcome_measures')
      .select('*').eq('claim_number', claim.claim_number).order('recorded_at')
    outcomeMeasures = data || []
  }
  if (!outcomeMeasures.length && claim.consultation_id) {
    const consultIds = [claim.consultation_id, ...relatedConsults.map(c => c.id)]
    const { data } = await supabase.from('consultation_outcome_measures')
      .select('*').in('consultation_id', consultIds).order('recorded_at')
    outcomeMeasures = data || []
  }

  // ── Case-manager comms for this claim (task #347) ───────────────────────────
  let communications = []
  {
    const { data } = await supabase.from('acc_communications')
      .select('*')
      .or(`claim_id.eq.${claim.id}${claim.claim_number ? `,claim_number.eq.${claim.claim_number}` : ''}`)
      .order('occurred_at', { ascending: false })
    communications = data || []
  }

  // ── Peer review of the primary consult (task #348) ──────────────────────────
  let peerReviews = []
  if (claim.consultation_id) {
    const consultIds = [claim.consultation_id, ...relatedConsults.map(c => c.id)]
    const { data } = await supabase.from('consultation_peer_reviews')
      .select('*').in('consultation_id', consultIds).order('reviewed_at', { ascending: false })
    peerReviews = data || []
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

  // ── Bulk-export detection (task #359) ───────────────────────────────────────
  // If this provider has already exported >10 bundles in the last hour,
  // raise a real-time alert — high volume of full-record exports is a
  // classic exfiltration pattern.
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await supabase.from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', provider.id)
      .in('event_type', ['acc_audit_bundle_export', 'patient_record_export'])
      .gte('created_at', oneHourAgo)
    if ((count || 0) >= 10) {
      import('./_security-alert.js').then(({ raiseSecurityAlert }) => {
        raiseSecurityAlert(req, {
          eventType: 'bulk_export_threshold',
          severity:  'alert',
          critical:  true,
          summary:   `Provider ${provider.first_name || ''} ${provider.last_name || ''}`.trim() +
                     ` exported ${(count || 0) + 1} records/bundles in the last hour`,
          metadata:  { provider_id: provider.id, export_count_1h: (count || 0) + 1 },
        }).catch(() => {})
      }).catch(() => {})
    }
  } catch { /* best-effort */ }

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

  // ── Financials + time-in-care rollup (tasks #366, #367) ────────────────────
  // Cost dashboard: aggregate every claim on the same claim_number to show
  // total billed vs paid and days-outstanding.
  let claimSet = [claim]
  if (claim.claim_number) {
    const { data } = await supabase.from('acc_claims').select('*').eq('claim_number', claim.claim_number)
    if (data?.length) claimSet = data
  }
  const totalBilledCents = claimSet.reduce((a, c) => a + (c.amount_claimed || 0), 0)
  const totalPaidCents   = claimSet.reduce((a, c) => a + (c.amount_paid    || 0), 0)
  const earliestSubmitted = claimSet.map(c => c.submitted_at).filter(Boolean).sort()[0] || null
  const daysOutstanding  = earliestSubmitted && totalPaidCents < totalBilledCents
    ? Math.floor((Date.now() - new Date(earliestSubmitted).getTime()) / (24 * 60 * 60 * 1000))
    : null
  const financials = {
    claims_on_episode:   claimSet.length,
    total_billed_cents:  totalBilledCents,
    total_paid_cents:    totalPaidCents,
    delta_cents:         totalBilledCents - totalPaidCents,
    days_outstanding:    daysOutstanding,
  }

  // Time-in-care: from first consult on this claim (or acc_converted_at) to
  // discharge_summary.discharge_date (or now if not discharged).
  const consultDates = [
    consult?.acc_converted_at,
    consult?.created_at,
    ...relatedConsults.map(c => c.created_at),
  ].filter(Boolean).map(d => new Date(d).getTime())
  const dischargeDate = consult?.discharge_summary?.discharge_date
    ? new Date(consult.discharge_summary.discharge_date).getTime()
    : null
  const timeInCare = consultDates.length ? {
    episode_start:   new Date(Math.min(...consultDates)).toISOString(),
    episode_end:     dischargeDate ? new Date(dischargeDate).toISOString() : null,
    days_in_care:    Math.floor(((dischargeDate || Date.now()) - Math.min(...consultDates)) / (24 * 60 * 60 * 1000)),
    is_discharged:   !!dischargeDate,
  } : null

  const bundle = {
    generated_at:   new Date().toISOString(),
    generated_by:   { id: provider.id, name: `${provider.first_name || ''} ${provider.last_name || ''}`.trim(), role },
    reason:         String(reason),
    reason_notes:   reason_notes || null,
    financials:     financials,
    time_in_care:   timeInCare,
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
      rehab_plan: consult.rehab_plan,
      discharge_summary: consult.discharge_summary,
      rtw_status: consult.rtw_status,
    } : null,
    patient:        patient,
    provider:       providerRec,
    timeline:       buildTimeline(claim, consult),
    prescriptions:  prescriptions,
    radiology_referrals: radiologyReferrals,
    related_consults:    relatedConsults,
    outcome_measures:    outcomeMeasures,
    communications:      communications,
    peer_reviews:        peerReviews,
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
