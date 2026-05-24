import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

const LOCKOUTS = new Map()
const MAX_FAILS = 6
const LOCKOUT_MS = 15 * 60 * 1000

export default async function handler(req, res) {
  const { providerId, pin } = req.body || {}
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

  LOCKOUTS.delete(providerId)

  const { pin: _pin, pin_hash: _hash, ...safe } = provider
  res.json({ provider: safe })
}
