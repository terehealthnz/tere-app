// GET /api/employer-lookup?slug=xxx
//
// Anon endpoint used by /work/[slug] to validate a URL-access employer slug
// before starting the triage flow. Returns only the minimal metadata needed
// to render the landing page ("Welcome, [company]") and stash the
// employer_id for the subsequent consult-creation call.
//
// This endpoint deliberately does NOT return the monthly_rate_per_employee,
// contact info, notes, or usage cap — nothing that would leak commercial
// terms to a stranger who happens to have (or guess) a slug. Only
// company_name + employer_id + a boolean "under cap this month" flag.
//
// The employer_id returned here is still re-verified server-side inside
// /api/create-consultation before employer_paid is set (task #71 hardening
// stays in effect), so a leaked employer_id can't be spoofed on its own.
//
// Slug format is validated up front against the same regex the DB CHECK
// constraint enforces, so garbage input (`../../etc/passwd`, XSS, etc.)
// gets a clean 400 without hitting the DB.

import { createClient } from '@supabase/supabase-js'

const SLUG_RE = /^[a-z0-9]{8,32}$/

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Slug comes from ?slug=… on GET, and from body on POST (roster check).
  const slugRaw = req.method === 'POST'
    ? (req.body?.slug ?? '')
    : (req.query?.slug ?? '')
  const slug = String(slugRaw || '').trim().toLowerCase()
  if (!SLUG_RE.test(slug)) {
    return res.status(400).json({ error: 'Invalid slug format' })
  }

  const supabase = admin()
  const { data, error } = await supabase
    .from('employers')
    .select('id, company_name, is_active, usage_cap_month, require_employee_match')
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    console.error('[employer-lookup] failed:', error)
    return res.status(500).json({ error: 'Server error' })
  }
  if (!data || !data.is_active) {
    // Uniform 404 for both "no match" and "inactive" so a probe can't
    // distinguish "slug exists but disabled" from "slug never existed".
    return res.status(404).json({ error: 'Not found' })
  }

  // If a monthly cap is set, block once we've hit it. Prevents a leaked
  // slug from being exploited beyond the agreed-with-employer usage.
  let under_cap = true
  if (data.usage_cap_month) {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const { count } = await supabase
      .from('consultations')
      .select('id', { count: 'exact', head: true })
      .eq('employer_id', data.id)
      .gte('created_at', monthStart)
    under_cap = (count || 0) < data.usage_cap_month
  }

  if (!under_cap) {
    return res.status(429).json({
      error: 'This employer plan has reached its monthly consultation cap. Please contact your employer.',
      code: 'MONTHLY_CAP_REACHED',
    })
  }

  // POST branch: roster pre-check for /work/[slug]/intake. Client hits this
  // with { slug, firstName, lastName, dob } before creating a consult. If the
  // patient isn't on the roster we short-circuit here with 404 and no
  // consultations row is ever created — cleaner than waiting for
  // /api/create-consultation to fail. The server-side check in
  // _create-consultation.js still runs (defence in depth), so this endpoint
  // is a UX gate, not the security boundary.
  //
  // Scope: query is anchored on the slug's employer_id (verified above), so
  // an attacker can't enumerate against the full employer_employees table.
  // The worst you can do is confirm whether a specific name+DOB is on a
  // specific employer's roster — which requires already knowing the slug.
  if (req.method === 'POST') {
    const firstName = String(req.body?.firstName || '').trim()
    const lastName  = String(req.body?.lastName  || '').trim()
    const dob       = String(req.body?.dob       || '').slice(0, 10)
    if (!firstName || !lastName || !dob) {
      return res.status(400).json({ error: 'firstName, lastName, dob required' })
    }
    const { data: rosterRow, error: rosterErr } = await supabase
      .from('employer_employees')
      .select('id')
      .eq('employer_id', String(data.id))
      .ilike('first_name', firstName)
      .ilike('last_name',  lastName)
      .eq('dob', dob)
      .maybeSingle()
    if (rosterErr) {
      console.error('[employer-lookup] roster check failed:', rosterErr)
      return res.status(500).json({ error: 'Server error' })
    }
    if (!rosterRow) {
      return res.status(200).json({ matched: false })
    }
    return res.status(200).json({
      matched: true,
      employer: {
        id: data.id,
        company_name: data.company_name,
        require_employee_match: !!data.require_employee_match,
      },
    })
  }

  return res.status(200).json({
    employer: {
      id: data.id,
      company_name: data.company_name,
      require_employee_match: !!data.require_employee_match,
    },
  })
}
