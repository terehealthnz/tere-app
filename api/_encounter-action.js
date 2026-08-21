// POST /api/encounter-action?id=<consult-uuid>
//   Body: { action: 'call' | 'no_answer' | 'complete_encounter' }
//
// Single endpoint for the three EncounterActionBar buttons. Provider-authed.
// Each action performs a small, well-defined state transition on the consult
// and writes an audit log entry so an auditor can reconstruct exactly what
// happened, when, and by whom.
//
// action='call'
//   - Increments call_attempts
//   - Updates last_attempt_at
//   - Returns { deliveryChannel: 'livekit' | 'phone', reason } based on how
//     recent last_seen_at is (<30s → livekit, else phone). Client uses this
//     to decide whether to render the LiveKit call surface or trigger the
//     phone bridge.
//
// action='no_answer'
//   - Increments no_answer_count + call_attempts
//   - Updates last_attempt_at
//   - On the THIRD no-answer: dismisses the consult (status='no_show'),
//     sets no_show_at, and sends a friendly "start fresh when you're ready"
//     SMS to the patient. Response includes { dismissed: true, smsSent: bool }
//     so the client can update the queue view + show a toast.
//
// action='complete_encounter'
//   - Sets encounter_completed_at = now()
//   - Client navigates to the notes screen; encounter is considered closed.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'
import { resolveDataMode } from './_provider-access-gate.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const FRESHNESS_MS = 30 * 1000  // 30s — matches the 15s heartbeat interval on the client

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const auth = await guardProvider(req, res)
  if (!auth) return

  // Practice-mode scope for encounter state transitions.
  const { practice } = resolveDataMode(auth.provider, req)

  const { id } = req.query || {}
  if (!id) return res.status(400).json({ error: 'id query param required' })
  const { action } = req.body || {}
  if (!action) return res.status(400).json({ error: 'action required' })

  const supabase = admin()
  const { data: consult, error: getErr } = await supabase
    .from('consultations')
    .select('id, status, call_attempts, no_answer_count, last_seen_at, patient_id, patient_phone')
    .eq('id', id)
    .eq('is_practice', practice)
    .maybeSingle()
  if (getErr) return res.status(500).json({ error: getErr.message })
  if (!consult) return res.status(404).json({ error: 'Consultation not found' })

  const now = new Date().toISOString()
  let patch = {}
  let response = { ok: true, action }

  if (action === 'call') {
    patch = {
      call_attempts:   (consult.call_attempts || 0) + 1,
      last_attempt_at: now,
    }
    // Route decision: LiveKit if patient heartbeat is fresh, phone otherwise.
    const lastSeen = consult.last_seen_at ? new Date(consult.last_seen_at).getTime() : 0
    const ageMs = Date.now() - lastSeen
    response.deliveryChannel = ageMs < FRESHNESS_MS ? 'livekit' : 'phone'
    response.reason = ageMs < FRESHNESS_MS
      ? `Patient online (last seen ${Math.round(ageMs / 1000)}s ago)`
      : consult.last_seen_at
        ? `Patient offline (last seen ${Math.round(ageMs / 1000)}s ago); using phone bridge`
        : 'No patient heartbeat recorded; using phone bridge'

  } else if (action === 'no_answer') {
    const newCount = (consult.no_answer_count || 0) + 1
    patch = {
      call_attempts:   (consult.call_attempts || 0) + 1,
      no_answer_count: newCount,
      last_attempt_at: now,
    }
    // Three strikes → dismiss the consult from the active queue and text
    // the patient a friendly invitation to start over. The consult isn't
    // deleted — audit + no-show reporting still needs the row — it's just
    // moved out of the active-queue statuses.
    if (newCount >= 3) {
      patch.status = 'no_show'
      patch.no_show_at = now
      response.dismissed = true

      // Best-effort SMS — a failure here shouldn't block the dismiss.
      if (consult.patient_phone) {
        const appUrl = process.env.VITE_APP_URL || 'https://terehealth.co.nz'
        const smsBody = "Kia ora from Tere Health. We tried to call you a few times but couldn't get through — no problem at all. Whenever you're ready, just start a fresh consultation here: " + appUrl
        try {
          const smsRes = await fetch(`${appUrl}/api/sms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-tere-api-key': process.env.TERE_API_KEY || '' },
            body: JSON.stringify({ to: consult.patient_phone, message: smsBody, type: 'no_answer_dismiss' }),
          })
          response.smsSent = smsRes.ok
          if (!smsRes.ok) {
            const body = await smsRes.text().catch(() => '')
            console.error('[encounter-action] SMS send returned non-OK:', smsRes.status, body)
          }
        } catch (e) {
          response.smsSent = false
          console.error('[encounter-action] SMS send failed:', e.message)
        }
      } else {
        response.smsSent = false
      }
    }

  } else if (action === 'complete_encounter') {
    patch = { encounter_completed_at: now }

  } else {
    return res.status(400).json({ error: `Unknown action: ${action}` })
  }

  const { data: updated, error: updErr } = await supabase
    .from('consultations')
    .update(patch)
    .eq('id', id)
    .eq('is_practice', practice)
    .select('id, status, call_attempts, no_answer_count, encounter_completed_at, last_attempt_at, no_show_at')
    .maybeSingle()
  if (updErr) return res.status(500).json({ error: updErr.message })

  // Audit log — one row per button press. Best-effort; a logging failure
  // does not roll back the state transition.
  try {
    await supabase.from('audit_logs').insert({
      event_type:      `encounter.${action}`,
      provider_id:     auth.provider?.id || null,
      provider_name:   auth.email || null,
      consultation_id: id,
      metadata: { actor_email: auth.email || null, target_type: 'consultation', patch },
    })
  } catch (e) {
    console.error('[encounter-action] audit log write failed:', e.message)
  }

  response.consultation = updated
  return res.status(200).json(response)
}
