// SMS with pluggable provider — AWS SNS (default), Telnyx, or Twilio.
//
// Provider selection: SMS_PROVIDER env var (sns | telnyx | twilio). Falls
// back to the next configured provider if the primary is unconfigured.
// SNS is the preferred default because Tere already carries an AWS BAA
// for Bedrock — SMS content occasionally includes PHI (patient first name
// + provider + condition), so keeping the delivery under the same signed
// BAA is the tidiest compliance story.
//
// Env vars:
//   SNS:    AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION (already
//           set for Bedrock — the same IAM key needs `sns:Publish`)
//           SNS_SENDER_ID (optional; alphanumeric NZ sender ID)
//   Telnyx: TELNYX_SMS_API_KEY (or TELNYX_API_KEY), TELNYX_SMS_FROM_NUMBER
//           (or TELNYX_MESSAGING_PROFILE_ID for high-volume routing)
//   Twilio: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
//
// If nothing is configured, the endpoint returns { ok:true, skipped:true }
// so callers (initiate-call, async workflow) don't have to guard around it.

const DEFAULT_PROVIDER = 'sns'

function normaliseNZNumber(to) {
  const digits = String(to || '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('64')) return '+' + digits
  if (digits.startsWith('0')) return '+64' + digits.slice(1)
  return '+' + digits
}

async function sendSNS({ to, body }) {
  const region = process.env.AWS_REGION || 'ap-southeast-2'
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return { ok: false, skipped: true, reason: 'AWS credentials not configured' }
  }
  try {
    const { SNSClient, PublishCommand } = await import('@aws-sdk/client-sns')
    const client = new SNSClient({ region })
    const attributes = {
      // Transactional gets us higher-priority routing and no marketing throttling.
      'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
    }
    if (process.env.SNS_SENDER_ID) {
      attributes['AWS.SNS.SMS.SenderID'] = { DataType: 'String', StringValue: process.env.SNS_SENDER_ID }
    }
    const out = await client.send(new PublishCommand({
      PhoneNumber: to,
      Message: body,
      MessageAttributes: attributes,
    }))
    return { ok: true, id: out.MessageId, provider: 'sns' }
  } catch (e) {
    return { ok: false, error: e.message || 'SNS publish failed', provider: 'sns' }
  }
}

async function sendTelnyx({ to, body }) {
  const apiKey = process.env.TELNYX_SMS_API_KEY || process.env.TELNYX_API_KEY
  const from = process.env.TELNYX_SMS_FROM_NUMBER || process.env.TELNYX_FROM_NUMBER
  const profileId = process.env.TELNYX_MESSAGING_PROFILE_ID
  if (!apiKey || (!from && !profileId)) {
    return { ok: false, skipped: true, reason: 'Telnyx not configured' }
  }
  const payload = { to, text: body }
  if (profileId) payload.messaging_profile_id = profileId
  else payload.from = from
  const r = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) return { ok: false, error: data?.errors?.[0]?.detail || data?.error || `Telnyx ${r.status}`, provider: 'telnyx' }
  return { ok: true, id: data?.data?.id, provider: 'telnyx' }
}

async function sendTwilio({ to, body }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const from       = process.env.TWILIO_FROM_NUMBER
  if (!accountSid || !authToken || !from) {
    return { ok: false, skipped: true, reason: 'Twilio not configured' }
  }
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) return { ok: false, error: data?.message || `Twilio ${r.status}`, provider: 'twilio' }
  return { ok: true, id: data?.sid, provider: 'twilio' }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { to, message, type } = req.body || {}
  if (!to || !message) return res.status(400).json({ error: 'Missing to or message' })

  const normalised = normaliseNZNumber(to)
  if (!normalised) return res.status(400).json({ error: 'Invalid phone number' })

  const body = `[Tere Health] ${message}`

  // Provider selection — env override, then availability check. Order the
  // fallback chain so we always try the next configured provider if the
  // requested one is missing credentials.
  const SENDERS = { sns: sendSNS, telnyx: sendTelnyx, twilio: sendTwilio }
  const requested = (process.env.SMS_PROVIDER || DEFAULT_PROVIDER).toLowerCase()
  const order = [requested, ...Object.keys(SENDERS).filter(k => k !== requested)]

  try {
    let result = { skipped: true }
    for (const name of order) {
      const fn = SENDERS[name]
      if (!fn) continue
      const attempt = await fn({ to: normalised, body })
      if (!attempt.skipped) { result = attempt; break }
    }
    if (result.skipped) {
      console.log(JSON.stringify({ ts: new Date().toISOString(), type: 'sms_skipped', to: normalised.slice(-4), sms_type: type }))
      return res.status(200).json({ ok: true, skipped: true, reason: 'No SMS provider configured' })
    }
    if (!result.ok) return res.status(502).json({ error: result.error, provider: result.provider })
    return res.status(200).json({ ok: true, id: result.id, provider: result.provider })
  } catch (e) {
    console.error('[sms]', e)
    return res.status(500).json({ error: e.message })
  }
}
