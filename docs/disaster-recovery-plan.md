# Tere Health — Disaster Recovery Plan

**Document version:** 1.0
**Date:** 2026-07-08
**Owner:** Patrick Herling (Chief compliance contact)
**Review cadence:** Every six months, or after any material incident
**Companion documents:** [`security-compliance.md`](./security-compliance.md), [`incident-response-plan.md`](./incident-response-plan.md)

---

## Purpose

This document describes how Tere Health identifies, responds to, and recovers from disruptions that affect the delivery of clinical care or the confidentiality, integrity, or availability of patient health information. It complements the Incident Response Plan (which deals with security incidents and breaches) by focusing on availability and continuity of service.

A separate playbook exists for security incidents ([`incident-response-plan.md`](./incident-response-plan.md)).

---

## 1. Scope

This DR plan covers disruption to:

- The public patient-facing web app at `terehealth.co.nz`
- The provider-facing consultation, notes, and admin surfaces
- The API layer (Vercel serverless functions)
- The primary database (Supabase Postgres)
- AI processing (AWS Bedrock)
- Real-time video/audio (LiveKit)
- Outbound communications (Twilio SMS, Resend email, Documo/Telnyx fax)
- Payments (Stripe)

It does not cover clinical adverse events, complaints, or breach response — those are handled by separate processes.

---

## 2. Recovery Objectives

| Objective | Target | Notes |
|---|---|---|
| **RTO** (Recovery Time Objective) — critical patient flow | **30 minutes** | Time from detected outage to restored triage → consultation capability |
| **RTO** — provider-side non-critical (admin, careers, marketing) | **4 hours** | Non-clinical functionality can tolerate a longer outage |
| **RPO** (Recovery Point Objective) — patient records | **≤ 5 minutes** | Supabase point-in-time recovery is available and captures all writes within this window |
| **RPO** — audit logs | **≤ 5 minutes** | Same as patient records — audit is a Supabase table |
| **RPO** — outbound communications | **Not applicable** | Fire-and-forget; loss is acceptable, resend is manual |

Note on RTO: Tere is not a 24/7 emergency service. Patients are always instructed via consent flow and safety messaging to call 111 in an emergency. A 30-minute clinical outage during business hours is disruptive but does not create life-threatening risk provided the safety messaging holds.

---

## 3. Sub-processor Dependencies and DR Posture

Every dependency Tere has on a sub-processor is a dependency on that sub-processor's disaster recovery. Tere relies on:

| Sub-processor | Their published DR posture | Tere's DR posture on their failure |
|---|---|---|
| **Vercel** | Multi-region function execution, automatic failover between regions | Wait for Vercel restoration; no active Vercel-independent path |
| **Supabase** | Multi-AZ Postgres with automated backups; point-in-time recovery available on Pro tier and above | Restore from PITR or last hourly backup |
| **AWS Bedrock** | Multi-region availability under BAA; `global.` inference profile routes to any available region | Feature-flag `ai_notes_enabled=false` reverts to provider-manual note capture |
| **LiveKit Cloud** | Multi-region signalling and TURN infrastructure | Video/audio fails; providers fall back to phone or Twilio SIP |
| **Twilio, Resend, Documo/Telnyx, Stripe** | Standard cloud SLAs | Fire-and-forget; loss is manually resent post-recovery |
| **DNS** (Cloudflare, or whoever the registrar is) | Global anycast | If DNS fails, no fix at Tere level — wait for restoration |

**Key architectural note:** Tere does not currently maintain hot-standby infrastructure independent of these sub-processors. This is a deliberate trade-off at Tere's scale — the cost of maintaining active-active alternates would exceed the risk-weighted cost of a rare sub-processor outage. This posture is documented in the roadmap for revisit at scale.

---

## 4. Backup Strategy

### 4.1 Database backups

- **Supabase automatic backups:** Daily automated backups retained per Supabase Pro tier policy (currently seven days on Pro).
- **Point-in-time recovery:** Available on Supabase Pro tier for any moment within the retention window.
- **Manual snapshot before risky operations:** Any schema migration, mass update, or destructive operation is preceded by a manual export of affected tables.

### 4.2 Code and configuration

- **Codebase:** Git-versioned in the private GitHub repository `terehealthnz/tere-app`. Every commit is a recovery point.
- **Environment variables:** Held in Vercel encrypted env vars (Production, Preview, Development). Not held in git.
- **Secrets:** Rotated per the security-compliance policy. Old secrets deleted after new ones verified.
- **Deployment history:** Vercel retains all deployment builds; instant rollback to any prior deploy from the dashboard.

### 4.3 Media and documents

- **Video/audio:** Not recorded server-side. No backup exists or is needed.
- **Prescription PDFs:** Generated on demand from database records; no need to back up the PDFs themselves as long as the records exist.
- **Referral PDFs, medical certificate PDFs, ACC45 PDFs:** Same — generated on demand.

---

## 5. Failure Scenarios and Response Runbooks

### 5.1 Supabase outage (regional)

**Symptoms:** API endpoints return 5xx or timeout; `/api/status` reports database unhealthy.

**Response:**
1. Check [status.supabase.com](https://status.supabase.com) to confirm the outage is Supabase-side.
2. Post a status message to the marketing site (via Vercel-only deployment) directing patients to call 111 in an emergency and to try again later.
3. If the outage is expected to exceed 30 minutes, notify any active providers via alternative channel (SMS, phone) so they know consultations cannot start.
4. Wait for Supabase restoration.
5. On restoration, run `/api/status` and `/api/bedrock-test` to confirm the full stack is healthy.
6. Send catch-up notifications to any patients who had a consultation in flight when the outage started.

### 5.2 Supabase data corruption or accidental deletion

**Symptoms:** Missing rows, unexpected data values, or a destructive migration that ran on production instead of staging.

**Response:**
1. **Do not attempt to fix the data live.** Freeze the affected tables at the API layer via a feature flag.
2. Identify the timestamp before the corruption occurred.
3. **Point-in-time recovery** through the Supabase dashboard: create a new PITR clone at the target timestamp.
4. Diff the clone against production to identify affected rows.
5. Restore the specific rows using a manual SQL script executed via the Supabase SQL editor. Do not restore the entire database — that would roll back all writes after the target timestamp.
6. Verify the restore with a spot-check of at least 10 affected records.
7. Remove the feature-flag freeze.
8. Post-incident review captured in `docs/` per the Incident Response Plan.

### 5.3 Vercel outage

**Symptoms:** `terehealth.co.nz` unreachable; DNS resolves but connection refused or times out.

**Response:**
1. Check [vercel-status.com](https://vercel-status.com) to confirm.
2. Vercel typically fails over to alternate regions automatically. Wait 5 minutes for automatic recovery.
3. If the outage persists more than 15 minutes: post a message to the Tere Health social channels (LinkedIn, Facebook if applicable) directing patients to call 111 for emergencies.
4. No independent hot standby exists. Wait for Vercel restoration.
5. On restoration, verify: `/api/status`, `/api/bedrock-test`, and one live triage flow through incognito.

### 5.4 AWS Bedrock outage

**Symptoms:** AI-assisted features fail; `/api/bedrock-test` reports errors; provider notes generation returns "AI service error"; triage AI stops responding.

**Response:**
1. Check the AWS Health Dashboard for Bedrock service status.
2. **Immediately flip the `ai_notes_enabled` feature flag to `false`** via Admin > Feature flags. This reverts note generation to provider-manual capture — no AI is called until the flag is flipped back.
3. If patient-side triage is affected, post a maintenance notice on the triage page. Patients can still proceed but the AI-assisted flow may be degraded.
4. On restoration: `/api/bedrock-test` should return `ok:true` for both models before the flag is flipped back.
5. Flip `ai_notes_enabled` back to `true`.
6. Send catch-up notes to any providers who wrote manual notes during the outage.

### 5.5 LiveKit outage

**Symptoms:** Video/audio consultations fail to connect; provider queue shows patients waiting but call establishment errors.

**Response:**
1. Check LiveKit status.
2. **Switch active consultations to phone.** The provider can dial the patient's mobile via the existing Twilio integration. Explain the video failure to the patient over the phone.
3. Patients in the queue can be told (via SMS through Twilio) that a phone call is coming instead.
4. On LiveKit restoration, revert to video for new consultations.

### 5.6 Full multi-service outage

**Symptoms:** Everything is broken — Vercel unreachable, or catastrophic cascading failure.

**Response:**
1. Assess whether this is a genuine multi-service outage or a single upstream failure (e.g., DNS).
2. Contact the compliance owner directly.
3. Post a public message on any channel Tere can control (personal LinkedIn, personal Twitter/X, direct email to known patients) directing patients to call 111 for emergencies and to expect a call-back when service is restored.
4. Wait for the underlying failure to be resolved. Tere does not currently maintain independent standby infrastructure.
5. On restoration, run all smoke tests (`npx playwright test tests/e2e/bedrock-smoke.spec.ts` and browser E2E) before serving patient traffic.
6. Send a patient-facing communication describing what happened, what was affected, and what Tere is doing to prevent recurrence.

### 5.7 Compromised credential (AWS, Supabase service role, Stripe key)

**Symptoms:** Unexpected activity in logs, unexpected AWS/Supabase/Stripe charges, credentials found in an unexpected location.

**Response:**
1. **Immediately deactivate** the compromised credential in the respective sub-processor console.
2. **Generate a replacement.**
3. **Rotate in Vercel** env vars.
4. **Redeploy** Vercel (functions need the new credential).
5. **Verify** by hitting `/api/status` and confirming operations resume normally.
6. **Investigate** how the credential was compromised. Common vectors: pasted in chat/documentation, committed to git, exposed in an old build artifact, phishing.
7. **Audit** for any unauthorised activity during the compromise window.
8. This is a security incident — trigger the [`incident-response-plan.md`](./incident-response-plan.md).

---

## 6. Communication Plan During an Outage

### 6.1 Internal

- Compliance owner is contacted first for any outage lasting more than 5 minutes.
- Any active clinicians are notified via SMS or the pre-agreed Signal group if one exists.
- Providers on the queue at the time of the outage are notified within 15 minutes.

### 6.2 External — patients

- **Active consultation in flight:** Patients are contacted directly (Twilio SMS or phone call from the provider) with an explanation.
- **Queued patients:** SMS via Twilio if the outage exceeds 30 minutes.
- **Public patient-facing message:** Post a maintenance banner on the Landing page if Vercel is up but downstream services are affected. If Vercel is down, use social media or personal channels.

### 6.3 External — sub-processors

- If Tere believes a sub-processor is the source, and their status page does not yet reflect it, notify them via their support channel.
- Keep a log of the notification (support ticket number, timestamp, response) for the incident report.

### 6.4 External — regulatory

- **A pure availability outage is not a notifiable event** under the Privacy Act 2020 provided no PHI was compromised.
- If an outage was accompanied by any suspected PHI compromise, escalate to the [`incident-response-plan.md`](./incident-response-plan.md) — availability failure and confidentiality breach are distinct events but can occur together.

---

## 7. Testing and Verification

- **Post-restoration smoke test:** After any DR event, run `/api/status`, `/api/bedrock-test`, and one full patient triage in an incognito browser before returning the platform to full service.
- **Semi-annual DR drill:** Simulate one scenario from Section 5 (rotating each drill) as a tabletop exercise. Document the drill in the change history of this document. See `docs/incident-tabletop-exercise.md` for the current drill scenario.
- **Backup verification:** Confirm every quarter that Supabase PITR is enabled and that a recovery of a specific record from PITR into a scratch environment can be completed within 30 minutes.

---

## 8. Roles and Responsibilities

| Role | Responsibility during a DR event |
|---|---|
| Compliance owner | Overall coordination; decides on communications and escalation |
| Active clinicians | Continue serving patients where possible; switch to phone if video fails |
| Engineering (currently combined with compliance owner) | Executes the runbook; makes technical calls |
| Sub-processor support | External |
| Legal / Privacy Commissioner | Only involved if a PHI breach accompanies the outage |

At Tere's current scale the compliance owner and engineering owner are combined; at operational scale these should be separated.

---

## 9. Known Weaknesses of This Plan

Presented transparently in line with the security-compliance doc's Section 9 approach.

- **No hot-standby infrastructure.** A prolonged sub-processor outage means Tere is unavailable. Acceptable at current scale; revisit before regional PHO rollout.
- **Backup restore has not been rehearsed in production.** Supabase PITR is available but has not been tested with a real recovery scenario. Committed action: rehearse before first PHO contract.
- **Communication runbooks assume Vercel is up.** If Vercel is down, the fallback of "personal social media" is thin. Committed action: publish a static status page on an independent domain.
- **Single-person key-holder.** All secret rotation and DR execution currently sits with one person. This is an operational risk. Committed action: appoint a technical second before first PHO contract.

---

## Change History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-07-08 | Patrick Herling | Initial DR playbook drafted following the security-compliance document Section 9 commitment. |
