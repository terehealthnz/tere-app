import { createClient } from '@supabase/supabase-js'

async function notifyComplaintsInbox(complaint) {
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: 'Tere Health <noreply@terehealth.co.nz>',
      replyTo: 'terehealthnz@gmail.com',
      to: ['terehealthnz@gmail.com'],
      subject: `[Complaint logged] ${complaint.complaint_type || 'General'} — ${complaint.patient_name || 'Anonymous'}`,
      text: [
        `A new complaint has been logged in Tere Health.`,
        '',
        `Patient: ${complaint.patient_name || 'Anonymous'}`,
        `Type: ${complaint.complaint_type || 'Not specified'}`,
        `Severity: ${complaint.severity || 'medium'}`,
        '',
        `Description:`,
        complaint.complaint_description,
        '',
        `Logged at: ${complaint.created_at}`,
        '',
        `Respond within 5 working days as per complaints policy.`,
        `View in Admin → Safety → Complaints.`,
      ].join('\n'),
    })
  } catch (e) {
    console.error('[complaints] Notification email failed:', e.message)
  }
}

export default async function handler(req, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  if (req.method === 'POST') {
    const {
      // Accept both field naming conventions (frontend sends description/complaint_type)
      description, complaint_description,
      complaint_type, source,
      patient_name, patient_email, patient_phone,
      provider_id, provider_name,
      consultation_id, consultation_date, severity,
      status,
    } = req.body

    const body = description || complaint_description
    if (!body) return res.status(400).json({ error: 'description required' })

    const { data, error } = await supabase.from('complaints').insert({
      source: source || 'patient',
      patient_name: patient_name || null,
      patient_email: patient_email || null,
      patient_phone: patient_phone || null,
      complaint_description: body,
      complaint_type: complaint_type || null,
      provider_id: provider_id || null,
      provider_name: provider_name || null,
      consultation_id: consultation_id || null,
      consultation_date: consultation_date || null,
      severity: severity || 'medium',
      status: status || 'open',
    }).select().single()

    if (error) return res.status(500).json({ error: error.message })

    // Notify complaints inbox
    notifyComplaintsInbox(data)

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
