# RHCNZ referral spec

Source of truth for the RHCNZ imaging integration. Materials in this
folder came from Jesse Thorpe (jesse.thorpe@rhcnz.com) on 2026-08-17
following the meeting the same day.

## Regional email routing table

Tere referral PDFs are sent as **urgent** requests to the intake email
that matches the patient's region. RHCNZ then contacts the patient
directly to book. There is no central intake — each region owns its
own inbox.

| Brand                  | Region                | Intake email                          |
|------------------------|-----------------------|---------------------------------------|
| Auckland Radiology (ARG) | Auckland / Northland | `bookings@arg.co.nz`                  |
| Bay Radiology          | Bay of Plenty         | `info@bayradiology.co.nz`             |
| Pacific Radiology      | Waikato               | `waikato@pacificradiology.com`        |
| Pacific Radiology      | Wellington / Manawatū | `appointments@pacificradiology.com`   |
| Pacific Radiology      | Nelson                | `nelson.admin@pacificradiology.com`   |
| Pacific Radiology      | Canterbury            | `contactcentrechc@pacificradiology.com` |
| Pacific Radiology      | Otago / Southland     | `dunedin.reception@pacificradiology.com` |
| Canterbury BreastCare  | Canterbury (breast)   | `cbc.admin@pacificradiology.com`      |

## eReferral template — required fields

See `RHCNZ-eReferral-Template-2026-08-17.docx` for the canonical layout.
Section structure:

**1. Referral details**
- Referral ID (from originating system)
- Referred To Name (populated from brand selection)
- Referral Sent (DD/MM/YYYY HH:MM)

**2. Patient details**
- Surname, First name(s), Preferred name
- Gender, Date of Birth, Ethnicities
- NHI number
- CSC number (if available)
- Phone (Home), Phone (Mobile)
- Address (street number, street name, suburb, city, postcode)

**3. Funding**
- ACC (Yes/No)
- ACC Number
- Other Funding Pathway (e.g. community funding, Southern Cross)
- Date of injury

**4. Examination & clinical details**
- Examination requested (modality + body part)
- Clinical details for examination

**5. Referrer & report details**
- Urgency (Routine / **Urgent** — Tere defaults to Urgent per Jesse)
- Referrer name
- Referrer phone
- Referrer NZMC (MCNZ number)
- Practice name
- Practice address
- Practice Dispatch (Medical Objects shortcode)
- Additional Report To (copy-to doctor name + address)

## Patient-facing callback numbers

Pending — RHCNZ Business Development Manager to send a directory of
X-ray / Ultrasound clinic sites with pricing and funding information.
Once received, surface on the patient-facing post-referral screen so
patients can reach out to their preferred site directly if RHCNZ
hasn't booked them within X hours.

## Fields Tere already collects vs missing

Already collected on a Tere consultation:
- Patient name (surname / first / preferred)
- DOB, sex/gender
- NHI (region-gated to NZ)
- Phone (single field — mobile)
- Address
- ACC eligibility + ACC claim number (via ACC flow)
- Chief complaint / clinical detail (reusable as clinical details)
- Provider identity (name, MCNZ via `providers.mcnz_registration_number`, HPI-CPN, phone)

Not yet collected — need to add to referral builder:
- **CSC number** (Community Services Card) — optional
- **Ethnicities** — Tere collects for demographic but check field-level parity
- **Home vs Mobile phone** — Tere collects one; RHCNZ template distinguishes
- **Other funding pathway** — free-text alongside ACC toggle
- **Date of injury** — only needed if ACC = yes
- **Additional Report To** — copy-to GP field (already have GP letter flow → reuse)
- **Referrer's Medical Objects shortcode** — Tere HPI-O `G11238-E` is the org identifier;
  MO shortcode may differ; check with Tony Cruice at MO Helpdesk (case #1058382).
