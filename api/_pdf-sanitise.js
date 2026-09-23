// PDF active-content scanner.
//
// Closes Blacklock WEB-0923-0618186646 (Lack of File Upload Validation).
// Blacklock uploaded a Medical Indemnity Certificate PDF containing
// embedded JavaScript; when an admin opened the signed URL, pdf.js
// executed the script (XSS-in-viewer at the terehealth.co.nz origin).
//
// This helper looks for six PDF dictionary keys that carry active
// content when the file is opened:
//
//   /JavaScript, /JS        — inline script
//   /OpenAction, /AA        — auto-run actions on open / on trigger
//   /Launch                 — launch an external program (file:// etc.)
//   /EmbeddedFile           — attached secondary file (payload delivery)
//
// The scan is a bytewise regex — good enough because these are all
// name-object markers that appear literally in the file byte stream
// even when the PDF is compressed. A rewritten PDF that hides the
// marker inside an object stream (obj / endobj) would need a full
// parse to detect, which is out of scope. This gate blocks the direct
// weaponisation vector Blacklock demonstrated without introducing a
// PDF-parsing dependency.
//
// Legitimate certificates from insurers do not contain any of these
// markers. If a real upload is ever blocked, insurers can re-export
// via Print-to-PDF and the flat file will pass.

const ACTIVE_CONTENT_MARKERS = [
  '/JavaScript',
  '/JS',
  '/OpenAction',
  '/AA',
  '/Launch',
  '/EmbeddedFile',
]

/**
 * Scan a PDF buffer for active-content markers.
 * @param {Buffer} buf  — the decoded PDF bytes
 * @returns {{ safe: boolean, found?: string }}
 */
export function scanPdfForActiveContent(buf) {
  if (!buf || !buf.length) return { safe: true }
  // Latin-1 preserves every byte 0x00..0xFF as a distinct char, so string
  // matching against ASCII markers works even in a binary payload.
  const text = buf.toString('latin1')
  for (const marker of ACTIVE_CONTENT_MARKERS) {
    if (text.includes(marker)) {
      return { safe: false, found: marker }
    }
  }
  return { safe: true }
}

/**
 * Convenience: throw a 400-shaped error object if the PDF contains
 * active content. Callers can use this to keep the guard to one line.
 *
 * @throws { status: 400, message: string } — caller catches and responds
 */
export function assertPdfSafe(buf) {
  const result = scanPdfForActiveContent(buf)
  if (result.safe) return
  const e = new Error(
    `PDF contains active content (${result.found}). ` +
    'Please export a flat/print copy without embedded scripts and re-upload.'
  )
  e.status = 400
  throw e
}
