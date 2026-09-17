// _payment-release.js — release an uncaptured card hold on a consult.
//
// Shared helper used by:
//   /api/cancel-payment      (patient-facing: WaitingRoom cancel)
//   /api/mark-no-show        (provider-facing: 2nd ring timeout)
//   /api/patient-consult     (patient-facing: PATCH status=cancelled)
//
// Dispatch mirrors /api/capture-payment: paymentIntentId shape decides
// which processor's void endpoint to call.
//   - Stripe:   'pi_...'  → stripe.paymentIntents.cancel()
//   - Windcave: UUID       → POST /transactions type=refund (voids uncaptured auths)
//
// Windcave semantics: 'refund' against an uncaptured auth session acts as a
// void — the hold is released and the patient's card is never billed.
// Against a completed transaction it acts as a normal refund. Either way,
// the money returns to the patient.
//
// Returns { ok, provider, message } — callers can log but shouldn't block
// the user-facing action on a release failure (the auth will expire on its
// own within 7 days regardless).

import { randomUUID } from 'node:crypto'
import Stripe from 'stripe'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isWindcaveId(id) { return UUID_RE.test(String(id || '')) }

function windcaveBasicAuth() {
  return 'Basic ' + Buffer.from(`${process.env.WINDCAVE_USERNAME}:${process.env.WINDCAVE_API_KEY}`).toString('base64')
}
function windcaveBaseUrl() {
  return process.env.WINDCAVE_BASE_URL || 'https://uat.windcave.com/api/v1'
}

async function releaseWindcave(sessionId, amountCents) {
  const amt = Number.isFinite(amountCents) && amountCents > 0
    ? (amountCents / 100).toFixed(2)
    : null
  if (!amt) return { ok: false, provider: 'windcave', message: 'amount required to void Windcave auth' }
  const r = await fetch(`${windcaveBaseUrl()}/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Accept':        'application/json',
      'Authorization': windcaveBasicAuth(),
      'X-ID':          randomUUID(),
    },
    body: JSON.stringify({ type: 'refund', amount: amt, sessionId }),
  })
  const data = await r.json().catch(() => ({}))
  const approved = r.ok && (data.responseCode === '00' || data.authorised === true)
  return {
    ok: approved,
    provider: 'windcave',
    message: approved ? 'auth released' : `windcave ${r.status}: ${data.responseText || data.error || 'not approved'}`,
    raw: data,
  }
}

async function releaseStripe(paymentIntentId) {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const intent = await stripe.paymentIntents.cancel(paymentIntentId)
    return { ok: true, provider: 'stripe', message: `stripe status=${intent.status}` }
  } catch (e) {
    return { ok: false, provider: 'stripe', message: e?.message || 'stripe cancel failed' }
  }
}

/**
 * Release an uncaptured hold. Safe to call regardless of processor.
 * @param {string} paymentIntentId  Stripe intent id or Windcave sessionId
 * @param {number} [amountCents]    Required for Windcave voids; ignored for Stripe
 * @returns {Promise<{ ok:boolean, provider:string, message:string }>}
 */
export async function releaseHold(paymentIntentId, amountCents) {
  if (!paymentIntentId) return { ok: false, provider: 'none', message: 'no paymentIntentId' }
  if (isWindcaveId(paymentIntentId)) return releaseWindcave(paymentIntentId, amountCents)
  return releaseStripe(paymentIntentId)
}
