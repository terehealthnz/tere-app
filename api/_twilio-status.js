import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  // Twilio sends form-encoded POST
  const callSid = req.body?.CallSid
  const callStatus = req.body?.CallStatus  // initiated|ringing|in-progress|completed|busy|no-answer|failed|canceled
  const duration = req.body?.Duration ? parseInt(req.body.Duration) : null
  const answeredBy = req.body?.AnsweredBy  // human|machine_start|fax|unknown (AMD)

  if (!callSid) return res.status(400).send('Missing CallSid')

  // Map Twilio status to our internal status
  const statusMap = {
    'initiated':   'dialling',
    'ringing':     'ringing',
    'in-progress': 'answered',
    'completed':   'completed',
    'busy':        'busy',
    'no-answer':   'no_answer',
    'failed':      'failed',
    'canceled':    'canceled',
  }
  const twilioCallStatus = statusMap[callStatus] || callStatus

  // Find the consultation by call SID
  const { data: consult } = await supabase
    .from('consultations')
    .select('id, status')
    .eq('twilio_call_sid', callSid)
    .single()

  if (!consult) {
    // SID not found — might be an old or unknown call
    return res.status(200).send('OK')
  }

  const patch = { twilio_call_status: twilioCallStatus }

  if (callStatus === 'completed' || callStatus === 'busy' || callStatus === 'no-answer' || callStatus === 'failed') {
    patch.call_ended_at = new Date().toISOString()
    if (duration !== null) patch.call_duration_seconds = duration
    // Voicemail detected — mark as no_answer
    if (answeredBy && answeredBy !== 'human') {
      patch.twilio_call_status = 'no_answer'
    }
  }

  await supabase
    .from('consultations')
    .update(patch)
    .eq('id', consult.id)

  res.status(200).send('OK')
}
