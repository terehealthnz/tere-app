// POST /api/patient-upload — anon-facing patient-side document upload.
//
// Body: { consultationId, title, description, fileName, mimeType, fileBase64 }
// Returns: { document }
//
// Scope: patient can upload documents to their own live consultation only.
// Server derives patient_id from consultationId — patient never sends
// patient_id directly (prevents cross-patient uploads via forged body).
//
// Guardrails:
//   1. consultationId must exist AND be linked to a patient_id.
//   2. Consultation must be in an "in-progress" state (not completed /
//      cancelled / no_show) so patients can't back-fill uploads onto old
//      consults years later.
//   3. Size cap 10MB (half of the 20MB provider cap — patient uploads are
//      usually phone photos, keep them small so they don't clog storage).
//   4. Same allowed mime types as provider uploads (bucket policy enforces).
//   5. All rows inserted with source='patient_upload' — surfaces under
//      the "📥 Patient uploads" section on ClinicianPatient, never
//      the provider files section.

import { createClient } from '@supabase/supabase-js'
import { resolvePatientAuth } from './_patient-token.js'

const BUCKET   = 'patient-documents'
const MAX_BYTES = 10 * 1024 * 1024
const ACTIVE_STATUSES = new Set([
  'pre_triage','triaged','waiting','vitals_requested','vitals_complete',
  'ready','in_progress','reviewing','waitlisted',
])

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function safeSlug(s) {
  return String(s || 'upload')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'upload'
}

// Return the canonical MIME type detected from the first bytes of the buffer,
// or null if the file is not one of the allowed types. Copy of the pattern
// used by api/_patient-documents.js. Pen-test #311-B1: never trust the
// client-declared mimeType.
function detectMagicByteContentType(buf) {
  if (!buf || buf.length < 4) return null
  const b = buf
  // PDF: %PDF-
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf'
  // PNG: 89 50 4E 47
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png'
  // JPEG: FF D8 FF
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg'
  // WEBP: RIFF....WEBP
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  // HEIC/HEIF: bytes 4-11 spell "ftypheic" / "ftypheix" / "ftyphevc" / "ftypmif1" / "ftypmsf1"
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = b.slice(8, 12).toString('ascii')
    if (['heic','heix','hevc','mif1','msf1','heim','heis','hevm','hevs'].includes(brand)) {
      return 'image/heic'
    }
  }
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { consultationId, title, description, fileName, mimeType, fileBase64 } = req.body || {}
  if (!consultationId || !title || !fileName || !fileBase64) {
    return res.status(400).json({ error: 'consultationId, title, fileName, fileBase64 required' })
  }

  // Pen-test M-5 phase 2: require the patient session token so a scraper
  // can't upload a document to any consultation by guessing an id.
  const auth = await resolvePatientAuth(req, { legacyConsultId: consultationId })
  if (auth.error) return res.status(auth.status).json({ error: auth.error })
  if (auth.consultationId !== consultationId) {
    return res.status(403).json({ error: 'Token does not match consultation' })
  }

  const supabase = admin()

  // Resolve + validate the consult
  const { data: consult, error: cErr } = await supabase
    .from('consultations')
    .select('id, status, patient_id, patient_first_name')
    .eq('id', consultationId)
    .maybeSingle()
  if (cErr) { console.error('[patient-upload] cErr failed:', cErr); return res.status(500).json({ error: 'Server error' }) }
  if (!consult) return res.status(404).json({ error: 'Consultation not found' })
  if (!consult.patient_id) return res.status(409).json({ error: 'Consultation has no linked patient record — cannot attach upload' })
  if (!ACTIVE_STATUSES.has(consult.status)) {
    return res.status(409).json({ error: `Consultation is ${consult.status}; uploads are only accepted while the consult is active` })
  }

  // Decode + size-check
  let buf
  try { buf = Buffer.from(fileBase64, 'base64') }
  catch { return res.status(400).json({ error: 'fileBase64 is not valid base64' }) }
  if (buf.length > MAX_BYTES) {
    return res.status(413).json({ error: `File too large (${buf.length} bytes, patient max ${MAX_BYTES})` })
  }

  // Magic-byte sniff to prevent client-declared-MIME abuse (pen-test #311-B1).
  // Without this, a patient with a valid X-Patient-Token could upload an HTML
  // or SVG payload labelled `text/html` / `image/svg+xml`, which Supabase
  // Storage would then serve back with that content-type when a provider
  // opens the file — stored-XSS in the provider chart. Restrict to the same
  // allowlist as _patient-documents.js (PDF, PNG, JPEG, WEBP, HEIC).
  const detectedContentType = detectMagicByteContentType(buf)
  if (!detectedContentType) {
    return res.status(415).json({
      error: 'Unsupported file type. Allowed: PDF, PNG, JPEG, WEBP, HEIC.',
    })
  }
  // If the client sent a MIME hint, warn on mismatch (server prefers detected).
  if (mimeType && mimeType !== detectedContentType) {
    console.warn('[patient-upload] MIME mismatch: client sent', mimeType, 'detected', detectedContentType, '— using detected')
  }

  const key = `${consult.patient_id}/patient-${Date.now()}-${safeSlug(fileName)}`
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(key, buf, {
    contentType: detectedContentType,   // never trust client-declared MIME
    upsert: false,
  })
  if (upErr) { console.error('[patient-upload] Upload failed:', upErr); return res.status(500).json({ error: 'Upload failed' }) }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(key)
  const fileUrl = pub?.publicUrl

  const { data, error } = await supabase.from('patient_documents').insert({
    patient_id:       consult.patient_id,
    title:            String(title).slice(0, 200),
    description:      description ? String(description).slice(0, 1000) : null,
    file_url:         fileUrl,
    file_name:        fileName,
    mime_type:        mimeType || null,
    file_size:        buf.length,
    uploaded_by:      null,        // patient upload; no provider id
    uploaded_by_name: consult.patient_first_name || 'Patient',
    source:           'patient_upload',
  }).select().single()
  if (error) {
    await supabase.storage.from(BUCKET).remove([key]).catch(() => {})
    console.error('[patient-upload] error failed:', error)
    return res.status(500).json({ error: 'Server error' })
  }

  // Notify provider — SMS/in-app not implemented in this MVP; the doc
  // simply appears in the provider chart on next load. Consider adding a
  // provider_notifications row here if we want a queue badge.

  return res.status(200).json({ document: data })
}
