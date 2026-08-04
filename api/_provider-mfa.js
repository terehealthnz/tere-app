// /api/provider-mfa — enable / verify / disable TOTP MFA on the calling
// provider's own account. Provider-authed (uses guardProvider), so only
// the signed-in provider can manage their own MFA — not admins editing
// someone else's account.
//
// Enrollment flow:
//   POST { action: 'enroll' }
//     → generates a fresh TOTP secret, saves to providers.mfa_secret_encoded,
//       mfa_enabled stays false until verified. Returns { secretBase32,
//       otpauthUrl } so the client can display for the authenticator app.
//   POST { action: 'verify', code }
//     → verifies a code against the just-generated secret. On success, sets
//       mfa_enabled=true. Provider is now MFA-required on next login.
//   POST { action: 'disable', code }
//     → verifies a current code against the active secret, then clears both
//       mfa_secret_encoded and mfa_enabled. Provider drops back to PIN-only.
//
// Admin-side recovery (provider lost authenticator) uses the existing
// /api/providers PATCH allowlist to set mfa_enabled=false + null the secret;
// that path is separate and requires admin role.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'
import { generateSecret, verifyTotp, otpauthUrl } from './_totp.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const auth = await guardProvider(req, res)
  if (!auth) return
  const providerId = auth.provider?.id
  if (!providerId) return res.status(401).json({ error: 'No provider identity in session' })

  const supabase = admin()
  const { action, code } = req.body || {}

  if (action === 'enroll') {
    const secret = generateSecret()
    const { error } = await supabase.from('providers')
      .update({ mfa_secret_encoded: secret, mfa_enabled: false })
      .eq('id', providerId)
    if (error) return res.status(500).json({ error: error.message })
    const label = auth.provider?.email || auth.provider?.display_name || providerId
    return res.status(200).json({
      secretBase32: secret,
      otpauthUrl: otpauthUrl({ secretBase32: secret, label }),
    })
  }

  if (action === 'verify') {
    if (!code) return res.status(400).json({ error: 'code required' })
    const { data: p, error: gErr } = await supabase.from('providers')
      .select('mfa_secret_encoded').eq('id', providerId).maybeSingle()
    if (gErr) return res.status(500).json({ error: gErr.message })
    if (!p?.mfa_secret_encoded) return res.status(409).json({ error: 'No enrollment in progress' })
    if (!verifyTotp(p.mfa_secret_encoded, code)) {
      return res.status(400).json({ error: 'Code did not match. Check your authenticator app clock and try the next code.' })
    }
    const { error: uErr } = await supabase.from('providers')
      .update({ mfa_enabled: true }).eq('id', providerId)
    if (uErr) return res.status(500).json({ error: uErr.message })
    // Audit
    try {
      await supabase.from('audit_logs').insert({
        event_type: 'provider_mfa.enabled',
        provider_id: providerId,
        provider_name: auth.email || null,
        metadata: { target_type: 'provider', target_id: providerId, actor_email: auth.email || null },
      })
    } catch (e) { console.warn('[provider-mfa] audit-log write failed:', e.message) }
    return res.status(200).json({ ok: true, mfa_enabled: true })
  }

  if (action === 'disable') {
    if (!code) return res.status(400).json({ error: 'code required to disable' })
    const { data: p, error: gErr } = await supabase.from('providers')
      .select('mfa_secret_encoded, mfa_enabled').eq('id', providerId).maybeSingle()
    if (gErr) return res.status(500).json({ error: gErr.message })
    if (!p?.mfa_enabled || !p?.mfa_secret_encoded) return res.status(409).json({ error: 'MFA is not enabled' })
    if (!verifyTotp(p.mfa_secret_encoded, code)) {
      return res.status(400).json({ error: 'Code did not match' })
    }
    const { error: uErr } = await supabase.from('providers')
      .update({ mfa_secret_encoded: null, mfa_enabled: false }).eq('id', providerId)
    if (uErr) return res.status(500).json({ error: uErr.message })
    try {
      await supabase.from('audit_logs').insert({
        event_type: 'provider_mfa.disabled',
        provider_id: providerId,
        provider_name: auth.email || null,
        metadata: { target_type: 'provider', target_id: providerId, actor_email: auth.email || null },
      })
    } catch (e) { console.warn('[provider-mfa] audit-log write failed:', e.message) }
    return res.status(200).json({ ok: true, mfa_enabled: false })
  }

  return res.status(400).json({ error: 'Unknown action. Use enroll | verify | disable.' })
}
