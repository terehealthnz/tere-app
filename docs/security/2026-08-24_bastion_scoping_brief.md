# Tere Health Ltd — Penetration Test Scoping Brief

**For**: Bastion Security Group
**Prepared**: 2026-08-24
**Contact**: Dr Patrick Herling, CMO — patrickherling@gmail.com / +64 29 043 23427

---

## 1. About Tere Health

Tere Health is a live New Zealand rural telehealth service (terehealth.co.nz). Patients see a NZ-registered doctor by video or phone, with ACC claims, e-prescriptions, GP letters, and radiology referrals handled inside the same encounter. Small clinical team, growing NZ-wide.

Corporate entity: **Tere Health Ltd** (NZBN 9429052562007), registered in Marlborough. Directors are Patrick Herling and Justin Herling; medical oversight by Dr Rachel (FACEM).

We're approaching MPS insurance underwriting renewal and beginning early conversations with NZ PHOs about integration. An independent third-party pen test is a soft requirement for both. We're taking quotes from Bastion and Aura in parallel.

---

## 2. What we're asking for

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

**Deliverable**: Full written report with CVSS-scored findings + reproduction steps + fix recommendations, suitable for insurance underwriting and enterprise buyers. Retest of critical/high fixes included.

---

## 3. Application shape

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

## 4. Tech stack

**Frontend**: React 18 (Vite build) → Vercel edge
**API**: Node.js serverless functions on Vercel (single-handler router at `api/handler.js`, per-route allowlist)
**Database**: Supabase (Postgres 15) — RLS-enabled on all PHI tables, server-mediated writes via service_role
**Auth**:
- Patients — anonymous with consultation_id
- Providers — PIN + bcrypt (cost 12) + optional TOTP MFA, DB-backed lockout, session-idle re-auth
- Admin — same auth model with role flags (`is_admin`, `is_supervisor`, `is_provider`, `is_billing_admin`)

**Edge / DNS**: Cloudflare (all three zones: terehealth.co.nz, terecare.com, tere.co.nz)
- HTTP-only cookies, HSTS (6mo), CSP headers, WAF managed rules, AI-bot block, DNSSEC pending

**Third-party integrations**:
| Integration | Purpose | Data flow |
|---|---|---|
| AWS Bedrock (Sydney) | Clinical AI (triage, ACC classify, notes generation, live translation) | Patient input → prompt, BAA-covered |
| AWS SES (Sydney) | Outbound transactional email | Patient names + email addresses |
| AWS Transcribe | Live audio → text for subtitles | Call audio, real-time |
| AWS SNS | SMS notifications (no-show, waitlist) | Patient phone numbers |
| Stripe | Payments (NZ + international tiers) | Payment intents, no PHI in metadata |
| LiveKit (self-hosted?) | Video/audio call transport | Encrypted, no server recording |
| Daily.co | Fallback call transport | Same |
| Medical-Objects | Inbound HL7 v2.x (labs, imaging, GP letters) | Real patient PHI via HL7 |
| Telnyx | Inbound + outbound fax | Prescriptions to pharmacies |

**Regional split**:
- terehealth.co.nz — NZ production (this pen test scope)
- terecare.com — US surface (state-license gate, not in prod yet — out of scope unless requested)
- tere.co.nz — Corporate landing (Tere Health Ltd IP-holder page, static — likely out of scope)

---

## 5. Data model (high-level)

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

## 6. Recent internal security work (context, not to skip in your test)

We ran a substantial internal walk-through and closed ~30 findings in the last two weeks. Landed:

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

**Where we did NOT get to** (things to hit hard in your test):
- Full CSP `unsafe-inline` removal (still present in prod)
- Password reset token in URL (should be POST-based)
- consultation_token infra for anon patient endpoints (some accept consult_id from body without token verification)
- ACC webhook signature verification (uses `JSON.stringify(req.body)` — likely broken)
- HL7 replay protection (no timestamp check on inbound bridge)
- Error message sanitization sweep (~340 places return `e.message` which may leak schema)

Treat this as informational — please do your own scan and rank by what you actually find, not what we say you should find.

---

## 7. Compliance context

- **NZ Privacy Act 2020** + **HIPC 2020** (Health Information Privacy Code) — full compliance target
- **HISO 10029** (NZ Health Information Security Framework) — alignment claimed
- **HDEC** — out-of-scope letter received for our validation study (2026-08-03)
- **NEAC 2019** ethics standards compliance
- **WAND** (Medsafe Web-Assisted Notification of Devices) — registered as Class I SaMD
- **MCNZ supervision plan** — filed for supervised prescribing providers
- **HNZ HPI** compliance — submitted, awaiting outcome (ticket IN-3502)
- **BAA-equivalent** signed with AWS

---

## 8. Timeline + budget

- Ideal kick-off: **4-6 weeks from quote acceptance** (mid-October 2026)
- Report draft: within 2 weeks of test completion
- Retest of critical/high fixes: within 2 weeks of remediation
- Budget target: mid-teens NZD for Scope A+B+C, plus separate line for optional Scope D
- We're serious buyers — not tire-kicking. If the scope fits and the report shape suits our insurance + enterprise use cases, we sign.

---

## 9. What we can provide once we sign

- Read-only source-code access via private GitHub invite
- Test environment with 5 pen-test accounts covering every role boundary (script ready to spin up on demand)
- Practice-mode patient data (fake NHIs, no real PHI)
- 30-min tech walkthrough with Patrick
- Slack / phone hotline for out-of-band comms during testing
- Written rules-of-engagement doc

---

## 10. Not in scope for this engagement

- Physical / social engineering
- Denial-of-service / stress testing
- Third-party integration internals (Stripe / LiveKit / Medical-Objects — they run their own security)
- terecare.com (US surface, not in prod)
- tere.co.nz corporate landing (static IP-holder page)

---

**Please respond with**: (a) proposed scope + methodology, (b) fixed-price quote or day-rate estimate with day count, (c) proposed consultant + brief bio, (d) sample redacted report, (e) turnaround from kick-off to draft report.

Happy to answer any technical questions before you quote — reply to this brief or book a 15-min scoping call with Patrick.
