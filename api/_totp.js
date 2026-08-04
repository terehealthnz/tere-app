// RFC 6238 TOTP (Time-based One-Time Password) — HMAC-SHA1, 30s step, 6 digits.
//
// Written inline to avoid adding an npm dependency for ~50 lines of well-
// specified algorithm. Compatible with Google Authenticator, Authy,
// 1Password, iOS Passwords, etc.

import crypto from 'crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'  // RFC 4648 base32

// Generate a random base32-encoded secret (20 bytes → 32 chars, ~160 bits).
export function generateSecret() {
  const bytes = crypto.randomBytes(20)
  let out = ''
  let bits = 0
  let value = 0
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

// Base32 decode → Buffer. Ignores padding and whitespace/dashes.
function base32Decode(s) {
  const cleaned = String(s || '').toUpperCase().replace(/[^A-Z2-7]/g, '')
  const bytes = []
  let bits = 0
  let value = 0
  for (const ch of cleaned) {
    const idx = ALPHABET.indexOf(ch)
    if (idx < 0) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xFF)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

// Compute the 6-digit code for a given (secret, counter). Counter =
// floor(unixSeconds / 30) for standard 30-second TOTP.
export function totpAt(secretBase32, counter) {
  const key = base32Decode(secretBase32)
  // Counter as 8-byte big-endian.
  const cbuf = Buffer.alloc(8)
  cbuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  cbuf.writeUInt32BE(counter >>> 0, 4)
  const hmac = crypto.createHmac('sha1', key).update(cbuf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const bin = ((hmac[offset] & 0x7f) << 24)
            | ((hmac[offset + 1] & 0xff) << 16)
            | ((hmac[offset + 2] & 0xff) << 8)
            | (hmac[offset + 3] & 0xff)
  return String(bin % 1000000).padStart(6, '0')
}

// Verify a user-entered code against the current time window plus one
// step either side (to allow for small clock drift).
export function verifyTotp(secretBase32, code) {
  const cleaned = String(code || '').replace(/\s+/g, '')
  if (!/^\d{6}$/.test(cleaned)) return false
  const now = Math.floor(Date.now() / 1000 / 30)
  for (const delta of [-1, 0, 1]) {
    if (totpAt(secretBase32, now + delta) === cleaned) return true
  }
  return false
}

// Build the otpauth:// URI so the provider can add the entry to their
// authenticator app. `label` is displayed in the app; `issuer` shows as
// the account provider.
export function otpauthUrl({ secretBase32, label, issuer = 'Tere Health' }) {
  const encLabel = encodeURIComponent(`${issuer}:${label}`)
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  })
  return `otpauth://totp/${encLabel}?${params.toString()}`
}
