// POST /api/messages — chat message insert.
//
// Used by both patient and provider chat via ChatPanel.jsx. Auth model:
//   - Provider path: guardProvider (Supabase JWT or x-provider-id) — sender
//     is forced to 'provider' regardless of what the client claims, and the
//     consult must exist.
//   - Patient path: unauthenticated. sender is forced to 'patient'. The
//     consultation_id is the only auth primitive (same posture as
//     patient-consult PATCH — this is defence-in-depth, will tighten once
//     consultation_tokens are wired everywhere).
//
// Not in AUTH_REQUIRED_ROUTES because the patient path must work anonymously.
// Sender is server-set so a scraper can't spoof a provider message from the
// patient side.

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function isProvider(req) {
  // guardProvider isn't run for this route (patient path allowed), so we do
  // a soft check ourselves. If either the Supabase JWT or x-provider-id header
  // resolves to a provider, treat as provider. Otherwise, patient.
  const providerHeaderId = req.headers['x-provider-id']
  const authHeader = req.headers.authorization || ''
  if (!providerHeaderId && !authHeader.startsWith('Bearer ')) return false

  const supabase = admin()

  if (providerHeaderId) {
    const { data } = await supabase.from('providers')
      .select('id, is_active')
      .eq('id', String(providerHeaderId))
      .maybeSingle()
    if (data?.is_active) return true
  }

  if (authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7)
      const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
      const { data: userRes } = await sb.auth.getUser()
      if (userRes?.user?.id) {
        const { data } = await supabase.from('providers')
          .select('id, is_active')
          .eq('auth_user_id', userRes.user.id)
          .maybeSingle()
        if (data?.is_active) return true
      }
    } catch {}
  }
  return false
}

export default async function handler(req, res) {
  // Read: return all messages for a consultation. Both patient and provider
  // hit this — same posture as GET /api/patient-consult (consult id is the
  // auth). No column allowlist; every message column is meant to be visible
  // to the two parties on the consult.
  if (req.method === 'GET') {
    const { consultation_id } = req.query || {}
    if (!consultation_id) return res.status(400).json({ error: 'consultation_id required' })
    const supabase = admin()
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('consultation_id', consultation_id)
      .order('created_at')
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ messages: data || [] })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { consultation_id, message, photo_url, translated_text, detected_language } = req.body || {}
  if (!consultation_id) return res.status(400).json({ error: 'consultation_id required' })
  if (!message && !photo_url) return res.status(400).json({ error: 'message or photo_url required' })

  const supabase = admin()

  // Verify the consult exists — cheap sanity check that also prevents rows
  // being inserted against random uuids.
  const { data: consult } = await supabase
    .from('consultations')
    .select('id')
    .eq('id', consultation_id)
    .maybeSingle()
  if (!consult) return res.status(404).json({ error: 'Consultation not found' })

  const providerMode = await isProvider(req)
  const sender = providerMode ? 'provider' : 'patient'
  const langDefault = providerMode ? 'en' : (detected_language || 'en')

  const { error } = await supabase.from('messages').insert({
    consultation_id,
    sender,
    message: message || null,
    photo_url: photo_url || null,
    translated_text: translated_text || null,
    detected_language: langDefault,
  })
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true })
}
