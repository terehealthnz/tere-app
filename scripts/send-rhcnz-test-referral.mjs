// scripts/send-rhcnz-test-referral.mjs
//
// One-off test referral to Pacific Radiology (Wellington/Manawatū region)
// per Holly Johnson's request 2026-08-17. Uses the exact same buildReferralPdf
// + Resend send + radiology_referrals insert as the production endpoint —
// no shortcuts, so this test also validates the real code path.
//
// Runs with your local .env (RESEND_API_KEY, VITE_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY). Reads them the same way vercel dev does.
//
// Usage:
//   node --env-file=.env scripts/send-rhcnz-test-referral.mjs
//     → shows the payload + region + destination, exits WITHOUT sending
//
//   node --env-file=.env scripts/send-rhcnz-test-referral.mjs --send
//     → actually sends the email to appointments@pacificradiology.com
//       and inserts the row in radiology_referrals

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { buildReferralPdf } from '../api/_pdf-builders.js'
import { RHCNZ_REGIONS, TERE_MO_SHORTCODE } from '../src/lib/rhcnzRegions.js'

const SEND = process.argv.includes('--send')

// Holly's test patient (2026-08-17)
const testPatient = {
  patientName: 'Mrs Testing Iscv One',
  patientPreferredName: 'Iscv',
  patientNhi: 'ZZZ0032',
  patientDob: '2005-10-01',                  // 01/10/2005
  patientGender: 'Female',
  patientAddress: '123 Test Ave, Karori, Wellington 6012',
  patientPhoneHome: null,
  patientPhoneMobile: '021000000',
  patientEmail: null,                        // do NOT send patient email for test
}

const referral = {
  ...testPatient,
  // Referrer (Patrick — pulled from provider row identifiers rather than DB lookup)
  providerId: null,                           // not fetching signature via DB for this test
  providerName: 'Dr Patrick Herling',
  providerCpn:  '24NSES',
  providerMcnz: '99529',
  providerPhone: '+64 3 568 8145',
  // Clinical
  investigation: 'X-ray',
  bodyPart:      'Chest',
  clinicalIndication: 'TEST CASE — please ignore. Integration test between Tere Health and RHCNZ per Holly Johnson\'s request 2026-08-17. Requesting chest X-ray for clinical evaluation. No clinical action required from your team.',
  urgency: 'Urgent',                          // rhcnzRegion.email path forces Urgent anyway
  history: 'TEST CASE — no real patient history. Please auto-process and confirm receipt.',
  accClaimNumber: null,
  // Regional routing (Wellington/6012 → Pacific Radiology intake)
  rhcnzRegionId: 'pr-wgtn',
  facilityHpiId: null,
  facilityPhone: null,
  facilityAddress: null,
  // Ancillary
  cscNumber: null,
  otherFundingPathway: 'Test/integration',
  dateOfInjury: null,
  copyToDoctor: null,
  consultationId: null,
  draftedByName: 'Dr Patrick Herling',
}

// ─── Region lookup + destination overrides (mirror of _generate-referral-pdf) ─
const rhcnzRegion = RHCNZ_REGIONS.find(r => r.id === referral.rhcnzRegionId)
if (!rhcnzRegion) {
  console.error(`Region '${referral.rhcnzRegionId}' not found in RHCNZ_REGIONS`)
  process.exit(1)
}
const finalFacilityName  = `${rhcnzRegion.brand} — ${rhcnzRegion.region}`
const finalFacilityEmail = rhcnzRegion.email
const finalUrgency       = 'Urgent'
const referrerMoShortcode = TERE_MO_SHORTCODE

console.log('\n════════════════════════════════════════════════════════════════')
console.log(SEND ? '  SENDING TEST REFERRAL' : '  DRY RUN — nothing will be sent')
console.log('════════════════════════════════════════════════════════════════\n')
console.log('  Patient:      ', referral.patientName, `(NHI ${referral.patientNhi})`)
console.log('  Address:      ', referral.patientAddress)
console.log('  Region:       ', rhcnzRegion.id, '→', finalFacilityName)
console.log('  Destination:  ', finalFacilityEmail)
console.log('  Modality:     ', referral.investigation, '·', referral.bodyPart)
console.log('  Urgency:      ', finalUrgency)
console.log('  Clinician:    ', referral.providerName, `(MCNZ ${referral.providerMcnz})`)
console.log('  MO shortcode: ', referrerMoShortcode)
console.log()

if (!SEND) {
  console.log('  (add --send flag to actually deliver)\n')
  process.exit(0)
}

if (!process.env.RESEND_API_KEY) { console.error('RESEND_API_KEY missing from env'); process.exit(1) }

// ─── Build PDF ────────────────────────────────────────────────────────────
const pdfBuffer = await buildReferralPdf({
  ...referral,
  facilityName: finalFacilityName,
  urgency: finalUrgency,
  referrerMoShortcode,
  signatureUrl: 'https://xynwqfbnwpkyvovxdone.supabase.co/storage/v1/object/public/signatures/sig-1786960795198-tmvri3.png',
})
const pdfBase64 = pdfBuffer.toString('base64')
console.log(`  PDF built:     ${(pdfBuffer.length / 1024).toFixed(1)} KB`)

// ─── Send email to Pacific Radiology (Wellington/Manawatū intake) ─────────
const resend = new Resend(process.env.RESEND_API_KEY)
const subject = `[TEST] URGENT — Tere Health eReferral — ${referral.patientName} (${finalUrgency})`
try {
  await resend.emails.send({
    from: 'Tere Health <hello@terehealth.co.nz>',
    replyTo: 'terehealthnz@gmail.com',
    to: finalFacilityEmail,
    subject,
    html: `<p><strong>THIS IS A TEST REFERRAL</strong> — sent as part of the Tere Health x RHCNZ integration test per Holly Johnson's request 2026-08-17. Please ignore or auto-process for testing purposes; no clinical action required.</p>
           <p><strong>Patient:</strong> ${referral.patientName} (NHI ${referral.patientNhi})<br>
              <strong>Investigation:</strong> ${referral.investigation} — ${referral.bodyPart}<br>
              <strong>Urgency:</strong> ${finalUrgency}<br>
              <strong>Clinician:</strong> ${referral.providerName} (MCNZ ${referral.providerMcnz})</p>
           <p style="color:#6B7280;font-size:12px">Tere Health Limited · HPI-O G11238-E · terehealth.co.nz</p>`,
    attachments: [{ filename: `TEST-referral-${referral.patientName.replace(/ /g, '-')}.pdf`, content: pdfBase64 }],
  })
  console.log(`  ✅ Email sent to ${finalFacilityEmail}`)
  console.log(`     Subject: ${subject}`)
} catch (e) {
  console.error(`  ❌ Email send failed: ${e.message}`)
  process.exit(1)
}

// ─── Insert row in radiology_referrals (audit trail) ──────────────────────
if (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  try {
    const { data, error } = await supabase.from('radiology_referrals').insert({
      consultation_id: null,
      provider_id: null,
      provider_name: referral.providerName,
      provider_cpn: referral.providerCpn,
      patient_name: referral.patientName,
      patient_nhi: referral.patientNhi,
      patient_dob: referral.patientDob,
      patient_email: null,
      investigation: referral.investigation,
      body_part: referral.bodyPart,
      clinical_indication: referral.clinicalIndication,
      urgency: finalUrgency,
      history: referral.history,
      acc_claim_number: null,
      facility_name: finalFacilityName,
      facility_email: finalFacilityEmail,
      rhcnz_region_id: rhcnzRegion.id,
      patient_phone_mobile: referral.patientPhoneMobile,
      other_funding_pathway: referral.otherFundingPathway,
      patient_preferred_name: referral.patientPreferredName,
      patient_address: referral.patientAddress,
      referrer_mo_shortcode: referrerMoShortcode,
      referral_status: 'sent',
      approval_status: 'not_required',
      delivery_status: 'sent',
    }).select('id').single()
    if (error) throw error
    console.log(`  ✅ radiology_referrals row inserted: ${data.id}`)
  } catch (e) {
    console.log(`  ⚠️  DB insert skipped: ${e.message}`)
  }
} else {
  console.log('  ℹ️  Skipping DB insert (SUPABASE creds not in env)')
}

console.log('\nDone.\n')
