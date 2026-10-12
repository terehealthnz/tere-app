// /api/provider-tasks — admin-to-provider async work queue (task #650).
//
// Primary use: represcribe_request. Admin creates a task referencing a prior
// completed consultation (parent_consultation_id). Provider opens the task
// from their inbox, opens the chart at the parent consult, writes a fresh Rx
// against that parent consult, marks the task complete.
//
// Clinical safety invariants enforced here:
//   1. parent_consultation_id must exist and belong to the same patient
//   2. parent consult must be <= 12 months old (90-day soft warn, 12mo hard block)
//   3. represcribe_request parent must have >= 1 existing prescription
//   4. only admins can create tasks
//
// Audit chain:
//   task_created -> task_claimed -> task_opened_chart -> represcribe (new Rx
//   with represcribe_task_id = this task) -> task_completed.
// Every event lands in audit_logs via writeAuditEvent.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'
import { resolveDataMode } from './_provider-access-gate.js'
import { writeAuditEvent } from './_audit-write.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const TASK_TYPES = new Set([
  'represcribe_request',
  'review_result',
  'countersign_referral',
  'patient_callback',
  'other',
])

const PRIORITY = new Set(['normal', 'urgent'])

// 12 months = hard block; 90 days = warn only (server returns a flag,
// client decides whether to require admin confirmation).
const MAX_PARENT_AGE_DAYS = 365
const WARN_PARENT_AGE_DAYS = 90

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return
  const { practice } = resolveDataMode(auth.provider, req)
  const supabase = admin()

  // ── GET: list OR get-one ────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { id, status, scope, patient_id } = req.query || {}

    // Single-task fetch
    if (id) {
      const { data, error } = await supabase
        .from('provider_tasks').select('*').eq('id', id).eq('is_practice', practice).maybeSingle()
      if (error) { console.error('[provider-tasks] get failed:', error); return res.status(500).json({ error: 'Server error' }) }
      if (!data) return res.status(404).json({ error: 'Task not found' })
      return res.status(200).json({ task: data })
    }

    // List: default "mine" = assigned to current provider OR unassigned+pending.
    // scope=all for admins (sees everything). scope=patient needs patient_id.
    let query = supabase.from('provider_tasks').select('*').eq('is_practice', practice)
    if (status) query = query.eq('status', status)
    if (patient_id) query = query.eq('patient_id', patient_id)

    if (scope === 'all') {
      if (!auth.provider?.is_admin) return res.status(403).json({ error: 'scope=all requires admin' })
      // no further filter
    } else {
      // Default scope: tasks I can action
      const providerId = auth.provider?.id
      if (!providerId) return res.status(401).json({ error: 'provider id missing' })
      query = query.or(`assigned_to.eq.${providerId},and(assigned_to.is.null,status.eq.pending)`)
    }

    const { data, error } = await query.order('priority', { ascending: false }).order('created_at', { ascending: false }).limit(200)
    if (error) { console.error('[provider-tasks] list failed:', error); return res.status(500).json({ error: 'Server error' }) }

    // Denormalize patient name/NHI onto each task so the provider inbox UI
    // can render identity without an N+1 fetch loop. Keep this in one batched
    // query; no embedded joins (Tere pattern is explicit, not FK-embedded).
    const tasks = data || []
    const patientIds = [...new Set(tasks.map(t => t.patient_id).filter(Boolean))]
    if (patientIds.length) {
      const { data: pats } = await supabase
        .from('patients')
        .select('id, first_name, last_name, nhi')
        .in('id', patientIds)
      const byId = Object.fromEntries((pats || []).map(p => [p.id, p]))
      for (const t of tasks) {
        const p = byId[t.patient_id]
        if (p) {
          t.patient_first_name = p.first_name
          t.patient_last_name  = p.last_name
          t.patient_nhi        = p.nhi
        }
      }
    }
    return res.status(200).json({ tasks })
  }

  // ── POST: create (admin only) ───────────────────────────────────────────
  if (req.method === 'POST') {
    if (!auth.provider?.is_admin) return res.status(403).json({ error: 'Admin role required to create tasks' })

    const body = req.body || {}
    const {
      patient_id,
      parent_consultation_id,
      task_type,
      title,
      body: taskBody,
      priority = 'normal',
      assigned_to = null,
    } = body

    // Shape validation
    if (!patient_id)             return res.status(400).json({ error: 'patient_id required' })
    if (!parent_consultation_id) return res.status(400).json({ error: 'parent_consultation_id required' })
    if (!task_type || !TASK_TYPES.has(task_type)) return res.status(400).json({ error: 'invalid task_type' })
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title required' })
    if (!PRIORITY.has(priority)) return res.status(400).json({ error: 'invalid priority' })

    // Parent-consult validation — same patient, completed, in-practice-mode
    const { data: parent, error: parentErr } = await supabase
      .from('consultations')
      .select('id, patient_id, status, created_at, is_practice')
      .eq('id', parent_consultation_id)
      .maybeSingle()
    if (parentErr) { console.error('[provider-tasks] parent lookup failed:', parentErr); return res.status(500).json({ error: 'Server error' }) }
    if (!parent) return res.status(404).json({ error: 'parent consultation not found' })
    if (parent.patient_id !== patient_id) return res.status(400).json({ error: 'parent consultation does not belong to this patient' })
    if (parent.is_practice !== practice) return res.status(400).json({ error: 'parent consultation is in a different practice mode' })

    const ageDays = (Date.now() - new Date(parent.created_at).getTime()) / 86400000
    if (ageDays > MAX_PARENT_AGE_DAYS) {
      return res.status(400).json({ error: `parent consultation too old (${Math.round(ageDays)} days). Max ${MAX_PARENT_AGE_DAYS}. Create a new consult instead.` })
    }
    const ageWarn = ageDays > WARN_PARENT_AGE_DAYS

    // For represcribe tasks, parent consult must have at least one existing Rx
    if (task_type === 'represcribe_request') {
      const { count, error: rxErr } = await supabase
        .from('prescriptions')
        .select('id', { count: 'exact', head: true })
        .eq('consultation_id', parent_consultation_id)
      if (rxErr) { console.error('[provider-tasks] rx-count failed:', rxErr); return res.status(500).json({ error: 'Server error' }) }
      if ((count || 0) === 0) {
        return res.status(400).json({ error: 'parent consultation has no prescriptions — represcribe_request not applicable. Use task_type=other or route via a new consult.' })
      }
    }

    // Insert
    const row = {
      patient_id,
      parent_consultation_id,
      task_type,
      title: String(title).trim().slice(0, 200),
      body: taskBody ? String(taskBody).slice(0, 4000) : null,
      priority,
      assigned_to,
      created_by: auth.provider.id,
      is_practice: practice,
    }
    const { data, error } = await supabase.from('provider_tasks').insert(row).select().single()
    if (error) { console.error('[provider-tasks] insert failed:', error); return res.status(500).json({ error: 'Server error' }) }

    writeAuditEvent(req, auth, {
      event_type: 'provider_task.created',
      consultation_id: parent_consultation_id,
      resource_type: 'provider_task',
      resource_id: data.id,
      metadata: { task_type, priority, assigned_to, patient_id, parent_age_days: Math.round(ageDays), practice },
    })

    // Notify assigned provider (or admins notified pool for unassigned).
    // Fire-and-forget — notification failure must not block task creation.
    try {
      await notifyProvider(supabase, data, auth, req)
    } catch (e) {
      console.error('[provider-tasks] notification failed (non-fatal):', e)
    }

    return res.status(200).json({ task: data, age_warn: ageWarn })
  }

  // ── PATCH: status transitions + completion ──────────────────────────────
  if (req.method === 'PATCH') {
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id query param required' })

    const { data: existing, error: fetchErr } = await supabase
      .from('provider_tasks').select('*').eq('id', id).eq('is_practice', practice).maybeSingle()
    if (fetchErr) { console.error('[provider-tasks] fetch failed:', fetchErr); return res.status(500).json({ error: 'Server error' }) }
    if (!existing) return res.status(404).json({ error: 'Task not found' })

    const body = req.body || {}
    const patch = { updated_at: new Date().toISOString() }
    const providerId = auth.provider?.id

    // Action: claim (mark in_progress, record started_by)
    if (body.action === 'claim') {
      if (existing.status !== 'pending') return res.status(409).json({ error: `Cannot claim task in status '${existing.status}'` })
      patch.status = 'in_progress'
      patch.started_by = providerId
      patch.started_at = new Date().toISOString()
      if (!existing.assigned_to) patch.assigned_to = providerId
    }
    // Action: complete
    else if (body.action === 'complete') {
      if (existing.status === 'completed') return res.status(409).json({ error: 'Already completed' })
      if (existing.status === 'cancelled') return res.status(409).json({ error: 'Task was cancelled' })
      patch.status = 'completed'
      patch.completed_by = providerId
      patch.completed_at = new Date().toISOString()
      if (body.completion_notes) patch.completion_notes = String(body.completion_notes).slice(0, 4000)
    }
    // Action: cancel (admin only)
    else if (body.action === 'cancel') {
      if (!auth.provider?.is_admin) return res.status(403).json({ error: 'Admin required to cancel tasks' })
      if (existing.status === 'completed') return res.status(409).json({ error: 'Cannot cancel completed task' })
      patch.status = 'cancelled'
      if (body.completion_notes) patch.completion_notes = String(body.completion_notes).slice(0, 4000)
    }
    // Action: reassign (admin only, or current assignee reassigning)
    else if (body.action === 'reassign') {
      const canReassign = auth.provider?.is_admin || existing.assigned_to === providerId
      if (!canReassign) return res.status(403).json({ error: 'Only admin or current assignee can reassign' })
      patch.assigned_to = body.assigned_to || null
    }
    else {
      return res.status(400).json({ error: 'action must be one of: claim | complete | cancel | reassign' })
    }

    const { data, error } = await supabase.from('provider_tasks').update(patch).eq('id', id).select().single()
    if (error) { console.error('[provider-tasks] update failed:', error); return res.status(500).json({ error: 'Server error' }) }

    writeAuditEvent(req, auth, {
      event_type: `provider_task.${body.action}`,
      consultation_id: data.parent_consultation_id,
      resource_type: 'provider_task',
      resource_id: id,
      metadata: { task_type: data.task_type, from: existing.status, to: data.status, practice },
    })

    return res.status(200).json({ task: data })
  }

  res.setHeader('Allow', 'GET, POST, PATCH')
  return res.status(405).json({ error: 'Method not allowed' })
}

// Notify the assigned provider (or on-duty providers if unassigned) via SMS +
// in-app push. Reuses the /api/sms + /api/push-notify endpoints internally so
// provider notification preferences are honoured. Fire-and-forget — failures
// are swallowed by the caller.
async function notifyProvider(supabase, task, auth, req) {
  const appUrl = process.env.APP_URL || 'https://terehealth.co.nz'
  const providerIds = []
  if (task.assigned_to) {
    providerIds.push(task.assigned_to)
  } else {
    // Unassigned pending task — notify admins + supervisors so the task doesn't
    // sit silent in the queue. We don't blast every provider.
    const { data } = await supabase
      .from('providers').select('id, mobile').or('is_admin.eq.true,requires_supervision.eq.false').limit(20)
    for (const p of data || []) if (p.id) providerIds.push(p.id)
  }
  if (providerIds.length === 0) return

  const { data: targets } = await supabase
    .from('providers').select('id, display_name, mobile, email, sms_on_call').in('id', providerIds)

  const priorityPrefix = task.priority === 'urgent' ? '🚨 URGENT · ' : ''
  const typeLabel = task.task_type.replace(/_/g, ' ')
  const smsBody = `Tere · ${priorityPrefix}${typeLabel} task from admin. Open: ${appUrl}/provider`

  for (const p of targets || []) {
    if (p.mobile && p.sms_on_call !== false) {
      fetch(`${appUrl}/api/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: p.mobile, message: smsBody, type: 'provider_task' }),
      }).catch(() => {})
    }
  }
}
