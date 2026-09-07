// One-off: send a test prescription to John Poswillo Pharmacy for
// format review before Tere routes live scripts to them.
//
// Non-controlled drug (amoxicillin). Explicit "TEST PATIENT — Do Not
// Dispense" name + full-page watermark on the PDF (buildPrescriptionPdf
// has watermark support specifically for this use case).
//
// Not inserted into the DB — this is a partner-facing format review,
// not a real script for a real patient.
//
// Run: cd tere-app && node scripts/send-poswillo-test-prescription.js

import 'dotenv/config'
import { buildPrescriptionPdf } from '../api/_pdf-builders.js'
import { sendEmail, hasEmailProvider } from '../api/_email-client.js'

const POSWILLO_EMAIL   = 'Dispensary@poswillopharmacy.co.nz'
const POSWILLO_NAME    = 'John Poswillo Pharmacy'
const POSWILLO_ADDRESS = 'Lister Court Unit D, 16 Francis Street, Blenheim 7201'

async function main() {
  if (!hasEmailProvider()) {
    console.error('No email provider configured (EMAIL_PROVIDER / RESEND_API_KEY).')
    process.exit(1)
  }

  const pdfBuffer = await buildPrescriptionPdf({
    providerName:      'Dr Patrick J. Herling, D.O.',
    prescriberNumber:  '99529',   // MCNZ
    patientName:       'TEST PATIENT — Do Not Dispense (Tere format review)',
    patientNhi:        '',
    patientDob:        '1985-03-14',
    drug:              'Amoxicillin 500mg capsules',
    dose:              '1 capsule',
    directions:        'Take ONE capsule THREE times daily for 7 days',
    quantity:          '21 capsules',
    repeats:           0,
    pharmacyName:      POSWILLO_NAME,
    pharmacyAddress:   POSWILLO_ADDRESS,
    signatureExempt:   true,           // standard Tere production path per DG authorisation
    watermark:         'TEST — DO NOT DISPENSE',
  })
  const pdfBase64 = pdfBuffer.toString('base64')

  await sendEmail({
    from:    'Dr Patrick Herling <hello@terehealth.co.nz>',
    replyTo: 'terehealthnz@gmail.com',
    to:      POSWILLO_EMAIL,
    cc:      'patrickherling@gmail.com',   // delivery check — if this arrives to Gmail but not Poswillo, it's their tenant filter
    subject: 'Sample document for your review — Tere Health (Dr Herling)',
    html: `<p>Kia ora,</p>
           <p>This is Dr Patrick Herling from Tere Health, a new rural telehealth service based in Marlborough. Before we send anything real to your dispensary, I'd like you to review the layout of the document Tere produces, so you can tell me if there is anything you would like changed or added.</p>
           <p><strong>Please do not action the attached document.</strong> The patient is fictional, the document is watermarked as a sample throughout, and it is being sent purely for format feedback.</p>
           <p>If you have five minutes to reply with any changes, or if you'd rather I ring you to talk through it, my mobile is 021 070 6008 and our reception number is +64 3 568 8145.</p>
           <p>Ngā mihi,<br/>Dr Patrick Herling<br/>MCNZ 99529 · HPI-CPN 24NSES<br/>Tere Health Limited · terehealth.co.nz</p>
           <p style="color:#6B7280;font-size:11px">If this landed in your junk or quarantine folder, please add hello@terehealth.co.nz to your safe-senders list — we are a new sender to your dispensary.</p>`,
    attachments: [{
      filename: 'Tere-Health-sample-document.pdf',
      content:  pdfBase64,
    }],
  })

  console.log(`✓ Sent test prescription to ${POSWILLO_EMAIL}`)
}

main().catch(e => { console.error(e); process.exit(1) })
