# Provider competency framework — competence-to-roster gate

**Owner:** Clinical lead + CMO
**Applies to:** Every provider before solo rostering + at annual review
**Governance:** Standing CGM agenda item (§9 of Clinical Governance Framework)

## Why this exists

MCNZ registration + in-scope APC confirms a provider is **allowed** to practise. This document defines what makes a provider **competent to safely triage undifferentiated acute presentations by video** at Tere Health specifically. HDC + MCNZ both expect this level of scope-of-clinical-practice definition for a service like this.

Before a provider is moved from `probationary` to `full_roster` status, every required competency below must have a `competent` assessment on file.

## Provider lifecycle

| Status | What it means |
| --- | --- |
| `onboarding` | No clinical roster access. Sandbox / training only. Default for new hires (task #327). |
| `probationary` | Can consult, but every consult supervised. Min 5 supervised consults before graduation. Provider row: `probation_started_at` set, `probation_supervised_completed` counted. |
| `full_roster` | Solo rostering permitted. All required competencies signed off. Reviewed annually. |
| `restricted` | Reduced scope (e.g. no controlled prescribing, no paeds, no ACC). |
| `suspended` | Temporary hold after incident / concern. CMO to review. |

The `providers.competency_status` column enforces this. UI banners on the queue prevent a `probationary` provider from being assigned unsupervised.

## Required competency domains

Each competency has a key (used in `provider_competencies.competency_key`) and a label. Assessment via combination of case scenarios, supervised-consult observation, and reflective discussion at CGM.

### Core clinical

- **`video_consult_undifferentiated_acute`** — Video-consult undifferentiated acute presentation. Ability to elicit history, screen for red flags, decide disposition (proceed / divert / 111) under video constraints.
- **`red_flag_recognition`** — Recognition of the 24-phrase divert set (task #430) + broader red-flag literacy beyond the keyword list.
- **`safety_netting_documentation`** — Ability to produce presentation-appropriate return advice; reviewed via safety-netting peer-review CGM (task #433).
- **`escalation_handoff_111`** — Correct escalation flow (task #420): geolocation capture, staying on call until dispatch, outcome recording.
- **`continuity_gp_handover`** — GP letter workflow (task #421); recognition of the no-GP patient + Section 22F export.

### Prescribing

- **`prescribing_general`** — NZ prescribing law, NZULM familiarity, PBS quantities.
- **`prescribing_class_c_controlled`** — Class C controlled prescribing per Medsafe (task #196–#199).
- **`prescribing_pattern_recognition`** — Ability to recognise + respond to prescribing safety guard blocks (task #423).

### Cultural + population

- **`cultural_safety_maori`** — Cultural safety attestation (task #400) + demonstrated understanding at CGM discussion.
- **`interpreter_use`** — Correct interpreter escalation (task #436); avoids family_member sources except with documented justification.
- **`safeguarding_recognition`** — Recognition of child + dependent-adult safeguarding concerns; Oranga Tamariki mandatory reporting pathway (task #434 runbook).

### ACC + regulatory

- **`acc_workflow`** — ACC eligibility, injury coding, WC / RTW / ACC46 workflows.
- **`hdc_code_of_rights`** — Working knowledge of all 10 Rights and application in consult decisions.
- **`hdc_complaint_response`** — Complaint acknowledgement + response within 20 working days (task #361).

### Governance participation

- **`cgm_participation`** — Regular attendance at CGM + willingness to bring cases for review.

## Assessment process

1. **New hire** enters `onboarding` status — sandbox only.
2. **Sandbox complete** (task #327 checklist ticked) → moved to `probationary`. `probation_started_at` recorded.
3. **Probationary period** — every consult is supervised (currently means supervisor available by phone; may progress to real-time observation if concerns). Supervisor logs supervised_consults count.
4. **Minimum 5 supervised consults** completed → CMO reviews. Discusses each competency domain. Assessor records `competent` / `in_training` / `not_competent` for each in `provider_competencies`.
5. **All required competencies competent** → `full_roster`. Solo rostering unlocked.
6. **If any competency `in_training` or `not_competent`** → remain `probationary`. Additional supervised consults + focused development. Re-review at next CGM cycle.

## Annual review

Every provider re-reviewed annually:
- All competencies re-attested (some may auto-carry-forward with no incident; others require refresh).
- `next_review_due_at` set 12 months forward.
- CGM standing item — anyone overdue banner-flagged.

## Restricted scope

If a competency is not-competent but others are, provider may work in `restricted` status. Restrictions must be enforced technically:
- No controlled prescribing → allowlist blocks it at prescribe time
- No paediatric consults → queue filter excludes
- No ACC → ACC modal blocks conversion

Restrictions documented on the provider row + visible on their profile.

## Suspension

After any significant incident (patient harm, safeguarding failure, unauthorised access, competency concern raised at CGM), CMO may set `suspended`. All roster access removed pending review. Suspension outcomes: reinstatement, restricted scope, or termination.

## Related

- Tasks: #290 (patient_access_from gate), #327 (sandbox), #384 (annual PHI training), #400 (cultural safety training)
- Runbooks: `child-safeguarding-oranga-tamariki-runbook.md`
- Schema: `supabase/2026-09-03_provider_competency.sql`

## Version

v1.0 · 2026-09-03 · Task #435 · Signed off by CMO
