# Tere Health — Clinical & Data Ethics Policy

**Version:** v1.0 (draft) · **Date:** 3 September 2026
**Owners:** Dr Patrick Herling (Chief Medical Officer) · Dr Rachel Thomas (Medical Director)
**Status:** DRAFT — requires Māori advisor + independent clinical ethics advisor review before v2.0

This policy sets out how Tere Health makes ethical decisions across clinical care, research, AI use, and data stewardship. It is written for the current small-team stage (2026) and will be revised as we grow.

---

## 1. Foundational commitments

Tere Health commits to the following, in this order of priority when they conflict:

1. **Patient safety comes first.** No feature, cost, or business goal overrides a decision that would foreseeably harm a patient.
2. **Honest, informed consent.** Every patient must understand what we do with them and their data. Consent is not a form to sign — it is a conversation.
3. **Equity and cultural safety.** Māori, Pacific, disabled, rural, and low-income patients receive care that is as accurate, respectful, and accessible as care to any other patient. Where our tools work less well for these groups, we say so and fix it.
4. **Truthfulness in what we say.** Our marketing, patient-facing copy, and clinical AI outputs must not overstate what we do or what we know.
5. **Data minimalism.** We collect the minimum needed for safe care and lawful billing. Nothing more.
6. **Openness with regulators.** We disclose incidents, breaches, and shortfalls to the appropriate regulator promptly and completely, even when doing so is uncomfortable.

## 2. Clinical care ethics

### 2.1 Scope of practice
- We provide telehealth for conditions that can be safely and effectively managed remotely.
- We do NOT provide emergency care. Our triage AI must recognise emergency presentations and route them to 111 / ED.
- We do NOT provide care for children under 2 without a parent/guardian present.
- We do NOT prescribe Class A controlled drugs. Class B/C controlled drugs only with strong clinical justification and after checking real-time prescription monitoring (once available).

### 2.2 Provider–patient boundaries
- Providers may not consult with family members, close friends, or business partners as patients.
- Providers may not initiate personal contact with patients outside the platform.
- Any dual relationship must be disclosed to the Medical Director and documented.

### 2.3 Decision to refer
- If the provider believes the patient needs in-person care, imaging, or admission, they refer. The commercial incentive to complete the telehealth consult does not override this.
- Providers document the referral pathway before ending the consult.

### 2.4 Peer support and reflection
- Every provider is entitled to case discussion with a peer without fear of professional consequence.
- Cases that concern us clinically (near-miss, poor outcome, uncertainty) are reviewed at the fortnightly clinical governance meeting.

## 3. Research and clinical validation ethics

### 3.1 Study governance
- Any observational or interventional study involving patients must have written ethical review:
  - **HDEC** (Health and Disability Ethics Committee) approval for interventional or greater-than-minimal-risk studies.
  - **Institutional review** or **NEAC 2019** self-assessment for observational studies (VitalsValidate is currently under NEAC 2019 as low-risk observational).
- No study data is collected without explicit patient consent captured in the platform.

### 3.2 Consent for research
- Research consent is separate from clinical consent.
- Patients may withdraw research consent at any time. Existing anonymised research data may be retained; identifiable data must be deleted on request.
- Children (under 16) cannot consent to research on our platform without parental co-consent.

### 3.3 Publication and disclosure
- Research findings will be published, including negative or unfavourable results.
- Provider co-authorship follows ICMJE criteria — anyone who contributed substantively and can defend the work.
- Conflicts of interest disclosed on every submission.

## 4. AI and machine-learning ethics

Tere uses AI in several places: triage classification, note drafting, live subtitles, prescribing decision support (planned), and vitals estimation (SpO2, HR, RR).

### 4.1 AI is a tool, not a decision-maker
- Every AI output is either (a) informational — the provider can accept, edit, or discard, or (b) advisory — the provider makes the final decision.
- No AI output goes to a patient, GP, ACC, or another provider without a licensed clinician reviewing it first, except where the output is explicitly patient-directed (e.g. AI-drafted patient-facing summary that the patient reads and can question).

### 4.2 Transparency about AI
- Patients are told when AI is being used and what for.
- Patients can opt out of AI features (subtitles, AI note drafting) at any time without penalty.
- Providers can override any AI recommendation.

### 4.3 Bias and equity
- We monitor AI performance across demographic groups where sample size permits (age, ethnicity, gender, skin tone for vitals).
- Where performance is materially worse for a subgroup, we (a) disclose that in-product, (b) escalate mitigation to the roadmap, and (c) do not deploy the feature in prod until parity is reached — unless the alternative (no feature at all) is demonstrably worse for that subgroup.
- **SpO2 example:** we have documented reduced accuracy in darker skin tones (a known issue with camera-based PPG). We publish this in the patient-facing consent, provide a calibration pathway, and are actively working with WAND-notified vendors on remediation.

### 4.4 Data used for training / calibration
- Any model trained on Tere patient data must be trained on de-identified data.
- Consent to research (per §3.2) is required before a patient's data is used for model training.
- Vendor-hosted models (AWS Bedrock — Claude) must be covered by a BAA that prohibits provider use of our data for training.
- We publish annually the summary of what data was used to train / calibrate what.

### 4.5 Model change management
- Any material change to a model that could affect clinical output (new version, new fine-tune, new prompt) requires:
  - Documented pre-release evaluation on a held-out test set.
  - Sign-off by the CMO.
  - Notification to WAND (Medsafe) if the change is in scope of an active WAND notification.
  - Change log entry in `docs/regulatory/model-changelog.md`.

## 5. Data ethics

### 5.1 Who sees what
- Access is minimal, role-based, and audit-logged (see `docs/regulatory/privacy-collection-notice.md`).
- Admins do not view clinical detail without a documented reason (see PhiRevealGate).
- Billing admins never see clinical narrative (architectural block).

### 5.2 What we do with data
- Provide the consultation and follow-on care.
- Meet safety, legal, and billing obligations.
- Improve the platform (aggregate, de-identified analytics).
- Research, with consent.
- We do NOT sell patient data. Ever.
- We do NOT hand over data to insurers or employers without the patient's specific, contemporaneous consent.

### 5.3 Retention and deletion
- Clinical records retained ≥10 years per HIPC Rule 4.
- After minimum retention, records reviewed for continuing necessity; excess deleted.
- Patient may request correction (Rule 7) or complaint about disclosure at any time (see collection notice).

### 5.4 Sub-processors and offshore
- Every sub-processor documented in the PIA + HISO 10029 pack.
- Offshore processing (AWS Sydney) disclosed in the collection notice; only under BAA.
- Change of sub-processor triggers a re-review + notification to enterprise customers on request.

## 6. Equity — Te Tiriti o Waitangi commitments

Tere operates in Aotearoa and serves Māori patients. Under Te Tiriti principles of tino rangatiratanga, ōritetanga, and active partnership:

- **Language:** Te Reo Māori is a first-class UI option throughout the patient journey (task #17). Patient-facing AI (triage) responds in Te Reo when selected.
- **Cultural safety:** provider training includes cultural safety modules; we track completion.
- **Māori advisor:** we commit to appointing a Māori clinical advisor by end of 2027 to review this ethics policy, our AI outputs for Māori-appropriate framing, and our engagement with Māori health providers.
- **Data sovereignty:** Māori patient data is held under the same protections as all patient data. We recognise the Māori Data Sovereignty Principles (Te Mana Raraunga) and will engage with iwi organisations if requested about specific research use.
- **Pae Ora Healthy Futures Act 2022:** we support the Act's objectives of equitable outcomes for Māori and Pacific communities.

## 7. Provider conduct

- Providers hold themselves to the MCNZ / NZNC code of conduct at all times.
- Providers do not use patient data or platform access for personal, commercial, or research purposes without written approval + patient consent.
- Providers report concerns about a colleague's conduct to the Medical Director without fear of retaliation.

## 8. Marketing and public communications

- We do not overstate clinical outcomes.
- We do not use patient stories without written consent, even in de-identified form.
- We do not compare ourselves to specific competitors in ways that misrepresent them.
- Testimonials are attributed and consented; anonymous testimonials are marked as such.

## 9. Financial and commercial ethics

- Fee structure is transparent on the website before the patient begins triage.
- No hidden charges. Refunds available for clearly-unmet clinical expectations.
- ACC billing follows the letter and spirit of ACC's provider handbook. Ambiguous billing decisions are resolved in ACC's favour (i.e. we don't over-bill).
- Commissions or referral fees to third parties for patient referrals are not accepted.

## 10. Whistleblowing

Any staff member, contractor, or patient may raise a concern about a breach of this policy without fear of retaliation:

- **Internal:** email the Medical Director (rachel@terehealth.co.nz) or CMO (patrickherling@gmail.com).
- **External:** HDC (hdc.org.nz · 0800 11 22 33), Privacy Commissioner (privacy.org.nz · 0800 803 909), or MCNZ (mcnz.org.nz).

We will investigate every concern. Retaliation for good-faith reporting is grounds for immediate dismissal.

## 11. Governance and review

- Reviewed annually or on material change (new product, new regulator, incident of note).
- Version-controlled in this repo.
- All material changes discussed at monthly ISMS committee (per ISO 27001 pathway plan).

## 12. Attribution

This policy draws on:
- **NZ HDC Code of Rights** (Rights 1–10)
- **NEAC 2019 National Ethical Standards for Health and Disability Research**
- **HIPC 2020** and **Privacy Act 2020**
- **MCNZ Good Medical Practice**
- **WHO Ethics and Governance of Artificial Intelligence for Health (2021)**
- **Te Mana Raraunga Māori Data Sovereignty Charter**

## Change log

- **2026-09-03 v1.0 draft** — Patrick Herling. Awaiting review by:
  - Māori clinical advisor (to be appointed by end-2027 per §6)
  - Independent clinical ethics advisor (open to recommendation; Rachel to source)
  - Legal review of §5 and §11 (whistleblowing) before publication
