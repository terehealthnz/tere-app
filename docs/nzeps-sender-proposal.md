# NZePS Sending Party Application — Tere Health Limited

*Document prepared to accompany Tere Health Limited's application to become a sending party on the New Zealand ePrescription Service (NZePS). Describes Tere Health's current prescribing workflow, the integration architecture we propose to build, and our compliance and operational posture. Filed with the Ministry of Health for review.*

**Prepared by:** Dr Patrick Herling · Director, Tere Health Limited
**Version:** v1 · 2026-07-09
**Contact:** terehealthnz@gmail.com

---

## 1. About Tere Health Limited

Tere Health is a rural-focused telehealth service delivering same-day video, phone, and asynchronous consultations to patients across New Zealand, with an emphasis on rural, remote, and under-served communities.

| Field | Value |
|---|---|
| Legal entity | Tere Health Limited |
| NZBN | 9429053723413 |
| Location | Marlborough Sounds, New Zealand |
| Website | terehealth.co.nz |
| Practice type | Rural telehealth — video, phone, asynchronous messaging |
| ACC vendor number | VEND-G11238 |
| HPI-Facility number | To be issued — application to Ministry underway |
| Number of active prescribers | 2 (Dr Patrick Herling · Dr Rachel Thomas), growing to 4–5 through 2026 |
| Named clinical lead | Dr Patrick Herling · MCNZ Prescriber # ________ · HPI-CPN ________ |
| Supervisor of any provider on a supervised scope | Dr Rachel Thomas · MCNZ Prescriber # ________ · HPI-CPN ________ |
| Patient identity resolution | New patients undergo NHI lookup at triage; existing patients matched by NHI on each consult |

## 2. Current prescription workflow

Tere currently issues prescriptions in two forms, both of which will remain in place after NZePS goes live (as fallbacks for pharmacies not yet on NZePS, transient outages, or patient preference for paper).

**Structured signed PDF prescription** — Generated server-side at consultation finalisation. Includes patient identity (NHI, DOB), prescribing clinician (name, HPI-CPN, MCNZ prescriber number, embedded signature image), drug and directions, quantity, repeats, dispensing pharmacy, and issue timestamp. Rendered by our `_pdf-builders.js` service and delivered to the patient by SMS/email link and, where applicable, direct to the pharmacy by fax.

**Fax transmission to the dispensing pharmacy** — Signed PDFs are transmitted to the patient's selected community pharmacy via a Documo (primary) or Telnyx (secondary) adapter. Pharmacy fax numbers are sourced from a nightly-refreshed community pharmacy register (hospital pharmacies excluded).

Safety controls already in place on the prescribe path:
- All controlled drugs, opioids, benzodiazepines, GLP-1 receptor agonists, stimulants, and hypnotics are hard-blocked at the modal level for every prescriber.
- Prescribers under MCNZ supervision have additional restrictions defined in their filed supervision plan and enforced at the modal level.
- Every prescription write is audit-logged with prescriber ID, patient ID, drug, quantity, repeats, and timestamp — retained indefinitely and available on request.

## 3. Why we want to be on NZePS

Fax and signed-PDF delivery are compliant with current prescribing law but inferior to NZePS on three dimensions that matter for a rural telehealth practice:

1. **Dispensing accuracy** — NZePS delivers structured drug data (DIN, dose, form) rather than free text, eliminating pharmacy re-keying errors.
2. **Latency** — Prescriptions land in the dispensing pharmacy's queue immediately rather than requiring the pharmacist to review a faxed image.
3. **Patient mobility** — A patient who moves between regions can present the same prescription at any NZePS-connected pharmacy without Tere having to know the destination pharmacy in advance. This particularly matters for our rural patient base who travel for work or family.

Tere is also proactively pursuing the electronic-prescribing path because it aligns with the Ministry's broader Digital Health Roadmap and eliminates a class of clinical safety risk that fax cannot fully mitigate.

## 4. Proposed integration architecture

### 4.1 Integration path

Tere proposes to integrate via a Ministry-approved messaging broker (HealthLink is our preferred partner unless the Ministry directs otherwise). Rationale:

- Faster onboarding than direct-to-NZePS integration.
- Broker handles wire-protocol conformance and MoH liaison at the transport layer, letting Tere focus on clinical UX.
- Well-trodden path for small clinical vendors — reduces novelty risk.
- Broker manages certificate lifecycle at the transport layer; Tere retains prescriber-identity signing responsibilities.

We are open to direct MoH integration if the Ministry believes it would be preferable for Tere's scale, and would appreciate guidance during the onboarding call.

### 4.2 High-level message flow

```
Prescriber (Tere PWA — video-consult device, laptop or phone)
        │
        ▼  authenticated Tere session (PIN + biometric optional)
Tere backend (Vercel serverless, ap-southeast-2)
        │
        ▼  structured HL7 CDA / FHIR message + prescriber digital signature
Messaging broker (HealthLink or direct MoH)
        │
        ▼  NZePS gateway (Ministry of Health / Te Whatu Ora)
        │
        ▼  push / pull
Dispensing pharmacy (Toniq, Simple, Rx One or other PMS)
        │
        ▲  dispensing acknowledgement
Tere backend  ◄──── update prescriptions.dispensed_at
```

### 4.3 Where credentials live

- **Tere Health Ltd organisation certificate** (or broker-issued equivalent) — stored in Vercel environment secrets as a base64-encoded .p12 with the passphrase in a separate secret. Loaded into an `https.Agent` per outbound request; never exposed to client bundles. Only two named staff hold administrative access to secrets.
- **Prescriber personal digital certificates** — each MCNZ-registered prescriber holds an individual HISO-approved certificate. Tere loads the prescriber's certificate at message signing time. Rotation is tracked per clinician; expiring certificates trigger a dashboard warning 30 days prior.

We are actively investigating the certificate options available and would appreciate the Ministry's guidance on the preferred CA(s) for a new sending party of Tere's scale.

### 4.4 Message assembly

We understand HISO 10029.4 defines the current HL7 v2.4-based message profile and that a FHIR-based profile is being developed by the Ministry. Tere is prepared to build against whichever profile the Ministry directs for a new sending party in 2026, and to migrate as profile versions evolve.

Fields mapped from Tere's existing data model:

| NZePS field | Source in Tere |
|---|---|
| Patient NHI | `patients.nhi_number` (captured or looked up at triage) |
| Patient full name, DOB, address | `patients.first_name`, `.last_name`, `.dob`, `.address` |
| Prescriber HPI-CPN | `providers.cpn` |
| Prescriber name and registration | `providers.first_name`, `.last_name`, `.prescriber_number` |
| HPI-Facility (Tere) | Environment constant (single facility, single HPI-O) |
| Drug (DIN + name) | `prescriptions.drug` — mapped to DIN via NZULM / Pharmac lookup at assembly time |
| Dose, directions | `prescriptions.dose`, `.directions` |
| Quantity, repeats | `prescriptions.quantity`, `.repeats` |
| Prescribed date | `prescriptions.created_at` |
| Dispensing pharmacy | `prescriptions.pharmacy` (community register lookup; may be omitted if the patient has not pre-selected) |

### 4.5 Retry, failure, and reconciliation

Every prescription submitted to NZePS will be recorded in a `prescription_deliveries` table with columns: `prescription_id`, `channel` (`nzeps` / `fax` / `pdf_link`), `attempt_at`, `outcome` (`accepted` / `rejected` / `error`), and `nzeps_message_id`.

- If NZePS returns a **rejection** (schema/validation error), the prescriber's dashboard receives an in-app alert and the fax adapter is invoked as a fallback within 60 seconds. Rejected messages are retained for postmortem.
- If NZePS returns an **error** (transient network / gateway), the message is retried with exponential backoff up to three times; on final failure, the fax adapter is invoked as a fallback and an on-call notification is generated.
- **Idempotency:** the NZePS message ID field is populated with a Tere-side UUID (`prescriptions.id`) so a retry of the same prescription cannot cause a duplicate dispense downstream.

### 4.6 Inbound dispensing notifications

If NZePS delivers a dispensing-confirmation callback (webhook or polled), Tere will consume it and stamp the `prescriptions` row with `dispensed_at` and `dispensed_by_pharmacy_id`. This closes the loop for the prescriber and enables medication-reconciliation views on future consultations.

## 5. Security and compliance posture

Tere Health Limited already operates under the following controls, which extend to the NZePS integration:

- **HIPC 2020 compliant** across all patient data (see Tere's Privacy Impact Assessment, filed separately with the Ministry on request).
- **HDC Code of Rights** acknowledged in patient consent and clinician training.
- **Māori data sovereignty** — Tere has a working draft position on Te Tiriti and data sovereignty; e-prescription metadata will be handled under the same principles.
- **AWS Bedrock BAA (Sydney region)** for all clinical AI; no NZePS data is processed by any third-party AI service.
- **Supabase (Sydney region)** as the operational data store with row-level security + service-role gating under a fully server-mediated writes model.
- **Audit log** — every PHI access (including administrator views of prescription records) writes an entry with actor, action, reason-for-access, timestamp, and IP address.
- **Certificate lifecycle** — organisation cert stored in Vercel environment secrets (encrypted at rest); rotation notified 60 days before expiry; private key never exposed to any client bundle.
- **Incident response** — Privacy Commissioner notification within 72 hours of any suspected breach affecting patient data; internal runbook maintained.
- **HISO 10029.7 / 10029.8 conformance** — Tere will implement the sender-side profile the Ministry issues and undertake conformance testing before go-live.

## 6. Rollout plan

We propose the following phased rollout, subject to Ministry approval at each gate:

| Phase | Duration | Scope | Success criteria |
|---|---|---|---|
| **0. Application review** | Weeks 0–4 | Ministry vets application, issues sandbox credentials + specifications | Sandbox credentials received |
| **1. Sandbox build** | Weeks 4–8 | Implement message assembly, mTLS, retry logic against sandbox. No live prescriptions. | 100 test prescriptions round-trip cleanly against the sandbox |
| **2. Conformance testing** | Weeks 8–10 | Ministry-run conformance suite against Tere's sandbox instance | Ministry sign-off on conformance |
| **3. Pilot with friendly pharmacies** | Weeks 10–14 | 2–3 pilot community pharmacies in the Marlborough / Nelson region. NZePS + fax dual-send until confidence is established. | 100 real prescriptions dispensed via NZePS with zero clinical incidents; fax fallback rate below 5% |
| **4. Production rollout** | Weeks 14+ | NZePS as primary channel for any patient whose dispensing pharmacy accepts NZePS; fax retained as fallback for non-participating pharmacies | Full production with monitored dashboards |

Timeline is indicative and dependent on Ministry response cadence at each gate.

## 7. Questions for the Ministry

To move quickly once the application is accepted, we would appreciate clarity on the following. We would welcome a technical call to work through them:

1. **Message profile.** Which profile is current — HISO 10029.4 HL7 v2.4, or a newer FHIR-based profile? Should Tere expect to implement one or both?
2. **Transport.** Is the NZePS transport a stateless request/response HTTPS API, or a store-and-forward pattern requiring an always-on agent? This determines whether we host in Vercel serverless or a persistent relay.
3. **Sandbox access.** What is the current expected turnaround for sandbox credentials once an application is accepted?
4. **Broker vs direct.** Given Tere's scale (2–5 prescribers, sub-100 prescriptions per day at steady state), does the Ministry recommend integration via a broker (HealthLink) or direct?
5. **PKI.** Is a separate PKI required for NZePS, or does our existing HealthLink HealthSecure organisation certificate satisfy NZePS mTLS?
6. **Prescriber certificates.** Which CA(s) does the Ministry currently recommend for individual prescriber digital certificates?
7. **Dispensing confirmations.** What is the current model for dispensing-confirmation callbacks — webhook, polled, or none?
8. **Conformance suite.** Are there test suites Tere can run locally before Ministry-run conformance testing?

## 8. Contact

**Technical lead:** Dr Patrick Herling · Director, Tere Health Limited
**Email:** terehealthnz@gmail.com
**Postal:** _______________________________, Marlborough Sounds, New Zealand
**Preferred channel for technical queries:** email

We would welcome an initial technical call with the NZePS onboarding team to align on the questions in §7 before formal sandbox provisioning.

---

*This document is version 1 and will be updated as the integration matures. Filed with Tere Health Limited's NZePS sending-party application.*
