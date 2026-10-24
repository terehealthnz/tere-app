// Public endpoint behind the thank-you email buttons.
//
// GET  ?action=prefill&c=<id>&r=<rating>&t=<token>
//   Verify token, return minimal consult context so /feedback can
//   personalise the heading.
// POST { consultation_id, rating, testimonial_text, patient_display_name,
//        allow_publish, token }
//   Verify token, upsert exactly one patient_feedback row for that
//   consult. Negative also files a patient_support_requests row so the
//   existing admin Support queue picks it up.

import { createClient } from '@supabase/supabase-js'
import { verifyFeedbackToken } from './_cron-thank-you-emails.js'

const ALLOWED_RATINGS = new Set(['positive', 'negative'])
const TESTIMONIAL_MAX_LEN = 2000
const DISPLAY_NAME_MAX_LEN = 80

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function getConsult(supabase, consultationId) {
  const { data, error } = await supabase
    .from('consultations')
    .select('id, patient_first_name, patient_last_name, patient_email, patient_phone, provider_display_name, notes_finalised_at, is_practice')
    .eq('id', consultationId)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'not found' }
  return { consult: data }
}

export default async function handler(req, res) {
  const supabase = admin()

  if (req.method === 'GET' && req.query?.action === 'prefill') {
    const consultId = String(req.query.c || '')
    const rating = String(req.query.r || '')
    const token = String(req.query.t || '')
    if (!consultId || !ALLOWED_RATINGS.has(rating) || !token) {
      return res.status(400).json({ error: 'c, r, t required' })
    }
    const tv = verifyFeedbackToken(token, consultId, rating)
    if (!tv.ok) return res.status(401).json({ error: tv.error })
    const { consult, error } = await getConsult(supabase, consultId)
    if (error) return res.status(404).json({ error })
    return res.status(200).json({
      ok: true,
      rating,
      consultation: {
        id: consult.id,
        patient_first_name: consult.patient_first_name || null,
        provider_display_name: consult.provider_display_name || null,
      },
    })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ctype = String(req.headers['content-type'] || '').toLowerCase()
  if (!ctype.startsWith('application/json')) {
    return res.status(415).json({ error: 'application/json content-type required' })
  }

  const body = req.body || {}
  const consultationId = String(body.consultation_id || '')
  const rating = String(body.rating || '')
  const token = String(body.token || '')
  const testimonialText = body.testimonial_text != null ? String(body.testimonial_text) : ''
  const patientDisplayName = body.patient_display_name != null ? String(body.patient_display_name) : ''
  const allowPublish = Boolean(body.allow_publish)

  if (!consultationId) return res.status(400).json({ error: 'consultation_id required' })
  if (!ALLOWED_RATINGS.has(rating)) return res.status(400).json({ error: 'rating must be positive or negative' })
  if (!token) return res.status(400).json({ error: 'token required' })
  if (testimonialText.length > TESTIMONIAL_MAX_LEN) {
    return res.status(413).json({ error: `message too long (max ${TESTIMONIAL_MAX_LEN} chars)` })
  }
  if (patientDisplayName.length > DISPLAY_NAME_MAX_LEN) {
    return res.status(413).json({ error: `display name too long (max ${DISPLAY_NAME_MAX_LEN} chars)` })
  }

  const tv = verifyFeedbackToken(token, consultationId, rating)
  if (!tv.ok) return res.status(401).json({ error: tv.error })

  const { consult, error: cErr } = await getConsult(supabase, consultationId)
  if (cErr) return res.status(404).json({ error: cErr })

  const cleanedDisplayName = patientDisplayName.trim() || (consult.patient_first_name ? `${consult.patient_first_name} (patient)` : 'A patient')
  const cleanedText = testimonialText.trim() || null

  if (rating === 'positive') {
    const row = {
      consultation_id: consultationId,
      rating: 'positive',
      testimonial_text: cleanedText,
      patient_display_name: cleanedDisplayName,
      allow_publish: allowPublish,
      status: 'pending',
    }
    const { error: upErr } = await supabase
      .from('patient_feedback')
      .upsert(row, { onConflict: 'consultation_id' })
    if (upErr) {
      console.error('[feedback] positive upsert failed:', upErr.message)
      return res.status(500).json({ error: 'Server error' })
    }
    return res.status(200).json({ ok: true })
  }

  // Negative path: file a support ticket so admin Support queue picks it
  // up, then cross-reference it from patient_feedback with status=complaint.
  const patientName = [consult.patient_first_name, consult.patient_last_name].filter(Boolean).join(' ') || null
  const ticketMessage = cleanedText || '(patient tapped thumbs-down without leaving a message)'

  const { data: rpc, error: rpcErr } = await supabase.rpc(
    'patient_support_insert_rate_limited',
    {
      p_category: 'complaint',
      p_message: ticketMessage,
      p_patient_name: patientName,
      p_patient_email: consult.patient_email || null,
      p_patient_phone: consult.patient_phone || null,
      p_consultation_id: consultationId,
      p_source: 'post_consult_feedback',
      p_max_per_window: 5,
      p_window_hours: 1,
    },
  )
  if (rpcErr) {
    console.error('[feedback] support ticket rpc failed:', rpcErr.message)
    return res.status(500).json({ error: 'Server error' })
  }
  const rpcRow = Array.isArray(rpc) ? rpc[0] : rpc
  const supportTicketId = rpcRow?.id || null

  const row = {
    consultation_id: consultationId,
    rating: 'negative',
    testimonial_text: cleanedText,
    patient_display_name: cleanedDisplayName,
    allow_publish: false,
    status: 'complaint',
    support_ticket_id: supportTicketId,
  }
  const { error: upErr } = await supabase
    .from('patient_feedback')
    .upsert(row, { onConflict: 'consultation_id' })
  if (upErr) {
    console.error('[feedback] negative upsert failed:', upErr.message)
    return res.status(500).json({ error: 'Server error' })
  }

  return res.status(200).json({ ok: true })
}
