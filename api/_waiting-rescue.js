// Patient-side rescue: force a stuck consult back to 'waiting' so the
// provider queue can pick it up again. Backstop for the "Something went
// wrong with your consultation" dead-end where the WaitingRoom poll has
// given up on the consult (e.g. status drift, silent server error).
//
// Uses service_role directly to bypass RLS — the /api/confirm-waiting
// endpoint returns 404 in this scenario for reasons still under
// investigation. Rescue is idempotent and safe: it only flips consult
// status back to 'waiting', doesn't touch payment, notes, or vitals.

import { resolvePatientAuth } from './_patient-token.js'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { consultationId } = req.body || {}
  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

  let auth
  try {
    auth = await resolvePatientAuth(req, { legacyConsultId: consultationId })
  } catch (e) {
    console.error('[waiting-rescue] auth threw:', e?.message || e, e?.stack)
    return res.status(500).json({ error: 'Server error' })
  }
  if (auth.error) return res.status(auth.status).json({ error: auth.error })
  if (auth.consultationId !== consultationId) {
    return res.status(403).json({ error: 'Token does not match consultation' })
  }

  try {
    const supabase = admin()
    const { data: consult, error: readErr } = await supabase
      .from('consultations')
      .select('id, status, payment_status, payment_intent_id')
      .eq('id', consultationId)
      .maybeSingle()

    if (readErr) {
      console.error('[waiting-rescue] read failed:', readErr)
      return res.status(500).json({ error: 'Server error' })
    }
    if (!consult) {
      // Truly deleted. Nothing we can do — patient needs to start a fresh
      // consult. Client shows "start over" CTA instead of "rejoin".
      return res.status(404).json({ error: 'Consultation not found — please start a new consultation.', code: 'GONE' })
    }

    // Already in the queue — no-op success.
    if (consult.status === 'waiting') {
      return res.status(200).json({ ok: true, alreadyWaiting: true, status: consult.status })
    }

    // Statuses safe to flip back to 'waiting'. Includes the "provider
    // closed the case" trio (expired = Dismiss button, no_show = No Answer,
    // cancelled = provider cancel) because the patient explicitly hitting
    // "Try to rejoin the queue" is a clear signal they still want to be
    // seen. They've already paid and triaged — forcing them through both
    // again for a mistaken/stale close is bad UX and loses paying patients.
    //
    // NOT rescuable: 'in_progress' (provider actively working — would
    // double-book), 'complete'/'notes' (finished — need a new consult),
    // 'abandoned' (auto-lock-release marker — code path currently unused
    // but reserved).
    const RESCUABLE = new Set([
      'draft', 'waitlisted', 'vitals_requested', 'vitals_complete', 'ready',
      'expired', 'no_show', 'cancelled',
    ])
    if (!RESCUABLE.has(consult.status)) {
      return res.status(409).json({
        error: `Cannot rejoin queue from status "${consult.status}"`,
        currentStatus: consult.status,
      })
    }

    // Draft with no payment attached can't be rescued — a scraper could
    // otherwise page providers without paying. For 'expired' etc, the
    // payment was already authorised before the provider closed the case,
    // so we skip this check for those (payment_intent_id on the row is
    // the proof).
    if (consult.status === 'draft' && consult.payment_status !== 'authorised') {
      return res.status(400).json({ error: 'Payment not confirmed yet — try again in a minute.' })
    }
    if (['expired', 'no_show', 'cancelled'].includes(consult.status) && !consult.payment_intent_id) {
      return res.status(400).json({ error: 'This consult has no payment on file and cannot be re-opened. Please start a new consultation.' })
    }

    const { error: updateErr } = await supabase
      .from('consultations')
      .update({ status: 'waiting', updated_at: new Date().toISOString() })
      .eq('id', consultationId)

    if (updateErr) {
      console.error('[waiting-rescue] update failed:', updateErr)
      return res.status(500).json({ error: 'Server error', detail: updateErr.message })
    }

    return res.status(200).json({ ok: true, promoted: true, previousStatus: consult.status })
  } catch (e) {
    console.error('[waiting-rescue] fatal', e?.message || e, e?.stack)
    return res.status(500).json({ error: 'Server error' })
  }
}
