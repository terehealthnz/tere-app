// Admin-only ACC invoice endpoint. Replaces the old autosend path that
// bounced on 2026-10-18 when a TEST* placeholder was emailed to ACC
// Provider Invoices.
//
// Actions:
//   GET  /api/acc-claim-invoice?action=download&claim_id=<id>
//        → stream the IRD-compliant invoice PDF for admin review
//   POST /api/acc-claim-invoice action=mark_lodged
//        → stamp invoice_submitted_at + lodgement metadata on the claim row,
//          update claim_number if admin corrected it (patient-supplied was
//          wrong), record disclosure for audit
//
// Both actions require provider auth (routed via handler.js AUTH_REQUIRED_ROUTES).

import { createClient } from '@supabase/supabase-js'
import { buildAccInvoicePdf } from './_pdf-builders.js'
import { recordDisclosure } from './_disclosure.js'
import { writeAuditEvent } from './_audit-write.js'
import { sendEmail, hasEmailProvider } from './_email-client.js'

function supabaseAdmin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

async function loadClaimWithConsult(supabase, claimId) {
  const { data: claim, error: ce } = await supabase
    .from('acc_claims')
    .select('*')
    .eq('id', claimId)
    .maybeSingle()
  if (ce || !claim) return { error: 'Claim not found' }
  const { data: consult } = await supabase
    .from('consultations')
    .select('*')
    .eq('id', claim.consultation_id)
    .maybeSingle()
  return { claim, consult: consult || null }
}

export default async function handler(req, res) {
  const supabase = supabaseAdmin()
  const action = (req.query.action || req.body?.action || '').toString()

  // ── action: download — stream invoice PDF ──────────────────────────────────
  if (action === 'download') {
    const claimId = req.query.claim_id || req.body?.claimId
    if (!claimId) return res.status(400).json({ error: 'claim_id required' })
    const { claim, consult, error } = await loadClaimWithConsult(supabase, claimId)
    if (error) return res.status(404).json({ error })

    const patientName = claim.patient_name
      || [consult?.patient_first_name, consult?.patient_last_name].filter(Boolean).join(' ').trim()
      || 'ACC client'

    const pdfBuffer = await buildAccInvoicePdf({
      patientName,
      patientNhi:          claim.patient_nhi || consult?.patient_nhi,
      patientDob:          consult?.patient_dob,
      claimNumber:         claim.claim_number,
      serviceCode:         claim.service_code,
      amountCents:         claim.amount_claimed || 0,
      providerName:        claim.provider_name,
      providerHpi:         claim.provider_hpi,
      dateOfService:       consult?.completed_at || consult?.created_at || claim.created_at,
      accIcd10Code:        consult?.acc_icd10_code,
      accIcd10Description: consult?.acc_icd10_description,
      accBodyPart:         consult?.acc_body_part,
      accInjuryDate:       consult?.acc_injury_date,
    })

    writeAuditEvent(req, req.auth, {
      event_type:    'acc_invoice.downloaded',
      resource_type: 'acc_claims',
      resource_id:   claim.id,
      consultation_id: claim.consultation_id,
      metadata: { claim_number: claim.claim_number, lodged_at: claim.invoice_submitted_at },
    })

    const safeName = String(patientName).replace(/[^A-Za-z0-9]+/g, '-')
    const filename = `ACC-${claim.claim_number || 'DRAFT'}-${safeName}.pdf`
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    return res.status(200).send(pdfBuffer)
  }

  // ── action: set_claim_number — admin pastes the real ACC claim number ──
  // after lodging ACC45 via ProviderHub (or receiving it from the patient).
  // Separate from mark_lodged so admin can update the number without
  // committing to a lodgement stamp. Used for rows that converted blank.
  if (action === 'set_claim_number') {
    if (req.method !== 'POST') return res.status(405).end()
    const { claimId, claimNumber: claimNumberIn } = req.body || {}
    if (!claimId) return res.status(400).json({ error: 'claimId required' })

    const normalised = (claimNumberIn || '').toString().trim().toUpperCase().replace(/\s+/g, '')
    if (!normalised || normalised.length < 7 || /^TEST/i.test(normalised)) {
      return res.status(400).json({ error: 'Enter a real ACC claim number (min 7 chars, no TEST prefix).' })
    }

    const { claim, error } = await loadClaimWithConsult(supabase, claimId)
    if (error) return res.status(404).json({ error })

    const { error: upErr } = await supabase.from('acc_claims').update({
      claim_number: normalised,
    }).eq('id', claimId)
    if (upErr) {
      console.error('[acc-claim-invoice] set_claim_number update failed:', upErr.message)
      return res.status(500).json({ error: 'Could not save claim number' })
    }

    if (claim.consultation_id) {
      await supabase.from('consultations').update({
        acc_claim_number: normalised,
      }).eq('id', claim.consultation_id).then(() => {}).catch(() => {})
    }

    writeAuditEvent(req, req.auth, {
      event_type:      'acc_claim.number_set',
      resource_type:   'acc_claims',
      resource_id:     claim.id,
      consultation_id: claim.consultation_id,
      metadata: { was: claim.claim_number || null, now: normalised },
    })

    return res.status(200).json({ ok: true, claimNumber: normalised })
  }

  // ── action: email_to_acc — admin-triggered send of the invoice PDF to ──
  // providerinvoices@acc.co.nz. Different from the old autosend because it
  // only fires when an admin explicitly clicks "Email to ACC" on a row
  // after reviewing the claim number. Also stamps invoice_submitted_at so
  // the row becomes ✓ Lodged in one action.
  if (action === 'email_to_acc') {
    if (req.method !== 'POST') return res.status(405).end()
    if (!hasEmailProvider()) return res.status(500).json({ error: 'Email provider not configured' })

    const { claimId, allowResend = false } = req.body || {}
    if (!claimId) return res.status(400).json({ error: 'claimId required' })

    const { claim, consult, error } = await loadClaimWithConsult(supabase, claimId)
    if (error) return res.status(404).json({ error })

    // Hard safety gates — never send to ACC on sandbox or test-mode consults.
    if (consult?.is_practice) return res.status(400).json({ error: 'This is a sandbox consultation. Cannot email ACC.' })
    if (consult?.payment_test_mode) return res.status(400).json({ error: 'This is a $0.10 test-mode consultation. Cannot email ACC.' })

    // Real claim number required.
    const claimNumber = (claim.claim_number || '').toString().trim()
    if (!claimNumber || /^TEST/i.test(claimNumber) || claimNumber.length < 7) {
      return res.status(400).json({ error: 'Claim number is missing or placeholder. Add the real ACC claim number first.' })
    }

    // Don't double-send unless admin explicitly confirmed re-send.
    if (claim.invoice_submitted_at && !allowResend) {
      return res.status(409).json({ error: 'already_lodged', message: 'This claim was already lodged. Pass allowResend=true to send again.' })
    }

    const patientName = claim.patient_name
      || [consult?.patient_first_name, consult?.patient_last_name].filter(Boolean).join(' ').trim()
      || 'ACC client'

    const pdfBuffer = await buildAccInvoicePdf({
      patientName,
      patientNhi:          claim.patient_nhi || consult?.patient_nhi,
      patientDob:          consult?.patient_dob,
      claimNumber,
      serviceCode:         claim.service_code,
      amountCents:         claim.amount_claimed || 0,
      providerName:        claim.provider_name,
      providerHpi:         claim.provider_hpi,
      dateOfService:       consult?.completed_at || consult?.created_at || claim.created_at,
      accIcd10Code:        consult?.acc_icd10_code,
      accIcd10Description: consult?.acc_icd10_description,
      accBodyPart:         consult?.acc_body_part,
      accInjuryDate:       consult?.acc_injury_date,
    })

    const amountDollars = ((claim.amount_claimed || 0) / 100).toFixed(2)
    const safeName = String(patientName).replace(/[^A-Za-z0-9]+/g, '-')
    const filename = `ACC-${claimNumber}-${safeName}.pdf`
    const invoiceRef = `Invoice ${claimNumber} — ${patientName}`

    const emailRes = await sendEmail({
      from:    'Tere Health <hello@terehealth.co.nz>',
      replyTo: 'terehealthnz@gmail.com',
      to:      'providerinvoices@acc.co.nz',
      cc:      'terehealthnz@gmail.com',
      subject: `${invoiceRef} (Vendor G11238)`,
      html:    `<p>Kia ora ACC Provider Invoices team,</p>
                <p>Please find attached a tax invoice for services rendered under ACC vendor <strong>G11238</strong> (Tere Health Limited).</p>
                <p><strong>Client:</strong> ${patientName}${claim.patient_nhi ? ` · NHI ${claim.patient_nhi}` : ''}<br>
                   <strong>Claim #:</strong> ${claimNumber}<br>
                   <strong>Service code:</strong> ${claim.service_code || '—'}<br>
                   <strong>Amount:</strong> $${amountDollars} NZD (GST exempt — s21 GSTA 1985)</p>
                <p style="color:#6B7280;font-size:12px">Tere Health Limited · terehealth.co.nz · HPI-O G11238-E</p>`,
      attachments: [{ filename, content: pdfBuffer.toString('base64'), contentType: 'application/pdf' }],
    })

    if (!emailRes.ok) {
      console.error('[acc-claim-invoice] email_to_acc send failed:', emailRes.error)
      return res.status(502).json({ error: 'Email send to ACC failed. Try downloading the PDF and sending manually.' })
    }

    const stampedAt = new Date().toISOString()
    const lodgementMeta = {
      ...(claim.raw_response || {}),
      lodged_via:  'email_from_admin',
      lodged_by:   req.auth?.provider?.id || null,
      lodged_name: req.auth?.provider?.first_name
        ? `${req.auth.provider.first_name} ${req.auth.provider.last_name || ''}`.trim()
        : null,
      email_message_id: emailRes.id || null,
    }

    await supabase.from('acc_claims').update({
      status:               'submitted',
      invoice_submitted_at: stampedAt,
      raw_response:         lodgementMeta,
    }).eq('id', claimId)

    if (claim.consultation_id) {
      await supabase.from('consultations').update({
        acc_claim_status: 'submitted',
      }).eq('id', claim.consultation_id).then(() => {}).catch(() => {})
    }

    try {
      await recordDisclosure(req, {
        patientNhi:        claim.patient_nhi,
        consultationId:    claim.consultation_id,
        channel:           'acc_invoice',
        destination:       'providerinvoices@acc.co.nz',
        destinationLabel:  'ACC (Provider Invoices)',
        consentSource:     'triage_tick',
        consentSourceRef:  claim.consultation_id,
        disclosurePurpose: 'billing',
        payloadSummary:    `ACC invoice emailed from admin — claim ${claimNumber}`,
      })
    } catch (e) { console.warn('[acc-claim-invoice] disclosure record failed:', e.message) }

    writeAuditEvent(req, req.auth, {
      event_type:      'acc_invoice.emailed_to_acc',
      resource_type:   'acc_claims',
      resource_id:     claim.id,
      consultation_id: claim.consultation_id,
      metadata: {
        claim_number: claimNumber,
        destination:  'providerinvoices@acc.co.nz',
        resend:       !!claim.invoice_submitted_at,
        message_id:   emailRes.id || null,
      },
    })

    return res.status(200).json({ ok: true, sent: true, lodgedAt: stampedAt, messageId: emailRes.id || null })
  }

  // ── action: mark_lodged — stamp invoice_submitted_at + metadata ────────────
  if (action === 'mark_lodged') {
    if (req.method !== 'POST') return res.status(405).end()
    const {
      claimId,
      claimNumber: claimNumberIn,
      channel = 'providerhub',
      notes = '',
      lodgedAt,
    } = req.body || {}
    if (!claimId) return res.status(400).json({ error: 'claimId required' })

    const { claim, consult, error } = await loadClaimWithConsult(supabase, claimId)
    if (error) return res.status(404).json({ error })

    // Allow admin to correct the claim number at lodgement time (common
    // when the triage-time number was a typo or when a new ACC45 was
    // raised fresh in ProviderHub, returning a different number).
    const correctedClaim = (claimNumberIn || '').toString().trim().toUpperCase().replace(/\s+/g, '')
    if (correctedClaim && (correctedClaim.length < 7 || /^TEST/i.test(correctedClaim))) {
      return res.status(400).json({ error: 'Invalid claim number — must be at least 7 chars and not start with TEST.' })
    }
    const finalClaimNumber = correctedClaim || claim.claim_number
    if (!finalClaimNumber || /^TEST/i.test(String(finalClaimNumber))) {
      return res.status(400).json({ error: 'Claim is still a placeholder (TEST*). Enter the real ACC claim number before marking lodged.' })
    }

    const stampedAt = lodgedAt ? new Date(lodgedAt).toISOString() : new Date().toISOString()
    const lodgementMeta = {
      ...(claim.raw_response || {}),
      lodged_via:   channel,
      lodged_notes: notes || null,
      lodged_by:    req.auth?.provider?.id || null,
      lodged_name:  req.auth?.provider?.first_name
        ? `${req.auth.provider.first_name} ${req.auth.provider.last_name || ''}`.trim()
        : null,
    }

    const { error: upErr } = await supabase.from('acc_claims').update({
      claim_number:        finalClaimNumber,
      status:              'submitted',
      invoice_submitted_at: stampedAt,
      raw_response:        lodgementMeta,
    }).eq('id', claimId)
    if (upErr) {
      console.error('[acc-claim-invoice] mark_lodged update failed:', upErr.message)
      return res.status(500).json({ error: 'Could not record lodgement' })
    }

    // Keep the consultation row in sync so provider-facing surfaces reflect
    // the real claim number (if admin corrected it).
    if (claim.consultation_id) {
      await supabase.from('consultations').update({
        acc_claim_number: finalClaimNumber,
        acc_claim_status: 'submitted',
      }).eq('id', claim.consultation_id).then(() => {}).catch(() => {})
    }

    // Audit trail — disclosure record + audit event.
    try {
      await recordDisclosure(req, {
        patientNhi:        claim.patient_nhi,
        consultationId:    claim.consultation_id,
        channel:           'acc_invoice',
        destination:       channel === 'email' ? 'providerinvoices@acc.co.nz' : 'ProviderHub',
        destinationLabel:  channel === 'email' ? 'ACC (Provider Invoices)' : 'ACC (ProviderHub)',
        consentSource:     'triage_tick',
        consentSourceRef:  claim.consultation_id,
        disclosurePurpose: 'billing',
        payloadSummary:    `ACC invoice lodged — claim ${finalClaimNumber} via ${channel}`,
      })
    } catch (e) { console.warn('[acc-claim-invoice] disclosure record failed:', e.message) }

    writeAuditEvent(req, req.auth, {
      event_type:      'acc_invoice.marked_lodged',
      resource_type:   'acc_claims',
      resource_id:     claim.id,
      consultation_id: claim.consultation_id,
      metadata: {
        claim_number: finalClaimNumber,
        channel,
        lodged_at:    stampedAt,
        was_corrected: correctedClaim && correctedClaim !== claim.claim_number,
      },
    })

    return res.status(200).json({
      ok:            true,
      claimNumber:   finalClaimNumber,
      lodgedAt:      stampedAt,
      channel,
    })
  }

  return res.status(400).json({ error: 'Unknown action. Expected download or mark_lodged.' })
}
