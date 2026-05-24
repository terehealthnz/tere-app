import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  if (req.method === 'GET') {
    const { patient_nhi } = req.query
    if (!patient_nhi) return res.status(400).json({ error: 'patient_nhi required' })
    const { data, error } = await supabase.from('patient_flags')
      .select('*').eq('patient_nhi', patient_nhi).eq('active', true).order('created_at')
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ flags: data || [] })
  }

  if (req.method === 'POST') {
    const { patient_nhi, patient_name, flag_type, notes, added_by, added_by_id } = req.body
    if (!patient_nhi || !flag_type) return res.status(400).json({ error: 'patient_nhi and flag_type required' })
    const { data, error } = await supabase.from('patient_flags')
      .insert({ patient_nhi, patient_name, flag_type, notes, added_by, added_by_id })
      .select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true, flag: data })
  }

  if (req.method === 'DELETE') {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: 'id required' })
    await supabase.from('patient_flags').update({ active: false }).eq('id', id)
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
