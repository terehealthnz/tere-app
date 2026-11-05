// /api/arc-monthly-report - send one facility's monthly consult-count report.
//
// Serves two call paths:
//   1. Admin manual trigger (POST, trigger=admin_manual)
//        Admin presses "Send report now" on the facility row in EmployersPanel.
//        Authed via guardProvider (handler.js AUTH_REQUIRED_ROUTES).
//   2. Cron fan-out (POST, trigger=cron_monthly)
//        /api/cron-arc-monthly-report iterates every active ARC facility
//        and calls this endpoint for each. Authed via CRON_SECRET.
//
// Both paths land the same pipeline:
//   - Select completed consults for the facility in the period (YYYY-MM)
//   - Build the summary PDF (no clinical content - counts + dispositions +
//     amounts only, see _pdf-builders.js:buildArcMonthlyReportPdf)
//   - SES email to the facility's clinical_contact_email + cc backup
//   - Audit log row event_type='arc_report_sent' including pdf_sha256 and
//     ses_message_id for the compliance trail
//
// Refuses to fire if delivery_status='bounced' (stale contact - admin
// needs to update + clear before sends resume).

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { verifyCronSecret } from './_cron-auth.js'
import { sendEmail, hasEmailProvider } from './_email-client.js'
import { buildArcMonthlyReportPdf } from './_pdf-builders.js'
import { writeAuditEvent } from './_audit-write.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// Period helpers. If the caller supplies ?period=YYYY-MM we use that;
// otherwise we default to the LAST calendar month (matches cron semantics -
// day-7 of November runs for October).
function resolvePeriod(periodArg) {
  if (periodArg && /^\d{4}-\d{2}$/.test(String(periodArg))) {
    const [y, m] = String(periodArg).split('-').map(Number)
    const start = new Date(Date.UTC(y, m - 1, 1))
    const end   = new Date(Date.UTC(y, m, 1))
    return { label: String(periodArg), start: start.toISOString(), end: end.toISOString() }
  }
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const end   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const label = start.toISOString().slice(0, 7)
  return { label, start: start.toISOString(), end: end.toISOString() }
}

// Build the rows + totals for one facility in one period. Keyed on
// consultations.employer_id + status='complete' + completed_at inside the
// window. Joins against employer_employees (not deleted) to carry the
// facility_resident_id into each row - that identifier is the facility's
// stable key for the resident across CSV re-uploads.
async function loadFacilityRows(supabase, employerId, periodStart, periodEnd) {
  const { data: consults, error } = await supabase
    .from('consultations')
    .select('id, completed_at, created_at, is_acc, acc_eligible, payment_amount, disposition, patient_first_name, patient_last_name, patient_dob')
    .eq('employer_id', employerId)
    .eq('status', 'complete')
    .gte('completed_at', periodStart)
    .lt('completed_at', periodEnd)
    .order('completed_at')
  if (error) throw new Error(`Failed to load consults: ${error.message}`)
  if (!consults || consults.length === 0) {
    return { rows: [], totals: { count: 0, acc_count: 0, eval_count: 0, total_cents: 0 } }
  }

  // Resolve each consult's facility_resident_id by re-matching against the
  // active + soft-deleted roster (soft-deleted residents still bill in the
  // period they were seen). Done in a batched lookup rather than per-row.
  const { data: rosterRows } = await supabase
    .from('employer_employees')
    .select('first_name, last_name, dob, facility_resident_id')
    .eq('employer_id', employerId)
  const rosterByKey = new Map()
  for (const r of (rosterRows || [])) {
    const key = `${String(r.first_name || '').trim().toLowerCase()}|${String(r.last_name || '').trim().toLowerCase()}|${String(r.dob || '').slice(0, 10)}`
    rosterByKey.set(key, r.facility_resident_id || null)
  }

  const rows = []
  let acc_count = 0, eval_count = 0, total_cents = 0
  for (const c of consults) {
    const key = `${String(c.patient_first_name || '').trim().toLowerCase()}|${String(c.patient_last_name || '').trim().toLowerCase()}|${String(c.patient_dob || '').slice(0, 10)}`
    const frid = rosterByKey.get(key) || null
    const isAcc = c.is_acc === true || c.acc_eligible === 'yes'
    const amount = Number(c.payment_amount) || (isAcc ? 2500 : 6500)
    rows.push({
      facility_resident_id: frid,
      consult_date: c.completed_at || c.created_at,
      consult_type: isAcc ? 'acc' : 'eval',
      disposition: c.disposition,
      amount_cents: amount,
    })
    if (isAcc) acc_count += 1; else eval_count += 1
    total_cents += amount
  }
  return { rows, totals: { count: rows.length, acc_count, eval_count, total_cents } }
}

export default async function handler(req, res) {
  // Auth dispatch: admin path vs cron path.
  // Admin path (the common case when the admin presses Send report now) carries
  // a provider JWT routed via handler.js's AUTH_REQUIRED_ROUTES - req.auth is
  // already resolved and attached by the time we land here.
  // Cron path: unauthenticated by handler.js, but carries CRON_SECRET either
  // in ?secret= or Authorization: Bearer.
  const trigger = String(req.query?.trigger || req.body?.trigger || 'admin_manual')
  const isCron  = trigger === 'cron_monthly'
  if (isCron) {
    if (!verifyCronSecret(req)) return res.status(401).json({ error: 'Invalid cron secret' })
  } else {
    // Admin manual - require an authed provider. handler.js routes
    // 'arc-monthly-report' through AUTH_REQUIRED_ROUTES (see handler.js),
    // so req.auth is populated. Enforce admin role.
    const isAdmin = req.auth?.provider?.is_admin === true
    if (!isAdmin) return res.status(403).json({ error: 'Admin role required' })
  }

  const employerId = req.query?.employer_id || req.body?.employer_id
  if (!employerId) return res.status(400).json({ error: 'employer_id required' })

  const supabase = admin()

  const { data: facility, error: fErr } = await supabase
    .from('employers')
    .select('id, company_name, org_type, is_active, clinical_contact_name, clinical_contact_email, backup_contact_name, backup_contact_email, delivery_status')
    .eq('id', String(employerId))
    .maybeSingle()
  if (fErr || !facility) return res.status(404).json({ error: 'Facility not found' })
  if (facility.org_type !== 'aged_care') return res.status(400).json({ error: 'Not an aged residential care facility' })
  if (!facility.is_active) return res.status(400).json({ error: 'Facility is inactive' })
  if (facility.delivery_status === 'bounced') {
    return res.status(409).json({
      error: 'Delivery to this facility is currently flagged bounced. Update the clinical contact in Admin before sending.',
      code: 'DELIVERY_BOUNCED',
    })
  }
  if (!facility.clinical_contact_email) {
    return res.status(400).json({ error: 'Facility has no clinical_contact_email on file' })
  }
  if (!hasEmailProvider()) {
    return res.status(500).json({ error: 'Email provider not configured' })
  }

  const period = resolvePeriod(req.query?.period || req.body?.period)

  let rows, totals
  try {
    const result = await loadFacilityRows(supabase, facility.id, period.start, period.end)
    rows = result.rows; totals = result.totals
  } catch (e) {
    console.error('[arc-monthly-report] load failed:', e.message)
    return res.status(500).json({ error: 'Failed to load facility data' })
  }

  const pdfBuffer = await buildArcMonthlyReportPdf({
    facilityName: facility.company_name,
    periodLabel:  period.label,
    generatedAt:  new Date().toISOString(),
    rows,
    totals,
  })
  const pdfSha = crypto.createHash('sha256').update(pdfBuffer).digest('hex')
  const safeName = String(facility.company_name || 'facility').replace(/[^A-Za-z0-9]+/g, '-')
  const filename = `Tere-${safeName}-${period.label}.pdf`

  const subjectLine = `Tere Health monthly consult report - ${facility.company_name} - ${period.label}`
  const clinicalFirst = (facility.clinical_contact_name || '').split(/\s+/)[0] || 'team'

  const emailRes = await sendEmail({
    from:    'Tere Health <hello@terehealth.co.nz>',
    replyTo: 'hello@terehealth.co.nz',
    to:      facility.clinical_contact_email,
    cc:      facility.backup_contact_email || undefined,
    subject: subjectLine,
    html: `
      <div style="font-family:Helvetica,Arial,sans-serif;color:#1A2A33;max-width:560px">
        <p>Kia ora ${clinicalFirst},</p>
        <p>Attached is the Tere Health monthly consult report for <strong>${facility.company_name}</strong> covering <strong>${period.label}</strong>.</p>
        <p>Period totals: <strong>${totals.count}</strong> completed consults (${totals.eval_count} eval / ${totals.acc_count} ACC), total <strong>$${(totals.total_cents / 100).toFixed(2)}</strong>. Full per-resident detail is in the attached PDF.</p>
        <p>The report carries no clinical content - counts, dispositions, and billable totals only. Please reply to this email or contact accounts@terehealth.co.nz with any queries.</p>
        <p>Ngā mihi,<br/>Tere Health<br/><span style="color:#6B7280;font-size:12px">terehealth.co.nz · HPI-O G11238-E</span></p>
      </div>
    `,
    attachments: [{ filename, content: pdfBuffer.toString('base64'), contentType: 'application/pdf' }],
  })

  if (!emailRes.ok) {
    console.error('[arc-monthly-report] send failed:', emailRes.error)
    return res.status(502).json({ error: 'Email send failed', detail: emailRes.error })
  }

  // Write the audit row AFTER successful send. If SES handed us a message
  // id (provider='ses' returns {id}) it ties this send to the delivery
  // notification stream the bounce webhook subscribes to.
  try {
    await writeAuditEvent(req, req.auth || null, {
      event_type: 'arc_report.sent',
      resource_type: 'employers',
      resource_id: facility.id,
      metadata: {
        facility_id: facility.id,
        facility_name: facility.company_name,
        period: period.label,
        trigger,
        recipients: {
          to: facility.clinical_contact_email,
          cc: facility.backup_contact_email || null,
        },
        totals,
        ses_message_id: emailRes.id || null,
        pdf_sha256: pdfSha,
      },
    })
  } catch (e) { console.warn('[arc-monthly-report] audit write failed:', e?.message) }

  return res.status(200).json({
    ok: true,
    message: `Monthly report sent to ${facility.clinical_contact_email}${facility.backup_contact_email ? ' (cc ' + facility.backup_contact_email + ')' : ''}.`,
    totals,
    period: period.label,
    ses_message_id: emailRes.id || null,
    pdf_sha256: pdfSha,
  })
}
