// /api/acc-communications — admin CRUD on the acc_communications log (task #369).
//
// GET  ?claim_id=X  → list comms for a claim
// GET  ?claim_number=X → list by claim number
// POST { claim_id, direction, channel, from_addr, to_addr, subject, body, occurred_at, attachment_url }
// DELETE ?id=X — remove an incorrectly-logged row (admin only)

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const ALLOWED_DIRECTIONS = new Set(['inbound', 'outbound'])
const ALLOWED_CHANNELS   = new Set(['email', 'phone', 'letter', 'portal', 'webhook', 'other'])

function roleSnapshot(p) {
  if (!p) return null
  if (p.is_billing_admin) return 'billing_admin'
  if (p.is_supervisor)    return 'supervisor'
  if (p.is_admin)         return 'admin'
  if (p.is_provider)      return 'provider'
  return null
}

export default async function handler(req, res) {
  const provider = req.auth?.provider
  if (!provider) return res.status(401).json({ error: 'Provider auth required' })
  const role = roleSnapshot(provider)
  const isAdminLevel = ['admin', 'billing_admin', 'supervisor'].includes(role)
  const supabase = admin()

  if (req.method === 'GET') {
    const { claim_id, claim_number } = req.query || {}
    if (!claim_id && !claim_number) return res.status(400).json({ error: 'claim_id or claim_number required' })
    let q = supabase.from('acc_communications').select('*').order('occurred_at', { ascending: false })
    if (claim_id)     q = q.eq('claim_id', claim_id)
    if (claim_number) q = q.eq('claim_number', claim_number)
    const { data, error } = await q
    if (error) {
      if (error.message?.includes('does not exist')) return res.status(200).json({ communications: [] })
      console.error('[acc-communications] list failed:', error); return res.status(500).json({ error: 'Server error' })
    }
    return res.status(200).json({ communications: data || [] })
  }

  if (req.method === 'POST') {
    if (!isAdminLevel) return res.status(403).json({ error: 'Admin/supervisor role required' })
    const { claim_id, claim_number, direction, channel, from_addr, to_addr, subject, body, occurred_at, attachment_url, metadata } = req.body || {}
    if (!claim_id && !claim_number) return res.status(400).json({ error: 'claim_id or claim_number required' })
    if (!direction || !ALLOWED_DIRECTIONS.has(direction)) return res.status(400).json({ error: 'direction must be inbound or outbound' })
    if (channel && !ALLOWED_CHANNELS.has(channel)) return res.status(400).json({ error: `channel must be one of: ${[...ALLOWED_CHANNELS].join(', ')}` })

    // Resolve claim_number from claim_id if missing (denormalisation aid).
    let resolvedClaimNumber = claim_number || null
    if (claim_id && !resolvedClaimNumber) {
      const { data: c } = await supabase.from('acc_claims').select('claim_number').eq('id', claim_id).maybeSingle()
      resolvedClaimNumber = c?.claim_number || null
    }

    const { data, error } = await supabase.from('acc_communications').insert({
      claim_id:       claim_id || null,
      claim_number:   resolvedClaimNumber,
      direction,
      channel:        channel || 'other',
      from_addr:      from_addr || null,
      to_addr:        to_addr || null,
      subject:        subject ? String(subject).slice(0, 500) : null,
      body:           body ? String(body).slice(0, 8000) : null,
      occurred_at:    occurred_at || new Date().toISOString(),
      recorded_by:    provider.id,
      attachment_url: attachment_url || null,
      metadata:       metadata && typeof metadata === 'object' ? metadata : null,
    }).select('*').maybeSingle()
    if (error) { console.error('[acc-communications] insert failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ communication: data })
  }

  if (req.method === 'DELETE') {
    if (!isAdminLevel) return res.status(403).json({ error: 'Admin role required' })
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id required' })
    const { error } = await supabase.from('acc_communications').delete().eq('id', id)
    if (error) { console.error('[acc-communications] delete failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
