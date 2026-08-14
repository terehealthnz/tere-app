# Declaration of Conformity

**Document version:** 1.0
**Date of issue:** 2026-08-14
**Owner:** Dr Patrick Herling (Chief Medical Officer, Management Representative)
**Review cadence:** Reissued whenever the Medical Device Notification, the intended purpose, the risk profile, or any load-bearing companion document is materially amended.
**Companion documents:** [`quality-management-system.md`](./quality-management-system.md), [`risk-management-file.md`](./risk-management-file.md), [`software-lifecycle-file.md`](./software-lifecycle-file.md), [`security-compliance.md`](./security-compliance.md), [`privacy-impact-assessment.md`](./privacy-impact-assessment.md), [`incident-response-plan.md`](./incident-response-plan.md), [`disaster-recovery-plan.md`](./disaster-recovery-plan.md), [`hosting-and-data-residency-statement.md`](./hosting-and-data-residency-statement.md)

---

## 1. Manufacturer and sponsor

**Manufacturer and Sponsor:** Tere Health Limited
**Registered office:** 41 Adams Lane, Springlands, Blenheim 7201, New Zealand
**Company email:** terehealthnz@gmail.com
**NZBN:** 9429053723413
**HPI-O (Health Provider Index — Organisation):** G11238-E

## 2. Product identification

**Product name:** Tere Vitals
**Description:** A Software as a Medical Device (SaMD) that estimates and displays heart rate, peripheral oxygen saturation (SpO₂), and respiratory rate from the front-facing camera of a consumer smartphone or laptop using remote photoplethysmography (rPPG). Delivered as part of the Tere Health telehealth platform at `terehealth.co.nz`.

## 3. Regulatory classification

| Field | Value |
|---|---|
| Regulatory regime | Medicines Act 1981 (NZ) and Medicines (Database of Medical Devices) Regulations 2003 |
| Classification | Class IIa medical device |
| GMDN code | 57960 — Multiple physiological parameter spot-check analysis system, clinical |
| Medsafe notification | Web-Assisted Notification of Devices (WAND) reference **260729-WAND-786DQ9** |
| MedSafe internal device id | 137905 |
| Sponsor's own reference | TERE-VITALS-001 |
| Notification status | Active (as of the date of issue of this Declaration) |
| First supplied in NZ | 2026 |

## 4. Intended purpose (verbatim from the WAND notification)

> Tere Vitals is a Software as a Medical Device (SaMD) that uses the front-facing camera of a consumer smartphone or laptop to non-contact estimate and display heart rate, peripheral oxygen saturation (SpO₂), and respiratory rate using remote photoplethysmography (rPPG). It is intended as an adjunct to remote clinical triage during telehealth consultations in adults (18 years and over), providing indicative physiological measurements for a registered clinician to consider alongside clinical history and other assessment findings. It is not intended as a diagnostic device, not for continuous monitoring, and not for use in paediatric or neonatal populations, where a clinical decision requires laboratory-grade accuracy, or where physiological instability requires urgent in-person assessment.

## 5. Declaration

I, Dr Patrick Herling, being a person authorised to make this declaration on behalf of Tere Health Limited (the "Sponsor" and "Manufacturer" for the purposes of the Medicines (Database of Medical Devices) Regulations 2003), hereby declare that:

1. **Tere Vitals is a medical device** within the meaning of Section 3A of the Medicines Act 1981.
2. **Tere Vitals is correctly classified as a Class IIa medical device** under the risk-based classification rules applicable to a Software as a Medical Device intended for spot-check estimation of physiological parameters used as an adjunct to clinical assessment.
3. **The kind of device notified to Medsafe (WAND 260729-WAND-786DQ9) is only recommended by the Sponsor for its notified intended purpose**, being the intended purpose reproduced verbatim at §4 above.
4. **The information included in and with the Medsafe notification is complete and correct.**
5. **Tere Health Limited operates a documented Quality Management System aligned with the requirements of ISO 13485:2016** (see companion document `quality-management-system.md`).
6. **Risk management for Tere Vitals is performed in accordance with the requirements of ISO 14971:2019** (see companion document `risk-management-file.md`). No hazard identified in the current risk management file retains a residual risk score above the "As Low As Reasonably Practicable" band after risk controls are applied.
7. **The software life-cycle processes applied to Tere Vitals conform to the requirements of IEC 62304:2006/A1:2015** for a software safety class of B — non-serious injury possible — as documented in `software-lifecycle-file.md`.
8. **Processing of health information is conducted in accordance with the Health Information Privacy Code 2020 and the Privacy Act 2020** (see `privacy-impact-assessment.md`).
9. **Clinical care delivered through the Tere Health platform is conducted in accordance with the Health and Disability Commissioner (Code of Health and Disability Services Consumers' Rights) Regulations 1996 and the standards and statements of the Medical Council of New Zealand**, including the MCNZ Statement on Telehealth (August 2023).
10. **Post-market surveillance is active** for Tere Vitals. Any adverse event or serious safety signal will be reported to Medsafe within the timeframes required by the Medicines (Database of Medical Devices) Regulations 2003, and to the Office of the Privacy Commissioner where the Privacy Act 2020 requires it.

This Declaration is made on the basis of the documented conformance recorded in the Companion documents listed above, and is reissued whenever those documents are materially amended or the underlying WAND notification is amended.

## 6. Standards conformed to

- ISO 13485:2016 — Medical devices — Quality management systems (documented conformance; not third-party certified)
- ISO 14971:2019 — Medical devices — Application of risk management to medical devices
- IEC 62304:2006/A1:2015 — Medical device software — Software life-cycle processes (Class B)
- IEC 62366-1:2015 — Medical devices — Application of usability engineering
- Medicines Act 1981 (NZ)
- Medicines (Database of Medical Devices) Regulations 2003 (NZ)
- Health Information Privacy Code 2020 (NZ)
- Privacy Act 2020 (NZ)
- Health and Disability Commissioner (Code of Health and Disability Services Consumers' Rights) Regulations 1996 (NZ)
- Medical Council of New Zealand — Statement on Telehealth, August 2023
- Health Practitioners Competence Assurance Act 2003 (NZ)

## 7. Basis of Declaration

This Declaration is made on the basis of Tere Health Limited's documented Quality Management System and its supporting artefacts, which together constitute the technical documentation for Tere Vitals under the NZ Medicines (Database of Medical Devices) Regulations 2003. The QMS is not currently certified by an accredited third-party certification body. Certification will be pursued when triggered by (a) a hospital or PHO procurement contract that requires it, (b) an international market entry (Australia TGA, EU MDR, US FDA), or (c) an investor requirement.

## 8. Sub-processors relied upon

The safety and availability of Tere Vitals depend in part on sub-processors that hold current independent certifications appropriate to their function. The current register is maintained in `quality-management-system.md` Appendix B and includes:

- Amazon Web Services (AWS Bedrock, Sydney ap-southeast-2 — ISO 13485, ISO 27001, HIPAA BAA in force)
- Supabase (SOC 2 Type II)
- Vercel (SOC 2 Type II)
- LiveKit Cloud (SOC 2)
- Stripe (PCI-DSS Level 1)

Where a sub-processor's certification discharges an internal control obligation, this is cited in the Quality Management System document rather than duplicated internally.

## 9. Signed

**Signed by:** _______________________________________

**Dr Patrick John Herling, D.O.**
Chief Medical Officer, Management Representative
Tere Health Limited

**MCNZ registration number:** 99529
**HPI-CPN:** 24NSES

**Date:** _____________________

---

*This Declaration is issued on Tere Health Limited letterhead. A signed copy is retained by Tere Health Limited under `docs/regulatory/` and reissued whenever the Medsafe notification, the intended purpose, or any load-bearing companion document is materially amended. The current version is the file at `HEAD` of the `main` branch of `terehealthnz/tere-app`; historical versions are recoverable via `git log`.*
