// scripts/build-sample-prescription-pdf.mjs
//
// Generates a watermarked sample prescription PDF for sharing with pharmacy
// contacts (currently Liam @ Chemist Warehouse NZ) so they can review the
// format before we start routing real scripts to their dispensaries.
//
// Uses the real buildPrescriptionPdf so the sample is byte-for-byte the
// same layout as a live script — only difference is the diagonal red
// "SAMPLE — NOT A PRESCRIPTION" watermark and a fake Tere-as-patient row.
//
// Usage:
//   node scripts/build-sample-prescription-pdf.mjs
//
// Output: ~/Downloads/Tere_Sample_Prescription.pdf

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { buildPrescriptionPdf } from '../api/_pdf-builders.js'

const OUT = path.join(os.homedir(), 'Downloads', 'Tere_Sample_Prescription.pdf')

const sample = {
  providerName: 'Dr Patrick Herling',
  prescriberNumber: 'MCNZ 99529 · HPI-CPN 24NSES',
  patientName: 'Tere Health (SAMPLE PATIENT)',
  patientNhi: 'SAMPLE',
  patientDob: '01 January 2000',
  drug: 'Paracetamol 500mg tablets',
  dose: '500mg – 1g',
  directions: 'One to two tablets every 4–6 hours as required. Maximum 8 tablets in 24 hours.',
  quantity: '20 tablets',
  repeats: 0,
  pharmacyName: 'Chemist Warehouse — sample recipient (format review only)',
  pharmacyAddress: '318 Richmond Road, Grey Lynn, Auckland 1021',
  // Path B — electronic signature (production path). Sample now embeds
  // Patrick's real uploaded signature so pharmacies can review the exact
  // format they'll receive on live scripts.
  signatureExempt: false,
  signatureUrl: 'https://xynwqfbnwpkyvovxdone.supabase.co/storage/v1/object/public/signatures/sig-1786960795198-tmvri3.png',
  watermark: 'SAMPLE — NOT A PRESCRIPTION',
}

const pdf = await buildPrescriptionPdf(sample)
await fs.writeFile(OUT, pdf)
console.log(`Wrote sample prescription PDF to:\n  ${OUT}`)
console.log(`Size: ${(pdf.length / 1024).toFixed(1)} KB`)
