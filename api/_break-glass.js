// /api/break-glass — emergency role elevation (task #382).
//
// POST { targetProviderId, roleToAdd, minutes, justification }
//   → grants a temporary role. Only an admin can call this.
//   → all OTHER admins get notified immediately.
//   → audit_log entry + break_glass_grants row.
//   → the actual role bit is flipped on providers row (with a companion
//     job to revoke when expires_at passes — see api/_cron-break-glass-revoke).
//
// GET  → list active grants (admin only).

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from './_email-client.js'
import { raiseSecurityAlert } from './_security-alert.js'

const ADMIN_EMAIL = 'terehealthnz@gmail.com'
const ALLOWED_ROLES = new Set(['is_admin', 'is_billing_admin', 'is_supervisor'])

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export default async function handler(req, res) {
  const actor = req.auth?.provider
  if (!actor?.is_admin) return res.status(403).json({ error: 'Admin role required' })
  const supabase = admin()

  if (req.method === 'GET') {
    const { data } = await supabase.from('break_glass_grants')
      .select('*').is('revoked_at', null).gt('expires_at', new Date().toISOString())
      .order('granted_at', { ascending: false })
    return res.status(200).json({ grants: data || [] })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { targetProviderId, roleToAdd, minutes = 60, justification } = req.body || {}
  if (!targetProviderId) return res.status(400).json({ error: 'targetProviderId required' })
  if (!roleToAdd || !ALLOWED_ROLES.has(roleToAdd)) {
    return res.status(400).json({ error: `roleToAdd must be one of: ${[...ALLOWED_ROLES].join(', ')}` })
  }
  if (!justification || String(justification).trim().length < 20) {
    return res.status(400).json({ error: 'justification required (≥ 20 chars — this goes in the audit trail + email to all other admins)' })
  }
  const mins = Math.max(5, Math.min(240, parseInt(minutes) || 60))
  const expiresAt = new Date(Date.now() + mins * 60 * 1000).toISOString()

  // Fetch target for the notification body.
  const { data: target } = await supabase.from('providers')
    .select('id, first_name, last_name, email, is_admin, is_billing_admin, is_supervisor').eq('id', targetProviderId).maybeSingle()
  if (!target) return res.status(404).json({ error: 'Target provider not found' })

  if (target[roleToAdd]) {
    return res.status(409).json({ error: `Target already has ${roleToAdd} — no elevation needed` })
  }

  // Flip the role bit + insert the grant row.
  const patch = { [roleToAdd]: true }
  const { error: uErr } = await supabase.from('providers').update(patch).eq('id', targetProviderId)
  if (uErr) { console.error('[break-glass] role update failed:', uErr); return res.status(500).json({ error: 'Server error' }) }

  const { data: grant, error: iErr } = await supabase.from('break_glass_grants').insert({
    target_provider_id: targetProviderId,
    granted_by:         actor.id,
    expires_at:         expiresAt,
    role_added:         roleToAdd,
    justification:      String(justification).trim().slice(0, 2000),
    metadata:           { minutes: mins, granted_by_name: `${actor.first_name || ''} ${actor.last_name || ''}`.trim(), target_name: `${target.first_name || ''} ${target.last_name || ''}`.trim() },
  }).select('*').maybeSingle()
  if (iErr) { console.error('[break-glass] insert failed:', iErr); return res.status(500).json({ error: 'Server error' }) }

  // Notify all OTHER admins so nobody can quietly self-elevate.
  try {
    const { data: admins } = await supabase.from('providers')
      .select('email, id').eq('is_admin', true).eq('is_active', true)
    const others = (admins || []).filter(a => a.id !== actor.id && a.email).map(a => a.email)
    if (others.length) {
      await sendEmail({
        from:    'Tere Security <hello@terehealth.co.nz>',
        to:      ADMIN_EMAIL,
        cc:      others.join(','),
        subject: `🚨 BREAK-GLASS: ${roleToAdd} granted to ${target.first_name || ''} ${target.last_name || ''}`.trim() + ` (by ${actor.first_name || ''} ${actor.last_name || ''})`.trim(),
        text: [
          `A break-glass role elevation has been granted.`,
          ``,
          `Target:        ${target.first_name || ''} ${target.last_name || ''} (${target.email || target.id})`.trim(),
          `Role added:    ${roleToAdd}`,
          `Duration:      ${mins} minutes (expires ${new Date(expiresAt).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })} NZT)`,
          `Granted by:    ${actor.first_name || ''} ${actor.last_name || ''} (${actor.email || actor.id})`.trim(),
          ``,
          `Justification:`,
          `  ${String(justification).trim()}`,
          ``,
          `If this looks wrong, revoke immediately: Admin → Compliance → Break-glass grants.`,
          `Auto-revokes at ${new Date(expiresAt).toISOString()}.`,
        ].join('\n'),
      })
    }
  } catch (e) { console.error('[break-glass] notify failed:', e.message) }

  // Real-time critical alert (email + SMS to on-call).
  raiseSecurityAlert(req, {
    eventType: 'break_glass_activated',
    severity:  'alert',
    critical:  true,
    summary:   `${roleToAdd} granted to ${target.first_name || ''} ${target.last_name || ''} for ${mins}min by ${actor.first_name || ''} ${actor.last_name || ''}`.trim(),
    metadata:  { grant_id: grant.id, target_id: targetProviderId, role_added: roleToAdd, minutes: mins, justification: String(justification).trim().slice(0, 200) },
  }).catch(() => {})

  return res.status(200).json({ ok: true, grant, expires_at: expiresAt })
}
