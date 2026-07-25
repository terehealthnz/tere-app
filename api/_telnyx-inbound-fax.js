// _telnyx-inbound-fax.js — receive an inbound fax from Telnyx and file it.
//
// POST /api/telnyx-inbound-fax
//
// Webhook, not auth-required (Telnyx doesn't send auth headers). Security is
// via Ed25519 signature verification using Telnyx's Public Key — the same
// pattern their SIP + Messaging webhooks use.
//
// Configure in Telnyx Portal → Programmable Fax → your Fax Application:
//   Inbound Webhook URL: https://terehealth.co.nz/api/telnyx-inbound-fax
//   Webhook API Version: 2
//   Webhook Failover: (leave blank or set to a monitoring URL)
//
// Ensure TELNYX_PUBLIC_KEY + TELNYX_API_KEY are set in Vercel env vars.
//
// Flow: verify signature → download PDF from event.data.payload.media_url
// using Telnyx auth → upload to Supabase Storage bucket `radiology-reports`
// → insert row in radiology_reports (idempotent on telnyx_fax_id) → done.

import { createClient } from '@supabase/supabase-js'
import { createPublicKey, verify as verifyEd25519 } from 'node:crypto'

function admin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// Telnyx signs each webhook with Ed25519. Signature is base64 in the
// telnyx-signature-ed25519 header; timestamp in telnyx-timestamp. The
// signed message is `${timestamp}|${rawBody}`.
function verifyTelnyxSignature({ signatureB64, timestamp, rawBody, publicKeyPem }) {
  if (!signatureB64 || !timestamp || !publicKeyPem) return false
  // Reject stale timestamps (> 5 min old) to block replay attacks.
  const skew = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(skew) || skew > 300) return false
  try {
    const signature = Buffer.from(signatureB64, 'base64')
    const message = Buffer.from(`${timestamp}|${rawBody}`, 'utf8')
    const key = createPublicKey({ key: publicKeyPem, format: 'pem' })
    return verifyEd25519(null, message, key, signature)
  } catch {
    return false
  }
}

// Telnyx public keys are distributed as raw base64 (32 bytes). If they hand
// out a PEM directly, use it as-is. Else wrap the raw key.
function normalisePublicKey(raw) {
  if (!raw) return null
  const trimmed = raw.trim()
  if (trimmed.startsWith('-----BEGIN')) return trimmed
  // Raw 32-byte base64 → wrap into a minimal Ed25519 PEM.
  // The DER prefix for Ed25519 SPKI is: 302a300506032b6570032100.
  const derPrefix = Buffer.from('302a300506032b6570032100', 'hex')
  const keyBytes = Buffer.from(trimmed, 'base64')
  if (keyBytes.length !== 32) return null
  const spki = Buffer.concat([derPrefix, keyBytes]).toString('base64')
  const wrapped = spki.match(/.{1,64}/g).join('\n')
  return `-----BEGIN PUBLIC KEY-----\n${wrapped}\n-----END PUBLIC KEY-----\n`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // handler.js gives us req.body as a parsed JSON object AND we need the raw
  // string for signature verification. Reconstruct rawBody from the parsed
  // object — Telnyx JSON is canonical so this round-trips cleanly for their
  // signed messages when handler.js has already JSON.parsed.
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
  const parsed = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body) } catch { return {} } })() : (req.body || {})

  const publicKey = normalisePublicKey(process.env.TELNYX_PUBLIC_KEY)
  const signatureOk = verifyTelnyxSignature({
    signatureB64: req.headers['telnyx-signature-ed25519'],
    timestamp:    req.headers['telnyx-timestamp'],
    rawBody,
    publicKeyPem: publicKey,
  })

  if (!signatureOk) {
    console.warn('[telnyx-inbound-fax] signature verification failed')
    return res.status(401).json({ error: 'Invalid signature' })
  }

  const eventType = parsed?.data?.event_type
  const payload   = parsed?.data?.payload || {}

  // Only act on the "media available" event. Ignore status pings.
  if (eventType !== 'fax.received') {
    return res.status(200).json({ ok: true, ignored: eventType })
  }

  const telnyxFaxId = payload.fax_id || payload.id
  const mediaUrl    = payload.media_url
  const fromNumber  = payload.from
  const pageCount   = payload.page_count || null

  if (!telnyxFaxId || !mediaUrl) {
    return res.status(400).json({ error: 'Missing fax_id or media_url' })
  }

  const supabase = admin()

  // Idempotency — if we've seen this fax_id before, bail early.
  const { data: existing } = await supabase
    .from('radiology_reports')
    .select('id')
    .eq('telnyx_fax_id', telnyxFaxId)
    .maybeSingle()
  if (existing) return res.status(200).json({ ok: true, deduped: true, id: existing.id })

  // Download the PDF from Telnyx (their media URLs require API-key auth).
  let pdfBuf, byteSize, contentType
  try {
    const r = await fetch(mediaUrl, {
      headers: { 'Authorization': `Bearer ${process.env.TELNYX_API_KEY}` },
    })
    if (!r.ok) throw new Error(`Telnyx media fetch ${r.status}`)
    const buf = Buffer.from(await r.arrayBuffer())
    pdfBuf = buf
    byteSize = buf.byteLength
    contentType = r.headers.get('content-type') || 'application/pdf'
  } catch (e) {
    console.error('[telnyx-inbound-fax] media download failed:', e.message)
    return res.status(502).json({ error: 'Media download failed' })
  }

  // Store under a date-partitioned key so listing/backup is sane.
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  const storagePath = `${y}/${m}/${d}/${telnyxFaxId}.pdf`

  const { error: uploadErr } = await supabase.storage
    .from('radiology-reports')
    .upload(storagePath, pdfBuf, {
      contentType,
      upsert: true,   // safe — the dedup check above is the real guard
    })

  if (uploadErr) {
    console.error('[telnyx-inbound-fax] storage upload failed:', uploadErr.message)
    return res.status(500).json({ error: 'Storage upload failed' })
  }

  // Try to hint at the sender by matching caller ID against known radiology
  // providers. If no match, leave sender_name null — provider will fill in.
  let senderName = null
  if (fromNumber) {
    try {
      const { data: match } = await supabase
        .from('radiology_referrals')
        .select('facility_name')
        .ilike('facility_fax', `%${fromNumber.replace(/\D/g, '').slice(-7)}%`)
        .limit(1)
        .maybeSingle()
      senderName = match?.facility_name || null
    } catch {
      // radiology_referrals may not have facility_fax; ignore.
    }
  }

  const { data: row, error: insertErr } = await supabase
    .from('radiology_reports')
    .insert({
      telnyx_fax_id:  telnyxFaxId,
      received_at:    payload.received_at || new Date().toISOString(),
      sender_number:  fromNumber || null,
      sender_name:    senderName,
      page_count:     pageCount,
      storage_path:   storagePath,
      byte_size:      byteSize,
      status:         'unmatched',
    })
    .select()
    .single()

  if (insertErr) {
    console.error('[telnyx-inbound-fax] insert failed:', insertErr.message)
    return res.status(500).json({ error: 'DB insert failed' })
  }

  // Notify providers so the queue doesn't sit unseen. Best-effort.
  try {
    await supabase.from('provider_notifications').insert({
      from_name: 'Fax Inbox',
      subject:   `New radiology report received${senderName ? ` from ${senderName}` : ''}`,
      body:      `A new fax report (${pageCount || '?'} page${pageCount === 1 ? '' : 's'}) has arrived. Open the Reports inbox to review and match to a patient.`,
      is_pinned: false,
    })
  } catch (e) {
    console.warn('[telnyx-inbound-fax] notify failed:', e.message)
  }

  return res.status(200).json({ ok: true, id: row?.id })
}
