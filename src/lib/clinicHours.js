export const isClinicOpen = () => {
  // Admin/testing override: `?force_open=1` on any URL flips this tab's
  // clinic status to open for the whole session, so we can test the live
  // consult flow outside 8am-8pm without exposing anything to real
  // patients. `?force_open=0` clears the override for the tab.
  try {
    if (typeof window !== 'undefined') {
      const qp = new URLSearchParams(window.location.search).get('force_open')
      if (qp === '1') { try { sessionStorage.setItem('tere_force_open', '1') } catch {} }
      else if (qp === '0') { try { sessionStorage.removeItem('tere_force_open') } catch {} }
      try { if (sessionStorage.getItem('tere_force_open') === '1') return true } catch {}
    }
  } catch {}

  const now = new Date()
  const nztTime = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now)

  const hours   = parseInt(nztTime.find(p => p.type === 'hour').value)
  const minutes = parseInt(nztTime.find(p => p.type === 'minute').value)

  const totalMinutes = hours * 60 + minutes
  return totalMinutes >= 480 && totalMinutes < 1200 // 8:00am – 8:00pm
}

export const getNextOpenTime = () => {
  const nztHour = parseInt(
    new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland',
      hour: 'numeric',
      hour12: false,
    }).format(new Date())
  )
  return nztHour < 8 ? 'today at 8:00am' : 'tomorrow at 8:00am'
}
