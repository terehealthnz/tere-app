// POST /api/patient-correction-request
//
// Anonymous endpoint the patient support form / correction form calls to
// record a Rule 7 correction request. No auth required (patients don't
// have accounts yet); rate-limited by IP via the router.

import { createClient } from '@supabase/supabase-js'
import { getClientIp } from './_client-ip.js'
import { sendEmail } from './_email-client.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    patientNhi,
    patientEmail,
    patientName,
    targetField,
    currentValue,
    requestedValue,
    reason,
    submittedVia = 'patient_support_form',
  } = req.body || {}

  if (!targetField || (!requestedValue && !reason)) {
    return res.status(400).json({ error: 'targetField and either requestedValue or reason are required' })
  }
  if (!patientNhi && !patientEmail && !patientName) {
    return res.status(400).json({ error: 'One of patientNhi, patientEmail, or patientName is required so we can identify your record' })
  }

  const supabase = admin()
  const ip = getClientIp(req)

  const { data, error } = await supabase.from('patient_correction_requests').insert({
    patient_nhi:     patientNhi || null,
    patient_email:   patientEmail || null,
    patient_name:    patientName || null,
    submitted_via:   submittedVia,
    target_field:    String(targetField).slice(0, 200),
    current_value:   currentValue ? String(currentValue).slice(0, 2000) : null,
    requested_value: requestedValue ? String(requestedValue).slice(0, 2000) : null,
    reason:          reason ? String(reason).slice(0, 2000) : null,
    ip,
  }).select('id').maybeSingle()

  if (error) {
    console.error('[patient-correction-request] insert failed:', error.message)
    return res.status(500).json({ error: 'Could not record request. Please try again or email us at terehealthnz@gmail.com.' })
  }

  // Notify admin so the request doesn't sit unactioned.
  try {
    await sendEmail({
      from:    'Tere Health <hello@terehealth.co.nz>',
      to:      'terehealthnz@gmail.com',
      subject: `Patient correction request — ${patientName || patientEmail || patientNhi || 'anonymous'}`,
      text:    [
        `A patient has submitted a correction request under Privacy Act 2020 IPP7 / HIPC Rule 7.`,
        ``,
        `From: ${patientName || '(name not provided)'} · ${patientEmail || '(email not provided)'} · NHI ${patientNhi || '(not provided)'}`,
        `Field:     ${targetField}`,
        `Current:   ${currentValue || '(not stated)'}`,
        `Requested: ${requestedValue || '(not stated)'}`,
        `Reason:    ${reason || '(not stated)'}`,
        ``,
        `Request ID: ${data?.id}`,
        `Submitted at: ${new Date().toISOString()}`,
        `IP: ${ip}`,
        ``,
        `Actions: log into Admin > Compliance > Correction requests to accept, annotate, or decline.`,
        `Response SLA (HDC/OPC good practice): 20 working days.`,
      ].join('\n'),
    })
  } catch (e) {
    console.error('[patient-correction-request] admin email failed:', e.message)
  }

  return res.status(200).json({ ok: true, id: data?.id, message: 'Received. We will respond within 20 working days per HIPC Rule 7.' })
}
