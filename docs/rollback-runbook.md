# Tere Health — Rollback Runbook

**Version:** 1.0
**Date:** 2026-08-04
**Audience:** On-call engineer at Tere Health during an active production incident.
**Companion to:** [`incident-response-plan.md`](./incident-response-plan.md) (this runbook is the *operational how*; the incident response plan is the *procedural what and when*).

---

## Purpose

Every production change in Tere has a defined way to undo it. This runbook is the reference an on-call engineer uses to actually perform the undo — no thinking required, just follow the section for the layer that broke.

Use this document when:
- A deploy caused a regression that cannot wait for a forward fix.
- A migration corrupted data or blocked reads/writes on a critical table.
- A third-party sub-processor (Bedrock, Stripe, LiveKit, Telnyx) is degraded and we need to fall back.
- A feature is behaving in a clinically unsafe way and needs to be turned off immediately.

Do not use this document to skip the incident-response process. Once you have executed a rollback, record it in the incident log (Phase 1, `incident-response-plan.md` §7.1).

---

## 1. Application deploy rollback (Vercel)

**When:** New Vercel deployment caused a regression (500s, blank page, wrong version live).

**Impact if you do this:** All users see the previous production version. Zero data change. Typically ~30 seconds to propagate.

**Steps:**
1. Open Vercel dashboard → Tere project → Deployments tab.
2. Find the last known-good deployment (green tick, previously in "Production" role).
3. Click the `…` menu → **Promote to Production**.
4. Confirm. Wait ~30 s for the CDN to invalidate.
5. Verify: hit https://terehealth.co.nz — check version banner (bottom-right of admin) matches the promoted commit SHA.

**Do not** use `git revert` and re-push as your rollback path — the CI build can take 2–3 minutes. Promotion of a known-good build is faster and eliminates the risk of a bad revert.

**Post-rollback:** open a task to write the forward fix and land it via the normal PR process; do not amend the broken deploy in place.

---

## 2. Database migration rollback (Supabase Postgres)

**When:** A migration in `supabase/*.sql` broke a table, changed a column type in a way the app can't handle, or corrupted data.

**Impact if you do this:** All writes stopped between "migration applied" and "rollback applied" may need to be re-processed. Some rollbacks are lossy — see the specific action below.

### 2.1 Adding a column (safe, reversible)

Most 2026-08 migrations are additive (`ADD COLUMN IF NOT EXISTS …`). To reverse:

```sql
ALTER TABLE <table> DROP COLUMN IF EXISTS <column>;
```

Application impact: any code path that reads the column will fall through to `undefined`. If the column was required by the app (rare — check the endpoint's ALLOWLIST + JSX callers before dropping), roll back the deploy in §1 first, then drop the column.

### 2.2 Adding a table (safe, reversible)

```sql
DROP TABLE IF EXISTS <table>;
```

If the app still references the table in a read path, roll back the deploy first (§1) then drop the table.

### 2.3 Changing a column type (lossy — do a point-in-time restore)

**Do not attempt a manual reverse-type migration under time pressure.** Use Supabase Point-in-Time Recovery instead:

1. Supabase dashboard → Database → Backups → **Point-in-Time Recovery**.
2. Choose a timestamp **just before** the bad migration was applied.
3. Confirm restore. This creates a new database at that point in time.
4. Update the `VITE_SUPABASE_URL` in Vercel (if URL changed) or restore over the existing DB per Supabase support.
5. Notify all clinicians that writes since the restore point are lost. **Every impacted consultation must be re-entered.**

### 2.4 Data-loss migration (DELETE / TRUNCATE without a WHERE clause)

Use PITR (§2.3) — this is the only reliable recovery path. Do not attempt to reconstruct from application logs; they do not carry full row payloads.

---

## 3. Feature flag rollback (kill switches)

**When:** A feature has been enabled but is misbehaving clinically (wrong dosing, wrong price, incorrect AI summary quality). Cannot wait for a deploy.

**Impact if you do this:** Instant, zero downtime. Users lose the feature; core clinical flow continues.

**Steps:**
1. Sign in to admin dashboard → **Feature Flags** (`/admin/flags`).
2. Locate the flag by name (see table below for common ones).
3. Toggle **Off**. Change is live in < 30 s (server reads flag on every request; no caching).

Common kill switches:

| Flag | What it turns off | When to flip |
|---|---|---|
| `ai_notes_enabled` | AI-generated clinical note drafts | Bedrock outage; AI is generating dangerous output |
| `live_subtitles` | AWS Transcribe live subtitles | Transcribe outage; call proceeds without subtitles |
| `patient_uploads` | Patient-side document upload channel | Malicious upload discovered; freeze uploads |
| `nzeps_send` | NZePS submission (once live) | NZePS incident; falls back to email + fax |

**Do not** delete the flag or the code that reads it — leave both in place so the switch works next time.

---

## 4. Third-party sub-processor rollback / fallback

| Sub-processor | Fallback path | Owner action |
|---|---|---|
| **AWS Bedrock (AI)** | Flip `ai_notes_enabled` off (§3). Clinicians write notes manually. | On-call engineer flips the flag; clinicians notified via Slack #clinical-ops |
| **AWS Transcribe (subtitles)** | Flip `live_subtitles` off (§3). Call proceeds without live subtitles. | On-call engineer |
| **AWS SNS (SMS)** | Reservation reminders queue in DB and re-fire when SNS recovers. No manual action required for < 4 h outage. | Monitor |
| **Supabase (database)** | No hot failover. Follow §2.3 PITR if data loss; if outage only, wait for Supabase recovery. Post banner via `set-availability-message` endpoint so patients see "System temporarily unavailable". | On-call engineer posts banner |
| **LiveKit (video)** | Fall back to phone bridge (already wired). `deliveryChannel: 'phone'` is auto-selected in `_encounter-action.js` when `last_seen_at > 30s`. If LiveKit is entirely down, clinician can call the patient directly on the number in the consultation record. | Automatic; manual phone fallback as last resort |
| **Vercel (frontend + API)** | No cross-region failover. Vercel Sydney outages block the whole app. Post OPC/patient notification per incident-response-plan.md §3 Phase 4. | On-call engineer + CMO |
| **Stripe (payment)** | If Stripe payments fail, consult can still proceed if flagged as unpaid; billing goes to manual admin queue. No feature flag — escalate to admin. | On-call engineer |
| **Telnyx (fax)** | Prescription still generates PDF and sends by email. Provider is warned in-app when fax fails. | Provider verifies email path succeeded |
| **Resend (email)** | No fallback. Manual per-patient contact. Log the affected consultations. | Admin queue |
| **AWS Bedrock BAA loss** (hypothetical: BAA cancelled) | Kill switch `ai_notes_enabled` immediately (§3). Do not resume AI use until BAA is reinstated. | CMO decision |

---

## 5. Auth / MFA rollback

**When:** MFA is locking out providers unexpectedly (e.g. authenticator app time-drift, wrong secret entered).

### 5.1 Provider lost their authenticator app

1. Admin → Settings → Providers → find the provider.
2. Provider row shows MFA status. Admin edits the row and clears both fields:
   - `mfa_enabled` → `false`
   - `mfa_secret_encoded` → `NULL`
3. This is done via `PATCH /api/providers?id=<uuid>` and requires admin auth. Audit-logged automatically.
4. Notify the provider that MFA is off; they should re-enrol from the Menu tab at next login.

### 5.2 Provider account locked out (6 failed attempts)

Auto-clears after 15 minutes. If clinical urgency: use PATCH on providers with `is_active: false` then `is_active: true` — this resets in-memory lockout state on next auth (server-side memoisation).

### 5.3 All-providers MFA outage (e.g. TOTP time-drift server-wide)

Not possible without a code change — MFA is per-provider. If the TOTP algorithm itself is broken, deploy-rollback (§1) to the pre-MFA build.

---

## 6. Communications during rollback

- **Internal:** Post in Slack #incident. Timestamp what you rolled back and why. Copy to incident log entry template (`incident-response-plan.md` §7.1).
- **Clinicians:** If clinical workflow changes (e.g. AI notes off, video → phone), post in Slack #clinical-ops with a one-line "affects: <what> · duration: <estimate>".
- **Patients:** For outages that visibly affect patients, post the availability banner via the admin dashboard (`Closed-screen message`). It replaces the queue with the message text.
- **OPC / notifiable-breach threshold:** Follow incident-response-plan.md §3 Phase 4 — 72 hours from confirmation of a notifiable breach.

---

## 7. What not to roll back

- **Do not** revert audit-log rows. If an audit row is embarrassing or wrong, add a correction row referencing the original; never delete or edit the original.
- **Do not** revert consent captures. Consent records are legal artefacts. If a consent was captured in error, add a superseding consent revocation, don't delete.
- **Do not** revert Stripe transaction records — payment reconciliation depends on them. Use Stripe refund flow instead.
- **Do not** roll back TLS certificate rotations. If a cert breaks, obtain a new one; do not restore an expired one.

---

## 8. Verifying a rollback succeeded

For every rollback, complete these checks:

1. **Application health:** `https://terehealth.co.nz` loads, admin banner shows expected commit SHA.
2. **API health:** `curl -sf https://terehealth.co.nz/api/health` returns 200. (`_health.js` returns Vercel region, db reachable, Bedrock reachable.)
3. **Auth flow:** Complete one clinician login end-to-end (PIN + MFA if enabled). Confirm session lands on `/provider`.
4. **Clinical write:** Complete one consultation write (e.g. create a note on a test consult) and confirm it lands in the DB.
5. **Audit-log write:** Confirm the rollback action itself is present in `audit_log` (all admin PHI-touching actions are logged).

If any check fails, escalate to the CMO immediately — do not attempt further rollbacks without a second opinion.

---

## 9. Escalation

Every rollback must be signed off by the CMO within 24 hours of execution. If the CMO is unreachable and the rollback is time-critical, execute and notify by every available channel (Slack, phone, SMS). Document in the incident report why the CMO was not signed off in real time.

Contacts: see `incident-response-plan.md` §6.

---

## Change history

| Date | Change | By |
|---|---|---|
| 2026-08-04 | v1.0 initial runbook | Dr Patrick Herling (CMO) |
