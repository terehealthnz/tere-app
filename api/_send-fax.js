// Provider-agnostic fax adapter. Telnyx is the default: same vendor as our voice
// stack (so one billing account, one dashboard, one BAA), modern REST DX, Sydney
// data centre for HIPP-friendly data residency, and per-page cost ~US$0.007 vs
// Documo's ~$0.07. Documo / InterFAX are retained as alternates so a swap later
// is a config change not a code change.
//
// Env vars:
//   FAX_PROVIDER       telnyx | documo | interfax  (default: telnyx)
//   FAX_API_KEY        Bearer/API key for the provider (required to actually send)
//   FAX_FROM_NUMBER    Caller-ID shown on the header (E.164). Recommended.
//                      Current Telnyx NZ DID: +6436672414 (pending auth review).
//   FAX_CONNECTION_ID  Telnyx-only: the Fax Application id in their portal.
//
// Callers get { ok, providerId, status } on success or { ok: false, error, retryable }
// on failure. When FAX_API_KEY is unset (dev, first bring-up) we return a
// "queued-manual" success so nothing silently disappears — the consultation row
// still records the intended destination for ops follow-up.

const DEFAULT_PROVIDER = 'telnyx'
const TELNYX_API_BASE = 'https://api.telnyx.com/v2'
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
  // Prefer FAX_API_KEY, fall back to TELNYX_API_KEY so operators only need to
  // set one V2 key when Telnyx is doing both fax and SMS.
  const apiKey = process.env.FAX_API_KEY || process.env.TELNYX_API_KEY

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
    if (provider === 'telnyx')   return await sendViaTelnyx({ apiKey, to: dest, pdf, filename, subject, tag })
    if (provider === 'documo')   return await sendViaDocumo({ apiKey, to: dest, pdf, filename, subject, tag })
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

// ── Telnyx ────────────────────────────────────────────────────────────────────
// Two-step: upload PDF to /v2/media (private, referenced by media_name), then
// POST /v2/faxes referencing that media_name. Keeps the PDF off any public URL
// so patient data isn't briefly world-readable during transit.
async function sendViaTelnyx({ apiKey, to, pdf, filename, subject, tag }) {
  const connectionId = process.env.FAX_CONNECTION_ID
  if (!connectionId) {
    return {
      ok: false,
      error: 'FAX_CONNECTION_ID not set (Telnyx Fax Application id from Portal → Programmable Fax → Applications)',
      provider: 'telnyx',
    }
  }
  const from = process.env.FAX_FROM_NUMBER
  if (!from) {
    return { ok: false, error: 'FAX_FROM_NUMBER (E.164) not set — Telnyx requires a from number matching a purchased DID', provider: 'telnyx' }
  }

  // 1. Upload PDF to /v2/media — returns a media_name we reference in the fax send.
  const mediaName = (filename || 'prescription.pdf').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64)
  const mediaForm = new FormData()
  mediaForm.append('media_name', mediaName)
  mediaForm.append('media', new Blob([pdf], { type: 'application/pdf' }), mediaName)
  const mediaRes = await fetch(`${TELNYX_API_BASE}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: mediaForm,
  })
  const mediaBody = await mediaRes.json().catch(() => ({}))
  if (!mediaRes.ok) {
    return {
      ok: false,
      error: mediaBody?.errors?.[0]?.detail || `Telnyx media upload HTTP ${mediaRes.status}`,
      retryable: mediaRes.status >= 500 || mediaRes.status === 429,
      provider: 'telnyx',
    }
  }
  const uploadedName = mediaBody?.data?.media_name || mediaName

  // 2. Queue the fax referencing the uploaded media.
  const body = {
    connection_id: connectionId,
    to,
    from,
    media_name: uploadedName,
    quality: 'high',
    ...(tag ? { client_state: Buffer.from(tag).toString('base64') } : {}),
  }
  const sendRes = await fetch(`${TELNYX_API_BASE}/faxes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const sendBody = await sendRes.json().catch(() => ({}))
  if (!sendRes.ok) {
    return {
      ok: false,
      error: sendBody?.errors?.[0]?.detail || `Telnyx fax queue HTTP ${sendRes.status}`,
      retryable: sendRes.status >= 500 || sendRes.status === 429,
      provider: 'telnyx',
    }
  }
  return {
    ok: true,
    providerId: sendBody?.data?.id || null,
    status: sendBody?.data?.status || 'queued',
    provider: 'telnyx',
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
