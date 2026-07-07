import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const supabase = getSupabase()

  // Find async messages waiting >48h with no admin notification sent yet
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const { data: overdue, error } = await supabase
    .from('consultations')
    .select('id, patient_first_name, patient_last_name, chief_complaint, created_at, async_deadline')
    .eq('consultation_subtype', 'async_message')
    .eq('status', 'waiting')
    .lt('updated_at', cutoff)
    .is('async_admin_notified_at', null)

  if (error) return res.status(500).json({ error: error.message })
  if (!overdue?.length) return res.status(200).json({ notified: 0 })

  const now = new Date().toISOString()

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)

    const rows = overdue.map(c => {
      const name = `${c.patient_first_name || ''} ${c.patient_last_name || ''}`.trim() || 'Unknown'
      const dl = c.async_deadline
        ? new Date(c.async_deadline).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        : 'no deadline set'
      const ageH = Math.round((Date.now() - new Date(c.created_at)) / 3600000)
      return `• ${name} — "${c.chief_complaint}" — ${ageH}h ago — deadline: ${dl} — ref: ${c.id.slice(0, 8).toUpperCase()}`
    }).join('\n')

    await resend.emails.send({
      from: 'Tere Health <hello@terehealth.co.nz>',
      replyTo: 'terehealthnz@gmail.com',
      to: 'terehealthnz@gmail.com',
      subject: `[URGENT] ${overdue.length} message consultation${overdue.length > 1 ? 's' : ''} unanswered >48h`,
      text: `The following message consultation${overdue.length > 1 ? 's have' : ' has'} been waiting more than 48 hours without a response:\n\n${rows}\n\nPlease log in and respond:\nhttps://terehealth.co.nz/provider`,
    })
  } catch (e) {
    console.error('[async-overdue] Email failed:', e.message)
    return res.status(500).json({ error: 'Email failed' })
  }

  // Mark as notified so we don't send duplicate alerts
  const ids = overdue.map(c => c.id)
  await supabase.from('consultations')
    .update({ async_admin_notified_at: now })
    .in('id', ids)

  return res.status(200).json({ notified: overdue.length })
}
