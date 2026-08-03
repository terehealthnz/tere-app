# Tere Health — Research and Clinical Ethics Policy

**Document version:** 1.0 (working draft — not yet reviewed by an external ethics advisor)
**Date:** 2026-08-03
**Status:** Working document. Reviewed annually or on material change to scope, technology, or regulatory environment.
**Legal entity:** Tere Health Limited (New Zealand)
**Platform:** terehealth.co.nz
**Audience:** Clinicians and staff, regulators (Medsafe, HDEC, MCNZ, HDC), insurers, research participants, patients, and the public
**Contact for ethics concerns:** patrickherling@gmail.com · terehealthnz@gmail.com
**Related documents:** [[privacy-impact-assessment.md]], [[maori-data-sovereignty.md]], [[supervision-plan.md]], [[security-compliance.md]], [[incident-response-plan.md]]

---

## About this document

This policy exists to make Tere Health's ethical commitments explicit and auditable. It covers both clinical care and the research/validation work that supports Tere's rPPG vitals technology. It is written to be honest, not performative — where Tere has known gaps, they are named directly with target dates for closure.

This document was drafted with AI assistance and is scheduled for review by:

- A Māori health professional or advisor (target: before v2.0)
- A clinical ethics advisor with NZ experience (target: before v2.0)
- Tere's MCNZ supervisor (Rachel — see [[supervision-plan.md]]) as part of the annual supervision review

Corrections, challenge, and guidance are welcomed at any time.

---

## 1. Purpose and scope

Tere Health operates in three ethically significant domains simultaneously:

1. **Clinical care** — providing telehealth consultations to patients in New Zealand, including prescribing and referrals
2. **Research and device validation** — collecting data to validate Tere's rPPG-based vitals monitoring technology for regulatory (Medsafe WAND, ISO 81060-2) and clinical claims
3. **AI-assisted practice** — using AI for triage support, live subtitle translation, clinical note generation, and other functions that touch clinical decision-making or documentation

Each of these domains has distinct ethical obligations and governing standards. This policy applies to **everyone working with Tere Health** — the medical director, contracted providers, employees, contractors, advisors, and research participants — for any activity conducted under the Tere Health name or using Tere infrastructure.

Where this policy conflicts with a specific professional obligation (e.g. Medical Council of New Zealand standards, Health Practitioners Competence Assurance Act), the professional obligation prevails.

---

## 2. Governing standards

Tere Health commits to operating in accordance with the following frameworks. They are not merely referenced — they are the yardsticks against which Tere's practice can be measured.

### Clinical care
- **Health and Disability Commissioner (HDC) Code of Rights** (1996) — the ten patient rights
- **Medical Council of New Zealand (MCNZ) — Good Medical Practice** and all related standards, including the *Statement on telehealth*
- **Health Information Privacy Code 2020**
- **Privacy Act 2020**
- **Te Tiriti o Waitangi** and the Ministry of Health's *Whakamaua: Māori Health Action Plan* (see [[maori-data-sovereignty.md]] for how Tere operationalises this)

### Research and device validation
- **National Ethical Standards for Health and Disability Research and Quality Improvement (NEAC 2019)** — the load-bearing document even when HDEC review is not required
- **HDEC Standard Operating Procedures** — Section 3 defines scope
- **Declaration of Helsinki** (WMA, 2013) — international ethical principles for medical research on humans
- **Ministry of Health *Guidelines for the Use of Human Tissue for Future Unspecified Research Purposes*** — where relevant (currently not, but flagged for future biobanking)
- For any future formal cuff-paired BP validation: **ISO 81060-2:2018** and its ethics requirements

### AI in clinical practice
- **MCNZ *Statement on the use of artificial intelligence in medical practice*** (as amended)
- **NZ AI Forum — Trustworthy AI in Aotearoa** principles
- **Australia's *Ethical Framework for the use of AI in Healthcare*** (referenced as a peer standard given the absence of a fully-formed NZ equivalent for AI in medicine)
- **Anthropic Bedrock BAA** — the contractual layer that makes patient data lawful to send to AI infrastructure (see [[project-tere-bedrock]] in Tere's regulatory record)

### Data and secondary use
- **Health Information Privacy Code 2020, Rule 11** — limits on use and disclosure
- **Health Information Privacy Code 2020, Rule 10** — limits on use of health information for secondary purposes without consent
- **Data Futures Partnership — A Path to Social Licence** (2017)

---

## 3. Governance and accountability

Tere Health is a small organisation at the time of writing. Ethics governance is therefore intentionally personal and named, not distributed across a large committee:

| Role | Named person | Accountability |
|---|---|---|
| Founding Medical Officer | Dr Patrick Herling (MCNZ 99529) | Overall accountability for clinical, research, and AI ethics posture |
| MCNZ Supervisor | Dr Rachel [Surname] | Reviews clinical decisions and supervises the founding medical officer — see [[supervision-plan.md]] |
| Māori health advisor | Not yet appointed | Target: appointed before physical clinic opens; will review [[maori-data-sovereignty.md]] to v2.0 |
| External clinical ethics advisor | Not yet appointed | Target: appointed before N > 500 research participants |
| Privacy Officer (statutory role) | Dr Patrick Herling (interim) | Handles Privacy Act 2020 obligations and OPC breach notifications |

**Known gap:** As of 2026-08-03, Tere does not have an independent ethics committee, an independent Māori advisor on retainer, or an external clinical ethics advisor. These are named target-dated appointments, not deferred aspirations. Until they are filled, the founding medical officer is transparent about the concentration of ethical authority in one person and welcomes external challenge (see §12).

Ethics decisions of material weight (starting new research streams, publishing accuracy claims, deploying new AI features in the clinical workflow, changing consent architecture) are documented as memory records with dates and rationale in Tere's internal knowledge base. This creates an audit trail for future review.

---

## 4. Clinical care ethics

Tere Health delivers telehealth consultations. Every consultation must uphold the ten patient rights under the HDC Code:

1. Right to be treated with respect
2. Right to freedom from discrimination, coercion, harassment, and exploitation
3. Right to dignity and independence
4. Right to services of an appropriate standard
5. Right to effective communication
6. Right to be fully informed
7. Right to make an informed choice and give informed consent
8. Right to support
9. Rights in respect of teaching or research
10. Right to complain

### Specific operating commitments

- **Scope of practice.** Providers only deliver care within their scope, current annual practising certificate, and Tere's clinical governance framework. Cases outside scope (e.g. paediatric cases beyond age gate, red-flag mental health presentations) are escalated per Tere's clinical protocols rather than attempted.
- **Continuity of care.** Tere is not a substitute for a regular GP. This is stated clearly to patients before consultation and reinforced in post-consult summaries. Patients without a regular GP are given guidance on how to enrol.
- **Prescribing.** Prescribing is done in accordance with the Medicines Act 1981, MCNZ *Good Prescribing Practice*, and Tere's internal prescribing protocol. Controlled Drug Schedule Class 2 and 3 prescriptions require wet-ink signature. The signature-exempt DG pathway is used only where lawful and only for non-controlled medications.
- **Supervision.** Junior providers (RMO-level and equivalent) practise under formal MCNZ-registered supervision per [[supervision-plan.md]]. Patrick Herling himself is currently supervised by Rachel.
- **Referral and transfer.** When Tere is not the appropriate site of care (acute cardiac, obstetric, surgical, safeguarding, etc.), the provider transfers care to the appropriate service. Tere never withholds a referral because it would end the paid encounter.
- **Emergency situations.** When a patient is in immediate danger, providers advise 111 and remain on the call until the patient is connected to emergency services where safe to do so.

### After-hours and 24/7 posture

Tere operates without shift-time-based ethical tiers. A patient contacting Tere at 3 AM receives the same standard of care as a patient contacting at 9 AM. Providers on shift at any hour are accountable to the same clinical, ethical, and documentation standards.

---

## 5. Research ethics

Tere Health conducts research and device-validation activity to support the regulatory clearance and clinical claims of its rPPG vitals monitoring technology.

### Current active research

**VitalsValidate** — an anonymous observational study measuring the accuracy of remote photoplethysmography (rPPG) heart rate, respiratory rate, and peripheral oxygen saturation against reference clinical devices, in New Zealand adults recruited via public channels.

- **Ethics status:** HDEC out-of-scope letter issued 3 August 2026 (see `/docs/regulatory/HDEC-OOS-Letter-2026-08-03.pdf`)
- **Boundary of the OOS letter:** Adults 18+ only; anonymous data only; no identifiable health information; observational only (no intervention); Class IIa device or below
- **Governing standard:** NEAC 2019 (Health Research Ethics), Declaration of Helsinki
- **Consent:** Explicit consent gate in the study flow, with participant information (data use, retention, right to withdraw) shown before any face-scan capture
- **Withdrawal:** Because data is anonymous, participants cannot withdraw specific readings after submission; this is disclosed clearly in the consent flow

### Future research (planned, not yet active)

**Formal cuff-paired BP validation (ISO 81060-2)** — target N ≥ 85 subjects with reference-cuff-paired BP measurements. This will be a formal clinical investigation and will require:

- A fresh HDEC application — the VitalsValidate OOS does not extend to this study
- A study protocol reviewed and approved before recruitment
- Named principal investigator with GCP training
- Identifiable data governance (paired measurements require subject-level linkage)
- Insurance and indemnity confirmation appropriate to a clinical investigation

**Clinic-collected paired validation data.** Once the physical clinic opens, in-clinic vitals will be collected as part of routine care. Any secondary use of that data for research or device validation requires the patient's explicit informed consent at the point of care, separate from consent to clinical treatment. This is a Rule 10 obligation under the Health Information Privacy Code 2020.

### Research participant protections (all studies)

- Anonymous where possible; identifiable only where scientifically necessary and consented
- Right to withdraw explained in accordance with the study design (some designs cannot honour post-hoc withdrawal — this is disclosed pre-consent)
- No coercion — participation is unpaid volunteer participation, participation does not affect access to care, and non-participation carries no consequence
- Data storage per NEAC 2019 § 6 and Tere's [[security-compliance.md]]
- Adverse events (device-related discomfort, distress, unexpected findings) reported to Tere's medical director for review and, where warranted, to Medsafe

### Prohibited research activity

- Recruitment of research participants without a documented ethics review or OOS letter appropriate to the study design
- Use of clinical care data for research or commercial secondary purposes without explicit patient consent
- Publication or external citation of research findings ("validated to N=X, accuracy Y") using data collected before an appropriate ethics determination is in place
- Any study involving children, prisoners, or persons with restricted decision-making capacity without a formal HDEC application

---

## 6. AI in clinical practice

Tere Health uses AI in five current clinical workflows:

| Workflow | Model | Human-in-the-loop |
|---|---|---|
| AI-assisted triage (patient-facing symptom intake) | Claude via AWS Bedrock (Sydney) | Yes — clinician reviews the AI-generated summary before every consultation; patient is never routed to care based on AI decision alone |
| Live subtitle translation for cross-language consults | AWS Transcribe → LLM refinement | Yes — clinician sees the source audio as well as the translation and can pause the feature at any time |
| AI clinical note generation from consult transcript | Claude via AWS Bedrock (Sydney) | Yes — every AI-generated note is reviewed, edited, and signed by the treating clinician before it enters the record |
| AI-assisted email drafting (patient support, admin) | Claude via AWS Bedrock (Sydney) | Yes — no AI-drafted patient-facing communication is sent without human review |
| rPPG vitals monitoring (screening only) | On-device ML model | Yes — reading displayed to clinician as "screening estimate — confirm with reference" and never as a diagnostic value |

### AI ethical commitments

- **BAA-covered inference only.** Patient data is only processed by AI infrastructure covered by a Business Associate Agreement (currently AWS Bedrock via BAA — see [[project-tere-bedrock]] in Tere's regulatory record). Data is not sent to consumer-tier AI APIs.
- **AI does not diagnose. AI does not treat. AI does not decide.** AI outputs are inputs to a human clinical decision, not substitutes for one. This is stated to patients in the consent architecture (see §7) and enforced technically by requiring provider sign-off on AI-generated notes.
- **Kill switches.** Every AI-assisted feature has a feature flag and can be disabled remotely without a deploy. This is a deliberate safety property, not a nice-to-have.
- **Transparency to patients.** Patients are told, before consent, which parts of their interaction will involve AI processing, where the AI runs, and what data is sent. They can decline AI features (e.g. AI notes, live subtitles) without declining care.
- **Bias monitoring.** rPPG has known accuracy differences across Fitzpatrick skin types. Tere actively tracks accuracy stratified by demographic subgroup and does not publish or claim accuracy figures without reporting subgroup performance. Current dataset has known under-representation of Fitzpatrick V–VI subjects — this is a named gap.
- **Model change control.** Material changes to AI models used in clinical workflows are logged as memory records with dates and rationale, and their clinical impact is reviewed before rollout.

### Prohibited AI use

- AI-generated clinical decisions without human sign-off
- AI-drafted patient-facing communication sent without human review
- Sending patient data to AI infrastructure not covered by a BAA
- Using AI outputs in ways that contradict the "screening only / clinician confirms" framing communicated to the patient
- Silent AI insertion into a workflow — every AI-involving step must be visible in the consent architecture

### Known AI gap

MCNZ's *Statement on the use of artificial intelligence in medical practice* is evolving. When it is next updated, Tere will re-audit this section against the new guidance within 30 days.

---

## 7. Consent architecture

Tere operates layered consent, not a single monolithic tick-box. Consent is asked separately for meaningfully separate purposes, because bundling consent obscures what the patient is actually agreeing to.

| Consent layer | Where it appears | What is being consented to |
|---|---|---|
| HDC Rights acknowledgement | Landing / triage entry | The patient has been informed of the HDC Code |
| Clinical care consent | Pre-consultation | Consent to receive telehealth care from a Tere clinician |
| AI processing consent | Pre-consultation and pre-notes | Consent to AI-assisted triage, live subtitles, and AI note generation, with clear right to decline any component |
| Prescribing consent | Point of prescribing | Consent to the specific medicine, including side effects and alternatives |
| Research participation consent | VitalsValidate entry (separate from care) | Consent to participate in the anonymous validation study — separate flow, not bundled with care consent |
| Secondary use consent | Not yet asked; required before any in-clinic care data is used for research | Rule 10 Health Information Privacy Code obligation |

Consent is documented in the patient record with timestamps and version numbers of the consent text shown at the time.

### Cultural and linguistic accessibility

Consent must be genuinely informed to be valid. Tere provides consent flows and AI triage in the languages currently supported (English, Te Reo Māori, Samoan, French, Dutch, and more per the app's language selector). Where a patient's primary language is not supported, providers use professional interpretation services rather than AI translation for consent-critical conversations.

---

## 8. Data ethics

Data-collection ethics is treated as a first-class concern, not a subset of security.

- **Minimisation.** Tere collects the minimum health information required to provide safe care. Optional fields are optional; nothing is collected "in case it's useful later."
- **Retention.** Retention periods are defined in [[privacy-impact-assessment.md]] and follow the Health (Retention of Health Information) Regulations 1996 — clinical records held for 10 years after last contact.
- **Access.** All access to identifiable patient health information by administrative staff is logged with reason-for-access, and audited (see [[security-compliance.md]] and Tere's admin PHI-view audit implementation).
- **Cross-border data.** AI inference occurs in AWS Sydney (BAA-covered). Patients are informed of this in the consent architecture. No patient data is stored outside NZ or Australia.
- **Secondary use.** No health information collected for clinical care is used for research, product development, or commercial purposes without the specific consent of the patient, per Rule 10 of the Health Information Privacy Code 2020.
- **Anonymisation is not consent.** Anonymising data before secondary use does not remove the need to have collected it lawfully in the first place. Where data is anonymised, Tere retains a record of the source consent basis.
- **Māori data sovereignty.** See [[maori-data-sovereignty.md]] for the operational framework Tere is building to honour Māori data as taonga.

---

## 9. Vulnerable populations

Certain populations warrant heightened ethical care and are named explicitly here:

- **Children under 18.** Tere's default posture for VitalsValidate is 18+ only. Clinical care of children under Tere's telehealth model follows MCNZ paediatric-consent guidance, requires appropriate parental/guardian consent, and specific age-based safeguards are enforced in the prescribing workflow.
- **People experiencing acute mental distress.** Clear escalation protocol to 1737, emergency services, or DHB CAT services. Providers are not permitted to make prescribing or discharge decisions for acute suicidality via telehealth alone.
- **Māori and Pacific peoples.** Ethical obligations extend beyond service parity into Te Tiriti responsiveness; see [[maori-data-sovereignty.md]].
- **Rural and remote patients.** Tere's core mission population. Ethical obligations here include not offering telehealth as a permanent substitute for advocated in-person care where the latter would materially improve outcomes.
- **People with limited English.** See §7 on cultural/linguistic accessibility. Consent-critical conversations use human interpreters.
- **People experiencing family violence, coercive control, or unsafe home situations.** Providers are trained to recognise indicators and follow the safeguarding protocol without documenting anything in the record that could increase risk if accessed by the perpetrator.

---

## 10. Te Tiriti o Waitangi responsiveness

Rather than duplicate content, this section defers to [[maori-data-sovereignty.md]] for the operational framework. The commitments in that document — appointing a Māori health advisor, engaging with mana whenua where Tere physically operates, applying Māori Data Sovereignty principles as an operating framework — are treated as ethical obligations under this policy, not aspirational statements.

**Known gap:** Tere does not currently have a retained Māori health advisor. This is named as a target-dated commitment (see [[maori-data-sovereignty.md]]) and will be filled before the physical clinic opens.

---

## 11. Complaints, concerns, and whistleblowing

### Patients

Patients can raise complaints through:

- **Direct to Tere:** patrickherling@gmail.com or terehealthnz@gmail.com — Tere commits to acknowledge within 3 working days and substantively respond within 20 working days
- **HDC (Health and Disability Commissioner):** hdc.org.nz — Tere provides HDC contact details in every consult summary as required
- **MCNZ (Medical Council of New Zealand):** for concerns about a specific doctor's conduct
- **Office of the Privacy Commissioner:** for privacy breaches — privacy.org.nz

Tere never retaliates against a patient for raising a complaint, and any evidence of that would itself be an ethical failure to be addressed.

### Staff, providers, and contractors

Staff who identify an ethical concern about Tere's practice — including this document, this founder's decisions, or a colleague's clinical care — are protected in raising it. Tere has no non-disparagement clause in its contractor agreements that would prevent good-faith reporting to a regulator.

Escalation path for staff:
1. Directly to the founding medical officer
2. If the concern involves the founding medical officer, directly to the MCNZ supervisor
3. If both channels are unsafe, directly to MCNZ or the relevant regulator

### External challengers

External parties (mods of professional forums, academic reviewers, insurance underwriters, journalists) who raise ethical concerns about Tere's practice are engaged with substantively, not dismissed as adversaries. See the founding medical officer's position: *external critique is free QA — treat the critique as signal about a real gap, not as an obstacle to route around.*

---

## 12. Known gaps and commitments

Listed here so they cannot be lost. Each gap has a named commitment; each commitment carries a target date.

| Gap | Commitment | Target |
|---|---|---|
| No retained Māori health advisor | Appoint a named Māori health advisor to review Tere's Māori Data Sovereignty commitments | Before physical clinic opens |
| No external clinical ethics advisor | Appoint an external NZ clinical ethicist to review this policy to v2.0 | Before N > 500 VitalsValidate participants OR before physical clinic opens, whichever first |
| No formal AI accuracy subgroup reporting | Publish rPPG accuracy stratified by Fitzpatrick skin type as part of any regulatory submission | Before WAND submission |
| No Rule 10 secondary-use consent implemented for clinical care data | Build a separate secondary-use consent gate before any in-clinic collected data is used for research | Before physical clinic opens |
| No independent audit of AI note accuracy | Commission a review of a sample of AI-generated notes vs the original transcript by an independent clinician | Within 90 days of hitting 1000 AI-generated notes signed off |
| VitalsValidate consent flow not yet linking to the HDEC OOS letter | Update the consent screen to include a visible link to the OOS PDF and reference date | Within 14 days (2026-08-17) |
| MCNZ AI statement is evolving; current AI use may need re-audit | Re-audit §6 within 30 days of any MCNZ AI statement update | Continuous |

---

## 13. Review

- **Annual review:** every August, or more often if the regulatory landscape shifts materially
- **Trigger-based review:** required within 30 days of any of the following:
  - New AI feature added to a clinical workflow
  - Change to a governing standard (MCNZ statement update, NEAC revision, HDEC SOP revision, Privacy Act amendment)
  - Material clinical incident that surfaces an ethics gap
  - External challenge that identifies a legitimate concern this policy does not address
- **Version control:** each version is dated. Prior versions are preserved in the repository history.

---

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 (draft) | 2026-08-03 | Dr Patrick Herling (drafted with AI assistance) | Initial draft. Written in response to VitalsValidate ethics-review pivot; intended to become the umbrella document covering clinical, research, AI, and data ethics before physical clinic opens. Not yet reviewed by external Māori health advisor or clinical ethics advisor. |
