import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function toE164NZ(phone) {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('64')) return `+${digits}`
  if (digits.startsWith('0')) return `+64${digits.slice(1)}`
  return `+64${digits}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { consultationId } = req.body
  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

  const { data: consult, error: fetchError } = await supabase
    .from('consultations')
    .select('id, patient_phone, patient_first_name, call_attempts')
    .eq('id', consultationId)
    .single()

  if (fetchError || !consult) return res.status(404).json({ error: 'Consultation not found' })
  if (!consult.patient_phone) return res.status(400).json({ error: 'No phone number on record for this patient' })

  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  const to = toE164NZ(consult.patient_phone)
  const base = 'https://terehealth.co.nz'

  try {
    const call = await client.calls.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER,
      url: `${base}/api/twilio-connect?consultationId=${consultationId}`,
      fallbackUrl: `${base}/api/twilio-fallback`,
      statusCallback: `${base}/api/twilio-status`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      record: true,
      recordingChannels: 'dual',
      recordingStatusCallback: `${base}/api/twilio-recording`,
      recordingStatusCallbackEvent: ['completed'],
      machineDetection: 'Enable',
      timeout: 30,
    })

    const attempts = (consult.call_attempts || 0) + 1
    await supabase
      .from('consultations')
      .update({
        twilio_call_sid: call.sid,
        twilio_call_status: 'dialling',
        call_started_at: new Date().toISOString(),
        call_attempts: attempts,
      })
      .eq('id', consultationId)

    res.json({ success: true, callSid: call.sid })
  } catch (err) {
    console.error('Twilio make-call error:', err)
    res.status(500).json({ error: err.message })
  }
}
