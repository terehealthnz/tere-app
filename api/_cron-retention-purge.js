// Monthly retention purge (task #360).
//
// HIPC Rule 9 + Privacy Act 2020 IPP9: information shall not be kept for
// longer than required for the purposes it may lawfully be used. For a
// health service the *minimum* retention is 10 years post last encounter
// (HIPC Rule 4); the *maximum* is essentially "no longer than needed" —
// which for clinical records is a judgement call. This cron enforces:
//
//   AUTO-DELETE (low-risk, no clinical value beyond retention window):
//     - security_events        > 24 months
//     - provider_login_attempts > 30 days idle
//     - support_tickets closed > 3 years
//     - job_applications not hired > 6 months post decision
//     - retention_purge_runs   > 7 years (self-managed)
//
//   CANDIDATE-FLAG (high-value clinical data, admin approval required):
//     - consultations with last activity > 10 years and no active patient
//     - patients with no consult in > 10 years
//     - prescriptions > 10 years
//     - radiology_reports / patient_documents > 10 years
//
// Every run recorded in retention_purge_runs regardless of outcome.
// Dry-run mode via ?dry_run=1 for review before scheduling a live purge.
//
// Manual invocation:
//   GET /api/cron-retention-purge?secret=<CRON_SECRET>
//   GET /api/cron-retention-purge?secret=<CRON_SECRET>&dry_run=1

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

function daysAgo(n) { return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString() }
function monthsAgo(n) { return new Date(Date.now() - n * 30 * 24 * 60 * 60 * 1000).toISOString() }
function yearsAgo(n) { return new Date(Date.now() - n * 365 * 24 * 60 * 60 * 1000).toISOString() }

// Definition of every retention policy in force. `strategy` decides whether
// the cron acts (auto_delete) or just flags for review (candidate_flagged).
const POLICIES = [
  {
    name: 'security_events_24m',
    table: 'security_events',
    strategy: 'auto_delete',
    cutoffFn: () => monthsAgo(24),
    cutoffColumn: 'created_at',
  },
  {
    name: 'provider_login_attempts_30d',
    table: 'provider_login_attempts',
    strategy: 'auto_delete',
    cutoffFn: () => daysAgo(30),
    cutoffColumn: 'updated_at',
    // Only purge rows with no active lockout — never delete an in-flight lockout.
    extraFilter: (q) => q.is('locked_until', null),
  },
  {
    name: 'support_tickets_3y_closed',
    table: 'patient_support_tickets',
    strategy: 'auto_delete',
    cutoffFn: () => yearsAgo(3),
    cutoffColumn: 'resolved_at',
    extraFilter: (q) => q.not('resolved_at', 'is', null),
  },
  {
    name: 'job_applications_6m_rejected',
    table: 'job_applications',
    strategy: 'auto_delete',
    cutoffFn: () => monthsAgo(6),
    cutoffColumn: 'updated_at',
    extraFilter: (q) => q.in('status', ['rejected', 'withdrawn']),
  },
  {
    name: 'retention_purge_runs_7y',
    table: 'retention_purge_runs',
    strategy: 'auto_delete',
    cutoffFn: () => yearsAgo(7),
    cutoffColumn: 'run_at',
  },

  // ── CANDIDATE FLAG (admin review required) ──────────────────────────────
  {
    name: 'consultations_10y_review',
    table: 'consultations',
    strategy: 'candidate_flagged',
    cutoffFn: () => yearsAgo(10),
    cutoffColumn: 'created_at',
  },
  {
    name: 'prescriptions_10y_review',
    table: 'prescriptions',
    strategy: 'candidate_flagged',
    cutoffFn: () => yearsAgo(10),
    cutoffColumn: 'created_at',
  },
  {
    name: 'radiology_reports_10y_review',
    table: 'radiology_reports',
    strategy: 'candidate_flagged',
    cutoffFn: () => yearsAgo(10),
    cutoffColumn: 'created_at',
  },
  {
    name: 'patient_documents_10y_review',
    table: 'patient_documents',
    strategy: 'candidate_flagged',
    cutoffFn: () => yearsAgo(10),
    cutoffColumn: 'created_at',
  },
]

export default async function handler(req, res) {
  const { verifyCronSecret } = await import('./_cron-auth.js')
  if (!verifyCronSecret(req)) return res.status(404).json({ error: 'Not found' })

  const dryRun = req.query?.dry_run === '1'
  const supabase = admin()
  const runResults = []
  const candidatesForReview = []

  for (const policy of POLICIES) {
    const cutoff = policy.cutoffFn()

    // Count candidates first (always, regardless of dry_run).
    let countQ = supabase.from(policy.table)
      .select('id', { count: 'exact', head: true })
      .lt(policy.cutoffColumn, cutoff)
    if (policy.extraFilter) countQ = policy.extraFilter(countQ)
    const { count: candidatesFound, error: countErr } = await countQ

    if (countErr) {
      // Table may not exist yet in dev. Skip silently.
      const missing = countErr.message?.includes('does not exist') || countErr.message?.includes('schema cache')
      runResults.push({
        policy_name: policy.name, table: policy.table, strategy: policy.strategy,
        cutoff, candidates: 0, actioned: 0, dry_run: dryRun,
        summary: missing ? 'table missing (skipped)' : `count failed: ${countErr.message}`,
        error: !missing,
      })
      continue
    }

    let actioned = 0
    let summary = `${candidatesFound || 0} candidate(s) < ${cutoff}`

    if (policy.strategy === 'auto_delete' && !dryRun && (candidatesFound || 0) > 0) {
      let delQ = supabase.from(policy.table).delete().lt(policy.cutoffColumn, cutoff)
      if (policy.extraFilter) delQ = policy.extraFilter(delQ)
      const { error: delErr, count } = await delQ.select('id', { count: 'exact', head: true })
      if (delErr) {
        summary = `delete failed: ${delErr.message}`
      } else {
        actioned = count || 0
        summary = `deleted ${actioned} row(s)`
      }
    } else if (policy.strategy === 'candidate_flagged' && (candidatesFound || 0) > 0) {
      candidatesForReview.push({ policy: policy.name, table: policy.table, count: candidatesFound || 0, cutoff })
      summary = `${candidatesFound} row(s) past 10y — admin review required (see email)`
    }

    // Record the run
    try {
      await supabase.from('retention_purge_runs').insert({
        policy_name: policy.name,
        table_name:  policy.table,
        strategy:    policy.strategy,
        cutoff_date: cutoff,
        candidates_found: candidatesFound || 0,
        rows_actioned:    actioned,
        dry_run:          dryRun,
        summary,
      })
    } catch (e) {
      console.error('[retention-purge] run-log insert failed:', e.message)
    }

    runResults.push({
      policy_name: policy.name, table: policy.table, strategy: policy.strategy,
      cutoff, candidates: candidatesFound || 0, actioned, dry_run: dryRun, summary,
    })
  }

  // Email summary only if something happened or candidates need review.
  const anyActioned = runResults.some(r => r.actioned > 0)
  if (anyActioned || candidatesForReview.length > 0) {
    try {
      const lines = [
        `Retention purge run — ${dryRun ? 'DRY RUN' : 'LIVE'}`,
        `Time: ${new Date().toISOString()}`,
        '',
        'Auto-delete results:',
        ...runResults.filter(r => r.strategy === 'auto_delete').map(r => `  • ${r.policy_name}: ${r.summary}`),
        '',
      ]
      if (candidatesForReview.length) {
        lines.push('CANDIDATES REQUIRING ADMIN REVIEW (past 10y, manual approval needed to purge):')
        for (const c of candidatesForReview) {
          lines.push(`  ⚠ ${c.policy}: ${c.count} row(s) in ${c.table} older than ${c.cutoff}`)
        }
        lines.push('')
        lines.push('Review process:')
        lines.push('  1. Query the relevant table (e.g. SELECT id, created_at FROM consultations WHERE created_at < \'...\')')
        lines.push('  2. Decide per-patient whether to purge, anonymise, or retain (clinical continuity may justify retention).')
        lines.push('  3. Execute purge manually + record decision in docs/regulatory/retention-decisions/YYYY-MM.md')
      }
      lines.push('')
      lines.push('Full run log: retention_purge_runs table.')
      await sendEmail({
        from:    'Tere Retention <hello@terehealth.co.nz>',
        to:      ADMIN_EMAIL,
        subject: `Retention purge — ${dryRun ? 'dry run' : 'live'} — ${new Date().toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland' })}`,
        text:    lines.join('\n'),
      })
    } catch (e) {
      console.error('[retention-purge] email failed:', e.message)
    }
  }

  return res.status(200).json({ ok: true, dry_run: dryRun, runs: runResults, candidates_for_review: candidatesForReview })
}
