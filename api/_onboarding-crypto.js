// AES-256-GCM encryption for the sensitive fields on job_onboarding_intake
// (IRD number, bank account). Key is a 32-byte value base64-encoded in
// process.env.ONBOARDING_ENCRYPTION_KEY. Store format: iv (12B) || tag (16B)
// || ciphertext (variable).
//
// Generation once:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// Put the output in Vercel as ONBOARDING_ENCRYPTION_KEY. Rotating the key is
// destructive (existing intake rows become undecryptable) — treat as a
// long-lived secret.
//
// The design choice to encrypt in Node instead of via pgcrypto keeps the key
// out of the database's memory + logs, and avoids handing raw pg_conn credentials
// the ability to decrypt at rest.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function loadKey() {
  const raw = process.env.ONBOARDING_ENCRYPTION_KEY || ''
  if (!raw) throw new Error('ONBOARDING_ENCRYPTION_KEY env not set')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('ONBOARDING_ENCRYPTION_KEY must decode to 32 bytes (got ' + key.length + ')')
  }
  return key
}

/**
 * Encrypt a plaintext string to a bytea-compatible Buffer.
 * Returns null for empty/null input (so we don't waste bytes on empty fields).
 */
export function encryptForStorage(plaintext) {
  if (plaintext == null || plaintext === '') return null
  const iv     = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', loadKey(), iv)
  const ct     = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct])
}

/**
 * Decrypt from a bytea Buffer (or hex string as Supabase returns bytea) back
 * to plaintext. Returns '' for null/empty input. Throws on tampering.
 */
export function decryptFromStorage(bytea) {
  if (bytea == null) return ''
  let buf
  if (Buffer.isBuffer(bytea)) {
    buf = bytea
  } else if (typeof bytea === 'string' && bytea.startsWith('\\x')) {
    // pg bytea hex-encoded form
    buf = Buffer.from(bytea.slice(2), 'hex')
  } else if (typeof bytea === 'string') {
    // base64 fallback
    buf = Buffer.from(bytea, 'base64')
  } else {
    // supabase-js returns bytea as { type: 'Buffer', data: [...] } sometimes
    buf = Buffer.from(bytea?.data || bytea)
  }
  if (buf.length < 12 + 16 + 1) return ''
  const iv       = buf.subarray(0, 12)
  const tag      = buf.subarray(12, 28)
  const ct       = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', loadKey(), iv)
  decipher.setAuthTag(tag)
  const pt = Buffer.concat([decipher.update(ct), decipher.final()])
  return pt.toString('utf8')
}

/**
 * Mask a plaintext value for admin summary display — shows last 4 chars.
 * Use this in list views; require an explicit "reveal" action to see full.
 */
export function maskForSummary(plain) {
  const s = String(plain || '')
  if (s.length <= 4) return s ? '••••' : ''
  return '•••• ' + s.slice(-4)
}
