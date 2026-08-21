# Tere AI Triage Classifier — WAND Notification Decision

**Date:** 2026-08-21
**Decision:** Not notified on WAND.
**Made by:** Dr Patrick Herling, D.O. (Founder / CMO, Tere Health Ltd)

## Context

Tere's AI triage flow captures patient history and chief complaint at
intake and produces (a) a structured summary for the reviewing clinician
and (b) surface-level red-flag alerts for patient safety (e.g. chest pain
with associated features, sudden severe headache, etc.).

The question is whether this component constitutes Software as a Medical
Device (SaMD) under the IMDRF framework adopted by Medsafe, requiring
notification via WAND.

## Reasoning for not notifying

The AI triage classifier is treated as **decision support that is always
clinician-mediated**, not as an autonomous diagnostic device:

1. **Output is informational, not decisional.** The classifier does not
   admit, refer, prescribe, treat, or otherwise act on the patient. All
   clinical decisions are made by the reviewing clinician.
2. **Clinician review is unconditional.** Every triage output is
   reviewed by a licensed clinician before the consult begins. There is
   no pathway by which a patient receives care based on the classifier's
   output without clinician review.
3. **Red-flag alerts are advisory.** They surface potential safety
   concerns to both patient and clinician, but do not gate care or
   modify the workflow autonomously.
4. **Analogous to intake questionnaire + summary tool**, not to a
   diagnostic algorithm. Traditional intake forms and clinician-facing
   summary tools are not classified as SaMD in NZ.

## Why the drug interaction check is on WAND but this is not

The drug interaction / allergy cross-check (WAND `260821-WAND-78BC2U`,
Class I) is notified because it produces alerts **at the point of a
clinical action** (prescribing) that can materially affect patient
safety in a specific and predictable way (allergen or interaction
match). The triage classifier operates upstream of any clinical
decision and its output is not tied to a specific clinical action by
the software itself.

## Compensating safeguards

- Every triage output is reviewed by a licensed clinician before the
  consult begins.
- Red-flag detection is bilingual and never suppressed regardless of
  the patient's chosen language (see task #20).
- Safety flags and clinical reasoning suggestions are stripped from
  clinician-facing notes to prevent the AI from being treated as the
  authoritative source (task #46).
- Consent copy makes clear that triage is a tool to help the
  clinician, not a substitute for clinical assessment.

## Review triggers

This decision should be revisited if any of the following change:

- The classifier is used to route patients autonomously (skip triage
  review, direct-to-Rx, etc.)
- The classifier's output is presented as diagnostic rather than
  informational
- Regulators (Medsafe or otherwise) publish guidance that clarifies
  triage AI as in-scope for notification
- A different jurisdiction we operate in (US, AU) treats it as SaMD

## Related records

- Vitals estimator WAND: `260729-WAND-786DQ9` (Class IIa, Active)
- Drug interaction WAND: `260821-WAND-78BC2U` (Class I, Active)
- Task #288: SaMD assessment (drug interaction done, triage declined per this memo)
