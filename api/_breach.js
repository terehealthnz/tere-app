import { createClient } from '@supabase/supabase-js'

async function alertAdmin(breach) {
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: 'security@terehealth.co.nz',
      to: ['patrick@terehealth.co.nz', 'justin@terehealth.co.nz'],
      subject: '[URGENT] Data breach reported — Tere Health',
      text: [
        'A data breach has been reported in Tere Health.',
        '',
        `Data affected: ${breach.data_affected}`,
        `Patients affected: ${breach.patients_affected || 'Unknown'}`,
        `Breach date/time: ${breach.breach_datetime}`,
        `How discovered: ${breach.how_discovered}`,
        `Immediate actions: ${breach.immediate_actions || 'None documented'}`,
        '',
        'OBLIGATIONS:',
        '1. Notify the Office of the Privacy Commissioner within 72 hours if risk of serious harm',
        '2. Notify affected patients',
        '3. Document everything',
        '',
        'Log in to Tere Admin → Security tab to manage this incident.',
      ].join('\n'),
    })
  } catch (e) {
    console.error('[breach] Alert email failed:', e.message)
  }
}

export default async function handler(req, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  if (req.method === 'POST') {
    const { data_affected, patients_affected, how_discovered, immediate_actions, breach_datetime, reported_by } = req.body
    if (!data_affected) return res.status(400).json({ error: 'data_affected required' })
    const { data, error } = await supabase.from('breach_log').insert({
      data_affected, patients_affected, how_discovered, immediate_actions,
      breach_datetime: breach_datetime || new Date().toISOString(),
      reported_by,
    }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    alertAdmin(data)
    return res.status(200).json({ ok: true, breach: data })
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('breach_log').select('*').order('created_at', { ascending: false }).limit(50)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ breaches: data || [] })
  }

  if (req.method === 'PATCH') {
    const { id, ...updates } = req.body
    if (!id) return res.status(400).json({ error: 'id required' })
    const { error } = await supabase.from('breach_log').update(updates).eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
