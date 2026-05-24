import PDFDocument from 'pdfkit'

export function buildPrescriptionPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.rect(0, 0, doc.page.width, 70).fill('#0B6E76')
    doc.fillColor('white').font('Helvetica-Bold').fontSize(22).text('Tere Health', 50, 20)
    doc.font('Helvetica').fontSize(10).text('He tere, he ora  ·  teremedicine.co.nz', 50, 46)

    doc.fillColor('#0B6E76').font('Helvetica-Bold').fontSize(16).text('PRESCRIPTION', 50, 90)
    doc.moveTo(50, 110).lineTo(doc.page.width - 50, 110).strokeColor('#0B6E76').lineWidth(1).stroke()

    doc.fillColor('#333').font('Helvetica-Bold').fontSize(10).text('Prescriber', 50, 120)
    doc.font('Helvetica').fontSize(10)
      .text(data.providerName || 'Tere Clinician', 50, 134)
      .text(`Prescriber No: ${data.prescriberNumber || '—'}`, 50, 148)
      .text('Tere Health Limited · teremedicine.co.nz', 50, 162)

    if (data.approvedByName) {
      doc.fillColor('#065F46').font('Helvetica-Bold').fontSize(9)
        .text(`Countersigned by: ${data.approvedByName}`, 50, 176)
    }

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#333').text('Patient', 300, 120)
    doc.font('Helvetica').fontSize(10)
      .text(data.patientName, 300, 134)
      .text(`NHI: ${data.patientNhi || '—'}`, 300, 148)
      .text(`DOB: ${data.patientDob || '—'}`, 300, 162)
    doc.text(`Date: ${new Date().toLocaleDateString('en-NZ', { day: '2-digit', month: 'long', year: 'numeric' })}`, 300, 176)

    doc.moveTo(50, 200).lineTo(doc.page.width - 50, 200).strokeColor('#DDD').lineWidth(0.5).stroke()

    doc.fillColor('#0B6E76').font('Helvetica-Bold').fontSize(14).text('℞', 50, 215)
    doc.fillColor('#1A2A33').fontSize(13).text(data.drug, 75, 215)
    doc.fillColor('#555').font('Helvetica').fontSize(10)
      .text(`Dose: ${data.dose || '—'}`, 75, 232)
      .text(`Directions: ${data.directions || '—'}`, 75, 246)
      .text(`Quantity: ${data.quantity || '—'}`, 75, 260)
      .text(`Repeats: ${data.repeats || 0}`, 75, 274)

    doc.moveTo(50, 295).lineTo(doc.page.width - 50, 295).strokeColor('#DDD').lineWidth(0.5).stroke()

    doc.fillColor('#333').font('Helvetica-Bold').fontSize(10).text('Dispensing Pharmacy', 50, 305)
    doc.font('Helvetica').fontSize(10).fillColor('#555')
      .text(data.pharmacyName || "Patient's preferred pharmacy", 50, 319)
    if (data.pharmacyAddress) doc.text(data.pharmacyAddress, 50, 333)

    const sigY = 420
    doc.moveTo(50, sigY).lineTo(220, sigY).strokeColor('#999').lineWidth(0.5).stroke()
    doc.fillColor('#999').font('Helvetica').fontSize(9).text('Prescriber signature', 50, sigY + 4)
    doc.moveTo(300, sigY).lineTo(doc.page.width - 50, sigY).strokeColor('#999').lineWidth(0.5).stroke()
    doc.text('Date', 300, sigY + 4)

    doc.fillColor('#AAA').fontSize(8)
      .text('This prescription was electronically issued by Tere Health Limited. Not valid if altered.', 50, doc.page.height - 50, { align: 'center', width: doc.page.width - 100 })

    doc.end()
  })
}

export function buildReferralPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.rect(0, 0, doc.page.width, 70).fill('#0B6E76')
    doc.fillColor('white').font('Helvetica-Bold').fontSize(22).text('Tere Health', 50, 20)
    doc.font('Helvetica').fontSize(10).text('He tere, he ora  ·  teremedicine.co.nz', 50, 46)

    doc.fillColor('#0B6E76').font('Helvetica-Bold').fontSize(16).text('RADIOLOGY REFERRAL', 50, 90)
    doc.moveTo(50, 110).lineTo(doc.page.width - 50, 110).strokeColor('#0B6E76').lineWidth(1).stroke()

    doc.fillColor('#333').font('Helvetica-Bold').fontSize(10).text('Referring Clinician', 50, 120)
    doc.font('Helvetica').fontSize(10)
      .text(data.providerName || 'Tere Clinician', 50, 134)
      .text(`CPN: ${data.providerCpn || '—'}`, 50, 148)
      .text('Tere Health Limited · teremedicine.co.nz', 50, 162)

    if (data.approvedByName) {
      doc.fillColor('#065F46').font('Helvetica-Bold').fontSize(9)
        .text(`Countersigned by: ${data.approvedByName}`, 50, 176)
    }

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#333').text('Patient', 300, 120)
    doc.font('Helvetica').fontSize(10)
      .text(data.patientName, 300, 134)
      .text(`NHI: ${data.patientNhi || '—'}`, 300, 148)
      .text(`DOB: ${data.patientDob || '—'}`, 300, 162)
    doc.text(`Date: ${new Date().toLocaleDateString('en-NZ', { day: '2-digit', month: 'long', year: 'numeric' })}`, 300, 176)

    doc.moveTo(50, 200).lineTo(doc.page.width - 50, 200).strokeColor('#DDD').lineWidth(0.5).stroke()

    doc.fillColor('#0B6E76').font('Helvetica-Bold').fontSize(12).text('Investigation', 50, 215)
    doc.fillColor('#1A2A33').font('Helvetica-Bold').fontSize(13).text(
      `${data.investigation}${data.bodyPart ? ' — ' + data.bodyPart : ''}`, 50, 232
    )

    const urgencyColor = data.urgency?.toLowerCase().includes('urgent') ? '#DC2626' : data.urgency?.toLowerCase().includes('semi') ? '#D97706' : '#059669'
    doc.fillColor(urgencyColor).font('Helvetica-Bold').fontSize(10).text(`Urgency: ${data.urgency || 'Routine'}`, 50, 252)

    doc.moveTo(50, 270).lineTo(doc.page.width - 50, 270).strokeColor('#DDD').lineWidth(0.5).stroke()

    doc.fillColor('#333').font('Helvetica-Bold').fontSize(10).text('Clinical Indication', 50, 280)
    doc.font('Helvetica').fontSize(10).fillColor('#555').text(data.clinicalIndication || '—', 50, 294, { width: doc.page.width - 100 })

    let y = 294 + (data.clinicalIndication ? Math.ceil(data.clinicalIndication.length / 80) * 14 : 14) + 10

    if (data.history) {
      doc.fillColor('#333').font('Helvetica-Bold').fontSize(10).text('Relevant History', 50, y)
      y += 14
      doc.font('Helvetica').fontSize(10).fillColor('#555').text(data.history, 50, y, { width: doc.page.width - 100 })
      y += Math.ceil(data.history.length / 80) * 14 + 10
    }

    if (data.accClaimNumber) {
      doc.fillColor('#065F46').font('Helvetica-Bold').fontSize(10).text(`ACC Claim No: ${data.accClaimNumber}`, 50, y)
      y += 20
    }

    doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor('#DDD').lineWidth(0.5).stroke()
    y += 10

    doc.fillColor('#333').font('Helvetica-Bold').fontSize(10).text('Referred To', 50, y)
    doc.font('Helvetica').fontSize(10).fillColor('#555')
      .text(data.facilityName || 'To be arranged by patient', 50, y + 14)
    if (data.facilityAddress) doc.text(data.facilityAddress, 50, y + 28)
    if (data.facilityPhone) doc.text(`Ph: ${data.facilityPhone}`, 50, y + 42)

    const sigY = doc.page.height - 120
    doc.moveTo(50, sigY).lineTo(220, sigY).strokeColor('#999').lineWidth(0.5).stroke()
    doc.fillColor('#999').font('Helvetica').fontSize(9).text('Referring clinician signature', 50, sigY + 4)
    doc.moveTo(300, sigY).lineTo(doc.page.width - 50, sigY).strokeColor('#999').lineWidth(0.5).stroke()
    doc.text('Date', 300, sigY + 4)

    doc.fillColor('#AAA').fontSize(8)
      .text('Electronically issued by Tere Health Limited · For clinical use only', 50, doc.page.height - 50, { align: 'center', width: doc.page.width - 100 })

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
    doc.font('Helvetica').fontSize(10).text('He tere, he ora  ·  terehealth.co.nz', 50, 42)
    doc.fontSize(9).fillColor('rgba(212,238,240,0.7)').text('GST No: [Your GST]  ·  admin@terehealth.co.nz', 50, 56)

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

    // Earnings summary box
    let y = 200
    doc.rect(50, y, W - 100, 110).fill('#F0F9FA').stroke('#D4EEF0')
    doc.fillColor('#0D2B45').font('Helvetica-Bold').fontSize(11).text('Earnings Summary', 66, y + 12)

    const row = (label, value, bold = false, yOff = 0) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor(bold ? '#0D2B45' : '#374151')
        .text(label, 66, y + yOff)
        .text(value, W - 160, y + yOff, { width: 110, align: 'right' })
    }
    row(`Base pay (${data.consultation_count} consultations × $${Number(data.base_rate).toFixed(2)})`, `$${Number(data.base_amount).toFixed(2)}`, false, 32)
    row(`Holiday pay in lieu (${(data.holiday_pay_rate * 100).toFixed(0)}%)`, `$${Number(data.holiday_pay_amount).toFixed(2)}`, false, 50)
    doc.moveTo(66, y + 68).lineTo(W - 66, y + 68).strokeColor('#B0D4D8').lineWidth(0.5).stroke()
    row('Total payment', `$${Number(data.total_amount).toFixed(2)}`, true, 76)
    y += 126

    // Consultation breakdown
    if ((data.consultations || []).length > 0) {
      doc.fillColor('#0D2B45').font('Helvetica-Bold').fontSize(11).text('Consultation Breakdown', 50, y)
      y += 18

      // Table header
      doc.rect(50, y, W - 100, 18).fill('#0D2B45')
      doc.fillColor('white').font('Helvetica-Bold').fontSize(8)
        .text('Date', 58, y + 5)
        .text('Type', 150, y + 5)
        .text('Patient', 230, y + 5)
        .text('Base', W - 160, y + 5, { width: 55, align: 'right' })
        .text('Hol Pay', W - 100, y + 5, { width: 46, align: 'right' })
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
        const type = (c.consultation_type || 'video').charAt(0).toUpperCase() + (c.consultation_type || 'video').slice(1)
        doc.fillColor('#374151').font('Helvetica').fontSize(8)
          .text(dateStr, 58, y + 4)
          .text(type, 150, y + 4)
          .text(initials, 230, y + 4)
          .text(`$${Number(data.base_rate).toFixed(2)}`, W - 160, y + 4, { width: 55, align: 'right' })
          .text(`$${(Number(data.base_rate) * data.holiday_pay_rate).toFixed(2)}`, W - 100, y + 4, { width: 46, align: 'right' })
        y += 16
      }

      // Totals row
      doc.rect(50, y, W - 100, 18).fill('#E8F4F5')
      doc.fillColor('#0D2B45').font('Helvetica-Bold').fontSize(8)
        .text(`Total: ${data.consultation_count} consultations`, 58, y + 5)
        .text(`$${Number(data.base_amount).toFixed(2)}`, W - 160, y + 5, { width: 55, align: 'right' })
        .text(`$${Number(data.holiday_pay_amount).toFixed(2)}`, W - 100, y + 5, { width: 46, align: 'right' })
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
      .text('This is a record of casual contractor earnings including 8% holiday pay in lieu of annual leave as per the Holidays Act 2003.', 50, y, { width: W - 100 })
    y += 14
    doc.text('This payment is for contractor services. As a contractor you are responsible for your own tax obligations. Tere Health Limited does not deduct PAYE. Please consult a tax adviser regarding your obligations.', 50, y, { width: W - 100 })
    y += 28

    doc.fillColor('#AAA').fontSize(7.5)
      .text('Tere Health Limited  ·  terehealth.co.nz  ·  He tere, he ora', 50, y, { align: 'center', width: W - 100 })

    doc.end()
  })
}
