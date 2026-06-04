import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export default async function handler(req, res) {
  const supabase = getSupabase()

  // GET — load active flags for a patient (by email or NHI)
  if (req.method === 'GET') {
    const { email, nhi, patient_nhi } = req.query
    const nhiVal = nhi || patient_nhi
    if (!email && !nhiVal) return res.status(400).json({ error: 'email or nhi required' })

    let q = supabase.from('patient_flags').select('*').eq('active', true).order('created_at', { ascending: false })
    if (email) q = q.eq('patient_email', email.toLowerCase().trim())
    else       q = q.eq('patient_nhi', nhiVal)

    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })
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

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true, flag: data })
  }

  // PATCH — resolve a flag
  if (req.method === 'PATCH') {
    const { id, action, resolved_by } = req.body
    if (!id) return res.status(400).json({ error: 'id required' })

    if (action === 'resolve') {
      const { error } = await supabase.from('patient_flags').update({
        active:      false,
        resolved_at: new Date().toISOString(),
        resolved_by: resolved_by || null,
      }).eq('id', id)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: 'Invalid action' })
  }

  // DELETE — legacy soft-delete (kept for backwards compat)
  if (req.method === 'DELETE') {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: 'id required' })
    await supabase.from('patient_flags').update({ active: false }).eq('id', id)
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
