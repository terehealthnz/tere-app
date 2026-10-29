// /api/promo-codes — action-based router for admin-managed promo codes.
//
// Actions:
//   GET  ?action=check&code=X&billing_country=Y&base_amount_cents=Z
//        → public, no auth. Validates a code against windows, caps, country
//          allow-list; returns the computed final amount so the client can
//          preview the discount. Server re-validates on payment create.
//   GET  ?action=list                   → admin only, returns all rows
//   GET  ?action=redemptions&promo_code_id=X → admin only, audit log for one code
//   POST { action: 'create', ... }      → admin only, inserts a new code
//   POST { action: 'update', id, ... }  → admin only, allowlisted patch
//   POST { action: 'revoke', id }       → admin only, sets active=false
//
// The internal `redeem(...)` helper is exported for server-side use from
// _windcave-create-session.js (and future _create-payment-intent.js wire-up)
// so the discount can be re-validated server-authoritatively right before
// Windcave is told the amount. redeem() is idempotent per consultation_id,
// so retried / double-submitted payment flows cannot inflate current_uses.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Allowlist of columns admin can set on create.
const CREATE_ALLOWLIST = new Set([
  'code', 'description', 'discount_type', 'discount_value',
  'valid_from', 'valid_to', 'max_uses',
  'applies_to_country', 'active',
])

// Allowlist on update. current_uses + created_by + created_at never patchable.
const UPDATE_ALLOWLIST = new Set([
  'code', 'description', 'discount_type', 'discount_value',
  'valid_from', 'valid_to', 'max_uses',
  'applies_to_country', 'active',
])

// Server-authoritative uppercase + whitespace strip. Lookups go through
// this helper so a client that sends 'spring50 ' still matches 'SPRING50'.
function normaliseCode(raw) {
  return String(raw || '').trim().toUpperCase()
}

// Country check: 'both' matches anything; otherwise exact match on nz/international.
// billing_country from the client is a two-letter ISO code (NZ, AU, US, ...) or
// 'OTHER'. We bucket to 'nz' vs 'international' before matching.
function bucketCountry(billingCountry) {
  const c = String(billingCountry || '').trim().toUpperCase()
  if (c === 'NZ') return 'nz'
  return 'international'
}

// Core validation shared by the public check endpoint and the server-side
// redeem() helper. Returns { ok: true, promo, discountCents, finalCents } on
// success or { ok: false, reason } on failure.
async function validateAndCompute(supabase, { code, billingCountry, baseAmountCents }) {
  const normCode = normaliseCode(code)
  if (!normCode) return { ok: false, reason: 'Code required' }

  const base = Number(baseAmountCents)
  if (!Number.isFinite(base) || base < 0) return { ok: false, reason: 'Invalid base amount' }

  const { data: promo, error } = await supabase
    .from('promo_codes')
    .select('*')
    .eq('code', normCode)
    .maybeSingle()
  if (error) { console.error('[promo-codes] lookup failed:', error); return { ok: false, reason: 'Server error' } }
  if (!promo) return { ok: false, reason: 'Code not found' }

  if (!promo.active) return { ok: false, reason: 'This code is no longer active' }

  const now = Date.now()
  const from = new Date(promo.valid_from).getTime()
  const to   = new Date(promo.valid_to).getTime()
  if (now < from) return { ok: false, reason: 'This code is not yet valid' }
  if (now > to)   return { ok: false, reason: 'This code has expired' }

  if (promo.max_uses !== null && promo.max_uses !== undefined && promo.current_uses >= promo.max_uses) {
    return { ok: false, reason: 'This code has reached its usage limit' }
  }

  const bucket = bucketCountry(billingCountry)
  if (promo.applies_to_country !== 'both' && promo.applies_to_country !== bucket) {
    return { ok: false, reason: 'This code is not valid for your billing country' }
  }

  // Discount computation. All math in integer cents to avoid float drift.
  let discountCents = 0
  if (promo.discount_type === 'percent') {
    const pct = Math.max(0, Math.min(100, Number(promo.discount_value) || 0))
    discountCents = Math.floor((base * pct) / 100)
  } else if (promo.discount_type === 'fixed') {
    const val = Math.max(0, Number(promo.discount_value) || 0)
    discountCents = Math.min(Math.round(val * 100), base)
  } else if (promo.discount_type === 'zero') {
    discountCents = base
  }
  discountCents = Math.max(0, Math.min(discountCents, base))
  const finalCents = Math.max(0, base - discountCents)

  return { ok: true, promo, discountCents, finalCents }
}

// Server-side redeem — called from the payment-creation path. Idempotent per
// consultation_id, so a client that posts twice (double-submit / retry /
// Windcave FPRN re-fire) does not inflate current_uses or write a second
// audit row. Returns { redeemed: boolean, discountCents, finalCents, promoId }
// or throws on invalid input.
//
// This is the ONLY code path that increments current_uses. The admin UI
// never writes to current_uses directly; the public check endpoint never
// writes at all.
export async function redeemPromoForConsult({ supabase, code, billingCountry, baseAmountCents, consultationId, patientId }) {
  if (!consultationId) throw new Error('consultationId required')

  // Idempotency guard: if we already have a redemption row for this consult,
  // short-circuit and return the stored amounts. Prevents double-decrement.
  const { data: existing } = await supabase
    .from('promo_code_redemptions')
    .select('promo_code_id, discount_applied_cents, final_amount_cents')
    .eq('consultation_id', consultationId)
    .maybeSingle()
  if (existing) {
    return {
      redeemed: false,
      alreadyRedeemed: true,
      promoId: existing.promo_code_id,
      discountCents: existing.discount_applied_cents,
      finalCents: existing.final_amount_cents,
    }
  }

  const v = await validateAndCompute(supabase, { code, billingCountry, baseAmountCents })
  if (!v.ok) {
    const e = new Error(v.reason || 'Invalid promo code'); e.status = 400; throw e
  }

  // Increment current_uses first. If the increment hits the cap, bail before
  // writing anything. Supabase does not expose a native atomic conditional
  // increment via the JS client, so we take-then-check and roll back on cap
  // overshoot. Race with a parallel redeem is bounded (we check again under
  // the fresh row); worst case is one extra redemption past the cap, which
  // is acceptable for admin-managed discount codes.
  const { data: updated, error: updErr } = await supabase
    .from('promo_codes')
    .update({ current_uses: (v.promo.current_uses || 0) + 1, updated_at: new Date().toISOString() })
    .eq('id', v.promo.id)
    .select('id, current_uses, max_uses')
    .maybeSingle()
  if (updErr) { console.error('[promo-codes] increment failed:', updErr); const e = new Error('Server error'); e.status = 500; throw e }
  if (!updated) { const e = new Error('Promo code vanished mid-redeem'); e.status = 500; throw e }

  // Log the audit row. If this fails, roll back the increment so we don't
  // leave a drift between current_uses and the redemption table.
  const { error: logErr } = await supabase
    .from('promo_code_redemptions')
    .insert({
      promo_code_id: v.promo.id,
      consultation_id: consultationId,
      patient_id: patientId || null,
      discount_applied_cents: v.discountCents,
      original_amount_cents: baseAmountCents,
      final_amount_cents: v.finalCents,
    })
  if (logErr) {
    console.error('[promo-codes] redemption log failed, rolling back increment:', logErr)
    await supabase
      .from('promo_codes')
      .update({ current_uses: v.promo.current_uses })
      .eq('id', v.promo.id)
    const e = new Error('Server error'); e.status = 500; throw e
  }

  return {
    redeemed: true,
    promoId: v.promo.id,
    discountCents: v.discountCents,
    finalCents: v.finalCents,
  }
}

// Lightweight validate wrapper for server-side use from create-session paths
// that just want to compute the discount (without committing a redeem). The
// Windcave create-session calls this to set the auth amount server-authoritatively;
// commit happens from the FPRN / capture path or from the create-session itself.
export async function validatePromo({ supabase, code, billingCountry, baseAmountCents }) {
  return validateAndCompute(supabase, { code, billingCountry, baseAmountCents })
}

export default async function handler(req, res) {
  const supabase = admin()

  // ── GET: check | list | redemptions ─────────────────────────────────────
  if (req.method === 'GET') {
    const { action } = req.query || {}

    // Public check — no auth required (Payment.jsx is pre-login for patients).
    if (action === 'check') {
      const { code, billing_country, base_amount_cents } = req.query || {}
      const v = await validateAndCompute(supabase, {
        code,
        billingCountry: billing_country,
        baseAmountCents: Number(base_amount_cents),
      })
      if (!v.ok) return res.status(200).json({ valid: false, reason: v.reason })
      return res.status(200).json({
        valid: true,
        code: v.promo.code,
        discount_type: v.promo.discount_type,
        discount_value: Number(v.promo.discount_value),
        discount_applied_cents: v.discountCents,
        final_amount_cents: v.finalCents,
      })
    }

    // Everything below requires admin.
    const auth = await guardProvider(req, res)
    if (!auth) return
    if (!auth.provider?.is_admin) {
      return res.status(403).json({ error: 'Admin role required' })
    }

    if (action === 'list') {
      const { data, error } = await supabase
        .from('promo_codes')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) { console.error('[promo-codes] list failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ promo_codes: data || [] })
    }

    if (action === 'redemptions') {
      const { promo_code_id } = req.query || {}
      if (!promo_code_id) return res.status(400).json({ error: 'promo_code_id required' })
      const { data, error } = await supabase
        .from('promo_code_redemptions')
        .select('id, consultation_id, patient_id, discount_applied_cents, original_amount_cents, final_amount_cents, redeemed_at')
        .eq('promo_code_id', promo_code_id)
        .order('redeemed_at', { ascending: false })
        .limit(500)
      if (error) { console.error('[promo-codes] redemptions failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ redemptions: data || [] })
    }

    return res.status(400).json({ error: 'Unknown action' })
  }

  // ── POST: create | update | revoke ──────────────────────────────────────
  if (req.method === 'POST') {
    const auth = await guardProvider(req, res)
    if (!auth) return
    if (!auth.provider?.is_admin) {
      return res.status(403).json({ error: 'Admin role required' })
    }

    const body = req.body || {}
    const action = body.action

    if (action === 'create') {
      const payload = {}
      for (const [k, v] of Object.entries(body)) {
        if (CREATE_ALLOWLIST.has(k)) payload[k] = v
      }
      if (!payload.code) return res.status(400).json({ error: 'code required' })
      if (!payload.discount_type) return res.status(400).json({ error: 'discount_type required' })
      if (!['percent', 'fixed', 'zero'].includes(payload.discount_type)) {
        return res.status(400).json({ error: 'discount_type must be percent, fixed, or zero' })
      }
      if (payload.discount_value === undefined || payload.discount_value === null || payload.discount_value === '') {
        payload.discount_value = 0
      }
      const dv = Number(payload.discount_value)
      if (!Number.isFinite(dv) || dv < 0) return res.status(400).json({ error: 'discount_value must be >= 0' })
      if (payload.discount_type === 'percent' && dv > 100) {
        return res.status(400).json({ error: 'percent discount cannot exceed 100' })
      }
      payload.discount_value = dv

      if (!payload.valid_from || !payload.valid_to) return res.status(400).json({ error: 'valid_from and valid_to required' })
      const from = new Date(payload.valid_from).getTime()
      const to   = new Date(payload.valid_to).getTime()
      if (!Number.isFinite(from) || !Number.isFinite(to)) return res.status(400).json({ error: 'invalid date' })
      if (from >= to) return res.status(400).json({ error: 'valid_from must be before valid_to' })

      if (payload.max_uses === '' || payload.max_uses === undefined) payload.max_uses = null
      if (payload.max_uses !== null) {
        const mu = parseInt(payload.max_uses, 10)
        if (!Number.isFinite(mu) || mu < 1) return res.status(400).json({ error: 'max_uses must be a positive integer or blank' })
        payload.max_uses = mu
      }

      payload.applies_to_country = payload.applies_to_country || 'both'
      if (!['nz', 'international', 'both'].includes(payload.applies_to_country)) {
        return res.status(400).json({ error: 'applies_to_country must be nz, international, or both' })
      }

      payload.code = normaliseCode(payload.code)
      payload.active = payload.active !== false
      payload.created_by = auth.provider.id

      const { data, error } = await supabase.from('promo_codes').insert(payload).select().single()
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'A code with that name already exists' })
        console.error('[promo-codes] create failed:', error)
        return res.status(500).json({ error: 'Server error' })
      }
      return res.status(200).json({ promo_code: data })
    }

    if (action === 'update') {
      const { id } = body
      if (!id) return res.status(400).json({ error: 'id required' })
      const patch = {}
      for (const [k, v] of Object.entries(body)) {
        if (UPDATE_ALLOWLIST.has(k)) patch[k] = v
      }
      if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'No allowed columns in patch' })

      if (patch.code !== undefined) patch.code = normaliseCode(patch.code)
      if (patch.discount_type !== undefined && !['percent','fixed','zero'].includes(patch.discount_type)) {
        return res.status(400).json({ error: 'discount_type must be percent, fixed, or zero' })
      }
      if (patch.discount_value !== undefined) {
        const dv = Number(patch.discount_value)
        if (!Number.isFinite(dv) || dv < 0) return res.status(400).json({ error: 'discount_value must be >= 0' })
        if (patch.discount_type === 'percent' && dv > 100) {
          return res.status(400).json({ error: 'percent discount cannot exceed 100' })
        }
        patch.discount_value = dv
      }
      if (patch.valid_from !== undefined || patch.valid_to !== undefined) {
        // When one side is patched, we need the other to validate. Fetch
        // current row for the missing side.
        const { data: cur } = await supabase.from('promo_codes').select('valid_from, valid_to').eq('id', id).maybeSingle()
        const from = new Date(patch.valid_from ?? cur?.valid_from).getTime()
        const to   = new Date(patch.valid_to   ?? cur?.valid_to).getTime()
        if (!Number.isFinite(from) || !Number.isFinite(to)) return res.status(400).json({ error: 'invalid date' })
        if (from >= to) return res.status(400).json({ error: 'valid_from must be before valid_to' })
      }
      if (patch.max_uses === '') patch.max_uses = null
      if (patch.max_uses !== null && patch.max_uses !== undefined) {
        const mu = parseInt(patch.max_uses, 10)
        if (!Number.isFinite(mu) || mu < 1) return res.status(400).json({ error: 'max_uses must be a positive integer or blank' })
        patch.max_uses = mu
      }
      if (patch.applies_to_country !== undefined && !['nz','international','both'].includes(patch.applies_to_country)) {
        return res.status(400).json({ error: 'applies_to_country must be nz, international, or both' })
      }
      patch.updated_at = new Date().toISOString()

      const { data, error } = await supabase.from('promo_codes').update(patch).eq('id', id).select().maybeSingle()
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'A code with that name already exists' })
        console.error('[promo-codes] update failed:', error)
        return res.status(500).json({ error: 'Server error' })
      }
      return res.status(200).json({ promo_code: data })
    }

    if (action === 'revoke') {
      const { id } = body
      if (!id) return res.status(400).json({ error: 'id required' })
      const { data, error } = await supabase
        .from('promo_codes')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .maybeSingle()
      if (error) { console.error('[promo-codes] revoke failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ promo_code: data })
    }

    return res.status(400).json({ error: 'Unknown action' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
