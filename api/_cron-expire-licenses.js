// GET /api/cron-expire-licenses — daily Vercel Cron.
// Marks any active provider_state_licenses row past expires_at as 'expired'
// and rebuilds the cached providers.licensed_states array for each affected
// provider. Also emails the provider so they know to renew.

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function refreshLicensedStatesArray(supabase, providerId) {
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('provider_state_licenses')
    .select('state_code')
    .eq('provider_id', providerId)
    .eq('status', 'active')
    .gte('expires_at', today)
  const codes = Array.from(new Set((data || []).map(r => r.state_code))).sort()
  await supabase
    .from('providers')
    .update({ licensed_states: codes.length ? codes : null })
    .eq('id', providerId)
}

async function emailProvider(providerRow, expiredCodes) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey || !providerRow?.email || !expiredCodes.length) return
  const list = expiredCodes.join(', ')
  const html = `<p>Your Tere Health state license(s) for <strong>${list}</strong> expired today and have been automatically removed from your active list.</p>
<p>Please renew and re-submit at <a href="${process.env.VITE_APP_URL || 'https://terehealth.co.nz'}/clinician/state-licenses">/clinician/state-licenses</a>.</p>`
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: 'Tere Health <hello@terehealth.co.nz>',
        to: [providerRow.email],
        subject: `Your ${list} license${expiredCodes.length > 1 ? 's' : ''} expired`,
        html,
        text: `Your Tere Health state license(s) for ${list} expired today and have been removed from your active list.\n\nRenew at ${process.env.VITE_APP_URL || 'https://terehealth.co.nz'}/clinician/state-licenses`,
      }),
    })
  } catch (e) { console.error('[cron-expire-licenses] email failed:', e.message) }
}

export default async function handler(req, res) {
  // Vercel Cron GET only; anyone else gets 404 posture.
  //
  // Auth: `Authorization: Bearer $CRON_SECRET` — Vercel's scheduler
  // auto-attaches this when CRON_SECRET is set. `?secret=` also
  // accepted for manual triggering. Deliberately does NOT trust the
  // `x-vercel-cron` header alone — that header is set by Vercel's
  // scheduler but not stripped from external requests, so it's
  // spoofable. Matches _cron-unlock-reminders.js.
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const supplied = req.query?.secret
    || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '')
    || null
  if (!supplied || supplied !== process.env.CRON_SECRET) {
    return res.status(404).end()
  }

  const supabase = admin()
  const today = new Date().toISOString().slice(0, 10)

  // Find rows that need expiring.
  const { data: expired, error: findErr } = await supabase
    .from('provider_state_licenses')
    .select('id, provider_id, state_code, providers!provider_state_licenses_provider_id_fkey(id, email, first_name, last_name)')
    .eq('status', 'active')
    .lt('expires_at', today)
  if (findErr) return res.status(500).json({ error: findErr.message })

  if (!expired || !expired.length) {
    return res.status(200).json({ ok: true, expired: 0 })
  }

  // Flip status.
  const ids = expired.map(r => r.id)
  const { error: upErr } = await supabase
    .from('provider_state_licenses')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .in('id', ids)
  if (upErr) return res.status(500).json({ error: upErr.message })

  // Group by provider so we refresh + email once per provider.
  const byProvider = new Map()
  for (const r of expired) {
    const arr = byProvider.get(r.provider_id) || { provider: r.providers, codes: [] }
    arr.codes.push(r.state_code)
    byProvider.set(r.provider_id, arr)
  }
  for (const [providerId, info] of byProvider) {
    await refreshLicensedStatesArray(supabase, providerId)
    await emailProvider(info.provider, info.codes)
  }

  return res.status(200).json({ ok: true, expired: ids.length, providers_touched: byProvider.size })
}
