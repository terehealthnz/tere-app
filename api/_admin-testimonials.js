// Admin moderation surface for patient_feedback.
//
// GET  ?action=list&status=pending|approved|rejected|complaint
// POST { action: 'moderate', id, decision, notes }
//   decision = 'approve' | 'reject' | 'route_to_complaint'
//
// Guarded via handler-level AUTH_REQUIRED_ROUTES + an inline is_admin
// check (follows the AuditLogPanel admin-gate convention).

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

const STATUS_FILTERS = new Set(['pending', 'approved', 'rejected', 'complaint'])

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function isAdmin(provider) {
  return Boolean(provider?.is_admin)
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return
  if (!isAdmin(auth.provider)) {
    return res.status(403).json({ error: 'admin only' })
  }
  const supabase = admin()

  if (req.method === 'GET' && (!req.query?.action || req.query.action === 'list')) {
    const statusFilter = req.query?.status ? String(req.query.status) : 'pending'
    if (!STATUS_FILTERS.has(statusFilter)) {
      return res.status(400).json({ error: 'invalid status filter' })
    }
    const { data, error } = await supabase
      .from('patient_feedback')
      .select(`
        id, consultation_id, rating, testimonial_text, patient_display_name,
        allow_publish, status, support_ticket_id, created_at,
        moderated_at, moderated_by, moderation_notes,
        consultation:consultations!inner(
          id, patient_first_name, patient_last_name,
          provider_display_name, notes_finalised_at
        )
      `)
      .eq('status', statusFilter)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) {
      console.error('[admin-testimonials] list failed:', error.message)
      return res.status(500).json({ error: 'Server error' })
    }
    return res.status(200).json({ feedback: data || [] })
  }

  if (req.method === 'POST') {
    const { action, id, decision, notes } = req.body || {}
    if (action !== 'moderate') return res.status(400).json({ error: 'unknown action' })
    if (!id) return res.status(400).json({ error: 'id required' })
    if (!['approve', 'reject', 'route_to_complaint'].includes(decision)) {
      return res.status(400).json({ error: 'invalid decision' })
    }

    const { data: row, error: fetchErr } = await supabase
      .from('patient_feedback').select('*').eq('id', id).maybeSingle()
    if (fetchErr || !row) return res.status(404).json({ error: 'feedback not found' })

    const now = new Date().toISOString()
    const providerId = auth.provider?.id || null
    const patch = {
      moderated_at: now,
      moderated_by: providerId,
      moderation_notes: notes ? String(notes).slice(0, 1000) : row.moderation_notes || null,
    }
    if (decision === 'approve') patch.status = 'approved'
    if (decision === 'reject')  patch.status = 'rejected'

    let newTicketId = row.support_ticket_id || null
    if (decision === 'route_to_complaint') {
      patch.status = 'complaint'
      patch.allow_publish = false
      if (!newTicketId) {
        const { data: consult } = await supabase
          .from('consultations')
          .select('patient_first_name, patient_last_name, patient_email, patient_phone')
          .eq('id', row.consultation_id)
          .maybeSingle()
        const patientName = [consult?.patient_first_name, consult?.patient_last_name].filter(Boolean).join(' ') || null
        const ticketMessage = row.testimonial_text || '(admin-routed from testimonial moderation; no patient message)'
        const { data: rpc, error: rpcErr } = await supabase.rpc(
          'patient_support_insert_rate_limited',
          {
            p_category: 'complaint',
            p_message: ticketMessage,
            p_patient_name: patientName,
            p_patient_email: consult?.patient_email || null,
            p_patient_phone: consult?.patient_phone || null,
            p_consultation_id: row.consultation_id,
            p_source: 'post_consult_feedback_admin_route',
            p_max_per_window: 10,
            p_window_hours: 1,
          },
        )
        if (rpcErr) {
          console.error('[admin-testimonials] route rpc failed:', rpcErr.message)
          return res.status(500).json({ error: 'Server error' })
        }
        const rpcRow = Array.isArray(rpc) ? rpc[0] : rpc
        newTicketId = rpcRow?.id || null
        patch.support_ticket_id = newTicketId
      }
    }

    const { error: upErr } = await supabase
      .from('patient_feedback')
      .update(patch)
      .eq('id', id)
    if (upErr) {
      console.error('[admin-testimonials] moderate update failed:', upErr.message)
      return res.status(500).json({ error: 'Server error' })
    }
    return res.status(200).json({ ok: true, support_ticket_id: newTicketId })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
