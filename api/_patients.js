// GET/POST /api/patients — server-mediated gateway for provider-side patient
// reads and admin operations (merge). Runs with service_role, requires an
// authenticated provider.
//
// GET   /api/patients?id=<uuid>              → single patient record
// POST  /api/patients?action=merge           → merges secondary → primary
//                                              body: { primaryId, secondaryId }
//
// Patient-side self-service (updating your own contact details) is not covered
// here — that would go through a token-verified /api/patient/self endpoint
// when the patient portal auth is wired up.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Columns a patient may set on their own record via the anon-facing
// action=create and PATCH ?anon=1 code paths. Excludes any provider-only or
// billing fields; a scraper with a valid consult id can only populate demographic
// data that the triage flow would normally collect anyway.
const PATIENT_ANON_ALLOWLIST = new Set([
  'first_name', 'last_name', 'date_of_birth',
  'phone', 'email', 'nhi',
  'pharmacy_name', 'pharmacy_id',
  'gp_name', 'gp_clinic', 'gp_email',
  'medical_history', 'current_medications', 'allergies',
  'preferred_language',
  'acc_employer',
  'research_consent', 'research_consent_updated_at',
  'first_consultation_at', 'last_consultation_at',
  'total_consultations',
])

function projectAnonPatch(raw) {
  const patch = {}
  for (const [k, v] of Object.entries(raw || {})) {
    if (PATIENT_ANON_ALLOWLIST.has(k)) patch[k] = v
  }
  return patch
}

// action=lookup (name+DOB) and action=create are anon-facing (patient triage
// runs before login). All other paths require provider auth.
export default async function handler(req, res) {
  const { action } = req.query || {}
  const isAnonFlow =
    (req.method === 'POST' && (action === 'create' || action === 'lookup')) ||
    (req.method === 'PATCH' && req.query?.anon === '1')

  if (!isAnonFlow) {
    const auth = await guardProvider(req, res)
    if (!auth) return
  }

  const supabase = admin()

  if (req.method === 'PATCH') {
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id query param required' })
    // Provider-authenticated path allows the same allowlist (no extra columns
    // added). Anon path uses same allowlist too — no server-only fields exposed.
    const patch = projectAnonPatch(req.body)
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No allowed columns in patch' })
    }
    patch.updated_at = new Date().toISOString()
    const { error } = await supabase.from('patients').update(patch).eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'GET') {
    const { id, search, limit: rawLimit, offset: rawOffset } = req.query || {}

    if (id) {
      const { data, error } = await supabase.from('patients').select('*').eq('id', id).maybeSingle()
      if (error) return res.status(500).json({ error: error.message })
      if (!data) return res.status(404).json({ error: 'Patient not found' })
      return res.status(200).json({ patient: data })
    }

    // List with optional search — provider-side patient directory (AdminPatients.jsx).
    const limit  = Math.max(1, Math.min(200, parseInt(rawLimit) || 50))
    const offset = Math.max(0, parseInt(rawOffset) || 0)
    let q = supabase
      .from('patients')
      .select('id, first_name, last_name, date_of_birth, nhi, phone, email, total_consultations, last_consultation_at, research_consent', { count: 'exact' })
      .order('last_consultation_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1)
    if (search && search.trim()) {
      const s = search.trim()
      q = q.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%,nhi.ilike.%${s}%`)
    }
    const { data, error, count } = await q
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ patients: data || [], count: count || 0 })
  }

  if (req.method === 'POST') {
    // Anon patient triage lookup by name + DOB. Returns a limited safe
    // projection so a scraper can't harvest full patient records even with a
    // guessed name+DOB combo.
    if (action === 'lookup') {
      const { first_name, last_name, date_of_birth } = req.body || {}
      if (!first_name || !last_name || !date_of_birth) {
        return res.status(400).json({ error: 'first_name, last_name, date_of_birth required' })
      }
      const { data } = await supabase
        .from('patients')
        .select('id, first_name, last_name, date_of_birth, phone, email, nhi, pharmacy_name, pharmacy_id, gp_name, gp_clinic, gp_email, medical_history, current_medications, allergies, preferred_language, acc_employer, research_consent, total_consultations, last_consultation_at')
        .ilike('first_name', String(first_name).trim())
        .ilike('last_name', String(last_name).trim())
        .eq('date_of_birth', date_of_birth)
        .maybeSingle()
      return res.status(200).json({ patient: data || null })
    }

    // Anon patient triage create — narrow column allowlist prevents tampering
    // with provider-only fields like risk_score, do_not_prescribe_list, etc.
    if (action === 'create') {
      const patch = projectAnonPatch(req.body)
      if (!patch.first_name || !patch.last_name || !patch.date_of_birth) {
        return res.status(400).json({ error: 'first_name, last_name, date_of_birth required' })
      }
      const { data, error } = await supabase
        .from('patients')
        .insert(patch)
        .select()
        .single()
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ patient: data })
    }

    const { primaryId, secondaryId } = req.body || {}

    if (action === 'merge') {
      if (!primaryId || !secondaryId) return res.status(400).json({ error: 'primaryId and secondaryId required' })
      if (primaryId === secondaryId) return res.status(400).json({ error: 'Primary and secondary must differ' })

      // Re-parent consultations + consents, then delete the secondary patient row.
      // Total consultations is summed to preserve the analytics history.
      const [pRes, sRes] = await Promise.all([
        supabase.from('patients').select('total_consultations').eq('id', primaryId).maybeSingle(),
        supabase.from('patients').select('total_consultations').eq('id', secondaryId).maybeSingle(),
      ])
      if (pRes.error || !pRes.data) return res.status(404).json({ error: 'Primary patient not found' })
      if (sRes.error || !sRes.data) return res.status(404).json({ error: 'Secondary patient not found' })

      const consultUpdate = await supabase.from('consultations').update({ patient_id: primaryId }).eq('patient_id', secondaryId)
      if (consultUpdate.error) return res.status(500).json({ error: consultUpdate.error.message })

      const consentUpdate = await supabase.from('consents').update({ consultation_id: primaryId }).eq('consultation_id', secondaryId)
      if (consentUpdate.error) return res.status(500).json({ error: consentUpdate.error.message })

      const total = (pRes.data.total_consultations || 0) + (sRes.data.total_consultations || 0)
      const pUpdate = await supabase.from('patients')
        .update({ total_consultations: total, updated_at: new Date().toISOString() })
        .eq('id', primaryId)
      if (pUpdate.error) return res.status(500).json({ error: pUpdate.error.message })

      const del = await supabase.from('patients').delete().eq('id', secondaryId)
      if (del.error) return res.status(500).json({ error: del.error.message })

      return res.status(200).json({ ok: true, primaryId, mergedFrom: secondaryId, total })
    }

    return res.status(400).json({ error: 'Unknown POST action (supported: merge, create, lookup)' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
