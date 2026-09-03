// Column-level PHI encryption using pgcrypto (task #381).
//
// We keep this in the app layer (not raw SQL from every endpoint) so callers
// don't have to deal with pgp_sym_encrypt/decrypt directly and so key access
// is a single seam we can rotate.
//
// Key: ACC_PHI_ENCRYPTION_KEY — set in Vercel env, NEVER in the DB.
//   Recommend 32+ random bytes base64. pgp_sym_encrypt uses AES-128
//   internally with a KDF from the passphrase, so long random passphrase
//   is fine.
//
// Strategy: dual-write during transition.
//   Writers call encryptForColumn(supabase, plaintext) → returns bytea buffer
//   for INSERT/UPDATE. Store BOTH the plain text (existing column) and the
//   encrypted bytea (new *_enc column). Once every row has _enc populated
//   and readers have flipped to prefer _enc, we null the plain column.
//
// Reader: readMaybeEncrypted(supabase, encBuffer, plainFallback) — tries to
//   decrypt encBuffer; falls back to plainFallback if decryption fails or
//   encBuffer is null.

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function key() {
  const k = process.env.ACC_PHI_ENCRYPTION_KEY
  if (!k) return null
  return k
}

/** Encrypt a plaintext string. Returns null if the key isn't configured
 *  (dev) or if the RPC isn't available, so callers can dual-write safely. */
export async function encryptPhi(plaintext) {
  if (plaintext == null) return null
  const passphrase = key()
  if (!passphrase) return null
  const supabase = admin()
  const { data, error } = await supabase.rpc('encrypt_phi_text', {
    p_plaintext: String(plaintext),
    p_passphrase: passphrase,
  })
  if (error) {
    // RPC missing (migration not applied) — soft-fail so writers still succeed.
    console.warn('[phi-crypto] encrypt RPC unavailable:', error.message)
    return null
  }
  return data
}

/** Decrypt bytea → plaintext. Returns null on failure. */
export async function decryptPhi(cipherBytea) {
  if (!cipherBytea) return null
  const passphrase = key()
  if (!passphrase) return null
  const supabase = admin()
  const { data, error } = await supabase.rpc('decrypt_phi_text', {
    p_cipher: cipherBytea,
    p_passphrase: passphrase,
  })
  if (error) {
    console.warn('[phi-crypto] decrypt via RPC failed:', error.message)
    return null
  }
  return data
}

/** Preferred: read from encrypted column, fall back to plaintext.
 *  Also returns which source we used, for observability. */
export async function readMaybeEncrypted(cipherBytea, plainFallback) {
  if (cipherBytea) {
    const decrypted = await decryptPhi(cipherBytea)
    if (decrypted != null) return { value: decrypted, source: 'encrypted' }
  }
  return { value: plainFallback ?? null, source: plainFallback != null ? 'plain' : 'null' }
}
