// GET /api/gp-directory?q=<query>&region=<region>
//   → { practices: [...], providers: [{ id, title, given_name, family_name,
//                                       practice: { id, name, email, phone, address } }] }
//
// Autocomplete feed for the continuity-of-care GP picker in ProviderNotes.
// The provider types a name (e.g. "bongaerts") — this returns matching
// providers with their practice's contact info so a single click fills
// name / practice / email on the continuity block.
//
// Anon-safe: contents are public PHO information, no PHI. Uses the service
// role client because anon SELECT is granted on both tables directly (see
// 2026-09-16_gp_directory.sql), but keeping the pattern consistent with
// other read endpoints so if we later scope by tenant it's a one-line change.

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

  const q = String(req.query.q || '').trim().toLowerCase()
  const region = String(req.query.region || '').trim().toLowerCase() || null
  const supabase = admin()

  // Practices lookup — always returned so the picker can show a "browse
  // by practice" fallback when no query text is entered.
  let practicesQuery = supabase
    .from('gp_practices')
    .select('id, name, address, phone, email, region')
    .eq('active', true)
    .order('name', { ascending: true })
    .limit(200)
  if (region) practicesQuery = practicesQuery.eq('region', region)
  const { data: practices, error: pErr } = await practicesQuery
  if (pErr) return res.status(500).json({ error: pErr.message })

  // Providers lookup — only run when there's a query; typing 2+ chars is
  // enough to disambiguate most rural GP surnames. Case-insensitive prefix
  // match on either given or family name.
  let providers = []
  if (q.length >= 2) {
    // We need practice info for each provider hit. Join via nested select.
    let provQuery = supabase
      .from('gp_providers')
      .select('id, title, given_name, family_name, practice_id, gp_practices!inner(id, name, email, phone, address, region)')
      .eq('active', true)
      .or(`given_name.ilike.${q}%,family_name.ilike.${q}%`)
      .order('family_name', { ascending: true })
      .limit(30)
    // Region filter applies to the joined practice.
    if (region) provQuery = provQuery.eq('gp_practices.region', region)
    const { data, error } = await provQuery
    if (error) return res.status(500).json({ error: error.message })
    providers = (data || []).map(row => ({
      id:          row.id,
      title:       row.title,
      given_name:  row.given_name,
      family_name: row.family_name,
      practice: row.gp_practices
        ? {
            id:      row.gp_practices.id,
            name:    row.gp_practices.name,
            email:   row.gp_practices.email,
            phone:   row.gp_practices.phone,
            address: row.gp_practices.address,
          }
        : null,
    }))
  }

  // Cache for 1h — practice/provider data changes on the order of weeks.
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  res.json({ practices: practices || [], providers })
}
