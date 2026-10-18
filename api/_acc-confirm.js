// POST /api/acc-confirm
//   Body: { consultationId, decision: 'confirmed' | 'declined', declineReason?,
//           topUpAction?, topUpAmountCents?, providerId }
//
// Records the provider's answer to the mandatory ACC confirmation popup
// that fires at Complete Encounter when a consult is still flagged ACC
// from patient triage (AITriage.jsx:260).
//
//   decision = 'confirmed' → patient's ACC claim is genuine; stamp
//                            acc_provider_confirmed_at/by. is_acc stays true.
//
//   decision = 'declined'  → provider disagrees. Stamp declined_at/by/reason,
//                            flip is_acc=false + acc_eligible='no'. If
//                            topUpAction='charge', also create a Windcave
//                            payment session for the differential and email
//                            the patient a payment link. 'waive' or 'defer'
//                            just set the status column; no outbound action.
//
// Rationale lives in 2026-10-15_acc_provider_confirmation.sql +
// 2026-10-15b_acc_decline_top_up.sql.

import { randomUUID } from 'node:crypto'
import { sendEmail, hasEmailProvider } from './_email-client.js'

const PRIVATE_CONSULT_CENTS = 6500  // Mirrors AccConfirmModal + _windcave-create-session PRICES
const WINDCAVE_SESSION_TTL  = 60 * 60 * 24 * 14  // 14-day payment link validity

function windcaveBasicAuth() {
  const u = process.env.WINDCAVE_USERNAME
  const k = process.env.WINDCAVE_API_KEY
  if (!u || !k) throw new Error('Windcave credentials not configured')
  return 'Basic ' + Buffer.from(`${u}:${k}`).toString('base64')
}

function windcaveBase() {
  return process.env.WINDCAVE_BASE_URL || 'https://uat.windcave.com/api/v1'
}

function siteOrigin(req) {
  return process.env.PUBLIC_SITE_ORIGIN
      || (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host']
          ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
          : 'https://terehealth.co.nz')
}

// Create a Windcave Hosted Payment Page session for the top-up amount.
// Separate from /api/windcave-create-session (which uses the PRICES table
// keyed by consultationType) so we can pass an arbitrary differential.
async function createTopUpSession({ consultationId, amountCents, patientEmail, req }) {
  const merchantRef = `TERE-TOPUP-${consultationId.slice(0, 8)}-${Date.now()}`
  const payload = {
    type:        'purchase',
    amount:      (amountCents / 100).toFixed(2),
    currency:    'NZD',
    merchantReference: merchantRef,
    callbackUrls: {
      approved: `${siteOrigin(req)}/payment/topup-complete?consultation=${consultationId}`,
      declined: `${siteOrigin(req)}/payment/topup-complete?consultation=${consultationId}&status=declined`,
      cancelled: `${siteOrigin(req)}/payment/topup-complete?consultation=${consultationId}&status=cancelled`,
    },
    notificationUrl: `${siteOrigin(req)}/api/windcave-fprn`,
    storeCard: false,
    methods: ['card'],
    language: 'en',
    expires: new Date(Date.now() + WINDCAVE_SESSION_TTL * 1000).toISOString(),
  }
  if (patientEmail) payload.customerEmail = patientEmail

  const r = await fetch(`${windcaveBase()}/sessions`, {
    method: 'POST',
    headers: {
      Authorization: windcaveBasicAuth(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    throw new Error(`Windcave session create failed (${r.status}): ${text.slice(0, 200)}`)
  }
  const data = await r.json()
  const sessionId = data.id || data.sessionId
  const hppUrl = (data.links || []).find(l => l.rel === 'hpp')?.href
  if (!sessionId || !hppUrl) throw new Error('Windcave response missing sessionId / HPP link')
  return { sessionId, hppUrl, merchantRef }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    consultationId, decision, declineReason, providerId,
    topUpAction, topUpAmountCents,
  } = req.body || {}

  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })
  if (decision !== 'confirmed' && decision !== 'declined') {
    return res.status(400).json({ error: 'decision must be "confirmed" or "declined"' })
  }
  if (decision === 'declined' && (!declineReason || !String(declineReason).trim())) {
    return res.status(400).json({ error: 'declineReason required when declining ACC' })
  }
  if (decision === 'declined' && topUpAction && !['charge', 'waive', 'defer'].includes(topUpAction)) {
    return res.status(400).json({ error: 'topUpAction must be charge, waive, or defer' })
  }
  if (decision === 'declined' && topUpAction === 'charge') {
    const n = Number(topUpAmountCents)
    if (!Number.isFinite(n) || n < 100) {
      return res.status(400).json({ error: 'topUpAmountCents must be at least 100 (NZD 1.00)' })
    }
  }

  const supaUrl = process.env.VITE_SUPABASE_URL
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const now = new Date().toISOString()

  // Fetch the current consultation to get patient email + current pricing context.
  const consultRes = await fetch(
    `${supaUrl}/rest/v1/consultations?id=eq.${consultationId}&select=id,patient_email,patient_first_name,patient_name,payment_amount,consultation_type,employer_paid,is_practice`,
    { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } }
  )
  const [consult] = await consultRes.json()
  if (!consult) return res.status(404).json({ error: 'Consultation not found' })

  // Sandbox-safety: on practice consults, record the ACC decision but
  // simulate everything downstream (no Windcave top-up session, no patient
  // email). The row stays flagged so prod reporting ignores it.
  if (consult.is_practice) {
    const patchDry = decision === 'confirmed'
      ? { acc_provider_confirmed_at: now, acc_provider_confirmed_by: providerId || null }
      : { acc_provider_declined_at: now, acc_provider_declined_by: providerId || null, acc_provider_decline_reason: String(declineReason || '').trim() || null }
    await fetch(`${supaUrl}/rest/v1/consultations?id=eq.${consultationId}`, {
      method: 'PATCH',
      headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(patchDry),
    }).catch(() => {})
    return res.status(200).json({ ok: true, simulated: true, skipped: 'practice_mode' })
  }

  // Employer-paid guard: employer paid the flat employer rate upfront, so
  // there's no differential to collect from the patient. Coerce any client
  // "charge" action to "waive" defensively — even if the modal UI was
  // bypassed, we must not create a Windcave session or email the employee
  // asking for money that isn't owed.
  const isEmployerPaid = consult.consultation_type === 'employee'
                      || consult.employer_paid === true

  const patch = decision === 'confirmed'
    ? {
        acc_provider_confirmed_at: now,
        acc_provider_confirmed_by: providerId || null,
        acc_provider_declined_at: null,
        acc_provider_declined_by: null,
        acc_provider_decline_reason: null,
      }
    : {
        acc_provider_declined_at: now,
        acc_provider_declined_by: providerId || null,
        acc_provider_decline_reason: String(declineReason).trim(),
        acc_provider_confirmed_at: null,
        acc_provider_confirmed_by: null,
        is_acc: false,
        acc_eligible: 'no',
      }

  // Top-up handling (decline path only). Status column lets the admin
  // Reclassifications tab show pending/paid/waived/deferred at a glance.
  let topUpResult = null
  // Defensive coercion for employer-paid: never attempt a Windcave charge
  // against an employee whose employer has already paid the consult rate.
  const effectiveTopUpAction = isEmployerPaid && decision === 'declined' ? 'waive' : topUpAction
  if (decision === 'declined' && effectiveTopUpAction) {
    if (effectiveTopUpAction === 'waive') {
      patch.acc_decline_top_up_status = 'waived'
      patch.acc_decline_top_up_amount_cents = 0
    } else if (effectiveTopUpAction === 'defer') {
      patch.acc_decline_top_up_status = 'deferred'
      patch.acc_decline_top_up_amount_cents = PRIVATE_CONSULT_CENTS - (consult.payment_amount || 2500)
    } else if (effectiveTopUpAction === 'charge') {
      try {
        const session = await createTopUpSession({
          consultationId,
          amountCents: Number(topUpAmountCents),
          patientEmail: consult.patient_email,
          req,
        })
        patch.acc_decline_top_up_status      = 'pending'
        patch.acc_decline_top_up_amount_cents = Number(topUpAmountCents)
        patch.acc_decline_top_up_session_id  = session.sessionId

        if (consult.patient_email && hasEmailProvider()) {
          const firstName = consult.patient_first_name || (consult.patient_name || '').split(' ')[0] || 'there'
          try {
            await sendEmail({
              from: 'Tere Health <hello@terehealth.co.nz>',
              replyTo: 'hello@terehealth.co.nz',
              to: consult.patient_email,
              subject: 'Fee adjustment on your Tere Health consult',
              html: `
                <p>Hi ${firstName},</p>
                <p>Quick admin note following your consult.</p>
                <p>On review, your diagnosis isn't an ACC-eligible condition. ACC covers injuries from accidents; infections, illnesses, and medical reviews sit outside that definition.</p>
                <p>The $${((consult.payment_amount || 2500) / 100).toFixed(2)} you paid was the ACC co-pay portion of the fee rather than our standard private consult rate. The balance owing is <strong>$${(Number(topUpAmountCents) / 100).toFixed(2)}</strong>.</p>
                <p><a href="${session.hppUrl}" style="display:inline-block;background:#0B6E76;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">Pay $${(Number(topUpAmountCents) / 100).toFixed(2)} securely</a></p>
                <p style="font-size:.875rem;color:#64748B">Link valid for 14 days. Processed via Windcave, our PCI-compliant payment partner. Reply to this email if you have questions.</p>
                <p>Tere Health admin<br>hello@terehealth.co.nz<br>terehealth.co.nz</p>
              `,
            })
            patch.acc_decline_top_up_sent_at = now
          } catch (e) {
            console.warn('[acc-confirm] top-up email failed, session still created:', e.message)
          }
        }
        topUpResult = { sessionId: session.sessionId, hppUrl: session.hppUrl, emailSent: !!patch.acc_decline_top_up_sent_at }
      } catch (e) {
        console.error('[acc-confirm] top-up session create failed:', e.message)
        return res.status(500).json({ error: `Top-up Windcave session failed: ${e.message}` })
      }
    }
  }

  const r = await fetch(`${supaUrl}/rest/v1/consultations?id=eq.${consultationId}`, {
    method: 'PATCH',
    headers: {
      apikey:        supaKey,
      Authorization: `Bearer ${supaKey}`,
      'Content-Type':'application/json',
      Prefer:        'return=representation',
    },
    body: JSON.stringify(patch),
  })

  if (!r.ok) {
    const text = await r.text().catch(() => '')
    console.error('[acc-confirm] PATCH failed:', r.status, text)
    return res.status(500).json({ error: 'Failed to record provider ACC decision' })
  }

  const [updated] = await r.json()
  return res.status(200).json({ ok: true, consultation: updated, decision, topUp: topUpResult })
}
