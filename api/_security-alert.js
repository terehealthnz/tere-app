// Real-time security alerting (task #359).
//
// Central helper that:
//   1. Writes an event to security_events (feeds the nightly cron digest).
//   2. On severity='alert', emails the admin address immediately.
//   3. On severity='alert' + isCritical flag, ALSO sends an SMS to
//      SECURITY_ALERT_MOBILE (Patrick's mobile) so a real break-in signal
//      wakes someone up.
//
// Callers use it inline from any endpoint. Fire-and-forget — never blocks
// the primary operation. If notifications fail we log but the security
// event row still lands.
//
// Deduplication: for the same (event_type, provider_id, ip) we suppress
// duplicate SMS/email for 15 minutes. Prevents a flood if someone triggers
// a repeating condition.

import { createClient } from '@supabase/supabase-js'
import { getClientIp } from './_client-ip.js'
import { sendEmail } from './_email-client.js'
import { sendSms } from './_sms.js'

const ADMIN_EMAIL = 'terehealthnz@gmail.com'
// SECURITY_ALERT_MOBILE should be set in Vercel to Patrick's mobile
// (E.164, e.g. +64290432347). Falls back silently if unset.
const CRITICAL_SMS_TO = process.env.SECURITY_ALERT_MOBILE || null

const DEDUPE_WINDOW_MS = 15 * 60 * 1000

// In-memory dedupe cache (per-warm-container). Not perfect across serverless
// invocations but good enough — a cold container that sends one extra alert
// is preferable to under-alerting.
const recentAlertKeys = new Map()

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function nzNow() {
  return new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })
}

/**
 * @param {object} req
 * @param {object} opts
 * @param {string} opts.eventType         e.g. 'admin_login_new_ip', 'mfa_disabled', 'bulk_export'
 * @param {'info'|'warn'|'alert'} opts.severity
 * @param {boolean} [opts.critical]       If true (and severity='alert'), also SMS
 * @param {string}  [opts.summary]        One-line human summary
 * @param {object}  [opts.metadata]       Structured detail
 * @param {string}  [opts.providerId]     Override; else req.auth.provider.id
 * @param {string}  [opts.providerName]
 */
export async function raiseSecurityAlert(req, opts = {}) {
  const {
    eventType,
    severity = 'warn',
    critical = false,
    summary = null,
    metadata = null,
    providerId  = req?.auth?.provider?.id || null,
    providerName = req?.auth?.provider
      ? `${req.auth.provider.first_name || ''} ${req.auth.provider.last_name || ''}`.trim() || null
      : null,
  } = opts
  if (!eventType) return
  const ip = req ? getClientIp(req) : null
  const userAgent = req?.headers?.['user-agent'] || null

  const supabase = admin()

  // Write the event row first (always). Notification is best-effort on top.
  let row = null
  try {
    const { data, error } = await supabase.from('security_events').insert({
      event_type:  eventType,
      severity,
      provider_id: providerId,
      ip,
      user_agent:  userAgent,
      metadata:    { summary, ...(metadata && typeof metadata === 'object' ? metadata : {}) },
    }).select('id').single()
    if (error) {
      console.error('[security-alert] write failed:', error.message)
      return
    }
    row = data
  } catch (e) {
    console.error('[security-alert] write exception:', e.message)
    return
  }

  // Only escalate on severity='alert'. Info + warn stay in the daily digest.
  if (severity !== 'alert') return

  // Dedupe: skip notification if we've already alerted on this (type + provider + ip) recently.
  const dedupeKey = `${eventType}|${providerId || 'no_provider'}|${ip || 'no_ip'}`
  const lastAt = recentAlertKeys.get(dedupeKey)
  if (lastAt && (Date.now() - lastAt) < DEDUPE_WINDOW_MS) {
    return
  }
  recentAlertKeys.set(dedupeKey, Date.now())

  // Prune old entries (keep memory bounded).
  if (recentAlertKeys.size > 200) {
    const cutoff = Date.now() - DEDUPE_WINDOW_MS
    for (const [k, v] of recentAlertKeys) if (v < cutoff) recentAlertKeys.delete(k)
  }

  const subjectPrefix = critical ? '🚨 [CRITICAL]' : '⚠️ [Security]'
  const subject = `${subjectPrefix} ${eventType} — Tere Health`
  const bodyLines = [
    `Security event: ${eventType}`,
    `Severity: ${severity}${critical ? ' (critical)' : ''}`,
    `Time: ${nzNow()} NZT`,
    summary ? `Summary: ${summary}` : null,
    providerName ? `Provider: ${providerName}${providerId ? ` (${providerId})` : ''}` : null,
    ip ? `IP: ${ip}` : null,
    userAgent ? `User-Agent: ${userAgent.slice(0, 200)}` : null,
    metadata ? `\nDetail: ${JSON.stringify(metadata, null, 2)}` : null,
    '',
    `Event row: ${row?.id || '(unknown)'} — see security_events table.`,
    'Runbook: docs/regulatory/privacy-breach-runbook.md',
  ].filter(Boolean)

  try {
    await sendEmail({
      from:    'Tere Security <hello@terehealth.co.nz>',
      to:      ADMIN_EMAIL,
      subject,
      text:    bodyLines.join('\n'),
    })
  } catch (e) {
    console.error('[security-alert] email failed:', e.message)
  }

  if (critical && CRITICAL_SMS_TO) {
    try {
      const smsBody = `Tere security ALERT: ${eventType}${summary ? ' — ' + summary : ''}${ip ? ' (IP ' + ip + ')' : ''}. Check email + audit_logs.`
      await sendSms({ to: CRITICAL_SMS_TO, body: smsBody.slice(0, 300) })
    } catch (e) {
      console.error('[security-alert] SMS failed:', e.message)
    }
  }

  // Mark alert_sent_at so the nightly cron doesn't re-alert on this same row.
  try {
    await supabase.from('security_events').update({ alert_sent_at: new Date().toISOString() }).eq('id', row.id)
  } catch { /* the trigger allows this specific field update; ignore soft failure */ }
}
