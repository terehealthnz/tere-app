# Tere Health — Incident Response Tabletop Exercise

**Document version:** 1.0
**Date:** 2026-07-08
**Purpose:** Structured walk-through of a plausible security incident to test the Incident Response Plan and identify weaknesses before a real event.
**Cadence:** Semi-annual, or after any material change to the incident response process.
**Companion document:** [`incident-response-plan.md`](./incident-response-plan.md)

---

## How to run this exercise

- **Duration:** 60–90 minutes.
- **Participants:** At minimum, the compliance owner. Preferably also: consulting clinician, technical second (once appointed), external legal advisor (once retained).
- **Format:** Conversational walk-through. One participant reads each event; participants discuss the response as though it were happening now. The facilitator (usually the compliance owner) captures gaps in the response and durable-change actions.
- **No live systems are touched** during the exercise. This is a talk-through, not a live drill.
- **Output:** A written debrief with identified gaps and follow-up actions, added to the change history of this document.

---

## Scenario A — Provider credential exposed in a public GitHub commit

*This scenario is drawn from a real class of incidents that has occurred at other early-stage SaaS companies. It is used because it is highly probable, has a clear detection point, and stresses several parts of the IR plan.*

### T+0 minutes — the incident begins

At 09:47 on a weekday morning, a junior contributor (contractor working on a marketing feature branch) accidentally commits a file named `.env.local` containing a copy of the production `AWS_SECRET_ACCESS_KEY` for the `tere-bedrock` IAM user. The commit is pushed to the public `main` branch of the `terehealthnz/tere-app` repository, which is private — but the contractor also cross-posts the commit link to a public Discord for portfolio credit.

The exposure is unnoticed for 43 minutes.

**Discussion questions:**

- What detection controls would catch this? (git-secrets pre-commit hook? GitHub secret scanning? Manual review before push?)
- Which of these controls does Tere currently have in place? Which are missing?
- What is the fastest realistic detection path today?

### T+43 minutes — detection

A patient trying to complete triage sees an unusual error and notifies Tere via the support contact. Investigating, the compliance owner sees Bedrock rate-limit errors in Vercel logs and unrecognised requests in AWS CloudTrail. The pattern suggests someone is issuing Bedrock calls from the leaked credential — likely testing what they can do with it before it's revoked.

**Discussion questions:**

- What is the immediate classification? (P0 / P1 / P2?)
- Who is notified first, and how?
- What is the first containment action? Does that action expose any risk of its own? (E.g., rotating the key mid-consultation could interrupt a patient in triage — is that acceptable?)

### T+50 minutes — containment

The compliance owner deactivates the leaked IAM key in the AWS IAM console and generates a new pair. They update the AWS_SECRET_ACCESS_KEY env var in Vercel and redeploy. Total containment time: 7 minutes from detection.

**Discussion questions:**

- Was 7 minutes acceptable? What could reduce it?
- What if the compliance owner had been at the dentist and unreachable for 3 hours? Who takes over?
- How do you verify containment actually worked? What checks should be run?

### T+70 minutes — scope assessment

CloudTrail review shows that the leaked key was used to invoke Bedrock 143 times in the 43-minute exposure window. The queries appear to be exploratory — small `hello world` messages. No queries used Tere's own patient data. However, the attacker did successfully invoke the API, meaning the key was valid and the exposure window was real.

**Discussion questions:**

- Is this a notifiable breach under the Privacy Act 2020? Why or why not?
- Even if not notifiable, what internal-only actions should Tere take?
- Should any patient be told? Any provider? Any sub-processor?

### T+90 minutes — root cause and durable change

The compliance owner traces the leak to:
- No git pre-commit hook prevented the `.env.local` commit.
- The contractor's onboarding did not include a secrets-management briefing.
- The `.gitignore` did include `.env.local` — but the contractor added a file called `.env.local.backup` which was not covered by the ignore pattern.
- The Discord cross-post amplified the exposure; there is no policy governing how contractors discuss their work externally.

**Discussion questions:**

- Which of these four causes is the most durable to fix? Which is the quickest to fix?
- Draft a durable change list: what will Tere ship this week to close the root cause?
- Who is accountable for each item, and by when?

### T+24 hours — post-incident review

A written report is filed capturing the timeline, classification decisions, containment actions, root causes, and durable changes committed. The report is stored access-controlled.

**Discussion questions:**

- What is the format of the incident report? Do we have a template?
- Where is it stored? Who has access?
- If this incident were repeated in three months, how would we recognise that? Would our monitoring catch it, or would we again be relying on a patient reporting an unusual error?

---

## Scenario A — Debrief template

Copy this section into a new dated file (`docs/incidents/tabletop-YYYY-MM-DD.md`) when running the exercise. Fill it in during the debrief.

```markdown
## Tabletop debrief — YYYY-MM-DD

**Participants:** [names]
**Facilitator:** [name]
**Scenario:** A (Provider credential exposed in a public GitHub commit)

### What went well
- 
- 

### Gaps identified
- 
- 

### Durable-change actions committed
| Action | Owner | Target date |
|---|---|---|
|  |  |  |

### Documents that need updating
- [ ] incident-response-plan.md — [changes]
- [ ] disaster-recovery-plan.md — [changes]
- [ ] security-compliance.md — [changes]

### Next tabletop scenario to run
[Scenario B / C / other]
```

---

## Rotating scenarios for future tabletops

Not every tabletop should be Scenario A. Rotate through different classes of incident to stress different parts of the plan.

### Scenario B — LiveKit outage mid-consultation

At 14:20 on a Thursday, LiveKit's global signalling service degrades. Six consultations are in progress; three are mid-video call. Providers see the call drop; patients see connection errors. LiveKit's status page confirms a major incident with no ETA.

*Stresses:* DR plan (Section 5.5), communications during an outage, patient-facing fallback to phone.

### Scenario C — Patient reports seeing another patient's information

A patient completes their consultation and receives their summary email — but the summary contains the clinical details of a different patient. They forward the email to Tere with confusion and concern. Investigation reveals that the notes-generation endpoint accidentally cached a previous consultation's data due to a race condition in the flag system.

*Stresses:* Patient notification, clinical governance escalation, code-level root cause investigation, HDC and OPC notification thresholds for a "small blast radius but very high harm" event.

### Scenario D — AWS Bedrock returns unexpected content

During a consultation, a provider clicks "Generate Notes" and the returned note contains fabricated clinical information not present in the transcript — a hallucination that appears convincingly plausible but is incorrect. The provider catches it during review. What if they hadn't?

*Stresses:* AI safety guardrails, `ai_notes_enabled` kill switch, clinical governance escalation, patient impact assessment, whether this is a security incident (arguably not) or a clinical governance issue (arguably yes) — the two processes must interface cleanly.

### Scenario E — Ransomware note appears on a clinician workstation

A consulting clinician working from home boots their laptop and sees a ransomware note. They notify Tere immediately. Their laptop is their personal device — but they were signed into Tere on it and have accessed patient records within the last week.

*Stresses:* Bring-your-own-device policy (or lack of one), device-level compromise vs. account-level compromise, scope-of-access review, patient notification thresholds when compromise is possible but not confirmed.

---

## Committed cadence

- **First tabletop:** Run Scenario A within one month of this document's publication.
- **Second tabletop:** Rotate to Scenario B, C, D, or E within six months.
- **Every tabletop:** Debrief is written up and stored in `docs/incidents/`. If the debrief identifies changes to any of the compliance documents, those changes ship as a commit before the next tabletop.

---

## Change History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-07-08 | Patrick Herling | Initial tabletop exercise scenario drafted alongside the Incident Response Plan. Scenario A ready to run. |
