import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { verifyTotp } from './_totp.js'

// Lockout policy: after MAX_FAILS consecutive failures, lock the
// account for LOCKOUT_MS. State is persisted in the
// provider_login_attempts table (see supabase/2026-08-09_provider_login_attempts.sql)
// so it survives Vercel serverless cold starts and applies across
// all instances rather than being per-lambda in-memory.
const MAX_FAILS = 6
const LOCKOUT_MS = 15 * 60 * 1000

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Read the current lockout state for a provider. Returns { failed, lockedUntilMs }
// where lockedUntilMs is a millisecond epoch or null.
async function readLockout(supabase, providerId) {
  const { data } = await supabase
    .from('provider_login_attempts')
    .select('failed_count, locked_until')
    .eq('provider_id', providerId)
    .maybeSingle()
  if (!data) return { failed: 0, lockedUntilMs: null }
  return {
    failed: data.failed_count || 0,
    lockedUntilMs: data.locked_until ? new Date(data.locked_until).getTime() : null,
  }
}

// Record one failed attempt. Uses the atomic Postgres RPC introduced in
// supabase/2026-08-23_pentest_p2_security_fixes.sql — the prior code
// read failed_count then upserted, which was race-vulnerable:
// N concurrent bad-PIN attempts all read 0, all wrote 1, lockout never
// triggered. The RPC does an atomic increment via ON CONFLICT DO UPDATE
// and returns the resulting lockout state in a single round-trip.
async function recordFailure(supabase, providerId) {
  const { data, error } = await supabase.rpc('provider_login_record_failure', {
    p_provider_id: providerId,
    p_max_fails:   MAX_FAILS,
    p_lockout_ms:  LOCKOUT_MS,
  })
  if (error) {
    // If the RPC is missing (migration not applied) fall back to the
    // old best-effort read-then-upsert so auth doesn't hard-break.
    console.error('[provider-auth] recordFailure RPC failed, falling back:', error.message)
    const cur = await readLockout(supabase, providerId)
    const nextCount = cur.failed + 1
    const shouldLock = nextCount >= MAX_FAILS
    const patch = shouldLock
      ? { provider_id: providerId, failed_count: 0, locked_until: new Date(Date.now() + LOCKOUT_MS).toISOString(), updated_at: new Date().toISOString() }
      : { provider_id: providerId, failed_count: nextCount,             locked_until: null,                                             updated_at: new Date().toISOString() }
    await supabase.from('provider_login_attempts').upsert(patch, { onConflict: 'provider_id' })
    return { shouldLock, remaining: Math.max(0, MAX_FAILS - nextCount) }
  }
  const row = Array.isArray(data) ? data[0] : data
  return {
    shouldLock: !!row?.should_lock,
    remaining:  row?.remaining ?? 0,
  }
}

// Wipe attempts on successful login.
async function clearAttempts(supabase, providerId) {
  await supabase.from('provider_login_attempts').delete().eq('provider_id', providerId)
}

export default async function handler(req, res) {
  const { providerId, pin, mfaCode } = req.body || {}
  if (!providerId || !pin) return res.status(400).json({ error: 'Missing fields' })

  const supabase = admin()

  // ── Lockout check (DB-backed, survives cold starts) ────────────
  const lockout = await readLockout(supabase, providerId)
  if (lockout.lockedUntilMs && Date.now() < lockout.lockedUntilMs) {
    const remainingMin = Math.ceil((lockout.lockedUntilMs - Date.now()) / 60000)
    return res.status(401).json({ error: `Account locked. Try again in ${remainingMin} minute(s).` })
  }

  // ── Load provider ──────────────────────────────────────────────
  const { data: provider, error } = await supabase
    .from('providers')
    .select('*')
    .eq('id', providerId)
    .eq('is_active', true)
    .single()

  if (error || !provider) return res.status(401).json({ error: 'Invalid credentials' })

  const hash = provider.pin_hash
  if (!hash) return res.status(401).json({ error: 'Account not configured. Contact admin.' })

  // ── PIN check ──────────────────────────────────────────────────
  const valid = await bcrypt.compare(String(pin), hash)

  if (!valid) {
    const { shouldLock, remaining } = await recordFailure(supabase, providerId)
    const msg = shouldLock
      ? 'Account locked for 15 minutes after too many failed attempts.'
      : `Invalid credentials. ${remaining} attempt(s) remaining.`
    return res.status(401).json({ error: msg })
  }

  // ── MFA check (if enabled on the provider) ─────────────────────
  //
  // Client posts { providerId, pin, mfaCode } in a single request —
  // if mfaCode is missing we return 401 with needsMfa:true so the
  // client knows to prompt.
  if (provider.mfa_enabled && provider.mfa_secret_encoded) {
    if (!mfaCode) {
      // PIN was correct — don't count the missing MFA code as a failure.
      // Signal to the client that a TOTP is required next.
      return res.status(401).json({ error: 'MFA code required', needsMfa: true })
    }
    if (!verifyTotp(provider.mfa_secret_encoded, mfaCode)) {
      // Wrong MFA code counts as a full failure — same rate limit path.
      await recordFailure(supabase, providerId)
      return res.status(401).json({ error: 'Invalid MFA code', needsMfa: true })
    }
  }

  // ── Success — reset the attempt counter ────────────────────────
  await clearAttempts(supabase, providerId)

  const { pin: _pin, pin_hash: _hash, mfa_secret_encoded: _sec, ...safe } = provider
  res.json({ provider: safe })
}
