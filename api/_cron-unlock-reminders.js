// /api/cron-unlock-reminders — daily reminder to gated providers.
//
// Runs from vercel.json crons. Finds providers whose onboarding gate
// (patient_access_from) unlocks in the next 24-36 hours and sends them
// a heads-up email. Sets patient_access_unlock_email_sent_at so a
// second run doesn't spam.
//
// Auth: CRON_SECRET as ?secret= or Authorization: Bearer <CRON_SECRET>.

import { createClient } from '@supabase/supabase-js'
import { sendEmail as sendEmailProvider , hasEmailProvider} from './_email-client.js'

// Inline email helper — routes through the provider-agnostic
// _email-client.js (Resend or SES depending on EMAIL_PROVIDER). Retains
// throw-on-failure semantics so the caller's try/catch still marks the
// row as skipped rather than swallowing errors silently.
async function sendEmail({ to, subject, html, text }) {
  const key = hasEmailProvider()
  if (!key) throw new Error('RESEND_API_KEY not set')
  const from = process.env.RESEND_FROM || 'Tere Health <hello@terehealth.co.nz>'
  const r = await sendEmailProvider({ from, to, subject, html, text })
  if (!r.ok) throw new Error(`Email send failed: ${r.error || 'unknown'}`)
}

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function bearerToken(req) {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7) : ''
}

export default async function handler(req, res) {
  const { verifyCronSecret } = await import('./_cron-auth.js')
  if (!verifyCronSecret(req)) return res.status(401).json({ error: 'unauthorised' })

  const supabase = admin()
  const nowMs = Date.now()
  const in24h = new Date(nowMs + 24 * 60 * 60 * 1000).toISOString()
  const in36h = new Date(nowMs + 36 * 60 * 60 * 1000).toISOString()

  // Providers whose gate unlocks 24-36h from now, haven't been reminded yet.
  const { data: providers, error } = await supabase
    .from('providers')
    .select('id, email, first_name, patient_access_from')
    .not('patient_access_from', 'is', null)
    .gte('patient_access_from', in24h)
    .lte('patient_access_from', in36h)
    .is('patient_access_unlock_email_sent_at', null)

  if (error) { console.error('[cron-unlock-reminders] error failed:', error); return res.status(500).json({ error: 'Server error' }) }

  const results = []
  for (const p of (providers || [])) {
    if (!p.email) { results.push({ id: p.id, ok: false, reason: 'no_email' }); continue }
    const unlockDate = new Date(p.patient_access_from)
    const unlockPretty = unlockDate.toLocaleString('en-NZ', {
      dateStyle: 'full', timeStyle: 'short',
    })
    const first = p.first_name || 'there'
    try {
      await sendEmail({
        to:      p.email,
        subject: `Your Tere Health access unlocks tomorrow`,
        html: `
          <p>Kia ora ${first},</p>
          <p>Just a heads-up — your full patient access on Tere Health unlocks tomorrow:</p>
          <p><strong>${unlockPretty}</strong></p>
          <p>Until then you can keep logging in and using the practice sandbox to get familiar with the workflow. Once your unlock date passes, the practice banner disappears and real patients start appearing in your queue.</p>
          <p>Any questions before you go live, hit reply.</p>
          <p>Thanks,<br/>The Tere team</p>
        `,
        text: `Kia ora ${first},\n\nJust a heads-up — your full patient access on Tere Health unlocks tomorrow:\n\n${unlockPretty}\n\nUntil then you can keep logging in and using the practice sandbox to get familiar with the workflow. Once your unlock date passes, the practice banner disappears and real patients start appearing in your queue.\n\nAny questions before you go live, hit reply.\n\nThanks,\nThe Tere team`,
      })
      await supabase.from('providers')
        .update({ patient_access_unlock_email_sent_at: new Date().toISOString() })
        .eq('id', p.id)
      results.push({ id: p.id, ok: true })
    } catch (e) {
      console.error('[cron-unlock-reminders] failed for provider', p.id, e)
      results.push({ id: p.id, ok: false, error: 'unlock reminder failed' })
    }
  }

  return res.status(200).json({ scanned: providers?.length || 0, results })
}
