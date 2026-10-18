import { createClient } from '@supabase/supabase-js'
// buildAccInvoicePdf and recordDisclosure moved to /api/_acc-claim-invoice.js
// (admin-only on-demand invoice download + mark-lodged). Autosend removed
// 2026-10-18 — see note on handler.

const ACC_BASE_URL = process.env.ACC_SANDBOX === 'false'
  ? 'https://apiservices.acc.co.nz'
  : 'https://apiservicesnpe.acc.co.nz'

function supabaseAdmin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// ACC specialist telehealth service codes (effective 1 June 2024):
//   MST1 — initial specialist telehealth consultation — $96.38 incl. GST
//   MST3 — follow-up specialist telehealth consultation — $48.20 incl. GST
// Both Patrick Herling and Rachel Thomas are MCNZ-registered specialists
// (Emergency Medicine) and qualify for these rates. Confirm registration
// with ACC's Provider Registration team before first real claim.
//
// Async message consults are not currently ACC-billable — no service code.
function getServiceCode(consultationType, isFollowup) {
  if (consultationType === 'message') {
    return process.env.ACC_SERVICE_CODE_MESSAGE || null
  }
  return isFollowup
    ? (process.env.ACC_SERVICE_CODE_FOLLOWUP || 'MST3')
    : (process.env.ACC_SERVICE_CODE_INITIAL  || 'MST1')
}

function getACCRateCents(consultationType, isFollowup) {
  if (consultationType === 'message') {
    return parseInt(process.env.ACC_RATE_MESSAGE_CENTS || '0')
  }
  return isFollowup
    ? parseInt(process.env.ACC_RATE_FOLLOWUP_CENTS || '4820')  // MST3
    : parseInt(process.env.ACC_RATE_INITIAL_CENTS  || '9638')  // MST1
}

async function submitToACC(claimPayload) {
  // Retained for future eBusiness / PMS-integrated pathway. Not called from
  // the default flow today — ACC does not expose a REST API for direct
  // claim submission (per Megan Trezise 2026-08-17). The realistic
  // channels are ProviderHub (manual web portal), PMS-integrated
  // eBusiness (HL7 EDI), or emailed invoices to providerinvoices@acc.co.nz.
  // We now use the email path (see emailAccInvoice below).
  const response = await fetch(`${ACC_BASE_URL}/api/v2/claims`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.ACC_API_KEY}`,
      'X-Vendor-ID': process.env.ACC_VENDOR_ID,
    },
    body: JSON.stringify(claimPayload),
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.message || `ACC API error ${response.status}`)
  }
  return data
}

// Sandbox-only placeholder claim number. ONLY used when the consult is
// is_practice=true (demo seats, training). For prod rows the invoice MUST
// carry the real ACC claim number the patient was issued — otherwise
// Provider Invoices bounces it with "not a registered ACC claim number"
// (2026-10-18 incident).
function generateSandboxClaimNumber() {
  return `TEST${Date.now().toString().slice(-8)}`
}

// NOTE (2026-10-18): emailAccInvoice() has been removed. Prior behaviour
// was to attach the ACC invoice PDF and email it to providerinvoices@acc.co.nz
// behind ACC_AUTOSEND_INVOICES=true. The 2026-10-18 incident (TEST13697845
// bounced by ACC Provider Invoices because the claim number was auto-generated
// placeholder) established that we never want automatic ACC sends from the
// lodgement path. Admin reviews each ACC conversion in Admin > ACC, downloads
// the invoice PDF on demand, lodges manually via ProviderHub, then stamps
// invoice_submitted_at via /api/acc-claim-invoice action=mark_lodged.

export default async function handler(req, res) {
  const supabase = supabaseAdmin()

  // GET list — ProviderApp.jsx earnings/analytics panel. Provider auth via
  // AUTH_REQUIRED_ROUTES at the router; no PHI leak concern since routes
  // grouping already gates the caller.
  if (req.method === 'GET') {
    const { limit: rawLimit, provider_id, status } = req.query || {}
    const lim = Math.max(1, Math.min(500, parseInt(rawLimit) || 50))
    let q = supabase.from('acc_claims').select('*').order('created_at', { ascending: false }).limit(lim)
    if (provider_id) q = q.eq('provider_id', provider_id)
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    if (error) { console.error('[acc-claims] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ claims: data || [] })
  }

  if (req.method !== 'POST') return res.status(405).end()

  const { consultationId, providerId, providerHpi, providerMcnz: providerMcnzIn, providerName, providerType } = req.body
  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

  try {
    // Fetch full consultation
    const { data: consult, error: cErr } = await supabase
      .from('consultations')
      .select('*')
      .eq('id', consultationId)
      .single()
    if (cErr || !consult) return res.status(404).json({ error: 'Consultation not found' })
    // Refuse to lodge an ACC claim / invoice for a $0.10 test-mode consult —
    // ACC billing must reflect real clinical care, never our payment drills.
    if (consult.payment_test_mode) {
      return res.status(400).json({ error: 'Test-mode consultation cannot be submitted to ACC' })
    }
    // Same for sandbox / practice-mode consults (seeded training patients
    // Aroha Mitchell, David Chen, Emily Nakamura). Missed by the earlier
    // sandbox suppression sweep — 2026-09-24 incident where a test invoice
    // for Aroha Mitchell was auto-emailed to providerinvoices@acc.co.nz.
    if (consult.is_practice) {
      return res.status(400).json({
        error: 'Sandbox consultation cannot be submitted to ACC',
        simulated: true,
        reason: 'practice_mode',
      })
    }

    // MST1 (initial) vs MST3 (follow-up) — key on patient NHI + injury.
    // If ANY prior acc_claim exists for this patient and this injury date,
    // treat as follow-up. Best-effort — if the query fails (table missing
    // etc.) we default to MST1 rather than block the claim.
    let isFollowup = false
    if (consult.patient_nhi) {
      try {
        const q = supabase.from('acc_claims')
          .select('id')
          .eq('patient_nhi', consult.patient_nhi)
          .neq('consultation_id', consultationId)
          .limit(1)
        // If injury date is available, scope to same injury; otherwise any
        // prior claim for this NHI is enough of a signal.
        if (consult.acc_injury_date) {
          // acc_claims may or may not carry injury_date — try to filter but
          // fall through gracefully if the column is absent.
          try { await q.eq('injury_date', consult.acc_injury_date) } catch { /* ignore */ }
        }
        const { data: prior } = await q
        if (Array.isArray(prior) && prior.length > 0) isFollowup = true
      } catch { /* keep MST1 default */ }
    }

    const serviceCode  = getServiceCode(consult.consultation_type, isFollowup)
    const amountCents  = getACCRateCents(consult.consultation_type, isFollowup)
    const hpiNumber    = providerHpi || process.env.PATRICK_HPI_NUMBER || ''
    // MCNZ registration — ACC uses this to validate scope-of-practice.
    // Falls back to the admin's own reg if the caller didn't supply one.
    const mcnzNumber   = providerMcnzIn || process.env.PATRICK_MCNZ_NUMBER || ''
    const pName        = providerName || 'Tere Health Provider'
    const isSandbox    = process.env.ACC_SANDBOX !== 'false'
    const hasCredentials = !!(process.env.ACC_API_KEY && process.env.ACC_VENDOR_ID && hpiNumber)

    let claimNumber, rawResponse

    if (hasCredentials) {
      // Hard-block live ACC submission if the ICD-10 code is missing. ACC
      // rejects invoices without a valid diagnosis code and (for repeat
      // offenders) audits the provider. The Convert-to-ACC modal enforces
      // the picker up-front; this is the last-line server-side gate.
      if (!consult.acc_icd10_code) {
        console.error('[acc-claims] ACC ICD-10 missing on consult', consultationId)
        return res.status(400).json({
          error: 'ACC ICD-10 code missing on consultation. Re-open the consult and use the ACC ICD-10 picker before lodging the claim.',
        })
      }
      const claimPayload = {
        providerHPI:         hpiNumber,
        providerName:        pName,
        providerType:        providerType || 'specialist',
        vendorId:            process.env.ACC_VENDOR_ID,
        patientNHI:          consult.patient_nhi,
        patientFirstName:    consult.patient_first_name,
        patientLastName:     consult.patient_last_name,
        patientDOB:          consult.patient_dob,
        patientPhone:        consult.patient_phone,
        patientEmail:        consult.patient_email,
        injuryDate:          consult.acc_injury_date,
        injuryDescription:   consult.acc_injury_details || consult.chief_complaint,
        // ACC ICD-10 (HL7 NZ acc-icd10 CodeSystem) — mandatory diagnosis
        // for ACC45 e-claim lodgement. No-dot format (e.g. 'S9340').
        icd10Code:           consult.acc_icd10_code,
        icd10Description:    consult.acc_icd10_description,
        // acc_read_code kept for legacy audit trail on old rows; new consults
        // pick ICD-10 via the picker.
        readCode:            consult.acc_read_code || null,
        employerName:        consult.acc_employer || null,
        consultationDate:    consult.created_at,
        consultationType:    'telehealth',
        serviceCode,
        bankAccount:         process.env.WISE_ACCOUNT_NUMBER || '',
        bankName:            'Wise',
        accountName:         'Tere Health Limited',
      }
      rawResponse   = await submitToACC(claimPayload)
      claimNumber   = rawResponse.claimNumber
    } else {
      // No ACC REST creds — real NZ workflow is ProviderHub (manual) or
      // emailed invoice (providerinvoices@acc.co.nz). Both need the real
      // claim number the patient was issued. Pull from consult (set by
      // the Convert-to-ACC modal) and refuse to proceed if missing/placeholder.
      const prov = typeof consult.acc_claim_number === 'string'
        ? consult.acc_claim_number.trim().toUpperCase()
        : ''
      const isPlaceholder = !prov || prov.length < 7 || /^TEST/i.test(prov)
      if (isPlaceholder) {
        return res.status(400).json({
          error: 'ACC claim number missing or placeholder on this consultation. Open the chart, re-run Convert-to-ACC with the real claim number from ACC, then retry.',
          needsClaimNumber: true,
        })
      }
      claimNumber   = prov
      rawResponse   = { simulated: false, claimNumber, note: 'Provider-entered ACC claim number — manual lodgement via ProviderHub' }
    }

    // Save claim record
    const { error: insertErr } = await supabase.from('acc_claims').insert({
      consultation_id: consultationId,
      patient_nhi:     consult.patient_nhi,
      patient_name:    `${consult.patient_first_name} ${consult.patient_last_name}`,
      provider_id:     providerId || null,
      provider_hpi:    hpiNumber,
      provider_name:   pName,
      claim_number:    claimNumber,
      service_code:    serviceCode,
      amount_claimed:  amountCents,
      status:          hasCredentials ? 'submitted' : 'simulated',
      submitted_at:    new Date().toISOString(),
      raw_response:    rawResponse,
    })

    // Tolerate if acc_claims table doesn't exist yet (migration not run)
    if (insertErr && !insertErr.message?.includes('does not exist')) {
      console.error('acc_claims insert error:', insertErr.message)
    }

    // Update consultation
    await supabase.from('consultations').update({
      acc_claim_number:  claimNumber,
      acc_claim_status:  hasCredentials ? 'submitted' : 'simulated',
      acc_submitted_at:  new Date().toISOString(),
    }).eq('id', consultationId)

    // Autosend REMOVED 2026-10-18. ACC invoice emailing is admin-only now:
    // Admin > ACC tab > Invoice PDF (download) + Mark as lodged (stamp
    // invoice_submitted_at with the real ACC claim number returned by
    // ProviderHub). See /api/acc-claim-invoice.
    res.json({
      ok: true,
      claimNumber,
      simulated: !hasCredentials,
      amountCents,
      invoice:   { skipped: 'admin_review_required' },
      note: 'Claim recorded. Review in Admin > ACC and lodge manually via ProviderHub; download the invoice PDF when ready to submit to providerinvoices@acc.co.nz.',
    })
  } catch (e) {
    console.error('acc-claims error:', e)
    res.status(500).json({ ok: false, error: 'Server error' })
  }
}
