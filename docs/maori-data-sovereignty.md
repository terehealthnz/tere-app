# Tere Health — Māori Data Sovereignty and Te Tiriti o Waitangi Obligations

**Document version:** 1.0 (working draft — not yet reviewed by a Māori health advisor)
**Date:** 2026-07-08
**Status:** Working document — will be updated as commitments are met and after external review.
**Legal entity:** Tere Health Limited (New Zealand)
**Platform:** terehealth.co.nz
**Audience:** PHOs, iwi-affiliated providers, Te Whatu Ora, Māori health professionals
**Contact:** patrickherling@gmail.com · terehealthnz@gmail.com

---

## About this document

This document is written to be honest, not performative. Where Tere has gaps, they are named directly. Where commitments are made, they carry target dates and accountability.

**Provenance:** This document was drafted with AI assistance and is scheduled for review by a Māori health professional before version 2.0. Corrections, challenge, and guidance from Māori health professionals and communities are actively welcomed. This is a starting point, not a finished product.

---

## 1. Statement of Commitment

Tere Health Limited acknowledges Te Tiriti o Waitangi as a foundational document of Aotearoa New Zealand and a living framework that shapes our obligations to Māori patients, whānau, and communities. Te Tiriti is not a compliance checkbox. It is the basis on which Tere operates in this country and the lens through which our clinical, technical, and governance decisions are assessed.

The communities Tere was built to serve — rural Marlborough, the Marlborough Sounds, Seddon, and the Awatere Valley — include areas where Ngāti Apa ki te Rā Tō, Ngāti Kuia, and Rangitāne are mana whenua. Any telehealth platform operating in this space carries obligations to those communities that go beyond providing a service. Those obligations include how health information is held, who controls it, and whether the platform reflects and respects the ways of knowing and being of the people it serves.

Tere Health commits to engaging with Māori Data Sovereignty principles as a genuine operating framework — not an afterthought. This document is a record of where we are, what we are doing, and what we have committed to do. It will be updated as those commitments are met.

---

## 2. Māori Data Sovereignty — Te Mana Raraunga Framework

Te Mana Raraunga (the Māori Data Sovereignty Network) has articulated principles that describe what it means to handle data in ways that are consistent with Māori values and the guarantees of Te Tiriti. The following sections engage with each of those principles honestly, describing what Tere is currently doing and where gaps exist.

### Rangatiratanga — Authority and Self-Determination

*Māori have the right to maintain authority over their own data and to determine how it is used.*

**What Tere is doing:**
- Patients can request a copy of their consultation record at any time.
- Patients can correct factual errors in their record by contacting the treating clinician or compliance contact.
- Patients can opt out of research participation without any impact on their care.
- Consent to AI processing can be withdrawn by written request.
- Te Reo Māori is available as a first-class language choice throughout the triage flow — not a reduced-function option.

**Current gaps:**
- No formal data governance arrangement with mana whenua has been established.
- Patients cannot currently self-serve data deletion (subject to medical records retention law); an in-app self-service feature is on the roadmap.
- Whānau involvement in care is acknowledged verbally by the platform but not yet formally supported in the patient workflow.

### Whakapapa — Relationships and Context

*Data has relationships and genealogies that must be understood and preserved. Health data does not exist in isolation from the person, their whānau, and their community.*

**What Tere is doing:**
- AI-generated clinical notes are always reviewed by a New Zealand-registered clinician before becoming part of the medical record.
- The triage AI is prompted to acknowledge whānau context when a patient references it.
- The platform recognises that rural NZ patients are disproportionately Māori and that inequity of access is part of the context in which every consultation occurs.

**Current gaps:**
- The platform does not yet formally capture or record whānau involvement preferences.
- No audit has been conducted of how the AI handles whakapapa-relevant information in clinical contexts.

### Whanaungatanga — Obligations and Relationships

*Māori data exists within a web of relationships between the individual, whānau, hapū, iwi, and community. Handling that data carries obligations to those relationships.*

**What Tere is doing:**
- The consent flow explicitly acknowledges that patients may wish to involve whānau in their care.
- The Te Reo Māori language option carries through the entire triage flow, so bilingual whānau members can support monolingual patients.
- The compliance contact is a single accessible individual, not an anonymous helpdesk address.

**Current gaps:**
- Formal mechanisms for whānau participation (for example, a designated whānau contact field, or whānau-inclusive consultation summaries) are not yet built into the platform.
- No formal relationship with any specific hapū or iwi currently exists.
- No governance structure that includes external accountability to Māori communities is yet in place.

### Kotahitanga — Collective Benefit

*Data should be used in ways that benefit not only the individual but the collective — hapū, iwi, and community.*

**What Tere is doing:**
- Anonymised rPPG vitals validation data from consenting patients improves the accuracy of the technology for future patients, including Māori.
- The Te Reo Māori triage implementation benefits the whole community of Te Reo speakers, not just individual patients.
- The vitals validation programme specifically targets Fitzpatrick Type IV–VI skin tone data to ensure equitable accuracy — recognising that most published rPPG datasets underrepresent darker skin.

**Current gaps:**
- No formal benefit-sharing arrangement exists with mana whenua for data that may derive collective value.
- Aggregated health data insights are not currently shared back to Māori communities.

### Manaakitanga — Reciprocity and Care

*The relationship between Tere and Māori patients must be one of genuine care and reciprocity — not extraction.*

**What Tere is doing:**
- Te Reo Māori implemented as a first-class language including bilingual red-flag safety messages.
- Critical safety warnings always appear in both Te Reo Māori and English — never in Te Reo only.
- Cultural safety messaging built into the AI triage prompt.
- Pricing set to be accessible for rural and lower-income patients.

**Current gaps:**
- The Te Reo Māori clinical terminology used in the triage flow has not yet been reviewed by a Māori health clinical advisor.
- No systematic mechanism yet exists for Māori patients to provide feedback specifically on cultural safety.

### Kaitiakitanga — Guardianship and Protection

*Māori health data must be actively protected, with ongoing guardianship responsibilities.*

**What Tere is doing:**
- Executed AWS Business Associate Agreement (BAA) — HIPAA-equivalent safeguards for all AI processing (signed 2026-07-07).
- Data Processing Addendum in place with Supabase (primary database).
- Row-level security enforced on all PHI tables; no direct browser access to patient data.
- Server-mediated writes enforce a per-endpoint column allowlist to prevent field injection.
- Audit log records all provider actions on patient records.
- Ten-year medical records retention aligned with New Zealand regulatory requirements.
- No server-side recording of video or audio consultations.

**Current gaps:**
- Health information is currently stored in the United States — a direct tension with kaitiakitanga ideals. Sydney migration is planned (see Section 3).
- No dedicated kaitiaki role for Māori data governance oversight has been appointed. Appointment committed for Q4 2026.
- No formal iwi data governance arrangement exists.

---

## 3. Cross-Border Storage — An Honest Assessment

The most significant tension between Tere's current infrastructure and Māori Data Sovereignty principles is data residency. Tere's application, database, and AI processing are currently hosted in the United States. From a Māori Data Sovereignty perspective, this is a limitation, not a strength.

> **Current limitation:** Tere's primary data infrastructure is hosted in the United States. Patient health information — including consultation records, clinical notes, prescriptions, and vitals data — currently resides outside Aotearoa New Zealand.

### Protections currently in place

- Executed AWS Business Associate Agreement (BAA), signed 2026-07-07 — HIPAA-equivalent data handling standards.
- Data Processing Addendum with Supabase.
- HIPC Rule 12 cross-border transfer authorised through explicit patient consent captured at the start of every consultation.
- All sub-processors contractually bound and identified to patients in the consent flow.

### The roadmap

- **Supabase migration to Sydney (`ap-southeast-2`)** — planned within 6 months of this document's publication.
- **AWS Bedrock migration to APAC inference profile** — available as an environment-variable change as soon as APAC profiles are enabled for the Claude model versions Tere uses.
- **NZ-based hosting** — a longer-term goal beyond the Sydney migration. Investigation of NZ-based hosting options (including Catalyst Cloud and other NZ-owned providers) is committed for Q1 2027.

Sydney is not Aotearoa. Moving to `ap-southeast-2` reduces the cultural and jurisdictional distance between Māori health data and the communities it belongs to — but it is not the end state. Tere is transparent that NZ-based hosting is the goal, and that it is not yet achieved.

---

## 4. Cultural Safety in AI Processing

Tere uses Anthropic Claude (via AWS Bedrock) for clinical note generation, ACC documentation, and translation. Foundation models are trained predominantly on non-Māori, non-NZ data. The practical risks for Tere are:

- Te Reo Māori clinical terminology may be translated or interpreted incorrectly.
- Culturally appropriate ways of describing illness, whānau involvement, or spiritual dimensions of health may be misrepresented.
- Medical concepts that have no direct English equivalent may be handled poorly by a model with limited Te Reo training data.

### What Tere is doing to mitigate this

- **Clinician review is mandatory** — AI-generated notes never enter the medical record without review by a New Zealand-registered clinician.
- The AI triage is prompted to acknowledge whānau context when mentioned by the patient.
- Red-flag safety messages always appear in both Te Reo Māori and English — critical safety information never relies on Te Reo alone.
- Providers can disable AI assistance for specific consultations where cultural sensitivity requires full human drafting (via the `ai_notes_enabled` feature flag which can be scoped per-consultation).

### Known gap

No formal audit of AI performance on Te Reo Māori clinical inputs has yet been conducted — specifically testing for accuracy of transcription, appropriateness of translation, and cultural safety of generated content. This audit is a committed action for Q4 2026 (Section 6).

---

## 5. Rangatiratanga in Practice — Patient Data Rights

Every Tere patient, including Māori patients and their whānau, has the following rights in relation to their health data:

| Right | How it is implemented | Status |
|---|---|---|
| Receive care in Te Reo Māori | Te Reo Māori available as a first-class language throughout triage, consent, and patient-facing surfaces | ✓ Live |
| Access their own record | Patients may request a copy of their consultation record via the compliance contact | ✓ Available |
| Correct their record | Factual errors can be raised with the treating clinician or the compliance contact | ✓ Available |
| Whānau involvement acknowledged | AI triage prompted to acknowledge whānau context; formal in-platform support is on the roadmap | △ Partial |
| Opt out of research | Opt-in only. Opting out has zero impact on care. Consent captured separately at the start of every consultation | ✓ Live |
| Withdraw AI-processing consent | Consent to future AI processing can be withdrawn by written request to the compliance contact | ✓ Available |
| Complain | Via Tere directly, the HDC, or the Office of the Privacy Commissioner. Contact details in the in-app help section | ✓ Live |
| Data deletion (subject to retention) | Patients may request deletion subject to the 10-year medical records retention obligation; any deletion is logged in the audit trail | △ Manual — in-app self-service planned |

---

## 6. Committed Actions — With Target Dates

The following commitments are specific and trackable. They will be updated in future versions of this document as they are completed.

| Commitment | Target | Status |
|---|---|---|
| Review of this document by a Māori health professional | Before first PHO contract | Not started |
| Formal engagement with a Māori health-focused advisory group | Before first PHO contract | Not started |
| Appointment of a kaitiaki role for Māori data governance oversight | Q4 2026 | Not started |
| Audit of AI model performance on Te Reo Māori clinical inputs — accuracy, translation, cultural safety | Q4 2026 | Not started |
| Māori representation in clinical governance — at least one Māori health professional in any clinical advisory structure | Before first PHO contract | Not started |
| Clinical review of Te Reo Māori terminology in triage flow and consent screens by a Māori health clinical advisor | Q4 2026 | Not started |
| Supabase database migration to Sydney (`ap-southeast-2`) | Within 6 months | Planned |
| AWS Bedrock migration to APAC inference profile | On availability of APAC profiles for the Claude model versions in use | Ready to deploy |
| Mechanism for Māori patients to provide cultural safety feedback | Q4 2026 | Not started |
| Investigation of NZ-based hosting options | Q1 2027 | Not started |
| Publication of a whakapapa statement on the Tere website acknowledging Te Tiriti obligations | Q4 2026 | In progress |

---

## 7. What Tere Does Not Claim

Readers who are Māori health professionals or PHO privacy officers are accustomed to documents that overclaim. This section is written for them.

> Tere Health does not claim to be a fully Treaty-compliant organisation. Tere is an early-stage company with significant gaps in Māori Data Sovereignty practice. Those gaps are named openly in this document. Tere is committed to closing them — but is not there yet.

Specifically, Tere does not claim:

- That the Te Reo Māori triage implementation has been clinically validated or reviewed by Māori health professionals — it has not yet been.
- That the AI is culturally safe for Māori patients — Tere claims only that human clinicians review AI output before it enters the medical record.
- That the current data-residency position is acceptable from a Māori Data Sovereignty perspective — it is acknowledged as a limitation.
- That relationships with mana whenua have been established — they have not, and establishing them is a committed action.
- That clinical governance adequately represents Māori health expertise — it does not yet.
- That this document reflects Māori review — it does not. Review by a Māori health professional is a committed action before version 2.0 is published externally.

**What Tere does claim:** that these questions are being engaged with honestly, that gaps are documented publicly, that commitments carry target dates, and that challenge and accountability from Māori health professionals and communities are actively welcomed.

---

## 8. Governance and Contact

| Role | Person | Accountability |
|---|---|---|
| Compliance contact | Patrick Herling | Primary contact for data sovereignty enquiries |
| Kaitiaki (Māori data governance) | *Vacant — appointment committed for Q4 2026* | Māori data governance oversight |
| Māori health clinical advisor | *Vacant — engagement committed before first PHO contract* | Cultural safety review of triage flow, consent screens, and AI output |

Additional clinical and business governance roles will be added to future versions of this document as they are formally appointed and as the appointees consent to being named.

**Enquiries** from Māori health professionals, iwi representatives, and PHO privacy officers are welcomed and will be responded to directly:

- Email: patrickherling@gmail.com
- General: terehealthnz@gmail.com
- Platform: terehealth.co.nz

---

## Change History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-07-08 | Patrick Herling | Initial working draft. Not yet reviewed by a Māori health advisor. Published to solicit feedback and to signal commitment. |

---

*Tere Health Limited · terehealth.co.nz · Working document · 2026-07-08*
