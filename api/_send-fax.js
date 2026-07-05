// Provider-agnostic fax adapter. Documo (mFax) is the default because it has the
// cleanest modern REST API and healthcare-tuned compliance; the abstraction is
// deliberately thin so InterFAX / Sinch / Kordia can slot in via env vars later
// without touching call sites in _generate-prescription-pdf.js.
//
// Env vars:
//   FAX_PROVIDER    documo | interfax | none  (default: documo)
//   FAX_API_KEY     Bearer/API key for the provider (required to actually send)
//   FAX_FROM_NUMBER Optional caller-ID (E.164) shown on the header — recommended
//
// Callers get { ok, providerId, status } on success or { ok: false, error, retryable }
// on failure. When FAX_API_KEY is unset (dev, first bring-up) we return a
// "queued-manual" success so nothing silently disappears — the consultation row
// still records the intended destination for ops follow-up.

const DEFAULT_PROVIDER = 'documo'
const DOCUMO_API = 'https://api.documo.com/v1/faxes'

/**
 * Send a PDF prescription to a pharmacy fax number.
 * @param {Object}  args
 * @param {string}  args.to          E.164 or NZ-local fax number (+64...).
 * @param {Buffer}  args.pdf         PDF bytes to fax.
 * @param {string}  args.filename    Filename hint (e.g. `rx-2026-07-05-123.pdf`).
 * @param {string} [args.subject]    Cover text / tag shown on the header.
 * @param {string} [args.tag]        Free-text tag persisted on the fax record.
 * @returns {Promise<{ok:boolean, providerId?:string, status?:string, error?:string, retryable?:boolean, provider:string}>}
 */
export async function sendFax({ to, pdf, filename, subject, tag }) {
  const provider = (process.env.FAX_PROVIDER || DEFAULT_PROVIDER).toLowerCase()
  const apiKey = process.env.FAX_API_KEY

  if (!to || !to.trim()) return { ok: false, error: 'no destination fax number', provider }
  if (!pdf) return { ok: false, error: 'no PDF supplied', provider }

  if (!apiKey) {
    // Deliberate "not configured" branch — surface it so ops can pick up manually
    // rather than losing the send. The prescription is still generated and stored.
    console.warn('[fax] FAX_API_KEY not set — returning queued-manual for', to)
    return { ok: true, providerId: null, status: 'queued-manual', provider }
  }

  const dest = normaliseNzFax(to)

  try {
    if (provider === 'documo') return await sendViaDocumo({ apiKey, to: dest, pdf, filename, subject, tag })
    if (provider === 'interfax') return await sendViaInterfax({ apiKey, to: dest, pdf, filename, subject, tag })
    return { ok: false, error: `unknown FAX_PROVIDER "${provider}"`, provider }
  } catch (e) {
    return {
      ok: false,
      error: e?.message || String(e),
      retryable: true, // network / 5xx — worth retrying
      provider,
    }
  }
}

// ── Documo (mFax) ─────────────────────────────────────────────────────────────
async function sendViaDocumo({ apiKey, to, pdf, filename, subject, tag }) {
  const form = new FormData()
  form.append('recipients[0][faxNumber]', to)
  if (subject) form.append('subject', subject.slice(0, 200))
  if (tag) form.append('tags[]', tag.slice(0, 100))
  if (process.env.FAX_FROM_NUMBER) form.append('sendFromNumber', process.env.FAX_FROM_NUMBER)
  form.append(
    'attachments',
    new Blob([pdf], { type: 'application/pdf' }),
    filename || 'prescription.pdf',
  )

  const res = await fetch(DOCUMO_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    return {
      ok: false,
      error: body?.message || `Documo HTTP ${res.status}`,
      retryable: res.status >= 500 || res.status === 429,
      provider: 'documo',
    }
  }
  return {
    ok: true,
    providerId: body?.data?.id || body?.id || null,
    status: body?.data?.status || 'queued',
    provider: 'documo',
  }
}

// ── InterFAX (thin fallback — same shape) ────────────────────────────────────
async function sendViaInterfax({ apiKey, to, pdf, filename, subject, tag }) {
  const url = `https://rest.interfax.net/outbound/faxes?faxNumber=${encodeURIComponent(to)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(apiKey).toString('base64')}`,
      'Content-Type': 'application/pdf',
    },
    body: pdf,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return {
      ok: false,
      error: text || `InterFAX HTTP ${res.status}`,
      retryable: res.status >= 500 || res.status === 429,
      provider: 'interfax',
    }
  }
  return {
    ok: true,
    providerId: res.headers.get('Location') || null,
    status: 'queued',
    provider: 'interfax',
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
/** Loose NZ fax normaliser. Accepts 03..., (03)..., 0800..., or +64..., returns +64...
 *  Passes through anything already E.164. Purely defensive — Documo accepts local
 *  format too, but we log the cleaned version. */
export function normaliseNzFax(raw) {
  if (!raw) return raw
  const stripped = String(raw).replace(/[^\d+]/g, '')
  if (stripped.startsWith('+')) return stripped
  if (stripped.startsWith('64')) return '+' + stripped
  if (stripped.startsWith('0')) return '+64' + stripped.slice(1)
  return stripped
}
