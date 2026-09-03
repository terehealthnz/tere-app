// Auto-revoke expired break-glass grants (task #382 companion).
//
// Runs every 5 minutes via vercel.json cron. Any active grant whose
// expires_at is in the past gets:
//   1. revoked_at stamped
//   2. the role_added flag flipped back to false on the target providers row
//      (only if no OTHER active grant is still granting the same role to
//      the same target)
//   3. audit_log entry
//   4. email to admin confirming the auto-revoke

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from './_email-client.js'

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
  const now = new Date().toISOString()

  const { data: expired } = await supabase.from('break_glass_grants')
    .select('*').is('revoked_at', null).lt('expires_at', now)

  if (!expired?.length) return res.status(200).json({ ok: true, revoked: 0 })

  const summaryLines = ['Break-glass grants auto-revoked:', '']
  for (const g of expired) {
    // Any other still-active grant of the same role on this target?
    const { data: others } = await supabase.from('break_glass_grants')
      .select('id').eq('target_provider_id', g.target_provider_id).eq('role_added', g.role_added)
      .is('revoked_at', null).gt('expires_at', now).neq('id', g.id)
    const shouldStrip = !others || others.length === 0

    if (shouldStrip) {
      await supabase.from('providers').update({ [g.role_added]: false }).eq('id', g.target_provider_id)
    }
    await supabase.from('break_glass_grants').update({ revoked_at: now, metadata: { ...(g.metadata || {}), auto_revoked: true } }).eq('id', g.id)

    try {
      await supabase.from('audit_logs').insert({
        event_type: 'break_glass_revoked',
        provider_id: g.target_provider_id,
        provider_name: g.metadata?.target_name || null,
        resource_type: 'break_glass_grant',
        resource_id: g.id,
        metadata: { role_removed: g.role_added, auto_revoked: true, granted_by: g.granted_by, expires_at: g.expires_at },
      })
    } catch {}

    summaryLines.push(`  • ${g.metadata?.target_name || g.target_provider_id} — ${g.role_added} removed (was granted for ${g.metadata?.minutes || '?'} min)`)
  }

  try {
    await sendEmail({
      from:    'Tere Security <hello@terehealth.co.nz>',
      to:      'terehealthnz@gmail.com',
      subject: `Break-glass auto-revoke — ${expired.length} grant(s) expired`,
      text:    summaryLines.join('\n'),
    })
  } catch (e) { console.error('[cron-break-glass-revoke] email failed:', e.message) }

  return res.status(200).json({ ok: true, revoked: expired.length })
}
