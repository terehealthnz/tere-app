# Tere Health — Business Continuity Plan

**Document version:** 1.0
**Date:** 2026-08-02
**Owner:** Dr Patrick Herling (Chief Medical Officer, Founder)
**Deputy:** Justin Thomas (Chief Business Officer)
**Review cadence:** Every six months, or after any material incident
**Companion documents:** [`disaster-recovery-plan.md`](./disaster-recovery-plan.md), [`incident-response-plan.md`](./incident-response-plan.md), [`privacy-impact-assessment.md`](./privacy-impact-assessment.md)

---

## Purpose

This Business Continuity Plan (BCP) defines how Tere Health Limited continues to deliver essential clinical services and meet regulatory obligations when normal operations are disrupted. It complements — but does not duplicate — the [Disaster Recovery Plan](./disaster-recovery-plan.md), which covers technical infrastructure outages, and the [Incident Response Plan](./incident-response-plan.md), which covers security and privacy incidents.

The BCP addresses **operational continuity** — the people, processes, and vendors that keep the service running — rather than the systems themselves.

---

## 1. Scope

This plan covers disruption to:

- Clinical service delivery (provider availability, credentialing, supervision)
- Business operations (finance, billing, vendor management)
- Regulatory compliance obligations (MCNZ, HDC, ACC, Privacy Commissioner)
- Key personnel availability (Patrick, Justin, contracted clinicians)
- Patient communication during disruption
- Third-party service provider failure that is not a pure technical outage (e.g. a vendor goes out of business, terminates the account, or refuses to serve NZ)

It does not cover:
- Technical infrastructure outages → see [DR Plan](./disaster-recovery-plan.md)
- Security incidents / data breaches → see [Incident Response Plan](./incident-response-plan.md)
- Clinical adverse events → handled via HDC notification and clinical incident review process

---

## 2. Business Impact Analysis

| Business function | Maximum tolerable outage | Priority |
|---|---|---|
| Patient triage + consultation | 4 hours during operating hours | **Critical** |
| E-prescribing to pharmacies | 12 hours (patient can walk in to pharmacy without script) | High |
| Payment processing | 24 hours (can accept invoicing / defer) | High |
| ACC claim lodgement | 72 hours (still within ACC's 7-day window) | Medium |
| Patient email/SMS communication | 24 hours (secondary channel: patient support form) | Medium |
| Provider onboarding / careers | 2 weeks | Low |
| Internal validation dashboard / R&D | 1 month | Low |

---

## 3. Threat Register

| # | Threat | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| T1 | Sole provider on shift becomes unavailable mid-consult | Medium | High | Multi-provider roster; patient re-queued; call transferred to Rachel or on-call locum. See §5.1 |
| T2 | All available providers unable to work same day | Low | Critical | Waitlist mode; automated "we're temporarily unavailable, call 111 for emergencies" message; ACC referral pathways activated. See §5.1 |
| T3 | Patrick (Chief Medical Officer) unavailable >72h | Medium | High | Rachel Herling holds full clinical authority as Medical Director. Justin handles business decisions. Bank / vendor authentication credentials in encrypted 1Password shared vault (both have access). See §5.2 |
| T4 | Justin (Chief Business Officer) unavailable >72h | Medium | Medium | Patrick has read/write access to Xero, banking, insurance, all vendor accounts. Payroll paused if needed (no employees mid-2026). See §5.2 |
| T5 | Payment processor (Windcave) terminates account | Low | Critical | 30-day fallback: revert to Stripe (existing account, code path dormant but functional). See §5.3 |
| T6 | Supabase terminates / migrates account | Low | Critical | Nightly pg_dump exports to S3 (see DR §5). Migration path to self-hosted Postgres on AWS RDS documented separately. Estimated recovery time 3-5 business days. |
| T7 | AWS terminates BAA / suspends Bedrock access | Very Low | Medium | Non-critical: AI note generation is nice-to-have, not blocking. Fallback: provider writes notes manually. Feature flag `ai_notes_enabled` allows immediate disable. |
| T8 | Sole prescribing supervisor (Rachel) becomes unavailable | Low | Critical for provisional clinicians | Provisional-registration clinicians cannot prescribe without supervision (MCNZ requirement). Fallback: Patrick as backup supervisor for eligible clinicians only. Non-provisional clinicians (Rachel herself, or any vocationally registered locum) unaffected. See §5.4 |
| T9 | MCNZ suspends or restricts Patrick's practising certificate | Very Low | Critical | Clinical operations transfer entirely to Rachel + any locums. All prescribing continues under Rachel's supervision. Patrick retains non-clinical CMO role until resolved. Legal counsel engaged immediately. |
| T10 | Loss of insurance cover mid-year (declined at renewal) | Low | Critical | Do not accept new consults until replacement cover secured (typically <5 business days via broker). Existing complaints continue to be defended under the run-off provisions of the outgoing policy. |
| T11 | Sustained cash flow shortfall | Medium | Critical | 3-month operating reserve maintained in Tere business account. If reserve <60 days: pause discretionary spending (marketing, R&D, non-essential vendor renewals). If reserve <30 days: emergency board decision on capital raise, cost reduction, or graceful wind-down. |
| T12 | HDC investigation / MCNZ complaint | Medium | Medium | Standard clinical process. Response coordinated by Rachel (Medical Director). MPS / Delta legal cover engaged. Full record disclosure preserved in Supabase. |
| T13 | Registered office (41 Adams Lane) unavailable | Very Low | Low | Fully virtual operation — office is registered address only, no client-facing activity. Statutory correspondence redirects to alternate address via NZ Post redirection; Companies Office update within 20 working days. |
| T14 | Health NZ, ACC, or PHARMAC changes rules mid-year (e.g., signature exemption withdrawn) | Medium | Medium | Monitor Medsafe / MCNZ / ACC bulletins. Standing subscription to Health NZ provider updates. See §5.5 |

---

## 4. Recovery Objectives (Operational)

| Objective | Target |
|---|---|
| **Time to activate BCP** after event detection | 30 minutes |
| **Time to communicate service status** to active patients | 60 minutes |
| **Time to arrange substitute clinician** during unplanned provider absence | 4 hours during business hours |
| **Time to restore payment processing** via fallback | 24 hours |
| **Time to full service restoration** (all workflows) | 5 business days for most scenarios; longer for T5, T6, T8, T10 |

---

## 5. Continuity Strategies

### 5.1 Clinical staffing (T1, T2)

- **Roster oversight**: Multiple clinicians rostered per shift where possible. Waitlist toggle (`waitlist_mode` feature flag) can immediately pause new consult intake if no clinician is available.
- **In-consult provider outage**: The consultation flow allows the patient to be automatically returned to the queue (`status='waiting'`). Next available clinician resumes.
- **Full clinician outage**: Automated banner + email/SMS to patients in queue: *"Tere Health is temporarily unavailable. Please call 111 for emergencies, or your regular GP for non-urgent matters."*
- **Backup rostering**: Contracted locum arrangements to be maintained for peak-demand and outage cover (target: 2 locums on retainer by end of Q4 2026).
- **On-call escalation**: Rachel (Medical Director) is the escalation point for clinical decisions when Patrick is unavailable.

### 5.2 Key personnel (T3, T4)

- **Credential redundancy**: Bank, Xero, AWS, Supabase, Vercel, Windcave, Google Workspace, GitHub, Twilio, LiveKit, Cloudflare — all credentials stored in a shared encrypted 1Password vault. Both Patrick and Justin hold owner-level access to every account.
- **Financial signatory**: Both Patrick and Justin are authorised signatories on the Tere Health bank account. Any single payment >$5,000 requires two-factor verification with the recipient plus authoriser (also documented in cyber policy).
- **Delegation of authority**: If Patrick is unavailable ≥72 hours, Rachel holds delegated clinical authority. If Justin is unavailable ≥72 hours, Patrick holds sole business authority.
- **Estate / incapacity planning**: Both principals hold enduring powers of attorney. Written continuity instructions filed with the company solicitor and updated annually.

### 5.3 Payment processing (T5)

- Windcave is the primary payment processor (post-cert as of 2026-08).
- Stripe account remains active (dormant) with all integration code preserved in the repo behind a feature flag. Reactivation window: same-day.
- If both fail: manual invoicing via Xero for a maximum 30-day window; patients receive an emailed invoice with bank transfer instructions.

### 5.4 Supervision continuity (T8)

- Rachel Herling is the sole named supervisor for all provisional-registration clinicians (including Patrick's `provider_type='rmo'` designation).
- If Rachel is unavailable for a period exceeding one clinical shift:
  - Provisional clinicians cannot prescribe. System-level guardrails already enforce this — prescriptions are held in `pending_approval` status until countersigned.
  - Held prescriptions are notified to Rachel via SMS + email. Rescheduled patients notified via automated message.
- Long-term: identify and onboard a second FACEM-qualified supervisor (target: end of Q1 2027). Meanwhile, non-supervised (vocationally registered) locums can be engaged as an interim measure.

### 5.5 Regulatory change management (T14)

- **Monitoring**: Weekly review of Medsafe, MCNZ, and ACC bulletins by Patrick.
- **Fast-response paths**: Prescribing rule changes (e.g., signature exemption expiry 31 Oct 2027) are tracked as code-level feature flags (`isSignatureExempt()` etc.) so a single toggle disables the affected pathway.
- **Government API changes**: HNZ NHI / HPI / NZePS integration wraps live-lookup calls in a fallback that treats a failed lookup as "not verified" rather than blocking clinical action, so upstream API changes don't halt patient care.

### 5.6 Cash flow (T11)

- **Operating reserve target**: 3 months of fixed operating costs held in an interest-bearing NZ business account.
- **Monthly review**: Justin reviews cash burn vs projection on the 15th of each month.
- **Trigger levels**:
  - Reserve 90 days → normal operations.
  - Reserve 60 days → pause discretionary marketing spend, defer non-critical infra upgrades.
  - Reserve 30 days → emergency co-founder meeting; decide on capital raise, service reduction, or wind-down. Notify insurer and (if wind-down likely) begin patient run-off notifications per §6 below.
  - Reserve 14 days → invoke wind-down protocol.

---

## 6. Wind-down protocol

In the event that continued operation is not viable, Tere is obligated to:

1. **Notify all currently-registered patients** at least 7 calendar days in advance via email + SMS.
2. **Complete or transfer all open consultations** — no new bookings accepted from wind-down start date.
3. **Provide each patient with a summary of care** and instructions for accessing their records via a portable export (JSON + PDF).
4. **Retain clinical records for the statutorily required minimum** (10 years for adult records under the Health (Retention of Health Information) Regulations 1996; longer for paediatric).
5. **Notify** MCNZ, HDC, ACC (contract termination), Health NZ (provider deregistration), and the Privacy Commissioner (data custodian transfer).
6. **Insurance run-off cover** to be arranged for the full statutory limitation period.
7. **Files handover** — final compliance snapshot (this BCP, DR plan, IRP, PIA, all audit logs) archived to a legally-held cold-storage destination for retention obligations.

---

## 7. Communication plan

### 7.1 Internal
- **Detection to activation**: Whoever detects an event contacts both Patrick and Justin by SMS + phone. If neither is reachable within 15 minutes, escalate to Rachel.
- **Status updates**: During an active continuity event, status is posted to a shared internal Slack / WhatsApp channel every 30 minutes until resolved.

### 7.2 Patients
- **Active consults**: In-app banner + automated email/SMS.
- **Waiting patients**: Queue message updated to reflect current status.
- **General public**: Homepage banner at `terehealth.co.nz`. If DNS or hosting is affected, use social media (LinkedIn, Facebook page) as fallback channel.

### 7.3 Regulators (as required by scenario)
| Scenario | Notify | Timeframe |
|---|---|---|
| Data breach | Privacy Commissioner + affected individuals | 72 hours (Privacy Act 2020) |
| Adverse event | HDC | As soon as reasonably practicable |
| Prescribing pause | MCNZ (courtesy notification) | Within 5 business days |
| Wind-down | MCNZ, HDC, ACC, HNZ, Privacy Commissioner | ≥14 days notice |

---

## 8. Roles and responsibilities

| Role | Primary | Deputy |
|---|---|---|
| BCP activation | Patrick Herling | Justin Thomas |
| Clinical decisions during event | Patrick / Rachel | Whichever is available |
| Business / financial decisions | Justin | Patrick |
| Patient communication | Justin (operational) | Patrick (clinical language) |
| Regulator liaison | Patrick (clinical) / Justin (business) | Each other |
| Documentation of event | Whoever coordinated the response | — |
| Post-event review | Both principals + Rachel | — |

---

## 9. Testing and review

- **Tabletop exercise**: annually or after any material change. See [`incident-tabletop-exercise.md`](./incident-tabletop-exercise.md).
- **Backup restore drill**: quarterly (already scheduled via DR plan).
- **Contact list refresh**: monthly (auto-populated from providers table where possible).
- **Insurance review**: annually at renewal.
- **This document**: reviewed every six months. Next review: **2027-02-02**.

---

## 10. Contact list

| Name | Role | Mobile | Email |
|---|---|---|---|
| Dr Patrick Herling | CMO / Founder | 021 XXX XXXX | patrickherling@gmail.com |
| Justin Thomas | CBO / Co-founder | 021 XXX XXXX | jtthomas1371@gmail.com |
| Dr Rachel Herling | Medical Director | 021 XXX XXXX | [rachel email] |
| Tere Health general | — | +64 3 568 8145 (fax/inbound) | terehealthnz@gmail.com |

External support (numbers verified 2026-08-02):
- **MPS clinical support** (Rachel, Patrick — as members): 0800 225 5677
- **Delta Insurance claims**: 09 300 3888
- **Windcave devsupport**: devsupport@windcave.com
- **Supabase support**: via dashboard (paid support tier)
- **Vercel support**: via dashboard
- **AWS support**: business tier (24/7 phone)
- **Privacy Commissioner** (breach notification): 0800 803 909
- **HDC**: 0800 11 22 33
- **MCNZ**: 04 384 7635

---

## 11. Version history

| Version | Date | Change | Author |
|---|---|---|---|
| 1.0 | 2026-08-02 | Initial issue | Patrick Herling |
