# Clinical Governance Framework — Tere Health Ltd

**Version:** v1.0 (draft) · **Date:** 3 September 2026
**Clinical accountable:** Dr Rachel Thomas, FACEM — Medical Director
**Executive accountable:** Dr Patrick Herling — Chief Medical Officer
**Status:** DRAFT — Rachel to review + adopt at first clinical governance meeting

Clinical governance is the system by which Tere Health assures quality and safety of care. This document describes how we govern clinical practice at our current stage (2026, 2-clinician team, scaling to ~10 over 2027).

---

## 1. Purpose

- Provide safe, effective, and equitable telehealth care.
- Continuously improve quality through structured review of care, outcomes, complaints, and adverse events.
- Ensure every clinician working under Tere is credentialled, supervised where required, and supported.
- Meet regulator expectations (MCNZ, NCNZ, HDC, ACC, Medsafe, HNZ).

## 2. Governance structure

### 2.1 Medical Director (Rachel Thomas, FACEM)
- Clinically accountable for the standard of care.
- Chairs the monthly Clinical Governance Meeting.
- Approves new clinical policies + procedures.
- Sign-off on scope changes to AI/decision-support features.
- First responder to serious adverse events.

### 2.2 Chief Medical Officer (Patrick Herling)
- Operationally accountable for the platform.
- Runs incident response for privacy/security events.
- Regulator liaison (HDC, HNZ, ACC, MCNZ correspondence).
- Ensures governance decisions are implemented in the platform.

### 2.3 External advisors (target: end 2027)
- **Māori clinical advisor** — cultural safety review, Te Tiriti obligations.
- **Independent clinical ethics advisor** — ethics policy review, complex-case consult.
- **Consumer representative** — patient voice on Tere-facing decisions.

## 3. Clinical Governance Meeting

### 3.1 Cadence
- Monthly, first Tuesday, 12:00 NZT, 60 min.
- Held by video (Tere's own platform).
- Minutes stored in `docs/governance/YYYY-MM-clinical-gov-minutes.md`.

### 3.2 Standing agenda
1. **Safety review** — every SAC1/SAC2 incident + every complaint since last meeting.
2. **Quality metrics** — completion rate, no-show rate, ACC mix, average consult duration, adverse-event rate (from VendorSlaMetrics + ComplaintThemesPanel).
3. **Peer review sampling** — 3-5 randomly-selected consults reviewed (from PeerReviewPanel).
4. **New policy/procedure** — anything Rachel is proposing.
5. **Regulator + external correspondence** — HDC, HNZ, ACC, MCNZ, Medsafe.
6. **Provider matters** — new hires, offboardings, credentialling changes, supervision status.
7. **Actions from last meeting** — status.
8. **Any other business.**

### 3.3 Decisions
- Consensus preferred; where Rachel + Patrick disagree, Rachel decides on clinical matters, Patrick on operational.
- Material decisions logged in minutes with owner + due date.

## 4. Credentialling

### 4.1 Onboarding checklist (per provider)
Every provider before their first patient consult:
- [ ] MCNZ (or NCNZ) registration number verified against the online register.
- [ ] Current APC on file; expiry captured in `providers.apc_expiry_date`.
- [ ] Scope of practice matched to consult types they can accept.
- [ ] HPI-CPN validated (Mod-11 check digit) + captured in `providers.hpi_number`.
- [ ] Supervision plan in place if provisional-vocational; countersigned by supervisor.
- [ ] MFA enrolled.
- [ ] PHI training attestation completed (`/api/phi-training`).
- [ ] Cultural safety training attestation completed (`/api/cultural-safety-training`).
- [ ] Conflict of interest declaration captured.
- [ ] Sandbox training checklist complete (task #327).
- [ ] Signed employment/contractor agreement + Code of Conduct.

### 4.2 Ongoing
- APC renewals tracked; provider blocked from prescribing 7 days before expiry unless renewed.
- MFA + PHI training + cultural safety training attestations reviewed at quarterly access review cron.
- Supervision plan reviewed 6-monthly by supervisor.

## 5. Peer review

- Every provider's ACC-billed consults are sampled at ~10% quarterly via `PeerReviewPanel`.
- Reviewer records agreement level + notes.
- Any "disagree_major" outcome triggers a case discussion at next Clinical Governance Meeting.
- Reviewers rotated; a provider cannot self-review.

## 6. Serious adverse event handling

See `docs/regulatory/hqsc-ssa-reporting-sop.md`.

Summary:
1. Any staff member identifying an SAC1 or SAC2 event notifies Rachel within 4 hours.
2. Rachel initiates HQSC notification within 15 working days.
3. Root cause analysis within 70 working days.
4. Findings + corrective actions reviewed at Clinical Governance Meeting.
5. Any care-affecting learning fed back into onboarding + training.

## 7. Complaints handling

See existing complaint workflow (task #361) + HDC Advocacy Service reference (task #392).

- Every complaint acknowledged within 5 working days.
- Substantive response within 20 working days (HDC Right 10).
- Complaint themes reviewed quarterly at Clinical Governance Meeting.

## 8. AI + decision-support governance

Any new or materially changed AI feature (triage classifier, note drafting, subtitles, vitals estimation) requires:
1. Documented pre-release evaluation on a held-out test set (bias + accuracy).
2. Rachel's sign-off.
3. WAND self-notification to Medsafe if in scope.
4. Consent capture updates if patient-visible.
5. Model changelog entry (`docs/regulatory/model-changelog.md` — create when first change ships).

## 9. Te Tiriti o Waitangi + equity as a governance function

Cultural safety training is a provider-level control (task #400). This section is the governance-level counterpart — equity treated as a standing accountability of the organisation, not just an individual attestation.

### Te Tiriti commitment

Tere Health operates in Aotearoa New Zealand under Te Tiriti o Waitangi. As a health service predominantly serving rural populations — including a substantial Māori patient cohort — Tere Health accepts an active responsibility beyond passive non-discrimination. Specifically:

- **Tino rangatiratanga** — Māori patients retain authority over their own health information; recognised via HDC Right 6 disclosure logging, per-disclosure consent snapshots (task #351), and patient-facing "who saw my data" view (task #350).
- **Partnership** — engagement with iwi and Māori health leaders on service design decisions that materially affect Māori patients, before those decisions are made rather than after.
- **Equity** — outcome parity, not process equality, is the standard. Where outcomes diverge by ethnicity, that is a governance issue requiring redress.
- **Active protection** — cultural safety, translation, and interpreter access are prioritised expenditures, not discretionary.

### Standing CGM agenda item — Equity Review

Every Clinical Governance Meeting includes an "Equity Review" agenda item. Data reviewed at each cycle:

- **Consult volume by patient ethnicity** — Māori / Pacific / Asian / European / other / undisclosed
- **Divert / 111 rate by ethnicity** — differences flagged for investigation
- **Complaint rate + resolution time by ethnicity** — differences flagged
- **Interpreter request rate + source (task #436)** — track that certified interpreters are being used, not family members
- **Prescribing pattern differences** — controlled substances + antibiotic prescribing rates by ethnicity (bias check)
- **Follow-up completion rate by ethnicity** — safety-netting reviewed for equal quality (task #433 CGM peer-review)
- **Any Māori-patient safeguarding concerns raised (task #434)** — patterns discussed with cultural-safety lens

Minutes of each Equity Review are captured in the CGM meeting log (task #427).

### Māori advisor engagement

- Named Māori advisor is a 2027 hire commitment (see Ethics Policy v1 §6).
- Interim: any service design decision materially affecting Māori patients is presented to at least one Māori clinical peer for review before adoption.
- Advisor sign-off is a prerequisite for Ethics Policy v2.0.

### Data sovereignty

- Māori-patient data governance follows Te Mana Raraunga (Māori Data Sovereignty Network) principles.
- Research uses of Māori-patient data require iwi-organisation engagement (see Ethics Policy v1 §7; HDEC OOS letter 2026-08-03 confirms current VitalsValidate scope does NOT engage this).
- Any future Māori-patient-specific research programme requires a separate consent + governance pathway.

### Te Reo Māori accessibility

- All patient-facing surfaces available in Te Reo Māori (task #17).
- Bilingual red-flag messages regardless of language selection (task #20).
- Provider annual cultural safety attestation (task #400) covers the responsibility for Te Reo-preferred patients.

### Equity outcome-monitoring cadence

Individual reviews happen at each CGM (quarterly minimum). A consolidated annual equity report is generated for the CMO by year-end and provided to any regulator on request.

Where a divergent outcome is identified, the response follows the standard governance improvement cycle: investigate → discuss at CGM → corrective action → measure at next cycle.

## 10. Regulator engagement

- **MCNZ** — Rachel + Patrick each maintain own APC and CPD; supervision plan filed with MCNZ.
- **NCNZ** — activated once NP hire completes.
- **HDC** — complaint responses per §7; annual complaint themes report ready if requested.
- **HNZ (Te Whatu Ora)** — HPI compliance IN-3502 (closed 2026-09-03); NHI/NZePS/MWS pending.
- **ACC** — vendor G11238 in good standing; audit bundle available on demand.
- **Medsafe** — CARM reports per SOP; Controlled Drugs Register available.
- **HQSC** — SAC1/SAC2 events reported per SOP; annual submission of quality data (once volume warrants).

## 11. Review cycle

- This framework reviewed annually by Rachel + Patrick.
- Interim updates for any material clinical or regulatory change.
- Version-controlled in this repo.

## Change log

- 2026-09-03 — v1.0 draft.
- 2026-09-03 — v1.1: §9 expanded to Te Tiriti / equity as a governance function (task #438). Standing "Equity Review" CGM agenda item with defined metrics; data sovereignty per Te Mana Raraunga; annual equity report to CMO.
