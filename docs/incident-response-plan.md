# Tere Health — Incident Response Plan

**Document version:** 1.0
**Date:** 2026-07-08
**Owner:** Patrick Herling (Chief compliance contact)
**Review cadence:** Every six months, or after any material incident
**Companion documents:** [`security-compliance.md`](./security-compliance.md) Section 10 (Breach Response), [`disaster-recovery-plan.md`](./disaster-recovery-plan.md)

---

## Purpose

This document is Tere Health's operational playbook for responding to security incidents — events that may have compromised the confidentiality, integrity, or authorised use of patient health information or Tere Health systems.

**This document is not:**
- A DR playbook — availability outages without a security angle are handled by [`disaster-recovery-plan.md`](./disaster-recovery-plan.md).
- A clinical incident policy — clinical adverse events, complaints, and HDC-notifiable clinical events are handled by separate clinical governance processes.

**This document is:**
- The step-by-step response to unauthorised access, PHI leak, credential compromise, malware, or suspicious activity in Tere systems.
- The authoritative process for deciding whether a notifiable privacy breach has occurred and how to notify the Office of the Privacy Commissioner (OPC) and affected individuals.

---

## 1. Incident Classification

Not every security event requires the same response. Incidents are classified before response, and classification can change during investigation.

| Class | Definition | Examples | Response tier |
|---|---|---|---|
| **P0 — Critical** | Confirmed or strongly suspected PHI compromise affecting one or more identifiable patients | Confirmed unauthorised access to consultations table, published patient data, ransomware with data exfiltration | Full IR — Section 3 |
| **P1 — High** | Credential compromise or system compromise with potential to reach PHI, no confirmed exposure yet | Provider PIN leaked, AWS access key exposed, phishing successful against a clinician account, suspected but unconfirmed intrusion | Full IR with abbreviated notification track |
| **P2 — Medium** | Security event with no PHI exposure and no credential compromise, but requires investigation | Suspicious login attempts, unexpected error rate suggesting probing, malware alert on a non-Tere system used by a clinician | Investigate and document; no OPC notification unless upgraded |
| **P3 — Low** | Security-adjacent event that is fully contained by existing controls | Rate-limit trigger from a bot, blocked injection attempt, expired certificate before it caused an outage | Log only; no active IR |

---

## 2. Detection Sources

Incidents can be detected through:

- **Automated alerts** — the failed-authentication alarm (10+ failed provider auth attempts in one hour) or Sentry error spikes.
- **`/api/status` health check** returning degraded state.
- **Sub-processor notification** — AWS, Supabase, or Vercel formally notifying Tere of an incident under their contractual obligations.
- **Patient or provider report** — a clinician noticing unfamiliar data in their view, a patient reporting they received someone else's information.
- **Internal review** — audit log review turning up something anomalous.
- **External researcher** — a security researcher responsibly disclosing a vulnerability.

Any detection source can raise a P0 or P1 event. There is no threshold for reporting — err on the side of investigating.

---

## 3. Response Process (P0 and P1)

The process runs in four phases. Do not treat these as strictly serial — communications and containment often happen in parallel.

### Phase 1 — Detect and triage (target: within 15 minutes of detection)

1. **Log the event** in the incidents register (`incidents` table in Supabase, or a plain text log if the system itself is compromised).
2. **Classify** using Section 1. Start conservatively — classify up if unsure.
3. **Notify the compliance owner immediately** by phone. Do not wait for an email response.
4. **Preserve initial evidence** — screenshot the alert, save the log excerpt, note the exact timestamp of detection.

### Phase 2 — Contain (target: within 60 minutes)

Containment is about stopping ongoing damage. It happens before investigation because letting the incident continue while investigating makes it worse.

Choose the smallest containment action that stops the damage. Escalate if the smaller action is insufficient.

| Situation | Containment action |
|---|---|
| Provider credential compromise | Deactivate the provider row (`is_active=false`); force re-login of all sessions by rotating the session-storage cookie signing key if applicable |
| API key or IAM credential compromise | Deactivate the credential in the sub-processor console; generate replacement; rotate in Vercel; redeploy |
| Suspected code-level vulnerability being actively exploited | Flip the affected feature flag off (e.g. `ai_notes_enabled`); if the vulnerability is more fundamental, deploy a hotfix that disables the affected endpoint |
| Confirmed data exfiltration in progress | Rotate all secrets, force logout all sessions, temporarily disable public write endpoints while investigating |
| Confirmed physical device compromise (stolen laptop with active session) | Deactivate that provider's row; contact the affected patients from any consultations the stolen device could see |
| Malware suspected on a clinician workstation | That clinician stops using Tere immediately; deactivate their row until the workstation is cleaned or replaced |

### Phase 3 — Investigate (target: initial scope assessment within 24 hours)

Investigation runs in parallel with notification if the incident is confirmed P0 or P1.

1. **Establish the timeline** — when did the incident start, when was it detected, when was it contained.
2. **Establish the scope** — how many patient records were affected, which fields, whether any left Tere control, whether any were viewed by unauthorised persons.
3. **Establish the cause** — root cause, not just proximate cause. "The credential was leaked" is proximate; "we don't have a written process preventing credentials from being pasted in chat" is root.
4. **Preserve evidence** for possible OPC review — full log exports, credential-rotation timestamps, containment action timestamps.
5. **Involve sub-processors** if their platform was part of the incident. AWS, Supabase, Vercel all have incident-response contacts.

### Phase 4 — Notify, remediate, review (target: OPC within 72 hours of confirmation of a notifiable breach)

**Notifiable breach criteria under the Privacy Act 2020:**
- A breach is notifiable if it has caused, or is likely to cause, **serious harm** to any affected individual.
- Health information is generally treated as high-risk; unauthorised disclosure of health information will meet the notifiable threshold in most cases.
- The compliance owner makes this determination, consulting external legal advice for edge cases.

**If notifiable:**

1. **Notify the Office of the Privacy Commissioner** via [privacy.org.nz/breach-notification](https://www.privacy.org.nz/) within 72 hours of confirming notifiability. Include:
   - Nature of the breach (what happened)
   - Categories of information affected (health information, contact information, etc.)
   - Approximate number of affected individuals
   - Actions taken to contain and remediate
   - Actions individuals should take
2. **Notify affected individuals** as soon as practicable via the most direct available channel — email if held, SMS if not, phone if the incident is serious enough to warrant it. Do not delay notification while polishing wording.
3. **Notify HDC** if the incident may amount to a Code of Rights breach.
4. **Consider media response** — for large-scale incidents, prepare a public statement.

**In all incidents (notifiable or not):**

1. **Remediate the root cause.** Ship the code, policy, or process change that prevents recurrence.
2. **Update this document, the DR plan, or the security-compliance doc** to reflect the lessons learned.
3. **Post-incident review** — written report filed in `docs/incidents/` (create the directory when the first incident occurs; keep individual reports confidential and access-controlled).

---

## 4. Response Process (P2 and P3)

Lighter-weight than P0/P1 but still deliberate.

1. **Log the event** with detection source, classification rationale, and investigator name.
2. **Investigate** to confirm the classification stands. If any evidence suggests upgrading to P1 or P0, upgrade immediately and switch to the full IR process.
3. **Document the outcome** in the incidents log.
4. **P2 only:** monthly review of P2 events for patterns that might indicate an underlying issue (e.g. repeated failed logins from a specific region might indicate targeted probing).

---

## 5. Roles and Responsibilities

At Tere's current scale, most roles are held by the compliance owner. This is documented as a weakness in the DR plan.

| Role | Held by | Responsibilities |
|---|---|---|
| **Incident Commander** | Compliance owner | Overall coordination, classification decisions, notification decisions, external communications |
| **Technical Lead** | Compliance owner (same person currently) | Executes containment and investigation |
| **Legal / Privacy contact** | External counsel on retainer (not yet appointed at scale) | Advises on notification thresholds and wording |
| **Clinical Governance Lead** | Consulting clinicians (currently Medical Director) | Advises on clinical impact of incidents affecting the clinical service |
| **Communications** | Compliance owner | Public statements, patient notification, media response |

---

## 6. Escalation Contacts

Maintained separately from this document in a secure location for security reasons.

**Category** → **What to have ready:**

- **Sub-processor incident channels:** AWS Support (with premium support level appropriate to Bedrock usage), Supabase support portal, Vercel support portal, HealthLink support once NZePS integration is live.
- **Legal:** Retainer relationship with a NZ-based privacy/health law firm — establish before first PHO contract.
- **Insurance:** Cyber liability insurance — evaluate coverage before first PHO contract.
- **Regulatory:** Office of the Privacy Commissioner — public breach reporting form. HDC complaints form. Ministry of Health if HPI-related.
- **Communication tools:** A private Signal group for the clinical team, tested to be reachable during incidents where email/Slack might be affected.

---

## 7. Templates

### 7.1 Initial detection log entry (fill in at Phase 1)

```
Incident ID:            IR-YYYYMMDD-NNN
Detected at:            YYYY-MM-DD HH:MM NZT
Detected by:            [name / system / patient report]
Detection source:       [alarm / log / report / other]
Initial classification: [P0 / P1 / P2 / P3]
Initial symptom:        [one paragraph]
Containment actions started at: [timestamp]
```

### 7.2 Notification to affected patient (P0 template)

> Kia ora [name],
>
> We are writing to inform you of a privacy incident affecting your Tere Health record.
>
> On [date], we became aware that [brief factual description of what happened]. This incident affected [specific fields of your record].
>
> We have taken the following steps: [containment actions in plain language].
>
> The steps we recommend you take are: [any actions the patient should take].
>
> We have also notified the Office of the Privacy Commissioner. If you have any questions, please contact us directly at patrickherling@gmail.com or through the Privacy Commissioner at privacy.org.nz.
>
> We take our responsibility to protect your health information seriously and are sorry that this incident has occurred.
>
> Ngā mihi,
>
> Patrick Herling
> Chief compliance contact, Tere Health Limited

### 7.3 Notification to Office of the Privacy Commissioner (OPC)

Use the standard OPC online breach notification form. Have this document open when completing so all required fields can be answered from Section 3 above.

### 7.4 Full incident report (post-incident, filed within 5 working days of resolution)

Filed as `docs/incidents/incident-YYYY-MM-DD-NNN.md`. Confidential — repo access only.

```markdown
# Incident Report — [Incident ID]

## Executive summary
[3-4 sentences: what happened, what was affected, what was done, current status]

## Classification
Final classification: [P0/P1/P2/P3]
Classification changes during response: [any upgrades or downgrades and why]

## Timeline
| Time | Event |
|---|---|
| T+0 | [detection or actual start, whichever earlier] |
| T+N | [key events] |
| T+resolved | [containment complete] |
| T+report | [this report filed] |

## Scope
- Data types affected: [PHI categories, credentials, systems]
- Number of records affected: [best estimate + basis]
- Individuals affected: [count + how identified]
- Geographic scope: [NZ only, or other]

## Containment actions taken
1. [action + timestamp + who]
2. ...

## Investigation findings
- Root cause(s): [proximate + underlying]
- Attack vector or failure mode: [technical description]
- Prior similar incidents: [reference IDs if any]

## Notification decisions
- OPC: [notified / not notified + rationale]
- Affected individuals: [notified / not notified + method]
- HDC: [applicable / not]
- Sub-processors: [notified / not + which]

## Durable changes committed
| Change | Owner | Target date | Status |
|---|---|---|---|
|  |  |  |  |

## Documents updated
- [ ] IR plan
- [ ] DR plan
- [ ] Security & compliance doc
- [ ] Other

## Follow-up review date
[Date at which durable-change actions are audited for completion]
```

---

## 8. Learning from Incidents

The most valuable output of any incident is a durable change to prevent recurrence.

- Every incident report must include a "durable change" section — the specific code change, policy update, or process addition that closes the root cause.
- Durable changes are tracked in the engineering roadmap and given target dates.
- If an incident is a repeat of an earlier one, that is treated as its own root cause — the earlier "durable change" was not durable enough.

---

## Change History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-07-08 | Patrick Herling | Initial IR plan drafted alongside the security-compliance document. |
