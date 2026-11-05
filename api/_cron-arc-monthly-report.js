// /api/cron-arc-monthly-report - monthly fan-out of ARC facility reports.
//
// Fires day 7 of each month at 20:00 UTC (09:00 NZDT). Picks every active
// aged_care facility whose delivery_status='ok', then invokes the per-
// facility report pipeline (api/_arc-monthly-report.js) for the previous
// calendar month.
//
// Skipped automatically:
//   - facilities with delivery_status='bounced' (admin needs to fix
//     the contact + press "Mark resolved")
//   - facilities marked is_active=false (off-boarded)
//
// Why the cron doesn't inline the SES send itself:
//   - keeps one code path for admin manual + cron fan-out (less drift risk)
//   - lets the admin "Send report now" button exercise the exact same
//     pipeline the cron runs - any issue admin sees in testing is the
//     issue the cron will hit tomorrow
//
// Internal call is a POST with trigger=cron_monthly and the shared
// CRON_SECRET. We use a plain fetch rather than importing the handler
// directly so the per-facility runs are independent (one facility's
// failure doesn't abort the fan-out) and so Vercel's per-function
// isolation gets exercised.

import { createClient } from '@supabase/supabase-js'
import { verifyCronSecret } from './_cron-auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// Infer the public base URL from Vercel's own env hints. VERCEL_URL omits
// the scheme and never includes custom domains; VITE_APP_URL is set in
// prod/preview envs by the operator. Falls back to the terehealth
// canonical domain when nothing better is around.
function selfBaseUrl() {
  if (process.env.VITE_APP_URL) return String(process.env.VITE_APP_URL).replace(/\/$/, '')
  if (process.env.VERCEL_URL)   return `https://${process.env.VERCEL_URL}`
  return 'https://terehealth.co.nz'
}

// Previous calendar month in YYYY-MM form.
function previousPeriodLabel() {
  const d = new Date()
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()  // 0-indexed; m-1 gives prior month
  const prior = new Date(Date.UTC(y, m - 1, 1))
  return prior.toISOString().slice(0, 7)
}

export default async function handler(req, res) {
  if (!verifyCronSecret(req)) return res.status(401).json({ error: 'Invalid cron secret' })

  const supabase = admin()
  const { data: facilities, error } = await supabase
    .from('employers')
    .select('id, company_name, delivery_status')
    .eq('org_type', 'aged_care')
    .eq('is_active', true)
  if (error) { console.error('[cron-arc-monthly-report] load failed:', error); return res.status(500).json({ error: 'Load failed' }) }

  const period = previousPeriodLabel()
  const base = selfBaseUrl()
  const results = []
  let skipped_bounced = 0

  for (const f of (facilities || [])) {
    if (f.delivery_status === 'bounced') {
      skipped_bounced += 1
      results.push({ employer_id: f.id, company_name: f.company_name, skipped: 'delivery_bounced' })
      continue
    }
    try {
      const r = await fetch(`${base}/api/arc-monthly-report?employer_id=${encodeURIComponent(f.id)}&period=${period}&trigger=cron_monthly&secret=${encodeURIComponent(process.env.CRON_SECRET || '')}`, {
        method: 'POST',
      })
      const body = await r.json().catch(() => ({}))
      results.push({ employer_id: f.id, company_name: f.company_name, ok: r.ok, status: r.status, ses_message_id: body?.ses_message_id || null, error: r.ok ? null : (body?.error || `HTTP ${r.status}`) })
    } catch (e) {
      results.push({ employer_id: f.id, company_name: f.company_name, ok: false, error: e?.message || 'fetch_failed' })
    }
  }

  return res.status(200).json({
    period,
    processed: results.length,
    skipped_bounced,
    results,
  })
}
