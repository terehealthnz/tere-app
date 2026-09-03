# CARM adverse reaction reporting — Standard Operating Procedure

**Regulator:** Medsafe · Centre for Adverse Reactions Monitoring (CARM), University of Otago.
**Purpose:** define when and how Tere Health providers report suspected adverse drug reactions.
**Owner:** Rachel Thomas (Medical Director, clinical accountable). Patrick Herling operational owner.

CARM has no API. Reports are submitted via the online form at <https://nzphvc.otago.ac.nz/reporting/> or (for hospital settings) via SafeRx. For Tere Health, all reports go through the CARM online form under the reporting practitioner's own name.

---

## When to report (mandatory triggers)

Report to CARM within **5 working days** of becoming aware of any of the following:

1. **Any suspected serious adverse reaction** to a medicine, vaccine, or complementary product — regardless of whether the medicine is new to market. "Serious" = death, life-threatening, hospitalisation, significant disability, congenital anomaly, or otherwise medically important.
2. **Any suspected reaction to a new medicine** (marked with the ⚠ Medsafe MARC's early-warning list at <https://medsafe.govt.nz/profs/adverse/mm2s.asp>).
3. **Any suspected reaction to a Section 29 medicine** (unapproved medicines used under practitioner responsibility per s29 Medicines Act 1981).
4. **Any suspected reaction with a herbal/complementary product** where the reaction is serious.
5. **Any suspected medication error causing patient harm.**

Report even if the causal link is uncertain — CARM aggregates signals.

## When to report (encouraged but not mandatory)

- Any non-serious reaction that seems unusual, unexpected, or clinically interesting.
- Any suspected interaction between medicines (or between a medicine and food/supplement/OTC).
- Failures of expected therapeutic effect for a critical medicine (e.g. antiepileptic breakthrough seizure).

## What to include

CARM's form asks for:

- **Patient**: age, sex, weight, ethnicity, NHI (if available). Tere source: `patients` table.
- **Suspected medicine**: brand + generic, dose, route, start date, stop date, batch number if known. Tere source: `prescriptions` for our own scripts; free-text for medicines started elsewhere.
- **Reaction description**: onset date, symptoms, severity, duration, treatment given, outcome, dechallenge/rechallenge result.
- **Concurrent medicines**: from `patient_medications` structured history if we captured it.
- **Relevant history**: from `patient_conditions` + `patient_allergens`.
- **Reporter**: reporting practitioner's name, MCNZ number, HPI-CPN, contact email/phone.

## Workflow

1. **Provider identifies a reportable event** during a consult or on chart review.
2. **Provider clicks "Report to CARM" on the ClinicianPatient chart** *(follow-on: button not yet built — flagged in task #229 / new task).* In the interim, provider opens the CARM form directly.
3. **Provider fills the CARM online form** — Tere-side info can be copied from the patient chart. All the fields CARM asks for are visible in the chart Structured History card.
4. **Provider notes the CARM report reference on the consult** as an internal note (or in an `admin_notes` field) — includes the CARM tracking number CARM emails back.
5. **Admin logs the report internally** as an incident row (`incidents` table, kind='adverse_reaction') so it feeds the internal QI dashboard.

## After the report

- CARM emails an acknowledgement with a tracking number — save this in the patient's `admin_notes` or in the incident row.
- CARM may follow up with questions — this comes to the reporting practitioner's email, not to Tere generally.
- CARM occasionally publishes signals (via MARC bulletins) — Tere monitors these via `docs/regulatory/marc-watchlist.md` (create as needed).

## Serious reactions — parallel actions

If the reaction is serious:

1. **Report to CARM as above** — mandatory.
2. **Notify Tere Medical Director (Rachel)** — internal QI review.
3. **If the reaction was caused by prescribing error** — open an `incidents` row with kind='near_miss' or 'harm_event'. Follow root-cause analysis. May be notifiable to HDC under Right 4.
4. **If linked to a Section 29 medicine** — additional notification to Medsafe s29 pharmacovigilance email is required.
5. **If patient dies or is hospitalised** — coroner referral / hospital handover per usual clinical protocol; CARM report is on top of, not instead of, those.

## Where Tere already captures the underlying data

- Prescriptions (drug, dose, dates, route): `prescriptions` table + `api/_prescriptions.js`.
- Structured medications: `patient_medications` table + `patientMedicationsApi`.
- Allergies: `patient_allergens` table.
- Conditions: `patient_conditions` table.
- Consultation notes with reaction description: `consultations.clinical_notes` (SOAP) + `doctor_notes`.
- Provider identifiers: `providers` table (MCNZ, HPI, contact).

An "Auto-fill CARM form" helper is a natural follow-up — pre-populate a text block that the provider can paste into the CARM online form. Not built yet.

## Reporting-practitioner accountability

CARM reports are attributable to the reporting practitioner personally, not to Tere Health as an entity. This is standard for pharmacovigilance and does not require corporate sign-off — but the internal `incidents` row keeps Tere aware for QI purposes.

## Change log

- 2026-09-03 — v1.0 initial SOP. Rachel to review + adjust wording of the "when to report" list to reflect her clinical judgment.
