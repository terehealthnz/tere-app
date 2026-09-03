# HISO 10029:2022 conformance evidence pack — Tere Health Ltd

**Standard:** HISO 10029:2022 — Health Information Security Framework (New Zealand).
**Purpose:** map each HISO 10029 domain to Tere's implementation, so an auditor (HNZ, ACC, HDC, or a customer's compliance team) can see the evidence in one place.
**Scope:** Tere Health's clinical telehealth platform (terehealth.co.nz + terecare.com) as of 2026-09-03.
**Owner:** Patrick Herling (CMO). Reviewed: initial draft — needs Rachel + external assessor sign-off.

HISO 10029 aligns to ISO 27001:2022. We use HISO clause numbering where it differs.

---

## Domain 1 — Information security policy

| Control | Evidence in Tere |
|---|---|
| Documented security policy | This document + `docs/regulatory/privacy-breach-runbook.md` + Section 9 PIA (`docs/regulatory/pia.pdf`) |
| Governance / owner | Patrick Herling (CMO) — accountable. Rachel Thomas (Medical Director) — clinical decisions. |
| Annual review cadence | 12-month cycle from date of this document → review due 2027-09-03 |

## Domain 2 — Organisation of information security

- Two-person governance: Patrick + Rachel. All PHI-touching env vars require Patrick to set; Supabase Owner is Patrick.
- No third-party admin access to production. Contractors are gated at the Vercel/Supabase project level.
- BAA-covered vendors: AWS (Bedrock + SES + SNS + Transcribe, all Sydney ap-southeast-2). No non-BAA processors touch PHI.
- Data processor list: `docs/regulatory/pia.pdf` §4.

## Domain 3 — Human resources security

- Provider onboarding wizard captures IRD, bank (AES-256-GCM at rest), APC PDF, signature, MFA enrolment. See `src/pages/OnboardingSetup.jsx` + `api/_onboarding-crypto.js`.
- Every new provider does a sandbox training checklist before touching real patients (`src/components/clinician/TrainingBanner.jsx`, gated via `providers.training_completed_at`).
- Provider deactivation: `providers.is_active=false` immediately revokes all access (guardProvider check).

## Domain 4 — Asset management

- Data classification: everything in `patients`, `consultations`, `prescriptions`, `patient_documents`, `radiology_reports`, `patient_allergens`, `patient_medications`, `patient_conditions`, `hl7_files`, `audit_logs`, `disclosure_events`, `acc_communications` is classified PHI.
- Bucket classification: `cvs`, `documents`, `patient-docs`, `imaging`, `hl7` — all private + signed URL access (task #322).
- Retention: audit_logs and disclosure_events are append-only (triggers enforce). Patient data retained 10 years post last encounter (health record retention per HIPC 4).

## Domain 5 — Access control

- **Auth Path A** — Supabase JWT (Bearer). See `api/_auth.js` `requireProvider()`.
- **Auth Path B** — x-provider-id session (PIN clinician login). Same guard.
- **Role-based access:** admin, billing_admin, supervisor, provider. Snapshotted into audit_logs at every access.
- **PHI reveal gate:** admins must supply a reason (from ALLOWED_REASONS) before viewing clinical detail. See `src/components/clinician/PhiRevealGate.jsx` + `api/_audit-log.js`.
- **Idle timeout + re-auth on PHI surfaces:** `src/components/clinician/SessionIdleGuard.jsx` (task #291).
- **MFA (TOTP):** provider-side (task #232). Enrolment + verification + disable flows.
- **Failed-auth alerting:** brute-force detection + admin email (task #293).
- **Row-level security:** service_role only for PHI tables; app auth mediates all reads (post-migration cleanup tasks #63–90).

## Domain 6 — Cryptography

- **In transit:** TLS 1.2+ enforced by Vercel + Cloudflare. HSTS via `vercel.json` security headers (task #261).
- **mTLS receive:** HL7 inbound via Cloudflare Worker with mTLS pinning (Medical-Objects Capricorn Cloud).
- **At rest — provider secrets:** IRD number, bank details AES-256-GCM using ONBOARDING_ENCRYPTION_KEY (Node crypto). `api/_onboarding-crypto.js`.
- **At rest — Supabase:** AES-256 (default, provider-managed keys). Postgres encrypted volume.
- **Passwords:** bcrypt cost 12 (pen-test P2, task #310).
- **Tokens:** magic-link / anon-token = 24-byte base64url from crypto.randomBytes.
- **Column-level pgcrypto encryption** for highest-sensitivity PHI: task #296 pending.

## Domain 7 — Physical security

- No on-prem infrastructure. All compute + storage lives with:
  - Vercel (serverless functions) — SOC 2 Type II, ISO 27001, GDPR-aligned.
  - Supabase (Postgres + storage) — SOC 2 Type II, HIPAA-eligible.
  - AWS Sydney (Bedrock + SES + SNS + Transcribe) — full physical security controls per AWS Sydney region, HIPAA BAA in place.
  - Cloudflare (DNS + Worker + mTLS) — SOC 2, ISO 27001.
- Patrick's workstation: MacBook Air, FileVault enabled, screen lock 5 min. No PHI stored locally (all fetched via HTTPS to Supabase/Vercel).

## Domain 8 — Operations security

- **Change management:** git + PR review + Vercel deploy previews. `main` deploys to prod automatically.
- **Backup:** Supabase Point-in-Time Recovery (7-day window on our plan). Confirmed working — used to restore VitalsValidate after accidental delete (task #264).
- **Vulnerability management:** internal pen-test (tasks #298–318) + external quotes pending (Aura, Bastion — task #297). npm audit run weekly.
- **Logging:** audit_logs (append-only, retention indefinite), security_events (24m retention), disclosure_events (append-only, indefinite). Nightly anomaly cron (`api/_cron-security-anomalies.js`, task #292).
- **Log integrity:** append-only triggers on audit_logs and disclosure_events reject UPDATE + DELETE.
- **Malware protection:** ClamAV-style file scanning not in place — flagged for follow-up. File uploads restricted to PDF/PNG/JPG and go into private buckets with signed URL access only.
- **Data leakage prevention:** rate limits per IP + per endpoint (`api/handler.js`). CSP with nonces (task #303). No unsafe-inline. Open-redirect closed (pen-test P2).

## Domain 9 — Communications security

- Segmentation: Vercel functions are stateless; per-function isolation.
- Network security: Cloudflare in front of all customer surfaces. WAF rules active.
- Email: SES-signed with DKIM + SPF + DMARC via mail.terehealth.co.nz. BAA-covered.
- HL7 v2 outbound: not yet in production (task #168 NZePS pending). When live, mTLS + shared-secret + IP allowlist.

## Domain 10 — System acquisition, development, and maintenance

- All code in git (private repo). PR review by Patrick.
- Secrets never in code — enforced by convention + pre-commit hooks would catch. Vercel-only env store.
- SBOM: not formalised — flagged for follow-up (blocked on ISO 27001 pathway task #321).
- Third-party libraries reviewed for high/critical CVEs weekly. npm audit + `npx npm-check-updates` on schedule.
- Test coverage: manual smoke tests (see task list #91–93, #131, #134) + Playwright E2E harness for critical flows.

## Domain 11 — Supplier relationships

Data processor register (short list — full in PIA):

| Vendor | Purpose | Location | BAA/DPA | Compliance |
|---|---|---|---|---|
| AWS (Bedrock, SES, SNS, Transcribe) | AI, email, SMS, transcription | Sydney ap-southeast-2 | ✓ BAA signed | SOC 2, ISO 27001, HIPAA |
| Supabase | Database + storage + auth | AWS us-east-1 (Data hosted region NZ pending 2027) | DPA in place | SOC 2 Type II |
| Vercel | Serverless functions + hosting | Global edge, functions in Sydney by default | DPA in place | SOC 2 Type II, ISO 27001 |
| Cloudflare | DNS, WAF, mTLS proxy | Global edge | DPA in place | SOC 2, ISO 27001 |
| LiveKit | Video calls | Sydney region | Confirmed no PHI persisted server-side (E2EE audio) | SOC 2 |
| Stripe | Card payments | Global | Payment processor, no clinical data | PCI DSS L1 |
| Wise | Payouts | Global | Payment processor | PCI DSS + FSA |
| Telnyx | Fax (inbound + outbound) | Global | DPA in place, HIPAA-eligible | SOC 2 |
| Resend | Email (fallback) | Global | DPA reviewed (task #307) | SOC 2 |
| Medical-Objects | HL7 messaging | Australia | Vendor NDA + mTLS pinned | HL7 international |
| RHCNZ | Radiology reports | NZ | Vendor MoU + MO-routed | — |
| Sentry | Error monitoring | EU region | PII-scrubbed | SOC 2 |

## Domain 12 — Information security incident management

See `docs/regulatory/privacy-breach-runbook.md` — v1.0 in place.

- Incident detection: `security_events` table + nightly anomaly cron + failed-auth alerting.
- Escalation chain: Patrick → Rachel → external counsel (TBD).
- Notification: OPC via 72h notify portal, HDC on care-affecting incidents.

## Domain 13 — Business continuity

- **RPO (Recovery Point Objective):** 5 minutes (Supabase PITR granularity).
- **RTO (Recovery Time Objective):** 4 hours for critical clinical surfaces (video call, prescribing, patient triage).
- **DR runbook:** Vercel + Supabase both restore-from-backup in < 1 hour for prod DBs.
- **Availability canary:** 5-min ping to `/api/health` (task #239).
- **Uptime:** > 99.5% target.

## Domain 14 — Compliance

- **Legal register:**
  - Health Act 1956 (NZ) — Section 22F record request, Section 92 medical records
  - Health and Disability Commissioner Act 1994 (NZ) — Code of Rights
  - Privacy Act 2020 (NZ) — IPPs + IPP12 (offshore)
  - Health Information Privacy Code 2020 (HIPC) — 13 rules
  - Medicines Act 1981 + Misuse of Drugs Act 1975 + regulations (Reg 44 CD register)
  - Accident Compensation Act 2001 — ACC provider contract
  - Consumer Guarantees Act 1993
  - Fair Trading Act 1986
  - Financial Reporting Act 2013 — company records
  - Companies Act 1993
- Compliance monitoring: internal quarterly (Patrick) + external annual (target — ISO 27001 certification per task #321).

---

## Gaps / open items (as of 2026-09-03)

Deliberately called out so auditors don't have to find them:

- **Column-level pgcrypto encryption** — pending (task #296). Highest-sensitivity PHI currently sits under table-level encryption only.
- **Cloudflare Zero Trust for /admin** — pending (task #294). Admin surface is auth-gated but not IP/geo-gated.
- **Rate limiting per PHI endpoint** — pending (task #295). Global IP rate limits in place, per-endpoint tightening open.
- **External pen test** — quotes in from Aura + Bastion (task #297) — engagement scheduled Q4 2026.
- **ISO 27001 certification** — pathway plan in progress (task #321).
- **Malware scanning on uploaded files** — flagged, not yet implemented.
- **Formal SBOM** — flagged, blocked on ISO 27001 pathway.
- **Full-record FHIR Bundle export via patient self-service** — task #358, admin-mediated version live.

## Change log

- 2026-09-03 — v1.0 initial draft. Assembled from pen-test outcomes + PIA + audit_logs migrations. Needs external assessor sign-off before it's authoritative.
