# Tere Health Ltd — Bastion Security Scoping Package

**For**: Bastion Security Group (Asjad Abdul Rehman, Senior Security Consultant)
**Prepared**: 2026-08-24
**Contact**: Dr Patrick Herling, CMO — patrickherling@gmail.com — +64 29 043 23427
**Upload channel**: https://portal.bastionsecurity.co.nz/files/upload/tgbw2djavlmisv5ozdy24jfm

---

# 1. Application access

## URLs

| Surface | URL | Notes |
|---|---|---|
| Login (clinician) | https://terehealth.co.nz/clinician | PIN + optional TOTP |
| Provider dashboard | https://terehealth.co.nz/provider | Post-login redirect for provider role |
| Admin dashboard | https://terehealth.co.nz/admin | Post-login redirect for admin role |
| Patient flow (anon) | https://terehealth.co.nz/start | Anonymous entry — no login needed |
| Corporate landing | https://tere.co.nz | Static IP-holder page — out of scope |

## Test accounts (MFA disabled for scoping)

**⚠️ PINs are 6 digits. Paste from the terminal output of `scripts/create-pentest-accounts.mjs` before uploading this document.**

| Email | Role flags | PIN |
|---|---|---|
| pentest_provider_1@terehealthnz.com | is_provider | `__PIN_1__` |
| pentest_provider_2@terehealthnz.com | is_provider | `__PIN_2__` |
| pentest_supervisor@terehealthnz.com | is_provider + is_supervisor | `__PIN_3__` |
| pentest_admin@terehealthnz.com | is_admin | `__PIN_4__` |
| pentest_billing@terehealthnz.com | is_billing_admin (only) | `__PIN_5__` |

## Practice-mode data

After first login as any provider, click **Seed practice patients** in the admin panel. This creates:

- **PRAC001** — Aroha Mitchell
- **PRAC002** — David Chen
- **PRAC003** — Emily Thompson

All test-account activity is tagged `is_practice=true` and is isolated from live production data — you will not touch real patients.

---

# 2. What we're asking for

**Scope A — Web + API penetration test** (primary)
- Patient surface (`/start` → `/triage` → `/vitals` → `/payment` → `/waiting` → `/call` → `/done`)
- Provider surface (`/clinician`, `/provider`, `/clinician/patient/*`, chart, consult, notes)
- Admin surface (`/admin`, admin sub-panels)
- Emphasis on **authenticated access control + IDOR** after our recent server-mediation refactor moved all PHI reads/writes off the client

**Scope B — Supabase RLS policy review**
- ~40 tables with row-level security policies
- Focus: policies that grant to `anon` role, any USING clause with `true`, cross-tenant leaks

**Scope C — Inbound HL7 pathway**
- Medical-Objects → Cloudflare mTLS bridge → Vercel serverless endpoint
- HL7 v2.x parser, auto-file-on-strong-NHI-match heuristic, structured-history import

**Scope D — Cloud config review** (optional)
- Vercel env / secrets / CSP / rate limits
- Supabase RBAC + service-role usage
- AWS IAM (Bedrock, SES, SNS, Transcribe access keys)

**Deliverable**: Full written report with CVSS-scored findings + reproduction steps + fix recommendations. Structured to **ISO 27001:2022 Annex A control mapping** — suitable for a JAS-ANZ accredited certification auditor as part of our planned certification pathway (see §9). Retest of critical/high fixes included.

---

# 3. About Tere Health

Tere Health is a live New Zealand rural telehealth service (terehealth.co.nz). Patients see a NZ-registered doctor by video or phone, with ACC claims, e-prescriptions, GP letters, and radiology referrals handled inside the same encounter. Small clinical team, growing NZ-wide.

Corporate entity: **Tere Health Ltd** (NZBN 9429052562007), registered in Marlborough. Directors: Patrick Herling and Justin Herling. Medical oversight: Dr Rachel (FACEM).

Drivers for this engagement:
- **MPS insurance underwriting** renewal (soft requirement)
- **NZ PHO integration** conversations (some require external attestation)
- **ISO 27001 certification pathway** — phase 1

---

# 4. Application shape

| Layer | Metric |
|---|---|
| Frontend | ~50k LOC across 109 React components, 66 routes |
| API | ~20k LOC across ~110 serverless endpoints + 5 cron jobs |
| Database | 64 SQL migrations, ~40 tables |
| Built artefact | 16 MB `dist/` |
| Codebase age | ~10 months, single-team |

**Route breakdown**:
- Patient flow: 29 (triage, consent, vitals capture, payment, waiting room, video/phone call, post-consult)
- Clinician / admin: 21 (login, provider dashboard, patient chart, consult, notes, admin panels)
- Marketing / legal: 8
- Region / demo: 4
- Other: 4

---

# 5. Tech stack

**Frontend**: React 18 (Vite build) → Vercel edge
**API**: Node.js serverless functions on Vercel (single-handler router at `api/handler.js`, per-route allowlist)
**Database**: Supabase (Postgres 15) — RLS-enabled on all PHI tables, server-mediated writes via service_role
**Auth**:
- Patients — anonymous with consultation_id
- Providers — PIN + bcrypt (cost 12) + optional TOTP MFA, DB-backed lockout, session-idle re-auth
- Admin — same auth model with role flags (`is_admin`, `is_supervisor`, `is_provider`, `is_billing_admin`)

**Edge / DNS**: Cloudflare (all three zones: terehealth.co.nz, terecare.com, tere.co.nz)
- HSTS (6mo), CSP headers, WAF managed rules, AI-bot block, DNSSEC pending

**Third-party integrations**:

| Integration | Purpose | Data flow |
|---|---|---|
| AWS Bedrock (Sydney) | Clinical AI (triage, ACC classify, notes generation, live translation) | Patient input → prompt, BAA-covered |
| AWS SES (Sydney) | Outbound transactional email | Patient names + email addresses |
| AWS Transcribe | Live audio → text for subtitles | Call audio, real-time |
| AWS SNS | SMS notifications (no-show, waitlist) | Patient phone numbers |
| Stripe | Payments (NZ + international tiers) | Payment intents, no PHI in metadata |
| LiveKit | Video/audio call transport | Encrypted, no server recording |
| Daily.co | Fallback call transport | Same |
| Medical-Objects | Inbound HL7 v2.x (labs, imaging, GP letters) | Real patient PHI via HL7 |
| Telnyx | Inbound + outbound fax | Prescriptions to pharmacies |

**Regional split**:
- terehealth.co.nz — NZ production (this pen test scope)
- terecare.com — US surface (state-license gate, not in prod yet — out of scope)
- tere.co.nz — Corporate landing (Tere Health Ltd IP-holder page, static — out of scope)

---

# 6. Data model (high-level)

| Table cluster | Contains |
|---|---|
| `patients` | Demographics (name, DOB, NHI, phone, email, address), medical history, allergies, meds, GP details |
| `consultations` | The core encounter — clinical notes, diagnosis, chief complaint, prescriptions issued, ACC status, payment metadata, transcript |
| `prescriptions` | Drug, dose, directions, patient, pharmacy, approval status, delivery status |
| `radiology_referrals` + `radiology_reports` | Investigation orders + PDF results |
| `patient_documents` | Provider-uploaded PDFs, images (private Supabase bucket, signed URLs 15min) |
| `messages` | In-call patient/provider chat |
| `scribe_transcripts` + `live_subtitles` | Audio-derived text |
| `inbound_hl7_messages` + `_attachments` | Raw HL7 payloads from Medical-Objects |
| `providers` + `provider_login_attempts` + `provider_password_resets` | Auth surface |
| `audit_logs` (append-only) + `security_events` | Access logging |
| `acc_claims` | ACC billing records |
| `pharmacy_contacts` | Community pharmacy directory (crowdsourced, not PHI) |

**Data residency**: Everything in Supabase Sydney (`ap-southeast-2`), Bedrock Sydney, SES Sydney. No transatlantic hops for PHI.

---

# 7. Recent internal security work (context)

We ran an internal walk-through and closed ~30 findings in the last two weeks. Landed:

- Provider session idle timeout + PIN re-auth (`SessionIdleGuard`)
- Failed-auth persistent log + nightly anomaly cron (`security_events` table)
- Atomic Postgres RPC for login-lockout counter (was race-vulnerable)
- Bcrypt cost bumped 10 → 12 for PIN hashing
- `crypto.randomInt` replacing `Math.random` for PIN generation
- Cloudflare edge: HSTS, WAF, AI-bot block, timing-safe cron secret comparison
- X-Forwarded-For handling switched to CF-Connecting-IP (was spoofable)
- RLS lockdown on primary + secondary PHI tables; deny-public policies on providers/prescriptions/radiology_referrals defence-in-depth
- Payment double-capture guard + Stripe idempotency key
- Approve-draft supervisor-role gate (was any-provider)
- Consultation PATCH ownership check + billing_admin clinical-notes redaction
- AI prompt-injection XML wrapping on 6 LLM endpoints
- patient-documents bucket flipped to private + signed URLs + magic-byte MIME validation
- SSRF hardening on signature-URL fetch

**Where we did NOT get to** (things worth hitting hard in your test):
- Full CSP `unsafe-inline` removal (still present in prod)
- Password reset token in URL (should be POST-based)
- consultation_token infra for anon patient endpoints
- ACC webhook signature verification (uses `JSON.stringify(req.body)` — likely broken)
- HL7 replay protection (no timestamp check on inbound bridge)
- Error message sanitisation sweep (~340 places return `e.message` which may leak schema)

Treat this as informational — please do your own scan and rank by what you actually find.

---

# 8. Compliance context

- **NZ Privacy Act 2020** + **HIPC 2020** (Health Information Privacy Code) — full compliance target
- **HISO 10029** (NZ Health Information Security Framework) — alignment claimed
- **HDEC** — out-of-scope letter received for our validation study (2026-08-03)
- **NEAC 2019** ethics standards compliance
- **WAND** (Medsafe Web-Assisted Notification of Devices) — registered as Class I SaMD
- **MCNZ supervision plan** — filed for supervised prescribing providers
- **HNZ HPI** compliance — submitted, awaiting outcome (ticket IN-3502)
- **BAA-equivalent** signed with AWS

---

# 9. ISO 27001 certification pathway

Tere is pursuing ISO 27001:2022 certification as part of a 12-18 month enterprise-readiness plan. This pen test is **Phase 1** of that pathway. We're looking for a partner (or a series of partners) to walk with us:

- Phase 1 (this engagement, months 0-2): pen test + report acceptable to a JAS-ANZ accredited auditor
- Phase 2 (months 2-4): formal ISO 27001 Annex A gap analysis
- Phase 3 (months 4-10): control implementation (ISMS policy suite, risk register, asset register, incident response, DR/BCP)
- Phase 4 (months 10-14): Stage 1 + Stage 2 audits with a JAS-ANZ accredited certification body

**Questions we'd like Bastion to answer in the quote**:
1. Is the pen test report explicitly ISO 27001:2022 Annex A mapped?
2. Do you offer Phase 2 gap analysis, or partner with an ISO consultant who does?
3. Can you refer / partner with a JAS-ANZ accredited certification body for Phase 4?

Bundling reduces our vendor-switching risk mid-journey. Standalone quotes for each phase also fine.

---

# 10. Rules of engagement (scoping walk only)

For **this scoping period** (14 days from upload):
- **Scoping access only** — please don't run automated scans, fuzzers, brute-force tools, or aggressive tooling yet. Manual walk of the app is welcome.
- **Do not trigger real integrations** without notifying us first — email send, SMS send, payment capture, HL7 outbound, fax outbound will hit real third-party services with real cost.
- **Do not touch non-PRAC* patient data** — if you accidentally load a real patient record, stop and notify us immediately.
- **Emergency stop / account disable**: DM Patrick +64 29 043 23427 — we revoke accounts within 30 seconds.
- **All test-account activity is audit-logged** — that's expected, not a finding.
- **Access window**: 14 days from upload of this document. We'll rotate PINs and disable accounts afterwards.

Full rules of engagement (aggressive testing, fuzzing, load, etc.) will be agreed separately in the SOW before formal test kick-off.

---

# 11. What we can provide once we sign the SOW

- Read-only source-code access via private GitHub invite
- Extended test window (typically 2-3 weeks calendar time)
- Practice-mode data reset and re-seed on demand
- 30-min tech walkthrough with Patrick
- Slack / phone hotline for out-of-band comms during testing
- Written rules-of-engagement document tailored to the SOW scope

---

# 12. Not in scope for this engagement

- Physical / social engineering
- Denial-of-service / stress testing
- Third-party integration internals (Stripe / LiveKit / Medical-Objects — they run their own security)
- terecare.com (US surface, not in prod)
- tere.co.nz corporate landing (static IP-holder page)

---

# 13. What we're expecting in the formal quote

- Proposed scope + methodology
- Fixed-price quote or day-rate estimate with day count
- Proposed consultant (name + bio)
- Sample redacted report from a comparable NZ health-tech engagement
- Turnaround from kick-off to draft report
- Retest inclusion + timeline
- ISO 27001 pathway commitments (see §9)

---

**Timeline target**: kick-off 4-6 weeks from quote acceptance. Draft report within 2 weeks of test completion. Retest of critical / high fixes within 2 weeks of remediation.

**Contact for any technical questions before you quote**:
Patrick Herling · patrickherling@gmail.com · +64 29 043 23427

Ngā mihi.
