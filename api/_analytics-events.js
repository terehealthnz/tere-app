import { createClient } from '@supabase/supabase-js'

const VALID_EVENTS = new Set([
  'intro_viewed', 'triage_started', 'triage_completed',
  'payment_page_reached', 'payment_completed', 'consultation_completed',
])

export default async function handler(req, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  if (req.method === 'POST') {
    const { event_name, session_id, metadata } = req.body
    if (!event_name || !session_id) return res.status(400).json({ error: 'event_name and session_id required' })
    // Silently drop unknown events — no PHI ever stored
    if (!VALID_EVENTS.has(event_name)) return res.status(200).json({ ok: true })
    // Scrub any PHI from metadata
    const safe = metadata ? { step: metadata.step, lang: metadata.lang } : null
    await supabase.from('analytics_events').insert({ event_name, session_id, metadata: safe })
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'GET') {
    // Returns funnel counts for admin dashboard
    const { days = 30 } = req.query
    const since = new Date(Date.now() - parseInt(days) * 86400000).toISOString()
    const { data, error } = await supabase.from('analytics_events')
      .select('event_name').gte('created_at', since)
    if (error) return res.status(500).json({ error: error.message })
    const counts = {}
    for (const e of VALID_EVENTS) counts[e] = 0
    for (const row of (data || [])) {
      if (counts[row.event_name] !== undefined) counts[row.event_name]++
    }
    return res.status(200).json({ counts, days: parseInt(days) })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
