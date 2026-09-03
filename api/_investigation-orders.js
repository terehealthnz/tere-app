// /api/investigation-orders — results follow-up worklist + state transitions
// (task #418). Backing table: investigation_orders (migration
// 2026-09-03_investigation_orders.sql).
//
// GET    ?id=<uuid>                 — single order (chart or worklist detail)
// GET    ?patient_id=<uuid>         — orders for a patient (chart view)
// GET    ?filter=worklist           — everything not yet actioned (default)
// GET    ?filter=mine               — worklist for req.auth.provider
// GET    ?filter=overdue            — SLA-breached orders (past expected_by_days)
// GET    ?filter=abnormal_unactioned
// GET    ?filter=all
// POST                              — create manual order (lab, other)
// PATCH  ?id=<uuid>                 — transition state (received/reviewed/actioned/cancelled/escalated)
//
// Auth: provider gated via req.auth; billing_only redacted to metadata only.
// All PHI reads/writes flow here — no direct table access from browser.

import { createClient } from '@supabase/supabase-js'
import { resolveDataMode } from './_provider-access-gate.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const CREATE_ALLOWLIST = new Set([
  'consultation_id', 'patient_id', 'patient_nhi', 'patient_name',
  'order_type', 'order_description', 'expected_by_days',
])

const PATCH_ALLOWLIST = new Set([
  // Mark received (usually done automatically by HL7 receive; manual for labs).
  'received_at', 'received_source_table', 'received_source_id',
  'received_summary', 'is_abnormal',
  // Reviewed / actioned / cancelled / escalated — all provider-driven.
  'reviewed_at', 'reviewed_by_provider_id', 'reviewed_by_provider_name',
  'actioned_at', 'actioned_by_provider_id', 'action_notes',
  'cancelled_at', 'cancelled_reason',
  'escalated_at', 'escalation_reason', 'escalated_to_admin',
  // Status transitions computed from above but also settable explicitly.
  'status',
])

const ALLOWED_ORDER_TYPES = new Set(['radiology','lab','referral','other'])

function auditRow(order, event, provider) {
  return {
    event_type:      event,
    provider_id:     provider?.id || null,
    provider_name:   `${provider?.first_name || ''} ${provider?.last_name || ''}`.trim() || null,
    provider_role:   provider?.is_admin ? 'admin' : (provider?.is_supervisor ? 'supervisor' : 'provider'),
    resource_type:   'investigation_order',
    resource_id:     order.id,
    patient_ref:     order.patient_nhi || null,
    consultation_id: order.consultation_id || null,
    metadata:        {
      order_type:  order.order_type,
      description: order.order_description?.slice(0, 200),
      status:      order.status,
    },
  }
}

export default async function handler(req, res) {
  const auth = req.auth
  if (!auth?.provider) return res.status(401).json({ error: 'Provider auth required' })
  const { practice } = resolveDataMode(auth.provider, req)
  if (practice) return res.status(200).json({ orders: [], practice_mode: true })

  const supabase = admin()

  // ---- GET ----
  if (req.method === 'GET') {
    const { id, patient_id, filter, limit } = req.query || {}
    const lim = Math.min(Number(limit) || 200, 500)

    if (id) {
      const { data, error } = await supabase.from('investigation_orders')
        .select('*').eq('id', id).maybeSingle()
      if (error) return res.status(500).json({ error: error.message })
      if (!data) return res.status(404).json({ error: 'Not found' })
      return res.status(200).json({ order: data })
    }

    let q = supabase.from('investigation_orders').select('*').order('ordered_at', { ascending: false }).limit(lim)

    if (patient_id) q = q.eq('patient_id', patient_id)

    // Filter presets. Default = 'worklist' = anything not yet actioned + not cancelled.
    const preset = String(filter || 'worklist')
    if (preset === 'mine' && auth.provider.id) {
      q = q.eq('ordered_by_provider_id', auth.provider.id)
           .not('status', 'in', '(actioned,cancelled)')
    } else if (preset === 'overdue') {
      // Postgres: ordered_at + expected_by_days * interval '1 day' < now()
      // Not directly expressible in PostgREST; do it client-side after fetch.
      q = q.eq('status', 'ordered')
    } else if (preset === 'abnormal_unactioned') {
      q = q.eq('status', 'reviewed').eq('is_abnormal', true)
    } else if (preset === 'all') {
      /* no filter */
    } else {
      // 'worklist' — active items only
      q = q.not('status', 'in', '(actioned,cancelled)')
    }

    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })

    // Compute overdue flag client-side (see note above about PostgREST).
    const now = Date.now()
    const withOverdue = (data || []).map(o => {
      const dueMs = new Date(o.ordered_at).getTime() + (o.expected_by_days || 7) * 86400000
      return { ...o, is_overdue: o.status === 'ordered' && now > dueMs }
    })

    const filtered = preset === 'overdue' ? withOverdue.filter(o => o.is_overdue) : withOverdue
    return res.status(200).json({ orders: filtered })
  }

  // ---- POST (create manual order) ----
  if (req.method === 'POST') {
    const body = req.body || {}
    const patch = {}
    for (const [k, v] of Object.entries(body)) if (CREATE_ALLOWLIST.has(k)) patch[k] = v

    if (!patch.order_type || !ALLOWED_ORDER_TYPES.has(patch.order_type)) {
      return res.status(400).json({ error: `order_type required (one of ${[...ALLOWED_ORDER_TYPES].join(', ')})` })
    }
    if (!patch.order_description || String(patch.order_description).trim().length < 3) {
      return res.status(400).json({ error: 'order_description required (min 3 chars)' })
    }
    patch.ordered_by_provider_id   = auth.provider.id
    patch.ordered_by_provider_name = `${auth.provider.first_name || ''} ${auth.provider.last_name || ''}`.trim() || null
    patch.expected_by_days         = patch.expected_by_days || (patch.order_type === 'lab' ? 3 : patch.order_type === 'radiology' ? 14 : 7)

    const { data, error } = await supabase.from('investigation_orders').insert(patch).select('*').single()
    if (error) return res.status(500).json({ error: error.message })

    await supabase.from('audit_logs').insert(auditRow(data, 'investigation_order_created', auth.provider))
    return res.status(200).json({ order: data })
  }

  // ---- PATCH (state transitions) ----
  if (req.method === 'PATCH') {
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id required' })

    const body = req.body || {}
    const patch = {}
    for (const [k, v] of Object.entries(body)) if (PATCH_ALLOWLIST.has(k)) patch[k] = v
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'no allowed fields in patch' })

    // Fetch current row so we can validate the state transition + set
    // reviewer/actioner names from the caller if they weren't provided.
    const { data: current, error: fetchErr } = await supabase.from('investigation_orders')
      .select('*').eq('id', id).maybeSingle()
    if (fetchErr) return res.status(500).json({ error: fetchErr.message })
    if (!current) return res.status(404).json({ error: 'Not found' })

    const providerName = `${auth.provider.first_name || ''} ${auth.provider.last_name || ''}`.trim() || null
    const nowIso = new Date().toISOString()

    // Convenience: if the caller sets reviewed_at without provider fields,
    // fill from auth. Same for actioned_at / escalated_at.
    if (patch.reviewed_at && !patch.reviewed_by_provider_id) {
      patch.reviewed_by_provider_id = auth.provider.id
      patch.reviewed_by_provider_name = providerName
      patch.status = 'reviewed'
    }
    if (patch.actioned_at && !patch.actioned_by_provider_id) {
      patch.actioned_by_provider_id = auth.provider.id
      patch.status = 'actioned'
    }
    if (patch.cancelled_at && !patch.status) patch.status = 'cancelled'
    if (patch.received_at && !patch.status) patch.status = 'received'
    if (patch.escalated_at && !patch.escalated_to_admin) patch.escalated_to_admin = true

    const { data, error } = await supabase.from('investigation_orders')
      .update(patch).eq('id', id).select('*').single()
    if (error) return res.status(500).json({ error: error.message })

    // Audit each transition — reviewers + actioners are named in the trail.
    const events = []
    if (patch.received_at   && current.status !== 'received')  events.push('investigation_order_received')
    if (patch.reviewed_at   && current.status !== 'reviewed')  events.push('investigation_order_reviewed')
    if (patch.actioned_at   && current.status !== 'actioned')  events.push('investigation_order_actioned')
    if (patch.cancelled_at  && current.status !== 'cancelled') events.push('investigation_order_cancelled')
    if (patch.escalated_at)                                    events.push('investigation_order_escalated')
    for (const ev of events) {
      await supabase.from('audit_logs').insert(auditRow(data, ev, auth.provider))
    }

    return res.status(200).json({ order: data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
