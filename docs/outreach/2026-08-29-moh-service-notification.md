# Ministry of Health — new telehealth service notification

**Draft — review before sending.**

- **To:** telehealth@health.govt.nz (primary) · cc: HI_Provider@tewhatuora.govt.nz (Health NZ Digital Services — already engaged for HPI-O)
- **From:** Dr Patrick Herling, CMO, Tere Health Limited
- **Subject:** Notification of new virtual telehealth service — Tere Health Limited (HPI-O G11238-E)

---

Tēnā koutou,

I'm writing to notify the Ministry of Health of a new virtual telehealth service operating in New Zealand: **Tere Health Limited**. We are courtesy-notifying you now that we are approaching public availability, in line with good-practice engagement between new digital health providers and the Ministry.

## About Tere Health

- **Service model:** Same-day virtual GP-equivalent consultations (video, phone, and asynchronous) with MCNZ-registered doctors, focused on rural and remote patients in New Zealand.
- **Legal entity:** Tere Health Limited, NZBN 9429053723413, registered office 41 Adams Lane, Springlands, Blenheim 7201.
- **Ownership:** 100% New Zealand owned, no offshore parent.
- **Governance:** Chief Medical Officer Dr Patrick Herling (MCNZ 99529, ABEM-certified Emergency Medicine). Medical Director Dr Rachel Thomas (FACEM, MCNZ 93606).
- **Clinical scope:** Adult (18+) primary-care presentations amenable to virtual assessment. Explicit exclusions include paediatric under 2, controlled drugs, and any presentation requiring in-person examination — those are triaged to the patient's usual GP, Healthline, or Emergency Services as appropriate.
- **Physical facility:** None (fully virtual). No HPI-F applied for.

## Verified identifiers

| System | Identifier | Status |
|---|---|---|
| HPI-O (organisation) | G11238-E | Issued 2026-07-26 by Shyam Dhanabalu, Health NZ Digital Services |
| HNZ organisation risk assessment | A-031207 | Closed 2026-07-26, Risk Indicator: Medium (expected for new organisation) |
| ACC vendor registration | G11238 | Approved 2026-07-28 by Megan Trezise, ACC Provider & Vendor Registrations |
| WAND — Tere Vitals (rPPG spot-check) | 260729-WAND-786DQ9 | Active, Class IIa, GMDN 57960 |
| WAND — Tere Drug Interaction Check | 260821-WAND-78BC2U | Active, Class I, GMDN 61087 |
| HPI FHIR API integration | Ticket IN-3502 | Compliance test pack submitted 2026-08-13 |
| NZePS integration | Ticket IN-3447 | In discussion with Trevor Lloyd |

## Regulatory posture

- **HDC Rights (Code of Health and Disability Services Consumers' Rights):** Explicit consent gates in the patient flow for HDC Rights acknowledgement, prescribing, ACC eligibility, and (opt-in only) research participation.
- **Privacy Act 2020 / Health Information Privacy Code:** All PHI hosted in AWS ap-southeast-2 (Sydney), covered under an executed AWS Business Associate Agreement (also HIPAA-eligible). Patient consent copy names AWS Sydney explicitly. Audit logging is in place for every provider-side PHI access with reason-for-access prompt.
- **NEAC 2019 National Ethical Standards:** Confirmed applicable and complied with for our observational rPPG accuracy work (VitalsValidate). Received an HDEC out-of-scope letter dated 2026-08-03 confirming the current study does not require HDEC review.
- **Medicines Act 1981 / Misuse of Drugs Act 1975:** No controlled drug prescribing. Prescribing PDFs include the Director-General signature-exemption statement (August 2024 authorisation) for the exempt drug list; controlled/CD drugs are hard-blocked in the prescribing UI.
- **MCNZ supervision:** Any provisional-vocational registrants operate under a written MCNZ-format supervision plan naming Dr Rachel Thomas (FACEM) as the sole supervisor.
- **Complaints:** In-app patient complaint form routes to admin. Escalation path to HDC clearly signposted. Nominated Privacy Officer + Complaints Handler contactable at hello@terehealth.co.nz.

## Contact for Ministry queries

- **Clinical/regulatory:** Dr Patrick Herling — patrickherling@gmail.com
- **Business/operational:** Justin Thomas — jtthomas1371@gmail.com · +64 27 945 0984
- **General:** terehealthnz@gmail.com · terehealth.co.nz

We would welcome any guidance the Ministry has for a new virtual-only telehealth provider, and we're happy to engage further on integration with health system infrastructure (NHI, MWS, NES, NZePS) as our HNZ Digital Services tickets progress.

Ngā mihi nui,

Dr Patrick John Herling, D.O.
Chief Medical Officer, Tere Health Limited
MCNZ 99529 · HPI-CPN 24NSES · HPI-O G11238-E
NZBN 9429053723413
terehealthnz@gmail.com · terehealth.co.nz
