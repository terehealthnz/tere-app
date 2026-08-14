# Tere Health — Quality Management System

**Document version:** 1.0
**Date:** 2026-08-14
**Owner:** Dr Patrick Herling (Chief Medical Officer, Management Representative)
**Review cadence:** Every twelve months, or immediately following any material change to the product, scope of practice, or regulatory posture
**Standard alignment:** ISO 13485:2016 (Medical devices — Quality management systems — Requirements for regulatory purposes)
**Companion documents:** [`risk-management-file.md`](./risk-management-file.md) (ISO 14971), [`software-lifecycle-file.md`](./software-lifecycle-file.md) (IEC 62304), [`security-compliance.md`](./security-compliance.md), [`incident-response-plan.md`](./incident-response-plan.md), [`disaster-recovery-plan.md`](./disaster-recovery-plan.md), [`privacy-impact-assessment.md`](./privacy-impact-assessment.md), [`audit-log-retention-policy.md`](./audit-log-retention-policy.md), [`rollback-runbook.md`](./rollback-runbook.md), [`hosting-and-data-residency-statement.md`](./hosting-and-data-residency-statement.md)

---

## 1. Scope and purpose

This Quality Manual documents Tere Health Limited's Quality Management System (QMS), aligned to ISO 13485:2016, for the design, development, deployment, monitoring, and post-market surveillance of **Tere Vitals** — a Software as a Medical Device (SaMD) notified to Medsafe under WAND `260729-WAND-786DQ9` (MedSafe internal device id 137905, GMDN 57960, Class IIa).

Tere Health does not currently hold ISO 13485 certification from an accredited certification body. This Quality Manual and the companion documents referenced above document Tere Health's **conformance to the requirements of ISO 13485:2016**. Formal certification will be pursued when triggered by (a) a hospital or PHO procurement contract that requires it, (b) EU MDR market entry, or (c) a Series A investor requirement. Until then, this documented conformance is the evidence pack we present to MedSafe on audit and to insurers, PHOs and clinical partners on request.

## 2. Normative references

- ISO 13485:2016 — Medical devices — Quality management systems
- ISO 14971:2019 — Medical devices — Application of risk management to medical devices
- IEC 62304:2006/A1:2015 — Medical device software — Software life-cycle processes
- IEC 62366-1:2015 — Medical devices — Application of usability engineering
- Medicines Act 1981 (NZ) and Medicines (Database of Medical Devices) Regulations 2003
- Health Information Privacy Code 2020 (NZ)
- Privacy Act 2020 (NZ)
- Code of Health and Disability Services Consumers' Rights 1996 (NZ)
- Medical Council of New Zealand — Statement on Telehealth (August 2023)
- Health Practitioners Competence Assurance Act 2003 (NZ)

## 3. Quality Management System

### 3.1 Quality Policy

Tere Health is committed to providing safe, effective, and equitable telehealth care to New Zealanders — particularly those in rural and underserved communities. Our medical device (Tere Vitals) is developed and maintained under a documented QMS aligned with ISO 13485 requirements. We commit to:

- Complying with applicable regulatory requirements (NZ Medicines Act, HIPC 2020, HDC Code of Rights).
- Meeting or exceeding the essential principles of safety and performance for medical devices.
- Continuously improving the effectiveness of our QMS.
- Basing all clinical claims on documented evidence.
- Transparent post-market surveillance and immediate action on any adverse event.

### 3.2 Documented QMS structure

| Layer | Document | Purpose |
|---|---|---|
| Quality Manual | This document | High-level QMS scope, structure, and cross-references |
| Risk Management | [`risk-management-file.md`](./risk-management-file.md) | ISO 14971 hazard analysis, risk controls, residual risk |
| Software Lifecycle | [`software-lifecycle-file.md`](./software-lifecycle-file.md) | IEC 62304 SDLC processes, artefacts, safety class |
| Security & Privacy | [`security-compliance.md`](./security-compliance.md), [`privacy-impact-assessment.md`](./privacy-impact-assessment.md) | Technical controls, HIPC/Privacy Act compliance |
| Incident Response | [`incident-response-plan.md`](./incident-response-plan.md) | P0–P3 IR playbook, OPC/HDC notification |
| Business Continuity | [`disaster-recovery-plan.md`](./disaster-recovery-plan.md), [`business-continuity-plan.md`](./business-continuity-plan.md) | RTO/RPO, sub-processor failover |
| Change control | [`rollback-runbook.md`](./rollback-runbook.md) | Deploy/rollback discipline, feature flags |
| Records | `audit_logs` table, git history, Supabase point-in-time backups (7 days), Vercel deploy history | Traceability of every clinical action, code change, and access event |

### 3.3 Document control

- All controlled documents are stored in the Tere Health monorepo under `docs/` and version-controlled via Git.
- The current version of each document is the file at `HEAD` of the `main` branch.
- Historical versions are recoverable via `git log` on that file.
- Every controlled document has a **Document version**, **Date**, **Owner**, and **Review cadence** in its front-matter.
- Material changes to any controlled document require a new commit with a descriptive message, a version bump, and (for changes affecting clinical or safety scope) a change note in the git commit describing the driver for the change.

### 3.4 Records control

Records of quality activities are captured in the following stores:

| Record type | Location | Retention |
|---|---|---|
| Deploy history | Vercel dashboard + git tags | Indefinite |
| Code change history | GitHub `terehealthnz/tere-app` | Indefinite |
| Clinical audit trail | Supabase `audit_logs` table | 10 years — see [`audit-log-retention-policy.md`](./audit-log-retention-policy.md) |
| Incident register | Supabase `incidents` table | 10 years |
| Consent records | Supabase `consents` table | 10 years |
| Clinical records (consultations, prescriptions, referrals) | Supabase `consultations`, `prescriptions`, `radiology_referrals` tables | Per HDC Code of Rights: 10 years from last consultation, minimum |
| Provider registration + supervision records | Supabase `providers`, `supervision_reviews` tables | 7 years post separation |
| Regulatory correspondence | `docs/regulatory/` folder in the repo | Indefinite |
| Sub-processor certifications and BAAs | External URLs cited below; local copies in `docs/regulatory/` when downloadable | Indefinite |

## 4. Management responsibility

### 4.1 Management commitment

Tere Health's leadership (see Roles matrix at Appendix A) is committed to the ongoing operation, improvement, and resourcing of the QMS. Management review of the QMS is conducted at least annually, and immediately upon any material regulatory or product change.

### 4.2 Customer focus

Tere Health's customer set includes (a) patients receiving telehealth care, (b) registered clinicians using our platform to deliver that care, (c) regulators (MedSafe, Health New Zealand | Te Whatu Ora, MCNZ, HDC, OPC), and (d) commercial partners (ACC, insurers, PHOs). The QMS is designed to serve safety-of-care, regulatory compliance, and clinician workflow safety as first-order concerns.

### 4.3 Quality objectives

- **Zero P0 clinical safety incidents** attributable to the device per calendar year.
- **≥ 99.5% uptime** on the patient-facing consultation flow (measured monthly against Vercel + Supabase logs).
- **Zero notifiable privacy breaches** per calendar year.
- **100% of clinical outputs (prescriptions, referrals, insurance receipts, GP letters)** carry the patient's NHI where the NHI is known to the system.
- **100% of admin PHI access events** logged to `audit_logs` with actor identity, resource reference, and timestamp.
- **Compliance test pack for every HNZ FHIR integration** passing before production credentials are requested.

### 4.4 Responsibility and authority

| Role | Person | Responsibilities |
|---|---|---|
| Management Representative (ISO 13485 §5.5.2) | Dr Patrick Herling | QMS ownership, regulatory correspondence, management review chair, sign-off on all clinical scope changes and WAND amendments |
| Medical Director | Dr Rachel Thomas (FACEM) | Clinical governance, supervision of provisionally-registered doctors, clinical review of new-feature intended-purpose statements |
| Practice Manager / Chief Business Officer | Justin Thomas | Commercial contracts, sub-processor procurement decisions, insurance renewals |
| Software development | Contracted (external) with Patrick reviewing every commit | Implementation of design changes, per SDLC processes documented in [`software-lifecycle-file.md`](./software-lifecycle-file.md) |
| Clinical operations | On-call rota (currently Patrick and Rachel; expanding as new clinicians onboard) | Delivery of care, response to clinical incidents, patient support |

### 4.5 Management review

At least annually, Patrick (Management Representative) reviews:

- Progress against the quality objectives (§4.3)
- Any incidents raised in the `incidents` table
- All amendments to the risk management file
- All amendments to the software lifecycle file
- All post-market surveillance signals (patient complaints, clinician feedback, aggregate device performance)
- Sub-processor register (any adds, drops, or certification changes)
- Regulatory horizon (new MedSafe requirements, MCNZ standards, ACC contract terms, HDC signals)

The output of management review is a dated note in the git history — a commit to this document or to a companion — documenting decisions, actions, and owners.

## 5. Resource management

### 5.1 Human resources

All clinicians engaged by Tere Health must:

- Hold current MCNZ registration and a current Annual Practising Certificate (verified via MCNZ's public register + HPI FHIR lookup — see `api/_hpi.js`).
- Have appropriate scope of practice for telehealth (assessed against MCNZ Statement on Telehealth, August 2023).
- Complete Tere Health's clinician onboarding checklist (MFA enrolment, review of the IFU, HDC/HIPC training acknowledgement, supervision agreement if RMO — see [`supervision-plan.md`](./supervision-plan.md)).
- Have their credentials re-verified at least annually.

Non-clinical contractors (software developers, ops) do not receive PHI access by default; where access is required (e.g., debugging with production data), it happens under a documented Data Access Agreement + reason logged to `audit_logs`.

### 5.2 Infrastructure

Tere Vitals is delivered as a browser-based SaMD via `terehealth.co.nz`. The production stack, all under contract with vendors that hold current ISO 27001 and/or SOC 2 attestations, is documented in [`hosting-and-data-residency-statement.md`](./hosting-and-data-residency-statement.md). See also §6.4 Purchasing for sub-processor management.

| Layer | Vendor | Certification inherited |
|---|---|---|
| Application hosting | Vercel (Sydney ap-southeast-2) | SOC 2 Type II |
| Database + storage + auth | Supabase (Singapore, planned migration to Sydney) | SOC 2 Type II |
| AI inference (clinical AI notes, triage) | AWS Bedrock (Sydney ap-southeast-2, under signed BAA) | ISO 13485, ISO 27001, HIPAA-BAA |
| Live video/audio | LiveKit Cloud (Sydney) | SOC 2 |
| SMS + voice bridge | AWS SNS (SMS) + Twilio/Telnyx (voice + fax) | SOC 2 |
| Email delivery | Resend | SOC 2 |
| Card payments | Stripe | PCI DSS Level 1 |

### 5.3 Work environment

Tere Health operates as a fully remote organisation. Contributors work on personal devices under a documented Acceptable Use Policy (device screen-lock, disk encryption, no shared accounts, MFA on all administrative surfaces). No physical clinical facility; care is delivered via the platform.

## 6. Product realisation

### 6.1 Planning of product realisation

Each material product change is planned via a written specification (`docs/` or git commit description), reviewed against the current intended purpose (see [`risk-management-file.md`](./risk-management-file.md) §4), and evaluated for any change to the risk profile before implementation. Any change that would broaden the intended purpose (e.g., adding a physiological parameter, opening to paediatric use, marketing as diagnostic, marketing as continuous monitoring) triggers a WAND amendment **before** the change is deployed to production.

### 6.2 Customer-related processes

Tere Vitals' intended purpose is fixed by the WAND notification (WAND `260729-WAND-786DQ9`). We do not accept commercial requests that would place the device outside the notified scope until the WAND is amended.

Patient consent is obtained at every consultation via a documented consent flow (see [`privacy-impact-assessment.md`](./privacy-impact-assessment.md)) covering HDC Code of Rights, HIPC 2020, AWS Bedrock + BAA disclosure, and (where applicable) research use for VitalsValidate.

### 6.3 Design and development

Design and development processes are documented in [`software-lifecycle-file.md`](./software-lifecycle-file.md), aligned to IEC 62304 for a Class B software safety class.

### 6.4 Purchasing (sub-processor management)

Every sub-processor that handles PHI or is on the clinical delivery path is:

- Evaluated for appropriate certifications before onboarding (ISO 27001, SOC 2 Type II, HIPAA BAA, or equivalent).
- Documented in the Sub-processor Register (Appendix B).
- Covered by a written contract (or the vendor's standard DPA + BAA where applicable).
- Re-assessed annually as part of management review — is the certification still current, has scope changed, are there new options.

**Certifications inherited under §5.2 discharge the equivalent internal QMS requirement** for the layer they cover. Example: AWS's ISO 13485 + ISO 27001 certifications cover physical security, availability engineering, and (for Bedrock) medical-device-grade AI infrastructure. We do not duplicate their controls; we cite them.

### 6.5 Production and service provision

Production deployments are managed through Vercel with feature-flag gating (`flags` Supabase table + `/api/flags` endpoint) so any new capability can be dark-launched, ramped by cohort, and killed instantly if a defect is detected. Deployment records, rollback procedure, and RTO/RPO commitments are in [`rollback-runbook.md`](./rollback-runbook.md) and [`disaster-recovery-plan.md`](./disaster-recovery-plan.md).

### 6.6 Control of monitoring and measuring equipment

Tere Vitals uses the video signal from a consumer smartphone or laptop camera as its measurement source. Calibration is:

- **rPPG model** — trained against a reference multi-parameter monitor dataset; performance validated in the VitalsValidate observational study (see [`neac-2019-compliance-vitals-validate.md`](./neac-2019-compliance-vitals-validate.md)).
- **SpO2 calibration** — per-device calibration file stored in Supabase `spo2_calibrations` table; loaded on session start. See [`software-lifecycle-file.md`](./software-lifecycle-file.md) §7 for the verification records.
- **Ongoing accuracy tracking** — every clinical use where the clinician records a reference reading (e.g., patient's own pulse oximeter, in-clinic BP cuff for reference) is retained in `validation_readings` for post-market accuracy analysis.

## 7. Measurement, analysis and improvement

### 7.1 Customer feedback

- Patient support: `/api/patient-support` + admin UI. Every ticket triaged and logged.
- Clinician feedback: internal Tere Chat + direct-to-Patrick channel; product change requests captured in git issues.
- Regulator feedback: any correspondence from MedSafe, MCNZ, HDC or OPC is logged in `docs/regulatory/` and reviewed at management review.

### 7.2 Internal audit

Internal audit against this QMS is performed at least annually by Patrick, with any material findings recorded in a dated commit to this document. External audit is not currently commissioned; will be scheduled if a formal ISO 13485 certification is pursued.

### 7.3 Monitoring of processes

- Uptime and error rate monitored via Vercel + Supabase logs.
- 5-minute availability canary planned (see task #239).
- Failed-authentication alarm active (10+ failures/hour triggers an email to the Management Representative).
- Audit-log completeness reviewed monthly.

### 7.4 Monitoring of product

- Every clinical use of the device generates a `consultations` record with the vitals output, and (where the clinician records a reference) a `validation_readings` row for accuracy tracking.
- Aggregate accuracy stats are computed at least quarterly; material drift from the validation baseline triggers a P2 incident.

### 7.5 Control of nonconforming product

- Any incident indicating the device is producing incorrect or misleading output triggers the P0/P1 process in [`incident-response-plan.md`](./incident-response-plan.md).
- The offending capability can be feature-flagged off in seconds (see [`rollback-runbook.md`](./rollback-runbook.md)).
- All nonconformances and their resolutions are logged in the `incidents` table.

### 7.6 Analysis of data

Quarterly review of: incident counts, patient complaints, clinician-flagged notes, aggregate device accuracy, uptime SLA, audit-log coverage. Documented as a commit to this file each quarter.

### 7.7 Improvement (CAPA)

Corrective and Preventive Action process:

1. **Trigger** — incident, complaint, audit finding, accuracy drift.
2. **Investigation** — root-cause analysis captured in the `incidents` table + a git commit reference.
3. **Corrective action** — code / process / doc change; deployed under normal SDLC (see software lifecycle file).
4. **Preventive action** — where root cause reveals a class of issue, add a guard/test/policy to prevent recurrence.
5. **Verification** — confirmed effectiveness within one release cycle; noted on the same `incidents` row.

## 8. Post-market surveillance

Documented in [`incident-response-plan.md`](./incident-response-plan.md) §6. Signals: patient complaints, clinician-flagged reviews, validation-reading drift, sub-processor incident notifications, security researcher disclosures. Serious adverse events reportable to MedSafe under the Medicines Act 1981 will be notified within the statutory timeframe.

## 9. Change control

- All software changes flow through git commits, with commit messages describing the driver for the change.
- Changes that affect the risk profile update the risk management file.
- Changes that broaden the intended purpose require WAND amendment before deployment.
- Changes that affect PHI processing update the PIA.
- Post-hoc reviews are prohibited: nothing ships to production without a documented commit describing the reason.

## Appendix A — Roles matrix

| Function | Primary | Deputy |
|---|---|---|
| Management Representative (QMS owner) | Patrick Herling | Justin Thomas |
| Regulatory correspondence | Patrick | Justin |
| Clinical Director | Rachel Thomas | Patrick |
| Incident Commander (P0/P1) | Patrick | Rachel |
| Privacy Officer (HIPC 2020) | Patrick | Justin |
| Chief Business Officer | Justin | Patrick |
| Software release approval | Patrick | Justin (non-clinical changes only) |

## Appendix B — Sub-processor register

Cross-references §5.2 with certifications and contract status.

| Sub-processor | Function | Data category handled | Certification | Contract |
|---|---|---|---|---|
| Vercel | App hosting | PHI transiting via API endpoints | SOC 2 Type II | Standard DPA |
| Supabase | Database, storage, auth | PHI at rest | SOC 2 Type II | Standard DPA |
| AWS Bedrock (Sydney) | AI inference | PHI in transit for AI note generation | ISO 13485, ISO 27001, HIPAA BAA | Signed BAA (2026-07-08) |
| LiveKit Cloud | Video/audio consult transport | Ephemeral audio/video (not stored) | SOC 2 | Standard DPA |
| AWS SNS | Outbound SMS | Patient phone number, minimal message body | SOC 2, HIPAA BAA | Under Tere's existing AWS BAA |
| Telnyx | Voice bridge + fax | Patient phone number, prescription/referral PDFs | SOC 2 | Standard DPA |
| Resend | Transactional email | Patient email + PDF attachments | SOC 2 | Standard DPA |
| Stripe | Card payments | Cardholder data (PCI-DSS Level 1) | PCI-DSS L1 | Standard DPA |
| Medical-Objects Capricorn | Inbound HL7 from GPs / labs | HL7 v2 message payloads | HISO-aligned | Onboarding in progress (see task #249) |
| Te Whatu Ora HPI FHIR | Practitioner + Location lookup | Clinician demographics (not patient PHI) | HNZ certified | UAT credentialed 2026-08-13; compliance submitted (IN-3502) |

## Appendix C — Change history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-08-14 | Patrick Herling | Initial issue — ISO 13485-aligned QMS documenting Tere Health's conformance framework for Tere Vitals (WAND `260729-WAND-786DQ9`). |
