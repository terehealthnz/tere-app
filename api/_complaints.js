import { createClient } from '@supabase/supabase-js'
import { sanitizeSubject } from './_email-safety.js'
import { sendEmail } from './_email-client.js'

async function notifyComplaintsInbox(complaint) {
  try {
    await sendEmail({
      from: 'Tere Health <hello@terehealth.co.nz>',
      replyTo: 'terehealthnz@gmail.com',
      to: ['terehealthnz@gmail.com'],
      // sanitizeSubject strips CR/LF — blocks header-injection via patient
      // name field (e.g. "John\r\nBcc: attacker@evil.com").
      subject: sanitizeSubject(`[Complaint logged] ${complaint.complaint_type || 'General'} — ${complaint.patient_name || 'Anonymous'}`),
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

    if (error) { console.error('[complaints] error failed:', error); return res.status(500).json({ error: 'Server error' }) }

    // Notify complaints inbox
    notifyComplaintsInbox(data)

    return res.status(200).json({ ok: true, complaint: data })
  }

  if (req.method === 'GET') {
    const { status, limit = 100 } = req.query
    let q = supabase.from('complaints').select('*').order('created_at', { ascending: false }).limit(parseInt(limit))
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    if (error) { console.error('[complaints] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ complaints: data || [] })
  }

  if (req.method === 'PATCH') {
    const { id, offerAdvocacy, ...updates } = req.body
    if (!id) return res.status(400).json({ error: 'id required' })
    // Right 10(4) — auto-append HDC Advocacy Service reference when a response
    // is being sent. Default ON. Sets hdc_advocacy_offered = true for audit.
    if (offerAdvocacy !== false && (updates.status === 'resolved' || updates.response_sent)) {
      updates.hdc_advocacy_offered = true
      updates.hdc_advocacy_offered_at = new Date().toISOString()
      if (updates.resolution_notes && !/HDC Advocacy/i.test(updates.resolution_notes)) {
        updates.resolution_notes += '\n\n---\nYou also have the right to contact the HDC Advocacy Service for free, confidential advocacy about this concern:\n  Phone: 0800 555 050\n  Email: advocacy@hdc.org.nz\n  Web: https://www.hdc.org.nz/complaints/advocacy-service/\nThis is your right under Right 10(4) of the Code of Health and Disability Services Consumers\' Rights.'
      }
    }
    const { error } = await supabase.from('complaints')
      .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { console.error('[complaints] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
