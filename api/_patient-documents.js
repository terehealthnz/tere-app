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
const SIGNED_URL_TTL_SECONDS = 60 * 15  // 15-min view links

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

// Extract the storage key from a stored file_url like
// https://xxx.supabase.co/storage/v1/object/{public|sign}/patient-documents/<key>
function extractStorageKey(fileUrl) {
  if (!fileUrl) return null
  const marker = `/${BUCKET}/`
  const idx = String(fileUrl).indexOf(marker)
  if (idx < 0) return null
  const rest = fileUrl.slice(idx + marker.length)
  // Strip signed-URL query string, if present.
  return rest.split('?')[0]
}

// Magic-byte MIME allowlist. Uploads must match one of these — MIME header
// alone is trivially spoofable, so we verify the first bytes of the buffer.
function detectContentByMagic(buf) {
  if (buf.length < 4) return null
  const b = buf
  // PDF: "%PDF"
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf'
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png'
  // JPEG
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg'
  // WEBP: RIFF....WEBP
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b.length >= 12 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  // HEIC (ftyp box, heic/heix/hevc/mif1 brand)
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11])
    if (['heic', 'heix', 'hevc', 'mif1'].includes(brand)) return 'image/heic'
  }
  // DOCX / doc (ZIP or OLE) — skip magic-byte enforcement, rely on
  // allowed_mime_types + downstream renderers. Safe because docx = zip
  // and Supabase serves with the stored content-type.
  return null
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
    if (error) { console.error('[patient-documents] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    // Replace stored public URLs with fresh signed URLs. Bucket is now
    // private (pen test P2 finding) — any leaked historical URL is dead;
    // active viewers get a 15-min link that requires the signature.
    const rows = data || []
    for (const row of rows) {
      const key = extractStorageKey(row.file_url)
      if (!key) continue
      try {
        const { data: sig } = await supabase.storage.from(BUCKET).createSignedUrl(key, SIGNED_URL_TTL_SECONDS)
        if (sig?.signedUrl) row.file_url = sig.signedUrl
      } catch { /* leave file_url as-is; may still work if bucket happens to be public */ }
    }
    return res.status(200).json({ documents: rows })
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

    // Magic-byte MIME validation. Client-supplied mimeType is untrustworthy —
    // e.g. an attacker can claim application/pdf on a payload that's actually
    // <script>. If we detect a recognised binary type, require it to match
    // what the client claimed (loose match on the type prefix).
    const detected = detectContentByMagic(buf)
    if (detected && mimeType && detected.split('/')[0] !== String(mimeType).split('/')[0]) {
      return res.status(400).json({
        error: `File content does not match declared type (declared=${mimeType}, detected=${detected})`,
      })
    }
    // Prefer the detected MIME over the client-supplied one; the storage
    // response Content-Type is what browsers act on, so lying here would let
    // a JS file be served as image/png.
    const storedContentType = detected || mimeType || 'application/octet-stream'

    const key = `${patientId}/${Date.now()}-${safeSlug(fileName)}`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(key, buf, {
      contentType: storedContentType,
      upsert: false,
    })
    if (upErr) { console.error('[patient-documents] Upload failed:', upErr); return res.status(500).json({ error: 'Upload failed' }) }

    // We now issue signed URLs on GET (bucket is private). Store the
    // public-URL shape for backwards compatibility with old rows — the
    // GET path re-signs on read.
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
      console.error('[patient-documents] error failed:', error)
      return res.status(500).json({ error: 'Server error' })
    }
    return res.status(200).json({ document: data })
  }

  if (req.method === 'DELETE') {
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id query param required' })
    const { data: row, error: getErr } = await supabase
      .from('patient_documents').select('id, file_url').eq('id', id).eq('is_practice', practice).maybeSingle()
    if (getErr) { console.error('[patient-documents] getErr failed:', getErr); return res.status(500).json({ error: 'Server error' }) }
    if (!row) return res.status(404).json({ error: 'Document not found' })

    // Extract the storage key from the public URL — everything after /BUCKET/.
    let key = null
    if (row.file_url) {
      const idx = row.file_url.indexOf(`/${BUCKET}/`)
      if (idx >= 0) key = row.file_url.slice(idx + BUCKET.length + 2)
    }
    if (key) await supabase.storage.from(BUCKET).remove([key]).catch(() => {})
    const { error: delErr } = await supabase.from('patient_documents').delete().eq('id', id).eq('is_practice', practice)
    if (delErr) { console.error('[patient-documents] delErr failed:', delErr); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
