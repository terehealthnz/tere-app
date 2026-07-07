// /api/clinic-schedule — clinic-wide opening schedule (single row id=1).
//
// Distinct from /api/schedule which handles per-provider provider_schedules /
// provider_shifts. This endpoint drives the clinic-wide "auto open" toggle
// in ScheduleEditor.jsx:
//   - schedule.slots  (JSON string of day/hour ranges)
//   - availability.use_schedule  (bool: apply the schedule automatically)
//
// Provider-auth via router (any provider can adjust clinic hours). Both rows
// pin id=1 (single-row config).

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function handler(req, res) {
  const supabase = admin()

  if (req.method === 'GET') {
    const [{ data: sch }, { data: av }] = await Promise.all([
      supabase.from('schedule').select('slots').eq('id', 1).maybeSingle(),
      supabase.from('availability').select('use_schedule').eq('id', 1).maybeSingle(),
    ])
    return res.status(200).json({
      slots: sch?.slots || null,
      use_schedule: av?.use_schedule || false,
    })
  }

  if (req.method === 'PATCH') {
    const { slots, use_schedule } = req.body || {}
    const results = []
    if (typeof slots === 'string') {
      const { error } = await supabase
        .from('schedule')
        .update({ slots })
        .eq('id', 1)
      if (error) return res.status(500).json({ error: `schedule: ${error.message}` })
      results.push('slots')
    }
    if (typeof use_schedule === 'boolean') {
      const { error } = await supabase
        .from('availability')
        .update({ use_schedule })
        .eq('id', 1)
      if (error) return res.status(500).json({ error: `availability: ${error.message}` })
      results.push('use_schedule')
    }
    if (results.length === 0) {
      return res.status(400).json({ error: 'No supported fields in patch' })
    }
    return res.status(200).json({ ok: true, updated: results })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
