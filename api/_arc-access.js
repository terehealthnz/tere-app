// POST /api/arc-access
//
// Password gate for the /arc/[slug] facility-nurse flow. Validates the
// shared password against employers.access_password_hash (bcrypt) and
// returns the employer metadata needed to boot the intake form.
//
// Request:  { slug, password }
// Response: 200 { ok, employer: { id, company_name, org_type } } on success
//           401 { error } on bad password
//           404 { error } on bad slug
//           429 { error } on repeated failures from the same IP
//
// Rate limit: 5 failures per IP per 15 min. Shared-password + public URL
// = brute-force risk; this caps it without punishing legitimate nurses
// who mistype. Successes don't count against the limit.
//
// Known v1 gap: this endpoint doesn't mint a server-signed token. The
// client stashes the employer metadata in sessionStorage and the next
// create-consultation call trusts that stash. v2 will issue a signed
// token here that /api/create-consultation validates before allowing
// an aged_care employer_id. Audit-log + invoice reconciliation are the
// v1 defence.

import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { getClientIp } from './_client-ip.js'

const SLUG_RE = /^[a-z0-9]{8,32}$/
// In-memory IP failure counter. Per-Vercel-instance; adequate for a
// shared-password brute force because any attacker gets rotated across
// instances and still trips the cap in aggregate via the audit log.
const failures = new Map()
const FAIL_WINDOW_MS = 15 * 60 * 1000
const FAIL_MAX       = 5

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function recordFailure(ip) {
  const now = Date.now()
  const prior = failures.get(ip) || []
  const recent = prior.filter(t => now - t < FAIL_WINDOW_MS)
  recent.push(now)
  failures.set(ip, recent)
  return recent.length
}

function isBlocked(ip) {
  const now = Date.now()
  const prior = failures.get(ip) || []
  const recent = prior.filter(t => now - t < FAIL_WINDOW_MS)
  if (recent.length !== prior.length) failures.set(ip, recent)
  return recent.length >= FAIL_MAX
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const ip = getClientIp(req) || 'unknown'
  if (isBlocked(ip)) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' })
  }

  const { slug: slugRaw, password } = req.body || {}
  const slug = String(slugRaw || '').trim().toLowerCase()
  if (!SLUG_RE.test(slug)) return res.status(400).json({ error: 'Invalid slug' })
  if (!password || typeof password !== 'string') return res.status(400).json({ error: 'Password required' })

  const supabase = admin()
  const { data: employer, error } = await supabase
    .from('employers')
    .select('id, company_name, org_type, is_active, access_password_hash')
    .eq('slug', slug)
    .maybeSingle()
  if (error) { console.error('[arc-access] lookup failed:', error); return res.status(500).json({ error: 'Server error' }) }
  if (!employer || !employer.is_active) {
    // Uniform 404 for bad slug and for inactive — don't leak existence.
    return res.status(404).json({ error: 'Not found' })
  }
  if (employer.org_type !== 'aged_care') {
    // Non-aged-care employers use the slug-only /work flow, not /arc.
    return res.status(404).json({ error: 'Not found' })
  }
  if (!employer.access_password_hash) {
    console.error('[arc-access] aged_care employer has no password hash:', slug)
    return res.status(500).json({ error: 'Facility not configured for password access' })
  }

  // Case-insensitive password check. We store the bcrypt hash of the
  // lowercased password and lowercase the input before comparing, so
  // "Enliven", "enliven", "ENLIVEN" all work. Reasoning: nurses using
  // the tablet at a shift change don't need to remember capitalisation,
  // and the shared-password model is already low-security (see MOU).
  const ok = bcrypt.compareSync(String(password).toLowerCase(), employer.access_password_hash)
  if (!ok) {
    const count = recordFailure(ip)
    console.warn(`[arc-access] password failed for slug=${slug} ip=${ip} (${count}/${FAIL_MAX})`)
    return res.status(401).json({ error: 'Incorrect password' })
  }

  // Audit-log the successful access so Patrick can reconcile against invoices.
  try {
    await supabase.from('audit_logs').insert({
      event_type:      'arc_facility_access',
      metadata:        { slug, employer_id: employer.id, company_name: employer.company_name },
      ip,
    })
  } catch (e) {
    // Non-blocking.
    console.warn('[arc-access] audit insert failed:', e?.message || e)
  }

  return res.status(200).json({
    ok: true,
    employer: {
      id: employer.id,
      company_name: employer.company_name,
      org_type: employer.org_type,
      slug,
    },
  })
}
