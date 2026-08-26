// GET /api/pharmacy-contacts?ids=1
//   → { ids: ['unichem-…', 'life-…', …] }
// Returns the set of pharmacy_ids that currently have a dispensary_email in
// the pharmacy_contacts table. Anon-facing (patient triage uses it before
// login). All 3 pharmacy pickers (patient triage, waiting-room change,
// provider prescribe/redirect) filter pharmacies.json against this list so
// only emailable pharmacies are ever offered — fax was decommissioned
// 2026-08-01, and we don't want to route scripts to pharmacies we can't
// actually deliver to.
//
// Response is cached ~5 min server-side via CDN header; the underlying table
// changes slowly (crowdsource upserts on each new script delivery).

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const supabase = admin()

  // Single-pharmacy lookup mode: ?id=<pharmacy_id> → { dispensary_email, phone, hpi_id }
  // Replaces the browser-side `.from('pharmacy_contacts').select().eq('pharmacy_id',…)`
  // that stopped working after 2026-08-09_rls_lockdown.sql revoked anon SELECT
  // on this table. Symptom was 'No dispensary email on file' for pharmacies
  // that had been seeded (e.g. Chemist Warehouse Springlands via cw-seed).
  // Dispensary email/phone are business contact data (findable on Healthpoint)
  // — not PHI — so it's safe to expose to any authenticated provider without
  // finer-grained auth.
  const singleId = String(req.query?.id || '').trim()
  if (singleId) {
    const { data, error } = await supabase
      .from('pharmacy_contacts')
      .select('pharmacy_id, dispensary_email, phone, hpi_id')
      .eq('pharmacy_id', singleId)
      .maybeSingle()
    if (error) { console.error('[pharmacy-contacts] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600')
    return res.status(200).json({ contact: data || null })
  }

  // Default: emailable-set mode (list of pharmacy_ids with a dispensary_email).
  // Supabase default row cap is 1000; we've already seeded ~1050 emailable
  // pharmacies so raise the limit or the picker silently hides ~5% of stores.
  const { data, error } = await supabase
    .from('pharmacy_contacts')
    .select('pharmacy_id')
    .not('dispensary_email', 'is', null)
    .limit(5000)
  if (error) { console.error('[pharmacy-contacts] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
  const ids = (data || []).map(r => r.pharmacy_id).filter(Boolean)
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600')
  return res.status(200).json({ ids })
}
