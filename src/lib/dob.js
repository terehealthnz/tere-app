// DOB formatting that never shifts a day across timezones.
//
// Why this exists: `new Date("1993-06-25")` parses as UTC midnight, so when
// the host browser is west of NZT (e.g. a provider using a US-anchored VPN)
// `.toLocaleDateString()` renders the day before. First shipped after
// Alexandra Rankin's chart showed 24 Jun 1993 for a 25 Jun DOB, which fed
// the pharmacist the wrong birthday on 2026-11-02.
//
// A DOB is a plain calendar date with no clock; treat it as such. Parse the
// Y-M-D segments ourselves and build a Date at local midnight — then every
// formatter is safe regardless of host timezone.

function parseLocalDob(s) {
  if (!s) return null
  const str = String(s).slice(0, 10) // tolerates '1993-06-25' or '1993-06-25T00:00:00Z'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str)
  if (!m) return null
  const [, y, mo, d] = m
  const dt = new Date(Number(y), Number(mo) - 1, Number(d))
  return isNaN(dt) ? null : dt
}

export function formatDob(s, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const dt = parseLocalDob(s)
  if (!dt) return ''
  return dt.toLocaleDateString('en-NZ', opts)
}

export function calculateAge(s) {
  const dt = parseLocalDob(s)
  if (!dt) return null
  const now = new Date()
  let age = now.getFullYear() - dt.getFullYear()
  const m = now.getMonth() - dt.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dt.getDate())) age--
  return age
}
