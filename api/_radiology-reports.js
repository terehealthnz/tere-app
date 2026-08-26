// _radiology-reports.js — provider inbox for received radiology reports.
//
// Provider-auth REQUIRED (registered in handler.js AUTH_REQUIRED_ROUTES).
//
// GET /api/radiology-reports                → list reports, newest first
//   ?status=unmatched|matched|reviewed|archived (default: all)
//
// GET /api/radiology-reports?id=<uuid>      → single report + signed PDF URL
//
// PATCH /api/radiology-reports              → update matching / workflow
//   Body: { id, patient_id?, referral_id?, consultation_id?,
//           provider_notes?, action?: 'mark_reviewed'|'archive' }

import { createClient } from '@supabase/supabase-js'
import { resolveDataMode } from './_provider-access-gate.js'

function admin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

const SIGNED_URL_TTL_SECONDS = 60 * 15  // 15-min viewer link

export default async function handler(req, res) {
  const supabase = admin()
  const providerId = req.headers['x-provider-id'] || req.auth?.providerId || null
  // Practice-mode scope for radiology report reads/writes (auth applied at router).
  const { practice } = resolveDataMode(req.auth?.provider, req)

  if (req.method === 'GET') {
    const id = req.query?.id
    if (id) {
      const { data, error } = await supabase
        .from('radiology_reports')
        .select('*')
        .eq('id', id)
        .eq('is_practice', practice)
        .maybeSingle()
      if (error) { console.error('[radiology-reports] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      if (!data) return res.status(404).json({ error: 'Not found' })

      // Sign a short-lived viewer URL for the PDF.
      let signedUrl = null
      try {
        const { data: sig } = await supabase.storage
          .from('radiology-reports')
          .createSignedUrl(data.storage_path, SIGNED_URL_TTL_SECONDS)
        signedUrl = sig?.signedUrl || null
      } catch (e) {
        console.warn('[radiology-reports] signed URL failed:', e.message)
      }

      // Audit-log this PHI view.
      try {
        await supabase.from('audit_logs').insert({
          event_type: 'radiology_report_view',
          provider_id: providerId,
          metadata: {
            actor_role: 'provider',
            target_type: 'radiology_report', target_id: data.id,
            patient_id: data.patient_id, referral_id: data.referral_id,
          },
        })
      } catch (e) { console.warn('[radiology-reports] view audit-log write failed:', e.message) }

      return res.status(200).json({ report: data, pdf_url: signedUrl })
    }

    const status = req.query?.status
    const patientId = req.query?.patient_id
    let q = supabase.from('radiology_reports').select('*').eq('is_practice', practice).order('received_at', { ascending: false }).limit(200)
    if (status) q = q.eq('status', status)
    if (patientId) q = q.eq('patient_id', patientId)
    const { data, error } = await q
    if (error) { console.error('[radiology-reports] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ reports: data || [] })
  }

  if (req.method === 'PATCH') {
    const { id, patient_id, referral_id, consultation_id, provider_notes, action } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id required' })
    if (!providerId) return res.status(401).json({ error: 'Provider auth required' })

    const patch = { updated_at: new Date().toISOString() }
    if (patient_id !== undefined) patch.patient_id = patient_id
    if (referral_id !== undefined) patch.referral_id = referral_id
    if (consultation_id !== undefined) patch.consultation_id = consultation_id
    if (provider_notes !== undefined) patch.provider_notes = provider_notes

    if (patient_id) {
      patch.status = 'matched'
      patch.matched_by = providerId
      patch.matched_at = new Date().toISOString()
    }
    if (action === 'mark_reviewed') {
      patch.status = 'reviewed'
      patch.reviewed_by = providerId
      patch.reviewed_at = new Date().toISOString()
    }
    if (action === 'archive') {
      patch.status = 'archived'
    }

    const { data, error } = await supabase
      .from('radiology_reports')
      .update(patch)
      .eq('id', id)
      .eq('is_practice', practice)
      .select()
      .single()

    if (error) { console.error('[radiology-reports] error failed:', error); return res.status(500).json({ error: 'Server error' }) }

    try {
      await supabase.from('audit_logs').insert({
        event_type: `radiology_report_${action || 'update'}`,
        provider_id: providerId,
        metadata: {
          actor_role: 'provider',
          target_type: 'radiology_report', target_id: id,
          patient_id: patch.patient_id, referral_id: patch.referral_id, status: patch.status,
        },
      })
    } catch (e) { console.warn('[radiology-reports] update audit-log write failed:', e.message) }

    return res.status(200).json({ report: data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
