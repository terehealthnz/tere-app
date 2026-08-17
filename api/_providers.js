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
import { Resend } from 'resend'
import { guardProvider } from './_auth.js'

// Auto-notification recipient for new-provider onboarding.
// RHCNZ (Rural Health Care NZ) needs each Tere provider's MCNZ number on
// file to accept referrals. Holly is their Applications Consultant —
// confirmed 2026-08-17 (see docs/regulatory/rhcnz/README.md). Move to env
// var if the recipient changes.
const RHCNZ_ONBOARDING_NOTIFICATION_EMAIL = 'Holly.Johnson@rhcnz.com'

// HTML-escape user-supplied strings before templating into an email body.
// Provider fields come from admin form input — an admin who typo'd or
// deliberately pasted markup could otherwise punch through into Holly's
// inbox as HTML.
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Fire-and-forget email to Holly with a new provider's identity + MCNZ
// number so RHCNZ can keep their referrer registry current. Best-effort:
// failures logged but never break the provider create/update flow.
async function notifyRhcnzOfProvider(provider, { changeType = 'new' } = {}) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return
  if (!provider?.is_provider) return   // admin-only rows don't need to be shared
  try {
    const resend = new Resend(resendKey)
    const nameRaw = [provider.first_name, provider.last_name, provider.credential].filter(Boolean).join(' ')
    const mcnzRaw = provider.mcnz_registration_number || '(pending — will follow up)'
    const cpnRaw  = provider.cpn || '(not yet issued)'
    const name = escapeHtml(nameRaw)
    const mcnz = escapeHtml(mcnzRaw)
    const cpn  = escapeHtml(cpnRaw)
    const verb = changeType === 'new' ? 'has been onboarded at' : 'MCNZ number updated for'
    await resend.emails.send({
      from:    'Tere Health <hello@terehealth.co.nz>',
      replyTo: 'terehealthnz@gmail.com',
      to:      RHCNZ_ONBOARDING_NOTIFICATION_EMAIL,
      subject: `Tere Health provider ${changeType === 'new' ? 'onboarded' : 'updated'} — ${nameRaw} (MCNZ ${mcnzRaw})`,
      html: `<p>Kia ora Holly,</p>
             <p>This is an automated notification — the following provider ${verb} <strong>Tere Health Limited</strong> and will be referring to RHCNZ:</p>
             <table style="border-collapse:collapse;margin:1rem 0">
               <tr><td style="padding:4px 12px 4px 0;color:#6B7280">Name</td><td style="font-weight:600">${name}</td></tr>
               <tr><td style="padding:4px 12px 4px 0;color:#6B7280">MCNZ number</td><td style="font-weight:600">${mcnz}</td></tr>
               <tr><td style="padding:4px 12px 4px 0;color:#6B7280">HPI-CPN</td><td>${cpn}</td></tr>
               <tr><td style="padding:4px 12px 4px 0;color:#6B7280">Tere HPI-O</td><td>G11238-E</td></tr>
             </table>
             <p>No action required unless you need anything further from us.</p>
             <p style="color:#6B7280;font-size:12px">Ngā mihi<br>Tere Health · terehealth.co.nz</p>`,
    })
  } catch (e) {
    console.error('[providers] RHCNZ notification failed:', e.message)
  }
}

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
  'is_active', 'is_admin', 'is_provider', 'is_supervisor', 'is_billing_admin',
  'can_prescribe', 'can_refer', 'can_acc',
  'prescriber_number', 'cpn', 'hpi_number', 'acc_provider_number',
  'signature_url',
  'base_rate',
  'bank_account', 'ird_number', 'tax_code', 'contract_type', 'contract_signed_at',
  // MCNZ RMO supervision (see supabase-mcnz-supervision-migration.sql)
  'provider_type', 'supervisor_id', 'supervision_start_date', 'supervision_scope',
  // Supervision plan identifiers (see supabase-supervision-plan-fields-migration.sql)
  'mcnz_registration_number', 'scope_of_practice', 'pgy_level', 'supervision_plan_url',
  // MFA (TOTP) — admin can clear both fields to recover a provider who
  // lost their authenticator. Provider self-service uses /api/provider-mfa.
  'mfa_enabled', 'mfa_secret_encoded',
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
        .select('id, first_name, last_name, credential, specialty, color, is_active, is_provider, is_admin, is_supervisor, is_billing_admin, can_prescribe, can_refer, can_acc, prescriber_number, cpn')
        .eq('is_active', true)
        .order('first_name')
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ providers: data || [] })
    }

    // Admin manage view — full row for every provider (active + inactive,
    // including admin-only rows). Powers the Admin > Providers panel where
    // the edit modal reads every editable column. Admin-scoped only.
    if (filter === 'admin-manage') {
      if (!auth.provider?.is_admin) {
        return res.status(403).json({ error: 'Admin role required' })
      }
      const { data, error } = await supabase
        .from('providers')
        .select('*')
        .order('first_name')
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ providers: data || [] })
    }

    // Default: modest projection, only active + is_provider rows.
    const { data, error } = await supabase
      .from('providers')
      .select('id, first_name, last_name, credential, specialty, color, is_active, is_admin, is_provider, provider_type, supervisor_id, supervision_plan_url')
      .order('first_name')
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ providers: data || [] })
  }

  if (req.method === 'POST') {
    // Server-mediated signature upload — replaces the previous client-side
    // anon supabase.storage.from('signatures').upload(...). Admin-only so
    // the anon INSERT policy on the signatures bucket can be dropped.
    // Body: { png_base64: '<raw base64, no data URL prefix>' }.
    if (req.query?.action === 'upload_signature') {
      if (!auth.provider?.is_admin) {
        return res.status(403).json({ error: 'Admin role required' })
      }
      const b64 = String(req.body?.png_base64 || '')
      if (!b64) return res.status(400).json({ error: 'png_base64 required' })
      // Reject caller-supplied data URL prefixes — server owns the mime type.
      if (b64.startsWith('data:')) {
        return res.status(400).json({ error: 'Send raw base64, not a data URL' })
      }
      let buf
      try { buf = Buffer.from(b64, 'base64') } catch { return res.status(400).json({ error: 'Invalid base64' }) }
      if (buf.length === 0)         return res.status(400).json({ error: 'Empty payload' })
      if (buf.length > 512 * 1024)  return res.status(400).json({ error: `Signature too large (${buf.length} bytes, max 524288)` })
      // Verify PNG magic bytes so we can't be tricked into uploading arbitrary
      // content (e.g. JS files) under an .png filename.
      const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
      if (!buf.subarray(0, 8).equals(PNG_MAGIC)) {
        return res.status(400).json({ error: 'Payload is not a valid PNG' })
      }
      const path = `sig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
      const { error: upErr } = await supabase.storage.from('signatures').upload(path, buf, {
        contentType: 'image/png', cacheControl: '3600', upsert: false,
      })
      if (upErr) return res.status(500).json({ error: `Upload failed: ${upErr.message}` })
      const { data: { publicUrl } } = supabase.storage.from('signatures').getPublicUrl(path)
      return res.status(200).json({ url: publicUrl })
    }

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
      'is_active', 'is_admin', 'is_provider', 'is_supervisor', 'is_billing_admin',
      'can_prescribe', 'can_refer', 'can_acc',
      'prescriber_number', 'cpn', 'hpi_number', 'acc_provider_number',
      'provider_type', 'supervisor_id', 'supervision_start_date', 'supervision_scope',
      'mcnz_registration_number', 'scope_of_practice', 'pgy_level', 'supervision_plan_url',
      'availability_message',
      'signature_url',
      'base_rate',
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
      .select('id, first_name, last_name, email, credential, specialty, color, is_active, is_admin, is_provider, is_supervisor, can_prescribe, can_refer, can_acc, prescriber_number, cpn, mcnz_registration_number')
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })

    // Notify RHCNZ (Holly) of the new provider so their referrer registry
    // stays in sync. Best-effort — doesn't affect the response.
    notifyRhcnzOfProvider(created, { changeType: 'new' })

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

    // Snapshot the pre-update MCNZ number so we can tell if this PATCH is
    // adding it for the first time (or changing it), which is the trigger for
    // re-notifying RHCNZ.
    let previousMcnz = null
    if ('mcnz_registration_number' in patch) {
      const { data: before } = await supabase
        .from('providers').select('mcnz_registration_number').eq('id', id).maybeSingle()
      previousMcnz = before?.mcnz_registration_number || null
    }

    const { data, error } = await supabase
      .from('providers')
      .update(patch)
      .eq('id', id)
      .select()
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })

    // Notify RHCNZ (Holly) if the MCNZ number was just filled in or updated —
    // this is the field they actually need for their referrer registry.
    if ('mcnz_registration_number' in patch && (patch.mcnz_registration_number || null) !== previousMcnz && data?.is_provider) {
      notifyRhcnzOfProvider(data, { changeType: 'update' })
    }

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
