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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { consultationId, title, description, fileName, mimeType, fileBase64 } = req.body || {}
  if (!consultationId || !title || !fileName || !fileBase64) {
    return res.status(400).json({ error: 'consultationId, title, fileName, fileBase64 required' })
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

  const key = `${consult.patient_id}/patient-${Date.now()}-${safeSlug(fileName)}`
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(key, buf, {
    contentType: mimeType || 'application/octet-stream',
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
