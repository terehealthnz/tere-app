// _supervision.js — MCNZ RMO supervision endpoints.
//
// All routes provider-gated (see AUTH_REQUIRED_ROUTES in handler.js). Every
// mutation captures who did it so the audit trail is complete when MCNZ
// requests evidence during a scope review.
//
// GET  /api/supervision?action=list_rmos
//    List of providers where supervisor_id = self. Feeds the supervisor's
//    dashboard "Log meeting" form so they can pick which RMO the review
//    is for.
//
// GET  /api/supervision?action=reviews&rmoId=<uuid>
//    Recent meeting log for that RMO — used both by the RMO's own view (I
//    want to see when we last met) and MCNZ audit exports.
//
// POST /api/supervision  action=log_review
//    Body: { rmoId, meeting_duration_min, cases_reviewed, concerns_raised,
//    actions_agreed, meeting_date? }. Inserts a supervision_reviews row.
//    Anyone in the supervisor role can log a review for their own RMO.
//
// POST /api/supervision  action=set_scope
//    Body: { rmoId, supervision_scope: {...} }. Overwrites the RMO's
//    supervision_scope jsonb. Restricted to that RMO's supervisor.
//
// Per-consult countersign is intentionally NOT implemented here: MCNZ's
// baseline supervised-scope requirement is a named supervisor plus regular
// review meetings, not a signature on every note. The scheduled review log
// is the audit trail. Countersign columns exist on `consultations` from
// the initial migration but are unused — dormant, not writable through
// any endpoint.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return
  const supabase = admin()
  const selfId = auth?.provider?.id
  if (!selfId) return res.status(401).json({ error: 'provider identity missing' })

  if (req.method === 'GET') {
    const { action } = req.query || {}
    if (action === 'list_rmos') {
      const { data, error } = await supabase
        .from('providers')
        .select('id, display_name, first_name, last_name, provider_type, supervision_start_date')
        .eq('supervisor_id', selfId)
        .order('display_name', { ascending: true })
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ rmos: data || [] })
    }
    if (action === 'reviews') {
      const { rmoId } = req.query || {}
      if (!rmoId) return res.status(400).json({ error: 'rmoId required' })
      // Either the RMO themselves or their supervisor may read the log.
      const { data: rmo } = await supabase.from('providers').select('supervisor_id').eq('id', rmoId).maybeSingle()
      if (!rmo) return res.status(404).json({ error: 'RMO not found' })
      if (selfId !== rmoId && selfId !== rmo.supervisor_id) {
        return res.status(403).json({ error: 'Only the RMO or their supervisor may read this log' })
      }
      const { data, error } = await supabase
        .from('supervision_reviews')
        .select('*')
        .eq('rmo_id', rmoId)
        .order('meeting_date', { ascending: false })
        .limit(200)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ reviews: data || [] })
    }
    return res.status(400).json({ error: 'unknown action' })
  }

  if (req.method === 'POST') {
    const { action } = req.body || {}

    if (action === 'log_review') {
      const {
        rmoId, meeting_duration_min, cases_reviewed = [],
        concerns_raised = null, actions_agreed = null, meeting_date,
      } = req.body || {}
      if (!rmoId) return res.status(400).json({ error: 'rmoId required' })
      const { data: rmo } = await supabase
        .from('providers').select('supervisor_id').eq('id', rmoId).maybeSingle()
      if (!rmo) return res.status(404).json({ error: 'RMO not found' })
      if (rmo.supervisor_id !== selfId) {
        return res.status(403).json({ error: 'Only this RMO\'s assigned supervisor may log the review' })
      }
      const { data, error } = await supabase
        .from('supervision_reviews').insert({
          rmo_id: rmoId, supervisor_id: selfId,
          meeting_date: meeting_date || new Date().toISOString().slice(0, 10),
          meeting_duration_min: meeting_duration_min || null,
          cases_reviewed, concerns_raised, actions_agreed,
          created_by: selfId,
        }).select().single()
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ review: data })
    }

    if (action === 'set_scope') {
      const { rmoId, supervision_scope } = req.body || {}
      if (!rmoId) return res.status(400).json({ error: 'rmoId required' })
      if (!supervision_scope || typeof supervision_scope !== 'object') {
        return res.status(400).json({ error: 'supervision_scope object required' })
      }
      const { data: rmo } = await supabase
        .from('providers').select('supervisor_id').eq('id', rmoId).maybeSingle()
      if (!rmo) return res.status(404).json({ error: 'RMO not found' })
      if (rmo.supervisor_id !== selfId) {
        return res.status(403).json({ error: 'Only this RMO\'s assigned supervisor may set the scope' })
      }
      const { error } = await supabase
        .from('providers').update({ supervision_scope }).eq('id', rmoId)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: 'unknown action' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
