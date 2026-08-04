# Reply to Trevor Lloyd — NZePS IN-3447

**Date:** 2026-08-04
**To:** Trevor Lloyd (via jira@mohapis.atlassian.net — reply-above-this-line)
**Ticket:** IN-3447
**Status:** READY TO SEND after the two go/no-go checks below

---

## Go / no-go before sending

- [ ] Run `supabase/2026-08-04_audit_logs_schema_reconcile.sql` in Supabase (adds provider_role / resource_type / resource_id / reason / reason_notes / user_agent to `audit_logs`, plus append-only triggers). Without this, the audit retention policy references columns not present in staging or in any new environment.
- [ ] Confirm the four attached documents are exported to PDF and attached, or replace with public URLs:
  - `docs/hosting-and-data-residency-statement.md`
  - `docs/rollback-runbook.md`
  - `docs/audit-log-retention-policy.md`
  - `docs/security-compliance.md`

Optional supplementary attachments (only if Trevor asks or if you'd like to over-share): `docs/privacy-impact-assessment.md`, `docs/maori-data-sovereignty.md`, `docs/ethics-policy.md`.

---

## Draft reply

Kia ora Trevor,

Thank you for the follow-up. Answers below in your original numbering. We have used the interval since your questions to close several of the gaps you identified, so the answers reflect Tere as of today rather than at the time of the initial application.

### Org Risk

**Q4 — Security testing / penetration testing plans**

Tere Health has not yet undertaken third-party penetration testing. This is planned prior to opening to the public. Our current intent:

- Engage a NZ-based penetration testing firm (options being considered: ZX Security, Aura Information Security, or Insomnia Security) for a scoped external + application-layer test.
- Rough timeline: within 8–12 weeks of go-live, and repeated annually thereafter or on any material architectural change.
- Scope will include the provider portal auth flow (now MFA-protected, see Q2 below), patient triage flow, and all API endpoints (Vercel serverless functions and the Supabase managed Postgres).
- Findings will be triaged with a documented remediation SLA (P1 within 7 days, P2 within 30 days, P3 within 90 days) and re-tested before the next release.

We will provide the pen-test report to Health NZ on request as part of ongoing compliance if that would support your assessment.

**Q6 — Security training triggers**

We understand the current absence is a gap. Our plan:

- **Trigger for initial rollout:** hiring the second non-founder staff member (currently the founding medical officer is the sole permanent role; second clinical or admin hire will be the trigger).
- **Content:** annual formal security awareness training (phishing recognition, credential hygiene, HIPC 2020 obligations, incident escalation) via a tracked completion register. Options under consideration: Practical Guide to Security Awareness (Aura), CyberCX SecureAware, or NZ Cyber Security Centre free training modules.
- **Cadence once implemented:** annual refresher for all staff + role-specific supplements for prescribers (MCNZ e-record standards) and admin (billing / patient-identification protocols).
- **Interim measure:** the founding medical officer completes documented reading of the OWASP Top 10, HIPC 2020, and MCNZ e-record standards, with a signed attestation kept in the records.

### Prod Risk

**Q2 — Multi-factor authentication + audit log retention**

**MFA — now implemented (as of 2026-08-04):**

- Provider login is a two-step flow: (1) PIN (bcrypt-hashed, verified server-side), (2) 6-digit TOTP code from a standard authenticator app (Google Authenticator, 1Password, Authy, iOS Passwords, etc.).
- Implementation follows RFC 6238 (HMAC-SHA1, 30-second step, 6 digits) with the base32 secret stored server-side and never exposed to the browser after enrollment. See `api/_totp.js`, `api/_provider-mfa.js`, `api/_provider-auth.js`.
- MFA enrollment is a self-service flow from the provider portal Menu tab; recovery is via admin reset (audit-logged).
- Six wrong MFA attempts trigger the same 15-minute lockout as PIN failures.
- MFA will be **required** for every new clinical provider account we create from this point. The founding medical officer's own account has MFA enabled.

**Audit log retention:**

- Full retention policy attached: **`Audit Log Retention Policy v1.0`**.
- Summary: all patient-record access, prescription events, ACC lodgements, MFA enable/disable, password resets, radiology views, and encounter transitions are logged to an append-only `audit_logs` table (Supabase Postgres, Sydney `ap-southeast-2`).
- Retention: **10 years from date of last patient contact** (Health (Retention of Health Information) Regulations 1996), aligned to the clinical record because the audit trail is treated as an integral part of it.
- Immutability is enforced at three layers: no application UPDATE/DELETE writer, row-level security scoped to service_role, and `BEFORE UPDATE OR DELETE` triggers that block edits regardless of role.
- Every admin *read* of the audit log is itself audit-logged. Access is restricted to the founding medical officer and any designated administrator.
- A quarterly encrypted archive to a private AWS S3 bucket (`ap-southeast-2`) provides long-tail regulator/legal-hold coverage independent of the operational database.

**Q4 — NHI + HPI-FAC access confirmation**

Confirmed — thank you for flagging. We have applied for **NHI Lookup access** separately. We understand from your note that **HPI-FAC IDs will need to be requested as part of the same NZePS application flow**. Please treat this reply as our formal request for HPI-FAC access alongside NHI access. If a separate application form is required for HPI-FAC, please let us know and we will submit it promptly.

**Q7 — Cloud hosting location, rollback, and offline behaviour**

Full detail is in the attached **`Hosting and Data Residency Statement v1.0`**. In summary:

**Hosting location — all patient health information (PHI) resides in Sydney, `ap-southeast-2`:**

- **Frontend + API (Vercel):** Sydney region for serverless function execution (nearest region to NZ). Static assets on global edge, no PHI on edge.
- **Database (Supabase):** Sydney `ap-southeast-2` (verified 2026-08-04).
- **AI processing (AWS Bedrock):** Sydney `ap-southeast-2`, under a signed AWS Business Associate Agreement (executed 2026-07-07).
- **Live subtitles (AWS Transcribe):** Sydney `ap-southeast-2` (covered under the same AWS BAA).
- **SMS (AWS SNS):** Sydney `ap-southeast-2` (same BAA).
- **Video (LiveKit Cloud):** Sydney primary region (verified 2026-08-04); WebRTC media relay uses the global edge but no audio/video is recorded server-side.

No PHI is stored in the United States. US-based sub-processors (Resend for transactional email, Telnyx for fax transport, Sentry for error tracking) handle transient data only and never receive full clinical records.

**Rollback:**

Full detail in the attached **`Rollback Runbook v1.0`**. In summary:

- Application deploys use Vercel's promotion model — any prior known-good deployment can be re-promoted from the dashboard in ~30 seconds; no code push required.
- Database migrations are versioned in the repo (`/supabase/*.sql`) and applied via the Supabase console. Additive migrations reverse cleanly with `DROP COLUMN/TABLE IF EXISTS`; destructive changes are rolled back via Supabase Point-in-Time Recovery (7-day window on the Pro plan).
- Feature-level kill switches (`ai_notes_enabled`, `live_subtitles`, `patient_uploads`) allow individual clinical features to be disabled without a deploy.

**Offline functionality:**

- Tere currently **does not support offline functionality**. All clinical workflows require a live connection.
- No patient data is cached to device storage beyond what the browser transiently holds during an active session (form-in-progress input, session token). No patient records, prescriptions, or clinical notes are stored to `localStorage` or `IndexedDB`.
- Rationale: keeping the source of truth server-side avoids stale-record risk, simplifies audit-trail completeness, and improves our data-breach posture (a lost or compromised device cannot exfiltrate patient records).

**Q9 — Proxy / brokering service architecture**

Tere Health acts as the direct service provider — we are not a proxy or broker on behalf of another party. However, we understand the intent of the question is to describe how end-user (individual clinician) traceability is maintained when we call Health NZ digital services.

**Ownership:** Tere Health Limited, 100% New Zealand owned. NZBN **9429053723413**. Registered NZ company; the legal entity is the same as the party accessing Health NZ services, with no offshore parent.

**Hosting:** as detailed in Q7.

**Authentication model — end-user traceability chain:**

- Each individual clinician has their own account within Tere, bound to their MCNZ registration number and HPI-CPN.
- Clinicians authenticate to Tere with their per-provider PIN (bcrypt hashed, server-side verified) plus TOTP MFA (per Q2 above).
- Every call from Tere to a Health NZ service carries the specific clinician's identity: HPI-CPN for prescriber identification, plus the tere-side `provider_id` and session token. We do not send generic organisation-level credentials for actions that require an individual prescriber's authorisation.
- Every such call is recorded in `audit_logs` with: caller HPI-CPN, tere `provider_id`, Health NZ endpoint, request payload metadata (no PHI stored twice), and timestamp.

**Data retention (of Health NZ interaction records):**

- Request and response envelopes retained for 10 years per HIPC 2020 alignment with health record retention.
- Payloads containing patient-identifying data are stored under the same 10-year retention.
- Any transient tokens or session artefacts from Health NZ endpoints are retained only for the duration of their validity window.

**Audit logging:**

- Every Health NZ API call is logged with the individual clinician's identity, timestamp, endpoint, and outcome (success / error class).
- Audit logs are surfaced in a provider admin dashboard filterable by clinician, patient, date range, and endpoint. This supports both internal review and external audit requests.
- Failed access attempts (auth failures, quota errors) are logged separately and reviewed weekly by the founding medical officer.

**End-user traceability guarantee:** at any given point, we can trace any Health NZ interaction back to a named MCNZ-registered clinician within our system by their HPI-CPN. No batch or scheduled process ever calls Health NZ services without an authenticated clinician's identity attached.

---

## Attachments

1. **Hosting and Data Residency Statement v1.0** — `docs/hosting-and-data-residency-statement.md`
2. **Rollback Runbook v1.0** — `docs/rollback-runbook.md`
3. **Audit Log Retention Policy v1.0** — `docs/audit-log-retention-policy.md`
4. **Security and Compliance Overview** — `docs/security-compliance.md` (updated 2026-08-04)

Happy to provide any of the following on request: Privacy Impact Assessment, Māori Data Sovereignty policy, Ethics Policy, executed AWS BAA, Supabase DPA.

---

Please let me know if any of these answers need more detail, and if additional documentation would help support your review.

Ngā mihi,

**Dr Patrick Herling**
Founding Medical Officer, Tere Health Limited
MCNZ Registration: 99529
HPI-CPN: 24NSES
NZBN: 9429053723413
patrickherling@gmail.com
terehealth.co.nz
