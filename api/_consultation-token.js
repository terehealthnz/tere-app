import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

export default async function handler(req, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  if (req.method === 'POST') {
    // Generate a token for a consultation
    const { consultation_id } = req.body
    if (!consultation_id) return res.status(400).json({ error: 'consultation_id required' })

    const token = randomBytes(32).toString('hex')
    const expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days

    const { error } = await supabase.from('consultation_tokens').insert({ consultation_id, token, expires_at })
    if (error) return res.status(500).json({ error: error.message })

    return res.status(200).json({ token, expires_at })
  }

  if (req.method === 'GET') {
    // Validate a token and return consultation summary (no clinical notes)
    const { token } = req.query
    if (!token) return res.status(400).json({ error: 'token required' })

    const { data: tokenRow, error: tokenErr } = await supabase.from('consultation_tokens')
      .select('*').eq('token', token).single()

    if (tokenErr || !tokenRow) return res.status(404).json({ error: 'Invalid or expired link' })
    if (new Date(tokenRow.expires_at) < new Date()) return res.status(410).json({ error: 'This link has expired' })

    const { data: consult, error: cErr } = await supabase.from('consultations')
      .select(`
        id, created_at, patient_first_name, patient_last_name, patient_dob,
        patient_nhi, chief_complaint, outcome, status, provider_display_name,
        notes_finalised_at, medical_certificate_issued, acc_eligible,
        acc_read_code, gp_name, pharmacy, recall_date, recall_note,
        payment_amount, is_acc, insurance_receipt_purchased_at
      `)
      .eq('id', tokenRow.consultation_id).single()

    if (cErr || !consult) return res.status(404).json({ error: 'Consultation not found' })

    // Get prescriptions (actions stored in notes_final)
    let prescriptions = []
    let plan = ''
    try {
      const { data: full } = await supabase.from('consultations')
        .select('notes_final').eq('id', tokenRow.consultation_id).single()
      const notes = typeof full?.notes_final === 'string' ? JSON.parse(full.notes_final) : full?.notes_final
      prescriptions = (notes?.actions || []).filter(a => a.type === 'prescription')
      plan = notes?.sections?.plan || ''
    } catch {}

    return res.status(200).json({ consult, prescriptions, plan })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
