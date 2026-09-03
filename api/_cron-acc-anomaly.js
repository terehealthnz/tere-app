// ACC-specific anomaly detection (task #379).
//
// Runs 07:15 UTC daily (15 min after the general security-anomaly cron so
// they don't collide on Supabase). Flags patterns that specifically indicate
// misuse of ACC data:
//
//   1. Provider viewed / exported > 20 ACC bundles in the day (default)
//   2. Provider opened an ACC-billed consult for a patient who was never
//      in their own consult history (potential targeted lookup)
//   3. Off-hours (22:00–06:00 NZT) ACC access at all
//   4. Bulk certificate generation (> 10 acc_cert.* in a day by one provider)
//
// Emails admin only when at least one anomaly fires. Silent otherwise.

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from './_email-client.js'

const ADMIN_EMAIL = 'terehealthnz@gmail.com'
const ACC_BUNDLE_THRESHOLD = 20
const ACC_CERT_THRESHOLD = 10

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
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const findings = { highBundle: [], highCert: [], offHoursAcc: [], strangerLookup: [] }

  // Pull yesterday's audit_logs relevant to ACC.
  const { data: rows } = await supabase.from('audit_logs')
    .select('provider_id, provider_name, event_type, resource_id, consultation_id, patient_ref, created_at, ip')
    .gte('created_at', since)
    .or('event_type.like.acc_%,event_type.like.consult_opened,event_type.like.acc_cert.%')
    .limit(50000)

  // Group by provider.
  const perProvider = new Map()
  for (const r of rows || []) {
    if (!r.provider_id) continue
    const bucket = perProvider.get(r.provider_id) || { provider_name: r.provider_name, bundles: 0, certs: 0, off: 0, accConsults: [] }
    if (r.event_type === 'acc_audit_bundle_export') bucket.bundles++
    if (String(r.event_type || '').startsWith('acc_cert.')) bucket.certs++
    // Off-hours check
    const nzHour = parseInt(new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', hour12: false }).format(new Date(r.created_at)), 10)
    if ((nzHour < 6 || nzHour >= 22) && (r.event_type === 'consult_opened' || String(r.event_type || '').startsWith('acc_'))) bucket.off++
    if (r.event_type === 'consult_opened' && r.consultation_id) bucket.accConsults.push({ consultation_id: r.consultation_id, patient_ref: r.patient_ref })
    perProvider.set(r.provider_id, bucket)
  }

  for (const [providerId, b] of perProvider) {
    if (b.bundles > ACC_BUNDLE_THRESHOLD) findings.highBundle.push({ provider_id: providerId, provider_name: b.provider_name, count: b.bundles })
    if (b.certs > ACC_CERT_THRESHOLD)     findings.highCert.push({ provider_id: providerId, provider_name: b.provider_name, count: b.certs })
    if (b.off > 0)                        findings.offHoursAcc.push({ provider_id: providerId, provider_name: b.provider_name, count: b.off })
  }

  // Stranger-lookup detection: for consult_opened events on ACC-flagged
  // consults, check whether the opening provider was ever the assigned
  // provider on ANY consult for this patient. If not, that's a signal.
  const openedAcc = (rows || []).filter(r => r.event_type === 'consult_opened' && r.consultation_id)
  const consultIds = [...new Set(openedAcc.map(r => r.consultation_id))]
  if (consultIds.length) {
    const { data: consults } = await supabase.from('consultations')
      .select('id, patient_id, provider_id, acc_claim_number').in('id', consultIds)
    const consultsById = new Map((consults || []).map(c => [c.id, c]))
    for (const r of openedAcc) {
      const c = consultsById.get(r.consultation_id)
      if (!c || !c.acc_claim_number) continue // only care about ACC-billed
      if (!c.patient_id) continue
      // Has this provider EVER treated this patient?
      const { count } = await supabase.from('consultations')
        .select('id', { count: 'exact', head: true })
        .eq('patient_id', c.patient_id)
        .eq('provider_id', r.provider_id)
      if ((count || 0) === 0) {
        findings.strangerLookup.push({ provider_id: r.provider_id, provider_name: r.provider_name, patient_ref: r.patient_ref, consult_id: r.consultation_id })
      }
    }
  }

  const totalFindings = findings.highBundle.length + findings.highCert.length + findings.offHoursAcc.length + findings.strangerLookup.length
  if (!totalFindings) return res.status(200).json({ ok: true, findings, message: 'No ACC-specific anomalies' })

  const lines = ['ACC-specific anomaly digest — last 24h', '']
  if (findings.highBundle.length) {
    lines.push(`🚨 High ACC bundle exports (>${ACC_BUNDLE_THRESHOLD}):`)
    findings.highBundle.forEach(f => lines.push(`  • ${f.provider_name}: ${f.count} bundles`))
    lines.push('')
  }
  if (findings.highCert.length) {
    lines.push(`⚠️ High ACC cert generation (>${ACC_CERT_THRESHOLD}):`)
    findings.highCert.forEach(f => lines.push(`  • ${f.provider_name}: ${f.count} certs`))
    lines.push('')
  }
  if (findings.offHoursAcc.length) {
    lines.push('⏰ Off-hours ACC access (22:00–06:00 NZT):')
    findings.offHoursAcc.forEach(f => lines.push(`  • ${f.provider_name}: ${f.count} events`))
    lines.push('')
  }
  if (findings.strangerLookup.length) {
    lines.push('🔍 Provider opened ACC chart for patient they have never treated:')
    findings.strangerLookup.slice(0, 30).forEach(f => lines.push(`  • ${f.provider_name} → patient ${f.patient_ref} (consult ${String(f.consult_id).slice(0, 8)}…)`))
    if (findings.strangerLookup.length > 30) lines.push(`  … + ${findings.strangerLookup.length - 30} more`)
    lines.push('')
  }
  lines.push('Review in Admin → Compliance → Audit log, filter by the flagged provider.')

  try {
    await sendEmail({
      from:    'Tere Security <hello@terehealth.co.nz>',
      to:      ADMIN_EMAIL,
      subject: `ACC anomaly digest — ${totalFindings} signal(s)`,
      text:    lines.join('\n'),
    })
  } catch (e) { console.error('[cron-acc-anomaly] email failed:', e.message) }

  return res.status(200).json({ ok: true, findings })
}
