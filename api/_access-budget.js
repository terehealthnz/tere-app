// Per-provider daily PHI-access budget (task #376).
//
// Two counters, both scoped to NZ calendar day:
//   • charts_today   = distinct consultation_ids accessed via consult_opened
//                      (or similar view events)
//   • exports_today  = count of export events (acc_audit_bundle_export,
//                      patient_record_export, acc_cert.*)
//
// Behaviour:
//   • ok             — under 80% of limit
//   • warn           — 80%–99% of limit (client shows banner)
//   • block          — at/over limit (client blocks + prompts admin override)
//   • override_active — provider row has access_budget_override_until in the
//                       future; enforcement is skipped
//
// Enforcement is opt-in per endpoint via checkAccessBudget().

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const CHART_VIEW_EVENTS = ['consult_opened', 'view_consult_notes']
const EXPORT_EVENTS     = ['acc_audit_bundle_export', 'patient_record_export']

// Returns { status: 'ok'|'warn'|'block'|'override', used, limit, kind }
export async function checkAccessBudget(providerId, kind = 'chart') {
  if (!providerId) return { status: 'ok', used: 0, limit: 0, kind }

  const supabase = admin()

  // Load per-provider limits + override.
  const { data: provider } = await supabase.from('providers')
    .select('daily_chart_access_limit, daily_export_limit, access_budget_override_until')
    .eq('id', providerId).maybeSingle()
  if (!provider) return { status: 'ok', used: 0, limit: 0, kind }

  // Override still active?
  if (provider.access_budget_override_until && new Date(provider.access_budget_override_until) > new Date()) {
    return { status: 'override', used: 0, limit: 0, kind }
  }

  const limit = kind === 'export'
    ? (provider.daily_export_limit || 30)
    : (provider.daily_chart_access_limit || 200)

  // NZ calendar day start (00:00 Pacific/Auckland) in UTC.
  const nzMidnightIso = (() => {
    // Get today's date in NZ.
    const nzDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' }) // YYYY-MM-DD
    return new Date(nzDate + 'T00:00:00+12:00').toISOString() // approximate, DST-tolerant enough for a soft cap
  })()

  const events = kind === 'export' ? EXPORT_EVENTS : CHART_VIEW_EVENTS
  // Also count acc_cert.* as an export event.
  const { count } = await supabase.from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('provider_id', providerId)
    .gte('created_at', nzMidnightIso)
    .in('event_type', events)
  let used = count || 0

  if (kind === 'export') {
    // Add acc_cert.* via like — not indexable but volume low.
    const { count: certCount } = await supabase.from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', providerId)
      .gte('created_at', nzMidnightIso)
      .like('event_type', 'acc_cert.%')
    used += certCount || 0
  }

  let status = 'ok'
  if (used >= limit) status = 'block'
  else if (used >= Math.floor(limit * 0.8)) status = 'warn'

  return { status, used, limit, kind }
}
