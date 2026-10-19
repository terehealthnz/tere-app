// GET /api/consult-timings?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Returns flow-timing averages for completed, is_practice=false consults
// where notes_finalised_at falls inside the requested NZT date range.
//
// Shape:
//   {
//     range: { from, to, days: 7 },
//     overall: {
//       count,
//       avg_queue_sec,     // created_at → ring_started_at
//       avg_consult_sec,   // ring_started_at → completed_at
//       avg_notes_sec,     // completed_at → notes_finalised_at
//       avg_total_sec,     // created_at → notes_finalised_at
//     },
//     daily: [ { date, count, avg_queue_sec, avg_consult_sec, avg_notes_sec, avg_total_sec }, ... ]
//   }
//
// Admin-only via handler.js AUTH_REQUIRED_ROUTES. Sandbox + test-mode
// rows excluded so training data doesn't skew the clinical dashboard.

import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// Convert a YYYY-MM-DD NZT calendar date to the ISO instant at NZT midnight.
// Pacific/Auckland offset varies with DST, so we use Intl to resolve the exact
// UTC moment the NZT day starts.
function nzMidnightUtc(ymd) {
  // Build a UTC noon for the given calendar date, then back out the NZ offset
  // so we land on NZT 00:00:00. Noon avoids DST-transition edge cases.
  const [y, m, d] = ymd.split('-').map(Number)
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const nzParts = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland', hour: 'numeric', hour12: false,
  }).formatToParts(utcNoon)
  const nzHour = Number(nzParts.find(p => p.type === 'hour').value) || 12
  const offsetHours = nzHour - 12  // positive = NZ ahead of UTC
  // Midnight NZT on this date = (date 00:00) - offset hours in UTC
  return new Date(Date.UTC(y, m - 1, d, -offsetHours, 0, 0)).toISOString()
}

function ymdInNz(d) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  return `${parts.find(p=>p.type==='year').value}-${parts.find(p=>p.type==='month').value}-${parts.find(p=>p.type==='day').value}`
}

function avg(arr) {
  const nums = arr.filter(n => Number.isFinite(n) && n >= 0)
  if (!nums.length) return null
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const from = String(req.query.from || '').match(/^\d{4}-\d{2}-\d{2}$/)?.[0]
  const to   = String(req.query.to   || '').match(/^\d{4}-\d{2}-\d{2}$/)?.[0]
  if (!from || !to) return res.status(400).json({ error: 'from and to must be YYYY-MM-DD (NZT)' })

  // "to" is inclusive — advance one calendar day in NZT so the range
  // covers the entire end day up to NZT 23:59:59.
  const nextCalendarDay = (ymd) => {
    const [y, m, d] = ymd.split('-').map(Number)
    const t = Date.UTC(y, m - 1, d) + 86400 * 1000
    const nd = new Date(t)
    return `${nd.getUTCFullYear()}-${String(nd.getUTCMonth()+1).padStart(2,'0')}-${String(nd.getUTCDate()).padStart(2,'0')}`
  }
  const fromIso = nzMidnightUtc(from)
  const toIso   = nzMidnightUtc(nextCalendarDay(to))

  const supabase = supabaseAdmin()
  const { data, error } = await supabase
    .from('consultations')
    .select('id, created_at, ring_started_at, completed_at, notes_finalised_at, is_practice, payment_test_mode')
    .not('notes_finalised_at', 'is', null)
    .gte('notes_finalised_at', fromIso)
    .lt('notes_finalised_at', toIso)
    .order('notes_finalised_at', { ascending: true })
    .limit(5000)
  if (error) {
    console.error('[consult-timings]', error.message)
    return res.status(500).json({ error: 'Query failed' })
  }

  const rows = (data || []).filter(r => !r.is_practice && !r.payment_test_mode)

  // Per-row deltas in seconds. Null if either endpoint missing.
  const stage = (startIso, endIso) => {
    if (!startIso || !endIso) return null
    const s = new Date(startIso).getTime(), e = new Date(endIso).getTime()
    if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return null
    return Math.round((e - s) / 1000)
  }
  const enriched = rows.map(r => ({
    date:          ymdInNz(new Date(r.notes_finalised_at)),
    queue_sec:     stage(r.created_at,       r.ring_started_at),
    consult_sec:   stage(r.ring_started_at,  r.completed_at),
    notes_sec:     stage(r.completed_at,     r.notes_finalised_at),
    total_sec:     stage(r.created_at,       r.notes_finalised_at),
  }))

  const overall = {
    count:            enriched.length,
    avg_queue_sec:    avg(enriched.map(e => e.queue_sec)),
    avg_consult_sec:  avg(enriched.map(e => e.consult_sec)),
    avg_notes_sec:    avg(enriched.map(e => e.notes_sec)),
    avg_total_sec:    avg(enriched.map(e => e.total_sec)),
  }

  // Group by NZT date for the daily breakdown table.
  const byDay = new Map()
  for (const r of enriched) {
    if (!byDay.has(r.date)) byDay.set(r.date, [])
    byDay.get(r.date).push(r)
  }
  const daily = Array.from(byDay.entries()).map(([date, items]) => ({
    date,
    count:            items.length,
    avg_queue_sec:    avg(items.map(i => i.queue_sec)),
    avg_consult_sec:  avg(items.map(i => i.consult_sec)),
    avg_notes_sec:    avg(items.map(i => i.notes_sec)),
    avg_total_sec:    avg(items.map(i => i.total_sec)),
  })).sort((a, b) => a.date.localeCompare(b.date))

  return res.status(200).json({
    range: { from, to },
    overall,
    daily,
  })
}
