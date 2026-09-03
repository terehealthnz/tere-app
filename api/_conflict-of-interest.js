// /api/conflict-of-interest — provider COI declarations register (task #410).
//
// GET  ?filter=active|all       → list declarations
// GET  ?provider_id=X           → per-provider list
// POST { providerId, declarationType, description }  → new declaration
// PATCH { id, active, reviewed_at, reviewed_by }     → update / mark reviewed
// DELETE ?id=X                  → admin-only correction path

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const ALLOWED_TYPES = new Set([
  'external_role', 'ownership_stake', 'directorship', 'family_member_in_industry',
  'consulting_income', 'research_funding', 'gifts_received', 'other',
])

export default async function handler(req, res) {
  const actor = req.auth?.provider
  if (!actor) return res.status(401).json({ error: 'Provider auth required' })
  const isAdmin = !!actor.is_admin
  const supabase = admin()

  if (req.method === 'GET') {
    const { filter, provider_id } = req.query || {}
    let q = supabase.from('conflict_of_interest_declarations').select('*').order('disclosed_at', { ascending: false })
    if (provider_id) q = q.eq('provider_id', provider_id)
    else if (!isAdmin) q = q.eq('provider_id', actor.id) // non-admins see only their own
    if (filter === 'active') q = q.eq('active', true)
    const { data, error } = await q
    if (error) {
      if (error.message?.includes('does not exist')) return res.status(200).json({ declarations: [] })
      console.error('[coi] list failed:', error); return res.status(500).json({ error: 'Server error' })
    }
    return res.status(200).json({ declarations: data || [] })
  }

  if (req.method === 'POST') {
    const { providerId, declarationType, description } = req.body || {}
    const target = providerId || actor.id
    // Non-admins can only declare on themselves.
    if (target !== actor.id && !isAdmin) return res.status(403).json({ error: 'Admin required to declare on behalf of another provider' })
    if (!declarationType || !ALLOWED_TYPES.has(declarationType)) {
      return res.status(400).json({ error: `declarationType must be one of: ${[...ALLOWED_TYPES].join(', ')}` })
    }
    if (!description || String(description).trim().length < 5) {
      return res.status(400).json({ error: 'description required (≥ 5 chars)' })
    }
    // Snapshot the declaring provider's name.
    const { data: p } = await supabase.from('providers').select('first_name, last_name').eq('id', target).maybeSingle()
    const providerName = [p?.first_name, p?.last_name].filter(Boolean).join(' ') || null
    const { data, error } = await supabase.from('conflict_of_interest_declarations').insert({
      provider_id:      target,
      provider_name:    providerName,
      declaration_type: declarationType,
      description:      String(description).trim().slice(0, 2000),
    }).select('*').maybeSingle()
    if (error) { console.error('[coi] insert failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ declaration: data })
  }

  if (req.method === 'PATCH') {
    if (!isAdmin) return res.status(403).json({ error: 'Admin required' })
    const { id, active, reviewed_at } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id required' })
    const patch = {}
    if (typeof active === 'boolean') patch.active = active
    if (reviewed_at || active === true || active === false) {
      patch.reviewed_at = reviewed_at || new Date().toISOString()
      patch.reviewed_by = actor.id
    }
    const { error } = await supabase.from('conflict_of_interest_declarations').update(patch).eq('id', id)
    if (error) { console.error('[coi] patch failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    if (!isAdmin) return res.status(403).json({ error: 'Admin required' })
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id required' })
    const { error } = await supabase.from('conflict_of_interest_declarations').delete().eq('id', id)
    if (error) { console.error('[coi] delete failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
