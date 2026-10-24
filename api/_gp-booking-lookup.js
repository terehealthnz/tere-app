// Anon POST: look up an existing booking by 6-digit code + DOB.
// Requires both fields to prevent code-only brute force. Flag-gated.

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { isFlagEnabled } from './_flags-server.js'

function admin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!(await isFlagEnabled('gp_scheduled_booking_enabled', { default: false }))) {
    return res.status(404).json({ error: 'Not found' })
  }

  const { booking_code, patient_dob } = req.body || {}
  if (!booking_code || !patient_dob) {
    return res.status(400).json({ error: 'booking_code and patient_dob required' })
  }

  const supabase = admin()
  const hash = sha256(String(booking_code).trim())

  const { data: appt, error } = await supabase
    .from('appointments_gp')
    .select('id, slot_start, slot_end, booking_status, consultation_id, consultations:consultation_id(patient_first_name, patient_last_name, patient_dob, patient_email, patient_phone, patient_nhi, provider_id, status)')
    .eq('booking_code_hash', hash)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[gp-booking-lookup] query failed:', error.message)
    return res.status(500).json({ error: 'Server error' })
  }
  if (!appt || !appt.consultations) {
    return res.status(404).json({ error: 'Booking not found' })
  }
  if (appt.booking_status === 'cancelled' || appt.booking_status === 'no_show') {
    return res.status(410).json({ error: 'Booking is no longer active' })
  }
  if (String(appt.consultations.patient_dob) !== String(patient_dob)) {
    return res.status(404).json({ error: 'Booking not found' })
  }

  return res.status(200).json({
    consultation_id: appt.consultation_id,
    slot_start: appt.slot_start,
    slot_end: appt.slot_end,
    patient: {
      first_name: appt.consultations.patient_first_name,
      last_name: appt.consultations.patient_last_name,
      dob: appt.consultations.patient_dob,
      email: appt.consultations.patient_email,
      phone: appt.consultations.patient_phone,
      nhi: appt.consultations.patient_nhi,
    },
    provider_id: appt.consultations.provider_id,
    status: appt.consultations.status,
  })
}
