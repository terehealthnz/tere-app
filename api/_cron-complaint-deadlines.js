// Daily complaint-deadline scan (task #361).
//
// Emails admin when any open complaint is <5 working days from its
// response_due_at deadline (HDC Right 10 = 20 working days ≈ 28 calendar).
// Fires at 09:00 NZT.

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from './_email-client.js'

const ADMIN_EMAIL = 'terehealthnz@gmail.com'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export default async function handler(req, res) {
  const { verifyCronSecret } = await import('./_cron-auth.js')
  if (!verifyCronSecret(req)) return res.status(404).json({ error: 'Not found' })

  const supabase = admin()
  const now = new Date()
  const fiveDaysFromNow = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)

  const { data: rows, error } = await supabase.from('complaints')
    .select('id, source, patient_name, complaint_description, status, response_due_at, assigned_to_name, created_at, severity')
    .in('status', ['open', 'acknowledged', 'investigating'])
    .lte('response_due_at', fiveDaysFromNow.toISOString())
    .order('response_due_at')

  if (error) return res.status(500).json({ error: error.message })
  if (!rows?.length) return res.status(200).json({ ok: true, count: 0, message: 'No complaints near deadline' })

  const overdue = rows.filter(r => new Date(r.response_due_at) < now)
  const dueSoon = rows.filter(r => new Date(r.response_due_at) >= now)

  const nzDateTime = (iso) => {
    try { return new Date(iso).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return String(iso) }
  }
  const daysFromNow = (iso) => {
    const ms = new Date(iso) - now
    const days = Math.floor(ms / (24 * 60 * 60 * 1000))
    return days < 0 ? `${Math.abs(days)}d OVERDUE` : `${days}d left`
  }

  const lines = ['HDC-track complaint deadlines — Tere Health', '']
  if (overdue.length) {
    lines.push(`🚨 OVERDUE (${overdue.length}):`)
    for (const r of overdue) {
      lines.push(`  - ${r.patient_name || 'Anon'} — ${daysFromNow(r.response_due_at)} — due ${nzDateTime(r.response_due_at)} — assigned: ${r.assigned_to_name || 'UNASSIGNED'} — [${r.severity}]`)
      lines.push(`    “${String(r.complaint_description || '').slice(0, 120)}${(r.complaint_description || '').length > 120 ? '…' : ''}”`)
    }
    lines.push('')
  }
  if (dueSoon.length) {
    lines.push(`⏰ Due in ≤5 days (${dueSoon.length}):`)
    for (const r of dueSoon) {
      lines.push(`  - ${r.patient_name || 'Anon'} — ${daysFromNow(r.response_due_at)} — due ${nzDateTime(r.response_due_at)} — assigned: ${r.assigned_to_name || 'UNASSIGNED'}`)
    }
    lines.push('')
  }
  lines.push('HDC Right 10 requires substantive response within 20 working days. Missing the deadline requires a written delay notification to the complainant.')
  lines.push('Admin → Compliance → Complaints panel to update status.')

  try {
    await sendEmail({
      from: 'Tere Compliance <hello@terehealth.co.nz>',
      to: ADMIN_EMAIL,
      subject: `Complaint deadlines — ${overdue.length} overdue, ${dueSoon.length} due soon`,
      text: lines.join('\n'),
    })
  } catch (e) {
    console.error('[cron-complaint-deadlines] email failed:', e.message)
  }

  return res.status(200).json({ ok: true, overdue: overdue.length, due_soon: dueSoon.length })
}
