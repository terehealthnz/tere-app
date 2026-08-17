import PDFDocument from 'pdfkit'

// Fetch a signature image URL into a Buffer for pdfkit's `doc.image()` API.
// Returns null on any failure so callers can fall back to a signature line.
async function fetchSignatureBuffer(url) {
  if (!url) return null
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const arr = await r.arrayBuffer()
    return Buffer.from(arr)
  } catch { return null }
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
    // Prescriber contact — required by DG authorisation so the pharmacy can
    // verify identity or request amendments. Falls back to Tere reception
    // when the provider row has no email on file.
    const prescriberEmail = data.providerEmail || 'terehealthnz@gmail.com'
    doc.fillColor('#555').fontSize(9).text(`Contact: ${prescriberEmail}`, 50, 176)

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
    // Prescriber signature — three paths:
    //   1. signature-exempt (DG authorisation): render "Signature Exempt" label, no image
    //   2. signed with uploaded image
    //   3. signed with blank line (image fetch failed or none on file)
    if (data.signatureExempt) {
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

    // Header — Tere brand + "eReferral"
    doc.rect(0, 0, W, 70).fill('#0B6E76')
    doc.fillColor('white').font('Helvetica-Bold').fontSize(22).text('Tere Health', LEFT, 20)
    doc.font('Helvetica').fontSize(10).text('terehealth.co.nz · Tere Health Limited · HPI-O G11238-E', LEFT, 46)
    doc.font('Helvetica-Bold').fontSize(14).text('eReferral', RIGHT - 100, 30, { width: 100, align: 'right' })

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
    row('Referral Sent', new Date().toLocaleString('en-NZ', {
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
    doc.font('Helvetica').fontSize(9).fillColor('#333').text(new Date().toLocaleDateString('en-NZ'), 305, sigY - 12)

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
    doc.fontSize(9).fillColor('rgba(212,238,240,0.7)').text('GST No: [Your GST]  ·  terehealthnz@gmail.com', 50, 56)

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
    const rate = Number(data.base_rate ?? 20)

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

    // Provider (issuer) — Tere legal entity
    // TODO: Patrick to fill in IRD + GST numbers once registered.
    doc.fillColor('#333').font('Helvetica-Bold').fontSize(10).text('Issued by', M, 120)
    doc.font('Helvetica').fontSize(10)
      .text('Tere Health Limited', M, 134)
      .text('NZBN: [TBD - Patrick to fill]', M, 148)
      .text('IRD: [TBD - Patrick to fill]', M, 162)
      .text('GST No: [TBD - Patrick to fill]', M, 176)
      .text('Marlborough Sounds, New Zealand', M, 190)

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
