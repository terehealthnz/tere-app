// Provider-agnostic outbound email helper. Wraps Resend (current default)
// and AWS SES v2 (cost + HIPAA-BAA replacement). All /api/* code should
// import { sendEmail } from './_email-client.js' instead of talking to
// Resend or SES directly — flips between the two are then a single env
// var (EMAIL_PROVIDER=ses|resend), no code push.
//
// Design decisions:
//   - EMAIL_PROVIDER env var, default 'resend' so the switch to SES is
//     opt-in and we can flip back in seconds if SES bounces spike.
//   - Same function signature regardless of provider — mirrors the
//     Resend SDK shape (from, to, replyTo, cc, bcc, subject, html, text,
//     attachments) so migrating existing call sites is a mechanical
//     search-replace.
//   - Attachments in SES: SES's Simple content type doesn't support
//     attachments — we build a MIME multipart/mixed message and hand it
//     to SendEmail as Raw. Minimal MIME builder in this file; avoids
//     pulling in nodemailer for something we do in a handful of endpoints.
//   - Region defaults to ap-southeast-2 (Sydney) — same region as our
//     Bedrock BAA-covered inference. Keeps data-residency story simple.
//   - Uses the credential provider chain (Vercel injects AWS_ACCESS_KEY_ID
//     + AWS_SECRET_ACCESS_KEY from the existing Tere IAM user that already
//     has Bedrock + SNS permissions).

const AWS_REGION = process.env.AWS_REGION || 'ap-southeast-2'

// Lazy-init both clients so cold starts don't pay the import cost for the
// provider they aren't using.
let resendCache = null
let sesCache = null

async function resend() {
  if (resendCache) return resendCache
  const { Resend } = await import('resend')
  resendCache = new Resend(process.env.RESEND_API_KEY)
  return resendCache
}

async function ses() {
  if (sesCache) return sesCache
  const { SESv2Client } = await import('@aws-sdk/client-sesv2')
  sesCache = new SESv2Client({ region: AWS_REGION })
  return sesCache
}

function currentProvider() {
  const p = String(process.env.EMAIL_PROVIDER || 'resend').toLowerCase()
  return p === 'ses' ? 'ses' : 'resend'
}

/**
 * True when the currently-configured provider has the credentials it
 * needs to send. Replaces per-endpoint `RESEND_API_KEY` guards, which
 * silently drop mail when EMAIL_PROVIDER=ses (SES cutover path).
 * Callers that need to short-circuit before doing expensive work
 * (e.g. PDF generation) should use this instead.
 */
export function hasEmailProvider() {
  if (currentProvider() === 'ses') {
    // SES uses the ambient AWS credential chain (AWS_ACCESS_KEY_ID +
    // AWS_SECRET_ACCESS_KEY, same as Bedrock + SNS). AWS_REGION has a
    // default in the client so it's not required.
    return Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
  }
  return Boolean(process.env.RESEND_API_KEY)
}

/**
 * Send an outbound email via the currently-configured provider.
 *
 * @param {object} p
 * @param {string} p.from            "Name <email@domain>" or "email@domain"
 * @param {string|string[]} p.to
 * @param {string} [p.replyTo]
 * @param {string|string[]} [p.cc]
 * @param {string|string[]} [p.bcc]
 * @param {string} p.subject
 * @param {string} [p.html]
 * @param {string} [p.text]
 * @param {Array<{filename: string, content: string|Buffer, contentType?: string}>} [p.attachments]
 * @returns {Promise<{ok: boolean, id?: string, provider: 'resend'|'ses', error?: string}>}
 */
export async function sendEmail(p) {
  const provider = currentProvider()
  try {
    if (provider === 'ses') return await sendViaSes(p)
    return await sendViaResend(p)
  } catch (e) {
    console.error(`[email-client] ${provider} send failed:`, e?.message || e)
    return { ok: false, provider, error: e?.message || 'send failed' }
  }
}

async function sendViaResend({ from, to, replyTo, cc, bcc, subject, html, text, attachments }) {
  const client = await resend()
  const res = await client.emails.send({
    from,
    to,
    ...(replyTo ? { replyTo } : {}),
    ...(cc ? { cc } : {}),
    ...(bcc ? { bcc } : {}),
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
    ...(attachments && attachments.length ? { attachments } : {}),
  })
  return { ok: true, id: res?.data?.id, provider: 'resend' }
}

async function sendViaSes({ from, to, replyTo, cc, bcc, subject, html, text, attachments }) {
  const client = await ses()
  const { SendEmailCommand } = await import('@aws-sdk/client-sesv2')

  const toArr  = arrayify(to)
  const ccArr  = arrayify(cc)
  const bccArr = arrayify(bcc)

  // Attachments path — SES's Simple content type doesn't support them,
  // so build a MIME multipart/mixed message and send as Raw.
  if (attachments && attachments.length) {
    const raw = buildRawMime({ from, to: toArr, cc: ccArr, bcc: bccArr, replyTo, subject, html, text, attachments })
    const cmd = new SendEmailCommand({
      FromEmailAddress: parseAddress(from).address,
      Destination: buildDestination(toArr, ccArr, bccArr),
      Content: { Raw: { Data: Buffer.from(raw, 'utf8') } },
      ...(replyTo ? { ReplyToAddresses: [replyTo] } : {}),
    })
    const res = await client.send(cmd)
    return { ok: true, id: res?.MessageId, provider: 'ses' }
  }

  // Simple content path — SES builds MIME for us; cheaper serialization.
  const cmd = new SendEmailCommand({
    FromEmailAddress: from,
    Destination: buildDestination(toArr, ccArr, bccArr),
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          ...(html ? { Html: { Data: html, Charset: 'UTF-8' } } : {}),
          ...(text ? { Text: { Data: text, Charset: 'UTF-8' } } : {}),
        },
      },
    },
    ...(replyTo ? { ReplyToAddresses: [replyTo] } : {}),
  })
  const res = await client.send(cmd)
  return { ok: true, id: res?.MessageId, provider: 'ses' }
}

function arrayify(v) {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

function buildDestination(to, cc, bcc) {
  return {
    ToAddresses: to,
    ...(cc.length ? { CcAddresses: cc } : {}),
    ...(bcc.length ? { BccAddresses: bcc } : {}),
  }
}

// Extract "email@domain" from "Name <email@domain>" — SES's Raw path
// wants the bare address in FromEmailAddress; the display name lives
// inside the raw MIME's From header we build below.
function parseAddress(addr) {
  const m = String(addr).match(/<([^>]+)>/)
  return { address: m ? m[1] : String(addr).trim() }
}

// Minimal RFC 5322 / MIME multipart builder. Handles multipart/mixed
// outer with multipart/alternative inner (text + html) plus base64
// attachments. Not a full MIME implementation — good enough for the
// endpoints we ship today (PDF-attached prescriptions/referrals/
// insurance receipts). If we ever need inline images (cid:) or S/MIME,
// swap for nodemailer's message builder.
function buildRawMime({ from, to, cc, bcc, replyTo, subject, html, text, attachments }) {
  const boundaryMixed = mimeBoundary('mixed')
  const boundaryAlt   = mimeBoundary('alt')
  const CRLF = '\r\n'

  const headers = [
    `From: ${sanitizeAddrHeader(from)}`,
    `To: ${to.map(sanitizeAddrHeader).join(', ')}`,
    ...(cc.length  ? [`Cc: ${cc.map(sanitizeAddrHeader).join(', ')}`] : []),
    ...(replyTo    ? [`Reply-To: ${sanitizeAddrHeader(replyTo)}`] : []),
    `Subject: ${encodeMimeHeader(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundaryMixed}"`,
  ]

  const parts = []
  // Body — alternative wrapping so text and html both offered.
  parts.push(`--${boundaryMixed}`)
  parts.push(`Content-Type: multipart/alternative; boundary="${boundaryAlt}"`)
  parts.push('')
  if (text) {
    parts.push(`--${boundaryAlt}`)
    parts.push('Content-Type: text/plain; charset=UTF-8')
    parts.push('Content-Transfer-Encoding: base64')
    parts.push('')
    parts.push(chunkBase64(Buffer.from(text, 'utf8').toString('base64')))
  }
  if (html) {
    parts.push(`--${boundaryAlt}`)
    parts.push('Content-Type: text/html; charset=UTF-8')
    parts.push('Content-Transfer-Encoding: base64')
    parts.push('')
    parts.push(chunkBase64(Buffer.from(html, 'utf8').toString('base64')))
  }
  parts.push(`--${boundaryAlt}--`)

  // Attachments
  for (const att of attachments) {
    const contentType = att.contentType || guessContentType(att.filename)
    // Sanitise filename: strip anything that could break the MIME header
    // (CR/LF, quotes, control chars). Attachment filenames are often
    // built from user-provided data (patient names, drug names) so the
    // boundary defence goes here rather than at every caller.
    const safeName = sanitizeMimeFilename(att.filename)
    const b64 = Buffer.isBuffer(att.content)
      ? att.content.toString('base64')
      : String(att.content)   // caller already passed base64 (common Resend pattern)
    parts.push(`--${boundaryMixed}`)
    parts.push(`Content-Type: ${contentType}; name="${safeName}"`)
    parts.push('Content-Transfer-Encoding: base64')
    parts.push(`Content-Disposition: attachment; filename="${safeName}"`)
    parts.push('')
    parts.push(chunkBase64(b64))
  }
  parts.push(`--${boundaryMixed}--`)

  return headers.join(CRLF) + CRLF + CRLF + parts.join(CRLF)
}

// Strip anything that could break out of the filename="..." field into
// a new MIME header (CR, LF, quotes, backslashes, other control chars).
// Falls back to 'attachment.bin' if the sanitised result is empty.
function sanitizeMimeFilename(name) {
  const s = String(name || '')
    .replace(/[\r\n\0]/g, '')       // header injection
    .replace(/["\\]/g, '_')          // break out of quoted string
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, '_') // other control chars
    .slice(0, 200)                   // sanity cap
    .trim()
  return s || 'attachment.bin'
}

function mimeBoundary(tag) {
  return `----=_${tag}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function chunkBase64(s) {
  // RFC 2045 requires base64 lines ≤ 76 chars.
  return s.match(/.{1,76}/g)?.join('\r\n') || s
}

function encodeMimeHeader(s) {
  // Encode non-ASCII subjects per RFC 2047 (=?UTF-8?B?...?=). ASCII-only
  // subjects pass through unchanged.
  // Strip CR/LF/NUL first — a CRLF anywhere in a header would let a caller
  // inject arbitrary MIME headers ("BCC: attacker@…") into the built raw
  // message. Belt-and-braces alongside the caller-side sanitizeSubject.
  const str = String(s || '').replace(/[\r\n\0]/g, '')
  if (/^[\x20-\x7E]*$/.test(str)) return str
  return `=?UTF-8?B?${Buffer.from(str, 'utf8').toString('base64')}?=`
}

// Strip CR/LF from addr headers (From/To/Cc/Reply-To). All callers today
// pass hardcoded addresses, but the raw MIME builder is used by any future
// endpoint that plugs in dynamic email addresses.
function sanitizeAddrHeader(s) {
  return String(s || '').replace(/[\r\n\0]/g, '')
}

function guessContentType(filename) {
  const ext = String(filename || '').toLowerCase().split('.').pop()
  return {
    pdf: 'application/pdf',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    heic: 'image/heic', webp: 'image/webp',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    html: 'text/html', htm: 'text/html',
  }[ext] || 'application/octet-stream'
}
