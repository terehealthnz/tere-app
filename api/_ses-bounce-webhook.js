// /api/ses-bounce-webhook - SNS webhook for SES bounce + complaint events.
//
// Subscribed by SES notifications topic (set
// SES_SNS_SUBSCRIPTION_TOPIC_ARN in Vercel). On a permanent-bounce event,
// resolves the bounced address back to the facility it was addressed to,
// flips employers.delivery_status to 'bounced' + records the SES reason,
// pages Patrick by SMS + emails hello@terehealth.co.nz. Soft bounces just
// log and move on.
//
// Signature verification:
//   SNS messages carry SigningCertURL + Signature. We verify the signature
//   against the fetched cert (AWS public X.509) before trusting anything in
//   the payload. Cert URL must be under sns.*.amazonaws.com and https. The
//   TopicArn on the message must match SES_SNS_SUBSCRIPTION_TOPIC_ARN so a
//   different (attacker-owned) SNS topic cannot post forged events into our
//   webhook even with a valid AWS signature.
//
// Subscription confirmation:
//   First message is type SubscriptionConfirmation. After signature + topic
//   checks pass, we GET the SubscribeURL (AWS-hosted) to complete the
//   handshake. The URL is only accepted if it's under sns.*.amazonaws.com.
//
// Vercel body parsing:
//   SNS posts JSON bodies but with Content-Type text/plain; by default. The
//   repo-wide handler.js disables bodyParser, so we parse the raw stream
//   ourselves here.

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, hasEmailProvider } from './_email-client.js'
import { writeAuditEvent } from './_audit-write.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// Gather raw body - handler.js leaves req as a Node stream.
async function readRawBody(req) {
  if (req.body && typeof req.body === 'string') return req.body
  if (req.body && Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  const chunks = []
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
  return Buffer.concat(chunks).toString('utf8')
}

// AWS SNS signing-cert host allowlist. SNS publishes from sns.<region>.
// amazonaws.com; any other host is rejected to block SSRF / forged certs.
function isAwsCertHost(hostname) {
  if (!hostname || typeof hostname !== 'string') return false
  return /^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(hostname.toLowerCase())
}

// Build the exact canonical string SNS signs. Key order + newline separators
// are documented by AWS: for Notification / SubscriptionConfirmation /
// UnsubscribeConfirmation the fields in alpha order are hashed.
// See docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
function canonicalStringForMessage(msg) {
  const type = msg.Type
  let fields
  if (type === 'Notification') {
    fields = msg.Subject !== undefined
      ? ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type']
      : ['Message', 'MessageId', 'Timestamp', 'TopicArn', 'Type']
  } else if (type === 'SubscriptionConfirmation' || type === 'UnsubscribeConfirmation') {
    fields = ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type']
  } else {
    return null
  }
  let out = ''
  for (const f of fields) {
    if (msg[f] === undefined || msg[f] === null) continue
    out += `${f}\n${msg[f]}\n`
  }
  return out
}

// Fetch + cache the AWS signing cert. 5-minute cache per cert URL - AWS
// rotates these but the same cert services thousands of messages.
const certCache = new Map()
async function fetchSigningCert(url) {
  const now = Date.now()
  const cached = certCache.get(url)
  if (cached && cached.expiresAt > now) return cached.pem
  const r = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (!r.ok) throw new Error(`cert fetch ${r.status}`)
  const pem = await r.text()
  certCache.set(url, { pem, expiresAt: now + 5 * 60 * 1000 })
  return pem
}

async function verifySnsSignature(msg) {
  const certUrl = msg.SigningCertURL
  if (!certUrl) return { ok: false, reason: 'no_cert_url' }
  let u
  try { u = new URL(certUrl) } catch { return { ok: false, reason: 'bad_cert_url' } }
  if (u.protocol !== 'https:') return { ok: false, reason: 'cert_url_not_https' }
  if (!isAwsCertHost(u.hostname)) return { ok: false, reason: 'cert_host_not_sns' }

  const canonical = canonicalStringForMessage(msg)
  if (!canonical) return { ok: false, reason: 'unsupported_message_type' }

  let pem
  try { pem = await fetchSigningCert(certUrl) }
  catch (e) { return { ok: false, reason: 'cert_fetch_failed: ' + e.message } }

  const signature = Buffer.from(String(msg.Signature || ''), 'base64')
  const algo = msg.SignatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1'
  try {
    const verifier = crypto.createVerify(algo)
    verifier.update(canonical, 'utf8')
    const ok = verifier.verify(pem, signature)
    return ok ? { ok: true } : { ok: false, reason: 'bad_signature' }
  } catch (e) {
    return { ok: false, reason: 'verify_error: ' + e.message }
  }
}

function maskEmail(email) {
  if (!email || typeof email !== 'string') return '(unknown)'
  const [local, domain] = email.split('@')
  if (!domain) return '(unknown)'
  return `${local.slice(0, 2)}***@${domain}`
}

async function pageAdminOnBounce({ facility, bouncedAddress, bounceType, bounceReason }) {
  // Email hello@ - always fires. Reads provider mobile for SMS as a
  // best-effort alert on top.
  try {
    await sendEmail({
      from: 'Tere Health <hello@terehealth.co.nz>',
      to:   'hello@terehealth.co.nz',
      subject: `[ARC bounce] ${facility?.company_name || 'facility'} - ${bouncedAddress}`,
      html: `
        <p>A monthly report to <strong>${facility?.company_name || '(unknown facility)'}</strong> bounced.</p>
        <p><strong>Address:</strong> ${bouncedAddress}<br/>
           <strong>Bounce type:</strong> ${bounceType || '-'}<br/>
           <strong>Reason:</strong> ${bounceReason || '-'}</p>
        <p>delivery_status has been flipped to <code>bounced</code>. The next monthly cron will skip this facility until an admin updates the contact and clears the flag in the Admin panel.</p>
      `,
    })
  } catch (e) { console.warn('[ses-bounce] hello@ email failed:', e?.message) }

  // SMS Patrick's mobile via providers.mobile_phone (confirmed column name
  // per repo grep; also used by _resend-prescription.js and
  // _generate-prescription-pdf.js).
  try {
    const supabase = admin()
    const { data: patrick } = await supabase
      .from('providers')
      .select('mobile_phone')
      .eq('email', 'patrickherling@gmail.com')
      .maybeSingle()
    const to = patrick?.mobile_phone
    if (to) {
      const { sendSms } = await import('./_sms.js')
      await sendSms({ to, body: `Tere: ARC monthly report to ${facility?.company_name || 'facility'} bounced (${bouncedAddress}). delivery_status=bounced. Fix contact + clear in Admin to resume.` })
    }
  } catch (e) { console.warn('[ses-bounce] Patrick SMS failed:', e?.message) }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Vercel + SNS: parse body ourselves (text/plain + handler-wide no body
  // parsing).
  let rawBody
  try { rawBody = await readRawBody(req) } catch { return res.status(400).json({ error: 'body read failed' }) }
  let msg
  try { msg = JSON.parse(rawBody) } catch { return res.status(400).json({ error: 'invalid json' }) }

  // Topic ARN must match our configured subscription topic. Defence in
  // depth: even if SNS signature verification somehow passed, a message
  // addressed to a different topic cannot flip facility state.
  const expectedTopic = process.env.SES_SNS_SUBSCRIPTION_TOPIC_ARN
  if (expectedTopic && msg.TopicArn && msg.TopicArn !== expectedTopic) {
    console.warn('[ses-bounce] topic mismatch:', msg.TopicArn, '!=', expectedTopic)
    return res.status(403).json({ error: 'TopicArn mismatch' })
  }

  // Verify the SNS signature before trusting ANY field on the message.
  const sig = await verifySnsSignature(msg)
  if (!sig.ok) {
    console.warn('[ses-bounce] signature rejected:', sig.reason, 'type=', msg.Type)
    return res.status(403).json({ error: 'Signature verification failed' })
  }

  // SubscriptionConfirmation: complete the handshake. SubscribeURL host
  // must also be an SNS host.
  if (msg.Type === 'SubscriptionConfirmation') {
    try {
      const u = new URL(msg.SubscribeURL)
      if (u.protocol !== 'https:' || !isAwsCertHost(u.hostname)) {
        return res.status(400).json({ error: 'SubscribeURL host not an SNS endpoint' })
      }
      const r = await fetch(msg.SubscribeURL, { signal: AbortSignal.timeout(5000) })
      if (!r.ok) {
        console.warn('[ses-bounce] subscribe GET failed:', r.status)
        return res.status(502).json({ error: `Subscribe GET failed ${r.status}` })
      }
      console.log('[ses-bounce] subscription confirmed')
      return res.status(200).json({ ok: true, confirmed: true })
    } catch (e) {
      return res.status(500).json({ error: e?.message || 'subscribe failed' })
    }
  }

  if (msg.Type !== 'Notification') {
    return res.status(200).json({ ok: true, ignored: msg.Type })
  }

  // Message.Message is a JSON string carrying the SES notification body.
  let notif
  try { notif = JSON.parse(msg.Message || '{}') } catch {
    return res.status(400).json({ error: 'invalid inner Message JSON' })
  }

  const notifType = notif?.notificationType || notif?.eventType
  if (notifType !== 'Bounce' && notifType !== 'Complaint') {
    return res.status(200).json({ ok: true, ignored_type: notifType || 'unknown' })
  }

  const bounce = notif.bounce || notif.complaint || {}
  const bounceType = bounce.bounceType || notifType
  const isPermanent = bounceType === 'Permanent' || notifType === 'Complaint'
  const recipients = Array.isArray(bounce.bouncedRecipients) ? bounce.bouncedRecipients
    : Array.isArray(bounce.complainedRecipients) ? bounce.complainedRecipients
    : []

  if (recipients.length === 0) {
    return res.status(200).json({ ok: true, no_recipients: true })
  }

  const supabase = admin()
  const touched = []

  for (const r of recipients) {
    const bouncedAddress = String(r.emailAddress || '').toLowerCase().trim()
    const diag = r.diagnosticCode || r.status || bounceType || ''
    if (!bouncedAddress) continue

    // Soft bounces: log and move on. SES handles its own retries; we don't
    // want to lock a facility out on a transient issue.
    if (!isPermanent) {
      try {
        await writeAuditEvent(req, null, {
          event_type: 'arc_report.bounce_soft',
          resource_type: 'employers',
          metadata: { bounced_address: maskEmail(bouncedAddress), bounce_type: bounceType, diag_code: diag },
        })
      } catch {}
      touched.push({ address: bouncedAddress, action: 'soft_logged' })
      continue
    }

    // Permanent bounce / complaint: flip facility rows whose clinical OR
    // backup contact matches. Case-insensitive search; both columns live
    // on employers.
    const { data: facilities, error } = await supabase
      .from('employers')
      .select('id, company_name, clinical_contact_email, backup_contact_email')
      .or(`clinical_contact_email.ilike.${bouncedAddress},backup_contact_email.ilike.${bouncedAddress}`)
    if (error) {
      console.warn('[ses-bounce] facility lookup failed:', error.message)
      continue
    }
    if (!facilities || facilities.length === 0) {
      // Hard bounce for an address we don't recognise - still worth a note.
      try {
        await writeAuditEvent(req, null, {
          event_type: 'arc_report.bounce_unmatched',
          resource_type: 'employers',
          metadata: { bounced_address: maskEmail(bouncedAddress), bounce_type: bounceType, diag_code: diag },
        })
      } catch {}
      touched.push({ address: bouncedAddress, action: 'unmatched' })
      continue
    }

    for (const f of facilities) {
      await supabase
        .from('employers')
        .update({
          delivery_status: 'bounced',
          delivery_status_detail: `SES bounce (${bounceType || notifType}): ${diag || '-'}`.slice(0, 500),
          delivery_status_updated_at: new Date().toISOString(),
        })
        .eq('id', f.id)
      try {
        await writeAuditEvent(req, null, {
          event_type: 'arc_report.bounce',
          resource_type: 'employers',
          resource_id: f.id,
          metadata: {
            facility_id: f.id,
            facility_name: f.company_name,
            bounced_address: maskEmail(bouncedAddress),
            bounce_type: bounceType,
            diag_code: diag,
          },
        })
      } catch {}
      await pageAdminOnBounce({ facility: f, bouncedAddress, bounceType, bounceReason: diag })
      touched.push({ address: bouncedAddress, facility_id: f.id, action: 'flipped_bounced' })
    }
  }

  return res.status(200).json({ ok: true, processed: recipients.length, touched })
}
