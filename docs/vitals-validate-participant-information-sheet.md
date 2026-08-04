# VitalsValidate — Participant Information Sheet

**Version:** 1.0
**Date:** 2026-08-04
**Study:** VitalsValidate — accuracy validation of Tere Health's camera-based vital-signs measurement (rPPG) against reference cuff blood-pressure readings
**Sponsor:** Tere Health Limited (Blenheim, New Zealand)
**Principal investigator:** Dr Patrick Herling (MCNZ 99529 · HPI-CPN 24NSES), Founding Medical Officer, Tere Health Limited
**Ethics status:** Reviewed by New Zealand Health and Disability Ethics Committee (HDEC) and determined **out of scope** on 3 August 2026 (anonymous, low-risk observational research below the HDEC-mandatory threshold). Bound by the National Ethical Standards for Health and Disability Research (NEAC 2019).

---

## 1. What is this study about?

Tere Health has built a system that estimates a person's vital signs — heart rate, respiratory rate, oxygen saturation, and (experimentally) blood pressure — from a short video of their face captured by a standard smartphone camera. This is called remote photoplethysmography, or rPPG.

We need to check how accurate this measurement is across a wide range of people — different ages, sexes, body shapes, skin tones, and health conditions. That's what VitalsValidate is for.

We are inviting members of the public to take a short measurement with their phone at the same time as taking a reference measurement with a standard blood-pressure cuff at home, at a pharmacy, or at their GP.

## 2. What will you be asked to do?

1. Enter a small amount of anonymous information about yourself: age, sex, height, weight, Fitzpatrick skin scale (a 1–6 scale of skin tone), whether you have high or low blood pressure, and any other relevant conditions.
2. Take a reference cuff reading: enter your systolic blood pressure, diastolic blood pressure, and heart rate from a standard cuff device.
3. Take a 30-second facial video with your phone's camera using our web app. The app processes the video on your device to extract a vital-signs estimate.

The entire process takes about 5–10 minutes.

## 3. Do we collect anything that identifies you?

**No.** We do not collect your name, email, address, phone number, or any other identifying information. Each submission is stored with an anonymous internal identifier only.

The information we do collect is limited to the demographics and readings listed above, plus device-and-browser metadata sent automatically by your web browser (approximate location by IP, user-agent string). We do not retain the raw video — only the numeric vital-signs values extracted from it.

## 4. Withdrawal — important

Because the study is anonymous, **once you submit a measurement we cannot identify which record is yours**. This means we cannot withdraw an individual submission on request.

You can stop the study at any point *before* pressing Submit — nothing is saved until you do.

## 5. Risks and burdens

- No physical intervention. The reference cuff reading you take is one you would take yourself at home or at a pharmacy; we do not ask you to do anything additional.
- No medicines, no interventions, no diagnostic decisions based on the measurement. VitalsValidate is not a clinical tool.
- The reading you get from Tere's rPPG system is a research measurement — do not use it to make decisions about your health. If you are concerned about your blood pressure, see your GP or call Healthline (0800 611 116).

## 6. Benefits

- No direct benefit to you as an individual participant.
- Aggregate benefit: your submission helps validate a piece of NZ-developed health technology that, if accurate, can improve access to vital-signs monitoring for rural and remote patients across Aotearoa.
- Aggregate results will be published (see §10) so that the wider community can see what the study found.

## 7. Privacy, confidentiality, and data storage

- Data is stored in Tere Health's Supabase database in Sydney (`ap-southeast-2`) under an executed Data Processing Addendum. Full hosting posture is documented in [`docs/hosting-and-data-residency-statement.md`](./hosting-and-data-residency-statement.md).
- Access to the raw study data is restricted to the principal investigator (Dr Herling) and any designated study statistician. Every access is audit-logged in an append-only table (`docs/audit-log-retention-policy.md`).
- No third party will receive individual-level data. Any research collaborator receiving data will receive aggregate statistics only.

## 8. How long is data kept?

Anonymous VitalsValidate records are retained for **10 years** from the date of last data addition, in line with the Health (Retention of Health Information) Regulations 1996 as applied to research data. After 10 years the data will be permanently deleted.

## 9. Cultural safety and Te Tiriti o Waitangi

Tere Health acknowledges its obligations under Te Tiriti o Waitangi and to Māori Data Sovereignty. Our position and current commitments are documented in [`docs/maori-data-sovereignty.md`](./maori-data-sovereignty.md). Specific to VitalsValidate:

- The demographic set collected does not include ethnicity or iwi affiliation, deliberately, to keep the record fully anonymous. This means we cannot report validation accuracy stratified by ethnicity from this dataset.
- If you are Māori and would like to give feedback about the study or how your community's data is handled, please contact `hello@terehealth.co.nz`.

## 10. Publication of results

We commit to publishing aggregate results within 12 months of achieving the target sample size. Publication venues under consideration include the New Zealand Medical Journal, peer-reviewed international digital-health journals, and the Tere Health public research page. Because participants are anonymous, results will be made public rather than sent individually.

## 11. Complaints and concerns

If you have a question or concern about the study, please contact:

**Dr Patrick Herling** — patrickherling@gmail.com
Founding Medical Officer, Tere Health Limited

If you are not satisfied with the response, you can contact:

**Health and Disability Commissioner (HDC)** — 0800 11 22 33 · hdc@hdc.org.nz
**Health and Disability Ethics Committee (HDEC)** — hdecs@health.govt.nz
**Office of the Privacy Commissioner (OPC)** — 0800 803 909 · privacy@privacy.org.nz

## 12. Consent

By pressing "Start measurement" in the app, you confirm that:

- You have read and understood this information sheet.
- You are aged 18 or over. (VitalsValidate does not recruit minors.)
- You are participating voluntarily.
- You understand you can stop at any time before submitting.
- You understand that once submitted, an individual anonymous record cannot be withdrawn.
- You agree to your anonymous data being used as described above.

There is no financial payment for participation.
