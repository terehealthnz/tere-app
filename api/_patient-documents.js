// POST /api/patient-documents  → upload a document + create row
//   body: { patientId, title, description, fileName, mimeType, fileBase64 }
//   returns: { document }
//
// GET  /api/patient-documents?patientId=<uuid>  → list a patient's documents
//   returns: { documents: [...] }
//
// DELETE /api/patient-documents?id=<uuid>  → soft-delete (removes storage
//   object + row). Undelete not supported.
//
// Provider-authed for all methods. Uploads go through service_role so
// the anon key never touches the bucket.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'
import { resolveDataMode } from './_provider-access-gate.js'

const BUCKET = 'patient-documents'
const MAX_BYTES = 20 * 1024 * 1024  // 20 MB

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function safeSlug(s) {
  return String(s || 'doc')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'doc'
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return

  // Practice-mode scope for patient-document reads/writes/deletes.
  const { practice } = resolveDataMode(auth.provider, req)

  const supabase = admin()

  if (req.method === 'GET') {
    const { patientId } = req.query || {}
    if (!patientId) return res.status(400).json({ error: 'patientId query param required' })
    const { data, error } = await supabase
      .from('patient_documents')
      .select('*')
      .eq('patient_id', patientId)
      .eq('is_practice', practice)
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ documents: data || [] })
  }

  if (req.method === 'POST') {
    const { patientId, title, description, fileName, mimeType, fileBase64, source } = req.body || {}
    const validSource = source && ['provider_upload','patient_upload','video_capture'].includes(source)
      ? source : 'provider_upload'
    if (!patientId || !title || !fileBase64 || !fileName) {
      return res.status(400).json({ error: 'patientId, title, fileName, fileBase64 required' })
    }
    // Decode + size-cap the payload here so a client that ignored the client-
    // side limit can't blow past the bucket policy silently.
    let buf
    try { buf = Buffer.from(fileBase64, 'base64') }
    catch { return res.status(400).json({ error: 'fileBase64 is not valid base64' }) }
    if (buf.length > MAX_BYTES) {
      return res.status(413).json({ error: `File too large (${buf.length} bytes, max ${MAX_BYTES})` })
    }

    const key = `${patientId}/${Date.now()}-${safeSlug(fileName)}`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(key, buf, {
      contentType: mimeType || 'application/octet-stream',
      upsert: false,
    })
    if (upErr) return res.status(500).json({ error: `Upload failed: ${upErr.message}` })

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(key)
    const fileUrl = pub?.publicUrl

    const { data, error } = await supabase.from('patient_documents').insert({
      patient_id:        patientId,
      title:             String(title).slice(0, 200),
      description:       description ? String(description).slice(0, 1000) : null,
      file_url:          fileUrl,
      file_name:         fileName,
      mime_type:         mimeType || null,
      file_size:         buf.length,
      uploaded_by:       auth.provider?.id || null,
      uploaded_by_name:  auth.provider?.display_name || auth.email || null,
      source:            validSource,
      is_practice:       practice,
    }).select().single()
    if (error) {
      // Row insert failed after storage succeeded — clean up the orphan file.
      await supabase.storage.from(BUCKET).remove([key]).catch(() => {})
      return res.status(500).json({ error: error.message })
    }
    return res.status(200).json({ document: data })
  }

  if (req.method === 'DELETE') {
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id query param required' })
    const { data: row, error: getErr } = await supabase
      .from('patient_documents').select('id, file_url').eq('id', id).eq('is_practice', practice).maybeSingle()
    if (getErr) return res.status(500).json({ error: getErr.message })
    if (!row) return res.status(404).json({ error: 'Document not found' })

    // Extract the storage key from the public URL — everything after /BUCKET/.
    let key = null
    if (row.file_url) {
      const idx = row.file_url.indexOf(`/${BUCKET}/`)
      if (idx >= 0) key = row.file_url.slice(idx + BUCKET.length + 2)
    }
    if (key) await supabase.storage.from(BUCKET).remove([key]).catch(() => {})
    const { error: delErr } = await supabase.from('patient_documents').delete().eq('id', id).eq('is_practice', practice)
    if (delErr) return res.status(500).json({ error: delErr.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
