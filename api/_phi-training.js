// /api/phi-training — provider PHI/privacy training attestation (task #384).
//
// GET  → { last_phi_training_at, phi_training_valid_until, status }
//        status: 'valid' | 'due_soon' (<30d to expiry) | 'expired' | 'never'
// POST → mark the CURRENT provider as having completed the attestation.
//        Sets last_phi_training_at = now, phi_training_valid_until = +12mo.
//        Requires signedName + attest boolean.

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function computeStatus(validUntilIso) {
  if (!validUntilIso) return 'never'
  const now = Date.now()
  const exp = new Date(validUntilIso).getTime()
  if (exp < now) return 'expired'
  if (exp - now < 30 * 24 * 60 * 60 * 1000) return 'due_soon'
  return 'valid'
}

export default async function handler(req, res) {
  const provider = req.auth?.provider
  if (!provider) return res.status(401).json({ error: 'Provider auth required' })
  const supabase = admin()

  if (req.method === 'GET') {
    const { data } = await supabase.from('providers')
      .select('last_phi_training_at, phi_training_valid_until')
      .eq('id', provider.id).maybeSingle()
    return res.status(200).json({
      last_phi_training_at:     data?.last_phi_training_at || null,
      phi_training_valid_until: data?.phi_training_valid_until || null,
      status:                   computeStatus(data?.phi_training_valid_until),
    })
  }

  if (req.method === 'POST') {
    const { signedName, attest } = req.body || {}
    if (!signedName || !String(signedName).trim()) return res.status(400).json({ error: 'signedName required' })
    if (!attest) return res.status(400).json({ error: 'You must tick every attestation' })
    const now = new Date()
    const validUntil = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await supabase.from('providers').update({
      last_phi_training_at:     now.toISOString(),
      phi_training_valid_until: validUntil,
    }).eq('id', provider.id)
    if (error) { console.error('[phi-training] update failed:', error); return res.status(500).json({ error: 'Server error' }) }

    // Audit log
    try {
      await supabase.from('audit_logs').insert({
        event_type:    'phi_training_attested',
        provider_id:   provider.id,
        provider_name: `${provider.first_name || ''} ${provider.last_name || ''}`.trim() || null,
        metadata:      { signed_name: String(signedName).trim(), valid_until: validUntil },
      })
    } catch {}

    return res.status(200).json({ ok: true, valid_until: validUntil, status: 'valid' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
