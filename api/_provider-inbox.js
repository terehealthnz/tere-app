// /api/provider-inbox — list + read inbound HL7 messages routed to a provider.
//
// GET                         → list current provider's non-archived messages
// GET  ?id=<uuid>             → single message (with attachment signed URLs)
// GET  ?admin=1               → admin view: all messages including needs_review
// PATCH ?id=<uuid>            → mark read / archive / reassign provider
// POST ?action=signed_attachment_url — return signed URL for an attachment

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const BUCKET = 'hl7-attachments'
const PATCH_ALLOWLIST = new Set([
  'read_by_provider_at', 'archived_at', 'matched_provider_id', 'matched_patient_id', 'status',
])

async function withSignedAttachments(supabase, rows) {
  for (const r of rows) {
    if (!r.attachments || !r.attachments.length) continue
    for (const a of r.attachments) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(a.storage_path, 300)
      if (data?.signedUrl) a.signed_url = data.signedUrl
    }
  }
  return rows
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return
  const provider = auth.provider || {}
  const isAdmin = !!provider.is_admin
  const supabase = admin()
  const { id, admin: adminQ, action } = req.query || {}

  // Signed URL for a single attachment (used by the inbox viewer).
  if (req.method === 'POST' && action === 'signed_attachment_url') {
    const { attachment_id } = req.body || {}
    if (!attachment_id) return res.status(400).json({ error: 'attachment_id required' })
    const { data: a, error } = await supabase
      .from('inbound_hl7_attachments')
      .select('id, message_id, storage_path, content_type, filename')
      .eq('id', attachment_id)
      .maybeSingle()
    if (error || !a) return res.status(404).json({ error: 'attachment not found' })
    // Access control: attachment must belong to a message the caller can see.
    const { data: msg } = await supabase
      .from('inbound_hl7_messages')
      .select('matched_provider_id')
      .eq('id', a.message_id)
      .maybeSingle()
    if (!msg) return res.status(404).json({ error: 'message not found' })
    if (!isAdmin && msg.matched_provider_id !== provider.id) {
      return res.status(403).json({ error: 'not yours' })
    }
    const { data: signed, error: sErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(a.storage_path, 300)
    if (sErr) return res.status(500).json({ error: sErr.message })
    return res.status(200).json({ signedUrl: signed.signedUrl, content_type: a.content_type, filename: a.filename })
  }

  if (req.method === 'GET' && id) {
    let q = supabase
      .from('inbound_hl7_messages')
      .select('*, attachments:inbound_hl7_attachments(id, obx_index, content_type, storage_path, filename, size_bytes)')
      .eq('id', id)
      .maybeSingle()
    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })
    if (!data)  return res.status(404).json({ error: 'not found' })
    if (!isAdmin && data.matched_provider_id !== provider.id) {
      return res.status(403).json({ error: 'not yours' })
    }
    const [row] = await withSignedAttachments(supabase, [data])
    return res.status(200).json({ message: row })
  }

  if (req.method === 'GET' && adminQ) {
    if (!isAdmin) return res.status(403).json({ error: 'admin only' })
    const { data, error } = await supabase
      .from('inbound_hl7_messages')
      .select('id, msh_9_message_type, msh_12_version, msh_4_sending_facility, patient_first_name, patient_last_name, patient_dob, matched_provider_id, matched_patient_id, match_confidence, has_pdf, status, ack_msa_1, obr_3_1_filler_order, received_at')
      .is('superseded_by_id', null)
      .is('archived_at', null)
      .order('received_at', { ascending: false })
      .limit(500)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ messages: data || [] })
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('inbound_hl7_messages')
      .select('id, msh_9_message_type, msh_12_version, msh_4_sending_facility, patient_first_name, patient_last_name, patient_dob, matched_patient_id, match_confidence, has_pdf, status, obr_3_1_filler_order, received_at, read_by_provider_at')
      .eq('matched_provider_id', provider.id)
      .is('superseded_by_id', null)
      .is('archived_at', null)
      .order('received_at', { ascending: false })
      .limit(200)
    if (error) return res.status(500).json({ error: error.message })
    const unread = (data || []).filter(m => !m.read_by_provider_at).length
    return res.status(200).json({ messages: data || [], unread })
  }

  if (req.method === 'PATCH' && id) {
    // Access check: must be the assigned provider or an admin.
    const { data: current } = await supabase
      .from('inbound_hl7_messages')
      .select('matched_provider_id')
      .eq('id', id)
      .maybeSingle()
    if (!current) return res.status(404).json({ error: 'not found' })
    if (!isAdmin && current.matched_provider_id !== provider.id) {
      return res.status(403).json({ error: 'not yours' })
    }
    const raw = req.body || {}
    const patch = {}
    for (const [k, v] of Object.entries(raw)) {
      if (PATCH_ALLOWLIST.has(k)) patch[k] = v
    }
    // Provider-only actions (read/archive) — the two allowlist fields above
    // that a non-admin may set. Admin can also reassign the provider.
    if (!isAdmin) {
      const allowedForProvider = new Set(['read_by_provider_at', 'archived_at'])
      for (const k of Object.keys(patch)) {
        if (!allowedForProvider.has(k)) delete patch[k]
      }
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'nothing to update' })
    patch.updated_at = new Date().toISOString()
    const { error } = await supabase
      .from('inbound_hl7_messages')
      .update(patch)
      .eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
