# SaMD Regulatory Classification — brief for regulatory-affairs advisor

**Draft, 2026-09-03. Task #439.** For sending to a NZ regulatory-affairs advisor (e.g. NDA New Zealand, Regulis, or a MedTech consulting firm).

---

## The question

Does Tere Health's AI triage engine — used to assess patient-reported symptoms and drive divert / 111-escalation decisions — meet the definition of Software as a Medical Device (SaMD) under the New Zealand therapeutic-products regime?

## Context on what the AI actually does

Tere Health operates a video-based telehealth service at terehealth.co.nz. Before a patient reaches a clinician, they complete an AI-driven chat triage (`AITriage.jsx`). The AI:

1. **Collects structured triage data** — name, DOB, phone, address, chief complaint, medical history, medications, allergies, ACC eligibility, pharmacy, GP.
2. **Runs keyword-based safety detection** on every user message:
   - **`checkPhysicalEmergency`** — chest pain, breathing difficulty, stroke, unconscious, major bleed, allergic reaction. YES → routes to a 111 screen (patient does not proceed to consult).
   - **`checkMentalHealthCrisis`** — self-harm ideation. YES → routes to 1737 / crisis screen.
   - **`checkAddiction`** — alcohol/drug dependence keywords. YES → routes to Alcohol Drug Helpline.
   - **`checkDivert`** (task #416/#430) — 24 phrases covering 8 divert categories (paediatric fever <3mo, thunderclap headache, head injury with features, pregnancy complications, suspected fractures, sudden severe localised pain, new neuro symptoms, self-harm not-yet-acute). YES → routes to an amber divert screen recommending in-person care.
3. **Uses Claude Sonnet via AWS Bedrock Sydney (BAA-covered)** for a downstream note-generation step after the video consult — this drafts clinical notes from the transcript for the provider to review + finalise. The provider is always the responsible clinician.
4. **Does NOT diagnose, prescribe, or make treatment recommendations to the patient**. The keyword detection is a routing layer, not a clinical decision.

The vitals-capture path (heart rate, SpO2, RR from rPPG) has its own separate WAND certificate — cert **260729-WAND-786DQ9**, active — held by Tere Health for the vitals component. That doesn't cover the triage engine.

## Our current assumption (which we want tested)

We currently classify the triage engine as **decision support for the clinician**, not a medical device — on the basis that:

- It doesn't diagnose or recommend a diagnosis.
- Every escalation routes to human care (111, in-person, or Tere clinician).
- Its "decisions" are routing / disposition, not clinical.
- The clinician always makes the actual clinical decision.

We're aware regulators internationally are increasingly probing "our AI just supports the clinician" as a framing. We want an outside opinion before we assume this holds in NZ.

## What we specifically want your view on

1. **Under Medsafe's current interpretation** of the Medicines Act 1981 / therapeutic-products regime, and any relevant HISO or MoH digital-health guidance, does an AI triage engine that autonomously routes patients to 111 / in-person / video pathways meet the SaMD definition?

2. If yes — **what classification tier** would you expect it to fall under (IMDRF categorisation A/B/C/D based on healthcare situation × information significance), and what would that trigger in terms of QMS, clinical validation, post-market surveillance, and change-control obligations?

3. **What documentation would we need to produce now** to defend the current position (if defensible) — versus initiate a classification submission (if needed)?

4. **Post-Therapeutic-Products-Act 2023** (once commenced) — does the answer change materially, and by when should we expect commencement to impact us?

5. **Insurance angle** — does the SaMD classification (or lack thereof) affect our PI + Cyber cover, and should we surface this to underwriting during renewal?

## What we have already in place if useful

- WAND cert for vitals scope (HR + SpO2 + RR only)
- Full patient protections review PDF (`~/Downloads/Tere_Health_Patient_Protections_Review.pdf`) — 47 preemptive + 39 audit controls with regulator tags
- ISO 27001 pathway plan phase 1 filed
- HDEC out-of-scope determination for the vitals validation research
- HPI compliance ticket IN-3502 submitted 2026-08-13
- Internal pen test complete (5 categories) + external pen test being scoped

## Scope of the engagement we're seeking

A short written opinion (~2–4 pages) covering the five questions above, with pointers to any Medsafe / MoH guidance we should cite in defence of our position, and a recommended next step. Not a full classification submission — we want to know if that submission is warranted before we commission it.

## Contact

**Dr Patrick Herling**, Chief Medical Officer, Tere Health Limited
hello@terehealth.co.nz
