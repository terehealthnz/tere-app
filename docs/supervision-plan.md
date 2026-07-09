# Tere Health — RMO Supervision Plan

**Supervisor:** Dr Rachel Thomas · MCNZ Prescriber #_______ · CPN _______
**Supervisor scope:** Vocationally registered (specialty: _______)
**Practice:** Tere Health Limited · terehealth.co.nz · Marlborough Sounds, New Zealand
**Plan version:** v2 · 2026-07-08
**Review cycle:** Reviewed with the RMO at 3 months and 6 months, then annually. Amendments filed with MCNZ within 14 days of change.

---

## 1. Named parties

| Field | Value |
|---|---|
| **RMO name** | _______________________________ |
| **MCNZ registration number** | _______________ |
| **Scope of practice held** | ☐ Provisional General ☐ General (supervised) ☐ Provisional Vocational (specialty: ____) |
| **PGY level at supervision start** | PGY __ |
| **Supervision start date** | _____ / _____ / 20_____ |
| **Supervision end date (planned)** | _____ / _____ / 20_____ (or until MCNZ removes the supervised-scope condition) |
| **Named supervisor** | Dr Rachel Thomas |
| **Frequency of scheduled review meetings** | Weekly for first 3 months, then fortnightly. Duration ~45 minutes. |
| **Reachability during shifts** | Supervisor is **contactable by mobile phone (text or voice call)** for the duration of every RMO shift. The supervisor does not need to be actively logged in to Tere or seeing patients themselves — the standard is the same as an ER attending being on-call for the resident on the floor. Target response time to a clinical question: **≤5 minutes**. RMO holds any escalation-tier consult decision (§2) until the supervisor responds. |
| **If supervisor is unexpectedly unreachable** | If the supervisor cannot be reached within 15 minutes for a non-emergency question, the RMO defers the escalation-tier decision and reschedules or refers the patient. Planned periods where the supervisor will not be reachable (e.g. supervisor annual leave) are scheduled in advance and the RMO does not roster shifts across those windows. |

---

## 2. Scope of independent practice

The RMO may take the following presentations without discussing them with the supervisor beforehand:

**Approved for independent practice** (recorded in `providers.supervision_scope.solo_ok`):

- Uncomplicated URTI / sore throat / otitis media in patients ≥5 years
- Uncomplicated gastroenteritis in patients ≥5 years
- Uncomplicated UTI in non-pregnant women aged 16–65
- Simple soft-tissue injuries (sprains, minor lacerations without tendon or nerve involvement)
- Repeat prescriptions for stable, previously-prescribed medications on the approved list

**Bring to the next review meeting** (recorded in `providers.supervision_scope.review_at_meeting`):

- Any new prescription for antibiotics of a class not previously used in the RMO's caseload
- Any ACC claim lodgement
- Any medical certificate for >3 days off work
- Any patient <5 years or ≥75 years
- Any patient with active cancer, transplant, or immunosuppression documented in triage
- Any patient escalated from Tere's async messaging service

These consults are not held or countersigned at time of finalisation — the RMO finalises the note as normal and brings the case to the scheduled review meeting (§5) for supervisor discussion. Notes are recorded in the meeting log so MCNZ can see the review actually happened.

**Requires escalation before decision — do not close consult** (recorded in `providers.supervision_scope.escalate_immediately`):

- Chest pain, cardiac-sounding symptoms, or new arrhythmia
- Stroke-suggestive presentation (facial droop, arm weakness, speech disturbance)
- Suicidal ideation with plan or intent, or acute psychosis
- Suspected sepsis or meningitis
- Paediatric patient <2 years with any acute presentation
- Any prescription for controlled drugs, benzodiazepines, opioids, GLP-1s, stimulants, or hypnotics (**absolute block enforced in the Prescribe modal; app returns "requires supervisor approval"**)
- Any consult where the RMO judges the presentation exceeds their competence

Scope may be broadened or narrowed at any review meeting. Changes are recorded in the review log (§5) and mirrored in `providers.supervision_scope`.

---

## 3. Supervisor contactability

The MCNZ standard for RMO supervision is that the named supervisor is **contactable** while the RMO is practising — not that the supervisor is themselves seeing patients on the same platform at the same time. This mirrors how supervision works in a hospital ED, where the resident staffs the department while the attending is on-call.

The Tere Health app supports this by:

- Displaying the supervisor name and mobile number on the RMO's dashboard whenever they are logged in.
- Recording the RMO's shift attestation ("I have confirmed my supervisor is reachable by phone for this shift") when the RMO toggles available for the first time in a session.

The app does **not** couple the RMO's availability to the supervisor's `is_available` toggle. The supervisor may be off-platform (asleep, on call from another hospital, on their own consult, etc.) — what matters is that they answer their phone within the agreed response time.

---

## 4. Prescribing restrictions

The Prescribe modal in the app is scoped by the RMO's `providerCanPrescribe` and `providerType` session flags:

- All controlled drugs, opioids, benzodiazepines, GLP-1 receptor agonists, stimulants and hypnotics are hard-blocked at the modal level for every provider on Tere, including the supervisor (existing NZ telehealth-standards enforcement).
- The RMO's `supervision_scope.escalate_immediately` list (§2) is enforced client-side on the Prescribe and Med-cert modals: if the RMO attempts a restricted category, the modal blocks the action with the message "requires supervisor approval — please discuss before finalising."

---

## 5. Scheduled review meetings

Meetings are logged via the **Supervision reviews** tab on the supervisor's dashboard (**+ New review log** button). Each entry captures:

- Meeting date
- Duration (minutes)
- Cases reviewed (jsonb array of consultation IDs with per-case notes)
- Concerns raised (near-misses, prescribing patterns, escalation delays)
- Actions agreed (learning plan, follow-up review dates, scope changes)

Rows land in the `supervision_reviews` table with `rmo_id`, `supervisor_id`, and `created_by` for the audit trail. This is the primary MCNZ-facing audit artefact for the supervision arrangement — it demonstrates that the supervisor is actively reviewing the RMO's practice at the agreed cadence.

**Cadence:**
- **Weekly** during the first 3 months
- **Fortnightly** thereafter until the RMO holds an unsupervised general scope
- **Immediate** ad-hoc review meeting is scheduled after any clinical concern is raised by a patient, colleague, or auditor

**What the meeting covers:**
- All consults from §2's *bring to the next review meeting* list since the last meeting
- A random sample of routine consults (supervisor's choice)
- Any concerns the RMO wants to raise
- Feedback on prescribing patterns, referrals, ACC claims

**Audit exports:** MCNZ or an external auditor can be shown the full `supervision_reviews` history via a database export. The RMO also has read access to their own review log through the RMO's Menu → Supervision panel.

---

## 6. Escalation pathway during shifts

If the RMO needs to escalate mid-consult, they:

1. **Text first:** send an SMS with the consultation ID and a one-line summary to the supervisor's mobile number (visible on the RMO's Menu → Supervision panel).
2. **Call if no response within 3 minutes:** phone the supervisor's mobile.
3. **Hold the consult:** the RMO does not close the consult, prescribe, or set a plan until the supervisor responds. If the patient is unstable or emergency-triggered, the RMO refers to 111 immediately and documents the escalation.

If the supervisor cannot be reached within 15 minutes for a non-emergency question, the RMO defers the escalation-tier decision and reschedules or refers the patient. Planned supervisor unavailability (e.g. annual leave) is agreed in advance and the RMO does not roster shifts across those windows.

---

## 7. When supervision ends

Supervision continues until MCNZ removes the supervised-scope condition from the RMO's registration. At that point:

- `providers.provider_type` is set to `senior`
- `providers.supervisor_id` is set to `NULL`
- `providers.supervision_scope` is set to `{}`
- The RMO's Tere dashboard stops showing the supervisor contact panel and the shift-start attestation
- Historical `supervision_reviews` rows are retained indefinitely for audit purposes

The supervisor files a **final supervision report** with MCNZ within 30 days of the change, summarising the review log and any performance concerns.

---

## 8. Signatures

**RMO** — I have read this supervision plan, agree to work within its stated scope, and understand the escalation and review-meeting requirements.

Signature: _______________________________  Date: __________

**Supervisor** — I accept responsibility for the supervision arrangement described above.

Signature: _______________________________  Date: __________

**Tere Health Ltd** (director attest)

Signature: _______________________________  Date: __________

---

*This document is filed with the Medical Council of New Zealand as part of the RMO's supervised-scope registration. A signed copy is retained by both parties and by Tere Health Limited.*
