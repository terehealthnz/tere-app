// Runs every 5 min via Vercel cron or Railway.
// Checks NZT schedule → auto-opens/closes clinic → updates next-available text.
import { createClient } from '@supabase/supabase-js'

const TZ = 'Pacific/Auckland'
const DAY_LONG = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

function getNZT(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hour12: false,
  })
  const p = {}
  fmt.formatToParts(date).forEach(x => { p[x.type] = x.value })
  const hour = p.hour === '24' ? '00' : p.hour
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${hour}:${p.minute}`,
    dayOfWeek: DAY_LONG.indexOf(new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday:'long' }).format(date)),
  }
}

function timeInRange(time, start, end) {
  const n = (t) => parseInt(t.slice(0,5).replace(':',''))
  return n(time) >= n(start) && n(time) < n(end)
}

function fmtTime(t) {
  const [h, m] = t.slice(0,5).split(':').map(Number)
  const ap = h >= 12 ? 'pm' : 'am'
  return m ? `${h%12||12}:${String(m).padStart(2,'0')}${ap}` : `${h%12||12}${ap}`
}

async function computeNextAvailable(supabase, schedules, fromDate) {
  // Fetch all upcoming shifts for next 14 days
  const dates = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i)
    return getNZT(d)
  })
  const dateStrs = dates.map(d => d.date)

  const { data: upcoming } = await supabase
    .from('provider_shifts')
    .select('provider_id, shift_date, shift_type, start_time')
    .in('shift_date', dateStrs)

  const shifts = upcoming || []

  for (const nzt of dates) {
    const dayShifts  = shifts.filter(s => s.shift_date === nzt.date)
    const unavailIds = new Set(dayShifts.filter(s => s.shift_type !== 'available').map(s => s.provider_id))
    const extra      = dayShifts.filter(s => s.shift_type === 'available')
    const recurring  = schedules.filter(s => s.day_of_week === nzt.dayOfWeek && s.is_active && !unavailIds.has(s.provider_id))
    const starts     = [...extra.map(s => s.start_time.slice(0,5)), ...recurring.map(s => s.start_time.slice(0,5))]

    if (starts.length) {
      const earliest = starts.sort()[0]
      if (nzt.date === fromDate.date && earliest <= fromDate.time) continue
      const d = new Date(nzt.date + 'T12:00:00Z')
      const diff = Math.floor((d - new Date(fromDate.date + 'T12:00:00Z')) / 86400000)
      const timeStr = fmtTime(earliest)
      if (diff === 0) return `Today from ${timeStr}`
      if (diff === 1) return `Tomorrow from ${timeStr}`
      return `${d.toLocaleDateString('en-NZ', { weekday:'long', day:'numeric', month:'long', timeZone: TZ })} from ${timeStr}`
    }
  }
  return ''
}

export default async function handler(req, res) {
  // Auth: Vercel sends Authorization: Bearer <CRON_SECRET>; Railway uses x-tere-api-key
  const cronSecret = process.env.CRON_SECRET
  const apiKey     = process.env.TERE_API_KEY
  const authBearer = req.headers.authorization?.replace('Bearer ', '')
  const apiKeyHdr  = req.headers['x-tere-api-key']

  if (cronSecret || apiKey) {
    const ok = (cronSecret && authBearer === cronSecret) || (apiKey && apiKeyHdr === apiKey)
    if (!ok) return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const nzt = getNZT()

    // Check admin override
    const { data: avail } = await supabase.from('availability').select('*').eq('id', 1).single()
    if (avail?.manual_override) {
      return res.json({ ok: true, skipped: true, reason: 'manual_override' })
    }

    // Load all active recurring schedules
    const { data: schedules } = await supabase
      .from('provider_schedules')
      .select('provider_id, day_of_week, start_time, end_time, is_active')
      .eq('is_active', true)

    // Load today's one-off shifts
    const { data: todayShifts } = await supabase
      .from('provider_shifts')
      .select('provider_id, shift_type, start_time, end_time')
      .eq('shift_date', nzt.date)

    // Load all providers for display names
    const { data: providers } = await supabase
      .from('providers')
      .select('id, first_name, last_name')
      .eq('is_active', true)
    const provMap = {}
    ;(providers || []).forEach(p => { provMap[p.id] = p })

    const shiftMap = {}
    ;(todayShifts || []).forEach(s => { shiftMap[s.provider_id] = s })

    // Find who is available right now
    const availableNames = []

    // Explicit "available" shifts
    ;(todayShifts || [])
      .filter(s => s.shift_type === 'available' && timeInRange(nzt.time, s.start_time, s.end_time))
      .forEach(s => {
        const p = provMap[s.provider_id]
        if (p) availableNames.push(`Dr ${p.last_name}`)
      })

    // Recurring schedules not overridden
    ;(schedules || [])
      .filter(s => s.day_of_week === nzt.dayOfWeek)
      .forEach(s => {
        const override = shiftMap[s.provider_id]
        if (override?.shift_type === 'available') return // already counted
        if (override?.shift_type === 'unavailable' || override?.shift_type === 'leave') return
        if (timeInRange(nzt.time, s.start_time, s.end_time)) {
          const p = provMap[s.provider_id]
          if (p) availableNames.push(`Dr ${p.last_name}`)
        }
      })

    const uniqueNames = [...new Set(availableNames)]
    const shouldBeOpen = uniqueNames.length > 0
    const wasOpen = avail?.is_open

    // Compute message + next available
    let message = avail?.message || ''
    let nextAvail = ''

    if (shouldBeOpen) {
      message = uniqueNames.length === 1
        ? `${uniqueNames[0]} is available now`
        : `${uniqueNames.join(' and ')} available`
    } else {
      message = avail?.message?.includes('manual_override')
        ? avail.message
        : "Clinic is currently closed — we'll notify you when we open."
      nextAvail = await computeNextAvailable(supabase, schedules || [], nzt)
    }

    const changed = shouldBeOpen !== wasOpen

    // Always update if open state changed; or update next_available text periodically
    if (changed || !shouldBeOpen) {
      await supabase.from('availability').update({
        is_open: shouldBeOpen,
        message,
        updated_at: new Date().toISOString(),
      }).eq('id', 1)

      // Update schedule.next_times with computed next-available
      await supabase.from('schedule').update({
        next_times: shouldBeOpen ? '' : nextAvail,
        updated_at: new Date().toISOString(),
      }).eq('id', 1)
    }

    if (changed) {
      // Log the transition
      await supabase.from('availability_log').insert({
        action: shouldBeOpen ? 'open' : 'close',
        reason: shouldBeOpen
          ? `Provider(s) available: ${uniqueNames.join(', ')}`
          : 'No providers scheduled',
        triggered_by: 'cron',
        provider_names: uniqueNames,
      }).catch(() => {})

      // Push notify relevant parties on state change
      if (shouldBeOpen) {
        // Notify providers that their shift has started + clinic is open
        for (const pid of Object.keys(shiftMap).concat((schedules || []).filter(s => s.day_of_week === nzt.dayOfWeek).map(s => s.provider_id))) {
          apifyPush(process.env.VITE_SUPABASE_URL, process.env.TERE_API_KEY, 'shift_started', { providerNames: uniqueNames }, pid).catch(() => {})
        }
      } else {
        // Notify admin of closure
        apifyPush(process.env.VITE_SUPABASE_URL, process.env.TERE_API_KEY, 'clinic_closed', { nextAvail }).catch(() => {})
      }
    }

    // Coverage check: alert admin if no providers in next 48h
    await checkCoverageAlerts(supabase, schedules || [], nzt).catch(() => {})

    return res.json({ ok: true, changed, isOpen: shouldBeOpen, nzt: `${nzt.date} ${nzt.time}`, nextAvail })
  } catch (e) {
    console.error('cron-availability:', e.message)
    return res.status(500).json({ error: e.message })
  }
}

async function apifyPush(supabaseUrl, apiKey, type, data, providerId) {
  const baseUrl = supabaseUrl?.replace('supabase.co', 'tere.co.nz') || 'https://tere.co.nz'
  return fetch(`${process.env.NEXT_PUBLIC_URL || 'https://tere.co.nz'}/api/push-notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tere-api-key': apiKey || '' },
    body: JSON.stringify({ type, ...data, ...(providerId ? { providerId } : {}) }),
  })
}

async function checkCoverageAlerts(supabase, schedules, nzt) {
  // Check next 48 hours for coverage gaps
  const gaps = []
  for (let i = 1; i <= 2; i++) {
    const d = new Date(); d.setDate(d.getDate() + i)
    const n = getNZT(d)
    const hasCoverage = schedules.some(s => s.day_of_week === n.dayOfWeek && s.is_active)
    if (!hasCoverage) {
      const dateLabel = new Date(n.date + 'T12:00:00Z').toLocaleDateString('en-NZ',
        { weekday:'long', day:'numeric', month:'long', timeZone: TZ })
      gaps.push(dateLabel)
    }
  }
  if (gaps.length) {
    // Alert admin via push
    await fetch(`${process.env.NEXT_PUBLIC_URL || 'https://tere.co.nz'}/api/push-notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tere-api-key': process.env.TERE_API_KEY || '' },
      body: JSON.stringify({ type: 'no_coverage', days: gaps }),
    }).catch(() => {})
  }
}
