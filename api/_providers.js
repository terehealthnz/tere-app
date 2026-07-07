// GET/POST/PATCH /api/providers — provider-side reads and admin updates on
// the providers table. Runs with service_role, requires an authenticated
// provider (guardProvider). Login flow uses the separate /api/provider-auth
// endpoint — this one is for staff-facing management.
//
// GET   /api/providers                        → active providers, ordered by first_name
// GET   /api/providers?filter=active-full     → wider column projection
// GET   /api/providers?id=<uuid>&columns=…    → single row, optional column projection
// POST  /api/providers                        → admin-only create new provider + hash PIN
// PATCH /api/providers?id=<uuid>              → admin-only update, column allowlist

import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Columns admin can PATCH on a provider row. Deliberately excluded: id, email
// (identity — change via a dedicated flow), pin_hash / password columns
// (change via /api/change-password), created_at.
const UPDATE_ALLOWLIST = new Set([
  'first_name', 'last_name', 'credential', 'specialty', 'color',
  'is_active', 'is_admin', 'is_provider', 'is_supervisor', 'is_available',
  'availability_message',
  'can_prescribe', 'can_refer', 'can_acc',
  'prescriber_number', 'cpn', 'hpi_number', 'acc_provider_number',
  'signature_url',
  'base_rate', 'hourly_rate', 'holiday_pay_pct',
  'bank_account', 'ird_number', 'tax_code', 'contract_type', 'contract_signed_at',
])

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return

  const supabase = admin()

  if (req.method === 'GET') {
    const { id, filter, columns } = req.query || {}

    if (id) {
      const cols = columns
        ? String(columns).split(',').map(c => c.trim()).filter(Boolean).join(', ')
        : '*'
      const { data, error } = await supabase.from('providers').select(cols).eq('id', id).maybeSingle()
      if (error) return res.status(500).json({ error: error.message })
      if (!data)  return res.status(404).json({ error: 'Provider not found' })
      return res.status(200).json({ provider: data })
    }

    if (filter === 'active-full') {
      const { data, error } = await supabase
        .from('providers')
        .select('id, first_name, last_name, credential, specialty, color, is_active, is_available, is_provider, is_admin, is_supervisor, can_prescribe, can_refer, can_acc, prescriber_number, cpn, availability_message')
        .eq('is_active', true)
        .order('first_name')
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ providers: data || [] })
    }

    // Default: modest projection, only active + is_provider rows.
    const { data, error } = await supabase
      .from('providers')
      .select('id, first_name, last_name, credential, specialty, color, is_active, is_admin, is_provider, is_available, availability_message')
      .order('first_name')
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ providers: data || [] })
  }

  if (req.method === 'POST') {
    if (!auth.provider?.is_admin) {
      return res.status(403).json({ error: 'Admin role required to create providers' })
    }
    const raw = req.body || {}

    // Required identity fields
    const first_name = String(raw.first_name || '').trim()
    const last_name  = String(raw.last_name  || '').trim()
    const email      = String(raw.email      || '').trim().toLowerCase()
    if (!first_name || !last_name || !email) {
      return res.status(400).json({ error: 'first_name, last_name, email are required' })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'email format invalid' })
    }

    // Email uniqueness — check case-insensitively
    const { data: dupe } = await supabase
      .from('providers').select('id').ilike('email', email).maybeSingle()
    if (dupe) return res.status(409).json({ error: `A provider with email ${email} already exists` })

    // PIN — 4-8 digits. Auto-generate a 6-digit PIN if not supplied.
    const rawPin = raw.pin != null ? String(raw.pin) : ''
    const pin = rawPin.trim()
    let finalPin = pin
    if (!finalPin) {
      finalPin = String(Math.floor(100000 + Math.random() * 900000))
    }
    if (!/^\d{4,8}$/.test(finalPin)) {
      return res.status(400).json({ error: 'PIN must be 4–8 digits' })
    }
    const pin_hash = await bcrypt.hash(finalPin, 10)

    // Build row using column allowlist. is_provider defaults true; is_active true.
    const CREATE_ALLOWLIST = new Set([
      'first_name', 'last_name', 'email', 'credential', 'specialty', 'color',
      'is_active', 'is_admin', 'is_provider', 'is_supervisor',
      'can_prescribe', 'can_refer', 'can_acc',
      'prescriber_number', 'cpn', 'hpi_number', 'acc_provider_number',
      'provider_type', 'availability_message',
      'signature_url',
      'base_rate', 'hourly_rate', 'holiday_pay_pct',
      'bank_account', 'ird_number', 'tax_code', 'contract_type', 'contract_signed_at',
    ])
    const row = { first_name, last_name, email, pin_hash, must_change_password: true }
    for (const [k, v] of Object.entries(raw)) {
      if (CREATE_ALLOWLIST.has(k) && !['first_name', 'last_name', 'email'].includes(k)) {
        row[k] = v
      }
    }
    if (row.is_active === undefined)   row.is_active = true
    if (row.is_provider === undefined) row.is_provider = true

    const { data: created, error } = await supabase
      .from('providers')
      .insert(row)
      .select('id, first_name, last_name, email, credential, specialty, color, is_active, is_admin, is_provider, is_supervisor, can_prescribe, can_refer, can_acc, prescriber_number, cpn')
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })

    // Return the plain PIN so admin can share it with the new provider on first
    // login. The provider will be forced to change it on next login
    // (must_change_password=true). PIN is never returned again after this call.
    return res.status(201).json({
      provider: created,
      initialPin: finalPin,
      note: 'Initial PIN. Share securely with the new provider. They will be prompted to change it on first login.',
    })
  }

  if (req.method === 'PATCH') {
    if (!auth.provider?.is_admin) {
      return res.status(403).json({ error: 'Admin role required to update providers' })
    }
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

    const { data, error } = await supabase
      .from('providers')
      .update(patch)
      .eq('id', id)
      .select()
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ provider: data })
  }

  if (req.method === 'DELETE') {
    if (!auth.provider?.is_admin) {
      return res.status(403).json({ error: 'Admin role required to delete providers' })
    }
    const { id, force } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id query param required' })

    // Prevent self-delete.
    if (auth.provider?.id === id) {
      return res.status(400).json({ error: 'You cannot delete your own admin account' })
    }

    // FK safety — if the provider has been referenced anywhere in the
    // consultation record system, refuse hard delete and recommend deactivate.
    // Admin can pass ?force=1 to override IF they've already unlinked references.
    if (!force || force !== '1') {
      const { count: consultCount } = await supabase
        .from('consultations')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', id)
      if (consultCount && consultCount > 0) {
        return res.status(409).json({
          error: `Provider is referenced by ${consultCount} consultation(s). Deactivate instead — hard delete would break historical clinical records. Pass ?force=1 only if you have unlinked all references.`,
          consultationCount: consultCount,
        })
      }
    }

    // Fetch signature_url first so we can clean up the storage file after
    // the row delete succeeds.
    const { data: existing } = await supabase
      .from('providers').select('signature_url').eq('id', id).maybeSingle()

    const { data: deleted, error } = await supabase
      .from('providers')
      .delete()
      .eq('id', id)
      .select('id, first_name, last_name, email')
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    if (!deleted) return res.status(404).json({ error: 'Provider not found' })

    // Fire-and-forget signature cleanup. The URL is of the form
    //   https://<project>.supabase.co/storage/v1/object/public/signatures/<filename>
    // We strip everything up to (and including) the bucket name to get the path
    // relative to the bucket, then remove it. Failure here doesn't roll back
    // the row delete — the file is orphaned but harmless.
    let signatureCleanup = 'skipped (no signature)'
    if (existing?.signature_url) {
      const marker = '/signatures/'
      const idx = existing.signature_url.indexOf(marker)
      if (idx >= 0) {
        const path = existing.signature_url.slice(idx + marker.length)
        const { error: rmErr } = await supabase.storage.from('signatures').remove([path])
        signatureCleanup = rmErr ? `failed: ${rmErr.message}` : `deleted (${path})`
      } else {
        signatureCleanup = 'skipped (unrecognised URL shape)'
      }
    }

    return res.status(200).json({ deleted, signatureCleanup })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
