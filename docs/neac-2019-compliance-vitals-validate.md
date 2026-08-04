# VitalsValidate — NEAC 2019 Compliance Record

**Version:** 1.0
**Date:** 2026-08-04
**Owner:** Dr Patrick Herling (Chief Medical Officer, Principal Investigator)
**Purpose:** Documented mapping of VitalsValidate to each standard in the *National Ethical Standards for Health and Disability Research and Quality Improvement* (NEAC 2019), for the audit trail required by NEAC even when HDEC has ruled a study out of scope.

**Companion documents:**
- [`vitals-validate-participant-information-sheet.md`](./vitals-validate-participant-information-sheet.md)
- HDEC out-of-scope letter, 2026-08-03 (filed in `docs/regulatory/` — reference on file with the sponsor)
- [`maori-data-sovereignty.md`](./maori-data-sovereignty.md)
- [`hosting-and-data-residency-statement.md`](./hosting-and-data-residency-statement.md)
- [`audit-log-retention-policy.md`](./audit-log-retention-policy.md)

---

## 0. Study summary

| Field | Value |
|---|---|
| Title | VitalsValidate — Accuracy validation of rPPG vital-signs measurement against reference cuff readings |
| Design | Anonymous, cross-sectional, observational accuracy study |
| Population | NZ adult volunteers 18+, self-selected via public link, self-administered reference cuff readings |
| Sample size | Open-ended, opportunistic; no per-participant identifiable data means no formal power calculation. This is a screening / feasibility study, not a formal clinical validation. |
| Data collected per participant | Age, sex, height, weight, Fitzpatrick skin scale, hypertension/hypotension history, other conditions (free-text), reference cuff systolic + diastolic + heart rate, rPPG-derived vital-signs estimate, device/browser metadata (IP-approximated location, user-agent). No name, no email, no contact information. |
| Data location | Supabase, `ap-southeast-2` (Sydney), under executed DPA |
| Retention | 10 years from last data addition |
| HDEC status | Out of scope, letter issued 2026-08-03 (reference filed) |
| NEAC status | Bound; this document evidences compliance |

---

## 1. Cultural and social responsibility — including Te Tiriti o Waitangi and Māori Data Sovereignty (NEAC 2019 §2)

**How VitalsValidate meets this standard:**

- The general Tere Health Māori Data Sovereignty position is documented in [`maori-data-sovereignty.md`](./maori-data-sovereignty.md). The PIS references it and is publicly linked from the VitalsValidate page.
- The anonymous data collected in this round does not include ethnicity, iwi affiliation, or any Māori-identifying variable. This is a deliberate design choice: (a) it keeps the record truly anonymous per the HDEC OOS boundary, and (b) it does not permit inappropriate stratified reporting of Māori-specific data without prior Māori engagement.
- A public complaints route including a Māori-specific pathway is included in the PIS.
- If a future formal clinical validation of Tere's rPPG is undertaken, that would require a fresh HDEC application and — before recruitment — engagement with a named Māori advisor. No such successor study is planned at present.

**Known limitations:**

- No formal Māori advisory role is currently in place for VitalsValidate. This is called out honestly in `maori-data-sovereignty.md`.
- Aggregate reporting of validation accuracy stratified by ethnicity is not possible from this dataset by design.

---

## 2. Study design (NEAC 2019 §3)

**How VitalsValidate meets this standard:**

- Research question is scientifically valid: does Tere's rPPG algorithm, as deployed in the public web app, produce vital-signs estimates that agree with reference cuff readings within clinically acceptable limits, across the demographic distribution of NZ adults?
- Method is appropriate to the question (paired anonymous cross-sectional accuracy study).
- Analysis plan: Bland-Altman agreement analysis (mean bias + limits of agreement) for each vital sign vs. reference. Sub-group analysis by age band, sex, Fitzpatrick scale, and hypertension status where sample size permits.
- Sample size: opportunistic. This is a screening / feasibility study; no formal power calculation.
- The study does not test an intervention. No decisions about participant care are made based on the rPPG result — this is explicit in the PIS.
- The study is **not** a formal clinical validation (e.g. ISO 81060-2) and no regulatory claim about BP accuracy is or will be made on the basis of this dataset alone.

**Known limitations:**

- Reference cuff device is participant-owned and not standardised across participants. This is a limitation of the anonymous public-recruitment design and is acknowledged in the study protocol. Bland-Altman analysis will include an intrinsic reference-device variance term.
- Because this is a feasibility screen rather than a clinical validation, any accuracy figures published will be described as "observational / preliminary" — not as clinical performance claims.

---

## 3. Recruitment (NEAC 2019 §4)

**How VitalsValidate meets this standard:**

- Recruitment is passive and public: an open web page (`/vitals-validate`) linked from Tere Health's site and, when the recruitment is running, from voluntary social channels. No unsolicited direct recruitment.
- No coercion: no financial payment, no in-kind reward, no dependency relationship between the investigator and the participant.
- No captive populations: participants must be 18+, self-selected, and free to leave at any point before submission.
- Ceased-recruitment procedure: task #207 confirms the ability to pause external recruitment (feature-flag gated) and this was exercised on 2026-08-03 during the HDEC screener process.

**Known limitations:**

- Self-selection bias is inherent in this design. Reported in publication.

---

## 4. Informed consent (NEAC 2019 §5)

**How VitalsValidate meets this standard:**

- The Participant Information Sheet ([`vitals-validate-participant-information-sheet.md`](./vitals-validate-participant-information-sheet.md)) is the definitive source of information given to participants. **Follow-up action:** the app currently shows a short in-page ethics blurb; a link to the full PIS should be added before/at the "Start measurement" button. Tracked as a follow-on task below.
- Consent is captured by an explicit affirmative action ("Start measurement" button) after the participant has been shown the ethics blurb + PIS link.
- Withdrawal is explicitly explained in the PIS: participants can stop at any time before submission, but once anonymously submitted, individual records cannot be identified for withdrawal. This is a limitation of anonymity, not a restriction on participant rights, and is disclosed up-front.
- Age gate: participants attest they are 18+ as part of the consent action. Under-18 recruitment is out of scope of the HDEC OOS boundary and would require a fresh application.
- Capacity: because participation is entirely self-directed via a public web page with no in-person interaction, participants demonstrating capacity to reach the app and follow the instructions are treated as consenting adults. This is standard for anonymous internet-based accuracy studies.

---

## 5. Participant welfare (NEAC 2019 §6)

**How VitalsValidate meets this standard:**

- Minimal risk: no physical intervention, no medicines, no diagnostic decisions made on the participant's behalf.
- Explicit statement in the PIS that the rPPG result is a research measurement and must not be used for personal health decisions. Directs concerned participants to their GP or Healthline (0800 611 116).
- No adverse events reasonably foreseeable from participation. In the event of an unexpected participant concern, the complaints route in §11 of the PIS is the entry point; the investigator will respond within 5 working days.
- The reference cuff reading is one the participant would take at home regardless — the study adds no physical risk.

---

## 6. Payments and reimbursement (NEAC 2019 §7)

**How VitalsValidate meets this standard:**

- No financial payment, no in-kind gift, no reimbursement offered. This is stated in the PIS.
- Rationale: opportunistic anonymous recruitment; payment would introduce a coercion risk without a proportionate benefit to study quality.

---

## 7. Privacy and confidentiality (NEAC 2019 §8)

**How VitalsValidate meets this standard:**

- No direct identifiers collected (see study summary).
- Indirect identifiers minimised: geolocation is approximated by IP (city-level at most) and used only for regional distribution reporting.
- Storage in Supabase `ap-southeast-2` under executed DPA. Full hosting posture documented in `hosting-and-data-residency-statement.md`.
- Access restricted to the principal investigator + any designated study statistician. Access is audit-logged in the append-only `audit_logs` table (see `audit-log-retention-policy.md`).
- No sharing of individual-level data with any third party. Aggregate-only outputs.

---

## 8. Data and biological material (NEAC 2019 §9)

**How VitalsValidate meets this standard:**

- No biological material collected.
- Video is processed on-device to extract numeric vital-signs values; the raw video is not transmitted to Tere Health servers and is not retained.
- Numeric data retention: 10 years from last addition, aligned to Health (Retention of Health Information) Regulations 1996 as applied to research data.
- After 10 years the anonymous dataset is permanently deleted. The deletion event is audit-logged.
- Data is not currently shared for open science because it does not include ethnicity, which limits its utility for equity-focused reuse. Any future open-science release would require re-consent and Māori-advisor review.

---

## 9. Study governance (NEAC 2019 §10)

**How VitalsValidate meets this standard:**

- Principal investigator: Dr Patrick Herling (MCNZ 99529, ABEM-certified emergency medicine). Investigator competence documented in Tere Health provider profile.
- Sponsor: Tere Health Limited (NZBN 9429053723413).
- Protocol amendments: any change to inclusion, data-collection variables, or analysis plan will be documented as a version bump on this file with a change-history row (§13). Amendments that would exceed the HDEC OOS boundary (e.g. including minors, adding identifiers, adding an interventional element) require a fresh HDEC application before the amendment is applied.
- Adverse event / incident procedure: the PIS complaints route (§11) is the primary channel. Any incident reported by a participant is logged, triaged within 5 working days, and if a corrective action is taken it is documented against this file.
- The study operates under Tere Health's Incident Response Plan (`docs/incident-response-plan.md`) and Business Continuity Plan (`docs/business-continuity-plan.md`).

---

## 10. Conflicts of interest (NEAC 2019 §11)

**Declared conflicts:**

- Tere Health Limited is both the **sponsor** and the **developer** of the rPPG algorithm being validated. This is a structural conflict of interest and is declared here explicitly.
- Mitigation: (i) all raw data and analysis code will be preserved and made available on request to any regulator, ethics committee, or peer reviewer; (ii) results will be published in full regardless of whether the algorithm meets clinical accuracy criteria; (iii) a negative result (algorithm does not meet accuracy targets) will not be suppressed and will be published on the same timeline as a positive result.
- Dr Patrick Herling has no personal financial interest in the algorithm's accuracy beyond his role as founder-owner of Tere Health Limited. This is the same interest that would apply to any founder studying their own product.

---

## 11. Publication and dissemination (NEAC 2019 §12)

**How VitalsValidate meets this standard:**

- Commitment to publish aggregate results within 12 months of reaching the target sample size for a given publication.
- Publication venues under consideration: New Zealand Medical Journal, peer-reviewed international digital-health journals, Tere Health public research page.
- Because participants are anonymous, results are made **public** rather than sent individually — participants can find them via the Tere Health research page at any time.
- Negative results (algorithm does not meet accuracy targets) will be published on the same timeline as positive results — see §10.

---

## 12. Outstanding compliance actions

Recorded here so nothing falls through the cracks:

- [x] Add a "Read full Participant Information Sheet" link at the ethics blurb and at the consent CTA (shipped 2026-08-04).
- [x] Add an explicit "you cannot withdraw an individual anonymous record once submitted" line to the in-app consent action, in plain English (shipped 2026-08-04).
- [x] Add the complaints contact (Patrick's email + HDC/HDEC/OPC lines) to the app's footer for the study route (shipped 2026-08-04 in PageWrap).

---

## 13. Change history

| Version | Date | Change | Author |
|---|---|---|---|
| 1.0 | 2026-08-04 | Initial NEAC 2019 compliance record + PIS v1.0 | Dr Patrick Herling |
