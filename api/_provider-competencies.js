// /api/provider-competencies — per-domain competency sign-off (task #435).
// Admin/supervisor only for writes. Providers can view own row.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } })
}

const CREATE_FIELDS = new Set(['provider_id','competency_key','competency_label','status','assessed_at','evidence_notes','next_review_due_at'])
const PATCH_FIELDS  = new Set(['status','assessed_at','evidence_notes','next_review_due_at'])
const ALLOWED_STATUS = new Set(['not_assessed','in_training','competent','not_competent'])

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return
  const isAdmin = auth.provider.is_admin || auth.provider.is_supervisor
  const supabase = admin()

  if (req.method === 'GET') {
    const { provider_id, id } = req.query || {}
    if (id) {
      const { data, error } = await supabase.from('provider_competencies').select('*').eq('id', id).maybeSingle()
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ competency: data })
    }
    const targetProvider = provider_id || auth.provider.id
    if (!isAdmin && targetProvider !== auth.provider.id) {
      return res.status(403).json({ error: 'Can only view own competencies' })
    }
    const { data, error } = await supabase.from('provider_competencies')
      .select('*').eq('provider_id', targetProvider).order('competency_key')
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ competencies: data || [] })
  }

  if (!isAdmin) return res.status(403).json({ error: 'Admin/supervisor only' })

  if (req.method === 'POST') {
    const b = req.body || {}
    const patch = {}
    for (const [k, v] of Object.entries(b)) if (CREATE_FIELDS.has(k)) patch[k] = v
    if (!patch.provider_id || !patch.competency_key || !patch.competency_label) {
      return res.status(400).json({ error: 'provider_id + competency_key + competency_label required' })
    }
    if (patch.status && !ALLOWED_STATUS.has(patch.status)) {
      return res.status(400).json({ error: `status must be one of ${[...ALLOWED_STATUS].join(', ')}` })
    }
    patch.assessed_by   = auth.provider.id
    patch.assessor_name = `${auth.provider.first_name || ''} ${auth.provider.last_name || ''}`.trim() || null
    const { data, error } = await supabase.from('provider_competencies')
      .upsert(patch, { onConflict: 'provider_id,competency_key' }).select('*').single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ competency: data })
  }

  if (req.method === 'PATCH') {
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id required' })
    const b = req.body || {}
    const patch = {}
    for (const [k, v] of Object.entries(b)) if (PATCH_FIELDS.has(k)) patch[k] = v
    if (patch.status && !ALLOWED_STATUS.has(patch.status)) {
      return res.status(400).json({ error: `status must be one of ${[...ALLOWED_STATUS].join(', ')}` })
    }
    patch.assessed_by   = auth.provider.id
    patch.assessor_name = `${auth.provider.first_name || ''} ${auth.provider.last_name || ''}`.trim() || null
    const { data, error } = await supabase.from('provider_competencies').update(patch).eq('id', id).select('*').single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ competency: data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
