// _generate-supervision-plan.js
//
// Generates the MCNZ-facing supervision plan PDF for a given RMO, embedding
// the supervisor's and director's signatures. Uploads the result to
// Supabase Storage bucket `supervision-plans/<rmoId>.pdf` and stores the
// public URL on the RMO's `providers.supervision_plan_url` column so it can
// be re-fetched from the admin UI without regenerating.
//
// POST /api/generate-supervision-plan  body: { rmoId }
//
// Provider-auth required (see AUTH_REQUIRED_ROUTES). The caller must be the
// RMO's assigned supervisor or a Tere admin.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'
import { buildSupervisionPlanPdf } from './_pdf-builders.js'

const STORAGE_BUCKET = 'supervision-plans'

function admin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const auth = await guardProvider(req, res)
  if (!auth) return
  const supabase = admin()
  const selfId = auth?.provider?.id
  const isAdmin = !!auth?.provider?.is_admin

  const { rmoId } = req.body || {}
  if (!rmoId) return res.status(400).json({ error: 'rmoId required' })

  // Load the RMO row.
  const { data: rmo, error: rmoErr } = await supabase.from('providers')
    .select('id, first_name, last_name, email, mcnz_registration_number, scope_of_practice, pgy_level, supervision_start_date, supervisor_id, provider_type')
    .eq('id', rmoId).maybeSingle()
  if (rmoErr) return res.status(500).json({ error: rmoErr.message })
  if (!rmo) return res.status(404).json({ error: 'RMO not found' })
  if (rmo.provider_type !== 'rmo') {
    return res.status(400).json({ error: 'Provider is not an RMO — supervision plan does not apply' })
  }
  if (!rmo.supervisor_id) {
    return res.status(400).json({ error: 'RMO has no assigned supervisor — cannot generate plan' })
  }
  // Only the RMO's own supervisor or a Tere admin may generate the plan.
  if (!isAdmin && selfId !== rmo.supervisor_id) {
    return res.status(403).json({ error: 'Only the assigned supervisor or a Tere admin may generate this plan' })
  }

  // Load the supervisor. The plan is signed by the RMO and the assigned
  // supervisor only — no separate director attest slot.
  const { data: supervisor } = await supabase.from('providers')
    .select('id, first_name, last_name, prescriber_number, cpn, specialty, signature_url, email')
    .eq('id', rmo.supervisor_id).maybeSingle()
  if (!supervisor) return res.status(500).json({ error: 'Supervisor row missing' })

  // Build the PDF.
  let pdfBuffer
  try {
    pdfBuffer = await buildSupervisionPlanPdf({
      rmo: {
        first_name: rmo.first_name,
        last_name: rmo.last_name,
        mcnz_registration_number: rmo.mcnz_registration_number,
        scope_of_practice: rmo.scope_of_practice,
        pgy_level: rmo.pgy_level,
        supervision_start_date: rmo.supervision_start_date,
      },
      supervisor: {
        first_name: supervisor.first_name,
        last_name: supervisor.last_name,
        prescriber_number: supervisor.prescriber_number,
        cpn: supervisor.cpn,
        specialty: supervisor.specialty,
        signature_url: supervisor.signature_url,
        email: supervisor.email,
      },
    })
  } catch (e) {
    return res.status(500).json({ error: 'PDF build failed: ' + e.message })
  }

  // Ensure the bucket exists (idempotent — Supabase returns 409 if it exists).
  try {
    await supabase.storage.createBucket(STORAGE_BUCKET, { public: false })
  } catch { /* bucket already exists, fine */ }

  // Upload — overwrite any prior copy for this RMO.
  const path = `${rmoId}.pdf`
  const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET)
    .upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: true, cacheControl: '0' })
  if (upErr) return res.status(500).json({ error: 'Upload failed: ' + upErr.message })

  // Signed URL for admin download (7 day validity, generous — this only ever
  // sits in the AddProviderModal banner for a moment before the admin
  // saves/emails it, but sometimes tabs get left open).
  const { data: signed, error: signErr } = await supabase.storage.from(STORAGE_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7)
  if (signErr) return res.status(500).json({ error: 'Sign failed: ' + signErr.message })

  // Persist the storage path on the provider row (not the signed URL — that
  // expires; the path is stable and can be re-signed on demand).
  await supabase.from('providers')
    .update({ supervision_plan_url: `${STORAGE_BUCKET}/${path}` })
    .eq('id', rmoId)

  return res.status(200).json({
    rmoId,
    path,
    signedUrl: signed.signedUrl,
    rmoEmail: rmo.email,
    rmoName: `${rmo.first_name} ${rmo.last_name}`.trim(),
  })
}
