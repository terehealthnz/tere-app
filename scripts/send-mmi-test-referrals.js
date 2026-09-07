// One-off: send two test radiology referrals (US + XR) to Marlborough
// Medical Imaging (Jemimah, practice manager) so she can review the
// format and provide edits. Explicitly flagged as TEST — DO NOT BOOK.
//
// Not inserted into the DB — this is a partner-facing format review, not
// a real clinical referral for a real patient.
//
// Run: cd tere-app && node scripts/send-mmi-test-referrals.js

import 'dotenv/config'
import { buildReferralPdf } from '../api/_pdf-builders.js'
import { sendEmail, hasEmailProvider } from '../api/_email-client.js'

const MMI_EMAIL = 'bookings@mmimaging.co.nz'
const MMI_NAME  = 'Marlborough Medical Imaging'

const referrer = {
  providerName:  'Dr Patrick J. Herling, D.O.',
  providerCpn:   '24NSES',
  providerMcnz:  '99529',
  providerPhone: '+64 3 568 8145',
}

const referrals = [
  {
    label: 'US',
    investigation:      'Ultrasound',
    bodyPart:           'Right shoulder',
    clinicalIndication: 'Suspected rotator cuff tear following fall onto outstretched hand 3 days ago',
    urgency:            'Routine',
    history:            '42yo male, right-hand dominant. Fell from ~1m ladder onto outstretched right hand 3 days ago. Pain and reduced abduction plus external rotation. Empty-can test positive. No red flags. NSAID + paracetamol not settling. Query rotator cuff tear vs supraspinatus tendinopathy.',
    patient: {
      name: 'John Sample',
      dob:  '1983-04-12',
      nhi:  '',
      gender: 'Male',
      address: '18 Scott Street, Blenheim 7201',
      phoneMobile: '021 000 0000',
    },
  },
  {
    label: 'XR',
    investigation:      'X-ray',
    bodyPart:           'Left ankle',
    clinicalIndication: 'Rule out fracture following inversion injury — Ottawa criteria met',
    urgency:            'Routine',
    history:            '35yo female. Twisted left ankle stepping off kerb 24h ago. Ottawa ankle-rule positive: tenderness at posterior edge of lateral malleolus, unable to weight-bear four steps immediately after injury and now. Moderate swelling. NSAID commenced. Query lateral malleolus fracture.',
    patient: {
      name: 'Sarah Sample',
      dob:  '1990-07-22',
      nhi:  '',
      gender: 'Female',
      address: '18 Scott Street, Blenheim 7201',
      phoneMobile: '021 000 0001',
    },
  },
]

async function main() {
  if (!hasEmailProvider()) {
    console.error('No email provider configured (EMAIL_PROVIDER or RESEND_API_KEY missing).')
    process.exit(1)
  }

  for (const r of referrals) {
    const pdfBuffer = await buildReferralPdf({
      referralId:  `TEST-${r.label}-${Date.now()}`,
      ...referrer,
      patientName:        r.patient.name,
      patientDob:         r.patient.dob,
      patientNhi:         r.patient.nhi,
      patientGender:      r.patient.gender,
      patientAddress:     r.patient.address,
      patientPhoneMobile: r.patient.phoneMobile,
      investigation:      r.investigation,
      bodyPart:           r.bodyPart,
      clinicalIndication: r.clinicalIndication,
      urgency:            r.urgency,
      history:            r.history,
      facilityName:       MMI_NAME,
      facilityAddress:    '25 Alma Road, Blenheim 7201',
      facilityPhone:      '03 579 8050',
      referrerMoShortcode: 'terehealthg11238e',
    })
    const pdfBase64 = pdfBuffer.toString('base64')

    await sendEmail({
      from:    'Dr Patrick Herling <hello@terehealth.co.nz>',
      replyTo: 'terehealthnz@gmail.com',
      to:      MMI_EMAIL,
      subject: `Updated sample ${r.investigation} referral for your review — Tere Health`,
      html: `<p>Kia ora Jemimah,</p>
             <p>Thank you for the feedback on the earlier samples — really appreciated. I've made both changes you asked for:</p>
             <ul>
               <li><strong>Referrer signature</strong> — the referrer is now identified with an "e-signed" statement above the signature line and the referring clinician's name + MCNZ number below the line (in the caption position). When live scripts flow, a real wet-ink signature image will render in the same block.</li>
               <li><strong>Layout</strong> — the whole referral now fits on one page; the footer no longer spills onto a second page.</li>
             </ul>
             <p>Please find attached a fresh sample ${r.investigation} referral in the updated format. As before, patient details are fictional — please do not book.</p>
             <p>Any further tweaks, just let me know. Once you're happy with the format we'll enable MMI as a live delivery target from the Tere platform. And yes — I'll keep you posted on the Medical-Objects HL7 integration as that develops.</p>
             <p>Ngā mihi,<br/>Dr Patrick Herling<br/>MCNZ 99529 · HPI-CPN 24NSES<br/>Tere Health Limited · terehealth.co.nz</p>`,
      attachments: [{
        filename: `tere-sample-referral-${r.label}.pdf`,
        content:  pdfBase64,
      }],
    })

    console.log(`✓ Sent ${r.label} test referral to ${MMI_EMAIL}`)
  }

  console.log('\nBoth test referrals sent. Now draft the announcement email to Jemimah.')
}

main().catch(e => { console.error(e); process.exit(1) })
