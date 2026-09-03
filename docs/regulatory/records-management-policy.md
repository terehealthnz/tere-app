# Records Management + Retention Policy

**Version:** v1.0 · **Date:** 3 September 2026 · **Owner:** Patrick Herling
**Legal basis:** Health Information Privacy Code 2020 (Rules 4 + 9), Privacy Act 2020 IPP9, ACC Act 2001, IRD business record requirements, Coroners Act 2006, HIPC 2020, HISO 10029:2022.

Companion to the technical enforcement layer (`api/_cron-retention-purge.js` + `retention_purge_runs` table). This document describes the WHY and the manual-review pathway for high-value clinical data.

---

## 1. Scope

Applies to all records held by Tere Health Limited: clinical, administrative, financial, HR, security, and audit.

## 2. Classification + retention periods

| Record class | Examples | Minimum retention | Enforcement |
|---|---|---|---|
| **Clinical records** | consultations, prescriptions, radiology_reports, patient_documents, HL7 messages | 10 years from last activity | Manual admin review after 10y |
| **Deceased patient records** | Same as above, but for deceased patients | 20 years from date of death | Excluded from purge cron via deceased_at flag |
| **Consent records** | acc_consent, research_consent, disclosure_events, portal correction requests | 10 years | Append-only; not purged |
| **Audit trail** | audit_logs, security_events, retention_purge_runs, provider_login_attempts | Indefinite (append-only) | Never purged |
| **ACC billing** | acc_claims, invoices, payment records | 10 years from last activity | Manual admin review |
| **Payment records** | Stripe/Wise transactions, insurance receipts | 7 years (IRD business rec) | Auto-delete via cron |
| **Provider records** | providers, provider_login_attempts | While active + 7 years post departure | Manual admin review |
| **Onboarding records** | job_applications, job_offers, references, onboarding_intake | Rejected/withdrawn: 6 months post-decision. Hired: with employee file (7y post departure) | Auto-delete rejected; manual for hired |
| **Job listings + templates** | job_listings, offer_templates | Indefinite (business ref) | Never purged |
| **Security events** | Failed logins, rate-limit breaches, anomaly signals | 24 months | Auto-delete via cron |
| **Support tickets** | patient_support_tickets, provider_notifications | Closed: 3 years post-resolution | Auto-delete via cron |
| **Company records** | Companies Office, NZBN, incorporation docs | Life of company + 7 years | Not in Tere system; company secretary keeps |
| **Contracts + agreements** | Employment contracts, vendor DPAs, ACC vendor agreement | Life of relationship + 7 years | External storage |

## 3. Deletion vs anonymisation

- **Auto-delete** applies to categories with clear retention limits and low re-identification value (security events, rejected job apps, closed support tickets).
- **Manual review** applies to clinical data past 10y. Rachel + Patrick decide per-patient: retain (clinical necessity), anonymise (research/QI value only), or purge.
- **Append-only** applies to audit trails. Never deleted, never edited.

## 4. Storage locations

| Data | Primary | Backup | Region |
|---|---|---|---|
| Postgres (all app data) | Supabase | Supabase PITR (7d) | AWS us-east-1 (moving to NZ pending) |
| File storage | Supabase Storage | Same-region redundant | AWS us-east-1 |
| Email delivery logs | AWS SES | AWS retention | Sydney (ap-southeast-2) |
| SMS delivery logs | AWS SNS | AWS retention | Sydney |
| AI processing logs | AWS Bedrock (BAA) | No persistence beyond request | Sydney |
| Video calls | LiveKit | No server-side audio persistence | Sydney |
| Company legal + payroll | External accountant | External accountant | NZ |

## 5. Access controls on records

- All access is role-gated + audit-logged (see access-control-policy — implicit in `PhiRevealGate` + `guardProvider`).
- Records past retention that haven't been purged (awaiting manual review) are visible only via elevated access.
- Historical audit logs remain accessible via `/api/audit` indefinitely.

## 6. Cross-references

- Enforcement cron: `api/_cron-retention-purge.js`
- Audit trail of purges: `retention_purge_runs` table
- Breach handling if records are lost: `privacy-breach-runbook.md`
- Legal hold: any record subject to litigation hold, HDC complaint, coronial inquiry, or MCNZ investigation is EXCLUDED from purge until the matter closes. Rachel + Patrick maintain the hold list.

## 7. Data subject rights

Patients can request:
- **Access** — via patient portal FHIR export OR admin-mediated
- **Correction** — via `/api/patient-correction-request`
- **Deletion** — request via support; adjudicated by Rachel + Patrick per HIPC Rule 9 (deletion granted only where retention no longer required by law or clinical necessity)

## 8. Review cycle

- Policy reviewed annually.
- Retention periods reviewed at each ISO 27001 audit + when any relevant statute changes.
- Manual clinical-data review cadence: quarterly (aligned with quarterly access review).

## Change log

- 2026-09-03 — v1.0 initial policy. Aligns to existing `_cron-retention-purge.js` enforcement.
