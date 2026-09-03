import { createClient } from '@supabase/supabase-js'
import { sendEmail , hasEmailProvider} from './_email-client.js'
import { buildPrescriptionPdf } from './_pdf-builders.js'
import { isSignatureExempt, classifyDrug } from './_drug-classifications.js'
import { writeAuditEvent } from './_audit-write.js'
import { checkPrescribingSafety } from './_prescribing-safety.js'

function supabaseAdmin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  )
}

async function notifySupervisors(supabase, subject, html) {
  const canEmail = hasEmailProvider()
  if (!canEmail) return
  const { data: supervisors } = await supabase
    .from('providers')
    .select('email, first_name, last_name')
    .eq('is_supervisor', true)
    .eq('is_active', true)
    .not('email', 'is', null)
  if (!supervisors?.length) return
  for (const sup of supervisors) {
    try {
      await sendEmail({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: sup.email,
        subject,
        html,
      })
    } catch {}
  }
}

export default async function handler(req, res) {
  const {
    consultationId, providerId, providerName, prescriberNumber,
    patientName, patientNhi, patientDob, patientEmail,
    drug, dose, directions, quantity, repeats,
    pharmacyId, pharmacyName, pharmacyHpiId,
    pharmacyEmail, pharmacyFax, pharmacyPhone, pharmacyAddress,
    // deliveryChannel: 'fax' | 'email' | 'both' (default: prefer email if we
    // have one — matches direction NZ pharmacies are moving)
    deliveryChannel,
    needsApproval, draftedByName,
    // Task #423 — provider override of prescribing-safety block. Requires
    // reason (min 20 chars, audit-logged).
    safetyOverride, safetyOverrideReason,
  } = req.body || {}

  if (!patientName || !drug) return res.status(400).json({ error: 'Missing required fields' })

  const supabase = supabaseAdmin()

  // ── Prescribing safety guards (task #423) ────────────────────────────
  // Cross-provider max-quantity + early-refill + doctor-shopping check.
  // Blocks controlled/benzo/opioid early refills; warns on regular Rx.
  // Provider can override with a reason (audit-logged).
  const medsafeClass = classifyDrug(drug)
  const safety = await checkPrescribingSafety({
    supabase, patientNhi, patientEmail, patientName,
    drug, quantity, medsafeClass,
    bypassChecks: false,
  })
  if (safety.blocked && !safetyOverride) {
    // Audit the block (didn't proceed) so we know the control fired.
    try { await writeAuditEvent(supabase, {
      action:          'prescribing_safety_block',
      consultation_id: consultationId || null,
      resource_type:   'prescription_attempt',
      patient_ref:     patientNhi || patientEmail || null,
      metadata:        { drug, bucket: safety.bucket, reason: safety.reason, prior_count: safety.prior_count, distinct_providers: safety.distinct_providers, provider_id: providerId },
    }) } catch {}
    return res.status(409).json({
      error:                'Prescribing safety block',
      prescribing_blocked:  true,
      reason:               safety.reason,
      bucket:               safety.bucket,
      warnings:             safety.warnings,
      prior_count:          safety.prior_count,
      distinct_providers:   safety.distinct_providers,
      can_override:         true,
    })
  }
  if (safetyOverride) {
    if (!safetyOverrideReason || String(safetyOverrideReason).trim().length < 20) {
      return res.status(400).json({ error: 'safetyOverrideReason required (≥ 20 chars)' })
    }
    try { await writeAuditEvent(supabase, {
      action:          'prescribing_safety_override',
      consultation_id: consultationId || null,
      resource_type:   'prescription_attempt',
      patient_ref:     patientNhi || patientEmail || null,
      metadata:        { drug, bucket: safety.bucket, reason: safety.reason, override_reason: String(safetyOverrideReason).trim().slice(0, 500), provider_id: providerId },
    }) } catch {}
  }
  // Non-blocking warnings still get audited so we can see the pattern.
  if (safety.warnings && safety.warnings.length) {
    try { await writeAuditEvent(supabase, {
      action:          'prescribing_safety_warn',
      consultation_id: consultationId || null,
      resource_type:   'prescription_attempt',
      patient_ref:     patientNhi || patientEmail || null,
      metadata:        { drug, bucket: safety.bucket, warnings: safety.warnings, provider_id: providerId },
    }) } catch {}
  }

  // ── Pending approval path ────────────────────────────────────────────
  if (needsApproval) {
    let prescriptionId = null
    try {
      const { data } = await supabase.from('prescriptions').insert({
        consultation_id: consultationId || null,
        drafted_by_id: providerId || null,
        drafted_by_name: draftedByName || providerName,
        provider_id: providerId || null,
        provider_name: providerName,
        prescriber_number: prescriberNumber,
        patient_name: patientName,
        patient_nhi: patientNhi,
        patient_dob: patientDob,
        patient_email: patientEmail,
        drug, dose, directions, quantity,
        repeats: repeats || 0,
        pharmacy_name: pharmacyName,
        pharmacy_hpi_id: pharmacyHpiId,
        pharmacy_email: pharmacyEmail,
        pharmacy_phone: pharmacyPhone,
        pharmacy_address: pharmacyAddress,
        approval_status: 'pending_approval',
        delivery_status: 'pending',
      }).select('id').single()
      prescriptionId = data?.id
    } catch (e) {
      console.error('[generate-prescription-pdf] Failed to save draft:', e)
      return res.status(500).json({ error: 'Failed to save draft' })
    }

    // Email all supervisors
    await notifySupervisors(
      supabase,
      `Prescription approval needed — ${patientName} (${drug})`,
      `<p><strong>${draftedByName || providerName}</strong> has drafted a prescription requiring your approval.</p>
       <table style="border-collapse:collapse;margin:1rem 0">
         <tr><td style="padding:4px 12px 4px 0;color:#6B7280">Patient</td><td style="font-weight:600">${patientName}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#6B7280">Medication</td><td style="font-weight:600">${drug}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#6B7280">Dose</td><td>${dose || '—'}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#6B7280">Directions</td><td>${directions || '—'}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#6B7280">Quantity</td><td>${quantity || '—'}, Repeats: ${repeats || 0}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#6B7280">Pharmacy</td><td>${pharmacyName || '—'}</td></tr>
       </table>
       <p>Please log in to the Tere dashboard to approve, modify, or reject this prescription.</p>
       <p style="color:#6B7280;font-size:12px">Tere Health · terehealth.co.nz</p>`
    )

    return res.json({ ok: true, prescriptionId, pending: true })
  }

  // ── Direct send path ─────────────────────────────────────────────────
  // Look up the provider's signature image (if uploaded via Admin) plus their
  // email — email is required on the PDF by the DG Aug 2024 signature-exempt
  // authorisation so pharmacies can contact the prescriber to verify identity.
  // Signature URL is only needed for the wet-ink path (controlled drugs).
  let signatureUrl = null
  let providerEmail = null
  if (providerId) {
    try {
      const { data: prov } = await supabase
        .from('providers').select('signature_url, email').eq('id', providerId).maybeSingle()
      if (prov?.signature_url) signatureUrl = prov.signature_url
      if (prov?.email) providerEmail = prov.email
    } catch {}
  }

  // Classify the drug — controlled Class A/B/C still requires a wet-ink
  // signature and the original prescription to be sent to the pharmacy per
  // Misuse of Drugs Regulations 1977. Everything else may go signature-exempt
  // under the DG August 2024 authorisation (expires 31 October 2027).
  const drugClass = classifyDrug(drug)
  const signatureExempt = isSignatureExempt(drug)

  const pdfData = { providerName, providerEmail, prescriberNumber, patientName, patientNhi, patientDob, drug, dose, directions, quantity, repeats, pharmacyName, pharmacyAddress, signatureUrl, signatureExempt }
  let pdfBuffer
  try {
    pdfBuffer = await buildPrescriptionPdf(pdfData)
  } catch (e) {
    console.error('[generate-prescription-pdf] PDF generation failed:', e)
    return res.status(500).json({ error: 'PDF generation failed' })
  }

  const pdfBase64 = pdfBuffer.toString('base64')
  const deliveryErrors = []
  let faxResult = null

  // Delivery channel resolution. If the caller was explicit, honour that.
  // Otherwise: prefer email when we have one (faster, cleaner audit trail,
  // matches where NZ pharmacies are heading — hospital pharmacies + chains
  // now email-first). Fall back to fax for rural/older pharmacies that
  // are still fax-only. Degrade to none silently (patient still gets copy).
  const channel = (deliveryChannel || (pharmacyEmail ? 'email' : pharmacyFax ? 'fax' : 'none')).toLowerCase()
  const wantsFax   = channel === 'fax'   || channel === 'both'
  const wantsEmail = channel === 'email' || channel === 'both'

  if (wantsFax && pharmacyFax) {
    try {
      const { sendFax } = await import('./_send-fax.js')
      faxResult = await sendFax({
        to: pharmacyFax,
        pdf: pdfBuffer,
        filename: `prescription-${patientName.replace(/ /g, '-')}.pdf`,
        subject: (await import('./_email-safety.js')).sanitizeSubject(`Prescription for ${patientName} — Tere Health`),
        tag: consultationId ? `consult:${consultationId}` : undefined,
      })
      if (!faxResult.ok) { console.error('[generate-prescription-pdf] fax failed:', faxResult.provider, faxResult.error); deliveryErrors.push(`Pharmacy fax failed (${faxResult.provider})`) }
    } catch (e) { console.error('[generate-prescription-pdf] fax exception:', e); deliveryErrors.push('Pharmacy fax exception') }
  }

  if (wantsEmail && pharmacyEmail && hasEmailProvider()) {
    try {
      // From-name identifies the individual prescriber alongside the facility
      // per DG Aug 2024 requirement ("secure email that identifies the
      // prescriber and the healthcare facility"). Reply-to routes pharmacy
      // queries directly to the prescriber's mailbox, with Tere reception as
      // backup when the provider row has no email on file.
      const fromName = `Dr ${providerName} via Tere Health`.replace(/"/g, "'")
      const replyTo = providerEmail || 'terehealthnz@gmail.com'
      await sendEmail({
        from: `${fromName} <hello@terehealth.co.nz>`,
        replyTo,
        to: pharmacyEmail,
        subject: (await import('./_email-safety.js')).sanitizeSubject(`Prescription for ${patientName} — Tere Health`),
        html: `<p>Please find attached a prescription for <strong>${patientName}</strong> from Tere Health.</p><p>Prescriber: ${providerName}<br>Prescriber No: ${prescriberNumber || '—'}<br>Contact: ${replyTo}</p><p>Medication: <strong>${drug}</strong><br>Directions: ${directions}<br>Quantity: ${quantity}, Repeats: ${repeats || 0}</p>${signatureExempt ? '<p style="font-size:12px;color:#0B6E76;border-left:3px solid #0B6E76;padding-left:10px;margin-top:16px"><em>This prescription meets the requirement of the Director-General of Health\'s authorisation of August 2024 for prescriptions not signed personally by a prescriber with their usual signature.</em></p>' : ''}`,
        attachments: [{ filename: `prescription-${patientName.replace(/ /g, '-')}.pdf`, content: pdfBase64 }],
      })
    } catch (e) { console.error('[generate-prescription-pdf] pharmacy email failed:', e); deliveryErrors.push('Pharmacy email failed') }
  }

  // Crowd-source the contact details we just used so the next prescription to
  // this pharmacy skips the manual entry. Keyed by pharmacy_id (Medsafe register
  // slug); no-op if we don't have an id or nothing new to save.
  if (pharmacyId && (pharmacyFax || pharmacyEmail || pharmacyPhone || pharmacyHpiId)) {
    try {
      await supabase.from('pharmacy_contacts').upsert({
        pharmacy_id: pharmacyId,
        premises_name: pharmacyName || null,
        fax: pharmacyFax || null,
        dispensary_email: pharmacyEmail || null,
        phone: pharmacyPhone || null,
        hpi_id: pharmacyHpiId || null,
        contributed_by: providerId || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'pharmacy_id' })
    } catch (e) { console.warn('[prescription] pharmacy_contacts upsert failed:', e.message) }
  }

  if (patientEmail && hasEmailProvider()) {
    try {
      await sendEmail({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: patientEmail,
        subject: `Your prescription from Tere Health`,
        html: `<p>Hi ${patientName},</p><p>Your prescription has been sent to <strong>${pharmacyName || 'your pharmacy'}</strong>. A copy is attached.</p><p>Medication: <strong>${drug}</strong><br>Directions: ${directions}</p><p>Tere Health Team</p>`,
        attachments: [{ filename: 'prescription.pdf', content: pdfBase64 }],
      })
    } catch (e) { console.error('[generate-prescription-pdf] patient email failed:', e); deliveryErrors.push('Patient email failed') }
  }

  let prescriptionId = null
  try {
    const { data } = await supabase.from('prescriptions').insert({
      consultation_id: consultationId || null,
      provider_id: providerId || null,
      provider_name: providerName,
      prescriber_number: prescriberNumber,
      patient_name: patientName,
      patient_nhi: patientNhi,
      patient_dob: patientDob,
      patient_email: patientEmail,
      drug, dose, directions, quantity,
      repeats: repeats || 0,
      pharmacy_id: pharmacyId || null,
      pharmacy_name: pharmacyName,
      pharmacy_hpi_id: pharmacyHpiId,
      pharmacy_email: pharmacyEmail,
      pharmacy_fax: pharmacyFax || null,
      pharmacy_phone: pharmacyPhone,
      pharmacy_address: pharmacyAddress,
      delivery_channel: channel,
      fax_provider_id: faxResult?.providerId || null,
      fax_status: faxResult?.status || null,
      approval_status: 'not_required',
      delivery_status: deliveryErrors.length ? 'error' : 'sent',
      delivery_error: deliveryErrors.join('; ') || null,
    }).select('id').single()
    prescriptionId = data?.id
  } catch (e) { console.error('[generate-prescription-pdf] DB save failed:', e); deliveryErrors.push('DB save failed') }

  // Audit the issued prescription — this is the medico-legal moment. Captures
  // who issued what to whom via which channel, with any delivery failures.
  writeAuditEvent(req, req.auth, {
    event_type:      'prescription.issued',
    consultation_id: consultationId || null,
    resource_type:   'prescription',
    resource_id:     prescriptionId,
    metadata: {
      drug, pharmacy_name: pharmacyName, delivery_channel: channel,
      delivery_status: deliveryErrors.length ? 'error' : 'sent',
      delivery_errors: deliveryErrors.length ? deliveryErrors : undefined,
    },
  })

  res.json({ ok: true, prescriptionId, pdfBase64, deliveryErrors: deliveryErrors.length ? deliveryErrors : undefined })
}
