# Tere Health — NZePS Integration Plan

**Document version:** 0.1 (project scoping — internal planning document)
**Date:** 2026-07-08
**Owner:** Patrick Herling
**Status:** Scoping — targets and dates are indicative and will firm up as Ministry of Health engagement progresses.

> **Purpose:** Replace fax-based prescription transmission with the New Zealand ePrescription Service (NZePS), enabling direct HL7 / FHIR delivery of prescriptions to any NZePS-enabled community pharmacy and unlocking real-time dispensing status. This document is Tere's internal plan for that migration.

---

## 1. Current state

- **Transmission:** Prescription PDFs faxed to community pharmacies via Documo (primary) or Telnyx (secondary) adapter, keyed off a curated register of NZ community pharmacy fax numbers.
- **Pharmacy discovery:** Public NZ pharmacy register (refreshed monthly via scheduled GitHub Action) + a crowdsource `pharmacy_contacts` table for corrections and fax number confirmations discovered during real prescriptions.
- **HPI-CPN lookup:** Already integrated — pharmacies are matched against HPI records for identity confirmation before send.
- **Signing:** Prescriber signature is rendered into the PDF at generation time from an image asset held server-side. This meets NZ prescribing law for fax but is not a NZePS-compliant digital signature.
- **Dispensing status:** No feedback loop — Tere does not currently know when (or if) a faxed prescription has been dispensed.

## 2. Target state

- **Transmission:** Prescriptions sent as structured HL7 CDA (or FHIR — depending on integration path) messages through NZePS to the patient's chosen pharmacy.
- **Signing:** Prescriber holds an individual digital certificate compliant with NZePS requirements; every prescription is digitally signed at generation time.
- **Discovery:** NZePS-enabled pharmacy list obtained from Ministry of Health; matches Tere's existing pharmacy register.
- **Dispensing status:** Return messages from the pharmacy give real-time confirmation of receipt and dispensing events.
- **Fallback:** Fax retained as a compatibility fallback for pharmacies not yet on NZePS, until national coverage is universal.

## 3. Prerequisites and dependencies

### 3.1 Organisational identifiers

| Item | Current status | Action |
|---|---|---|
| **HPI-O** (Health Provider Index — Organisation) | Not applied for | Apply via Ministry of Health. Required to register Tere as an NZePS-enabled prescribing organisation. |
| **HPI-CPN** (Common Person Number) for each prescriber | Verify — some clinicians may already hold these | Confirm each prescribing clinician has an HPI-CPN. Missing ones must apply through MoH. |
| **Vendor / GPN identifier** | Not held | Some integration paths (e.g. HealthLink) require a vendor identifier. Confirm during engagement. |
| **NZBN** | ✓ Confirmed 9429053723413 | No action. |
| **ACC vendor number** | ✓ Confirmed VEND-G11238 | No action; adjacent capability but not required for NZePS. |

### 3.2 Prescriber digital certificates

Every prescribing clinician requires a personal digital certificate. Options:

- **HISO-approved certificate authority** — typically issued via a Ministry-approved provider. Cost is per-clinician, per year. Certificates are individual, not organisational.
- **Renewal cadence** — certificates have a fixed lifetime; renewal must be tracked to avoid dispensing failures.

### 3.3 Integration path — decision required

| Path | How it works | Pros | Cons |
|---|---|---|---|
| **HealthLink broker** (most common in NZ) | Tere integrates with HealthLink's messaging platform; HealthLink handles NZePS wire protocol underneath | Faster onboarding, HealthLink handles cert renewal + MoH liaison, well-trodden path, ETP (Electronic Transfer of Prescriptions) product handles most complexity | Per-message or subscription cost, dependency on HealthLink availability, small integration surface but not zero |
| **Direct MoH integration** | Tere talks directly to the NZePS endpoint | No broker cost, no third-party dependency in the critical path | More engineering work, longer MoH liaison, more responsibility for wire protocol, less common — fewer other vendors to compare notes with |

**Recommended path: HealthLink broker.** Faster to production, lower engineering opportunity cost, and lets Tere focus on clinical UX rather than plumbing. Revisit direct integration only if HealthLink cost becomes prohibitive at Tere's transaction volume, which is unlikely in year one.

### 3.4 Test environment

Ministry of Health provides a NZePS test environment reachable by enrolled organisations before go-live. Access is granted after enrolment is approved. Test env allows:

- Sending synthetic prescriptions without affecting the production register
- Receiving synthetic dispensing acknowledgements
- Validating cert chain end-to-end

## 4. Project phases

### Phase A — Applications and enrolment (weeks 0–4)

1. **HPI-O application** submitted to MoH. Application form + supporting documentation (company registration, contact details, scope of practice).
2. **HealthLink engagement started.** Introductory call, commercial terms discussion, technical integration briefing.
3. **NZePS enrolment application** submitted (may be bundled with HealthLink onboarding depending on their process).
4. **Prescriber certificate procurement** started for each active prescriber. Individual applications; each clinician needs to sign their own.

**Exit criteria for Phase A:** HPI-O issued; HealthLink contract signed; certificates in production for at least the pilot prescriber(s).

### Phase B — Integration build (weeks 4–10)

1. **HL7 CDA / FHIR mapping** — map Tere's internal prescription data model to the NZePS message schema. Includes patient identifiers (NHI required), prescriber identifiers (HPI-CPN), drug data (using NZULM identifiers), directions, and repeat data.
2. **HealthLink client library integration** — install SDK, wire it into `/api/generate-prescription-pdf` (or a new `/api/send-prescription-nzeps` endpoint).
3. **Digital signature workflow** — pull the prescriber's certificate, sign the outbound message, verify the signature on Tere's own end before dispatch.
4. **Dispensing status webhook** — receive NZePS return messages, update `prescriptions` table with dispensing state, surface to provider dashboard.
5. **Pharmacy availability flag** — extend the pharmacy register with an `nzeps_enabled` flag so the prescribe modal can prefer NZePS where available and fall back to fax otherwise.
6. **Feature flag** — `nzeps_enabled` flag in `flags` table so we can roll out per-prescriber or per-pharmacy without a deploy.

### Phase C — Test env validation (weeks 8–12, overlaps Phase B)

1. **End-to-end test** in MoH test env: synthetic prescription → NZePS → synthetic pharmacy → dispensing acknowledgement returned to Tere.
2. **Certificate chain validation** — confirm the cert chain is trusted by NZePS validators.
3. **Failure-mode testing** — malformed messages, expired certs, unreachable pharmacies, timeout handling.
4. **Provider UX testing** — clinician workflow for choosing NZePS vs fax, error handling when NZePS rejects a message.

### Phase D — Pilot production go-live (weeks 12–16)

1. **Pilot scope** — one prescriber, ~10 volunteer pharmacies known to be NZePS-enabled, one clinical week of prescriptions in parallel with fax fallback.
2. **Monitoring** — every NZePS send + acknowledgement logged with correlation IDs to the `prescriptions` table. Any failure automatically falls back to fax and alerts the compliance contact.
3. **Sign-off** — after one clinical week with zero unexplained failures, expand to all prescribers.

### Phase E — Full rollout (weeks 16+)

1. **All prescribers** on NZePS by default; fax as fallback only.
2. **Fax remains** as a permanent fallback for non-NZePS pharmacies. Fax adapter is not removed.
3. **Public compliance doc updated** to reflect NZePS as primary transmission channel.

## 5. Timeline (indicative)

Weeks are from project kickoff, not calendar dates. Real dates depend on MoH and HealthLink response times.

| Week | Milestone |
|---|---|
| 0 | Project kickoff. HPI-O application submitted. HealthLink introductory meeting requested. |
| 4 | HPI-O issued (typical MoH turnaround). HealthLink contract terms agreed. |
| 8 | Integration build complete in staging. Certificates in production for pilot prescriber. |
| 10 | Test env validation begins. |
| 12 | Pilot go-live decision. |
| 13–14 | Pilot week with parallel fax fallback. |
| 16 | Full rollout to all prescribers. |

## 6. Cost estimate (indicative)

| Item | Frequency | Estimate |
|---|---|---|
| HPI-O application | One-off | Nil to nominal |
| Prescriber digital certificate | Per clinician, annual | To confirm — approx NZ$100–300/year/clinician typical |
| HealthLink onboarding | One-off | To confirm — commercial terms not published |
| HealthLink per-message or subscription | Ongoing | To confirm — commercial terms not published |
| Engineering time | One-off | ~4 developer-weeks (Phase B) |
| Ongoing maintenance | Monthly | ~2 hours/month for cert rotation and monitoring |

Full commercial numbers to be firmed up during HealthLink engagement. Reserve tentative budget of NZ$3–8k first-year onboarding + ~NZ$1–3k/year ongoing per prescriber for planning purposes only.

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| MoH HPI-O approval slower than expected | Medium | Medium | Start Phase A first — everything else waits on this. |
| HealthLink integration surface changes during build | Low | Medium | HealthLink SDK is stable; monitor release notes; capture SDK version in package.json. |
| Prescriber certificate procurement bottleneck (individual applications) | Medium | High | Start certs in parallel with HPI-O. Each clinician needs to sign their own application. |
| Fax fallback path breaks during NZePS work | Low | High | Fax adapter remains untouched during NZePS integration. All NZePS work is behind a feature flag; disabling it reverts to fax cleanly. |
| NZePS test env unavailable at expected time | Medium | Low | Continue Phase B build work; test env only gates Phase C. |
| Prescription content differs between NZePS message and PDF backup | Medium | Medium | Generate NZePS message and PDF from same internal data model; do not maintain two prescription representations. |

## 8. Compliance implications

- **Security & Compliance doc (`docs/security-compliance.md`, Section 13)** — already updated to reflect the fax-current / NZePS-planned position (commit 24d2322).
- **Sub-processor addition** — HealthLink becomes a new sub-processor if the broker path is chosen. Add to `docs/security-compliance.md` Section 5 sub-processor table before go-live.
- **Consent flow** — the AI processing disclosure does not need to change. A separate one-line mention of prescription transmission mechanism may be added if legal review recommends.
- **BAA equivalent** — HealthLink operates under NZ health-sector agreements. Confirm the equivalent of a DPA is in place before go-live.
- **PIA update** — the Privacy Impact Assessment should be updated to reflect NZePS as the transmission channel once live.

## 9. Decisions required

Before Phase A starts, decide:

1. **Integration path:** HealthLink broker (recommended) or direct MoH.
2. **Pilot prescriber:** which clinician(s) will run the pilot week.
3. **Budget authority:** who signs off on the HealthLink commercial terms.
4. **Cert vendor:** which HISO-approved certificate authority to use (typically HealthLink identifies a preferred vendor if using their path).

## 10. Immediate next actions

Ordered by dependency:

1. **[This week]** Submit HPI-O application to Ministry of Health.
2. **[This week]** Request introductory call with HealthLink.
3. **[This week]** Enumerate current prescribing clinicians and start their individual HPI-CPN + digital-cert applications in parallel.
4. **[Week 2]** Complete integration path decision after HealthLink discussion.
5. **[Week 2]** Extend `pharmacies` table with `nzeps_enabled` column ready for population once MoH list is available.

## Change history

| Version | Date | Author | Changes |
|---|---|---|---|
| 0.1 | 2026-07-08 | Patrick Herling | Initial scoping document. Timeline, cost, and risk numbers are indicative and will firm up as MoH and HealthLink engagement progresses. |

---

*This is an internal planning document. Public compliance documentation for prescription transmission is at [`docs/security-compliance.md`](./security-compliance.md), Section 13.*
