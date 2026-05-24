import { createClient } from '@supabase/supabase-js'

const HIGH_SEVERITIES = new Set(['high', 'critical'])

async function alertAdmin(incident) {
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: 'safety@terehealth.co.nz',
      replyTo: 'terehealthnz@gmail.com',
      to: ['terehealthnz@gmail.com'],
      subject: `[${incident.severity.toUpperCase()} INCIDENT] ${incident.incident_type} — Tere Health`,
      text: [
        `A ${incident.severity} severity incident has been reported.`,
        '',
        `Type: ${incident.incident_type}`,
        `Date/Time: ${incident.incident_date}`,
        `Provider: ${incident.provider_name || 'Unknown'}`,
        `Patient NHI: ${incident.patient_nhi || 'Not provided'}`,
        '',
        `Description:`,
        incident.description,
        '',
        `Immediate actions taken:`,
        incident.immediate_actions || 'None documented',
        '',
        `View all incidents in Tere Admin → Safety tab.`,
      ].join('\n'),
    })
  } catch (e) {
    console.error('[incidents] Alert email failed:', e.message)
  }
}

export default async function handler(req, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  if (req.method === 'POST') {
    const {
      incident_type, severity = 'low', incident_date, patient_nhi,
      description, immediate_actions, contributing_factors,
      provider_id, provider_name, consultation_id,
    } = req.body
    if (!incident_type || !description) return res.status(400).json({ error: 'incident_type and description required' })

    const { data, error } = await supabase.from('incidents').insert({
      incident_type, severity, incident_date: incident_date || new Date().toISOString(),
      patient_nhi, description, immediate_actions, contributing_factors,
      provider_id, provider_name, consultation_id,
    }).select().single()

    if (error) return res.status(500).json({ error: error.message })

    // Alert admin for high/critical
    if (HIGH_SEVERITIES.has(severity)) {
      alertAdmin(data)
    }

    return res.status(200).json({ ok: true, incident: data })
  }

  if (req.method === 'GET') {
    const { status, severity, limit = 100 } = req.query
    let q = supabase.from('incidents').select('*').order('incident_date', { ascending: false }).limit(parseInt(limit))
    if (status) q = q.eq('status', status)
    if (severity) q = q.eq('severity', severity)
    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ incidents: data || [] })
  }

  if (req.method === 'PATCH') {
    const { id, ...updates } = req.body
    if (!id) return res.status(400).json({ error: 'id required' })
    const { error } = await supabase.from('incidents').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
