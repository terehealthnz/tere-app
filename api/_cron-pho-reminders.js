// PHO rural GP — SMS reminder 15 min before each scheduled appointment.
//
// Runs every 5 minutes. On each tick:
//   1. Find scheduled consultations with reminder_sent_at IS NULL where
//      scheduled_for is 10-20 min from now (i.e. the "about 15 min out"
//      window, with 5 min of slack on either side so a one-off cron skip
//      still fires the reminder).
//   2. Send SMS with the SMS-join link /gp/<practice-slug>/join?c=<id>.
//   3. Stamp reminder_sent_at — dedup guard against restarts and
//      overlapping runs.
//
// Cron window logic matches the 5-min cadence. Patients booked less
// than 10 min out never get an auto-reminder — the booking confirmation
// screen is the only prompt, which is intentional (we'd rather someone
// book 5 min out keep the page open than start spraying SMS at them).

import { createClient } from '@supabase/supabase-js'
import { sendSms } from './_sms.js'

const sb = () => createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function joinUrl(slug, consultId) {
  const base = process.env.PUBLIC_BASE_URL || 'https://terehealth.co.nz'
  return `${base}/gp/${slug}/join?c=${consultId}`
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', minute: '2-digit' })
}

export default async function handler(req, res) {
  const supabase = sb()
  const now  = Date.now()
  const from = new Date(now + 10 * 60 * 1000).toISOString()  // 10 min out
  const to   = new Date(now + 20 * 60 * 1000).toISOString()  // 20 min out

  const { data: due, error } = await supabase.from('consultations')
    .select('id,patient_phone,patient_first_name,scheduled_for,rural_practice_id,rural_practices(slug,name)')
    .eq('booking_type', 'scheduled')
    .is('reminder_sent_at', null)
    .in('status', ['scheduled', 'waiting'])
    .gte('scheduled_for', from)
    .lte('scheduled_for', to)
    .not('patient_phone', 'is', null)

  if (error) {
    console.error('[cron-pho-reminders] query failed:', error)
    return res.status(500).json({ error: error.message })
  }

  let sent = 0, failed = 0
  for (const c of (due || [])) {
    const practiceSlug = c.rural_practices?.slug
    const practiceName = c.rural_practices?.name || 'your appointment'
    if (!practiceSlug) continue  // Shouldn't happen — rural_practice_id FK is NOT NULL on rural-scheduled rows
    const body = `Tere Health: Hi ${c.patient_first_name || ''}, your ${practiceName} appointment is at ${fmtTime(c.scheduled_for)}. Tap to join: ${joinUrl(practiceSlug, c.id)}`
    try {
      const smsResult = await sendSms({ to: c.patient_phone, body })
      if (smsResult && smsResult.ok === false && !smsResult.skipped) throw new Error(smsResult.error || 'sendSms failed')
      // Stamp whether real send OR skipped (provider not configured) — either way
      // we don't want a second attempt firing 5 min later.
      await supabase.from('consultations').update({ reminder_sent_at: new Date().toISOString() }).eq('id', c.id)
      sent++
    } catch (e) {
      console.error(`[cron-pho-reminders] SMS failed for consult ${c.id}:`, e.message)
      failed++
    }
  }

  return res.status(200).json({ ok: true, scanned: (due || []).length, sent, failed })
}
