import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  if (req.method === 'POST') {
    const { consultation_id, consent_type, granted, patient_name } = req.body
    if (!consent_type) return res.status(400).json({ error: 'consent_type required' })
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null
    const { error } = await supabase.from('consents').insert({
      consultation_id: consultation_id || null,
      consent_type,
      granted: granted !== false,
      patient_name: patient_name || null,
      ip_address: ip,
    })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'GET') {
    const { consultation_id } = req.query
    if (!consultation_id) return res.status(400).json({ error: 'consultation_id required' })
    const { data, error } = await supabase.from('consents')
      .select('*').eq('consultation_id', consultation_id).order('created_at')
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ consents: data || [] })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
