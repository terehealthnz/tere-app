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
  // Telnyx does a live URL check when you save a Fax Application webhook.
  // Respond 200 to GET/OPTIONS/HEAD probes so the save succeeds. This is
  // safe — nothing is written and no PHI is exposed.
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true, endpoint: 'telnyx-inbound-fax', accepts: 'POST' })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // handler.js gives us req.body as a parsed JSON object AND we need the raw
  // string for signature verification. Reconstruct rawBody from the parsed
  // object — Telnyx JSON is canonical so this round-trips cleanly for their
  // signed messages when handler.js has already JSON.parsed.
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
  const parsed = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body) } catch { return {} } })() : (req.body || {})

  // Unsigned POSTs are treated as URL-verification probes — return 200
  // without acting. Real Telnyx webhooks always carry the signature
  // headers below, so this is a probe-only allowance, not a security
  // relaxation for actual event processing.
  const hasSignature = !!req.headers['telnyx-signature-ed25519']
  if (!hasSignature) {
    return res.status(200).json({ ok: true, probe: true })
  }

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

  // Extract clinical fields + attempt NHI patient match via Bedrock (Claude
  // Sonnet, vision). Failure here must not block the report from landing —
  // the report is safer in the queue-with-no-extraction than lost. Clinician
  // still confirms + signs off before the report is officially on the chart.
  const extraction = await extractReportFields(pdfBuf).catch(e => {
    console.error('[telnyx-inbound-fax] Bedrock extraction failed:', e.message)
    return { extraction_confidence: 'failed' }
  })

  let matchedPatientId = null
  const cleanNhi = (extraction.nhi || '').trim().toUpperCase().replace(/\s/g, '')
  if (cleanNhi && /^[A-Z]{3}\d{3}[A-Z\d]$|^[A-Z]{3}\d{4}$/.test(cleanNhi)) {
    try {
      const { data: match } = await supabase
        .from('patients')
        .select('id')
        .ilike('nhi', cleanNhi)
        .limit(2)
      if (match && match.length === 1) matchedPatientId = match[0].id
    } catch (e) {
      console.warn('[telnyx-inbound-fax] NHI lookup failed:', e.message)
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
      // Extracted fields — always populated when extraction succeeds, even
      // when the NHI didn't match a known patient.
      patient_nhi:            cleanNhi || null,
      patient_name_extracted: extraction.patient_name || null,
      patient_dob_extracted:  extraction.patient_dob || null,
      study_type:             extraction.study_type || null,
      study_date:             extraction.study_date || null,
      body_part:              extraction.body_part || null,
      clinical_impression:    extraction.clinical_impression || null,
      urgency:                extraction.urgency || null,
      extraction_confidence:  extraction.extraction_confidence || null,
      extracted_at:           new Date().toISOString(),
      // Auto-attach the report to the matched patient. Status stays
      // 'matched' (not 'reviewed') — clinician still signs off in the UI.
      patient_id: matchedPatientId,
      status:     matchedPatientId ? 'matched' : 'unmatched',
      matched_by: null,  // AI match, not a provider — provider sign-off flips this.
      matched_at: matchedPatientId ? new Date().toISOString() : null,
    })
    .select()
    .single()

  if (insertErr) {
    console.error('[telnyx-inbound-fax] insert failed:', insertErr.message)
    return res.status(500).json({ error: 'DB insert failed' })
  }

  // Notify providers so the queue doesn't sit unseen. Best-effort.
  try {
    const urgencyPrefix = extraction.urgency === 'critical' ? '🚨 CRITICAL: '
                        : extraction.urgency === 'urgent'   ? '⚠ URGENT: '
                        : ''
    const impressionLine = extraction.clinical_impression
      ? `\n\nImpression: ${extraction.clinical_impression}` : ''
    const matchLine = matchedPatientId
      ? '\n\nAuto-matched to a patient by NHI — please confirm in the Reports inbox before signing off.'
      : '\n\nCould not auto-match to a patient (no NHI or NHI not on file). Manual match required.'
    await supabase.from('provider_notifications').insert({
      from_name: 'Fax Inbox',
      subject:   `${urgencyPrefix}${extraction.study_type || 'Radiology'} report received${senderName ? ` from ${senderName}` : ''}`,
      body:      `Patient: ${extraction.patient_name || 'unknown'}${cleanNhi ? ` (NHI ${cleanNhi})` : ''}${impressionLine}${matchLine}`,
      is_pinned: extraction.urgency === 'critical' || extraction.urgency === 'urgent',
    })
  } catch (e) {
    console.warn('[telnyx-inbound-fax] notify failed:', e.message)
  }

  return res.status(200).json({ ok: true, id: row?.id, matched: !!matchedPatientId })
}

// ── Bedrock vision extraction ────────────────────────────────────────────────
// Calls Claude Sonnet via Bedrock APAC (BAA-covered — never api.anthropic.com)
// and returns the structured fields we want to auto-populate on the report.
async function extractReportFields(pdfBuf) {
  const AnthropicBedrock = (await import('@anthropic-ai/bedrock-sdk')).default
  const client = new AnthropicBedrock({
    awsRegion:    process.env.AWS_REGION       || 'ap-southeast-2',
    awsAccessKey: process.env.AWS_ACCESS_KEY_ID,
    awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  })

  const model = process.env.BEDROCK_MODEL_SONNET
    || 'apac.anthropic.claude-sonnet-4-20250514-v1:0'

  const pdfBase64 = pdfBuf.toString('base64')

  const prompt = `You are extracting structured data from a New Zealand radiology report faxed to a telehealth clinic. Return ONLY a JSON object with these keys, no markdown fences:

{
  "nhi": "<7-character NZ National Health Index (3 letters + 4 chars, e.g. ABC1234), or null if not present>",
  "patient_name": "<full patient name as written, or null>",
  "patient_dob": "<YYYY-MM-DD, or null>",
  "study_type": "<X-ray, Ultrasound, CT, MRI, Mammogram, etc., or null>",
  "study_date": "<YYYY-MM-DD, or null>",
  "body_part": "<short description e.g. 'left wrist', 'chest', 'abdomen', or null>",
  "clinical_impression": "<one-sentence radiologist impression, or null>",
  "urgency": "<one of: normal, routine, urgent, critical — infer from the impression. Use 'critical' only for time-critical findings like acute intracranial haemorrhage, tension pneumothorax, aortic dissection. Use 'urgent' for fractures needing prompt referral, suspected malignancy, etc.>",
  "extraction_confidence": "<one of: high, medium, low — 'high' when all fields extracted with certainty; 'low' if the fax is poor quality or fields are ambiguous>"
}`

  const response = await client.messages.create({
    model,
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
        },
        { type: 'text', text: prompt },
      ],
    }],
  })

  const text = response?.content?.[0]?.text || ''
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  const parsed = JSON.parse(stripped)
  return parsed || {}
}
