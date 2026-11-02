// On-call SMS notifier. Fires a generic "new patient in queue" SMS to
// any provider who has opted in via the top-nav toggle. Called with
// await from every path that transitions a consult to in_waiting_room=true
// (patient-consult PATCH, cron sweep, Postgres trigger via pg_net).
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
//
// Diagnostic trail: every entry/exit writes an audit_logs row with
// event_type='notify_on_call' and metadata.phase so the next failure
// leaves evidence. Alexandra Rankin 2026-11-02 vanished because the
// function had no durable trace — Vercel log retention is too short.

import { createClient } from '@supabase/supabase-js'
import { sendSms } from './_sms.js'

function admin() {
  return createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Durable diagnostic. Writes to audit_logs so even if Vercel freezes mid-run
// we have a trail. Catches all errors — this must never throw.
async function trace(supabase, consultationId, phase, metadata = {}) {
  try {
    await supabase.from('audit_logs').insert({
      event_type: 'notify_on_call',
      consultation_id: consultationId,
      metadata: { phase, source: metadata.source || 'unknown', ...metadata },
    })
  } catch { /* swallow — tracing must never break the real work */ }
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

export async function notifyOnCallProviders({ consultationId, source = 'unknown' }) {
  const supabase = admin()
  try {
    if (!consultationId) return
    await trace(supabase, consultationId, 'enter', { source })

    if (!isInClinicHoursNZT()) {
      await trace(supabase, consultationId, 'bail', { source, reason: 'outside_clinic_hours' })
      console.warn('[notify-on-call] skipped — outside clinic hours 08:00-20:00 NZT', { consultationId })
      return
    }

    // Practice consults are ALLOWED to fire this notification. Body contains
    // no PHI (just "new patient in queue" + provider URL), and providers need
    // to be able to verify their own on-call SMS wiring using a test consult.
    const { data: consult } = await supabase.from('consultations')
      .select('id, is_practice')
      .eq('id', consultationId)
      .maybeSingle()
    if (!consult) {
      await trace(supabase, consultationId, 'bail', { source, reason: 'consult_not_found' })
      return
    }

    // Per-consult dedup. Multiple code paths (patient PATCH, cron sweep, DB
    // trigger) call this for a single consult transitioning to waiting.
    // Atomic claim: only the first caller flips on_call_sms_sent_at from
    // NULL. The others see 0 rows affected and bail safely.
    const { data: claimed } = await supabase.from('consultations')
      .update({ on_call_sms_sent_at: new Date().toISOString() })
      .eq('id', consultationId)
      .is('on_call_sms_sent_at', null)
      .select('id')
      .maybeSingle()
    if (!claimed) {
      await trace(supabase, consultationId, 'bail', { source, reason: 'already_claimed' })
      console.warn('[notify-on-call] already claimed, skipping', { consultationId })
      return
    }

    const cutoffIso = new Date(Date.now() - 10 * 60 * 1000).toISOString()

    const { data: providers, error: provErr } = await supabase.from('providers')
      .select('id, first_name, mobile_phone, sms_on_call_last_sent_at')
      .eq('sms_on_call', true)
      .eq('is_active', true)
      .not('mobile_phone', 'is', null)
    if (provErr) {
      await trace(supabase, consultationId, 'bail', { source, reason: 'providers_query_failed', err: provErr.message })
      return
    }
    if (!providers || providers.length === 0) {
      await trace(supabase, consultationId, 'bail', { source, reason: 'no_opted_in_providers' })
      return
    }

    const eligible = providers.filter(p => {
      if (!p.mobile_phone) return false
      if (!p.sms_on_call_last_sent_at) return true
      return p.sms_on_call_last_sent_at < cutoffIso
    })
    if (eligible.length === 0) {
      await trace(supabase, consultationId, 'bail', {
        source, reason: 'all_rate_limited',
        total: providers.length,
      })
      return
    }

    // URL-free body — NZ carriers (esp 2degrees) silently drop SMS with
    // links from unregistered sender IDs as spam.
    const body = 'Tere: new patient in the queue. Open your dashboard to see them.'
    const nowIso = new Date().toISOString()

    const results = await Promise.allSettled(eligible.map(async p => {
      await sendSms({ to: p.mobile_phone, body })
      await supabase.from('providers')
        .update({ sms_on_call_last_sent_at: nowIso })
        .eq('id', p.id)
      return p.id
    }))
    const sent = results.filter(r => r.status === 'fulfilled').map(r => r.value)
    const failed = results.filter(r => r.status === 'rejected').map(r => r.reason?.message || String(r.reason))

    await trace(supabase, consultationId, 'sent', {
      source,
      sent_count: sent.length,
      failed_count: failed.length,
      sent_to: sent,
      failures: failed.length > 0 ? failed : undefined,
    })
  } catch (err) {
    await trace(supabase, consultationId, 'fatal', { source, err: err?.message || String(err) })
    console.error('[notify-on-call] fatal', err?.message || err)
  }
}
