import { createClient } from '@supabase/supabase-js'
import { resolvePatientAuth } from './_patient-token.js'

function getSupabase() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// Pen-test M-5 phase 2: gate every request that names a specific consultation
// behind the patient session token. Requests without a consultation_id (e.g.
// provider look-ups by email/nhi, or flag-id-scoped PATCH/DELETE) skip the
// check since there's no per-consult surface to guard.
async function guardConsultToken(req, res, cid) {
  if (!cid) return true // nothing to guard
  const auth = await resolvePatientAuth(req, { legacyConsultId: cid })
  if (auth.error) { res.status(auth.status).json({ error: auth.error }); return false }
  if (auth.consultationId !== cid) {
    res.status(403).json({ error: 'Token does not match consultation' })
    return false
  }
  return true
}

export default async function handler(req, res) {
  const supabase = getSupabase()

  // GET — load active flags for a patient (by email or NHI). If a
  // consultation_id is supplied, enforce patient token scope against it.
  if (req.method === 'GET') {
    const { email, nhi, patient_nhi, consultation_id } = req.query
    const nhiVal = nhi || patient_nhi
    if (!email && !nhiVal) return res.status(400).json({ error: 'email or nhi required' })

    if (!(await guardConsultToken(req, res, consultation_id))) return

    let q = supabase.from('patient_flags').select('*').eq('active', true).order('created_at', { ascending: false })
    if (email) q = q.eq('patient_email', email.toLowerCase().trim())
    else       q = q.eq('patient_nhi', nhiVal)

    const { data, error } = await q
    if (error) { console.error('[patient-flags] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ flags: data || [] })
  }

  // POST — create a new flag
  if (req.method === 'POST') {
    const {
      patient_nhi, patient_email,
      patient_name, patient_first_name, patient_last_name,
      flag_type, severity,
      notes, note,
      added_by, added_by_id,
      consultation_id,
    } = req.body

    const noteText = (note || notes || '').trim()
    if (!noteText) return res.status(400).json({ error: 'note required' })
    if (!patient_email && !patient_nhi) return res.status(400).json({ error: 'patient_email or patient_nhi required' })

    if (!(await guardConsultToken(req, res, consultation_id))) return

    const nameVal = patient_name
      || `${patient_first_name || ''} ${patient_last_name || ''}`.trim()
      || null

    const { data, error } = await supabase.from('patient_flags').insert({
      patient_nhi:      patient_nhi || null,
      patient_email:    patient_email?.toLowerCase().trim() || null,
      patient_name:     nameVal,
      flag_type:        flag_type || 'general',
      severity:         severity || 'info',
      notes:            noteText,
      added_by:         added_by || null,
      added_by_id:      added_by_id || null,
      consultation_id:  consultation_id || null,
      active:           true,
    }).select().single()

    if (error) { console.error('[patient-flags] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ ok: true, flag: data })
  }

  // PATCH — resolve a flag. Body may include consultation_id to scope; if
  // present, enforce token match. Absent → no per-consult surface to guard.
  if (req.method === 'PATCH') {
    const { id, action, resolved_by, consultation_id } = req.body
    if (!id) return res.status(400).json({ error: 'id required' })

    if (!(await guardConsultToken(req, res, consultation_id))) return

    if (action === 'resolve') {
      const { error } = await supabase.from('patient_flags').update({
        active:      false,
        resolved_at: new Date().toISOString(),
        resolved_by: resolved_by || null,
      }).eq('id', id)
      if (error) { console.error('[patient-flags] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: 'Invalid action' })
  }

  // DELETE — legacy soft-delete (kept for backwards compat)
  if (req.method === 'DELETE') {
    const { id, consultation_id } = req.body
    if (!id) return res.status(400).json({ error: 'id required' })
    if (!(await guardConsultToken(req, res, consultation_id))) return
    await supabase.from('patient_flags').update({ active: false }).eq('id', id)
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
