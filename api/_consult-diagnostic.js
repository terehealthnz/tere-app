// GET /api/consult-diagnostic?id=<consultation_uuid> — admin-only triage view
// for a single consultation. Replaces the manual Supabase SQL that Patrick was
// running against abandoned-consult rows to decide "is this a real patient or
// are we being tested / scraped / self-tested."
//
// Returns the sandbox + payment flags, employer linkage, and the first client
// IP + audit event count + session duration from audit_logs. Does NOT include
// chief_complaint or any demographics — the FunnelPanel card already shows
// those, and we don't want to re-expose PHI here.
//
// Admin-only because the first_ip is a security-sensitive signal (identifying
// the submitter's network). Non-admin providers get 403.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const auth = await guardProvider(req, res)
  if (!auth) return
  if (!auth.provider?.is_admin) return res.status(403).json({ error: 'Admin only' })

  const id = String(req.query.id || '')
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'id must be a UUID' })

  const supabase = admin()

  const { data: consult, error: cErr } = await supabase
    .from('consultations')
    .select('id, created_at, status, is_practice, payment_test_mode, employer_id, employer_name, employer_paid, consultation_type, payment_amount, patient_id')
    .eq('id', id)
    .maybeSingle()
  if (cErr) {
    console.error('[consult-diagnostic] consult lookup failed:', cErr)
    return res.status(500).json({ error: 'Server error' })
  }
  if (!consult) return res.status(404).json({ error: 'Consultation not found' })

  // Pull every audit event tied to this consult so we can aggregate the
  // first client IP, total event count, and the session span (first event
  // → last event). Capping at 500 — any single abandoned consult generating
  // more than that is itself a signal (likely scripted).
  const { data: events, error: eErr } = await supabase
    .from('audit_logs')
    .select('ip, event_type, created_at')
    .eq('consultation_id', id)
    .order('created_at', { ascending: true })
    .limit(500)
  if (eErr) console.warn('[consult-diagnostic] audit lookup failed:', eErr.message)

  const evs = events || []
  const ips = Array.from(new Set(evs.map(e => e.ip).filter(Boolean)))
  const firstEvent = evs[0]?.created_at || null
  const lastEvent  = evs[evs.length - 1]?.created_at || null
  const sessionSeconds = (firstEvent && lastEvent)
    ? Math.round((new Date(lastEvent).getTime() - new Date(firstEvent).getTime()) / 1000)
    : null

  // Compact event-type histogram so the panel can show "triage.started x1,
  // payment.viewed x3, payment.abandoned x1" without dumping full rows.
  const typeCounts = {}
  for (const e of evs) {
    if (!e.event_type) continue
    typeCounts[e.event_type] = (typeCounts[e.event_type] || 0) + 1
  }

  return res.status(200).json({
    consult,
    audit: {
      event_count:    evs.length,
      first_event:    firstEvent,
      last_event:     lastEvent,
      session_seconds: sessionSeconds,
      ips,
      first_ip:       ips[0] || null,
      ip_count:       ips.length,
      event_types:    typeCounts,
    },
  })
}
