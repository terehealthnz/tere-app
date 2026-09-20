// GET/POST/PATCH /api/employers — admin-managed employer directory.
// Locks down the fraud vector where anon INSERT into `employers` let anyone
// create their own is_active=true row and then claim employer_paid at consult
// creation. See task #71 / commit e4365b5 for the create-consultation-side
// verifier this partners with.
//
// GET   /api/employers                → active employers, alpha-ordered
// GET   /api/employers?includeInactive=1  → all, inactive included
// GET   /api/employers?id=<uuid>&action=usage → this-month consult count for
//                                             billing (admin only)
// POST  /api/employers                → admin creates an employer; if the body
//                                       includes generateSlug=true, a random
//                                       12-char slug is generated for the
//                                       /work/[slug] URL access flow
// PATCH /api/employers?id=<uuid>      → admin updates is_active / details;
//                                       supports slug + usage_cap_month for
//                                       the URL access flow

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Columns admin can PATCH on an employer row. `slug` and `usage_cap_month`
// were added 2026-09-19 to support the /work/[slug] URL access flow. See
// supabase/2026-09-19_employer_slug_url_access.sql for the schema.
const UPDATE_ALLOWLIST = new Set([
  'company_name', 'is_active', 'contact_name', 'contact_email', 'contact_phone',
  'notes', 'monthly_rate_per_employee', 'contract_start',
  'slug', 'usage_cap_month',
])

const CREATE_ALLOWLIST = new Set([
  'company_name', 'is_active', 'contact_name', 'contact_email', 'contact_phone',
  'notes', 'monthly_rate_per_employee', 'contract_start',
  'slug', 'usage_cap_month',
])

// Slugify a company name for /work/[slug] URL access. Companies pay for the
// branded URL (/work/cloudybay, /work/thornhill) so the slug is derived from
// company_name, not random. Security is enforced by the roster match on
// name+DOB in _create-consultation.js, so a guessable slug alone doesn't
// grant employer_paid. Must satisfy the CHECK constraint on employers.slug
// (^[a-z0-9]{8,32}$) — pad short names, truncate long ones, suffix on
// collision.
function slugifyName(name) {
  const s = String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 32)
  return s
}

async function generateUniqueSlug(supabase, companyName) {
  const base = slugifyName(companyName)
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const randChar = () => alphabet[Math.floor(Math.random() * alphabet.length)]
  const pad = (s, len) => {
    let out = s
    while (out.length < len) out += randChar()
    return out
  }
  const candidates = []
  if (base.length >= 8) candidates.push(base.slice(0, 32))
  else if (base.length > 0) candidates.push(pad(base, 8))
  for (let attempt = 0; attempt < 6; attempt++) {
    if (candidates.length === 0 || attempt > 0) {
      const suffix = pad('', 4)
      const stub = base ? base.slice(0, 28) : ''
      candidates.push((stub + suffix).slice(0, 32).padEnd(8, randChar()))
    }
    const slug = candidates[candidates.length - 1]
    const { data } = await supabase.from('employers').select('id').eq('slug', slug).maybeSingle()
    if (!data) return slug
  }
  throw new Error('Could not generate unique slug after 6 attempts')
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return

  const supabase = admin()

  if (req.method === 'GET') {
    const { id, action, includeInactive } = req.query || {}

    // action=usage → this-calendar-month consult count for this employer.
    // Used by admin billing report + client-side cap enforcement preview.
    if (id && action === 'usage') {
      if (!auth.provider?.is_admin) {
        return res.status(403).json({ error: 'Admin role required for usage report' })
      }
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const { count, error } = await supabase
        .from('consultations')
        .select('id', { count: 'exact', head: true })
        .eq('employer_id', String(id))
        .gte('created_at', monthStart)
      if (error) { console.error('[employers] usage failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ employer_id: id, consults_this_month: count || 0, month_start: monthStart })
    }

    let q = supabase.from('employers').select('*').order('company_name')
    if (includeInactive !== '1') q = q.eq('is_active', true)
    const { data, error } = await q
    if (error) { console.error('[employers] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ employers: data || [] })
  }

  // Writes require admin role — this table drives whether a patient gets a
  // free consult, so mutations are more sensitive than provider clinical work.
  if (!auth.provider?.is_admin) {
    return res.status(403).json({ error: 'Admin role required to manage employers' })
  }

  if (req.method === 'POST') {
    const raw = req.body || {}
    if (!raw.company_name?.trim()) return res.status(400).json({ error: 'company_name required' })
    const payload = {}
    for (const [k, v] of Object.entries(raw)) {
      if (CREATE_ALLOWLIST.has(k)) payload[k] = v
    }
    payload.is_active = payload.is_active !== false  // default true

    // generateSlug: opt-in slug generation for the /work/[slug] URL access
    // flow. Admin passes generateSlug=true on create if this employer should
    // support URL access (as opposed to the legacy email-allowlist flow).
    // Client-supplied slug is ignored when generateSlug=true.
    if (raw.generateSlug === true) {
      try {
        payload.slug = await generateUniqueSlug(supabase, payload.company_name)
      } catch (e) {
        console.error('[employers] slug generation failed:', e)
        return res.status(500).json({ error: 'Could not generate slug, try again' })
      }
    }

    const { data, error } = await supabase.from('employers').insert(payload).select().single()
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'A conflict occurred (likely duplicate slug or name)' })
      if (error.code === '23514') return res.status(400).json({ error: 'Slug must be 8-32 lowercase alphanumeric characters' })
      console.error('[employers] error failed:', error)
      return res.status(500).json({ error: 'Server error' })
    }
    return res.status(200).json({ employer: data })
  }

  if (req.method === 'PATCH') {
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id query param required' })
    const raw = req.body || {}
    const patch = {}
    for (const [k, v] of Object.entries(raw)) {
      if (UPDATE_ALLOWLIST.has(k)) patch[k] = v
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No allowed columns in patch' })
    }
    patch.updated_at = new Date().toISOString()
    const { data, error } = await supabase.from('employers').update(patch).eq('id', id).select().maybeSingle()
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Slug already in use by another employer' })
      if (error.code === '23514') return res.status(400).json({ error: 'Slug must be 8-32 lowercase alphanumeric characters' })
      console.error('[employers] error failed:', error)
      return res.status(500).json({ error: 'Server error' })
    }
    return res.status(200).json({ employer: data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
