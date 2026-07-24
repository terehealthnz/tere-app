// Build the single PDF Patrick uploads to myMCNZ alongside the COS2 form.
// Contains the three documents MCNZ Section 2 requires when adding an
// additional supervisor:
//   1. Cover letter — outlines proposed employment + supervision arrangements
//   2. Job offer — from Tere Health Limited to Dr Herling
//   3. Supervision plan — Rachel's arrangement at Tere Health
//
// The COS2 form (2042_001.pdf) itself is uploaded separately.
//
// Fields I don't have are marked [TBD - Patrick to fill] in the output PDF.
//
// Usage:
//   node scripts/build-mcnz-cos2-bundle.mjs
//
// Output: ~/Downloads/Tere_MCNZ_COS2_Bundle_Herling.pdf

import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'
import { marked } from 'marked'

const OUT = path.join(os.homedir(), 'Downloads', 'Tere_MCNZ_COS2_Bundle_Herling.pdf')

// ── Known values ───────────────────────────────────────────────────────────
const K = {
  companyName: 'Tere Health Limited',
  nzbn: '9429053023413',
  registeredOffice: '41 Adams Lane, Springlands, Blenheim 7201, New Zealand',
  startDate: '15 August 2026',
  patient: 'Dr Patrick John Herling',
  patientMcnz: '99529',
  patientResidence: '518 Brancott Road, Fairhall 7272, Marlborough',
  supervisor: 'Dr Rachel Thomas',
  supervisorMcnz: '93606',
  supervisorMobile: '+1 520 444 1195 (WhatsApp)',
  supervisorEmail: 'rachelthomas@yahoo.com',
  employerSignatory: 'Justin Thomas',
  employerSignatoryRole: 'Director, Tere Health Limited',
  existingSupervisor: 'Dr Nicola Rolton',
  existingWorkplace: 'Wairau Hospital',
  hoursPerWeek: '10',
  todayLong: new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' }),
}

// ── Cover letter ───────────────────────────────────────────────────────────
const COVER = `
# Cover Letter

**${K.companyName}**
${K.registeredOffice}
NZBN ${K.nzbn}
${K.todayLong}

**The Registration Team**
Medical Council of New Zealand
PO Box 10509
The Terrace, Wellington 6143

**Application to add an additional supervisor: Dr Patrick John Herling — MCNZ 99529**

Tēnā koutou

This letter accompanies the COS2 application by ${K.patient} to add ${K.companyName} as an additional employer and to record ${K.supervisor} as an additional supervisor for his Provisional Vocational (Emergency Medicine) scope of practice. Dr Herling's existing supervision arrangement at ${K.existingWorkplace} under ${K.existingSupervisor} continues unchanged.

## Proposed employment

${K.companyName} operates Tere Health (terehealth.co.nz), a telehealth urgent care service delivered to patients throughout New Zealand. From ${K.startDate}, Dr Herling will provide part-time Emergency Medicine consultations to Tere Health patients via secure video and audio. Hours are up to ${K.hoursPerWeek} per week and consultations are conducted from his residence at ${K.patientResidence}. No in-person clinical care is provided at any Tere Health physical site.

## Proposed supervision

${K.supervisor} (MCNZ ${K.supervisorMcnz}, vocationally registered Emergency Medicine specialist) has agreed to act as Dr Herling's supervisor for his clinical work at Tere Health. She will be contactable by mobile phone (text or voice) for the duration of every clinical shift Dr Herling undertakes at Tere Health, with a five-minute response target. Formal reviews will occur every four weeks for the first three months and every six weeks thereafter. A written supervision report will be provided to the Council every three months. Full details are set out in the attached supervision plan.

## Prescribing safeguards

Tere Health does not prescribe controlled drugs, opioids, benzodiazepines, GLP-1 receptor agonists, stimulants, or hypnotics under any circumstances. These are hard-blocked at the platform level for every clinician, including the supervisor, with no override pathway. This restriction supplements Dr Herling's Provisional Vocational scope.

## Documents attached

1. This cover letter
2. Job offer from ${K.companyName} to Dr Herling
3. Supervision plan (${K.supervisor})

The signed COS2 form is uploaded separately via myMCNZ.

Please contact ${K.employerSignatory} in the first instance if the Council requires any clarification.

Ngā mihi

Signature: ______________________________     Date: _____ / _____ / 20_____

**${K.employerSignatory}** — ${K.employerSignatoryRole}
`

// ── Job offer ──────────────────────────────────────────────────────────────
const OFFER = `
# Offer of Employment

**${K.companyName}**
${K.registeredOffice}
NZBN ${K.nzbn}
${K.todayLong}

**${K.patient}**
MCNZ Registration Number: ${K.patientMcnz}

Dear Patrick

## Offer of employment — Emergency Medicine Clinician (part-time)

On behalf of ${K.companyName}, I am pleased to offer you the part-time role of **Emergency Medicine Clinician** subject to the terms below and to the Medical Council of New Zealand endorsing the associated supervision arrangement with ${K.supervisor} on your practising certificate.

| Item | Detail |
|---|---|
| Position | Emergency Medicine Clinician |
| Employer | ${K.companyName} |
| Scope of practice | Provisional Vocational (Emergency Medicine), as recorded on your MCNZ practising certificate |
| Proposed start date | ${K.startDate} |
| Hours per week | Up to ${K.hoursPerWeek} |
| Work location | Telehealth only. Consultations delivered from your residence at ${K.patientResidence}. No in-person clinical care is delivered at any Tere Health physical site. |
| Supervision arrangement | ${K.supervisor} — external Supervising Emergency Physician. Contactable during every shift; formal reviews every 4 weeks for the first 3 months, then every 6 weeks. Full details in the attached supervision plan. |
| Prescribing restriction | You will not prescribe controlled drugs, opioids, benzodiazepines, GLP-1 receptor agonists, stimulants, or hypnotics. These categories are blocked at the platform level. |
| Existing supervision | Your supervision arrangement at ${K.existingWorkplace} under ${K.existingSupervisor} continues unchanged. |

## Conditions

This offer is conditional on:

1. MCNZ approving this COS2 application and endorsing the ${K.supervisor} supervision arrangement on your practising certificate; and
2. Your continued MCNZ registration in a Provisional Vocational (Emergency Medicine) scope of practice.

You will not commence any Tere Health shift until MCNZ has confirmed approval in writing.

If you accept this offer, please sign below.

**On behalf of ${K.companyName}**

Signature: ______________________________     Date: _____ / _____ / 20_____

**${K.employerSignatory}** — ${K.employerSignatoryRole}

---

**Accepted by:**

Signature: ______________________________     Date: _____ / _____ / 20_____

**${K.patient}** — MCNZ ${K.patientMcnz}
`

// ── Supervision Plan ──────────────────────────────────────────────────────
const PLAN = `
# Supervision Plan

**Filed with:** Medical Council of New Zealand, under the COS2 application of ${K.patient}
**Scope of this plan:** The supervision arrangement for the clinical role Dr Herling will undertake at ${K.companyName}.
**Relationship to existing supervision:** This plan is **additional to** Dr Herling's existing supervision arrangement at ${K.existingWorkplace} under ${K.existingSupervisor}, which continues unchanged.

## 1. Parties

| Field | Value |
|---|---|
| Supervisee | ${K.patient} |
| MCNZ registration number | ${K.patientMcnz} |
| Scope of practice | Provisional Vocational (Emergency Medicine) |
| Position (Tere Health) | Emergency Medicine Clinician, ${K.companyName} |
| Existing supervisor (unchanged) | ${K.existingSupervisor} — ${K.existingWorkplace} |
| Proposed supervisor (Tere Health) | ${K.supervisor} |
| Supervisor MCNZ registration number | ${K.supervisorMcnz} |
| Supervisor scope | Vocationally registered specialist in Emergency Medicine |
| Supervisor contact | Mobile ${K.supervisorMobile} · Email ${K.supervisorEmail} |
| Supervision start date (Tere Health) | ${K.startDate} |
| Supervision review cycle | Formal review meeting every 4 weeks during the first 3 months, then every 6 weeks thereafter. A written report is provided to the Medical Council every 3 months. |

## 2. Practice location

Tere Health delivers all clinical care via telehealth. Dr Herling will conduct consultations from his residence at ${K.patientResidence}. Patients are located throughout New Zealand and are seen via secure video or audio using the Tere Health platform (terehealth.co.nz). No in-person clinical care is provided at any Tere Health physical site under this arrangement.

## 3. Supervision arrangement

**Method.** ${K.supervisor} will be contactable by mobile phone (text or voice call) for the duration of every clinical shift Dr Herling undertakes at Tere Health. Response target for a clinical question is five minutes or less. The standard mirrors senior on-call cover in an emergency department: the supervisor need not be practising on the same platform simultaneously, but must be reachable and responsive.

**Review meetings.** Formal reviews will take place **every 4 weeks for the first 3 months** and **every 6 weeks thereafter**. Each meeting will cover selected cases from the intervening period, prescribing patterns, referrals, ACC coding, and any concerns raised by patients, colleagues or Dr Herling himself. Duration approximately 60 minutes.

An **ad-hoc review meeting will be convened sooner** than the scheduled cycle if a clinical concern is raised by a patient, colleague, auditor or by Dr Herling himself, or if ${K.supervisor} considers an earlier review warranted.

**Documentation.** Every review meeting will be logged in Tere Health's supervision-reviews record with date, duration, cases reviewed, concerns raised and actions agreed. The log is retained by ${K.companyName} and available on request to the Medical Council.

## 4. Scope of practice within Tere Health

Dr Herling will practise at Tere Health within his current MCNZ Provisional Vocational scope of practice (Emergency Medicine).

**Not prescribed at Tere Health under any circumstances.** Tere Health does not prescribe controlled drugs or drugs of dependence. This applies to every clinician on the platform, including the supervisor, and there is no approval pathway or override:

- Controlled drugs
- Opioids
- Benzodiazepines
- GLP-1 receptor agonists
- Stimulants
- Hypnotics

These categories are hard-blocked at the platform level. A prescribing attempt in any of these classes is refused by the application and cannot be authorised by supervisor sign-off. Where a patient's presentation indicates a need for a medicine in these classes, Dr Herling will refer the patient to an appropriate in-person service and document the referral.

**Consultation with the supervisor.** Dr Herling will consult ${K.supervisor} before finalising any consultation he judges to fall outside or at the limits of his current competence, consistent with his Provisional Vocational scope and his professional obligations. Scope may be broadened or narrowed at review meetings and any change will be recorded in the review log.

## 5. Escalation pathway during shifts

1. **Text first:** send an SMS with the consultation identifier and a one-line summary to ${K.supervisor}'s mobile.
2. **Call if no response within 3 minutes:** phone ${K.supervisor}'s mobile directly.
3. **Hold the consultation:** Dr Herling will not close the consultation, prescribe, or set a management plan until ${K.supervisor} has responded. If the patient is time-critical, Dr Herling will refer to 111 and document the escalation.

If ${K.supervisor} is unable to be reached within 15 minutes on a non-emergency question, Dr Herling will defer the decision and reschedule or refer the patient. Planned periods when ${K.supervisor} is not reachable (e.g. annual leave) will be scheduled in advance and Dr Herling will not roster Tere Health shifts across those windows.

## 6. Reporting to the Medical Council

${K.supervisor} will provide a written supervision report to the Medical Council of New Zealand every three months, summarising the review meetings held, Dr Herling's clinical performance, any concerns raised, and confirmation that the arrangement remains in place. Ad-hoc reports will be provided sooner if a matter requires the Council's attention.

## 7. Termination

This supervision arrangement will continue until (a) the Council removes the supervised-scope condition from Dr Herling's registration on progression to full Vocational (Emergency Medicine) registration, or (b) Dr Herling ceases work at Tere Health, whichever occurs first. ${K.supervisor} will file a final supervision report with the Council within thirty days of termination. The ${K.existingWorkplace} arrangement with ${K.existingSupervisor} is unaffected by this document.

## Declarations

I, **${K.patient}**, have read this supervision plan, agree to work within its stated terms while performing clinical duties at Tere Health, and understand the escalation and review-meeting requirements.

Signature: ______________________________     Date: _____ / _____ / 20_____

**${K.patient}** — MCNZ ${K.patientMcnz}

<br>

I, **${K.supervisor}**, accept responsibility for the supervision arrangement described above for Dr Herling's clinical work at ${K.companyName}.

Signature: ______________________________     Date: _____ / _____ / 20_____

**${K.supervisor}** — MCNZ ${K.supervisorMcnz}

*Filed with the Medical Council of New Zealand under the COS2 application of ${K.patient}. A signed copy is retained by both parties and by ${K.companyName}.*
`

// ── HTML wrapper ───────────────────────────────────────────────────────────
function html(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en-NZ">
<head>
<meta charset="utf-8">
<title>Tere Health — MCNZ COS2 supporting documents</title>
<style>
  @page { margin: 20mm 18mm; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 10.5pt; line-height: 1.55; color: #111; }
  h1 { color: #0B6E76; font-size: 20pt; margin: 0 0 10pt; border-bottom: 2pt solid #0B6E76; padding-bottom: 4pt; }
  h2 { color: #0B6E76; font-size: 13pt; margin: 18pt 0 6pt; }
  h3 { font-size: 11pt; margin: 12pt 0 4pt; }
  p  { margin: 6pt 0; }
  ul, ol { margin: 6pt 0 6pt 22pt; }
  li { margin: 3pt 0; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
  td, th { border: 1pt solid #ccc; padding: 5pt 8pt; text-align: left; vertical-align: top; font-size: 10pt; }
  th { background: #F5F9FA; }
  strong { color: #0B4F5A; }
  em { color: #555; }
  hr { border: none; border-top: 1pt solid #ccc; margin: 12pt 0; }
  .page-break { page-break-before: always; }
  .cover { text-align: center; padding-top: 80pt; }
  .cover h1 { border: none; font-size: 26pt; margin-bottom: 24pt; }
  .cover .sub { font-size: 12pt; color: #444; margin-bottom: 6pt; }
  .cover .meta { margin-top: 60pt; font-size: 10pt; color: #666; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`
}

const coverPage = `
<div class="cover">
  <h1>Tere Health Limited</h1>
  <div class="sub">Supporting documents for MCNZ COS2 application</div>
  <div class="sub">${K.patient} — MCNZ ${K.patientMcnz}</div>
  <div class="meta">
    Contains:<br>
    1. Cover letter<br>
    2. Job offer<br>
    3. Supervision plan (${K.supervisor})<br><br>
    The COS2 application form is uploaded separately to myMCNZ.<br>
    Compiled ${K.todayLong}
  </div>
</div>
`

async function main() {
  const body = coverPage
    + `<div class="page-break"></div>` + marked.parse(COVER)
    + `<div class="page-break"></div>` + marked.parse(OFFER)
    + `<div class="page-break"></div>` + marked.parse(PLAN)

  const doc = html(body)
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent(doc, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
  await page.pdf({ path: OUT, format: 'A4', printBackground: true, margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' } })
  await browser.close()
  console.log('Written:', OUT)
}

main().catch(e => { console.error(e); process.exit(1) })
