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
import { randomBytes } from 'node:crypto'

const TOKEN_TTL_HOURS = 24

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
 * @returns {{ consultationId: string, consult: object } | { error: string, status: number }}
 */
export async function resolvePatientAuth(req, opts = {}) {
  const { allowLegacyConsultId = true } = opts
  const supabase = admin()

  const token = extractToken(req)
  if (token) {
    const { data: consult, error } = await supabase
      .from('consultations')
      .select('id, status, patient_access_token, created_at')
      .eq('patient_access_token', token)
      .maybeSingle()
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
    const legacyId = extractLegacyConsultId(req)
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
 * Mint a token, write it to the consultation row, return it. Called by
 * /api/create-consultation right after INSERT.
 */
export async function mintAndAttachToken(supabase, consultationId) {
  const token = generatePatientAccessToken()
  const { error } = await supabase
    .from('consultations')
    .update({ patient_access_token: token })
    .eq('id', consultationId)
  if (error) {
    console.error('[patient-token] mint failed:', error.message)
    return null
  }
  return token
}
