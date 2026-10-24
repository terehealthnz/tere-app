// Anon POST: claim a GP slot and create the matching consultation row.
// Flag-gated. Atomic UPDATE on appointments_gp (available -> held) guards
// against double-booking at the DB level; the partial unique index on
// (provider_id, slot_start) WHERE booking_status NOT IN ('cancelled','no_show')
// is the second line of defence.

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { isFlagEnabled } from './_flags-server.js'

function admin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

function tokenSecret() {
  return process.env.BOOKING_TOKEN_SECRET || process.env.CRON_SECRET || ''
}

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex')
}

function sixDigitCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!(await isFlagEnabled('gp_scheduled_booking_enabled', { default: false }))) {
    return res.status(404).json({ error: 'Not found' })
  }
  if (!tokenSecret()) {
    return res.status(500).json({ error: 'Server not configured' })
  }

  const body = req.body || {}
  const { appointment_id, patient_first, patient_last, patient_dob, patient_email, patient_phone, nhi } = body
  if (!appointment_id || !patient_first || !patient_last || !patient_dob || !patient_email) {
    return res.status(400).json({ error: 'appointment_id, patient_first, patient_last, patient_dob, patient_email required' })
  }

  const supabase = admin()

  // Atomic claim. Switches booking_status available -> held, returns the row
  // only if the switch happened. 0 rows back means the slot was taken by a
  // concurrent request between the slot-picker fetch and this POST.
  const { data: claimed, error: claimErr } = await supabase
    .from('appointments_gp')
    .update({ booking_status: 'held' })
    .eq('id', appointment_id)
    .eq('booking_status', 'available')
    .select('id, provider_id, slot_start, slot_end')
    .maybeSingle()

  if (claimErr) {
    console.error('[gp-book] claim failed:', claimErr.message)
    return res.status(500).json({ error: 'Server error' })
  }
  if (!claimed) {
    return res.status(409).json({ error: 'Slot no longer available' })
  }

  // Default funding_source is patient_paid; capitated path only when the
  // admin passed a specific funder_id (future: NHI enrolment lookup).
  const fundingSource = body.funding_source === 'pho_capitated' ? 'pho_capitated' : 'patient_paid'
  const paymentBypassed = fundingSource === 'pho_capitated'
  // Scheduled GP visit is NZ$80. Charged via the usual Windcave flow for
  // patient_paid; zero for capitated (funder covers it, employer_paid=true
  // reuses the pentested bypass primitive from task #595).
  const SCHEDULED_GP_PRICE_CENTS = 8000

  const { data: consult, error: consultErr } = await supabase
    .from('consultations')
    .insert({
      consult_type: 'scheduled_gp',
      funding_source: fundingSource,
      funder_id: body.funder_id || null,
      appointment_id: claimed.id,
      provider_id: claimed.provider_id,
      employer_paid: paymentBypassed ? true : false,
      payment_amount: paymentBypassed ? 0 : SCHEDULED_GP_PRICE_CENTS,
      patient_first_name: String(patient_first).trim(),
      patient_last_name: String(patient_last).trim(),
      patient_dob: patient_dob,
      patient_email: String(patient_email).trim().toLowerCase(),
      patient_phone: patient_phone ? String(patient_phone).trim() : null,
      patient_nhi: nhi || null,
      status: 'waiting',
      is_practice: false,
    })
    .select('id')
    .single()

  if (consultErr || !consult) {
    console.error('[gp-book] consult create failed:', consultErr?.message)
    await supabase.from('appointments_gp').update({ booking_status: 'available' }).eq('id', claimed.id)
    return res.status(500).json({ error: 'Could not create consultation' })
  }

  const bookingCode = sixDigitCode()
  const bookingToken = crypto.randomBytes(24).toString('base64url')

  const { error: linkErr } = await supabase
    .from('appointments_gp')
    .update({
      booking_status: 'confirmed',
      consultation_id: consult.id,
      booking_code_hash: sha256(bookingCode),
      booking_token_hash: sha256(bookingToken),
      patient_email: String(patient_email).trim().toLowerCase(),
      created_via: 'patient_booking',
    })
    .eq('id', claimed.id)

  if (linkErr) console.error('[gp-book] appointment link failed:', linkErr.message)

  return res.status(200).json({
    consultation_id: consult.id,
    booking_code: bookingCode,
    booking_token: bookingToken,
    slot_start: claimed.slot_start,
    slot_end: claimed.slot_end,
  })
}
