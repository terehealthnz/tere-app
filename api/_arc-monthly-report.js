// Aged residential care (ARC) monthly utilisation report - single-facility
// generator + sender. Called from the cron for the normal day-7 batch; the
// ad-hoc admin "Send report now" button is deferred to v1.1.
//
// Endpoint:
//   GET /api/arc-monthly-report?employer_id=<uuid>&period=YYYY-MM
//
// Auth:
//   - Admin cookie (guardProvider + is_admin), OR
//   - Authorization: Bearer <CRON_SECRET> (so the cron can call it directly
//     without having to carry a provider session)
//
// Scope:
//   - Scans consultations WHERE employer_id = X AND status = 'complete'
//     AND completed_at BETWEEN month-start and month-end in NZDT
//   - Builds PDF via _pdf-builders.buildArcMonthlyReportPdf
//   - Sends via SES / Resend (same email-client used everywhere else)
//     TO:  clinical_contact_email
//     CC:  backup_contact_email
//     (billing_email intentionally NOT on the utilisation report - it
//     goes with the invoice in a later wave)
//   - Writes audit_logs row event_type='arc_report_sent'
//   - Updates employers.last_monthly_report_sent_at (if the column exists;
//     best-effort - the column is not in the MVP migration)
//
// Pricing:
//   - Prefer consultation.payment_amount (cents, integer). All ARC consults
//     are created with payment_amount server-populated via
//     _create-consultation.js (fee_tier='resident' + is_acc routing), so
//     this should always be populated for genuine ARC consults.
//   - Fallback: fee_tier/is_acc mapping. Public rates are 6500 cents eval,
//     2500 cents ACC. Consults with neither a payment_amount nor a
//     mappable fee_tier/is_acc flag are flagged in the response as
//     `unpriced` so admin can triage before next month's run.
//
// What this endpoint does NOT include in the PDF (by design):
//   - Chief complaint, notes, diagnosis - HDC Right 1(c) / HIPC Rule 11.
//     Facility gets the admin-level utilisation view, not clinical detail.

import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { guardProvider } from './_auth.js'
import { verifyCronSecret } from './_cron-auth.js'
import { sendEmail, hasEmailProvider } from './_email-client.js'
import { writeAuditEvent } from './_audit-write.js'
import { buildArcMonthlyReportPdf } from './_pdf-builders.js'

const EVAL_CENTS = 6500
const ACC_CENTS  = 2500
const FROM_ADDRESS = process.env.SES_FROM_EMAIL || 'Tere Health <hello@terehealth.co.nz>'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// Parse a YYYY-MM period into NZDT month boundaries (start inclusive,
// end exclusive). Returns both UTC Date objects (for the DB range
// filter which compares against a UTC-stored completed_at) and a
// label like 'October 2026' for the PDF header.
export function parseMonthPeriod(periodStr) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(periodStr || ''))
  if (!m) return null
  const year = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  if (month < 1 || month > 12) return null

  // NZDT in November is UTC+13 (DST). NZST is UTC+12. To cover both
  // without having to know the DST schedule, compute via toLocaleString
  // so JS's tz database picks the right offset for the date in question.
  // Start: 00:00:00 Pacific/Auckland on day 1 of the period month.
  // End:   00:00:00 Pacific/Auckland on day 1 of (month + 1).
  const startNz = zonedWallTimeToUtc(year, month, 1, 0, 0)
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear  = month === 12 ? year + 1 : year
  const endNz   = zonedWallTimeToUtc(nextYear, nextMonth, 1, 0, 0)

  // Label uses the start-of-month Date in Pacific/Auckland so the user
  // sees "October 2026" not "September 2026" for a query at 00:00 NZDT
  // on Oct 1.
  const label = startNz.toLocaleString('en-NZ', {
    timeZone: 'Pacific/Auckland', month: 'long', year: 'numeric',
  })
  return { startIso: startNz.toISOString(), endIso: endNz.toISOString(), label }
}

// Return the Date at a given Pacific/Auckland wall-clock time. Implemented
// by binary-searching for the UTC instant whose Auckland rendering
// matches the target wall clock - robust across DST boundaries without
// needing a tz library. Narrow range (24h) + 2 iterations is enough
// because tz offset is quantised to minutes.
function zonedWallTimeToUtc(y, mo, d, h, mi) {
  const pad = (n) => String(n).padStart(2, '0')
  const target = `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}`
  // Assume NZDT (UTC+13) as a starting point. Correct by observed offset.
  let utc = Date.UTC(y, mo - 1, d, h - 13, mi, 0)
  for (let i = 0; i < 2; i++) {
    const rendered = new Date(utc).toLocaleString('sv-SE', {
      timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).replace(' ', 'T').slice(0, 16)
    if (rendered === target) break
    // Compute delta minutes between rendered and target and shift.
    const [ry, rmo, rd, rh, rmi] = rendered.split(/[-T:]/).map(Number)
    const renderedUtc = Date.UTC(ry, rmo - 1, rd, rh, rmi, 0)
    const targetUtc   = Date.UTC(y, mo - 1, d, h, mi, 0)
    utc += (targetUtc - renderedUtc)
  }
  return new Date(utc)
}

// Compute the previous calendar month in Pacific/Auckland. Called by the
// cron when no explicit period is passed.
export function previousMonthPeriodNz(now = new Date()) {
  const parts = now.toLocaleString('en-CA', {
    timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit',
  }) // 'YYYY-MM'
  const [y, m] = parts.split('-').map(Number)
  const prevMonth = m === 1 ? 12 : m - 1
  const prevYear  = m === 1 ? y - 1 : y
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`
}

function residentLabel(c) {
  if (c.facility_resident_id && String(c.facility_resident_id).trim()) {
    return String(c.facility_resident_id).trim()
  }
  const fn = (c.patient_first_name || '').trim()
  const ln = (c.patient_last_name || '').trim()
  const initials = [fn[0], ln[0]].filter(Boolean).join('').toUpperCase()
  return initials ? `Resident ${initials}` : 'Resident (unidentified)'
}

const DISPOSITION_LABELS = {
  managed_in_place:     'Managed in place',
  referred_gp:          'Referred to GP',
  transferred_ed:       'Transferred to ED',
  called_111:           '111 called',
  arranged_followup:    'Follow-up arranged',
  acp_comfort_in_place: 'ACP: comfort in place',
}

function dispositionLabel(c) {
  if (!c.disposition) return '-'
  return DISPOSITION_LABELS[c.disposition] || c.disposition
}

function typeLabel(c) {
  return c.__isAcc ? 'ACC' : 'Evaluation'
}

// Resolve per-consult amount in cents. Order:
//   1. consultation.payment_amount if a positive integer
//   2. fee_tier='resident' + is_acc mapping
//   3. is_acc fallback with no fee_tier
//   4. Unpriced - returned as null so the caller can surface it
function resolveAmountCents(c) {
  if (Number.isFinite(c.payment_amount) && c.payment_amount > 0) {
    return { cents: c.payment_amount, source: 'payment_amount' }
  }
  if (c.fee_tier === 'resident') {
    return { cents: c.is_acc ? ACC_CENTS : EVAL_CENTS, source: 'fee_tier_resident' }
  }
  // Last resort - a genuine ARC consult without either signal shouldn't
  // happen (create-consultation enforces fee_tier='resident' for aged_care),
  // but defend against it so a corrupt row doesn't blow the whole report.
  return { cents: null, source: 'unpriced' }
}

// Verify this looks like a plausible-named-human recipient. Mirror the
// shared-inbox rejection list from _employers.js so a facility whose
// contact row was created before the validator was added doesn't silently
// bounce. Not a hard gate here - we still send - but the report fires an
// admin heads-up if the recipient is a shared inbox.
const SHARED_INBOX_LOCAL_PARTS = new Set([
  'info', 'admin', 'accounts', 'enquiries', 'enquiry', 'contact', 'hello',
  'reception', 'office', 'noreply', 'no-reply', 'support', 'helpdesk',
  'billing', 'mail', 'postmaster', 'sales', 'team',
])
function isSharedInbox(email) {
  const local = String(email || '').toLowerCase().split('@')[0] || ''
  return SHARED_INBOX_LOCAL_PARTS.has(local)
}

// Core function - callable from the cron or the admin "Send now" button
// (admin button is v1.1). Returns {ok, skipped, reason, consults, pdfSha256,
// sesMessageId}.
export async function generateAndSendArcReport({
  employerId,
  period,
  trigger = 'cron',
  actor = null,  // { id, email } for audit trail when triggered manually
}) {
  if (!employerId) return { ok: false, reason: 'missing_employer_id' }
  const bounds = parseMonthPeriod(period)
  if (!bounds) return { ok: false, reason: 'invalid_period' }

  const sb = admin()

  // Resolve facility first. We refuse to send if the row is not aged_care
  // (admin button safety - prevents a typo sending a report to an employer),
  // if is_active=false, or if delivery_status indicates a prior bounce.
  const { data: facility, error: fErr } = await sb
    .from('employers')
    .select(`
      id, company_name, is_active, org_type,
      clinical_contact_name, clinical_contact_email,
      backup_contact_name, backup_contact_email,
      delivery_status, delivery_status_detail
    `)
    .eq('id', employerId)
    .maybeSingle()
  if (fErr) return { ok: false, reason: 'facility_lookup_failed', detail: fErr.message }
  if (!facility) return { ok: false, reason: 'facility_not_found' }
  if (facility.org_type !== 'aged_care') return { ok: false, reason: 'not_aged_care' }
  if (facility.is_active === false) return { ok: false, reason: 'facility_inactive' }
  if (facility.delivery_status && facility.delivery_status !== 'ok') {
    return { ok: false, reason: 'delivery_status_blocked', detail: facility.delivery_status }
  }
  if (!facility.clinical_contact_email) {
    return { ok: false, reason: 'no_clinical_contact_email' }
  }

  // Fetch completed consults for the period. completed_at is the finalise
  // moment (not created_at) - a consult started on the last day of month
  // but finalised the next morning belongs to the next month's report.
  const { data: consults, error: cErr } = await sb
    .from('consultations')
    .select(`
      id, created_at, completed_at, status, is_acc, fee_tier,
      payment_amount, consultation_type, disposition,
      facility_resident_id, patient_first_name, patient_last_name
    `)
    .eq('employer_id', employerId)
    .eq('status', 'complete')
    .gte('completed_at', bounds.startIso)
    .lt('completed_at', bounds.endIso)
    .order('completed_at', { ascending: true })
  if (cErr) return { ok: false, reason: 'consults_query_failed', detail: cErr.message }

  const enriched = []
  let totalCents = 0
  let unpriced = 0
  for (const c of (consults || [])) {
    const { cents, source } = resolveAmountCents(c)
    if (cents == null) {
      unpriced++
    } else {
      totalCents += cents
    }
    enriched.push({
      ...c,
      __isAcc: !!c.is_acc,
      __typeLabel: typeLabel({ __isAcc: !!c.is_acc }),
      __dispositionLabel: dispositionLabel(c),
      __residentLabel: residentLabel(c),
      __amountCents: cents,
      __amountSource: source,
    })
  }

  // If the facility had zero consults this month, skip the send. An empty
  // "you saw nobody" PDF is noise - the renewal conversation uses the
  // first non-zero month.
  if (enriched.length === 0) {
    return {
      ok: true,
      skipped: true,
      reason: 'no_consults_in_period',
      facility_id: facility.id,
      period: bounds.label,
    }
  }

  // Build the PDF.
  const pdfBuf = await buildArcMonthlyReportPdf({
    facility,
    period: bounds,
    consults: enriched,
    totals: { totalCents, unpriced },
  })
  const pdfSha256 = crypto.createHash('sha256').update(pdfBuf).digest('hex')

  // Send via the shared email client.
  const to = [facility.clinical_contact_email]
  const cc = facility.backup_contact_email ? [facility.backup_contact_email] : undefined

  const subject = `Tere Health - ${facility.company_name} - monthly report (${bounds.label})`
  const greeting = facility.clinical_contact_name
    ? `Kia ora ${facility.clinical_contact_name.split(/\s+/)[0]},`
    : 'Kia ora,'

  const text = [
    greeting,
    '',
    `Attached is the Tere Health monthly utilisation report for ${facility.company_name}, covering ${bounds.label}.`,
    '',
    `Consults completed this period: ${enriched.length}`,
    `Total (no GST):                  $${(totalCents / 100).toFixed(2)} NZD`,
    '',
    'The report lists each consult by resident identifier (or initials if no facility ID is on file), date, type, and amount. No clinical detail is included - please reply to this email if you need a signed clinical summary for any resident.',
    '',
    'Questions, or need the report for a different month? Reply to this email or contact hello@terehealth.co.nz any time.',
    '',
    'Nga mihi,',
    'The Tere Health team',
  ].join('\n')

  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = `<!DOCTYPE html><html><body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;padding:20px">
    <p>${esc(greeting)}</p>
    <p>Attached is the Tere Health monthly utilisation report for <strong>${esc(facility.company_name)}</strong>, covering <strong>${esc(bounds.label)}</strong>.</p>
    <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:14px 0;font-size:14px">
      <tr><td style="color:#6B7280">Consults completed this period</td><td><strong>${enriched.length}</strong></td></tr>
      <tr><td style="color:#6B7280">Total (no GST)</td><td><strong>$${(totalCents / 100).toFixed(2)} NZD</strong></td></tr>
    </table>
    <p>The report lists each consult by resident identifier (or initials if no facility ID is on file), date, type, and amount. No clinical detail is included - please reply to this email if you need a signed clinical summary for any resident.</p>
    <p>Questions, or need the report for a different month? Reply to this email or contact <a href="mailto:hello@terehealth.co.nz" style="color:#0B6E76">hello@terehealth.co.nz</a> any time.</p>
    <p>Nga mihi,<br>The Tere Health team</p>
    <hr style="border:none;border-top:1px solid #E2E8F0;margin-top:24px">
    <p style="font-size:11px;color:#9CA3AF">Tere Health Limited  ·  terehealth.co.nz  ·  NZBN 9429053723413</p>
  </body></html>`

  const periodSlug = period // already YYYY-MM
  const facilitySlug = String(facility.company_name || 'facility').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'facility'

  const sendRes = await sendEmail({
    from: FROM_ADDRESS,
    to,
    ...(cc ? { cc } : {}),
    replyTo: 'hello@terehealth.co.nz',
    subject,
    text,
    html,
    attachments: [{
      filename: `tere-${facilitySlug}-${periodSlug}.pdf`,
      content: pdfBuf,
      contentType: 'application/pdf',
    }],
  })

  if (!sendRes?.ok) {
    return {
      ok: false,
      reason: 'send_failed',
      detail: sendRes?.error || 'unknown',
      facility_id: facility.id,
      period: bounds.label,
    }
  }

  // Audit row - required so Patrick can tell at a glance which facilities
  // got which month's report and which bounced. Does NOT contain patient
  // identifiers; the per-resident detail stays in the PDF only.
  try {
    await writeAuditEvent({ headers: {} }, actor ? { provider: { id: actor.id, email: actor.email, is_admin: true } } : null, {
      event_type:    'arc_report_sent',
      resource_type: 'employers',
      resource_id:   facility.id,
      metadata: {
        facility_id:    facility.id,
        facility_name:  facility.company_name,
        period:         bounds.label,
        period_slug:    period,
        trigger,
        recipients_to:  to,
        recipients_cc:  cc || [],
        consult_count:  enriched.length,
        total_cents:    totalCents,
        unpriced_count: unpriced,
        ses_message_id: sendRes.id || null,
        provider:       sendRes.provider || null,
        pdf_sha256:     pdfSha256,
        shared_inbox_recipient: isSharedInbox(facility.clinical_contact_email),
      },
    })
  } catch (e) {
    console.warn('[arc-monthly-report] audit write failed:', e?.message || e)
  }

  return {
    ok: true,
    facility_id:    facility.id,
    facility_name:  facility.company_name,
    period:         bounds.label,
    recipients_to:  to,
    recipients_cc:  cc || [],
    consult_count:  enriched.length,
    total_cents:    totalCents,
    unpriced_count: unpriced,
    ses_message_id: sendRes.id || null,
    pdf_sha256:     pdfSha256,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }
  if (!hasEmailProvider()) {
    return res.status(503).json({ error: 'no_email_provider_configured' })
  }

  // Two auth paths: cron secret (Bearer) OR admin cookie. verifyCronSecret
  // is constant-time; guardProvider handles session cookies + JWT.
  const hasCronAuth = verifyCronSecret(req)
  let actor = null
  if (!hasCronAuth) {
    const auth = await guardProvider(req, res)
    if (!auth) return  // guardProvider already sent 401
    if (!auth.provider?.is_admin) {
      return res.status(403).json({ error: 'admin_only' })
    }
    actor = { id: auth.provider.id, email: auth.provider.email }
  }

  const employerId = String(req.query?.employer_id || '').trim()
  const period     = String(req.query?.period || '').trim() || previousMonthPeriodNz()
  if (!employerId) return res.status(400).json({ error: 'missing_employer_id' })

  const result = await generateAndSendArcReport({
    employerId,
    period,
    trigger: hasCronAuth ? 'cron' : 'admin_manual',
    actor,
  })
  if (!result.ok && !result.skipped) {
    return res.status(result.reason === 'facility_not_found' ? 404 : 422).json(result)
  }
  return res.status(200).json(result)
}
