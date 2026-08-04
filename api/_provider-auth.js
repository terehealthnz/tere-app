import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { verifyTotp } from './_totp.js'

const LOCKOUTS = new Map()
const MAX_FAILS = 6
const LOCKOUT_MS = 15 * 60 * 1000

export default async function handler(req, res) {
  const { providerId, pin, mfaCode } = req.body || {}
  if (!providerId || !pin) return res.status(400).json({ error: 'Missing fields' })

  const lockout = LOCKOUTS.get(providerId)
  if (lockout?.lockedUntil && Date.now() < lockout.lockedUntil) {
    const remainingMin = Math.ceil((lockout.lockedUntil - Date.now()) / 60000)
    return res.status(401).json({ error: `Account locked. Try again in ${remainingMin} minute(s).` })
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  )

  const { data: provider, error } = await supabase
    .from('providers')
    .select('*')
    .eq('id', providerId)
    .eq('is_active', true)
    .single()

  if (error || !provider) return res.status(401).json({ error: 'Invalid credentials' })

  const hash = provider.pin_hash
  if (!hash) return res.status(401).json({ error: 'Account not configured. Contact admin.' })

  const valid = await bcrypt.compare(String(pin), hash)

  if (!valid) {
    const entry = LOCKOUTS.get(providerId) || { fails: 0 }
    entry.fails++
    if (entry.fails >= MAX_FAILS) {
      entry.lockedUntil = Date.now() + LOCKOUT_MS
      entry.fails = 0
    }
    LOCKOUTS.set(providerId, entry)
    const remaining = MAX_FAILS - (entry.fails || 0)
    const msg = entry.lockedUntil
      ? 'Account locked for 15 minutes after too many failed attempts.'
      : `Invalid credentials. ${remaining} attempt(s) remaining.`
    return res.status(401).json({ error: msg })
  }

  // PIN accepted. If provider has MFA enabled, require a valid TOTP code
  // before completing the login. Client posts { providerId, pin, mfaCode }
  // in a single request — if mfaCode is missing we return 401 with
  // needsMfa:true so the client knows to prompt.
  if (provider.mfa_enabled && provider.mfa_secret_encoded) {
    if (!mfaCode) {
      // PIN was correct — don't count the missing MFA code as a fail.
      // Signal to the client that a TOTP is required next.
      return res.status(401).json({ error: 'MFA code required', needsMfa: true })
    }
    if (!verifyTotp(provider.mfa_secret_encoded, mfaCode)) {
      // Wrong MFA code: count as a full failure (rate-limit like a bad PIN).
      const entry = LOCKOUTS.get(providerId) || { fails: 0 }
      entry.fails++
      if (entry.fails >= MAX_FAILS) {
        entry.lockedUntil = Date.now() + LOCKOUT_MS
        entry.fails = 0
      }
      LOCKOUTS.set(providerId, entry)
      return res.status(401).json({ error: 'Invalid MFA code', needsMfa: true })
    }
  }

  LOCKOUTS.delete(providerId)

  const { pin: _pin, pin_hash: _hash, mfa_secret_encoded: _sec, ...safe } = provider
  res.json({ provider: safe })
}
