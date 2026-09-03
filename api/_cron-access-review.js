// Quarterly access review reminder (task #383).
//
// Runs on the 1st of Jan / Apr / Jul / Oct at 09:00 NZT via vercel.json cron.
// Emails admin the full list of active providers with their roles + last
// login + last PHI access, and asks them to walk it. This is a cheap but
// high-value ISO 27001 / HIPC / HDC good-practice control (least privilege
// review cadence).

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

  const force = req.query?.force === '1'
  const now = new Date()
  const nzMonth = parseInt(new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', month: 'numeric' }).format(now), 10)
  const nzDay = parseInt(new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric' }).format(now), 10)
  const isQuarterStart = [1, 4, 7, 10].includes(nzMonth) && nzDay === 1
  if (!force && !isQuarterStart) {
    return res.status(200).json({ ok: true, skipped: 'not a quarter start' })
  }

  const supabase = admin()

  const { data: providers } = await supabase.from('providers')
    .select('id, first_name, last_name, email, is_active, is_admin, is_billing_admin, is_supervisor, is_provider, last_access_review_at')
    .eq('is_active', true)
    .order('last_name')

  // Last PHI access per provider (best-effort — audit_logs may or may not
  // cover every case; use max created_at for each provider_id in the last
  // 90 days as a signal).
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { data: logs } = await supabase.from('audit_logs')
    .select('provider_id, created_at').gte('created_at', since).limit(50000)
  const lastAccessByProvider = new Map()
  for (const l of logs || []) {
    const prior = lastAccessByProvider.get(l.provider_id)
    if (!prior || new Date(l.created_at) > new Date(prior)) {
      lastAccessByProvider.set(l.provider_id, l.created_at)
    }
  }

  const roleTag = (p) => {
    const tags = []
    if (p.is_admin)         tags.push('admin')
    if (p.is_billing_admin) tags.push('billing_admin')
    if (p.is_supervisor)    tags.push('supervisor')
    if (p.is_provider)      tags.push('provider')
    return tags.length ? tags.join(' + ') : '(none)'
  }
  const nzDate = (iso) => {
    if (!iso) return 'never'
    try { return new Date(iso).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: 'short', year: 'numeric' }) } catch { return String(iso) }
  }

  const lines = [
    `Quarterly access review — Tere Health`,
    `Cadence: 1st of Jan/Apr/Jul/Oct. This is your prompt for ${now.toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', month: 'long', year: 'numeric' })}.`,
    ``,
    `Walk this list and confirm each active provider still needs the role they have:`,
    ``,
  ]
  for (const p of providers || []) {
    const last = lastAccessByProvider.get(p.id)
    const reviewed = p.last_access_review_at
    const dueTag = !reviewed || new Date(reviewed) < new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) ? ' ⚠ REVIEW OVERDUE' : ''
    lines.push(`  • ${p.first_name || ''} ${p.last_name || ''}`.trim() + ` (${p.email || p.id.slice(0, 8)})${dueTag}`)
    lines.push(`      roles: ${roleTag(p)} · last activity: ${nzDate(last)} · last review: ${nzDate(reviewed)}`)
  }
  lines.push('')
  lines.push('After walking the list, mark each provider reviewed:')
  lines.push('  Admin → Team → click provider → "Mark reviewed" (or hit')
  lines.push('  POST /api/providers?id=X {"last_access_review_at":"<now>"} manually).')
  lines.push('')
  lines.push('If any role looks wrong, remove it via the Team panel before the next quarter.')

  try {
    await sendEmail({
      from:    'Tere Compliance <hello@terehealth.co.nz>',
      to:      ADMIN_EMAIL,
      subject: `Quarterly access review — ${providers?.length || 0} active providers`,
      text:    lines.join('\n'),
    })
  } catch (e) { console.error('[cron-access-review] email failed:', e.message) }

  return res.status(200).json({ ok: true, providers_reviewed: providers?.length || 0 })
}
