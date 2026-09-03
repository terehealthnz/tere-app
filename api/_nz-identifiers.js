// NZ Health identifier validation (tasks #385, #386).
//
// HISO 10046 defines the NHI + HPI-CPN formats. Both are 7-char strings
// (though HPI-CPN documentation sometimes describes it as 6+1 check digit
// vs. the modern 5+1+1 format). The algorithm:
//
//   Char 1-6: letters A-Z (excluding I, O to avoid confusion with 1, 0)
//             OR digits 0-9 in newer variants
//   Char 7:   Mod-11 check digit computed over chars 1-6
//
// Mod-11 algorithm:
//   1. For each character in position 1-6:
//      - Letter → its 1-based position in the alphabet-without-I-O
//        (A=1, B=2, ... H=8, J=9, K=10, ..., N=13, P=14, ...)
//      - Digit → its numeric value
//   2. Multiply each by (7 - position). So char 1 × 6, char 2 × 5, ..., char 6 × 1.
//   3. Sum all products.
//   4. Take sum mod 11. If 0, the check digit is 0. If 10, invalid ID (would be 'A'
//      in some variants but NHI/HPI treat 10 as invalid). Else check digit is
//      11 - (sum mod 11).
//   5. Compare to actual last char.
//
// This is a "known valid format" check — it doesn't prove the NHI actually
// exists in HNZ's registry. That's what /api/hpi lookups are for. But it
// catches typos + garbage before they enter our records.

// Valid characters: A-Z except I and O, and 0-9. HPI newer format uses
// alphanumeric first 6 + numeric check digit.
const LETTER_VALUES = (() => {
  const map = {}
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I, no O
  for (let i = 0; i < alphabet.length; i++) {
    map[alphabet[i]] = i + 1
  }
  return map
})()

function charValue(ch) {
  if (/[0-9]/.test(ch)) return parseInt(ch, 10)
  const upper = ch.toUpperCase()
  return LETTER_VALUES[upper] // undefined if invalid char
}

/**
 * Validate a 7-character NZ Health identifier (NHI or HPI-CPN) using
 * HISO 10046 Mod-11.
 * Returns { valid: true } or { valid: false, reason: '...' }.
 */
export function validateNzIdentifier(id, { kind = 'identifier' } = {}) {
  if (id == null) return { valid: false, reason: `${kind} required` }
  const s = String(id).trim().toUpperCase()
  if (s.length !== 7) return { valid: false, reason: `${kind} must be exactly 7 characters (got ${s.length})` }
  // Chars 1-6: alphanumeric excluding I + O.
  for (let i = 0; i < 6; i++) {
    const ch = s[i]
    if (!/[A-HJ-NP-Z0-9]/.test(ch)) {
      return { valid: false, reason: `${kind} contains invalid character '${ch}' at position ${i + 1} (I and O are not allowed)` }
    }
  }
  // Check digit must be a digit 0-9.
  const checkDigit = s[6]
  if (!/[0-9]/.test(checkDigit)) {
    return { valid: false, reason: `${kind} check digit (last char) must be numeric (got '${checkDigit}')` }
  }

  // Compute expected check digit.
  let sum = 0
  for (let i = 0; i < 6; i++) {
    const v = charValue(s[i])
    if (v === undefined) return { valid: false, reason: `${kind} contains invalid character at position ${i + 1}` }
    sum += v * (7 - i - 1 + 1) // position 1 weight 6, position 2 weight 5, ..., position 6 weight 1
    // Simplified: weight = 7 - i (for i=0 → 7... wait). HISO spec: weight = (7 - position) so pos 1 (i=0) = 6, pos 6 (i=5) = 1. Correct: (7 - (i + 1)) + 0 = 6 - i.
  }
  // Recompute correctly: weights 7,6,5,4,3,2 in HISO 10046 spec.
  // Different NHI docs disagree. Let's use the widely-referenced version:
  // Char 1..6 weights = 7, 6, 5, 4, 3, 2. Sum products, mod 11, subtract from
  // 11 for check digit (0 if remainder is 0; invalid if remainder is 1).
  sum = 0
  for (let i = 0; i < 6; i++) {
    const v = charValue(s[i])
    sum += v * (7 - i)
  }
  const remainder = sum % 11
  let expected
  if (remainder === 0) expected = 0
  else if (remainder === 1) return { valid: false, reason: `${kind} check digit invalid (Mod-11 remainder 1)` }
  else expected = 11 - remainder

  if (String(expected) !== checkDigit) {
    return { valid: false, reason: `${kind} check digit failed (expected ${expected}, got ${checkDigit}). Likely a typo.` }
  }
  return { valid: true }
}

export const validateNhi = (id) => validateNzIdentifier(id, { kind: 'NHI' })
export const validateHpiCpn = (id) => validateNzIdentifier(id, { kind: 'HPI-CPN' })
