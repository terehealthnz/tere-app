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
// supabase/2026-09-19_employer_slug_url_access.sql for the schema. ARC
// fields added 2026-11-05: org_type discriminator + named clinical/backup
// contacts (monthly report delivery) + billing contact (invoice delivery)
// + facility_pharmacy_id (default Rx routing to the contracted
// blister-pack dispensary).
const UPDATE_ALLOWLIST = new Set([
  'company_name', 'is_active', 'contact_name', 'contact_email', 'contact_phone',
  'notes', 'monthly_rate_per_employee', 'contract_start',
  'slug', 'usage_cap_month',
  'org_type',
  'billing_email', 'billing_contact_name',
  'clinical_contact_name', 'clinical_contact_email',
  'backup_contact_name', 'backup_contact_email',
  'delivery_status', 'delivery_status_detail',
  'facility_pharmacy_id',
])

const CREATE_ALLOWLIST = new Set([
  'company_name', 'is_active', 'contact_name', 'contact_email', 'contact_phone',
  'notes', 'monthly_rate_per_employee', 'contract_start',
  'slug', 'usage_cap_month',
  'org_type',
  'billing_email', 'billing_contact_name',
  'clinical_contact_name', 'clinical_contact_email',
  'backup_contact_name', 'backup_contact_email',
  'facility_pharmacy_id',
])

// Named-contact validation for ARC facilities. A silently-bounced monthly
// report is a report you think they got. Shared-inbox addresses (info@,
// admin@, accounts@) are the class that most often churn without anyone
// noticing. Reject at save time rather than letting the bounce fire later.
// Intentionally does NOT apply to employer-type rows — those often legitimately
// use shared inboxes and the billing model there doesn't rely on a delivered
// monthly report.
const GENERIC_MAILBOX_PREFIXES = new Set([
  'info', 'admin', 'accounts', 'enquiries', 'contact', 'hello', 'reception',
  'office', 'noreply', 'no-reply', 'support', 'helpdesk', 'billing',
  'mail', 'postmaster', 'sales', 'team',
])
function isGenericMailbox(email) {
  if (!email || typeof email !== 'string') return false
  const local = email.toLowerCase().trim().split('@')[0] || ''
  return GENERIC_MAILBOX_PREFIXES.has(local)
}
// Trivial email format gate — a full RFC parser is overkill; we just want
// to catch typos before they hit SES.
function looksLikeEmail(v) {
  return typeof v === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim())
}
// ARC facilities require: both clinical_contact_* and backup_contact_* set,
// both emails pass format, neither a generic mailbox, each has a named
// human in the *_contact_name field (first + last, or at least two tokens).
// Returns an error string if invalid, null if OK.
function validateArcContacts(payload) {
  const req = ['clinical_contact_name', 'clinical_contact_email', 'backup_contact_name', 'backup_contact_email']
  for (const k of req) {
    if (!payload[k] || !String(payload[k]).trim()) {
      return `${k.replace(/_/g, ' ')} required for aged residential care`
    }
  }
  for (const k of ['clinical_contact_email', 'backup_contact_email']) {
    if (!looksLikeEmail(payload[k])) return `${k.replace(/_/g, ' ')} is not a valid email`
    if (isGenericMailbox(payload[k])) return `${k.replace(/_/g, ' ')} must be a named person's address, not a shared inbox (info@, admin@, accounts@ etc.). Bounced monthly reports from shared inboxes are a privacy risk.`
  }
  for (const k of ['clinical_contact_name', 'backup_contact_name']) {
    const tokens = String(payload[k]).trim().split(/\s+/).filter(Boolean)
    if (tokens.length < 2) return `${k.replace(/_/g, ' ')} needs a full name (first + last)`
  }
  // Clinical and backup must be different humans — otherwise there's no backup.
  if (String(payload.clinical_contact_email).toLowerCase().trim()
      === String(payload.backup_contact_email).toLowerCase().trim()) {
    return 'Clinical contact and backup contact must be different people'
  }
  return null
}

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
    .replace(/\p{Diacritic}/gu, '')
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

    // Reads are admin-only. Employer rows carry B2B billing rates + contact
    // emails + contract dates; only admin surfaces render them. Closes
    // Blacklock WEB-0923-0547137329 (Broken Access Control).
    if (!auth.provider?.is_admin) {
      return res.status(403).json({ error: 'Admin role required to view employers' })
    }

    // action=usage → this-calendar-month consult count for this employer.
    // Used by admin billing report + client-side cap enforcement preview.
    if (id && action === 'usage') {
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

    // ARC validation. If this is an aged_care facility, named contacts are
    // mandatory and must not be shared mailboxes (see validateArcContacts).
    if (payload.org_type === 'aged_care') {
      const err = validateArcContacts(payload)
      if (err) return res.status(400).json({ error: err })
    }

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
    // ARC validation on PATCH. We re-validate when any ARC-contact column
    // is touched OR when org_type is being changed to aged_care. Fetch the
    // current row first to fill in the untouched contact fields so the
    // validator sees the merged state, not just the partial patch.
    const arcContactFields = ['clinical_contact_name','clinical_contact_email','backup_contact_name','backup_contact_email','org_type']
    const touchingArc = arcContactFields.some(k => k in patch)
    if (touchingArc) {
      const { data: current } = await supabase.from('employers').select('org_type, clinical_contact_name, clinical_contact_email, backup_contact_name, backup_contact_email').eq('id', id).maybeSingle()
      const merged = { ...(current || {}), ...patch }
      if (merged.org_type === 'aged_care') {
        const err = validateArcContacts(merged)
        if (err) return res.status(400).json({ error: err })
      }
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
