import PDFDocument from 'pdfkit'
import fs from 'node:fs'
import path from 'node:path'

// Fetch a signature image URL into a Buffer for pdfkit's `doc.image()` API.
// Returns null on any failure so callers can fall back to a signature line.
//
// SSRF hardening: the signature_url comes from providers.signature_url in
// the DB. A provider (or attacker with access to a provider account) could
// set that URL to something like http://169.254.169.254/latest/meta-data/…
// (AWS metadata) or a private-network address, and the server would fetch
// it during PDF generation. Restrict to https + Supabase Storage host or
// our own tere.co.nz / terehealth.co.nz assets. Blocks internal-network
// probes. Non-fatal — falls back to no signature on any rejection.
function isSafeSignatureUrl(url) {
  let u
  try { u = new URL(String(url)) } catch { return false }
  if (u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  // Block localhost + private IPv4 ranges + AWS/GCP metadata.
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return false
  if (host === '169.254.169.254' || host === 'metadata.google.internal') return false
  if (/^(10\.|127\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(host)) return false
  // Allowlist: Supabase Storage domain + our own hosts.
  const supabaseHost = (process.env.VITE_SUPABASE_URL || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase()
  const allowed = new Set([
    supabaseHost,
    'terehealth.co.nz',
    'tere.co.nz',
    'terecare.com',
  ].filter(Boolean))
  // Also allow any *.supabase.co for storage buckets on other envs.
  if (host.endsWith('.supabase.co')) return true
  return allowed.has(host)
}

async function fetchSignatureBuffer(url) {
  if (!url) return null
  if (!isSafeSignatureUrl(url)) {
    console.warn('[pdf-builders] rejected signature URL (SSRF guard):', String(url).slice(0, 120))
    return null
  }
  try {
    const r = await fetch(url, {
      // Short timeout so a hung fetch can't stall PDF generation.
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    })
    if (!r.ok) return null
    const arr = await r.arrayBuffer()
    return Buffer.from(arr)
  } catch { return null }
}

// Tere Health logo — loaded lazily from public/ so it ships with the Vercel
// deployment. Cached module-level to avoid disk reads on every PDF. Embedding
// the logo also bulks referral PDFs past the 10 KB threshold that RHCNZ's
// automation uses to filter out signature-only / whitespace-only emails
// (Holly Johnson feedback 2026-08-17).
let _tereLogoBuf = null
function tereLogoBuffer() {
  if (_tereLogoBuf !== null) return _tereLogoBuf
  try {
    const p = path.join(process.cwd(), 'public', 'tere-logo.png')
    _tereLogoBuf = fs.readFileSync(p)
  } catch { _tereLogoBuf = false }
  return _tereLogoBuf || null
}

// Diagonal watermark across every page — deters casual screenshot-and-forward
// leaks and makes any leaked PDF traceable to the exporter + timestamp.
// Call once after doc.end() has NOT been called and pageRange is known.
export function drawWatermark(doc, { exporter, exportedAt, label = 'CONFIDENTIAL' } = {}) {
  try {
    const pageRange = doc.bufferedPageRange()
    const line = `${label} · ${exporter || 'Tere Health'} · ${exportedAt ? new Date(exportedAt).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }) : new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })}`
    for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
      doc.switchToPage(i)
      const W = doc.page.width, H = doc.page.height
      doc.save()
      doc.rotate(-30, { origin: [W / 2, H / 2] })
      doc.fillOpacity(0.06)
      doc.fillColor('#0B6E76').font('Helvetica-Bold').fontSize(50)
      doc.text(line, 0, H / 2 - 30, { width: W, align: 'center' })
      doc.fillOpacity(1)
      doc.restore()
    }
  } catch (e) {
    console.error('[drawWatermark] failed:', e.message)
  }
}

// DG statement — required verbatim on any prescription sent without a
// prescriber signature under the August 2024 Director-General authorisation.
const DG_SIGNATURE_EXEMPT_STATEMENT =
  "This Prescription meets the requirement of the Director-General of " +
  "Health's authorisation of August 2024 for prescriptions not signed " +
  "personally by a prescriber with their usual signature"

export async function buildPrescriptionPdf(data) {
  // Only fetch the signature image when we're going down the wet-ink path —
  // for signature-exempt scripts the signature line renders "Signature Exempt".
  const sigBuf = data.signatureExempt ? null : await fetchSignatureBuffer(data.signatureUrl)
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.rect(0, 0, doc.page.width, 70).fill('#0B6E76')
    doc.fillColor('white').font('Helvetica-Bold').fontSize(22).text('Tere Health', 50, 20)
    doc.font('Helvetica').fontSize(10).text('terehealth.co.nz', 50, 46)

    doc.fillColor('#0B6E76').font('Helvetica-Bold').fontSize(16).text('PRESCRIPTION', 50, 90)
    doc.moveTo(50, 110).lineTo(doc.page.width - 50, 110).strokeColor('#0B6E76').lineWidth(1).stroke()

    doc.fillColor('#333').font('Helvetica-Bold').fontSize(10).text('Prescriber', 50, 120)
    doc.font('Helvetica').fontSize(10)
      .text(data.providerName || 'Tere Clinician', 50, 134)
      .text(`Prescriber No: ${data.prescriberNumber || '—'}`, 50, 148)
      .text('Tere Health Limited · terehealth.co.nz', 50, 162)
    // Prescriber contact — DG authorisation requires an address the pharmacy
    // can use to verify identity or request amendments. Always the central
    // monitored inbox so scripts don't route replies to a provider's personal
    // email; provider identity is uniquely pinned by the MCNZ number above.
    doc.fillColor('#555').fontSize(9).text('Contact: terehealthnz@gmail.com', 50, 176)

    if (data.approvedByName) {
      doc.fillColor('#065F46').font('Helvetica-Bold').fontSize(9)
        .text(`Countersigned by: ${data.approvedByName}`, 50, 189)
    }

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#333').text('Patient', 300, 120)
    doc.font('Helvetica').fontSize(10)
      .text(data.patientName, 300, 134)
      .text(`NHI: ${data.patientNhi || '—'}`, 300, 148)
      .text(`DOB: ${data.patientDob || '—'}`, 300, 162)
    doc.text(`Date: ${new Date().toLocaleDateString('en-NZ', { day: '2-digit', month: 'long', year: 'numeric' })}`, 300, 176)

    doc.moveTo(50, 210).lineTo(doc.page.width - 50, 210).strokeColor('#DDD').lineWidth(0.5).stroke()

    doc.fillColor('#0B6E76').font('Helvetica-Bold').fontSize(14).text('℞', 50, 225)
    doc.fillColor('#1A2A33').fontSize(13).text(data.drug, 75, 225)
    doc.fillColor('#555').font('Helvetica').fontSize(10)
      .text(`Dose: ${data.dose || '—'}`, 75, 242)
      .text(`Directions: ${data.directions || '—'}`, 75, 256)
      .text(`Quantity: ${data.quantity || '—'}`, 75, 270)
      .text(`Repeats: ${data.repeats || 0}`, 75, 284)

    doc.moveTo(50, 305).lineTo(doc.page.width - 50, 305).strokeColor('#DDD').lineWidth(0.5).stroke()

    doc.fillColor('#333').font('Helvetica-Bold').fontSize(10).text('Dispensing Pharmacy', 50, 315)
    doc.font('Helvetica').fontSize(10).fillColor('#555')
      .text(data.pharmacyName || "Patient's preferred pharmacy", 50, 329)
    if (data.pharmacyAddress) doc.text(data.pharmacyAddress, 50, 343)

    // DG authorisation statement — verbatim quote required when using the
    // signature-exempt path. Rendered as a bordered callout above the
    // signature line so pharmacists can spot it at a glance.
    if (data.signatureExempt) {
      const stmtY = 375
      doc.rect(50, stmtY, doc.page.width - 100, 34).lineWidth(0.8).strokeColor('#0B6E76').stroke()
      doc.fillColor('#0B6E76').font('Helvetica-Oblique').fontSize(8.5)
        .text(DG_SIGNATURE_EXEMPT_STATEMENT, 58, stmtY + 6, { width: doc.page.width - 116, lineGap: 1 })
    }

    const sigY = 440
    // Prescriber signature — four paths, checked in order:
    //   1. signatureText override (sample/demo PDFs only — italic-font text
    //      stand-in when we don't want to ship a real signature image)
    //   2. signature-exempt (DG authorisation): render "Signature Exempt" label
    //   3. signed with uploaded image
    //   4. signed with blank line (image fetch failed or none on file)
    if (data.signatureText) {
      doc.fillColor('#1A2A33').font('Helvetica-Oblique').fontSize(20)
        .text(String(data.signatureText), 55, sigY - 26)
    } else if (data.signatureExempt) {
      doc.fillColor('#0B6E76').font('Helvetica-Bold').fontSize(11).text('Signature Exempt', 50, sigY - 16)
    } else if (sigBuf) {
      try {
        doc.image(sigBuf, 50, sigY - 40, { fit: [170, 40], align: 'center' })
      } catch { /* fall through to line */ }
    }
    doc.moveTo(50, sigY).lineTo(220, sigY).strokeColor('#999').lineWidth(0.5).stroke()
    doc.fillColor('#999').font('Helvetica').fontSize(9).text('Prescriber signature', 50, sigY + 4)
    doc.moveTo(300, sigY).lineTo(doc.page.width - 50, sigY).strokeColor('#999').lineWidth(0.5).stroke()
    doc.text('Date', 300, sigY + 4)
    doc.font('Helvetica').fontSize(9).fillColor('#333').text(new Date().toLocaleDateString('en-NZ'), 305, sigY - 12)

    doc.fillColor('#AAA').fontSize(8)
      .text('This prescription was electronically issued by Tere Health Limited. Not valid if altered.', 50, doc.page.height - 50, { align: 'center', width: doc.page.width - 100 })

    // Optional diagonal watermark (used only for sample / demo PDFs that
    // are shared with pharmacies for format review before go-live). Renders
    // last so it sits on top of every other element.
    if (data.watermark) {
      doc.save()
      doc.translate(doc.page.width / 2, doc.page.height / 2)
      doc.rotate(-30)
      doc.fillColor('#DC2626', 0.22)
      doc.font('Helvetica-Bold').fontSize(72)
      doc.text(String(data.watermark), -doc.page.width / 2, -40, { width: doc.page.width, align: 'center' })
      doc.restore()
    }

    doc.end()
  })
}

export async function buildReferralPdf(data) {
  const sigBuf = await fetchSignatureBuffer(data.signatureUrl)
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const W       = doc.page.width
    const LEFT    = 50
    const RIGHT   = W - 50
    const LABEL_W = 160

    // Header — Tere brand + "eReferral". Embeds tere-logo.png on the right
    // to (a) look properly branded and (b) push file size past the 10 KB
    // filter RHCNZ (and likely other imaging providers) use in their auto-
    // routing pipelines (Holly Johnson feedback 2026-08-17).
    doc.rect(0, 0, W, 70).fill('#0B6E76')
    doc.fillColor('white').font('Helvetica-Bold').fontSize(22).text('Tere Health', LEFT, 20)
    doc.font('Helvetica').fontSize(10).text('terehealth.co.nz · Tere Health Limited · HPI-O G11238-E', LEFT, 46)
    const logo = tereLogoBuffer()
    if (logo) {
      try { doc.image(logo, RIGHT - 60, 10, { fit: [50, 50], align: 'right' }) } catch {}
    } else {
      doc.font('Helvetica-Bold').fontSize(14).text('eReferral', RIGHT - 100, 30, { width: 100, align: 'right' })
    }

    let y = 90

    // Helper — draws a "SECTION NAME" bar
    const sectionBar = (label) => {
      doc.rect(LEFT, y, RIGHT - LEFT, 18).fill('#0B6E76')
      doc.fillColor('white').font('Helvetica-Bold').fontSize(10).text(label, LEFT + 8, y + 4)
      y += 22
    }

    // Helper — draws a label:value row (wraps value)
    const row = (label, value, opts = {}) => {
      const v = (value == null || value === '') ? '—' : String(value)
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#333').text(label, LEFT, y, { width: LABEL_W })
      const color = opts.color || '#1A2A33'
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(color)
        .text(v, LEFT + LABEL_W + 8, y, { width: RIGHT - LEFT - LABEL_W - 8 })
      const h = doc.heightOfString(v, { width: RIGHT - LEFT - LABEL_W - 8, fontSize: 9 })
      y += Math.max(14, h + 4)
    }

    // ── Section 1: Referral details ─────────────────────────────────
    sectionBar('REFERRAL DETAILS')
    row('Referral ID', data.referralId)
    row('Referred To', data.facilityName)
    // Force NZ time — otherwise the server's local timezone (LA when Patrick
    // runs it) leaks into the "Referral Sent" line and RHCNZ sees yesterday's
    // date (Holly feedback 2026-08-17).
    row('Referral Sent', new Date().toLocaleString('en-NZ', {
      timeZone: 'Pacific/Auckland',
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }))
    y += 6

    // ── Section 2: Patient details ──────────────────────────────────
    sectionBar('PATIENT DETAILS')
    const [firstName, ...restNames] = String(data.patientName || '').trim().split(/\s+/)
    const lastName = restNames.pop() || ''
    row('Surname', lastName)
    row('First name(s)', [firstName, ...restNames].join(' '))
    if (data.patientPreferredName) row('Preferred name', data.patientPreferredName)
    row('Gender', data.patientGender)
    row('Date of Birth', data.patientDob)
    if (data.patientEthnicity) row('Ethnicities', data.patientEthnicity)
    row('NHI Number', data.patientNhi)
    if (data.cscNumber) row('CSC', data.cscNumber)
    row('Phone (Home)', data.patientPhoneHome)
    row('Phone (Mobile)', data.patientPhoneMobile)
    row('Address', data.patientAddress)
    y += 6

    // ── Section 3: Funding ──────────────────────────────────────────
    sectionBar('FUNDING')
    const accYesNo = data.accClaimNumber ? 'YES' : 'NO'
    row('ACC', accYesNo, { color: data.accClaimNumber ? '#065F46' : '#1A2A33', bold: true })
    if (data.accClaimNumber) row('ACC Number', data.accClaimNumber)
    if (data.dateOfInjury) row('Date of injury', data.dateOfInjury)
    if (data.otherFundingPathway) row('Other funding pathway', data.otherFundingPathway)
    y += 6

    // ── Section 4: Examination & clinical ───────────────────────────
    if (y > doc.page.height - 200) { doc.addPage(); y = 50 }
    sectionBar('EXAMINATION & CLINICAL DETAILS')
    row('Examination requested', `${data.investigation || ''}${data.bodyPart ? ' — ' + data.bodyPart : ''}`, { bold: true })
    row('Clinical details', data.clinicalIndication)
    if (data.history) row('Relevant history', data.history)
    y += 6

    // ── Section 5: Referrer & report ────────────────────────────────
    if (y > doc.page.height - 180) { doc.addPage(); y = 50 }
    sectionBar('REFERRER & REPORT DETAILS')
    const urgencyColor = String(data.urgency || '').toLowerCase().includes('urgent') ? '#DC2626'
                       : String(data.urgency || '').toLowerCase().includes('semi')   ? '#D97706' : '#059669'
    row('Urgency', data.urgency || 'Routine', { bold: true, color: urgencyColor })
    row('Referrer Name', data.providerName)
    row('Referrer Phone', data.providerPhone)
    row('Referrer NZMC', data.providerMcnz || data.providerCpn)
    row('Practice Name', 'Tere Health Limited')
    row('Practice Address', '41 Adams Lane, Springlands, Blenheim 7201, New Zealand')
    row('Practice Dispatch', data.referrerMoShortcode || 'G11238-E')
    if (data.copyToDoctor) row('Additional Report To', data.copyToDoctor)

    if (data.approvedByName) {
      y += 8
      doc.fillColor('#065F46').font('Helvetica-Bold').fontSize(9)
        .text(`Countersigned by: ${data.approvedByName}`, LEFT, y)
      y += 14
    }

    // Signature block near page bottom
    const sigY = Math.max(y + 30, doc.page.height - 120)
    if (sigBuf) {
      try { doc.image(sigBuf, LEFT, sigY - 40, { fit: [170, 40] }) } catch {}
    }
    doc.moveTo(LEFT, sigY).lineTo(LEFT + 170, sigY).strokeColor('#999').lineWidth(0.5).stroke()
    doc.fillColor('#999').font('Helvetica').fontSize(9).text('Referring clinician signature', LEFT, sigY + 4)
    doc.moveTo(300, sigY).lineTo(RIGHT, sigY).strokeColor('#999').lineWidth(0.5).stroke()
    doc.text('Date', 300, sigY + 4)
    doc.font('Helvetica').fontSize(9).fillColor('#333').text(
      new Date().toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland' }), 305, sigY - 12
    )

    doc.fillColor('#AAA').fontSize(8)
      .text('Electronically issued by Tere Health Limited · For clinical use only', LEFT, doc.page.height - 50, { align: 'center', width: RIGHT - LEFT })

    doc.end()
  })
}

export function buildPayslipPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const W = doc.page.width

    // Header
    doc.rect(0, 0, W, 70).fill('#0D2B45')
    doc.fillColor('white').font('Helvetica-Bold').fontSize(22).text('Tere Health Limited', 50, 16)
    doc.font('Helvetica').fontSize(10).text('terehealth.co.nz', 50, 42)
    doc.fontSize(9).fillColor('rgba(212,238,240,0.7)').text('Not GST-registered (medical services exempt s21 GSTA 1985)  ·  terehealthnz@gmail.com', 50, 56)

    // Title
    const fmtDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-NZ', { day: '2-digit', month: 'long', year: 'numeric' })
    doc.fillColor('#0B6E76').font('Helvetica-Bold').fontSize(18).text('EARNINGS STATEMENT', 50, 90)
    doc.moveTo(50, 112).lineTo(W - 50, 112).strokeColor('#0B6E76').lineWidth(1.5).stroke()

    // Provider & period details
    const provName = [data.provider?.first_name, data.provider?.last_name, data.provider?.credential].filter(Boolean).join(' ') || 'Provider'
    doc.fillColor('#333').font('Helvetica-Bold').fontSize(10).text('Contractor', 50, 124)
    doc.font('Helvetica').fontSize(11).fillColor('#1A2A33').text(provName, 50, 138)
    if (data.provider?.email) doc.fontSize(9).fillColor('#6B7280').text(data.provider.email, 50, 152)

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#333').text('Pay Period', 320, 124)
    doc.font('Helvetica').fontSize(11).fillColor('#1A2A33')
      .text(`${fmtDate(data.period_start)}`, 320, 138)
      .text(`to ${fmtDate(data.period_end)}`, 320, 152)
    doc.fontSize(9).fillColor('#6B7280').text(`Issued: ${new Date().toLocaleDateString('en-NZ', { day: '2-digit', month: 'long', year: 'numeric' })}`, 320, 166)

    doc.moveTo(50, 186).lineTo(W - 50, 186).strokeColor('#E2E8F0').lineWidth(0.5).stroke()

    // Earnings summary box — flat per-consult rate per provider.
    const rate = Number(data.base_rate ?? 25)

    let y = 200
    doc.rect(50, y, W - 100, 90).fill('#F0F9FA').stroke('#D4EEF0')
    doc.fillColor('#0D2B45').font('Helvetica-Bold').fontSize(11).text('Earnings Summary', 66, y + 12)

    const row = (label, value, bold = false, yOff = 0) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor(bold ? '#0D2B45' : '#374151')
        .text(label, 66, y + yOff)
        .text(value, W - 160, y + yOff, { width: 110, align: 'right' })
    }
    row(`${data.consultation_count} consultations × $${rate.toFixed(2)}`, `$${Number(data.total_amount).toFixed(2)}`, false, 34)
    doc.moveTo(66, y + 54).lineTo(W - 66, y + 54).strokeColor('#B0D4D8').lineWidth(0.5).stroke()
    row('Total', `$${Number(data.total_amount).toFixed(2)}`, true, 62)
    y += 106

    // Per-consultation breakdown table
    if ((data.consultations || []).length > 0) {
      doc.fillColor('#0D2B45').font('Helvetica-Bold').fontSize(11).text('Consultation Breakdown', 50, y)
      y += 18

      // Table header
      doc.rect(50, y, W - 100, 18).fill('#0D2B45')
      doc.fillColor('white').font('Helvetica-Bold').fontSize(8)
        .text('Date', 58, y + 5)
        .text('Type', 150, y + 5)
        .text('Patient', 230, y + 5)
        .text('Fee', W - 100, y + 5, { width: 46, align: 'right' })
      y += 18

      let shade = false
      for (const c of data.consultations) {
        if (y > doc.page.height - 120) {
          doc.addPage()
          y = 50
        }
        if (shade) doc.rect(50, y, W - 100, 16).fill('#F8FAFC')
        shade = !shade
        const dateStr = new Date(c.created_at).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short' })
        const initials = `${(c.patient_first_name || '').charAt(0)}${(c.patient_last_name || '').charAt(0)}.`
        const typeKey = c.consultation_type || 'video'
        const type = typeKey.charAt(0).toUpperCase() + typeKey.slice(1)
        doc.fillColor('#374151').font('Helvetica').fontSize(8)
          .text(dateStr, 58, y + 4)
          .text(type, 150, y + 4)
          .text(initials, 230, y + 4)
          .text(`$${rate.toFixed(2)}`, W - 100, y + 4, { width: 46, align: 'right' })
        y += 16
      }

      // Totals row
      doc.rect(50, y, W - 100, 18).fill('#E8F4F5')
      doc.fillColor('#0D2B45').font('Helvetica-Bold').fontSize(8)
        .text(`Total: ${data.consultation_count} consultations`, 58, y + 5)
        .text(`$${Number(data.total_amount).toFixed(2)}`, W - 100, y + 5, { width: 46, align: 'right' })
      y += 30
    }

    // Disclaimers
    if (y > doc.page.height - 180) { doc.addPage(); y = 50 }
    y = Math.max(y, doc.page.height - 170)

    doc.moveTo(50, y).lineTo(W - 50, y).strokeColor('#E2E8F0').lineWidth(0.5).stroke()
    y += 10

    doc.fillColor('#555').font('Helvetica-Bold').fontSize(8).text('Contractor services', 50, y)
    y += 12
    doc.font('Helvetica').fontSize(7.5).fillColor('#777')
      .text('This is a record of contractor earnings at flat per-consultation rates. As a contractor you are not entitled to statutory holiday pay under the Holidays Act 2003; the per-consult rate reflects this.', 50, y, { width: W - 100 })
    y += 14
    doc.text('This payment is for contractor services. As a contractor you are responsible for your own tax obligations. Tere Health Limited does not deduct PAYE. Please consult a tax adviser regarding your obligations.', 50, y, { width: W - 100 })
    y += 28

    doc.fillColor('#AAA').fontSize(7.5)
      .text('Tere Health Limited  ·  terehealth.co.nz', 50, y, { align: 'center', width: W - 100 })

    doc.end()
  })
}

// ACC invoice PDF — sent to providerinvoices@acc.co.nz per Megan Trezise's
// billing guide (2026-08-17). Not a "Tax Invoice" — Tere Health Limited is
// NOT GST-registered (medical services are exempt under s21 GSTA 1985 so
// there's no compulsory registration threshold to worry about). The IRD
// invoice rules still apply for record-keeping (vendor + client + date +
// amount + service code + quantity), and the exemption line is called out
// explicitly so ACC's finance team doesn't code the invoice as GST-inclusive.
export function buildAccInvoicePdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const W = doc.page.width
    const LEFT = 50
    const RIGHT = W - 50
    const nzDate = (d) => {
      const dt = d ? new Date(d) : new Date()
      return dt.toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: 'long', year: 'numeric' })
    }
    const nzInvoiceRef = () => {
      const dt = new Date()
      const s = dt.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      return 'INV-' + s.replace(/[^0-9]/g, '').slice(0, 12)
    }
    const invoiceRef = data.invoiceRef || nzInvoiceRef()
    const amountDollars = (data.amountCents / 100).toFixed(2)

    // Header — Tere brand strip + logo
    doc.rect(0, 0, W, 80).fill('#0B6E76')
    doc.fillColor('white').font('Helvetica-Bold').fontSize(22).text('Tere Health', LEFT, 22)
    doc.font('Helvetica').fontSize(9).text('terehealth.co.nz · Tere Health Limited', LEFT, 50)
    doc.text('HPI-O G11238-E · ACC Vendor G11238 · NZBN 9429053723413', LEFT, 63)
    try {
      const logo = tereLogoBuffer()
      if (logo) doc.image(logo, RIGHT - 60, 15, { fit: [50, 50], align: 'right' })
    } catch {}

    doc.fillColor('#0B6E76').font('Helvetica-Bold').fontSize(20).text('Invoice', LEFT, 100)
    doc.font('Helvetica').fontSize(9).fillColor('#6B7280').text(`Reference: ${invoiceRef}`, LEFT, 128)
    doc.text(`Issued: ${nzDate()}`, LEFT, 141)

    // Bill-to (ACC)
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0D2B45').text('Bill to', LEFT, 170)
    doc.font('Helvetica').fontSize(10).fillColor('#1A2A33')
      .text('ACC (Accident Compensation Corporation)', LEFT, 184)
      .text('providerinvoices@acc.co.nz', LEFT, 198)

    // Vendor (Tere)
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0D2B45').text('Vendor', 320, 170)
    doc.font('Helvetica').fontSize(10).fillColor('#1A2A33')
      .text('Tere Health Limited', 320, 184)
      .text('ACC Vendor ID: G11238', 320, 198)
      .text('NZBN 9429053723413', 320, 212)

    // Line items table
    let y = 240
    doc.rect(LEFT, y, RIGHT - LEFT, 22).fill('#0D2B45')
    doc.fillColor('white').font('Helvetica-Bold').fontSize(9)
      .text('CLIENT / SERVICE',     LEFT + 8,  y + 6)
      .text('DATE OF SERVICE',      280,       y + 6)
      .text('CODE',                 400,       y + 6)
      .text('AMOUNT NZD',           RIGHT - 90, y + 6, { width: 82, align: 'right' })
    y += 26

    // Client line 1: name + claim number
    doc.fillColor('#0D2B45').font('Helvetica-Bold').fontSize(10)
      .text(data.patientName || '(client name)', LEFT + 8, y)
    doc.font('Helvetica').fontSize(9).fillColor('#374151')
      .text(`Claim #: ${data.claimNumber || '(pending — patient-supplied)'}`, LEFT + 8, y + 14)
    if (data.patientNhi) doc.text(`NHI: ${data.patientNhi}`, LEFT + 8, y + 27)

    doc.fillColor('#1A2A33').font('Helvetica').fontSize(9)
      .text(nzDate(data.dateOfService), 280, y + 4)
      .text(data.serviceCode || '—',    400, y + 4)
      .text(`$${amountDollars}`,        RIGHT - 90, y + 4, { width: 82, align: 'right' })
    y += 48

    // Service description
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor('#E5E7EB').lineWidth(0.5).stroke()
    y += 8
    const svcLabel = data.serviceCode === 'MST3' ? 'Follow-up specialist telehealth consultation'
                    : data.serviceCode === 'MST1' ? 'Initial specialist telehealth consultation'
                    : 'Specialist telehealth consultation'
    doc.font('Helvetica').fontSize(9).fillColor('#6B7280').text(`Service: ${svcLabel}`, LEFT + 8, y)
    doc.text(`Clinician: ${data.providerName || 'Tere Health provider'}${data.providerHpi ? ` · HPI ${data.providerHpi}` : ''}`, LEFT + 8, y + 14)
    y += 40

    // Total
    doc.rect(LEFT, y, RIGHT - LEFT, 30).fill('#F0F9FA')
    doc.fillColor('#0D2B45').font('Helvetica-Bold').fontSize(11).text('Total payable', LEFT + 12, y + 9)
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#0B6E76').text(`$${amountDollars} NZD`, RIGHT - 130, y + 6, { width: 120, align: 'right' })
    y += 40

    // GST exemption statement
    doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#6B7280').text(
      'Medical services provided by a registered medical practitioner. Exempt from GST under s21 of the Goods and Services Tax Act 1985. Tere Health Limited is not GST-registered; no GST applies to this invoice.',
      LEFT + 4, y + 6, { width: RIGHT - LEFT - 8 }
    )
    y += 40

    // Payment details footer
    doc.rect(LEFT, y, RIGHT - LEFT, 60).lineWidth(0.5).strokeColor('#E5E7EB').stroke()
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#0D2B45').text('Payment', LEFT + 8, y + 8)
    doc.font('Helvetica').fontSize(8.5).fillColor('#374151')
      .text('Payee: Tere Health Limited (ACC Vendor G11238)', LEFT + 8, y + 22)
      .text('Bank details on file with ACC — please pay to the account registered against vendor G11238.', LEFT + 8, y + 34)
      .text('Queries: terehealthnz@gmail.com  ·  +64 29 043 234 27', LEFT + 8, y + 46)

    // Bottom disclaimer
    doc.fillColor('#AAA').fontSize(7.5)
      .text('Tere Health Limited · terehealth.co.nz · Electronically issued', LEFT, doc.page.height - 40, { align: 'center', width: RIGHT - LEFT })

    doc.end()
  })
}

// Insurance-formatted receipt PDF — the $10 upsell delivered from
// /api/generate-insurance-receipt. Contains everything a private health
// insurer needs to reimburse the patient: Tere legal entity + IRD/GST
// (placeholders for now), provider name + MCNZ registration + type,
// consult date/time in NZ tz, chief complaint, diagnosis code, amount
// paid, payment method + card last-4, and the mandated telehealth
// disclosure statement.
//
// Expected data:
//   consult:  { created_at, chief_complaint, acc_read_code, notes_final,
//               payment_amount, patient_first_name, patient_last_name }
//   provider: { first_name, last_name, credential, provider_type,
//               mcnz_registration_number, prescriber_number }
//   payment:  { method, card_brand, card_last4, amount_cents, receipt_id,
//               charged_at }
export function buildInsuranceReceiptPdf({ consult, provider, payment }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const W = doc.page.width
    const M = 50

    // Header band — same teal + wordmark as the prescription/referral PDFs
    doc.rect(0, 0, W, 70).fill('#0B6E76')
    doc.fillColor('white').font('Helvetica-Bold').fontSize(22).text('Tere Health', M, 20)
    doc.font('Helvetica').fontSize(10).text('terehealth.co.nz', M, 46)
    doc.fillColor('rgba(255,255,255,0.75)').fontSize(9)
      .text('Insurance Receipt', W - M - 140, 26, { width: 140, align: 'right' })

    doc.fillColor('#0B6E76').font('Helvetica-Bold').fontSize(16).text('TAX INVOICE / RECEIPT', M, 90)
    doc.moveTo(M, 110).lineTo(W - M, 110).strokeColor('#0B6E76').lineWidth(1).stroke()

    // Provider (issuer) — Tere legal entity. Tere is NOT GST-registered:
    // medical services are exempt under s21 GSTA 1985, so no compulsory
    // registration threshold applies. Insurers reimbursing a patient just
    // need the NZBN + practice details, not a GST number.
    doc.fillColor('#333').font('Helvetica-Bold').fontSize(10).text('Issued by', M, 120)
    doc.font('Helvetica').fontSize(10)
      .text('Tere Health Limited', M, 134)
      .text('NZBN: 9429053723413', M, 148)
      .text('Not GST-registered (medical services exempt s21 GSTA 1985)', M, 162)
      .text('Marlborough Sounds, New Zealand', M, 176)

    // Receipt meta
    const receiptId = payment.receipt_id || '—'
    const chargedAt = payment.charged_at ? new Date(payment.charged_at) : new Date()
    doc.fillColor('#333').font('Helvetica-Bold').fontSize(10).text('Receipt', 320, 120)
    doc.font('Helvetica').fontSize(10)
      .text(`No: ${receiptId}`, 320, 134)
      .text(`Issued: ${chargedAt.toLocaleDateString('en-NZ', { day: '2-digit', month: 'long', year: 'numeric' })}`, 320, 148)

    // Patient — NHI is the primary NZ identifier used for insurance/ACC
    // reconciliation, so it sits directly under the name.
    const patientName = `${consult.patient_first_name || ''} ${consult.patient_last_name || ''}`.trim() || '—'
    const patientNhi  = consult.patient_nhi || '—'
    doc.moveTo(M, 210).lineTo(W - M, 210).strokeColor('#DDD').lineWidth(0.5).stroke()
    doc.fillColor('#333').font('Helvetica-Bold').fontSize(10).text('Patient', M, 220)
    doc.font('Helvetica').fontSize(10).text(patientName, M, 234)
    doc.font('Helvetica').fontSize(9).fillColor('#666').text(`NHI: ${patientNhi}`, M, 250)

    // Service provider (the doctor)
    const provName = [provider.first_name, provider.last_name, provider.credential].filter(Boolean).join(' ') || 'Tere clinician'
    const provType = provider.provider_type === 'rmo' ? 'Resident Medical Officer'
                   : provider.provider_type === 'senior' ? 'Vocationally registered doctor'
                   : (provider.provider_type || 'Medical practitioner')
    const mcnzNo = provider.mcnz_registration_number || provider.prescriber_number || '—'
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#333').text('Attending clinician', 320, 220)
    doc.font('Helvetica').fontSize(10)
      .text(provName, 320, 234)
      .text(`MCNZ registration: ${mcnzNo}`, 320, 248)
      .text(provType, 320, 262)

    // Consultation details
    doc.moveTo(M, 285).lineTo(W - M, 285).strokeColor('#DDD').lineWidth(0.5).stroke()
    doc.fillColor('#0B6E76').font('Helvetica-Bold').fontSize(12).text('Consultation', M, 295)
    const consultDate = consult.created_at ? new Date(consult.created_at) : new Date()
    // Force NZ timezone display — insurers in NZ expect Pacific/Auckland.
    const nzDateStr = consultDate.toLocaleString('en-NZ', {
      timeZone: 'Pacific/Auckland',
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
    doc.fillColor('#333').font('Helvetica-Bold').fontSize(10).text('Date & time (NZ)', M, 315)
    doc.font('Helvetica').fontSize(10).fillColor('#1A2A33').text(nzDateStr, M, 329)

    // Chief complaint
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#333').text('Presenting complaint', M, 349)
    doc.font('Helvetica').fontSize(10).fillColor('#1A2A33')
      .text(consult.chief_complaint || '—', M, 363, { width: W - M * 2 })
    let y = doc.y + 8

    // Diagnosis / Read code — prefer explicit acc_read_code, otherwise pull
    // from the structured notes_final if present, otherwise fall back to
    // the standard "see attached provider notes" line.
    let diagnosis = consult.acc_read_code || null
    if (!diagnosis && consult.notes_final) {
      try {
        const notes = typeof consult.notes_final === 'string' ? JSON.parse(consult.notes_final) : consult.notes_final
        diagnosis = notes?.accReadCode || notes?.diagnosis || notes?.icd10 || null
      } catch { /* ignore parse errors */ }
    }
    if (!diagnosis) diagnosis = 'See attached provider notes'
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#333').text('Diagnosis / Read code', M, y)
    doc.font('Helvetica').fontSize(10).fillColor('#1A2A33').text(diagnosis, M, y + 14, { width: W - M * 2 })
    y = doc.y + 12

    // Charge line-item table
    doc.moveTo(M, y).lineTo(W - M, y).strokeColor('#DDD').lineWidth(0.5).stroke()
    y += 10
    doc.fillColor('#0B6E76').font('Helvetica-Bold').fontSize(12).text('Charge', M, y)
    y += 20

    const amountCents = Number(payment.amount_cents || consult.payment_amount || 0)
    const amountDollars = (amountCents / 100).toFixed(2)
    doc.rect(M, y, W - M * 2, 20).fill('#0D2B45')
    doc.fillColor('white').font('Helvetica-Bold').fontSize(9)
      .text('Item', M + 8, y + 6)
      .text('Amount (NZD)', W - M - 100, y + 6, { width: 90, align: 'right' })
    y += 20
    doc.rect(M, y, W - M * 2, 22).fill('#F8FAFC')
    doc.fillColor('#1A2A33').font('Helvetica').fontSize(10)
      .text('Telehealth consultation', M + 8, y + 6)
      .text(`$${amountDollars}`, W - M - 100, y + 6, { width: 90, align: 'right' })
    y += 22
    doc.rect(M, y, W - M * 2, 22).fill('#E8F4F5')
    doc.fillColor('#0D2B45').font('Helvetica-Bold').fontSize(10)
      .text('Total paid', M + 8, y + 6)
      .text(`$${amountDollars}`, W - M - 100, y + 6, { width: 90, align: 'right' })
    y += 32

    // GST note — placeholder pending IRD/GST registration decision.
    doc.fillColor('#6B7280').font('Helvetica-Oblique').fontSize(8.5)
      .text('GST treatment: health services are exempt from GST under s21 of the Goods and Services Tax Act 1985.',
        M, y, { width: W - M * 2 })
    y = doc.y + 12

    // Payment method
    const method = payment.method || 'card'
    const cardBrand = payment.card_brand ? payment.card_brand.charAt(0).toUpperCase() + payment.card_brand.slice(1) : 'Card'
    const cardLast4 = payment.card_last4 ? ` ending ${payment.card_last4}` : ''
    doc.fillColor('#333').font('Helvetica-Bold').fontSize(10).text('Payment method', M, y)
    doc.font('Helvetica').fontSize(10).fillColor('#1A2A33')
      .text(method === 'card' ? `${cardBrand}${cardLast4}` : method, M, y + 14)
    y += 40

    // Compliance disclosure
    doc.moveTo(M, y).lineTo(W - M, y).strokeColor('#DDD').lineWidth(0.5).stroke()
    y += 10
    doc.fillColor('#0D2B45').font('Helvetica-Bold').fontSize(9).text('Statement of service', M, y)
    y += 14
    doc.font('Helvetica').fontSize(9.5).fillColor('#374151')
      .text('This is a receipt for a healthcare consultation delivered via Tere Health telehealth service in New Zealand. Retain this receipt for insurance reimbursement purposes.',
        M, y, { width: W - M * 2, lineGap: 2 })
    y = doc.y + 20

    // Footer
    doc.fillColor('#AAA').font('Helvetica').fontSize(8)
      .text('Tere Health Limited  ·  terehealth.co.nz  ·  Electronically issued — no signature required.',
        M, doc.page.height - 50, { align: 'center', width: W - M * 2 })

    doc.end()
  })
}

// MCNZ supervision plan — auto-generated at RMO onboarding time. Renders
// the MCNZ-facing plan (see docs/supervision-plan.md) filled in with the
// RMO's identifiers and the supervisor's identifiers + signature. RMO
// signs the paper copy.
//
// Expected data:
//   rmo: { first_name, last_name, mcnz_registration_number, scope_of_practice,
//          pgy_level, supervision_start_date }
//   supervisor: { first_name, last_name, prescriber_number, cpn, mobile,
//                 email, signature_url, specialty }
export async function buildSupervisionPlanPdf(data) {
  const supSig = await fetchSignatureBuffer(data.supervisor?.signature_url)
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const W = doc.page.width
    const M = 50
    let y = M

    // Header band
    doc.rect(0, 0, W, 70).fill('#0B6E76')
    doc.fillColor('white').font('Helvetica-Bold').fontSize(22).text('TERE HEALTH', M, 20)
    doc.font('Helvetica').fontSize(10).text('terehealth.co.nz', M, 46)
    y = 90

    doc.fillColor('#0B6E76').font('Helvetica-Bold').fontSize(18).text('Supervision Plan', M, y)
    y += 24
    doc.fillColor('#666').font('Helvetica-Oblique').fontSize(9.5)
      .text('As required by the Medical Council of New Zealand for a doctor practising within a supervised scope of registration.', M, y, { width: W - M * 2 })
    y += 26

    // Meta box
    doc.rect(M, y, W - M * 2, 46).fill('#F0F9FA')
    doc.fillColor('#0D2B45').font('Helvetica').fontSize(9)
    doc.text(`Practice: Tere Health Limited · terehealth.co.nz · Marlborough Sounds, New Zealand`, M + 10, y + 8)
    doc.text(`Plan version: v3 · ${new Date().toISOString().slice(0, 10)}`, M + 10, y + 22)
    doc.text(`Generated for: ${data.rmo?.first_name || ''} ${data.rmo?.last_name || ''}`, M + 10, y + 34)
    y += 60

    // Two-column table helper
    function row(label, value, opts = {}) {
      const rowH = opts.height || 22
      const labelW = 180
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#0D2B45')
        .text(label, M, y + 6, { width: labelW - 6 })
      doc.font('Helvetica').fontSize(9.5).fillColor('#1A2A33')
        .text(value || '_______________________________', M + labelW, y + 6, { width: W - M * 2 - labelW })
      doc.moveTo(M, y + rowH).lineTo(W - M, y + rowH).strokeColor('#E2E8F0').lineWidth(0.5).stroke()
      y += rowH
    }
    function heading(txt) {
      y += 8
      doc.fillColor('#0B6E76').font('Helvetica-Bold').fontSize(12).text(txt, M, y)
      y += 16
      doc.moveTo(M, y).lineTo(W - M, y).strokeColor('#0B6E76').lineWidth(1).stroke()
      y += 6
    }
    function paragraph(txt, opts = {}) {
      doc.fillColor('#1A2A33').font('Helvetica').fontSize(10)
        .text(txt, M, y, { width: W - M * 2, align: opts.align || 'left', lineGap: 2 })
      y = doc.y + 6
    }
    function bulletList(items) {
      doc.font('Helvetica').fontSize(10).fillColor('#1A2A33')
      for (const it of items) {
        doc.text('• ' + it, M + 8, y, { width: W - M * 2 - 8, lineGap: 2 })
        y = doc.y + 2
      }
      y += 4
    }

    // §1 Supervisee
    heading('1. Supervisee (RMO)')
    row('Name', `${data.rmo?.first_name || ''} ${data.rmo?.last_name || ''}`.trim())
    row('MCNZ registration number', data.rmo?.mcnz_registration_number)
    row('Scope of practice held', data.rmo?.scope_of_practice)
    row('PGY level at start', data.rmo?.pgy_level != null ? `PGY ${data.rmo.pgy_level}` : null)
    row('Supervision start date', data.rmo?.supervision_start_date
      ? new Date(data.rmo.supervision_start_date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
      : null)

    // §2 Supervisor
    heading('2. Supervisor')
    row('Name', `Dr ${data.supervisor?.first_name || ''} ${data.supervisor?.last_name || ''}`.trim())
    row('MCNZ prescriber number', data.supervisor?.prescriber_number)
    row('HPI-CPN', data.supervisor?.cpn)
    row('Vocational scope', data.supervisor?.specialty)
    row('Mobile', data.supervisor?.mobile)
    row('Email', data.supervisor?.email)

    // §3 Arrangement
    heading('3. Supervision arrangement')
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0D2B45').text('Method. ', M, y, { continued: true })
    doc.font('Helvetica').fillColor('#1A2A33')
      .text('Named supervisor, contactable by mobile phone (text or voice call) for the duration of every RMO shift. Response target for clinical questions ≤5 minutes. The supervisor need not be practising on the same platform at the same time — the standard is on-call availability, as it is for a senior doctor supervising a resident in a hospital.', { width: W - M * 2, lineGap: 2 })
    y = doc.y + 6

    // Page break check
    if (y > 720) { doc.addPage(); y = M }

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0D2B45').text('Meetings. ', M, y, { continued: true })
    doc.font('Helvetica').fillColor('#1A2A33')
      .text('Frequency and duration are agreed between the supervisor and the RMO at appointment, appropriate to the RMO\'s scope of registration and level of experience, and written in below. Cadence is reviewed as the RMO progresses.', { width: W - M * 2, lineGap: 2 })
    y = doc.y + 4
    doc.font('Helvetica-Oblique').fontSize(9.5).fillColor('#0D2B45')
      .text('Agreed cadence: ______________________________________________________________', M, y, { width: W - M * 2 })
    y = doc.y + 8

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0D2B45').text('Content of meetings. ', M, y, { continued: true })
    doc.font('Helvetica').fillColor('#1A2A33')
      .text('Review of cases the RMO has managed, prescribing decisions, complaints or concerns from patients or colleagues, and learning goals.', { width: W - M * 2, lineGap: 2 })
    y = doc.y + 6

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0D2B45').text('Documentation. ', M, y, { continued: true })
    doc.font('Helvetica').fillColor('#1A2A33')
      .text('Every meeting is logged with date, duration, cases reviewed, and actions agreed. The log is retained by Tere Health Limited and available to the Medical Council on request.', { width: W - M * 2, lineGap: 2 })
    y = doc.y + 8

    // §4 Scope
    if (y > 620) { doc.addPage(); y = M }
    heading('4. Scope of practice within Tere Health')
    paragraph('The RMO practises within the scope agreed at appointment. The following categories are held for supervisor consultation before a decision is finalised:')
    bulletList([
      'Prescriptions for controlled drugs, opioids, benzodiazepines, GLP-1 receptor agonists, stimulants, or hypnotics',
      'Presentations of chest pain, stroke symptoms, suspected sepsis or meningitis, acute psychosis, or suicidal ideation with plan or intent',
      'Paediatric patients under two years of age',
      'Any consultation the RMO judges to exceed their competence',
    ])
    paragraph('Scope may be broadened or narrowed at review meetings.')

    // §5 Reporting
    if (y > 640) { doc.addPage(); y = M }
    heading('5. Reporting to the Medical Council')
    paragraph('The supervisor will provide a supervision report to the Medical Council of New Zealand at the intervals required by the RMO\'s scope of registration.')

    // §6 Termination
    if (y > 640) { doc.addPage(); y = M }
    heading('6. Termination')
    paragraph('Supervision continues until the Medical Council removes the supervised-scope condition from the RMO\'s registration. The supervisor will file a final report with the Council within thirty days of termination.')

    // Signatures
    if (y > 540) { doc.addPage(); y = M }
    heading('Declarations')

    function signatureBlock(label, name, sigBuf) {
      doc.font('Helvetica').fontSize(9.5).fillColor('#1A2A33')
        .text(label, M, y, { width: W - M * 2, lineGap: 2 })
      y = doc.y + 22
      // Signature line + optional signature image
      const sigLineY = y
      if (sigBuf) {
        try { doc.image(sigBuf, M + 90, sigLineY - 32, { fit: [180, 30] }) } catch {}
      }
      doc.moveTo(M + 88, sigLineY).lineTo(M + 300, sigLineY).strokeColor('#666').lineWidth(0.5).stroke()
      doc.font('Helvetica').fontSize(8).fillColor('#666').text('Signature', M, sigLineY + 4)
      // Auto-name if we have one
      if (name) {
        doc.font('Helvetica').fontSize(8).fillColor('#666').text(name, M + 88, sigLineY + 4)
      }
      doc.moveTo(M + 360, sigLineY).lineTo(W - M, sigLineY).strokeColor('#666').lineWidth(0.5).stroke()
      doc.text('Date', M + 320, sigLineY + 4)
      // Auto-date for signed-by-Tere blocks (supervisor + director)
      if (name && sigBuf) {
        doc.font('Helvetica').fontSize(9).fillColor('#1A2A33')
          .text(new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }), M + 362, sigLineY - 12)
      }
      y = sigLineY + 26
    }

    signatureBlock(
      'I, the RMO named above, have read this plan and agree to work within its terms.',
      null, // RMO signs on paper
      null,
    )
    signatureBlock(
      `I, Dr ${data.supervisor?.first_name || ''} ${data.supervisor?.last_name || ''}, accept responsibility for the supervision arrangement described above.`,
      `Dr ${data.supervisor?.first_name || ''} ${data.supervisor?.last_name || ''}`.trim(),
      supSig,
    )

    // Footer note
    y += 12
    if (y > 780) { doc.addPage(); y = M }
    doc.fillColor('#666').font('Helvetica-Oblique').fontSize(8.5)
      .text('This document is filed with the Medical Council of New Zealand as part of the RMO\'s supervised-scope registration. A signed copy is retained by both parties and by Tere Health Limited.',
        M, y, { width: W - M * 2, align: 'center' })

    doc.end()
  })
}

// Job-offer letter — dual-signed PDF. Renders offer terms, applicant
// signature block, and Tere countersign block. Applicant signature comes
// from a canvas PNG data URL (no fetch); Tere signer's signature comes
// from providers.signature_url (routed through fetchSignatureBuffer, so
// the SSRF allowlist applies).
//
// Called at countersign time — before that the offer PDF doesn't exist yet.
export async function buildOfferPdf(data) {
  const {
    application = {},
    offer       = {},
    tereSigner  = {},   // { first_name, last_name, title, signature_url }
  } = data

  const tereSigBuf = await fetchSignatureBuffer(tereSigner.signature_url)

  // Applicant signature: PNG data URL from canvas. Guard against oversized
  // or non-PNG payloads (a big or malformed buffer will kill pdfkit).
  let applicantSigBuf = null
  const png = offer.applicant_signed_png
  if (png && typeof png === 'string' && png.startsWith('data:image/png;base64,')) {
    try {
      const raw = png.slice('data:image/png;base64,'.length)
      const buf = Buffer.from(raw, 'base64')
      if (buf.byteLength > 0 && buf.byteLength < 300_000) applicantSigBuf = buf
    } catch { /* leave null */ }
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end',  () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const W = doc.page.width
    const M = 50
    let y = M

    // Header band
    doc.rect(0, 0, W, 70).fill('#0B6E76')
    doc.fillColor('white').font('Helvetica-Bold').fontSize(22).text('TERE HEALTH', M, 20)
    doc.font('Helvetica').fontSize(10).text('terehealth.co.nz', M, 46)
    y = 90

    // Title + date
    doc.fillColor('#0B6E76').font('Helvetica-Bold').fontSize(18).text('Letter of Offer', M, y)
    y += 24
    const issued = offer.created_at ? new Date(offer.created_at) : new Date()
    doc.fillColor('#666').font('Helvetica').fontSize(10)
      .text(`Issued ${issued.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}`, M, y)
    y += 22

    // Addressee
    const fullName = [application.first_name, application.last_name].filter(Boolean).join(' ') || 'Applicant'
    doc.fillColor('#1A2A33').font('Helvetica').fontSize(11)
      .text(`Kia ora ${fullName},`, M, y)
    y = doc.y + 8

    doc.text(
      'On behalf of Tere Health Limited, I am pleased to offer you the following position with our team. Please read the terms carefully. If you accept, add your electronic signature below and we will countersign to complete the agreement.',
      M, y, { width: W - M * 2, lineGap: 3 })
    y = doc.y + 14

    // Terms box
    doc.rect(M, y, W - M * 2, 96).fill('#F0F9FA').fillColor('#0D2B45')
    doc.font('Helvetica-Bold').fontSize(10).text('Role', M + 12, y + 10)
    doc.font('Helvetica').fontSize(10.5).fillColor('#1A2A33').text(offer.role_title || '', M + 100, y + 10, { width: W - M * 2 - 110 })
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0D2B45').text('Compensation', M + 12, y + 34)
    doc.font('Helvetica').fontSize(10.5).fillColor('#1A2A33').text(offer.compensation || '', M + 100, y + 34, { width: W - M * 2 - 110 })
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0D2B45').text('Start date', M + 12, y + 58)
    const startTxt = offer.start_date
      ? new Date(offer.start_date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'To be agreed'
    doc.font('Helvetica').fontSize(10.5).fillColor('#1A2A33').text(startTxt, M + 100, y + 58, { width: W - M * 2 - 110 })
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0D2B45').text('Employer', M + 12, y + 78)
    doc.font('Helvetica').fontSize(10.5).fillColor('#1A2A33').text('Tere Health Limited', M + 100, y + 78, { width: W - M * 2 - 110 })
    y += 110

    // Terms body
    doc.fillColor('#0B6E76').font('Helvetica-Bold').fontSize(12).text('Terms of engagement', M, y)
    y += 18
    doc.moveTo(M, y - 2).lineTo(W - M, y - 2).strokeColor('#0B6E76').lineWidth(1).stroke()
    y += 4
    doc.fillColor('#1A2A33').font('Helvetica').fontSize(10)
      .text(offer.contract_terms || '', M, y, { width: W - M * 2, lineGap: 3 })
    y = doc.y + 20

    // Signature blocks — page-break if we're low.
    if (y > 620) { doc.addPage(); y = M }

    function signatureBlock(role, name, when, sigBuf) {
      doc.fillColor('#0B6E76').font('Helvetica-Bold').fontSize(11).text(role, M, y)
      y += 14
      const sigLineY = y + 42
      // If we have a signature image, place it above the line.
      if (sigBuf) {
        try { doc.image(sigBuf, M, y + 4, { fit: [220, 40] }) } catch { /* bad image, skip */ }
      }
      // Signature line
      doc.moveTo(M, sigLineY).lineTo(M + 260, sigLineY).strokeColor('#0D2B45').lineWidth(0.6).stroke()
      doc.moveTo(M + 300, sigLineY).lineTo(M + 480, sigLineY).strokeColor('#0D2B45').lineWidth(0.6).stroke()
      doc.font('Helvetica').fontSize(8).fillColor('#666')
      doc.text('Signature', M, sigLineY + 4)
      doc.text('Date', M + 300, sigLineY + 4)
      if (name) {
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#1A2A33')
          .text(name, M, sigLineY - 14)
      }
      if (when) {
        doc.font('Helvetica').fontSize(10).fillColor('#1A2A33')
          .text(new Date(when).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }), M + 342, sigLineY - 14)
      }
      y = sigLineY + 24
    }

    signatureBlock(
      'Signed by the candidate',
      offer.applicant_signed_name || fullName,
      offer.applicant_signed_at,
      applicantSigBuf,
    )
    if (y > 700) { doc.addPage(); y = M }
    const tereName = [tereSigner.first_name, tereSigner.last_name].filter(Boolean).join(' ').trim()
    signatureBlock(
      `Countersigned for Tere Health Limited${tereSigner.title ? ' — ' + tereSigner.title : ''}`,
      offer.countersigned_name || tereName || 'Tere Health',
      offer.countersigned_at,
      tereSigBuf,
    )

    // Footer
    y += 8
    if (y > 780) { doc.addPage(); y = M }
    doc.fillColor('#666').font('Helvetica-Oblique').fontSize(8.5)
      .text('This letter of offer is executed electronically. Both parties retain a copy. Please contact hello@terehealth.co.nz with any questions.',
        M, y, { width: W - M * 2, align: 'center' })

    doc.end()
  })
}

// ACC audit evidence bundle — single-deliverable PDF handed to an ACC
// auditor for one sampled claim. Wraps the JSON assembled by
// /api/acc-audit-bundle into a printable dossier: claim identity, patient
// identity, provider identity, injury coding, consent record, status
// timeline (converted → submitted → invoiced → paid/declined), linked
// prescriptions + radiology referrals, and every audit_logs access
// touching this claim. Chain-of-custody line at the bottom names the
// admin who exported the bundle + when + why (their reason code).
export function buildAccAuditBundlePdf(bundle) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const W = doc.page.width
    const H = doc.page.height
    const LEFT = 50
    const RIGHT = W - 50
    const CONTENT_W = RIGHT - LEFT

    const nzDateTime = (d) => {
      if (!d) return '—'
      try {
        return new Date(d).toLocaleString('en-NZ', {
          timeZone: 'Pacific/Auckland',
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
      } catch { return String(d) }
    }
    const nzDate = (d) => {
      if (!d) return '—'
      try {
        return new Date(d).toLocaleDateString('en-NZ', {
          timeZone: 'Pacific/Auckland',
          day: '2-digit', month: 'short', year: 'numeric',
        })
      } catch { return String(d) }
    }
    const dollars = (cents) => (Number.isFinite(cents) ? `$${(cents / 100).toFixed(2)}` : '—')

    // pageBreakIf: reserve room for next block; add page + reset y if not.
    const pageBreakIf = (y, needed) => (y + needed > H - 60 ? (doc.addPage(), 50) : y)

    // Section header helper
    const section = (y, title) => {
      y = pageBreakIf(y, 34)
      doc.fillColor('#0D2B45').font('Helvetica-Bold').fontSize(11).text(title.toUpperCase(), LEFT, y)
      doc.moveTo(LEFT, y + 15).lineTo(RIGHT, y + 15).strokeColor('#E5E7EB').lineWidth(0.5).stroke()
      return y + 22
    }

    // Key/value row helper — 2 cols per row.
    const kvGrid = (y, rows) => {
      const rowH = 18
      const colW = CONTENT_W / 2
      let cur = y
      for (let i = 0; i < rows.length; i += 2) {
        cur = pageBreakIf(cur, rowH)
        const [ka, va] = rows[i] || []
        const [kb, vb] = rows[i + 1] || []
        if (ka) {
          doc.fillColor('#6B7280').font('Helvetica').fontSize(8).text(ka.toUpperCase(), LEFT, cur)
          doc.fillColor('#1A2A33').font('Helvetica-Bold').fontSize(9.5).text(String(va ?? '—'), LEFT, cur + 10, { width: colW - 8 })
        }
        if (kb) {
          doc.fillColor('#6B7280').font('Helvetica').fontSize(8).text(kb.toUpperCase(), LEFT + colW, cur)
          doc.fillColor('#1A2A33').font('Helvetica-Bold').fontSize(9.5).text(String(vb ?? '—'), LEFT + colW, cur + 10, { width: colW - 8 })
        }
        cur += rowH + 8
      }
      return cur
    }

    // ── Header ────────────────────────────────────────────────────────────────
    doc.rect(0, 0, W, 80).fill('#0B6E76')
    doc.fillColor('white').font('Helvetica-Bold').fontSize(20).text('ACC Audit Bundle', LEFT, 22)
    doc.font('Helvetica').fontSize(9)
      .text('Tere Health Limited · ACC Vendor G11238 · HPI-O G11238-E · NZBN 9429053723413', LEFT, 50)
      .text('Prepared for ACC audit / review under s71 Accident Compensation Act 2001', LEFT, 63)
    try {
      const logo = tereLogoBuffer()
      if (logo) doc.image(logo, RIGHT - 60, 15, { fit: [50, 50], align: 'right' })
    } catch {}

    let y = 100
    doc.fillColor('#6B7280').font('Helvetica').fontSize(9)
      .text(`Generated ${nzDateTime(bundle.generated_at)} NZT by ${bundle.generated_by?.name || '—'} (${bundle.generated_by?.role || '—'})`, LEFT, y)
    doc.text(`Access reason: ${bundle.reason || '—'}${bundle.reason_notes ? ` · ${bundle.reason_notes}` : ''}`, LEFT, y + 12)
    y += 30

    // Time-in-care + financials rollup — visible at a glance.
    if (bundle.time_in_care || bundle.financials) {
      const tic = bundle.time_in_care
      const fin = bundle.financials
      const chips = [
        tic && `Days in care: ${tic.days_in_care}${tic.is_discharged ? ' (discharged)' : ' (open)'}`,
        fin && `Billed: ${dollars(fin.total_billed_cents)}`,
        fin && `Paid: ${dollars(fin.total_paid_cents)}`,
        fin && fin.delta_cents > 0 && `Outstanding: ${dollars(fin.delta_cents)}${fin.days_outstanding != null ? ` (${fin.days_outstanding}d)` : ''}`,
        fin && fin.claims_on_episode > 1 && `${fin.claims_on_episode} claims on episode`,
      ].filter(Boolean).join('   ·   ')
      doc.fillColor('#0B6E76').font('Helvetica-Bold').fontSize(9).text(chips, LEFT, y, { width: CONTENT_W })
      y += 20
    }
    y += 4

    // ── Claim identity ────────────────────────────────────────────────────────
    y = section(y, 'Claim')
    const claim = bundle.claim || {}
    y = kvGrid(y, [
      ['Claim number',   claim.claim_number],
      ['Invoice number', claim.invoice_number],
      ['Service code',   claim.service_code],
      ['Status',         claim.status],
      ['Amount claimed', dollars(claim.amount_claimed)],
      ['Amount paid',    claim.amount_paid != null ? dollars(claim.amount_paid) : '—'],
      ['Submitted',      nzDateTime(claim.submitted_at)],
      ['Paid',           nzDateTime(claim.paid_at)],
    ])
    if (claim.decline_reason) {
      y = pageBreakIf(y, 24)
      doc.fillColor('#DC2626').font('Helvetica-Bold').fontSize(9).text('Decline reason', LEFT, y)
      doc.fillColor('#1A2A33').font('Helvetica').fontSize(9.5).text(String(claim.decline_reason), LEFT, y + 12, { width: CONTENT_W })
      y += 34
    }

    // ── Patient ───────────────────────────────────────────────────────────────
    y = section(y, 'Patient')
    const p = bundle.patient || {}
    y = kvGrid(y, [
      ['Name',    [p.first_name, p.last_name].filter(Boolean).join(' ') || claim.patient_name],
      ['NHI',     p.nhi || claim.patient_nhi],
      ['DOB',     nzDate(p.dob)],
      ['Phone',   p.phone],
      ['Email',   p.email],
      ['Address', p.address],
    ])

    // ── Provider ──────────────────────────────────────────────────────────────
    y = section(y, 'Treating provider')
    const pv = bundle.provider || {}
    y = kvGrid(y, [
      ['Name',       [pv.first_name, pv.last_name].filter(Boolean).join(' ') || claim.provider_name],
      ['HPI-CPN',    pv.hpi_number || claim.provider_hpi],
      ['ACC number', pv.acc_provider_number],
      ['Type',       pv.provider_type],
    ])

    // ── Injury coding + consent ───────────────────────────────────────────────
    y = section(y, 'Injury coding & consent')
    const c = bundle.consultation || {}
    y = kvGrid(y, [
      ['Injury date',    nzDate(c.acc_injury_date)],
      ['Read code',      c.acc_read_code],
      ['Body part',      c.acc_body_part],
      ['Employer',       c.acc_employer],
      ['Consent obtained at', nzDateTime(c.acc_consent_obtained_at)],
      ['Consent by provider', c.acc_consent_by_provider_id],
    ])
    if (c.acc_injury_details) {
      y = pageBreakIf(y, 30)
      doc.fillColor('#6B7280').font('Helvetica').fontSize(8).text('MECHANISM', LEFT, y)
      doc.fillColor('#1A2A33').font('Helvetica').fontSize(9.5).text(String(c.acc_injury_details), LEFT, y + 12, { width: CONTENT_W })
      const bh = doc.heightOfString(String(c.acc_injury_details), { width: CONTENT_W })
      y += 16 + bh
    }
    if (!c.acc_consent_obtained_at) {
      y = pageBreakIf(y, 30)
      doc.fillColor('#92400E').font('Helvetica-Oblique').fontSize(9).text(
        '⚠ Discrete consent timestamp not recorded (predates 2026-09-02 consent capture rollout). Consent was obtained per Tere Health SOP and referenced in the clinical notes.',
        LEFT, y, { width: CONTENT_W }
      )
      y += 28
    }

    // ── Consultation summary ──────────────────────────────────────────────────
    y = section(y, 'Consultation')
    y = kvGrid(y, [
      ['Consultation id', c.id],
      ['Type',            c.consultation_type],
      ['Created',         nzDateTime(c.created_at)],
      ['Completed',       nzDateTime(c.completed_at)],
    ])
    if (c.chief_complaint) {
      y = pageBreakIf(y, 30)
      doc.fillColor('#6B7280').font('Helvetica').fontSize(8).text('CHIEF COMPLAINT', LEFT, y)
      doc.fillColor('#1A2A33').font('Helvetica').fontSize(9.5).text(String(c.chief_complaint), LEFT, y + 12, { width: CONTENT_W })
      y += 12 + doc.heightOfString(String(c.chief_complaint), { width: CONTENT_W }) + 6
    }

    // Clinical notes body — SOAP
    const soap = c.clinical_notes && typeof c.clinical_notes === 'object' ? c.clinical_notes : null
    if (soap) {
      const parts = [
        ['Subjective', soap.S], ['Objective', soap.O], ['Assessment', soap.A], ['Plan', soap.P],
      ].filter(([, v]) => v && String(v).trim())
      for (const [label, txt] of parts) {
        y = pageBreakIf(y, 40)
        doc.fillColor('#6B7280').font('Helvetica-Bold').fontSize(9).text(label, LEFT, y)
        doc.fillColor('#1A2A33').font('Helvetica').fontSize(9.5).text(String(txt), LEFT, y + 12, { width: CONTENT_W })
        y += 14 + doc.heightOfString(String(txt), { width: CONTENT_W }) + 8
      }
    } else if (c.doctor_notes) {
      y = pageBreakIf(y, 40)
      doc.fillColor('#6B7280').font('Helvetica-Bold').fontSize(9).text('Doctor notes', LEFT, y)
      doc.fillColor('#1A2A33').font('Helvetica').fontSize(9.5).text(String(c.doctor_notes), LEFT, y + 12, { width: CONTENT_W })
      y += 14 + doc.heightOfString(String(c.doctor_notes), { width: CONTENT_W }) + 8
    }

    // ── Status timeline ───────────────────────────────────────────────────────
    y = section(y, 'Status timeline')
    if (!bundle.timeline?.length) {
      doc.fillColor('#6B7280').font('Helvetica-Oblique').fontSize(9).text('No timestamped events on file.', LEFT, y)
      y += 18
    } else {
      for (const row of bundle.timeline) {
        y = pageBreakIf(y, 22)
        doc.fillColor('#6B7280').font('Helvetica').fontSize(8.5).text(nzDateTime(row.at), LEFT, y, { width: 130 })
        doc.fillColor('#0B6E76').font('Helvetica-Bold').fontSize(9).text(row.event, LEFT + 135, y, { width: 130 })
        doc.fillColor('#1A2A33').font('Helvetica').fontSize(9).text(row.detail || '', LEFT + 270, y, { width: CONTENT_W - 270 })
        y += 20
      }
    }

    // ── Rehab plan / RTW / discharge summary ──────────────────────────────────
    if (c.rehab_plan || c.rtw_status || c.discharge_summary) {
      y = section(y, 'Treatment plan & discharge')
      if (c.rehab_plan) {
        y = pageBreakIf(y, 40)
        const rp = c.rehab_plan
        doc.fillColor('#6B7280').font('Helvetica-Bold').fontSize(9).text('Rehab plan', LEFT, y)
        const goals = Array.isArray(rp.goals) ? rp.goals.join(' · ') : (rp.goals || '')
        const planTxt = [
          goals && `Goals: ${goals}`,
          rp.plan && `Plan: ${rp.plan}`,
          rp.review_cycle_weeks && `Review cycle: every ${rp.review_cycle_weeks} weeks`,
          rp.next_review_at && `Next review: ${nzDate(rp.next_review_at)}`,
        ].filter(Boolean).join('\n')
        doc.fillColor('#1A2A33').font('Helvetica').fontSize(9.5).text(planTxt || '—', LEFT, y + 12, { width: CONTENT_W })
        y += 12 + doc.heightOfString(planTxt || '—', { width: CONTENT_W }) + 8
      }
      if (c.rtw_status) {
        y = pageBreakIf(y, 30)
        const rw = c.rtw_status
        doc.fillColor('#6B7280').font('Helvetica-Bold').fontSize(9).text('Return-to-work status', LEFT, y)
        const rwTxt = [
          rw.status && `Status: ${rw.status}`,
          rw.hours_per_week != null && `Hours/week: ${rw.hours_per_week}`,
          rw.restrictions && `Restrictions: ${rw.restrictions}`,
          rw.target_date && `Target return date: ${nzDate(rw.target_date)}`,
        ].filter(Boolean).join('\n')
        doc.fillColor('#1A2A33').font('Helvetica').fontSize(9.5).text(rwTxt || '—', LEFT, y + 12, { width: CONTENT_W })
        y += 12 + doc.heightOfString(rwTxt || '—', { width: CONTENT_W }) + 8
      }
      if (c.discharge_summary) {
        y = pageBreakIf(y, 30)
        const ds = c.discharge_summary
        doc.fillColor('#6B7280').font('Helvetica-Bold').fontSize(9).text('Discharge summary', LEFT, y)
        const dsTxt = [
          ds.status && `Status: ${ds.status}`,
          ds.discharge_date && `Discharged: ${nzDate(ds.discharge_date)}`,
          ds.referred_to && `Referred to: ${ds.referred_to}`,
          ds.summary_text && `Summary: ${ds.summary_text}`,
        ].filter(Boolean).join('\n')
        doc.fillColor('#1A2A33').font('Helvetica').fontSize(9.5).text(dsTxt || '—', LEFT, y + 12, { width: CONTENT_W })
        y += 12 + doc.heightOfString(dsTxt || '—', { width: CONTENT_W }) + 8
      }
    }

    // ── Related consults on this claim (claim history) ────────────────────────
    y = section(y, `Related consults on this claim (${bundle.related_consults?.length || 0})`)
    if (!bundle.related_consults?.length) {
      doc.fillColor('#6B7280').font('Helvetica-Oblique').fontSize(9).text('This is the only consult filed against this claim.', LEFT, y)
      y += 18
    } else {
      for (const rc of bundle.related_consults) {
        y = pageBreakIf(y, 28)
        doc.fillColor('#1A2A33').font('Helvetica-Bold').fontSize(9.5).text(`${nzDate(rc.created_at)} · ${rc.consultation_type || '—'} · ${rc.acc_read_code || '—'}`, LEFT, y)
        doc.fillColor('#374151').font('Helvetica').fontSize(9).text(String(rc.chief_complaint || '').slice(0, 200), LEFT, y + 12, { width: CONTENT_W })
        y += 30
      }
    }

    // ── Outcome measures over time ────────────────────────────────────────────
    y = section(y, `Outcome measures (${bundle.outcome_measures?.length || 0})`)
    if (!bundle.outcome_measures?.length) {
      doc.fillColor('#6B7280').font('Helvetica-Oblique').fontSize(9).text('No structured outcome measures recorded.', LEFT, y)
      y += 18
    } else {
      for (const m of bundle.outcome_measures) {
        y = pageBreakIf(y, 20)
        const val = m.value_numeric != null ? m.value_numeric : (m.value_text || '—')
        doc.fillColor('#6B7280').font('Helvetica').fontSize(8.5).text(nzDateTime(m.recorded_at), LEFT, y, { width: 130 })
        doc.fillColor('#0B6E76').font('Helvetica-Bold').fontSize(9).text(m.measure_type, LEFT + 135, y, { width: 180 })
        doc.fillColor('#1A2A33').font('Helvetica').fontSize(9).text(String(val), LEFT + 320, y, { width: CONTENT_W - 320 })
        y += 16
      }
    }

    // ── Case-manager comms ────────────────────────────────────────────────────
    y = section(y, `ACC case-manager comms (${bundle.communications?.length || 0})`)
    if (!bundle.communications?.length) {
      doc.fillColor('#6B7280').font('Helvetica-Oblique').fontSize(9).text('No recorded case-manager comms for this claim.', LEFT, y)
      y += 18
    } else {
      for (const cm of bundle.communications.slice(0, 30)) {
        y = pageBreakIf(y, 30)
        doc.fillColor('#6B7280').font('Helvetica').fontSize(8.5).text(nzDateTime(cm.occurred_at), LEFT, y, { width: 130 })
        doc.fillColor('#0D2B45').font('Helvetica-Bold').fontSize(9).text(`${(cm.direction || '').toUpperCase()} · ${cm.channel || '—'}`, LEFT + 135, y, { width: 130 })
        doc.fillColor('#1A2A33').font('Helvetica').fontSize(9).text(cm.subject || '(no subject)', LEFT + 270, y, { width: CONTENT_W - 270 })
        if (cm.body) {
          doc.fillColor('#374151').font('Helvetica').fontSize(8.5).text(String(cm.body).slice(0, 300), LEFT + 135, y + 12, { width: CONTENT_W - 135 })
          y += 12 + doc.heightOfString(String(cm.body).slice(0, 300), { width: CONTENT_W - 135 }) + 6
        } else {
          y += 20
        }
      }
    }

    // ── Peer review ───────────────────────────────────────────────────────────
    y = section(y, `Peer review (${bundle.peer_reviews?.length || 0})`)
    if (!bundle.peer_reviews?.length) {
      doc.fillColor('#6B7280').font('Helvetica-Oblique').fontSize(9).text('Not sampled for peer review.', LEFT, y)
      y += 18
    } else {
      for (const pr of bundle.peer_reviews) {
        y = pageBreakIf(y, 28)
        doc.fillColor('#1A2A33').font('Helvetica-Bold').fontSize(9.5).text(`${nzDateTime(pr.reviewed_at)} · ${pr.reviewer_name || '—'}`, LEFT, y)
        doc.fillColor('#0B6E76').font('Helvetica').fontSize(9).text(`Agreement: ${pr.agreement || '—'} · Sample: ${pr.sample_reason || '—'}`, LEFT, y + 12)
        if (pr.notes) {
          doc.fillColor('#374151').font('Helvetica').fontSize(9).text(pr.notes, LEFT, y + 24, { width: CONTENT_W })
          y += 24 + doc.heightOfString(pr.notes, { width: CONTENT_W }) + 8
        } else {
          y += 32
        }
      }
    }

    // ── Prescriptions ─────────────────────────────────────────────────────────
    y = section(y, `Prescriptions (${bundle.prescriptions?.length || 0})`)
    if (!bundle.prescriptions?.length) {
      doc.fillColor('#6B7280').font('Helvetica-Oblique').fontSize(9).text('None linked to this consultation.', LEFT, y)
      y += 18
    } else {
      for (const rx of bundle.prescriptions) {
        y = pageBreakIf(y, 26)
        doc.fillColor('#1A2A33').font('Helvetica-Bold').fontSize(9.5).text(`${rx.drug_name || '—'}${rx.strength ? ` ${rx.strength}` : ''}${rx.controlled ? '  [CONTROLLED]' : ''}`, LEFT, y)
        doc.fillColor('#374151').font('Helvetica').fontSize(9).text(`${rx.dose_instructions || ''} · qty ${rx.quantity ?? '—'} · refills ${rx.refills ?? 0} · status ${rx.status || '—'} · ${nzDate(rx.created_at)}`, LEFT, y + 12)
        y += 30
      }
    }

    // ── Radiology referrals ───────────────────────────────────────────────────
    y = section(y, `Radiology referrals (${bundle.radiology_referrals?.length || 0})`)
    if (!bundle.radiology_referrals?.length) {
      doc.fillColor('#6B7280').font('Helvetica-Oblique').fontSize(9).text('None linked to this consultation.', LEFT, y)
      y += 18
    } else {
      for (const ref of bundle.radiology_referrals) {
        y = pageBreakIf(y, 26)
        doc.fillColor('#1A2A33').font('Helvetica-Bold').fontSize(9.5).text(`${ref.modality || '—'} · ${ref.region || '—'} · ${ref.urgency || '—'}`, LEFT, y)
        doc.fillColor('#374151').font('Helvetica').fontSize(9).text(`${ref.clinical_details || ''} · status ${ref.status || '—'} · ${nzDate(ref.created_at)}`, LEFT, y + 12, { width: CONTENT_W })
        y += 30
      }
    }

    // ── ACC response ──────────────────────────────────────────────────────────
    y = section(y, 'ACC response (raw)')
    const raw = claim.raw_response
    if (!raw) {
      doc.fillColor('#6B7280').font('Helvetica-Oblique').fontSize(9).text('No ACC response recorded.', LEFT, y)
      y += 18
    } else {
      const text = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)
      const excerpt = text.length > 1400 ? text.slice(0, 1400) + '\n… (truncated — see JSON export for full body)' : text
      doc.fillColor('#374151').font('Courier').fontSize(8).text(excerpt, LEFT, y, { width: CONTENT_W })
      y += doc.heightOfString(excerpt, { width: CONTENT_W }) + 8
    }

    // ── Audit trail ───────────────────────────────────────────────────────────
    y = section(y, `Audit trail (${bundle.audit_trail?.length || 0} accesses)`)
    if (!bundle.audit_trail?.length) {
      doc.fillColor('#6B7280').font('Helvetica-Oblique').fontSize(9).text('No recorded accesses touching this claim.', LEFT, y)
      y += 18
    } else {
      for (const a of bundle.audit_trail.slice(0, 40)) {
        y = pageBreakIf(y, 20)
        doc.fillColor('#6B7280').font('Helvetica').fontSize(8.5).text(nzDateTime(a.created_at), LEFT, y, { width: 130 })
        doc.fillColor('#0D2B45').font('Helvetica-Bold').fontSize(8.5).text(a.event_type || '—', LEFT + 135, y, { width: 150 })
        doc.fillColor('#374151').font('Helvetica').fontSize(8.5).text(`${a.provider_name || '—'} (${a.provider_role || '—'})${a.reason ? ` · ${a.reason}` : ''}`, LEFT + 290, y, { width: CONTENT_W - 290 })
        y += 16
      }
      if (bundle.audit_trail.length > 40) {
        doc.fillColor('#6B7280').font('Helvetica-Oblique').fontSize(8.5).text(`+ ${bundle.audit_trail.length - 40} earlier accesses in JSON export`, LEFT, y)
        y += 14
      }
    }

    // ── Footer chain-of-custody on every page ─────────────────────────────────
    const pageRange = doc.bufferedPageRange()
    for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
      doc.switchToPage(i)
      doc.fillColor('#9CA3AF').font('Helvetica-Oblique').fontSize(7.5).text(
        `Tere Health Ltd · ACC Audit Bundle · Claim ${claim.claim_number || claim.id || '—'} · Page ${i + 1} of ${pageRange.count} · Exported ${nzDateTime(bundle.generated_at)} by ${bundle.generated_by?.name || '—'}`,
        LEFT, H - 40, { width: CONTENT_W, align: 'center' }
      )
    }

    // Diagonal watermark (task #375) — deters casual leaks + makes exports traceable.
    drawWatermark(doc, { exporter: bundle.generated_by?.name, exportedAt: bundle.generated_at, label: 'CONFIDENTIAL — ACC AUDIT BUNDLE' })

    doc.end()
  })
}

// ── ACC certificate PDFs (tasks #371, #372, #373) ─────────────────────────
// Shared helper — three cert types (Weekly Compensation, RTW, ACC46 injury
// summary) all use the same header/footer/patient block. Only the middle
// clinical section varies.
//
// Data shape (all cert types):
//   {
//     certType:      'weekly_compensation' | 'return_to_work' | 'acc46',
//     patient:       { first_name, last_name, dob, nhi, address, phone },
//     provider:      { name, credential, hpi, mcnz, signature_url, email, phone },
//     claim:         { number, service_code },
//     injury:        { date, mechanism, body_part, read_code, employer },
//     // WC-specific:
//     unfitFrom:     ISO date
//     unfitTo:       ISO date
//     unfitReason:   text
//     // RTW-specific:
//     rtwFrom:       ISO date
//     hoursPerWeek:  number
//     restrictions:  text
//     targetFullRtw: ISO date
//     // ACC46-specific:
//     examination:   text (multiline)
//     assessment:    text
//     plan:          text
//     outcomeMeasures: [{ measure_type, value, recorded_at }]
//   }
export function buildAccCertificatePdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const W = doc.page.width, H = doc.page.height, LEFT = 50, RIGHT = W - 50, CW = RIGHT - LEFT

    const nzDate = (d) => {
      if (!d) return '—'
      try { return new Date(d).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: 'long', year: 'numeric' }) } catch { return String(d) }
    }
    const pageBreakIf = (y, needed) => (y + needed > H - 80 ? (doc.addPage(), 50) : y)
    const kv = (y, k, v) => {
      doc.fillColor('#6B7280').font('Helvetica').fontSize(8).text(k.toUpperCase(), LEFT, y)
      doc.fillColor('#1A2A33').font('Helvetica-Bold').fontSize(10).text(String(v ?? '—'), LEFT, y + 11)
      return y + 30
    }
    const kvRow = (y, pairs) => {
      const colW = CW / pairs.length
      pairs.forEach(([k, v], i) => {
        doc.fillColor('#6B7280').font('Helvetica').fontSize(8).text(k.toUpperCase(), LEFT + i * colW, y)
        doc.fillColor('#1A2A33').font('Helvetica-Bold').fontSize(10).text(String(v ?? '—'), LEFT + i * colW, y + 11, { width: colW - 12 })
      })
      return y + 30
    }
    const sectionTitle = (y, title) => {
      y = pageBreakIf(y, 30)
      doc.fillColor('#0D2B45').font('Helvetica-Bold').fontSize(11).text(title.toUpperCase(), LEFT, y)
      doc.moveTo(LEFT, y + 14).lineTo(RIGHT, y + 14).strokeColor('#0B6E76').lineWidth(1).stroke()
      return y + 22
    }

    // Header
    doc.rect(0, 0, W, 80).fill('#0B6E76')
    doc.fillColor('white').font('Helvetica-Bold').fontSize(22).text('Tere Health', LEFT, 22)
    doc.font('Helvetica').fontSize(9)
      .text('Marlborough Sounds, New Zealand · terehealth.co.nz', LEFT, 50)
      .text('ACC Vendor G11238 · HPI-O G11238-E · NZBN 9429053723413', LEFT, 63)
    try { const logo = tereLogoBuffer(); if (logo) doc.image(logo, RIGHT - 60, 15, { fit: [50, 50], align: 'right' }) } catch {}

    const TITLES = {
      weekly_compensation: 'ACC Medical Certificate — Fitness for Work',
      return_to_work:      'ACC Return-to-Work Certificate',
      acc46:               'ACC46 Injury Summary',
    }
    const type = data.certType || 'weekly_compensation'

    doc.fillColor('#0D2B45').font('Helvetica-Bold').fontSize(18).text(TITLES[type] || TITLES.weekly_compensation, LEFT, 100)
    doc.font('Helvetica').fontSize(9).fillColor('#6B7280').text(`Issued: ${nzDate(new Date())}`, LEFT, 128)

    let y = 160

    // Patient
    y = sectionTitle(y, 'Patient')
    y = kvRow(y, [
      ['Name', [data.patient?.first_name, data.patient?.last_name].filter(Boolean).join(' ') || '—'],
      ['NHI', data.patient?.nhi],
    ])
    y = kvRow(y, [
      ['Date of birth', nzDate(data.patient?.dob)],
      ['Phone', data.patient?.phone],
    ])
    if (data.patient?.address) y = kv(y, 'Address', data.patient.address)

    // Claim + injury (common to all three cert types)
    y = sectionTitle(y, 'Claim & injury')
    y = kvRow(y, [
      ['ACC claim #', data.claim?.number || '(pending)'],
      ['Injury date', nzDate(data.injury?.date)],
    ])
    y = kvRow(y, [
      ['Read code', data.injury?.read_code],
      ['Body part', data.injury?.body_part],
    ])
    if (data.injury?.mechanism) y = kv(y, 'Mechanism', data.injury.mechanism)
    if (data.injury?.employer)  y = kv(y, 'Employer', data.injury.employer)

    // Type-specific body
    if (type === 'weekly_compensation') {
      y = sectionTitle(y, 'Fitness for work')
      y = kvRow(y, [
        ['Unfit for work from', nzDate(data.unfitFrom)],
        ['Unfit for work to',   nzDate(data.unfitTo)],
      ])
      if (data.unfitReason) {
        y = pageBreakIf(y, 40)
        doc.fillColor('#6B7280').font('Helvetica').fontSize(8).text('CLINICAL REASON', LEFT, y)
        doc.fillColor('#1A2A33').font('Helvetica').fontSize(10).text(data.unfitReason, LEFT, y + 11, { width: CW })
        y += 11 + doc.heightOfString(data.unfitReason, { width: CW }) + 12
      }
      // Attestation
      y = pageBreakIf(y, 40)
      doc.fillColor('#374151').font('Helvetica-Oblique').fontSize(9).text(
        'I certify that the above-named patient is unable to work during the period stated as a consequence of the injury described. This certification is issued for the purposes of ACC Weekly Compensation.',
        LEFT, y, { width: CW }
      )
      y += doc.heightOfString('I certify...', { width: CW }) + 20
    } else if (type === 'return_to_work') {
      y = sectionTitle(y, 'Return-to-work plan')
      y = kvRow(y, [
        ['RTW start date',       nzDate(data.rtwFrom)],
        ['Hours per week',       data.hoursPerWeek != null ? `${data.hoursPerWeek} hours` : '—'],
      ])
      y = kv(y, 'Target full RTW date', nzDate(data.targetFullRtw))
      if (data.restrictions) {
        y = pageBreakIf(y, 40)
        doc.fillColor('#6B7280').font('Helvetica').fontSize(8).text('WORK RESTRICTIONS', LEFT, y)
        doc.fillColor('#1A2A33').font('Helvetica').fontSize(10).text(data.restrictions, LEFT, y + 11, { width: CW })
        y += 11 + doc.heightOfString(data.restrictions, { width: CW }) + 12
      }
      y = pageBreakIf(y, 40)
      doc.fillColor('#374151').font('Helvetica-Oblique').fontSize(9).text(
        'I certify that the above-named patient is fit to return to work on the terms specified above. Suitable duties within these restrictions are recommended.',
        LEFT, y, { width: CW }
      )
      y += doc.heightOfString('I certify...', { width: CW }) + 20
    } else if (type === 'acc46') {
      y = sectionTitle(y, 'Examination')
      if (data.examination) {
        doc.fillColor('#1A2A33').font('Helvetica').fontSize(10).text(data.examination, LEFT, y, { width: CW })
        y += doc.heightOfString(data.examination, { width: CW }) + 12
      } else {
        doc.fillColor('#9CA3AF').font('Helvetica-Oblique').fontSize(9).text('Not recorded.', LEFT, y); y += 18
      }
      y = sectionTitle(y, 'Assessment')
      if (data.assessment) {
        doc.fillColor('#1A2A33').font('Helvetica').fontSize(10).text(data.assessment, LEFT, y, { width: CW })
        y += doc.heightOfString(data.assessment, { width: CW }) + 12
      } else {
        doc.fillColor('#9CA3AF').font('Helvetica-Oblique').fontSize(9).text('Not recorded.', LEFT, y); y += 18
      }
      y = sectionTitle(y, 'Plan')
      if (data.plan) {
        doc.fillColor('#1A2A33').font('Helvetica').fontSize(10).text(data.plan, LEFT, y, { width: CW })
        y += doc.heightOfString(data.plan, { width: CW }) + 12
      } else {
        doc.fillColor('#9CA3AF').font('Helvetica-Oblique').fontSize(9).text('Not recorded.', LEFT, y); y += 18
      }
      if (Array.isArray(data.outcomeMeasures) && data.outcomeMeasures.length) {
        y = sectionTitle(y, `Outcome measures (${data.outcomeMeasures.length})`)
        for (const m of data.outcomeMeasures) {
          y = pageBreakIf(y, 20)
          const v = m.value_numeric != null ? m.value_numeric : m.value_text || '—'
          doc.fillColor('#6B7280').font('Helvetica').fontSize(9).text(nzDate(m.recorded_at), LEFT, y, { width: 140 })
          doc.fillColor('#0B6E76').font('Helvetica-Bold').fontSize(9).text(m.measure_type, LEFT + 145, y, { width: 200 })
          doc.fillColor('#1A2A33').font('Helvetica').fontSize(9).text(String(v), LEFT + 350, y, { width: CW - 350 })
          y += 16
        }
      }
    }

    // Provider signature block (all types)
    y = pageBreakIf(y, 100)
    y = sectionTitle(y, 'Prescribing / issuing clinician')
    y = kvRow(y, [
      ['Name', data.provider?.name],
      ['Credential', data.provider?.credential || 'Registered Medical Practitioner'],
    ])
    y = kvRow(y, [
      ['MCNZ', data.provider?.mcnz],
      ['HPI-CPN', data.provider?.hpi],
    ])
    y = kvRow(y, [
      ['Email', data.provider?.email],
      ['Phone', data.provider?.phone],
    ])
    // Signature line
    y += 10
    doc.moveTo(LEFT, y + 30).lineTo(LEFT + 250, y + 30).strokeColor('#94A3B8').lineWidth(0.5).stroke()
    doc.fillColor('#6B7280').font('Helvetica').fontSize(8).text('Signature', LEFT, y + 34)
    doc.moveTo(LEFT + 280, y + 30).lineTo(RIGHT, y + 30).strokeColor('#94A3B8').lineWidth(0.5).stroke()
    doc.fillColor('#6B7280').font('Helvetica').fontSize(8).text('Date', LEFT + 280, y + 34)
    // If we have an electronic signature URL, embed it above the line.
    // Note: buildAccCertificatePdf is sync-wrapped in a Promise; the actual
    // signature fetch happens inline via ensureSignature (below) before we call this fn.
    if (data.provider?.signatureBuffer) {
      try { doc.image(data.provider.signatureBuffer, LEFT, y - 20, { fit: [180, 55], align: 'left' }) } catch {}
    } else {
      doc.fillColor('#9CA3AF').font('Helvetica-Oblique').fontSize(9).text('(electronically issued — signature exempt under DG August 2024 authorisation)', LEFT, y, { width: 250 })
    }
    doc.fillColor('#1A2A33').font('Helvetica').fontSize(10).text(nzDate(new Date()), LEFT + 280, y)

    // Footer on every page
    const pageRange = doc.bufferedPageRange()
    for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
      doc.switchToPage(i)
      doc.fillColor('#9CA3AF').font('Helvetica-Oblique').fontSize(7.5).text(
        `Tere Health Ltd · ${TITLES[type]} · Patient ${data.patient?.nhi || ''} · Claim ${data.claim?.number || 'pending'} · Page ${i + 1} of ${pageRange.count}`,
        LEFT, H - 40, { width: CW, align: 'center' }
      )
    }

    // Watermark — provider name + timestamp diagonally across every page.
    drawWatermark(doc, { exporter: data.provider?.name, label: 'CONFIDENTIAL — ' + (TITLES[type] || 'ACC CERTIFICATE').toUpperCase() })

    doc.end()
  })
}

