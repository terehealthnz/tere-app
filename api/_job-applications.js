// /api/job-applications — careers pipeline.
//
// POST                          → anon submit (public apply form). Sender fills in
//                                 first/last/email/phone/cover_note/cv_url/cv_filename
//                                 optionally with job_listing_id + source. Status always
//                                 starts at 'new' regardless of client input.
// GET                           → provider-auth list (?status= to filter, ?archived=1)
// GET  ?id=<uuid>               → provider-auth single applicant + notes + onboarding
// PATCH ?id=<uuid>              → provider-auth status/archive transitions.
//                                 If status flips to 'hired' AND no onboarding rows
//                                 exist yet, seed the default onboarding checklist.
// DELETE ?id=<uuid>             → provider-auth hard delete (rare; prefer archive)
//
// POST ?action=note  { note }   → provider-auth append internal note
// PATCH ?action=step&id=<step>  → provider-auth toggle onboarding step done

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const APPLY_ALLOWLIST = new Set([
  'first_name', 'last_name', 'email', 'phone', 'cover_note',
  'cv_url', 'cv_filename', 'job_listing_id', 'source',
])

const STATUS_ALLOWED = new Set([
  'new', 'reviewing', 'interview', 'offer', 'hired', 'rejected', 'withdrawn',
])

const DEFAULT_ONBOARDING = [
  { step_key: 'mcnz_apc',         label: 'MCNZ registration + current APC verified' },
  { step_key: 'references',       label: 'References checked' },
  { step_key: 'contract_signed',  label: 'Contract signed' },
  { step_key: 'provider_row',     label: 'Provider row created in DB (with PIN)' },
  { step_key: 'prescriber_no',    label: 'Prescriber number + CPN entered' },
  { step_key: 'bank_payroll',     label: 'Bank / payroll details on file' },
  { step_key: 'tech_setup',       label: 'LiveKit + push notification tested on device' },
  { step_key: 'shadow_shift',     label: 'Shadow shift with existing provider' },
  { step_key: 'first_shift',      label: 'First live shift scheduled' },
  { step_key: 'welcome_pack',     label: 'Welcome email sent (culture doc, key contacts)' },
]

async function seedOnboardingIfNeeded(supabase, applicationId) {
  const { count } = await supabase.from('onboarding_steps')
    .select('id', { count: 'exact', head: true })
    .eq('application_id', applicationId)
  if (count && count > 0) return
  const rows = DEFAULT_ONBOARDING.map((s, i) => ({
    application_id: applicationId, step_key: s.step_key, label: s.label, sort_order: i,
  }))
  await supabase.from('onboarding_steps').insert(rows)
}

export default async function handler(req, res) {
  const { action, id } = req.query || {}

  // Anon submit path.
  if (req.method === 'POST' && !action) {
    const supabase = admin()
    const raw = req.body || {}
    const payload = {}
    for (const [k, v] of Object.entries(raw)) {
      if (APPLY_ALLOWLIST.has(k)) payload[k] = v
    }
    if (!payload.first_name || !payload.last_name || !payload.email) {
      return res.status(400).json({ error: 'first_name, last_name, email required' })
    }
    // Status is always 'new' regardless of client claim.
    payload.status = 'new'
    const { data, error } = await supabase
      .from('job_applications')
      .insert(payload)
      .select('id')
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true, id: data?.id })
  }

  // Everything below requires provider auth.
  const auth = await guardProvider(req, res)
  if (!auth) return
  const supabase = admin()

  if (req.method === 'GET') {
    if (id) {
      const [{ data: app, error: appErr }, { data: notes }, { data: steps }] = await Promise.all([
        supabase.from('job_applications').select('*, job_listing:job_listings(id, title, location)').eq('id', id).maybeSingle(),
        supabase.from('application_notes').select('*').eq('application_id', id).order('created_at', { ascending: false }),
        supabase.from('onboarding_steps').select('*').eq('application_id', id).order('sort_order'),
      ])
      if (appErr) return res.status(500).json({ error: appErr.message })
      if (!app) return res.status(404).json({ error: 'Application not found' })
      return res.status(200).json({ application: app, notes: notes || [], onboarding: steps || [] })
    }

    const { status, archived } = req.query || {}
    let q = supabase
      .from('job_applications')
      .select('id, first_name, last_name, email, phone, status, source, applied_at, updated_at, hired_at, archived, cv_url, cv_filename, job_listing_id, job_listing:job_listings(id, title)')
      .order('applied_at', { ascending: false })
    if (archived === '1') q = q.eq('archived', true)
    else q = q.eq('archived', false)
    if (status) {
      if (!STATUS_ALLOWED.has(status)) return res.status(400).json({ error: 'invalid status filter' })
      q = q.eq('status', status)
    }
    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ applications: data || [] })
  }

  // Note append.
  if (req.method === 'POST' && action === 'note') {
    if (!id) return res.status(400).json({ error: 'id required' })
    const { note } = req.body || {}
    if (!note || typeof note !== 'string' || !note.trim()) {
      return res.status(400).json({ error: 'note (string) required' })
    }
    const provider = auth.provider || {}
    const author_name = [provider.first_name, provider.last_name].filter(Boolean).join(' ') || null
    const { error } = await supabase.from('application_notes').insert({
      application_id: id,
      author_id: provider.id || null,
      author_name,
      note: note.trim(),
    })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  // Onboarding step toggle.
  if (req.method === 'PATCH' && action === 'step') {
    if (!id) return res.status(400).json({ error: 'id (step id) required' })
    const { done, notes } = req.body || {}
    const provider = auth.provider || {}
    const patch = {}
    if (typeof done === 'boolean') {
      patch.done = done
      patch.done_at = done ? new Date().toISOString() : null
      patch.done_by = done ? (provider.id || null) : null
      patch.done_by_name = done
        ? ([provider.first_name, provider.last_name].filter(Boolean).join(' ') || null)
        : null
    }
    if (notes !== undefined) patch.notes = notes || null
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'nothing to update' })
    const { error } = await supabase.from('onboarding_steps').update(patch).eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  // Application patch (status transition, archive).
  if (req.method === 'PATCH') {
    if (!id) return res.status(400).json({ error: 'id required' })
    const raw = req.body || {}
    const patch = {}
    if ('status' in raw) {
      if (!STATUS_ALLOWED.has(raw.status)) {
        return res.status(400).json({ error: `status "${raw.status}" not allowed` })
      }
      patch.status = raw.status
      if (raw.status === 'hired')    patch.hired_at    = new Date().toISOString()
      if (raw.status === 'rejected') patch.rejected_at = new Date().toISOString()
    }
    if ('archived' in raw) patch.archived = !!raw.archived
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'nothing to update' })
    patch.updated_at = new Date().toISOString()

    const { error } = await supabase.from('job_applications').update(patch).eq('id', id)
    if (error) return res.status(500).json({ error: error.message })

    if (patch.status === 'hired') {
      await seedOnboardingIfNeeded(supabase, id)
    }
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'id required' })
    const { error } = await supabase.from('job_applications').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
