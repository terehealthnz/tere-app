// /api/provider-licenses — provider state-license self-service + admin review.
//
// GET                              → provider: my licenses (all statuses)
// GET   ?admin=1                   → admin: all licenses (default status=pending_review; ?status=all overrides)
// POST                             → provider: create pending row for a new state
// POST  ?action=upload_url         → provider: signed upload URL for the license doc (Supabase Storage)
// PATCH ?id=<uuid>&action=approve  → admin: mark active + append state_code to providers.licensed_states
// PATCH ?id=<uuid>&action=reject   → admin: mark rejected + record review_notes reason
// DELETE ?id=<uuid>                → provider (own) or admin (any) removes a row (also unappends from
//                                    providers.licensed_states if the row was active)
//
// Notifications: on approve/reject the provider gets a Resend email +
// provider_notifications row so the badge lights up in their app.
//
// Uses service_role via admin() throughout. All requests gated by guardProvider.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'
import { sendEmail } from './_email-client.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const US_STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR',
  'PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
])

const STATUS_ALLOWED = new Set(['pending_review', 'active', 'rejected', 'expired', 'revoked'])

const LICENSE_BUCKET = 'provider-licenses'

async function ensureBucket(supabase) {
  // Idempotent: create the private bucket if it doesn't exist. License docs
  // are PHI-adjacent (provider identity + license number) so bucket is private
  // and we hand out short-lived signed URLs only.
  try {
    await supabase.storage.createBucket(LICENSE_BUCKET, { public: false })
  } catch { /* already exists — fine */ }
}

async function notifyProvider(supabase, providerRow, subject, htmlBody, textBody) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey || !providerRow?.email) return
  try {
    await sendEmail({
      from: 'Tere Health <hello@terehealth.co.nz>',
      to: [providerRow.email],
      subject,
      html: htmlBody,
      text: textBody,
    })
  } catch (e) { console.error('[provider-licenses] notify email failed:', e.message) }

  // In-app notification badge in the provider's Messages/Notifications area.
  try {
    await supabase.from('provider_notifications').insert({
      to_provider_id: providerRow.id,
      from_name: 'Tere Health admin',
      subject,
      body: textBody.slice(0, 800),
      context_type: 'state_license',
    })
  } catch (e) { console.error('[provider-licenses] notify row failed:', e.message) }
}

async function refreshLicensedStatesArray(supabase, providerId) {
  // Rebuild providers.licensed_states from all active, non-expired rows for
  // this provider. Single source of truth = provider_state_licenses; the
  // providers.licensed_states column is a denormalised cache for the queue
  // filter to hit fast.
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('provider_state_licenses')
    .select('state_code, expires_at')
    .eq('provider_id', providerId)
    .eq('status', 'active')
    .gte('expires_at', today)
  if (error) { console.error('[provider-licenses] refresh cache read:', error.message); return }
  const codes = Array.from(new Set((data || []).map(r => r.state_code))).sort()
  const { error: upErr } = await supabase
    .from('providers')
    .update({ licensed_states: codes.length ? codes : null })
    .eq('id', providerId)
  if (upErr) console.error('[provider-licenses] refresh cache write:', upErr.message)
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return
  const provider = auth.provider || {}
  const isAdmin = !!provider.is_admin
  const supabase = admin()
  const { id, action, admin: adminQ, status: statusFilter } = req.query || {}

  // ── Signed upload URL for the license doc ─────────────────────────────
  if (req.method === 'POST' && action === 'upload_url') {
    const { filename } = req.body || {}
    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ error: 'filename required' })
    }
    // Namespace by provider so admin can browse and delete cleanly.
    const safe = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
    const path = `${provider.id}/${Date.now()}_${safe}`
    await ensureBucket(supabase)
    const { data, error } = await supabase.storage
      .from(LICENSE_BUCKET)
      .createSignedUploadUrl(path)
    if (error) { console.error('[provider-licenses] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ path, token: data.token, signedUrl: data.signedUrl, bucket: LICENSE_BUCKET })
  }

  // ── Provider: list my licenses ────────────────────────────────────────
  if (req.method === 'GET' && !adminQ) {
    const { data, error } = await supabase
      .from('provider_state_licenses')
      .select('*')
      .eq('provider_id', provider.id)
      .order('state_code', { ascending: true })
    if (error) { console.error('[provider-licenses] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ licenses: withSignedDocUrls(supabase, data || []) })
  }

  // ── Admin: list all licenses (default pending) ────────────────────────
  if (req.method === 'GET' && adminQ) {
    if (!isAdmin) return res.status(403).json({ error: 'admin only' })
    let q = supabase
      .from('provider_state_licenses')
      .select('*, providers!provider_state_licenses_provider_id_fkey(id, first_name, last_name, email, credential)')
      .order('created_at', { ascending: false })
    if (!statusFilter || statusFilter === 'pending_review') q = q.eq('status', 'pending_review')
    else if (statusFilter !== 'all')                        q = q.eq('status', statusFilter)
    const { data, error } = await q
    if (error) { console.error('[provider-licenses] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    const signed = await withSignedDocUrls(supabase, data || [])
    return res.status(200).json({ licenses: signed })
  }

  // ── Provider: create a new pending state license ──────────────────────
  if (req.method === 'POST' && !action) {
    const { state_code, license_number, expires_at, license_doc_url } = req.body || {}
    const code = String(state_code || '').trim().toUpperCase()
    if (!code || !US_STATE_CODES.has(code)) {
      return res.status(400).json({ error: 'valid US 2-letter state_code required' })
    }
    if (!license_number || !String(license_number).trim()) {
      return res.status(400).json({ error: 'license_number required' })
    }
    if (!expires_at || !/^\d{4}-\d{2}-\d{2}$/.test(expires_at)) {
      return res.status(400).json({ error: 'expires_at (YYYY-MM-DD) required' })
    }
    if (new Date(expires_at) <= new Date()) {
      return res.status(400).json({ error: 'expires_at must be in the future' })
    }

    const insert = {
      provider_id:     provider.id,
      state_code:      code,
      license_number:  String(license_number).trim(),
      expires_at,
      license_doc_url: license_doc_url || null,
      status:          'pending_review',
    }
    const { data, error } = await supabase
      .from('provider_state_licenses')
      .insert(insert)
      .select('*')
      .maybeSingle()
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: `You already have a ${code} license entry — edit it instead of re-adding.` })
      }
      console.error('[provider-licenses] error failed:', error)
      return res.status(500).json({ error: 'Server error' })
    }

    // Ping all admins so someone knows to review.
    try {
      const { data: admins } = await supabase
        .from('providers')
        .select('id, email, first_name')
        .eq('is_admin', true)
        .eq('is_active', true)
      const providerName = [provider.first_name, provider.last_name].filter(Boolean).join(' ') || provider.email
      const subject = `New state license pending review — ${providerName} (${code})`
      const text = `${providerName} submitted a ${code} license (#${insert.license_number}, expires ${expires_at}) for admin review.\n\nReview at: ${process.env.VITE_APP_URL || 'https://terehealth.co.nz'}/clinician/state-licenses`
      for (const a of (admins || [])) {
        await notifyProvider(supabase, a, subject, `<p>${text.replace(/\n/g, '<br>')}</p>`, text)
      }
    } catch (e) { console.error('[provider-licenses] admin notify failed:', e.message) }

    return res.status(200).json({ license: data })
  }

  // ── Admin: approve or reject a pending license ────────────────────────
  if (req.method === 'PATCH' && (action === 'approve' || action === 'reject')) {
    if (!isAdmin) return res.status(403).json({ error: 'admin only' })
    if (!id) return res.status(400).json({ error: 'id required' })

    const { review_notes } = req.body || {}
    if (action === 'reject' && !String(review_notes || '').trim()) {
      return res.status(400).json({ error: 'review_notes required when rejecting so provider knows why' })
    }

    const patch = {
      status:       action === 'approve' ? 'active' : 'rejected',
      reviewed_by:  provider.id,
      reviewed_at:  new Date().toISOString(),
      review_notes: review_notes ? String(review_notes).trim().slice(0, 1000) : null,
      updated_at:   new Date().toISOString(),
    }
    const { data: row, error } = await supabase
      .from('provider_state_licenses')
      .update(patch)
      .eq('id', id)
      .select('*, providers!provider_state_licenses_provider_id_fkey(id, email, first_name, last_name)')
      .maybeSingle()
    if (error) { console.error('[provider-licenses] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    if (!row)  return res.status(404).json({ error: 'not found' })

    // On approve: refresh the cached array on the providers row.
    if (action === 'approve') {
      await refreshLicensedStatesArray(supabase, row.provider_id)
    }

    // Notify the provider.
    const p = row.providers
    if (p) {
      const stateLabel = row.state_code
      if (action === 'approve') {
        const subject = `Your ${stateLabel} license is approved`
        const text = `Your state license for ${stateLabel} (#${row.license_number}, expires ${row.expires_at}) has been approved. You can now see patients located in ${stateLabel}.`
        await notifyProvider(supabase, p, subject, `<p>${text}</p>`, text)
      } else {
        const subject = `Your ${stateLabel} license was not approved`
        const text = `Your state license for ${stateLabel} was not approved.\n\nReason from admin:\n${patch.review_notes}\n\nYou can submit a new request from your provider app after addressing the feedback.`
        await notifyProvider(supabase, p, subject, `<p>${text.replace(/\n/g, '<br>')}</p>`, text)
      }
    }

    return res.status(200).json({ license: row })
  }

  // ── Delete (provider deletes own, admin deletes any) ──────────────────
  if (req.method === 'DELETE' && id) {
    const { data: row, error: fetchErr } = await supabase
      .from('provider_state_licenses')
      .select('id, provider_id, state_code, status')
      .eq('id', id)
      .maybeSingle()
    if (fetchErr) { console.error('[provider-licenses] fetchErr failed:', fetchErr); return res.status(500).json({ error: 'Server error' }) }
    if (!row)     return res.status(404).json({ error: 'not found' })
    if (row.provider_id !== provider.id && !isAdmin) {
      return res.status(403).json({ error: 'not yours' })
    }
    const { error: delErr } = await supabase
      .from('provider_state_licenses')
      .delete()
      .eq('id', id)
    if (delErr) { console.error('[provider-licenses] delErr failed:', delErr); return res.status(500).json({ error: 'Server error' }) }
    // If the deleted row was active, refresh the cached array.
    if (row.status === 'active') {
      await refreshLicensedStatesArray(supabase, row.provider_id)
    }
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// Rewrites the raw license_doc_url path into a short-lived signed URL so
// the UI can render the doc without exposing bucket contents publicly.
async function withSignedDocUrls(supabase, rows) {
  const out = []
  for (const r of rows) {
    if (r.license_doc_url) {
      const { data, error } = await supabase.storage
        .from(LICENSE_BUCKET)
        .createSignedUrl(r.license_doc_url, 300)  // 5 min
      if (!error && data?.signedUrl) r.license_doc_signed_url = data.signedUrl
    }
    out.push(r)
  }
  return out
}
