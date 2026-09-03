import { createClient } from '@supabase/supabase-js'
import { sendEmail , hasEmailProvider} from './_email-client.js'
import { buildAccInvoicePdf } from './_pdf-builders.js'
import { recordDisclosure } from './_disclosure.js'

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

// Simulate a claim number for sandbox/dev when ACC credentials aren't configured.
function generateSimulatedClaimNumber() {
  const prefix = process.env.ACC_SANDBOX === 'false' ? 'ACC' : 'TEST'
  return `${prefix}${Date.now().toString().slice(-8)}`
}

// Email an IRD-compliant invoice PDF to providerinvoices@acc.co.nz. Gated
// by ACC_AUTOSEND_INVOICES=true so the first deploy doesn't accidentally
// spam ACC — flip the env var when the provider registration is approved
// and rates have been sanity-checked. terehealthnz@gmail.com is always
// cc'd so we keep a copy of every invoice we submit.
async function emailAccInvoice({ claimNumber, consult, serviceCode, amountCents, providerName, providerHpi }) {
  if (process.env.ACC_AUTOSEND_INVOICES !== 'true') return { skipped: 'ACC_AUTOSEND_INVOICES not enabled' }
  if (!hasEmailProvider()) return { skipped: 'no email provider configured' }
  const patientName = [consult.patient_first_name, consult.patient_last_name].filter(Boolean).join(' ').trim() || 'ACC client'
  const pdfBuffer = await buildAccInvoicePdf({
    patientName,
    patientNhi:      consult.patient_nhi,
    claimNumber,
    serviceCode,
    amountCents,
    providerName,
    providerHpi,
    dateOfService:   consult.completed_at || consult.created_at,
  })
  const pdfBase64 = pdfBuffer.toString('base64')
  const invoiceRef = `Invoice ${claimNumber} — ${patientName}`
  await sendEmail({
    from:    'Tere Health <hello@terehealth.co.nz>',
    replyTo: 'terehealthnz@gmail.com',
    to:      'providerinvoices@acc.co.nz',
    cc:      'terehealthnz@gmail.com',
    subject: `${invoiceRef} (Vendor G11238)`,
    html:    `<p>Kia ora ACC Provider Invoices team,</p>
              <p>Please find attached an invoice for services rendered under ACC vendor <strong>G11238</strong> (Tere Health Limited).</p>
              <p><strong>Client:</strong> ${patientName}${consult.patient_nhi ? ` · NHI ${consult.patient_nhi}` : ''}<br>
                 <strong>Claim #:</strong> ${claimNumber}<br>
                 <strong>Service code:</strong> ${serviceCode}<br>
                 <strong>Amount:</strong> $${(amountCents / 100).toFixed(2)} NZD (GST exempt — s21 GSTA 1985)</p>
              <p style="color:#6B7280;font-size:12px">Tere Health Limited · terehealth.co.nz · HPI-O G11238-E</p>`,
    attachments: [{ filename: `${claimNumber}.pdf`, content: pdfBase64 }],
  })
  return { sent: true }
}

// Bridge from the emailAccInvoice helper (which doesn't have `req` in scope)
// to the disclosure recorder — invoked from the POST handler once we know the
// email actually went. Kept separate so the pure-email helper stays testable.
async function recordAccInvoiceDisclosure(req, consult, claimNumber) {
  return recordDisclosure(req, {
    patientNhi:        consult.patient_nhi,
    consultationId:    consult.id,
    channel:           'acc_invoice',
    destination:       'providerinvoices@acc.co.nz',
    destinationLabel:  'ACC (Provider Invoices)',
    consentSource:     'triage_tick',
    consentSourceRef:  consult.id,
    disclosurePurpose: 'billing',
    payloadSummary:    `ACC invoice PDF — claim ${claimNumber}`,
  }).catch(() => {})
}

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

  const { consultationId, providerId, providerHpi, providerName, providerType } = req.body
  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

  try {
    // Fetch full consultation
    const { data: consult, error: cErr } = await supabase
      .from('consultations')
      .select('*')
      .eq('id', consultationId)
      .single()
    if (cErr || !consult) return res.status(404).json({ error: 'Consultation not found' })

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
    const pName        = providerName || 'Tere Health Provider'
    const isSandbox    = process.env.ACC_SANDBOX !== 'false'
    const hasCredentials = !!(process.env.ACC_API_KEY && process.env.ACC_VENDOR_ID && hpiNumber)

    let claimNumber, rawResponse

    if (hasCredentials) {
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
        readCode:            consult.acc_read_code,
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
      // No credentials — simulate for dev/sandbox
      claimNumber   = generateSimulatedClaimNumber()
      rawResponse   = { simulated: true, claimNumber, note: isSandbox ? 'ACC credentials not configured — simulated claim' : 'Missing ACC credentials' }
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

    // Email the IRD-compliant invoice PDF to providerinvoices@acc.co.nz.
    // Gated by ACC_AUTOSEND_INVOICES=true so the first deploy stays silent
    // — you flip that env when Patrick's ACC provider approval lands and
    // rates have been verified. Failures don't block the claim row.
    let invoiceOutcome = null
    try {
      invoiceOutcome = await emailAccInvoice({
        claimNumber, consult, serviceCode, amountCents,
        providerName: pName, providerHpi: hpiNumber,
      })
      if (invoiceOutcome?.sent) {
        recordAccInvoiceDisclosure(req, consult, claimNumber)
      }
    } catch (e) {
      invoiceOutcome = { error: 'invoice send failed' }
      console.error('acc-claims: emailAccInvoice failed:', e.message)
    }

    res.json({
      ok: true,
      claimNumber,
      simulated: !hasCredentials,
      amountCents,
      invoice:   invoiceOutcome,
      note: !hasCredentials
        ? 'ACC does not expose a public REST API. Claim recorded internally; invoice PDF emailed to providerinvoices@acc.co.nz when ACC_AUTOSEND_INVOICES=true.'
        : undefined,
    })
  } catch (e) {
    console.error('acc-claims error:', e)
    res.status(500).json({ ok: false, error: 'Server error' })
  }
}
