// Nightly security-anomaly digest. Runs at 07:00 UTC (~19:00 NZT).
//
// Scans the last 24h of audit_logs + security_events + provider_login_attempts
// and, if any anomaly threshold is hit, emails a summary to
// terehealthnz@gmail.com. Silent when the day is clean — no noise emails.
//
// Manual test:  GET /api/cron-security-anomalies?secret=<CRON_SECRET>&force=1
//   force=1 makes the endpoint email even when there are no anomalies (for
//   verifying the cron is wired up).

import { createClient } from '@supabase/supabase-js'

// ── Thresholds ──────────────────────────────────────────────────────────
const PHI_VIEWS_PER_HOUR_THRESHOLD = 50   // provider viewing >50 patients/hour → flag
const AUTH_FAILURES_PER_IP_THRESHOLD = 20 // IP with >20 failed logins in 24h → flag
const OFF_HOURS_NZT_START = 2             // 2am NZT
const OFF_HOURS_NZT_END = 6               // 6am NZT

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export default async function handler(req, res) {
  // Cron auth (matches other _cron-*.js endpoints).
  const isVercelCron = !!req.headers['x-vercel-cron']
  const secretQ = req.query?.secret || null
  const secretH = req.headers['authorization']?.replace(/^Bearer\s+/i, '') || null
  const supplied = secretQ || secretH
  if (!isVercelCron && (!supplied || supplied !== process.env.CRON_SECRET)) {
    return res.status(404).json({ error: 'Not found' })
  }

  const force = req.query?.force === '1'
  const supabase = admin()
  const now = new Date()
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  const anomalies = { highVolume: [], offHours: [], authFailuresByIp: [], lockouts: [], failureBursts: [] }

  try {
    // 1. High volume: provider hitting >N PHI views in any single hour.
    const { data: audits } = await supabase
      .from('audit_logs')
      .select('provider_id, provider_name, event_type, resource_type, created_at')
      .gte('created_at', since)
      .limit(50000)
    const perProviderHour = new Map()      // "<provider_id>|<hour_iso>" → { count, name, events }
    for (const row of audits || []) {
      const hour = new Date(row.created_at).toISOString().slice(0, 13)
      const key = `${row.provider_id}|${hour}`
      const bucket = perProviderHour.get(key) || { provider_id: row.provider_id, provider_name: row.provider_name, hour, count: 0, events: {} }
      bucket.count++
      bucket.events[row.event_type] = (bucket.events[row.event_type] || 0) + 1
      perProviderHour.set(key, bucket)
    }
    for (const b of perProviderHour.values()) {
      if (b.count > PHI_VIEWS_PER_HOUR_THRESHOLD) anomalies.highVolume.push(b)
    }

    // 2. Off-hours (2-6am NZT) PHI access.
    //    NZT = UTC+12 (winter) / UTC+13 (summer, Sep-Apr). We compute the
    //    NZT hour by using Intl.DateTimeFormat which handles DST correctly.
    const nzHourFmt = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', hour12: false })
    const perProviderOffHours = new Map()
    for (const row of audits || []) {
      const nzHour = parseInt(nzHourFmt.format(new Date(row.created_at)), 10)
      const inWindow = OFF_HOURS_NZT_START < OFF_HOURS_NZT_END
        ? (nzHour >= OFF_HOURS_NZT_START && nzHour < OFF_HOURS_NZT_END)
        : (nzHour >= OFF_HOURS_NZT_START || nzHour < OFF_HOURS_NZT_END)
      if (!inWindow) continue
      const key = row.provider_id
      const b = perProviderOffHours.get(key) || { provider_id: row.provider_id, provider_name: row.provider_name, count: 0 }
      b.count++
      perProviderOffHours.set(key, b)
    }
    anomalies.offHours = Array.from(perProviderOffHours.values())

    // 3. Auth failures per IP in last 24h.
    const { data: authFails } = await supabase
      .from('security_events')
      .select('ip, created_at')
      .in('event_type', ['auth_failure'])
      .gte('created_at', since)
      .limit(50000)
    const perIp = new Map()
    for (const row of authFails || []) {
      if (!row.ip) continue
      perIp.set(row.ip, (perIp.get(row.ip) || 0) + 1)
    }
    for (const [ip, count] of perIp.entries()) {
      if (count > AUTH_FAILURES_PER_IP_THRESHOLD) anomalies.authFailuresByIp.push({ ip, count })
    }

    // 4. Auth failure bursts (already alerted immediately, include for record).
    const { data: bursts } = await supabase
      .from('security_events')
      .select('ip, metadata, created_at')
      .eq('event_type', 'auth_failure_burst')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50)
    anomalies.failureBursts = bursts || []

    // 5. Provider account lockouts in last 24h.
    const { data: locked } = await supabase
      .from('provider_login_attempts')
      .select('provider_id, locked_until, updated_at')
      .gte('updated_at', since)
      .not('locked_until', 'is', null)
    anomalies.lockouts = locked || []
  } catch (e) {
    console.error('[cron-security-anomalies] query failed:', e?.message || e)
    return res.status(500).json({ error: e?.message || 'Query failed' })
  }

  const anyAnomalies =
    anomalies.highVolume.length +
    anomalies.offHours.length +
    anomalies.authFailuresByIp.length +
    anomalies.lockouts.length +
    anomalies.failureBursts.length > 0

  if (!anyAnomalies && !force) {
    return res.json({ ok: true, sent: false, reason: 'no anomalies in last 24h' })
  }

  // Compose email.
  const rows = []
  if (anomalies.highVolume.length) {
    rows.push(`<h3 style="margin:16px 0 6px">High PHI-view volume</h3>`)
    rows.push('<table cellpadding="6" style="border-collapse:collapse;font-size:13px"><tr style="background:#f1f5f9"><th>Provider</th><th>Hour (UTC)</th><th>Views</th><th>Breakdown</th></tr>')
    for (const b of anomalies.highVolume.slice(0, 30)) {
      const brk = Object.entries(b.events).map(([k, v]) => `${k}: ${v}`).join(', ')
      rows.push(`<tr><td>${escapeHtml(b.provider_name || b.provider_id)}</td><td>${b.hour}</td><td><b>${b.count}</b></td><td>${escapeHtml(brk)}</td></tr>`)
    }
    rows.push('</table>')
  }
  if (anomalies.offHours.length) {
    rows.push(`<h3 style="margin:16px 0 6px">Off-hours PHI access (2-6am NZT)</h3>`)
    rows.push('<table cellpadding="6" style="border-collapse:collapse;font-size:13px"><tr style="background:#f1f5f9"><th>Provider</th><th>Events</th></tr>')
    for (const r of anomalies.offHours.slice(0, 30)) {
      rows.push(`<tr><td>${escapeHtml(r.provider_name || r.provider_id)}</td><td>${r.count}</td></tr>`)
    }
    rows.push('</table>')
  }
  if (anomalies.authFailuresByIp.length) {
    rows.push(`<h3 style="margin:16px 0 6px">Auth failures by IP</h3>`)
    rows.push('<table cellpadding="6" style="border-collapse:collapse;font-size:13px"><tr style="background:#f1f5f9"><th>IP</th><th>Failures (24h)</th></tr>')
    for (const r of anomalies.authFailuresByIp.slice(0, 30)) {
      rows.push(`<tr><td><code>${escapeHtml(r.ip)}</code></td><td><b>${r.count}</b></td></tr>`)
    }
    rows.push('</table>')
  }
  if (anomalies.failureBursts.length) {
    rows.push(`<h3 style="margin:16px 0 6px">Auth-failure bursts (already alerted immediately)</h3>`)
    rows.push('<table cellpadding="6" style="border-collapse:collapse;font-size:13px"><tr style="background:#f1f5f9"><th>When</th><th>IP</th><th>Count in window</th></tr>')
    for (const r of anomalies.failureBursts.slice(0, 30)) {
      rows.push(`<tr><td>${new Date(r.created_at).toISOString()}</td><td><code>${escapeHtml(r.ip || '?')}</code></td><td>${r.metadata?.count_in_window ?? '?'}</td></tr>`)
    }
    rows.push('</table>')
  }
  if (anomalies.lockouts.length) {
    rows.push(`<h3 style="margin:16px 0 6px">Provider accounts locked in last 24h</h3>`)
    rows.push('<table cellpadding="6" style="border-collapse:collapse;font-size:13px"><tr style="background:#f1f5f9"><th>Provider ID</th><th>Locked until (UTC)</th></tr>')
    for (const r of anomalies.lockouts.slice(0, 30)) {
      rows.push(`<tr><td><code>${escapeHtml(r.provider_id)}</code></td><td>${r.locked_until}</td></tr>`)
    }
    rows.push('</table>')
  }
  if (!anyAnomalies && force) {
    rows.push(`<p style="color:#059669"><b>Manual test — no anomalies in last 24h.</b> Cron is wired correctly.</p>`)
  }

  const html = `
    <div style="font-family:-apple-system,Segoe UI,sans-serif;color:#0f172a;max-width:720px">
      <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#94a3b8;font-weight:700">Tere Health · Security digest</div>
      <h2 style="margin:4px 0 0">Anomaly report — last 24h</h2>
      <div style="color:#64748b;font-size:12px;margin-top:2px">Generated ${now.toISOString()} · thresholds: &gt;${PHI_VIEWS_PER_HOUR_THRESHOLD} PHI views/hour, &gt;${AUTH_FAILURES_PER_IP_THRESHOLD} auth failures/IP/day, 2–6am NZT access flagged.</div>
      ${rows.join('\n')}
      <hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0"/>
      <div style="color:#94a3b8;font-size:11px">Silent unless anomalies. Manual trigger: <code>GET /api/cron-security-anomalies?secret=…&amp;force=1</code></div>
    </div>
  `

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: 'Tere Security <hello@terehealth.co.nz>',
      replyTo: 'terehealthnz@gmail.com',
      to: 'terehealthnz@gmail.com',
      subject: anyAnomalies
        ? `[Tere Security] ${anomalies.highVolume.length + anomalies.offHours.length + anomalies.authFailuresByIp.length + anomalies.lockouts.length} anomalies in last 24h`
        : '[Tere Security] Daily digest — no anomalies',
      html,
    })
  } catch (e) {
    console.error('[cron-security-anomalies] email failed:', e?.message || e)
    return res.status(500).json({ ok: false, emailError: e?.message })
  }

  return res.json({ ok: true, sent: true, anomalies: {
    highVolume: anomalies.highVolume.length,
    offHours: anomalies.offHours.length,
    authFailuresByIp: anomalies.authFailuresByIp.length,
    failureBursts: anomalies.failureBursts.length,
    lockouts: anomalies.lockouts.length,
  }})
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
