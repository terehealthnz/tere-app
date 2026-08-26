// Patient session token helper — used by every anon patient-facing endpoint
// to authenticate writes against a specific consultation.
//
// Pen-test M-4/M-5 fix. See supabase/2026-08-26_patient_access_token.sql
// for context.
//
// Usage from an endpoint:
//   import { resolvePatientAuth } from './_patient-token.js'
//   const auth = await resolvePatientAuth(req)
//   if (auth.error) return res.status(auth.status).json({ error: auth.error })
//   const { consultationId } = auth
//
// Token is read from (in order): X-Patient-Token header, req.body.patient_token,
// req.query.patient_token. Header preferred.
//
// Transition mode: if TOKEN is missing but a raw consultation_id is present
// in the request AND allowLegacyConsultId is true, we resolve by ID for
// backwards compat. Logs the fallback so we can measure when it's safe to
// remove. Once no more legacy fallback hits appear in the logs for a week,
// drop the allowLegacyConsultId flag.

import { createClient } from '@supabase/supabase-js'
import { randomBytes, createHash } from 'node:crypto'

const TOKEN_TTL_HOURS = 24

function sha256Hex(s) {
  return createHash('sha256').update(String(s || '')).digest('hex')
}

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// 256-bit cryptographic token, URL-safe base64 (no padding).
export function generatePatientAccessToken() {
  return randomBytes(32).toString('base64url')
}

function extractToken(req) {
  const fromHeader = req.headers?.['x-patient-token']
  if (fromHeader && typeof fromHeader === 'string') return fromHeader.trim()
  const fromBody = req.body?.patient_token
  if (fromBody && typeof fromBody === 'string') return fromBody.trim()
  const fromQuery = req.query?.patient_token
  if (fromQuery && typeof fromQuery === 'string') return fromQuery.trim()
  return null
}

function extractLegacyConsultId(req) {
  const b = req.body || {}
  const q = req.query || {}
  return (
    b.consultation_id ||
    b.consultationId ||
    q.consultation_id ||
    q.consultationId ||
    null
  )
}

/**
 * Resolve the caller's authenticated consultation.
 *
 * @param {object} req
 * @param {object} [opts]
 * @param {boolean} [opts.allowLegacyConsultId=true] — accept raw consultation_id
 *   if no token is present (backwards compat during rollout).
 * @param {string} [opts.legacyConsultId] — explicit legacy ID (e.g. read from
 *   an endpoint-specific URL param like ?id=). Preferred over the generic
 *   body/query scan because URL param names vary per endpoint.
 * @returns {{ consultationId: string, consult: object } | { error: string, status: number }}
 */
export async function resolvePatientAuth(req, opts = {}) {
  const { allowLegacyConsultId = true, legacyConsultId } = opts
  const supabase = admin()

  const token = extractToken(req)
  if (token) {
    // Compare against the SHA-256 hash column. Falls back to the plaintext
    // column for the transition window during migration
    // 2026-08-26_hash_bearer_tokens.sql. Once the plaintext column is
    // dropped in the follow-up migration, remove the fallback.
    const tokenHash = sha256Hex(token)
    let { data: consult, error } = await supabase
      .from('consultations')
      .select('id, status, patient_access_token_hash, created_at')
      .eq('patient_access_token_hash', tokenHash)
      .maybeSingle()
    if ((error || !consult) && !error?.message?.includes('does not exist')) {
      // Column exists but no match on hash — try legacy plaintext lookup
      // in case a token was minted pre-migration and hasn't been re-issued.
      const legacy = await supabase
        .from('consultations')
        .select('id, status, patient_access_token, patient_access_token_hash, created_at')
        .eq('patient_access_token', token)
        .maybeSingle()
      consult = legacy.data
      error = legacy.error
    }
    if (error || !consult) {
      return { error: 'Invalid patient session', status: 401 }
    }
    const ageMs = Date.now() - new Date(consult.created_at).getTime()
    if (ageMs > TOKEN_TTL_HOURS * 3600 * 1000) {
      return { error: 'Patient session expired', status: 401 }
    }
    return { consultationId: consult.id, consult, via: 'token' }
  }

  if (allowLegacyConsultId) {
    const legacyId = legacyConsultId || extractLegacyConsultId(req)
    if (legacyId) {
      const { data: consult, error } = await supabase
        .from('consultations')
        .select('id, status, patient_access_token, created_at')
        .eq('id', legacyId)
        .maybeSingle()
      if (error || !consult) {
        return { error: 'Invalid patient session', status: 401 }
      }
      // Instrument: if a caller lands here after the rollout window has
      // passed, that's a bug (some patient-side surface still passes raw
      // consultation_id without the header). Grepping this line in Vercel
      // logs tells us when the legacy fallback is safe to remove.
      console.warn('[patient-token] legacy fallback: consultation_id used, no X-Patient-Token', {
        consultation_id: legacyId,
        endpoint: req.url || 'unknown',
      })
      return { consultationId: consult.id, consult, via: 'legacy' }
    }
  }

  return { error: 'Patient session token required', status: 401 }
}

/**
 * Mint a token, write its SHA-256 hash to the consultation row, return
 * the plaintext token to the caller (which returns it once to the client).
 * Called by /api/create-consultation right after INSERT.
 *
 * The plaintext token exists only in this response and in the patient's
 * sessionStorage. DB stores hash only. Same rationale as password reset
 * tokens (see _provider-reset-request.js).
 *
 * During the transition window we also write the plaintext column so
 * pre-migration endpoint code that still reads plaintext keeps working.
 * Once the follow-up migration drops the plaintext column, remove the
 * `patient_access_token: token` field from this update.
 */
export async function mintAndAttachToken(supabase, consultationId) {
  const token = generatePatientAccessToken()
  const tokenHash = sha256Hex(token)
  const { error } = await supabase
    .from('consultations')
    .update({
      patient_access_token_hash: tokenHash,
      patient_access_token: token,   // transition — remove after plaintext column drop
    })
    .eq('id', consultationId)
  if (error) {
    console.error('[patient-token] mint failed:', error.message)
    return null
  }
  return token
}
