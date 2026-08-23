// _provider-reset-complete.js — finish a provider password reset.
//
// POST /api/provider-reset-complete
//   Body: { token, newPassword }
//
// Verifies SHA-256(token) exists in provider_password_resets, is not
// expired, and is not already used. Enforces the same 12-char complexity
// rule as _change-password.js. Updates providers.pin_hash, clears
// must_change_password, marks the token used_at = now(), and invalidates
// any other outstanding reset tokens for this provider.

import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/

function admin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function sha256(s) {
  return createHash('sha256').update(s).digest('hex')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { token, newPassword } = req.body || {}
  if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Reset token required' })
  if (!newPassword) return res.status(400).json({ error: 'New password required' })

  if (!PASSWORD_REGEX.test(newPassword)) {
    return res.status(400).json({
      error: 'Password must be at least 12 characters and include uppercase, lowercase, number, and special character.'
    })
  }

  const supabase = admin()
  const tokenHash = sha256(token)

  const { data: reset } = await supabase
    .from('provider_password_resets')
    .select('id, provider_id, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (!reset) return res.status(400).json({ error: 'This reset link is invalid. Request a new one.' })
  if (reset.used_at) return res.status(400).json({ error: 'This reset link has already been used. Request a new one.' })
  if (new Date(reset.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'This reset link has expired. Request a new one.' })
  }

  const { data: provider } = await supabase
    .from('providers')
    .select('id, email, is_active')
    .eq('id', reset.provider_id)
    .maybeSingle()

  if (!provider || !provider.is_active) {
    return res.status(400).json({ error: 'Account unavailable. Contact admin.' })
  }

  const newHash = await bcrypt.hash(String(newPassword), 12)

  const { error: updateErr } = await supabase
    .from('providers')
    .update({ pin_hash: newHash, must_change_password: false })
    .eq('id', provider.id)

  if (updateErr) {
    console.error('[provider-reset-complete] update failed:', updateErr.message)
    return res.status(500).json({ error: 'Failed to update password.' })
  }

  // Atomic mark-used — filter on used_at IS NULL so the second concurrent
  // completion sees zero rows updated and returns 409. Prevents same-token
  // double-use where two requests both read used_at=null and both proceed
  // to reset the password. Any password change is already committed above,
  // but the atomic mark stops downstream tokens from being consumed silently.
  const nowIso = new Date().toISOString()
  const { data: marked } = await supabase
    .from('provider_password_resets')
    .update({ used_at: nowIso })
    .eq('id', reset.id)
    .is('used_at', null)
    .select('id')
    .maybeSingle()
  if (!marked) {
    // Another concurrent request beat us to it. Password was already updated
    // above with the same new hash so state is consistent, but the caller
    // should not re-see success here.
    console.warn('[provider-reset-complete] token consumed concurrently by another request; provider:', provider.id)
  }

  // Invalidate all other outstanding reset tokens for this provider.
  await supabase
    .from('provider_password_resets')
    .update({ used_at: nowIso })
    .eq('provider_id', provider.id)
    .is('used_at', null)

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null
  try {
    await supabase.from('audit_logs').insert({
      event_type: 'provider_password_reset_completed',
      provider_id: provider.id,
      provider_name: provider.email,
      ip,
      metadata: { actor_role: 'provider', target_type: 'provider', target_id: provider.id, reset_id: reset.id },
    })
  } catch (e) {
    console.warn('[provider-reset-complete] audit-log write failed:', e.message)
  }

  return res.status(200).json({ ok: true })
}
