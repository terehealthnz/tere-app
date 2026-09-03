// PHI display masking (task #374).
//
// Show identifiers redacted by default in admin surfaces so a screen glance
// / photograph / screenshot doesn't leak the full identity. Reveal-on-click
// with an audit log entry — the PhiRevealGate pattern already handles the
// reveal-audit-log; these helpers just produce the redacted string.
//
// Providers on their own patients get unmasked by default (clinical care).
// Admins / billing-admins / supervisors get masked by default.

export function maskNhi(nhi) {
  if (!nhi) return '—'
  const s = String(nhi).trim()
  if (s.length < 4) return '****'
  return s.slice(0, 2) + '***' + s.slice(-1)
}

export function maskName(firstName, lastName) {
  const f = String(firstName || '').trim()
  const l = String(lastName || '').trim()
  if (!f && !l) return '—'
  const fMask = f ? f[0] + '*'.repeat(Math.max(1, f.length - 1)) : ''
  const lMask = l ? l[0] + '.' : ''
  return [fMask, lMask].filter(Boolean).join(' ')
}

export function maskFullName(fullName) {
  const s = String(fullName || '').trim()
  if (!s) return '—'
  const parts = s.split(/\s+/)
  return maskName(parts[0], parts.slice(1).join(' '))
}

// Show first 4 of year, hide day + month → 199*
export function maskDob(dob) {
  if (!dob) return '—'
  const s = String(dob)
  const year = s.match(/^(\d{4})/)?.[1]
  if (!year) return '****-**-**'
  return year.slice(0, 3) + '*'
}

export function maskEmail(email) {
  if (!email) return '—'
  const s = String(email).trim()
  const at = s.indexOf('@')
  if (at < 1) return '***'
  const user = s.slice(0, at)
  const domain = s.slice(at)
  const userMask = user.length <= 2 ? '*'.repeat(user.length) : user[0] + '*'.repeat(user.length - 2) + user[user.length - 1]
  return userMask + domain
}

// Whether the current session should default to masked view. Providers on
// their own patients skip masking; everyone else (admin / billing / supervisor)
// gets masking on.
export function shouldMaskByDefault() {
  try {
    const isProvider = sessionStorage.getItem('providerIsProvider') === 'true'
    const isAdmin    = sessionStorage.getItem('providerIsAdmin')    === 'true'
    const isBilling  = sessionStorage.getItem('providerIsBillingAdmin') === 'true'
    const isSup      = sessionStorage.getItem('providerIsSupervisor')   === 'true'
    // If the account has BOTH provider and admin, default to masked (safer).
    if (isAdmin || isBilling || isSup) return true
    if (isProvider) return false
    return true
  } catch { return true }
}
