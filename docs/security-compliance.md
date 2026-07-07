# Tere Health — Security & Compliance Overview

**Version:** 1.0
**Date:** 2026-07-08
**Contact:** patrickherling@gmail.com · terehealthnz@gmail.com
**Audience:** Primary Health Organisations, DHB / Te Whatu Ora procurement, employer clients, privacy officers, HDC / Privacy Commissioner enquiries

This document describes the security architecture, sub-processors, regulatory posture, and compliance controls of the Tere Health telehealth platform. It is written to be shared with institutional buyers conducting due diligence and to answer specific questions from their privacy officers or clinical governance teams.

---

## 1. Product Overview

Tere Health is a New Zealand-registered telehealth platform providing rural urgent-care consultations. Patients complete an AI-assisted triage flow, are optionally reviewed via a video consultation with a New Zealand-registered clinician, and receive prescriptions, ACC45 forms, medical certificates, and referrals as clinically indicated.

- **Legal entity:** Tere Health Limited (New Zealand)
- **Product URL:** https://terehealth.co.nz
- **Codebase:** Private repository, terehealthnz/tere-app
- **Patient population:** New Zealand residents

---

## 2. Regulatory Framework

Tere operates under and complies with:

| Framework | Scope |
|---|---|
| **NZ Privacy Act 2020** | General personal information handling |
| **NZ Health Information Privacy Code 2020 (HIPC)** | Health information specifically; applies to all Tere-collected clinical data |
| **HDC Code of Health and Disability Services Consumers' Rights** | Patient rights, informed consent, quality of care |
| **Accident Compensation Act 2001 + ACC Sensitive Claims regulation** | Injury cover and ACC45 lodgement |
| **Medicines Act 1981 + Misuse of Drugs Act 1975** | Prescribing scope and controlled-drug prohibitions |
| **HIPAA (US) via AWS BAA** | Cross-border safeguard for AI processing sub-processor |
| **MCNZ record-keeping standards** | Structure and retention of medical notes |

### 2.1 HIPC Rule 12 (cross-border health information)

Cross-border transfer of patient health information is authorised under HIPC Rule 12 through two combined limbs:

1. **Explicit patient consent** captured at the start of every consultation (Section 8 below).
2. **Comparable contractual safeguards** through an executed Business Associate Agreement with AWS (Section 5.3 below), which contractually binds AWS to HIPAA-equivalent standards for the handling of protected health information.

---

## 3. System Architecture

### 3.1 High-level data flow

```
Patient browser  ──HTTPS──▶  Vercel (Node serverless functions, US region)
                              │
                              ├──▶ Supabase (Postgres + Row-Level Security, US region)
                              │      Patient records, consultations, transcripts, prescriptions
                              │
                              ├──▶ AWS Bedrock (BAA-covered, global inference profile)
                              │      Anthropic Claude — notes generation, ACC assessment, translations
                              │
                              ├──▶ LiveKit Cloud (WebRTC video)
                              │      Transient audio/video, not recorded server-side
                              │
                              ├──▶ Stripe (Payment)
                              ├──▶ Twilio (SMS)
                              ├──▶ Resend (Email)
                              └──▶ Documo / Telnyx (Fax for prescriptions)
```

### 3.2 Application boundary

- **Frontend:** React + Vite single-page application served from Vercel CDN.
- **Backend:** Vercel serverless functions written in Node.js. All PHI reads/writes are server-mediated (row-level security combined with a per-endpoint column allowlist). No direct browser → Supabase writes for PHI tables.
- **Database:** Supabase (managed Postgres). Row-Level Security policies enforce provider ownership on all PHI tables. The service-role key is held server-side only.

---

## 4. Authentication and Access Control

### 4.1 Providers (clinicians)

- **Primary auth:** PIN-based clinician login combined with a Supabase-issued provider row identifier stored in sessionStorage.
- **API auth:** Every provider-scoped API request carries an `x-provider-id` header validated server-side against the `providers` table. Only active provider rows are accepted.
- **Supabase JWT path:** Available as a parallel path for future migration to fully Supabase-native auth.
- **Failed-attempt monitoring:** 10 or more failed provider auth attempts within one hour trigger an automated alert to the security contact.

### 4.2 Patients

- **Anonymous flow:** Patients complete triage without creating a login. A per-consultation identifier is issued and stored in the browser session.
- **Server-mediated writes:** Patient-facing endpoints (create-consultation, patient-consult, submit-triage, and similar) use a column allowlist enforced inside the endpoint to prevent field-injection attacks.
- **Rate limiting:** In-memory rate limit of 100 requests per 15 minutes per IP for general endpoints; 10 requests per hour per IP for payment endpoints.

### 4.3 Administrators

- Admin functionality (staff scheduling, payroll, employer directory, feature flags, careers pipeline) is gated behind an `is_admin` flag on the provider row and is not exposed to standard clinicians.

---

## 5. Sub-processors

The following sub-processors handle Tere data. All are contractually bound and identified for patients in the consent flow.

| Sub-processor | Data handled | Region | Contract |
|---|---|---|---|
| **Vercel** | Application hosting, function execution | US | Standard Terms + DPA |
| **Supabase** | Postgres database, file storage, auth | US | Standard Terms + DPA |
| **AWS (Bedrock)** | AI inference (Anthropic Claude) | Global (via `global.` inference profile) | **Executed BAA — signed 2026-07-07** |
| **Anthropic (via AWS)** | Claude foundation model | Covered under AWS BAA | Sub-processor to AWS |
| **LiveKit** | Real-time video/audio (WebRTC) | Global edge | Standard Terms |
| **Stripe** | Payment processing | US | Standard Terms + DPA |
| **Twilio** | Outbound SMS | Global | Standard Terms |
| **Resend** | Outbound email (consultation summaries, notifications) | US | Standard Terms |
| **Documo / Telnyx** | Outbound fax (prescriptions to pharmacies) | US | Standard Terms |
| **Sentry** | Error tracking (PII scrubbed) | US | Standard Terms + DPA |

### 5.1 What each sub-processor sees

- **Vercel, Supabase:** Full patient record (consultation transcripts, notes, prescriptions, contact details).
- **AWS Bedrock / Anthropic:** Transient — consultation transcript + triage data + provider-generated prompts for the duration of a single API call. Not stored beyond the request.
- **LiveKit:** Transient — audio and video streams during a live consultation. No server-side recording is enabled.
- **Stripe:** Payment amount, patient email, consultation identifier. No clinical data.
- **Twilio, Resend:** Outbound message content only. Contain consultation summaries or notification content as required by the message purpose.
- **Documo / Telnyx (fax):** Prescriptions transmitted to community pharmacies. Fax pages carry prescriber identifiers, patient identifiers (name, DOB, NHI), drug, dose, and directions. Pharmacies are matched from a curated register of NZ community pharmacies. Fax is the current transmission channel while integration with the New Zealand ePrescription Service (NZePS) is developed — see Section 13.
- **Sentry:** Application errors with PII scrubbed at ingestion. No transcripts, notes, or identifiers are transmitted.

### 5.2 AWS Business Associate Agreement (Bedrock)

Executed 2026-07-07 via AWS Artifact. Covers all HIPAA-eligible AWS services used by the Tere account. Signed PDF available on request.

Under this BAA:
- AWS contractually treats all data submitted to Bedrock as Protected Health Information.
- AWS is required to maintain HIPAA-equivalent administrative, physical, and technical safeguards.
- Breach notification obligations to Tere are contractually specified.
- The HCLS Addendum (which authorises AWS to de-identify data for its own service improvement) has **not** been signed. AWS is therefore not permitted to use Tere-submitted data for any purpose beyond providing the Bedrock service to Tere.

### 5.3 Data flow to AI

All clinical AI processing (note generation, ACC eligibility assessment, drug interaction checks, translations, patient summaries) routes through a single internal helper module (`api/_ai.js`) that talks exclusively to AWS Bedrock. No direct connection to the public Anthropic API exists in the codebase or the deployment environment. The `ANTHROPIC_API_KEY` environment variable was removed from Vercel on 2026-07-08 to eliminate any residual fallback path.

---

## 6. Encryption

### 6.1 In transit

- All HTTP traffic between browsers, Vercel, Supabase, AWS Bedrock, LiveKit, Stripe, and other sub-processors is enforced TLS 1.2 or higher.
- WebRTC media streams to LiveKit are DTLS/SRTP encrypted end-to-end.
- No PHI transits over plain HTTP.

### 6.2 At rest

- **Supabase:** All Postgres data is encrypted at rest by default (AES-256).
- **AWS Bedrock:** Requests and responses are not persisted beyond the API call. Any transient in-memory data is protected by AWS control-plane encryption.
- **Vercel:** No PHI is stored at rest by Vercel; the serverless functions are stateless.

### 6.3 Secrets

- All API keys and service credentials are stored as encrypted environment variables in Vercel (Production, Preview, and Development scopes).
- Local development uses a `.env.local` file that is gitignored.
- The Supabase service-role key is never exposed to the browser bundle.

---

## 7. Audit Logging

- **Application audit log:** A dedicated `audit_log` table records provider-side actions (log-in, consultation open, notes-finalise, prescription-sent, etc.) with actor identifier, timestamp, and action type. No PHI content is written to the audit log; only structural metadata.
- **Vercel function logs:** Structured JSON logs record request IP, route, status code, and rate-limit outcome. PHI is never written to logs.
- **Supabase logs:** Standard Supabase auth and Postgres logs are retained per Supabase's default policy.
- **Failed authentication alert:** 10 or more failed provider authentication attempts within one hour trigger an automated email alert.

---

## 8. Patient Rights and Consent

### 8.1 Consent capture

Consent is captured at the start of every consultation via the `ConsentPage` flow:

1. **HDC Rights of Consumers** — explicit acknowledgement of the Code of Health and Disability Services Consumers' Rights, including the right to full information, informed choice and consent, and confidentiality.
2. **AI processing disclosure** — patients are informed that their clinical information is processed by Anthropic Claude via AWS Bedrock under an executed Business Associate Agreement with AWS providing HIPAA-level safeguards, and that AI-generated notes are reviewed and finalised by a New Zealand-registered clinician.
3. **Prescribing limitations** — patients acknowledge the specific medication classes Tere cannot prescribe via telehealth (controlled drugs, benzodiazepines, chronic opioids).
4. **Research participation** — optional; opt-in only; never a condition of care.

### 8.2 Rights supported

- **Right to information:** Patients can request a copy of their consultation record via a support request.
- **Right to correction:** Any factual error in the record can be raised with the consulting clinician or the compliance contact.
- **Right to withdraw consent:** Consent to future AI processing can be withdrawn by written request; historical records remain in the medical record as required by MCNZ and HDC.
- **Right to complain:** Complaints can be raised directly with Tere, to the Health and Disability Commissioner, or to the Office of the Privacy Commissioner. Contact details are surfaced in the app's help section.

---

## 9. Data Residency

- **Application and database:** Currently hosted in the United States (Vercel, Supabase).
- **AI processing:** AWS Bedrock via the `global.` inference profile, which routes to the lowest-latency BAA-covered region. All eligible regions are HIPAA-covered under the same BAA.
- **Video / audio:** LiveKit global edge network. No server-side recording is enabled; media is not persisted.

### 9.1 Sydney migration roadmap

A migration of Supabase and Bedrock to the Sydney region (`ap-southeast-2`) is planned. The Bedrock migration to Sydney is available as an environment-variable change (approximately 30 seconds of engineering time) as soon as APAC inference profiles are available for the specific Claude model versions in use. The Supabase migration is scheduled for a maintenance window and is expected to take four to six hours of downtime.

Region migration is deferred rather than blocking because the current sub-processor chain is fully BAA-covered and provides equivalent legal protection; regional pinning is a defence-in-depth improvement rather than a compliance requirement.

---

## 10. Breach Response

In the event of a suspected or confirmed breach:

1. **Immediate containment** — the affected system component (endpoint, sub-processor, provider account) is isolated using the feature-flag system or credential rotation.
2. **Scope assessment** — the compliance contact reviews audit logs and Vercel function logs to determine the scope of affected records.
3. **Notification** — under the Privacy Act 2020, notifiable breaches are reported to the Office of the Privacy Commissioner and affected individuals within the statutorily required window (currently as soon as reasonably practicable).
4. **Sub-processor notification obligations** — AWS is contractually required under the BAA to notify Tere of any breach affecting Tere-submitted data. Supabase and Vercel have equivalent obligations under their DPAs.
5. **Post-incident review** — a written incident report is filed. Structural changes are prioritised via the engineering roadmap.

---

## 11. Data Retention

- **Consultation records** (including notes, transcripts, prescriptions, ACC forms): retained for a minimum of ten years from the date of consultation, as required by NZ medical records regulation. Longer retention applies for records of minors as required by law.
- **Audit log entries:** retained for the same period as the associated consultation record.
- **AI-generated draft content that is not accepted into a final note:** retained on the consultation record for provider review and quality assurance.
- **Payment records:** retained per Stripe's default retention and NZ tax law (seven years).
- **Video / audio:** not recorded.

Patients may request deletion of specific record elements subject to the retention obligations above; any deletion is logged in the audit trail.

---

## 12. Testing and Continuous Verification

The platform is verified continuously through three test tiers:

1. **API-level health checks** — `/api/bedrock-test` fires small requests to both Claude models and reports latency and error state. `/api/status` reports the health of database, AI, payment, and email connectivity.
2. **Playwright API smoke suite** — automated tests against production hit every clinical AI endpoint with realistic payloads and assert on response shape and model behaviour.
3. **Playwright browser end-to-end suite** — full-browser tests simulate a provider session, navigate to the notes page, and verify that the UI correctly triggers the AI endpoint and renders the result.

All three suites are runnable on demand and are executed prior to any deployment that touches the AI pipeline or authentication paths.

---

## 13. Known Gaps and Roadmap

Tere maintains a documented list of security controls that are not yet in place but are planned. Presenting this transparently is deliberate — a mature security posture requires visibility of what has not yet been done as well as what has.

| Item | Current state | Planned |
|---|---|---|
| SOC 2 Type II | Not held by Tere directly; relies on sub-processor SOC 2 (Vercel, Supabase, AWS) | Consideration in year 2 |
| ISO 27001 | Not held | Consideration in year 2 |
| Formal Privacy Impact Assessment | Draft outline only | Complete PIA before first signed PHO contract |
| Data residency in New Zealand or Australia | Sub-processors hosted in US | Supabase and Bedrock migration to Sydney (`ap-southeast-2`) planned |
| Third-party penetration test | Not yet conducted | Planned before scaling beyond initial PHO deployment |
| Formal incident-response tabletop exercise | Not conducted | Planned within six months |
| Dedicated staging environment | In progress | Complete separation of staging from production, with independent database and function domain |
| Formal disaster recovery documentation | Sub-processor DR relied upon (Vercel, Supabase); no Tere-specific DR playbook | Draft DR playbook within six months |
| Prescription transmission | Documo / Telnyx fax to community pharmacies (industry-standard channel, universally accepted by NZ pharmacies) | Integration with the New Zealand ePrescription Service (NZePS) — direct HL7 / FHIR transmission to any NZePS-enabled pharmacy. Removes fax dependency and delivers real-time dispensing status. Currently in scoping. |

---

## 14. Governance

- **Chief compliance contact:** Patrick Herling (patrickherling@gmail.com, terehealthnz@gmail.com)
- **Data protection officer:** Currently combined with the compliance contact. Separate DPO to be appointed at scale.
- **Clinical governance:** New Zealand-registered clinician on all consultations. Final clinical accountability rests with the treating provider.
- **Regulatory notifications:** Directed to the compliance contact.

---

## Appendix A — Documents available on request

- Executed AWS Business Associate Agreement (2026-07-07)
- Supabase Data Processing Addendum
- Vercel Data Processing Addendum
- Anthropic Terms and Data Processing Addendum (as sub-processor under AWS BAA)
- Privacy Impact Assessment (draft, available Q3 2026)
- Sub-processor list (this document, Section 5)
- Data flow diagram (this document, Section 3.1)
- Consent flow content (in-app; screenshots available on request)

---

*This document is version-controlled at `docs/security-compliance.md` in the Tere codebase and is updated as the platform evolves. Substantive changes are communicated to institutional buyers via their designated procurement contact.*
