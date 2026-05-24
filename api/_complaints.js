import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  if (req.method === 'POST') {
    const {
      source, patient_name, patient_email, patient_phone,
      complaint_description, provider_id, provider_name,
      consultation_id, consultation_date, severity,
    } = req.body
    if (!complaint_description || !source) return res.status(400).json({ error: 'source and complaint_description required' })
    const { data, error } = await supabase.from('complaints').insert({
      source, patient_name, patient_email, patient_phone,
      complaint_description, provider_id, provider_name,
      consultation_id, consultation_date, severity: severity || 'medium',
    }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true, complaint: data })
  }

  if (req.method === 'GET') {
    const { status, limit = 100 } = req.query
    let q = supabase.from('complaints').select('*').order('created_at', { ascending: false }).limit(parseInt(limit))
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ complaints: data || [] })
  }

  if (req.method === 'PATCH') {
    const { id, ...updates } = req.body
    if (!id) return res.status(400).json({ error: 'id required' })
    const { error } = await supabase.from('complaints')
      .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
