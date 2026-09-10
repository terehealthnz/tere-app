// Daily sweep of orphaned pre_triage consultation stubs.
//
// Why:
//   TereIntro creates a `status='pre_triage'` row the moment a patient
//   clicks "Get started" so we can measure drop-off between landing and
//   first triage question. The AITriage flow deletes this stub on
//   successful handleConfirm (see src/components/patient/AITriage.jsx
//   ~line 1015). But patients who close the tab / navigate away / hit
//   a validation error before completing the form leave the stub
//   behind. Over time these accumulate — they're harmless (no PHI, no
//   payment), just noise in analytics and a growing table.
//
// What counts as an orphan:
//   - status = 'pre_triage'
//   - created_at older than 24h (generous — allows a patient to walk
//     away for lunch and come back)
//
// Deliberately narrow: we ONLY delete pre_triage. Any row that made it
// to 'triage', 'waiting', or beyond has real patient input and stays.
//
// Runs daily at 04:15 UTC (16:15 NZT, low-traffic window).

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end()

  const supabase = admin()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: stale, error: selErr } = await supabase
    .from('consultations')
    .select('id')
    .eq('status', 'pre_triage')
    .lt('created_at', cutoff)
    .limit(1000)  // hard cap; if we ever exceed this, something else is wrong

  if (selErr) {
    console.error('[cron-pretriage-cleanup] select failed:', selErr.message)
    return res.status(500).json({ error: 'select failed' })
  }

  if (!stale || stale.length === 0) {
    return res.status(200).json({ ok: true, deleted: 0 })
  }

  const ids = stale.map(r => r.id)
  const { error: delErr } = await supabase
    .from('consultations')
    .delete()
    .in('id', ids)
    .eq('status', 'pre_triage')  // belt-and-braces — DELETE ... WHERE narrows

  if (delErr) {
    console.error('[cron-pretriage-cleanup] delete failed:', delErr.message)
    return res.status(500).json({ error: 'delete failed', selected: ids.length })
  }

  console.log(`[cron-pretriage-cleanup] deleted ${ids.length} pre_triage stubs older than ${cutoff}`)
  return res.status(200).json({ ok: true, deleted: ids.length, cutoff })
}
