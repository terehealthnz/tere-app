# Coroner Death Reporting SOP

**Statute:** Coroners Act 2006, particularly ss13–15.
**Owner:** Dr Rachel Thomas (clinical accountable).
**Companion docs:** `hqsc-ssa-reporting-sop.md`, `privacy-breach-runbook.md`.

---

## 1. When to report a death to the Coroner

The Coroners Act 2006 s13(1) requires a doctor (or funeral director, or Police) to report a death to the Coroner if:

- The death was **unexpected** (no known illness that could reasonably explain it), OR
- The cause is **unknown**, OR
- The death was **violent, unnatural, or occurred in suspicious circumstances**, OR
- The death occurred during or shortly after **a medical procedure**, OR
- The death was of a person **in custody, under care, or subject to compulsory treatment**.

**For Tere Health specifically**, our reporting triggers are:

1. **A patient dies within 30 days of a Tere consultation** AND
2. **The death was unexpected, sudden, or possibly attributable to the presentation Tere treated**.

Deaths of patients from clearly unrelated causes (e.g. patient consulted us for a wrist sprain 20 days ago, died in a car crash today) do not trigger this SOP.

## 2. Who reports

- **Rachel Thomas (Medical Director)** is the default reporter for Tere.
- If Rachel is unavailable, the treating clinician on the relevant consultation may report directly.
- Coroner will ordinarily be contacted by the certifying doctor (usually a GP or hospital doctor), not us. Our obligation is to **share information promptly** when the Coroner or a Coronial Services Investigator (CSI) requests it, AND to self-notify if we believe a death should be reported and hasn't been.

## 3. How we learn about the death

- **Family notification** — via support form / phone / email.
- **Referrer notification** — GP, hospital, or another provider.
- **HL7 message** — some hospital ADT feeds include discharge-to-mortuary.
- **Coroner or Police enquiry** — direct.
- **News/social media** — rare but possible in small communities.

Every notification is logged as an incident row with `kind='death_notification'`.

## 4. Immediate actions on learning of a death

### T = 0: Learn of the death
- Patrick or Rachel confirms the identity of the deceased against our records.
- If unsure whether it's a Tere patient, do not act on external assumptions — verify NHI + name + DOB.

### T + 4 hours: Preserve records
- Freeze all records related to the patient: consultations, notes, prescriptions, HL7 messages, audit_logs.
- Add a soft-flag on the patient row: `patients.deceased_at` if we can confirm the date.
- Under no circumstances delete, edit, or reformat records.

### T + 1 business day: Rachel review
- Rachel reviews the last consult(s) with a critical eye:
  - Was the presentation potentially the same illness that caused the death?
  - Did we miss a red flag?
  - Was our management appropriate?
- Documents findings in the incidents row: `Preliminary assessment: [likely unrelated / possibly related / unable to determine without post-mortem].`

### T + 5 business days: Notify others as required
- **Coroner** — if we believe a death should be reported and hasn't been (see §5).
- **HQSC** — if the death might be an SAC1 event attributable to our care (parallel process — see `hqsc-ssa-reporting-sop.md`).
- **MPS** — always, if there's any possibility of clinical involvement.
- **HDC** — only if family complains or if we believe our care was substandard.
- **Family** — if we haven't heard from them, and it's appropriate, express condolences and offer to meet.

## 5. When we initiate a Coroner notification ourselves

- If a certifying doctor (GP or hospital) is NOT going to certify a natural cause and NO other provider has reported to the Coroner, and we believe the death meets s13 triggers, Rachel notifies the Coroner directly.
- **Contact:**
  - Coronial Services online reporting: https://coronialservices.justice.govt.nz/reporting-a-death/
  - After-hours: local Police (they contact on-call Coroner)
  - Marlborough / Nelson region: Coroner Marcus Elliott / associated CSIs

## 6. Cooperating with a Coroner enquiry

If the Coroner or a Coronial Services Investigator (CSI) contacts us:

- **Respond within 2 business days.**
- **Provide requested records fully and promptly** — coronial powers of production override normal privacy protections (Privacy Act 2020 s34 + HIPC Rule 11(2)(g)).
- **Do not redact clinical information** unless the Coroner has agreed to a specific redaction.
- **Copy Rachel + MPS** on every substantive communication.
- **Log the interaction** in the incident row + `disclosure_events` (channel = 'coronial_request').

## 7. Inquest / hearing preparation

If the Coroner opens an inquiry or inquest:

- MPS legal support is engaged from the outset.
- Rachel + any involved clinician prepare a factual statement (not opinion).
- Do NOT discuss the case with media until inquiry concludes.
- Attend hearing as requested.

## 8. Post-inquest learning

- Any Coroner's recommendation is treated as an implementation obligation.
- Anonymised summary + corrective actions recorded in `docs/regulatory/coronial/YYYY-MM-brief.md`.
- Reviewed at Clinical Governance Meeting.

## 9. Communication with family

- Rachel makes initial contact if we have their details and no other clinician has (avoid duplicating outreach with hospital bereavement teams).
- Offer condolence; offer to discuss the case; offer access to records under Right 6 (extends to next-of-kin post-death under specific conditions — Privacy Act 2020 s22C).
- Do NOT admit legal liability; direct legal questions to MPS.
- Written follow-up documenting the conversation.

## 10. Records + retention

- Consultation records for a deceased patient are retained **at least 10 years** post-death (HIPC Rule 4 + Coroners Act preservation obligation).
- Retention purge cron (task #360) excludes any patient with `deceased_at` set for 20 years minimum.

## 11. Key contacts

- **Coronial Services**: 0800 266 800 · https://coronialservices.justice.govt.nz
- **MPS (Medical Protection Society)**: 0800 225 5677 (24/7)
- **HQSC** (parallel adverse-event track): (04) 901 6070

## Change log

- 2026-09-03 — v1.0 initial SOP. Rachel to review + sign off.
