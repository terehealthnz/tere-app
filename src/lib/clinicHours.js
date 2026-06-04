export const isClinicOpen = () => {
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
