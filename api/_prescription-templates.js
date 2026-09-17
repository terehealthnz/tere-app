// /api/prescription-templates — shared curated prescription templates (task #229).
//
// Distinct from provider favourites (which live in prescription_templates
// and are served via /api/appointments). This endpoint serves the
// CLINIC-WIDE library any provider can pick as a starting point.
//
// GET                  → list active templates (provider-authed)
// GET  ?includeInactive=1 → list all (admin only)
// GET  ?id=X           → single row (provider-authed)
// GET  ?action=apply&id=X → same as ?id=X but writes an audit event
//                         (template applied to a consult). Extra
//                         consultation_id / patient_ref params are
//                         captured in the audit metadata.
// POST { ...fields }   → create (admin only)
// PATCH { id, ...fields } → update (admin only). is_active toggles here.
// DELETE ?id=X         → hard delete (admin only). Prefer PATCH is_active=false.
//
// Any admin-side CRUD writes an audit_logs row via writeAuditEvent.

import { createClient } from '@supabase/supabase-js'
import { writeAuditEvent } from './_audit-write.js'

let cached = null
function admin() {
  if (cached) return cached
  cached = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  return cached
}

// Whitelist of fields the client can set on create / update. Keeps
// server the source of truth for created_at/id/etc.
const WRITABLE_FIELDS = new Set([
  'name', 'condition', 'drug_name',
  'default_strength', 'default_form', 'default_dose', 'default_route',
  'default_frequency', 'default_duration', 'default_quantity',
  'default_repeats', 'default_directions',
  'safety_net_text',
  'is_paediatric', 'weight_based_dose',
  'controlled_drug', 'is_active', 'source',
])

function pickWritable(body) {
  const out = {}
  for (const [k, v] of Object.entries(body || {})) {
    if (!WRITABLE_FIELDS.has(k)) continue
    if (v === undefined) continue
    out[k] = v
  }
  return out
}

function validateCreate(payload) {
  const errs = []
  if (!payload.name || String(payload.name).trim().length < 3) {
    errs.push('name required (≥ 3 chars)')
  }
  if (!payload.condition || String(payload.condition).trim().length < 2) {
    errs.push('condition required')
  }
  if (!payload.drug_name || String(payload.drug_name).trim().length < 2) {
    errs.push('drug_name required')
  }
  // Repeats sanity
  if (payload.default_repeats != null) {
    const n = Number(payload.default_repeats)
    if (!Number.isFinite(n) || n < 0 || n > 12) errs.push('default_repeats must be 0-12')
    payload.default_repeats = Math.round(n)
  }
  return errs
}

export default async function handler(req, res) {
  const actor = req.auth?.provider
  if (!actor) return res.status(401).json({ error: 'Provider auth required' })
  const isAdmin = !!actor.is_admin
  const supabase = admin()

  if (req.method === 'GET') {
    const { id, includeInactive, condition, action, consultation_id, patient_ref } = req.query || {}

    if (id) {
      const { data, error } = await supabase
        .from('shared_prescription_templates')
        .select('*').eq('id', id).maybeSingle()
      if (error) {
        if (error.message?.includes('does not exist')) return res.status(200).json({ template: null })
        console.error('[rx-templates] fetch failed:', error)
        return res.status(500).json({ error: 'Server error' })
      }
      if (!data) return res.status(404).json({ error: 'Not found' })
      // Providers may only pull active + non-controlled rows via the picker.
      // Admins can pull anything (edit form).
      if (!isAdmin && (!data.is_active || data.controlled_drug)) {
        return res.status(404).json({ error: 'Not found' })
      }

      // action=apply — provider clicked "Use this template" in the modal;
      // log an audit event so we can trace which templates get used and
      // on which consult. Non-admins only.
      if (action === 'apply') {
        await writeAuditEvent(req, req.auth, {
          event_type:    'prescription.template.applied',
          consultation_id: consultation_id || null,
          patient_ref:   patient_ref || null,
          resource_type: 'shared_prescription_template',
          resource_id:   data.id,
          metadata:      { name: data.name, condition: data.condition, drug: data.drug_name },
        })
      }
      return res.status(200).json({ template: data })
    }

    let q = supabase.from('shared_prescription_templates').select('*').order('condition').order('name')
    if (includeInactive === '1') {
      if (!isAdmin) return res.status(403).json({ error: 'Admin required to list inactive templates' })
    } else {
      q = q.eq('is_active', true)
      // Controlled-drug templates never surface to the picker regardless of
      // admin — telehealth cannot prescribe them anyway (see PrescribeModal
      // warning banner). Admin sees them via includeInactive=1.
      q = q.eq('controlled_drug', false)
    }
    if (condition) q = q.ilike('condition', `%${String(condition).trim()}%`)
    const { data, error } = await q
    if (error) {
      if (error.message?.includes('does not exist')) return res.status(200).json({ templates: [] })
      console.error('[rx-templates] list failed:', error)
      return res.status(500).json({ error: 'Server error' })
    }
    return res.status(200).json({ templates: data || [] })
  }

  if (req.method === 'POST') {
    if (!isAdmin) return res.status(403).json({ error: 'Admin required' })
    const payload = pickWritable(req.body || {})
    const errs = validateCreate(payload)
    if (errs.length) return res.status(400).json({ error: errs.join('; ') })
    payload.created_by = actor.id
    payload.updated_by = actor.id
    // Trim strings so lower(name) uniqueness stays sane.
    for (const k of ['name', 'condition', 'drug_name']) {
      if (typeof payload[k] === 'string') payload[k] = payload[k].trim()
    }
    const { data, error } = await supabase.from('shared_prescription_templates')
      .insert(payload).select('*').maybeSingle()
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'A template with that name already exists' })
      console.error('[rx-templates] insert failed:', error)
      return res.status(500).json({ error: 'Server error' })
    }
    await writeAuditEvent(req, req.auth, {
      event_type:    'prescription.template.created',
      resource_type: 'shared_prescription_template',
      resource_id:   data.id,
      metadata:      { name: data.name, condition: data.condition, drug: data.drug_name },
    })
    return res.status(200).json({ template: data })
  }

  if (req.method === 'PATCH') {
    if (!isAdmin) return res.status(403).json({ error: 'Admin required' })
    const { id } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id required' })
    const patch = pickWritable(req.body || {})
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'No writable fields supplied' })
    // Optional repeats sanity
    if (patch.default_repeats != null) {
      const n = Number(patch.default_repeats)
      if (!Number.isFinite(n) || n < 0 || n > 12) return res.status(400).json({ error: 'default_repeats must be 0-12' })
      patch.default_repeats = Math.round(n)
    }
    for (const k of ['name', 'condition', 'drug_name']) {
      if (typeof patch[k] === 'string') patch[k] = patch[k].trim()
    }
    patch.updated_by = actor.id
    const { data, error } = await supabase.from('shared_prescription_templates')
      .update(patch).eq('id', id).select('*').maybeSingle()
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'A template with that name already exists' })
      console.error('[rx-templates] patch failed:', error)
      return res.status(500).json({ error: 'Server error' })
    }
    if (!data) return res.status(404).json({ error: 'Not found' })
    await writeAuditEvent(req, req.auth, {
      event_type:    'prescription.template.updated',
      resource_type: 'shared_prescription_template',
      resource_id:   data.id,
      metadata:      { fields: Object.keys(patch).filter(k => k !== 'updated_by') },
    })
    return res.status(200).json({ template: data })
  }

  if (req.method === 'DELETE') {
    if (!isAdmin) return res.status(403).json({ error: 'Admin required' })
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id required' })
    // Snapshot name for audit before delete.
    const { data: existing } = await supabase.from('shared_prescription_templates')
      .select('id, name').eq('id', id).maybeSingle()
    const { error } = await supabase.from('shared_prescription_templates').delete().eq('id', id)
    if (error) {
      console.error('[rx-templates] delete failed:', error)
      return res.status(500).json({ error: 'Server error' })
    }
    await writeAuditEvent(req, req.auth, {
      event_type:    'prescription.template.deleted',
      resource_type: 'shared_prescription_template',
      resource_id:   id,
      metadata:      { name: existing?.name || null },
    })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
