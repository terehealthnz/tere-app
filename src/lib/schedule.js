// Schedule utilities — all times in NZT (Pacific/Auckland)

export const TZ = 'Pacific/Auckland'

// 0=Sunday, 1=Monday … 6=Saturday (JS convention)
export const DAY_SHORT  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
export const DAY_LONG   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
// Monday-first display order for NZ (indices into DAY_SHORT/DAY_LONG)
export const WEEK_ORDER = [1,2,3,4,5,6,0] // Mon→Sun

export function getNZT(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hour12: false,
  })
  const p = {}
  fmt.formatToParts(date).forEach(x => { p[x.type] = x.value })
  const hour = p.hour === '24' ? '00' : p.hour
  const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long' })
  return {
    date: `${p.year}-${p.month}-${p.day}`,  // "2026-05-23"
    time: `${hour}:${p.minute}`,              // "09:30"
    dayOfWeek: DAY_LONG.indexOf(dayFmt.format(date)), // 0=Sun
  }
}

// "09:00:00" or "09:00" → "9am" / "9:30pm"
export function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.slice(0,5).split(':').map(Number)
  if (isNaN(h)) return t
  const ap = h >= 12 ? 'pm' : 'am'
  return m ? `${h%12||12}:${String(m).padStart(2,'0')}${ap}` : `${h%12||12}${ap}`
}

// "2026-05-23" → "Sat 23 May"
export function fmtDate(s) {
  if (!s) return ''
  return new Date(s + 'T12:00:00Z').toLocaleDateString('en-NZ',
    { weekday:'short', day:'numeric', month:'short', timeZone: TZ })
}

// "2026-05-23" → "Saturday 23 May"
export function fmtDateLong(s) {
  if (!s) return ''
  return new Date(s + 'T12:00:00Z').toLocaleDateString('en-NZ',
    { weekday:'long', day:'numeric', month:'long', timeZone: TZ })
}

// true if "09:30" is within ["09:00","17:00")
export function timeInRange(time, start, end) {
  const n = (t) => parseInt(t.slice(0,5).replace(':',''))
  return n(time) >= n(start) && n(time) < n(end)
}

// Return 7 date strings Mon→Sun for the week containing `ref`
export function getWeekDates(ref = new Date()) {
  const nzt = getNZT(ref)
  const [y, mo, d] = nzt.date.split('-').map(Number)
  const dow = nzt.dayOfWeek // 0=Sun
  const toMon = dow === 0 ? -6 : 1 - dow
  return WEEK_ORDER.map((_, i) => {
    const dt = new Date(Date.UTC(y, mo - 1, d + toMon + (WEEK_ORDER.indexOf(WEEK_ORDER[i]) + (dow === 0 ? -6 : 1 - dow))))
    // simpler: just offset from Monday
    const monday = new Date(Date.UTC(y, mo - 1, d + toMon))
    const day = new Date(monday)
    day.setUTCDate(monday.getUTCDate() + i)
    return getNZT(day).date
  })
}

// Build human "Next available: Thursday 9am" text from schedule data
export function nextAvailableText(schedules, shifts, fromNzt) {
  for (let i = 0; i < 14; i++) {
    const ref = new Date()
    ref.setDate(ref.getDate() + i)
    const nzt = getNZT(ref)
    const dow = nzt.dayOfWeek

    // One-off shifts on this date
    const dayShifts   = (shifts  || []).filter(s => s.shift_date === nzt.date)
    const unavailIds  = new Set(dayShifts.filter(s => s.shift_type !== 'available').map(s => s.provider_id))
    const extraAvail  = dayShifts.filter(s => s.shift_type === 'available')

    // Recurring schedules (not overridden)
    const recurring = (schedules || []).filter(s => s.day_of_week === dow && s.is_active && !unavailIds.has(s.provider_id))

    const allStarts = [
      ...extraAvail.map(s => s.start_time.slice(0,5)),
      ...recurring.map(s => s.start_time.slice(0,5)),
    ]

    if (allStarts.length) {
      const earliest = allStarts.sort()[0]
      if (i === 0 && earliest <= fromNzt.time) continue // already passed today
      const timeStr = fmtTime(earliest)
      if (i === 0) return `Today from ${timeStr}`
      if (i === 1) {
        const name = ref.toLocaleDateString('en-NZ', { weekday:'long', timeZone: TZ })
        return `Tomorrow (${name}) from ${timeStr}`
      }
      return `${ref.toLocaleDateString('en-NZ', { weekday:'long', day:'numeric', month:'long', timeZone: TZ })} from ${timeStr}`
    }
  }
  return ''
}
