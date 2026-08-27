// NHI number format + checksum validation.
//
// NHI = National Health Index. Two formats currently in circulation:
//   Legacy (pre-2026): 3 letters + 4 digits, mod-11 checksum on digit 7
//                      Example: AAA1234
//   Extended (2026+):  3 letters + 4 alphanumerics, mod-23 checksum on char 7
//                      Example: AAA12BC
//
// Reference: HISO 10046 (NZ Health Information Standards Organisation).
//
// We accept either format. On any format failure we return { ok: false }
// with a reason — the caller decides whether to prompt for retry or
// silently allow the NHI API call to be the source of truth.

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
// Legacy mod-11 does NOT include I or O (avoid confusion with 1/0).
const LEGACY_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

export function validateNhi(raw) {
  const nhi = String(raw || '').trim().toUpperCase().replace(/\s+/g, '')
  if (!nhi) return { ok: false, reason: 'empty' }
  if (nhi.length !== 7) return { ok: false, reason: 'length' }

  // First 3 chars must be letters, no I/O in the legacy set.
  const [c1, c2, c3, c4, c5, c6, c7] = nhi
  if (!/^[A-Z]{3}$/.test(c1 + c2 + c3)) return { ok: false, reason: 'prefix_not_letters' }
  if ([c1, c2, c3].some(c => c === 'I' || c === 'O')) return { ok: false, reason: 'illegal_letter' }

  // Legacy: chars 4–7 all digits, mod-11 checksum on char 7.
  if (/^[0-9]{4}$/.test(nhi.slice(3))) {
    const sum =
      (LEGACY_LETTERS.indexOf(c1) + 1) * 7 +
      (LEGACY_LETTERS.indexOf(c2) + 1) * 6 +
      (LEGACY_LETTERS.indexOf(c3) + 1) * 5 +
      Number(c4) * 4 +
      Number(c5) * 3 +
      Number(c6) * 2
    const remainder = sum % 11
    const check = remainder === 0 ? 0 : 11 - remainder
    if (check === 10) return { ok: false, reason: 'checksum_reserved' }
    if (check !== Number(c7)) return { ok: false, reason: 'checksum' }
    return { ok: true, format: 'legacy', nhi }
  }

  // Extended: chars 4–6 alphanumeric, char 7 alphanumeric mod-23 checksum.
  if (/^[A-Z0-9]{4}$/.test(nhi.slice(3))) {
    // Alphabet excludes I and O; digits 0–9 come first then letters.
    const ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'  // 34 chars total, 23 used
    // HISO spec: extended checksum uses base-24 (23 valid + reserved).
    // NOTE: exact extended-checksum algorithm is not universally published;
    // pending final confirmation from HNZ we accept the format and defer
    // authoritative validation to the NHI API lookup call.
    void ALPHABET
    return { ok: true, format: 'extended', nhi, note: 'checksum_deferred_to_api' }
  }

  return { ok: false, reason: 'shape' }
}
