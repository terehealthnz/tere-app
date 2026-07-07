# Tere Health — Privacy Impact Assessment

**Version:** 1.0 (draft for review)
**Date:** 2026-07-08
**Prepared by:** Patrick Herling (patrickherling@gmail.com)
**Next review:** 2027-01-08 (six-month cadence, or earlier if scope changes materially)
**Companion document:** [`docs/security-compliance.md`](./security-compliance.md)

---

## Executive Summary

Tere Health Limited is a New Zealand rural telehealth platform that collects, processes, and stores health information as part of delivering urgent-care consultations. This Privacy Impact Assessment (PIA) has been prepared in line with the guidance issued by the Office of the Privacy Commissioner and evaluates the platform's compliance with the Health Information Privacy Code 2020 (HIPC) and the Privacy Act 2020.

**Summary of findings:**

- Tere collects only the health information reasonably necessary to deliver clinical care and to meet regulatory obligations (ACC lodgement, prescribing, medical certificates).
- The information flow, sub-processor chain, and cross-border transfer arrangement are documented and contractually protected.
- Cross-border processing of health information for AI-assisted note generation is authorised under HIPC Rule 12 through the combined limbs of explicit patient consent and comparable contractual safeguards (an executed Business Associate Agreement with Amazon Web Services).
- Identified residual risks are documented in Section 6 with mitigation and target dates.
- No material privacy issues currently block launch or ongoing operation. Several defence-in-depth improvements are scheduled and tracked.

This document is intended to be shared with institutional buyers (Primary Health Organisations, DHBs / Te Whatu Ora, employer clients) as part of their due-diligence review, and with the Office of the Privacy Commissioner if requested.

---

## 1. Project Description

### 1.1 Purpose of collection

Tere Health collects personal and health information for the following purposes:

- To deliver telehealth clinical consultations (triage, video call, message consultation, and asynchronous follow-up).
- To generate and issue prescriptions, medical certificates, radiology referrals, and ACC45 injury claim forms.
- To meet the record-keeping obligations imposed by the Medical Council of New Zealand and the Health and Disability Commissioner.
- To enable billing (patient copay or employer-covered) and processing of ACC compensation claims where applicable.
- To improve the platform through anonymised, aggregated analytics and opt-in research participation.

### 1.2 Legal basis for processing

- **Patient consent** captured at the beginning of every consultation covers all clinical and operational processing.
- **HIPC Rule 10 (limits on use) and Rule 11 (limits on disclosure)** authorise use and disclosure directly related to the purpose of collection without further consent.
- **HDC Code Right 6 (right to be fully informed)** and **Right 7 (right to make an informed choice and give informed consent)** are met through the in-app consent flow.
- **Cross-border transfer** is authorised under HIPC Rule 12 as described in Section 4.12 below.

### 1.3 Timeline and maturity

- Product live in production, serving New Zealand-based patients.
- AI-assisted note generation was migrated to AWS Bedrock under an executed BAA on 2026-07-07.
- This PIA is the first formal iteration and is scheduled for review every six months, or earlier if:
  - a new sub-processor is added,
  - the residency of an existing sub-processor changes,
  - a new category of clinical information is collected, or
  - a material privacy incident occurs.

---

## 2. Personnel and Governance

| Role | Individual | Contact |
|---|---|---|
| Compliance owner | Patrick Herling | patrickherling@gmail.com |
| Clinical governance lead | Patrick Herling (interim) | patrickherling@gmail.com |
| Data protection officer | Combined with compliance owner (interim) | patrickherling@gmail.com |
| Registered clinician (accountability for clinical records) | Consulting provider on each consultation | via consultation record |

At operational scale, the DPO role is intended to be separated from the compliance owner role. This is documented as a scheduled organisational change in the roadmap (Section 6).

---

## 3. Information Flows

### 3.1 Categories of personal information collected

| Category | Examples | Sensitivity |
|---|---|---|
| Identity | Name, date of birth, NHI number | High |
| Contact | Email, phone, region | Medium |
| Clinical presentation | Chief complaint, symptom detail, urgency | High |
| Clinical history | Medical history, medications, allergies | High |
| Consultation record | Video/audio transcript, provider notes, examination findings, MDM | High |
| Injury details (ACC) | Mechanism, date, employer | High |
| Prescription details | Drug, dose, frequency, dispensing pharmacy | High |
| Payment | Amount, Stripe payment intent identifier, employer identifier if covered | Medium |
| Consent and audit | Timestamps, checkbox state, consent version | Low |
| Analytics | Aggregated, de-identified usage metrics | Low |

Tere does not collect:

- Photo identity documents.
- Government-issued ID other than NHI.
- Passport or immigration data.
- Biometric templates (rPPG vitals are processed live and discarded — no biometric templates persist).
- Social media identifiers or handles.
- Political, religious, or trade-union affiliation.

### 3.2 Information flow diagram

Refer to Section 3.1 of the companion Security & Compliance document at [`docs/security-compliance.md`](./security-compliance.md) for the system-level data flow diagram.

### 3.3 Sub-processors and cross-border transfers

Refer to Section 5 of the companion Security & Compliance document for the full sub-processor list, region of processing, and contractual arrangement per party.

Cross-border transfers are made to:

- **Vercel** (United States) — application hosting, transient function execution.
- **Supabase** (United States) — primary database and file storage.
- **Amazon Web Services — Bedrock** (multi-region via the `global.` inference profile, all regions HIPAA-covered under a single executed BAA) — AI inference.
- Standard supporting sub-processors (Stripe, Twilio, Resend, LiveKit, Sentry) receive information limited to the scope required for their function, as described in the Security & Compliance document Section 5.1.

### 3.4 Retention

- Consultation records (including notes, transcripts, ACC forms, prescriptions) are retained for a minimum of ten years from the date of consultation. Longer retention applies to records of minors, and to any consultation subject to a complaint or clinical incident investigation, until such investigation is closed and the statutorily required retention period has elapsed.
- Payment records are retained for seven years per NZ tax law.
- Consent records are retained for the same period as the associated consultation record.
- Audit-log entries are retained for the same period as the associated consultation record.
- Draft AI content that is generated but not accepted into the final note is retained on the consultation record for quality assurance and provider review.
- Video and audio streams are not recorded server-side and are not retained after the call ends.

---

## 4. HIPC Rule-by-Rule Compliance Analysis

The Health Information Privacy Code 2020 sets out twelve rules that Tere must comply with as a health agency. This section addresses each rule.

### Rule 1 — Purpose of collection

Tere collects health information for the specific and lawful purposes described in Section 1.1. Each type of information collected has an identifiable clinical, regulatory, or operational purpose. Information not required for the delivery of care is not collected.

### Rule 2 — Source of health information

Health information is collected directly from the individual concerned via the in-app triage flow. Where the patient identifies existing health conditions, current medications, or a nominated pharmacy, that information is provided by the patient. External sources (for example, HPI pharmacy lookup) are used only to enrich patient-provided data with public reference information; no health information about the individual is obtained from third parties without the individual's involvement.

### Rule 3 — Collection of health information from individual

At the point of collection, the individual is made aware of:

- The identity of Tere Health as the collecting agency.
- The purpose for which the information is being collected (clinical care and associated regulatory obligations).
- The intended recipients of the information (the consulting clinician; sub-processors as listed in the Security & Compliance document).
- Whether the collection is authorised or required by law (some fields, such as NHI for ACC45 lodgement, are required to complete the associated regulatory purpose).
- The consequences of not providing the information (Tere may be unable to deliver the requested care or associated deliverables such as an ACC form).
- The right to access and correct the information.

### Rule 4 — Manner of collection

Health information is collected through the in-app triage flow. Collection is:

- **Not unlawful** — the flow does not use deception or coercion.
- **Not unfair** — the interface is designed to be clear and to avoid pressuring the individual into providing information they have not been asked to consent to.
- **Not unreasonably intrusive** — the volume and specificity of information collected is proportionate to the clinical purpose.
- **Age-appropriate** — the interface uses plain language and avoids medical jargon.

### Rule 5 — Storage and security

Refer to Sections 6 and 4 of the companion Security & Compliance document for encryption and access-control detail.

Summary:

- All health information is encrypted in transit (TLS 1.2+).
- All health information is encrypted at rest in the primary database (Supabase AES-256 default).
- Server-side row-level security combined with a per-endpoint column allowlist prevents unauthorised access or field injection.
- Failed provider-authentication attempts are monitored and trigger an automated alert at ten failures within one hour.
- Sub-processors are contractually obliged to maintain equivalent security standards (BAA for AWS; DPAs for Supabase, Vercel, Stripe, Sentry).

### Rule 6 — Access

Individuals have the right to access health information Tere holds about them. Access requests should be directed to the compliance owner (Section 2). Verification of identity is required before access is granted; verification is done by matching the requester to the record via NHI, date of birth, and email or phone.

Requests for access are actioned within twenty working days as required by the Privacy Act.

### Rule 7 — Correction

Individuals have the right to request correction of any factual error in their health information. Corrections are made after clinical review by the treating provider or the compliance owner. Where a correction is requested but not accepted, a statement of the correction requested is attached to the record, and the individual is informed.

### Rule 8 — Accuracy before use

Health information is checked for accuracy at the point of triage capture (structured input, validation of dates and numeric fields) and again by the consulting clinician before it is used in clinical decision-making. AI-generated content is explicitly reviewed and finalised by a New Zealand-registered clinician before entering the medical record; the AI's output is a starting draft, not a final record.

### Rule 9 — Retention

Refer to Section 3.4 above.

### Rule 10 — Limits on use

Health information collected for the purpose of delivering care is used only for that purpose and directly related purposes (billing, ACC lodgement, prescription fulfilment, safety review). Secondary uses (analytics, research) are only carried out with:

- **Opt-in consent** for research participation, captured separately from the primary consent flow and reversible at any time; or
- **De-identification** to a standard where re-identification is not reasonably practicable, for aggregated platform analytics.

### Rule 11 — Limits on disclosure

Health information is disclosed only to:

- The individual concerned.
- The consulting clinician.
- Sub-processors as listed in the Security & Compliance document, each of whom has contractual obligations that limit their processing to the purposes for which Tere has engaged them.
- Third parties where disclosure is required by law (for example, notifiable disease reporting, information required by ACC in the course of a claim, or a lawful information request from the police under specified conditions).
- Third parties where disclosure is required to prevent or lessen a serious threat to life or health, as authorised by the exceptions to Rule 11.

### Rule 12 — Unique identifiers and cross-border transfer

Tere uses the NHI as the primary clinical identifier where the patient has provided it. Where an NHI is not available, Tere generates an internal identifier that is not shared with unrelated third parties.

**Cross-border transfer** of health information (which is authorised as a limb of Rule 11 in HIPC 2020) is undertaken as described in Section 3.3. Cross-border transfer is lawful under the following combined authorities:

1. **Explicit patient consent** captured in the in-app consent flow that specifically discloses:
   - The identity of the AI sub-processor (Anthropic Claude via AWS Bedrock).
   - The nature of the contractual safeguard (executed Business Associate Agreement with AWS providing HIPAA-level safeguards).
   - The role of clinician review (AI-generated notes are reviewed and finalised by a New Zealand-registered clinician before entering the record).
2. **Comparable contractual safeguards** through the executed AWS BAA (2026-07-07), which contractually binds AWS to maintain HIPAA-equivalent administrative, physical, and technical safeguards.

The HCLS Addendum to the AWS BAA (which would authorise AWS to use the data for its own service improvement) has deliberately not been signed. AWS is therefore not permitted to use Tere-submitted health information for any purpose beyond providing the Bedrock service to Tere.

---

## 5. Privacy Risk Assessment

The following risks have been identified during the preparation of this PIA. Each risk is assessed for likelihood (Low / Medium / High) and impact (Low / Medium / High) and paired with the mitigation currently in place and any additional planned action.

| # | Risk | Likelihood | Impact | Current mitigation | Planned mitigation | Target |
|---|---|---|---|---|---|---|
| R1 | Unauthorised access to patient records through compromised provider credentials | Low | High | PIN-based clinician login; per-endpoint x-provider-id verification; failed-attempt monitoring at 10/hour | Migration to Supabase JWT + optional multi-factor | Q4 2026 |
| R2 | Cross-border sub-processor breach exposing health information | Low | High | BAA with AWS; DPA with Supabase / Vercel / Stripe; encryption in transit and at rest | Sydney migration of Supabase and Bedrock when APAC inference profiles become available | Q1 2027 |
| R3 | AI system generates incorrect clinical content that is not caught by clinician review | Low | Medium | System prompt explicitly restricts AI to accurate transcription with no independent clinical reasoning; clinician review and finalisation required before entering the medical record; `ai_notes_enabled` feature flag allows instant kill-switch | Formal safety-review process for prompt changes; sample audit of AI-generated content vs finalised notes | Q4 2026 |
| R4 | Patient inadvertently discloses more information than needed for care | Low | Low | Structured triage flow guides patient to relevant information; free-text fields are optional beyond the chief complaint | Ongoing UX review to minimise unnecessary field collection | Ongoing |
| R5 | Insufficient audit trail during clinical incident investigation | Low | Medium | Dedicated `audit_log` table for provider actions; Vercel function logs (metadata only); Supabase logs | Document audit-log retention policy and access process; add clinical-incident specific audit view | Q3 2026 |
| R6 | Sub-processor changes region or ownership without Tere becoming aware | Low | Medium | Contractual notification obligations under DPA/BAA | Quarterly sub-processor review scheduled | Every 3 months from 2026-Q3 |
| R7 | Withdrawal of consent to AI processing is not effectively actionable mid-record | Low | Low | Historical records remain in the medical record as required by MCNZ; future AI processing can be disabled per-consultation via the flag system | Documented process for handling consent withdrawal, including notice to affected clinicians | Q3 2026 |
| R8 | Insufficient staff training on privacy | Low | Medium | Compliance owner is same person as engineering owner; direct control of practices | As staff numbers grow, formal privacy induction and annual refresher | Before first non-founder hire |
| R9 | Patient unable to easily exercise access or correction rights | Medium | Low | Contact details in-app help section route to compliance owner; twenty-working-day response commitment | In-app "download my record" self-service feature | Q1 2027 |
| R10 | External penetration or vulnerability exploited before formal testing | Medium | High | Server-mediated writes with column allowlists; rate limiting; auth guard on all provider endpoints; frequent code review | Third-party penetration test scheduled before scaling beyond initial PHO deployment | Q1 2027 |

Overall risk position: no risk has been identified as both High Likelihood and High Impact. R10 (High impact, Medium likelihood) is the highest-priority residual risk and is targeted with a scheduled third-party penetration test.

---

## 6. Recommendations and Committed Actions

The following actions are formally committed as outcomes of this PIA. They are tracked in the engineering roadmap.

### Immediate (already implemented)

1. Executed AWS Business Associate Agreement covering all HIPAA-eligible AWS services.
2. Removal of all direct connections to the public Anthropic API; all clinical AI now routes through the BAA-covered path.
3. Updated in-app consent copy to name the AI sub-processor chain and the executed BAA.
4. Three-tier verification for the AI processing path (health check, API smoke test, browser end-to-end test) with all three passing in production.
5. Publication of the Security & Compliance overview document at [`docs/security-compliance.md`](./security-compliance.md).

### Within six months (2026-Q3 to 2026-Q4)

6. Documentation of the audit-log retention and access process in a dedicated policy document.
7. Documented process for handling patient requests to withdraw consent to future AI processing.
8. Quarterly review of sub-processor list, region, and contractual status.
9. Formal safety-review checklist for changes to AI system prompts.
10. Formal incident-response tabletop exercise.

### Within twelve months (2026-Q4 to 2027-Q1)

11. Third-party penetration test of the production environment.
12. Sydney (`ap-southeast-2`) migration of Supabase and Bedrock, subject to APAC inference profile availability.
13. In-app self-service "download my record" feature for patients.
14. Migration to Supabase JWT-based provider authentication and optional multi-factor.
15. Separation of the Data Protection Officer role from the Compliance Owner role.

### Standing commitments

16. This PIA is reviewed every six months and re-published if material changes occur.
17. Any new sub-processor is added only after a documented review of its contractual and technical safeguards.
18. Any material privacy incident triggers a specific review of the affected section of this PIA.

---

## 7. Sign-off

| Role | Name | Signature / Attestation | Date |
|---|---|---|---|
| Compliance Owner | Patrick Herling | Attested by publication to the versioned codebase, commit fc6f74a and successors | 2026-07-08 |
| Clinical Governance Lead | Patrick Herling (interim) | Attested by publication to the versioned codebase | 2026-07-08 |
| External reviewer (optional) | | | |

---

## Appendix A — Documents referenced

- [`docs/security-compliance.md`](./security-compliance.md) — Security & Compliance overview
- Executed AWS Business Associate Agreement — 2026-07-07 (available on request)
- Supabase Data Processing Addendum (available on request)
- Vercel Data Processing Addendum (available on request)
- In-app Consent flow — `src/pages/patient/ConsentPage.jsx` in the codebase; screenshots available on request

## Appendix B — Change history

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.0 (draft) | 2026-07-08 | Patrick Herling | Initial draft prepared following the AWS BAA cutover on 2026-07-07 |

---

*This Privacy Impact Assessment is a living document. The most current version is maintained at `docs/privacy-impact-assessment.md` in the Tere codebase. Substantive changes are communicated to institutional buyers via their designated procurement contact.*
