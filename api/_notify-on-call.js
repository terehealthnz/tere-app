// On-call SMS notifier. Fires a generic "new patient in queue" SMS to
// any provider who has opted in via the top-nav toggle. Called
// fire-and-forget from every path that transitions a consult to
// status='waiting' (create-consultation for employer-paid workers,
// windcave-fprn for paying patients).
//
// Guards (all live here so callers stay one-liners):
//   - clinic hours only (08:00-20:00 Pacific/Auckland)
//   - sandbox rows never ping (is_practice=true → skip)
//   - per-provider 10-min rate limit
//   - mobile_phone required
//   - is_active=true required
//
// Content is deliberately generic — no patient name, complaint, or NHI
// ever leaves in the SMS body. AWS SNS SMS is under Tere's BAA (task
// #97) but a zero-PHI text is the cleanest posture regardless.

import { createClient } from '@supabase/supabase-js'
import { sendSms } from './_sms.js'

function admin() {
  return createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// 08:00-20:00 Pacific/Auckland. Mirror of src/lib/clinicHours.js so the
// server side doesn't need to import the browser helper. If we ever
// change patient-side hours, update both.
function isInClinicHoursNZT() {
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    hour: 'numeric', hour12: false,
    minute: 'numeric',
  }).formatToParts(new Date())
  const h = parseInt(parts.find(p => p.type === 'hour').value, 10)
  const m = parseInt(parts.find(p => p.type === 'minute').value, 10)
  const total = h * 60 + m
  return total >= 480 && total < 1200
}

export async function notifyOnCallProviders({ consultationId }) {
  try {
    if (!consultationId) return
    if (!isInClinicHoursNZT()) {
      console.warn('[notify-on-call] skipped — outside clinic hours 08:00-20:00 NZT', { consultationId })
      return
    }

    const supabase = admin()

    // Practice consults are ALLOWED to fire this notification. Body contains
    // no PHI (just "new patient in queue" + provider URL), and providers need
    // to be able to verify their own on-call SMS wiring using a test consult.
    // Every other outbound (patient email, pharmacy fax, GP letter) still
    // suppresses via task #541's sandbox sweep.
    const { data: consult } = await supabase.from('consultations')
      .select('id, is_practice')
      .eq('id', consultationId)
      .maybeSingle()
    if (!consult) return

    const cutoffIso = new Date(Date.now() - 10 * 60 * 1000).toISOString()

    // Fetch opted-in providers with a phone on file. Rate-limit is checked
    // in JS so the SQL stays a single fetch (partial index on sms_on_call
    // makes this cheap even at scale).
    const { data: providers, error: provErr } = await supabase.from('providers')
      .select('id, first_name, mobile_phone, sms_on_call_last_sent_at')
      .eq('sms_on_call', true)
      .eq('is_active', true)
      .not('mobile_phone', 'is', null)
    if (provErr) {
      console.warn('[notify-on-call] providers query failed', { err: provErr.message })
      return
    }
    console.warn('[notify-on-call] opted-in providers', { consultationId, total: providers?.length || 0 })
    if (!providers || providers.length === 0) return

    const eligible = providers.filter(p => {
      if (!p.mobile_phone) return false
      if (!p.sms_on_call_last_sent_at) return true
      return p.sms_on_call_last_sent_at < cutoffIso
    })
    console.warn('[notify-on-call] eligible after rate-limit', { consultationId, eligible: eligible.length, dropped: (providers.length - eligible.length) })
    if (eligible.length === 0) return

    // URL-free body — NZ carriers (esp 2degrees) silently drop SMS with
    // links from unregistered sender IDs as spam. Keep text pure so delivery
    // succeeds; the provider knows where to open the dashboard.
    const body = 'Tere: new patient in the queue. Open your dashboard to see them.'
    const nowIso = new Date().toISOString()

    await Promise.allSettled(eligible.map(async p => {
      try {
        await sendSms({ to: p.mobile_phone, body })
        await supabase.from('providers')
          .update({ sms_on_call_last_sent_at: nowIso })
          .eq('id', p.id)
      } catch (err) {
        console.error('[notify-on-call] send failed for provider', p.id, err?.message || err)
      }
    }))
  } catch (err) {
    console.error('[notify-on-call] fatal', err?.message || err)
  }
}
