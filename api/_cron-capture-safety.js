// Nightly safety-net for Windcave captures that didn't settle.
//
// Runs ~04:00 NZT. Scans for consults where Windcave authorised the hold
// (payment_authorised_at IS NOT NULL) but we never completed the capture
// (payment_captured_at IS NULL) more than 2 hours after the auth. These
// are patients whose card has money held but Tere hasn't claimed it —
// either (a) the provider never clicked Finalise notes (capture is fired
// from NotesCompletion.jsx), or (b) the capture call failed silently.
//
// Visa holds expire after 7-30 days — anything in this state eventually
// drops off the card without funds moving, so an alert at 2h is early
// enough to intervene manually (manually finalise, retry capture via
// /api/capture-consult, or refund the hold).
//
// Precedent: this exists because of the Callie Moyo incident 2026-10-24
// where the capture DID settle but the Windcave Comp lag made it look
// otherwise. Even though that case was benign, the same symptom would
// have hidden a genuine capture-skip. See [[prod-db-owns-truth]].
//
// Manual test: GET /api/cron-capture-safety?secret=<CRON_SECRET>&force=1
//   force=1 emails even when nothing's stuck (verifies the cron is wired).

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from './_email-client.js'

const STUCK_AFTER_HOURS = 2
const ADMIN_EMAIL = 'terehealthnz@gmail.com'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export default async function handler(req, res) {
  const { verifyCronSecret } = await import('./_cron-auth.js')
  if (!verifyCronSecret(req)) return res.status(401).json({ error: 'Unauthorized' })

  const force = req.query?.force === '1'
  const supabase = admin()
  const cutoffIso = new Date(Date.now() - STUCK_AFTER_HOURS * 3600 * 1000).toISOString()

  const { data: stuck, error } = await supabase
    .from('consultations')
    .select('id, patient_first_name, patient_last_name, patient_email, patient_phone, payment_amount, payment_authorised_at, payment_intent_id, created_at, is_practice')
    .not('payment_authorised_at', 'is', null)
    .is('payment_captured_at', null)
    .eq('is_practice', false)
    .lt('payment_authorised_at', cutoffIso)
    .order('payment_authorised_at', { ascending: true })
    .limit(100)

  if (error) {
    console.error('[cron-capture-safety] query failed:', error.message)
    return res.status(500).json({ error: 'query failed' })
  }

  const count = stuck?.length || 0
  if (count === 0 && !force) {
    return res.status(200).json({ ok: true, stuck: 0, sent: false })
  }

  const rows = (stuck || []).map(c => {
    const hoursSince = Math.round((Date.now() - new Date(c.payment_authorised_at).getTime()) / 3600_000)
    const amount = c.payment_amount ? `$${(c.payment_amount / 100).toFixed(2)}` : 'unknown'
    const name = `${c.patient_first_name || ''} ${c.patient_last_name || ''}`.trim() || '(no name)'
    const contact = [c.patient_email, c.patient_phone].filter(Boolean).join(' / ') || '(no contact)'
    return `  • ${name} — ${amount} — authorised ${hoursSince}h ago — consult ${c.id}\n    ${contact}\n    Windcave session: ${c.payment_intent_id || '(none)'}`
  }).join('\n\n')

  const html = `<p><strong>${count}</strong> consult${count === 1 ? '' : 's'} with Windcave auth but no capture after ${STUCK_AFTER_HOURS}h.</p>
<p>Each one has money on hold on the patient's card but Tere hasn't completed the capture. Review in admin, finalise the notes if not done, or retry capture via <code>/api/capture-consult</code> with the consult id.</p>
<pre style="font-family:monospace;font-size:13px;background:#f8fafc;padding:12px;border-radius:6px;white-space:pre-wrap">${rows || '(no stuck consults — force mode)'}</pre>`

  await sendEmail({
    from: 'Tere Health <hello@terehealth.co.nz>',
    to: [ADMIN_EMAIL],
    subject: `[Tere] ${count} unsettled payment${count === 1 ? '' : 's'} — capture didn't fire`,
    html,
    text: `${count} consults with Windcave auth but no capture after ${STUCK_AFTER_HOURS}h.\n\n${rows}`,
  }).catch(e => console.error('[cron-capture-safety] email failed:', e.message))

  return res.status(200).json({ ok: true, stuck: count, sent: true })
}
