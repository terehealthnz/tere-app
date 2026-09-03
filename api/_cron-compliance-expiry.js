// Nightly compliance-expiry digest (task #413).
//
// Runs 20:30 UTC (~08:30 NZT winter / 09:30 NZT summer, i.e. start of admin's day).
// Scans providers + COI table for anything that will expire or become
// overdue soon. Emails admin ONLY when there's something to act on;
// silent otherwise.
//
// Checks:
//   1. PHI training attestation expiring in <30 days (or already expired)
//   2. Cultural safety training expiring in <30 days (or already expired)
//   3. MCNZ APC expiring in <30 days / <7 days (or expired — hard block)
//   4. NCNZ APC expiring in <30 days (once NP hires land)
//   5. COI declaration not reviewed in >100 days (quarterly cadence)
//
// Manual invocation for testing:
//   GET /api/cron-compliance-expiry?secret=<CRON_SECRET>&force=1

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from './_email-client.js'

const ADMIN_EMAIL = 'terehealthnz@gmail.com'
const WARN_DAYS_TRAINING = 30
const WARN_DAYS_APC = 30
const CRITICAL_DAYS_APC = 7
const COI_STALE_DAYS = 100

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const nzDate = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: 'short', year: 'numeric' }) } catch { return String(iso) }
}
const daysBetween = (fromIso, toIso) => Math.floor((new Date(toIso).getTime() - new Date(fromIso).getTime()) / (24 * 60 * 60 * 1000))

export default async function handler(req, res) {
  const { verifyCronSecret } = await import('./_cron-auth.js')
  if (!verifyCronSecret(req)) return res.status(404).json({ error: 'Not found' })

  const supabase = admin()
  const now = new Date().toISOString()

  const findings = {
    phi_training:       { expired: [], warn: [] },
    cultural_safety:    { expired: [], warn: [] },
    mcnz_apc:           { expired: [], critical: [], warn: [] },
    ncnz_apc:           { expired: [], warn: [] },
    coi_review_overdue: [],
  }

  // ── Providers scan ──────────────────────────────────────────────────────────
  const { data: providers } = await supabase.from('providers')
    .select('id, first_name, last_name, email, is_active, apc_expiry_date, ncnz_apc_expiry, last_phi_training_at, phi_training_valid_until, last_cultural_safety_training_at, cultural_safety_training_valid_until')
    .eq('is_active', true)

  for (const p of providers || []) {
    const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || p.id.slice(0, 8)

    // PHI training
    if (p.phi_training_valid_until) {
      const days = daysBetween(now, p.phi_training_valid_until)
      if (days < 0)                        findings.phi_training.expired.push({ name, expiry: p.phi_training_valid_until, days })
      else if (days <= WARN_DAYS_TRAINING) findings.phi_training.warn.push({ name, expiry: p.phi_training_valid_until, days })
    } else {
      findings.phi_training.expired.push({ name, expiry: null, days: null, never: true })
    }

    // Cultural safety training
    if (p.cultural_safety_training_valid_until) {
      const days = daysBetween(now, p.cultural_safety_training_valid_until)
      if (days < 0)                        findings.cultural_safety.expired.push({ name, expiry: p.cultural_safety_training_valid_until, days })
      else if (days <= WARN_DAYS_TRAINING) findings.cultural_safety.warn.push({ name, expiry: p.cultural_safety_training_valid_until, days })
    } else {
      findings.cultural_safety.expired.push({ name, expiry: null, days: null, never: true })
    }

    // MCNZ APC
    if (p.apc_expiry_date) {
      const days = daysBetween(now, p.apc_expiry_date)
      if (days < 0)                             findings.mcnz_apc.expired.push({ name, expiry: p.apc_expiry_date, days })
      else if (days <= CRITICAL_DAYS_APC)       findings.mcnz_apc.critical.push({ name, expiry: p.apc_expiry_date, days })
      else if (days <= WARN_DAYS_APC)           findings.mcnz_apc.warn.push({ name, expiry: p.apc_expiry_date, days })
    }

    // NCNZ APC (only flag if the provider has an NCNZ number — implies NP/RN)
    if (p.ncnz_apc_expiry) {
      const days = daysBetween(now, p.ncnz_apc_expiry)
      if (days < 0)                        findings.ncnz_apc.expired.push({ name, expiry: p.ncnz_apc_expiry, days })
      else if (days <= WARN_DAYS_APC)      findings.ncnz_apc.warn.push({ name, expiry: p.ncnz_apc_expiry, days })
    }
  }

  // ── COI review overdue ──────────────────────────────────────────────────────
  const cutoff = new Date(Date.now() - COI_STALE_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: coiRows } = await supabase.from('conflict_of_interest_declarations')
    .select('id, provider_name, declaration_type, description, reviewed_at, disclosed_at')
    .eq('active', true)
    .or(`reviewed_at.is.null,reviewed_at.lt.${cutoff}`)
  for (const r of coiRows || []) {
    findings.coi_review_overdue.push({
      name: r.provider_name || '(unnamed)',
      type: r.declaration_type,
      description: r.description,
      last_reviewed: r.reviewed_at,
      disclosed: r.disclosed_at,
    })
  }

  const totalActionable =
    findings.phi_training.expired.length + findings.phi_training.warn.length +
    findings.cultural_safety.expired.length + findings.cultural_safety.warn.length +
    findings.mcnz_apc.expired.length + findings.mcnz_apc.critical.length + findings.mcnz_apc.warn.length +
    findings.ncnz_apc.expired.length + findings.ncnz_apc.warn.length +
    findings.coi_review_overdue.length

  const force = req.query?.force === '1'
  if (!totalActionable && !force) {
    return res.status(200).json({ ok: true, message: 'Compliance digest — everything current' })
  }

  // ── Format the email ────────────────────────────────────────────────────────
  const lines = [
    'Nightly compliance-expiry digest — Tere Health',
    `${new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })} NZT`,
    '',
  ]
  const section = (title, items, formatter) => {
    if (!items.length) return
    lines.push(title)
    items.forEach(i => lines.push('  • ' + formatter(i)))
    lines.push('')
  }

  section('🚨 MCNZ APC EXPIRED (provider CANNOT prescribe — renew immediately):',
    findings.mcnz_apc.expired,
    i => `${i.name} — expired ${Math.abs(i.days)}d ago (${nzDate(i.expiry)})`)

  section('⏰ MCNZ APC expiring in ≤7 days (CRITICAL):',
    findings.mcnz_apc.critical,
    i => `${i.name} — ${i.days}d left (expires ${nzDate(i.expiry)})`)

  section('⚠ MCNZ APC expiring in ≤30 days:',
    findings.mcnz_apc.warn,
    i => `${i.name} — ${i.days}d left (expires ${nzDate(i.expiry)})`)

  section('🚨 NCNZ APC EXPIRED:',
    findings.ncnz_apc.expired,
    i => `${i.name} — expired ${Math.abs(i.days)}d ago`)

  section('⚠ NCNZ APC expiring in ≤30 days:',
    findings.ncnz_apc.warn,
    i => `${i.name} — ${i.days}d left`)

  section('🚨 PHI training expired / never done (provider should NOT be accessing PHI):',
    findings.phi_training.expired,
    i => i.never ? `${i.name} — NEVER attested` : `${i.name} — expired ${Math.abs(i.days)}d ago`)

  section('⚠ PHI training expiring in ≤30 days:',
    findings.phi_training.warn,
    i => `${i.name} — ${i.days}d left`)

  section('🚨 Cultural safety training expired / never done:',
    findings.cultural_safety.expired,
    i => i.never ? `${i.name} — NEVER attested` : `${i.name} — expired ${Math.abs(i.days)}d ago`)

  section('⚠ Cultural safety training expiring in ≤30 days:',
    findings.cultural_safety.warn,
    i => `${i.name} — ${i.days}d left`)

  section(`📋 Conflict-of-Interest declarations overdue for review (>${COI_STALE_DAYS} days):`,
    findings.coi_review_overdue,
    i => `${i.name} · ${i.type} — last reviewed ${nzDate(i.last_reviewed) || 'never'} (disclosed ${nzDate(i.disclosed)})`)

  lines.push('Actions:')
  lines.push('  • APC renewals: MCNZ / NCNZ portal, then update providers.apc_expiry_date via Admin > Team.')
  lines.push('  • PHI + cultural safety attestations: providers self-serve on MyProfile.')
  lines.push('  • COI reviews: Admin > Compliance > Conflict of Interest Register.')
  lines.push('')
  lines.push('This email fires nightly only when something needs action. Silent when everything is current.')

  try {
    await sendEmail({
      from:    'Tere Compliance <hello@terehealth.co.nz>',
      to:      ADMIN_EMAIL,
      subject: `Compliance digest — ${totalActionable} item(s) need attention`,
      text:    lines.join('\n'),
    })
  } catch (e) { console.error('[cron-compliance-expiry] email failed:', e.message) }

  return res.status(200).json({ ok: true, findings, total_actionable: totalActionable })
}
