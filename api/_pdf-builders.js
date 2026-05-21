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
