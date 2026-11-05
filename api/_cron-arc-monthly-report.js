// Monthly ARC utilisation report cron.
//
// Fires at 20:00 UTC on day 7 of each month, which is 09:00 NZDT during
// daylight saving (Oct-Apr) and 08:00 NZST otherwise - inside business
// hours year-round. Covers the previous NZ calendar month.
//
// Scans active ARC facilities whose delivery_status is 'ok' and calls
// generateAndSendArcReport() for each. Facilities with zero consults in
// the period are skipped quietly (no empty "you saw nobody" PDF).
//
// Returns {ok, period, dispatched, skipped_empty, errors, bounced,
// results} so the Vercel cron log is enough to diagnose a bad month
// without having to dig through audit_logs.
//
// Manual test:
//   curl 'https://terehealth.co.nz/api/cron-arc-monthly-report?secret=$CRON_SECRET'
//   curl 'https://terehealth.co.nz/api/cron-arc-monthly-report?secret=$CRON_SECRET&period=2026-10'
//     (explicit period lets admin re-run a month without waiting)
//   curl 'https://terehealth.co.nz/api/cron-arc-monthly-report?secret=$CRON_SECRET&employer_id=<uuid>'
//     (single facility - useful when debugging one bounce)

import { createClient } from '@supabase/supabase-js'
import { verifyCronSecret } from './_cron-auth.js'
import {
  generateAndSendArcReport,
  previousMonthPeriodNz,
} from './_arc-monthly-report.js'

const ADMIN_EMAIL = 'terehealthnz@gmail.com'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export default async function handler(req, res) {
  if (!verifyCronSecret(req)) return res.status(401).json({ error: 'Unauthorized' })

  const sb = admin()
  const period = String(req.query?.period || '').trim() || previousMonthPeriodNz()

  // Allow an explicit single-facility run for debugging. The main cron
  // path ignores this and scans all active ARC facilities.
  const singleFacility = String(req.query?.employer_id || '').trim() || null

  let facilities = []
  if (singleFacility) {
    const { data, error } = await sb.from('employers')
      .select('id, company_name, delivery_status')
      .eq('id', singleFacility)
      .eq('org_type', 'aged_care')
    if (error) return res.status(500).json({ error: 'facility_query_failed', detail: error.message })
    facilities = data || []
  } else {
    // Filter at the DB layer: aged_care + active + deliverable. The
    // deliverable filter uses `or` so a legacy row with NULL
    // delivery_status (pre-migration-#2) still gets picked up - the
    // migration added DEFAULT 'ok' so new rows are fine but existing
    // rows that were present before the migration ran may have NULL.
    const { data, error } = await sb.from('employers')
      .select('id, company_name, delivery_status')
      .eq('org_type', 'aged_care')
      .eq('is_active', true)
      .or('delivery_status.is.null,delivery_status.eq.ok')
    if (error) return res.status(500).json({ error: 'facility_query_failed', detail: error.message })
    facilities = data || []
  }

  if (facilities.length === 0) {
    return res.status(200).json({
      ok: true, period, dispatched: 0, skipped_empty: 0, errors: 0, bounced: 0,
      message: 'no_active_arc_facilities',
    })
  }

  const results = []
  let dispatched = 0
  let skippedEmpty = 0
  let errors = 0
  let bounced = 0

  for (const f of facilities) {
    try {
      const r = await generateAndSendArcReport({
        employerId: f.id,
        period,
        trigger: singleFacility ? 'cron_manual' : 'cron',
      })
      results.push({ facility_id: f.id, facility_name: f.company_name, ...r })
      if (r.ok && r.skipped) { skippedEmpty++; continue }
      if (r.ok) { dispatched++; continue }
      if (r.reason === 'delivery_status_blocked') { bounced++; continue }
      errors++
    } catch (e) {
      errors++
      results.push({
        facility_id: f.id, facility_name: f.company_name,
        ok: false, reason: 'unexpected_exception',
        detail: e?.message || String(e),
      })
      console.error('[cron-arc-monthly-report] exception for', f.id, e?.message || e)
    }
  }

  // Admin heads-up on any error or bounce. Keep quiet on success -
  // Patrick does not want a monthly "all good" ping cluttering the inbox.
  if (errors > 0 || bounced > 0) {
    try {
      const { sendEmail } = await import('./_email-client.js')
      await sendEmail({
        from: process.env.SES_FROM_EMAIL || 'Tere Health <hello@terehealth.co.nz>',
        to: [ADMIN_EMAIL],
        subject: `[Tere] ARC monthly report cron: ${errors} error${errors === 1 ? '' : 's'}, ${bounced} bounced`,
        text: [
          `ARC monthly report cron finished for period ${period}.`,
          '',
          `Dispatched OK:  ${dispatched}`,
          `Skipped (empty): ${skippedEmpty}`,
          `Blocked (bounce): ${bounced}`,
          `Errors:         ${errors}`,
          '',
          'Details:',
          ...results
            .filter(r => !r.ok || r.reason === 'delivery_status_blocked')
            .map(r => `  - ${r.facility_name} (${r.facility_id}): ${r.reason || 'ok'}${r.detail ? ' - ' + r.detail : ''}`),
        ].join('\n'),
      })
    } catch (e) {
      console.error('[cron-arc-monthly-report] admin alert failed:', e?.message || e)
    }
  }

  return res.status(200).json({
    ok: true, period, dispatched, skipped_empty: skippedEmpty, errors, bounced,
    scanned: facilities.length,
    results,
  })
}
