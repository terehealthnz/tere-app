# Reply to Liam (Chemist Warehouse NZ) — dispensary emails + prescription format

**Date:** 2026-08-04
**To:** Liam, Pharmacist / E-Commerce & IT Manager, Chemist Warehouse NZ
**Attach:** Health NZ document *"Temporary Exemption for Signatures on Prescriptions without NZePS (without an NZePS barcode)"* — updated 10 October 2024 (provided by Trevor Lloyd, Health NZ Digital Services)

---

## Draft reply

Kia ora Liam,

Thanks again for the canonical CW dispensary email list — we have those 72 store addresses loaded into our directory now, so any Tere prescription bound for a Chemist Warehouse pharmacy will route straight to the correct dispensary email on send.

To confirm the format of what your team will receive:

We operate under the Director-General of Health's authorisation of August 2024 for prescriptions not signed personally by the prescriber (Health NZ document attached — the "Temporary Exemption for Signatures on Prescriptions without NZePS", updated 10 October 2024, valid until 31 October 2027). This is the same alternative form of prescription that has been in use across NZ tele-services since the authorisation was issued.

Every Tere script your team receives will include:

- **The exact statement required by the authorisation:** *"This Prescription meets the requirement of the Director-General of Health's authorisation of August 2024 for prescriptions not signed personally by a prescriber with their usual signature"* — present in the PDF footer and in the email body
- **Prescriber registration authority number** — MCNZ number in the prescriber block on the prescription
- **Prescriber contact details** — direct email and phone in the prescriber block (so your dispensary team can verify identity or request amendments)
- **Patient identity block** — full legal name, date of birth, NHI where held, address
- **Signature line** — rendered as "Signature Exempt" (matching the Health NZ example in Appendix 1 of the attached doc)
- **Format** — PDF attachment, generated server-side, uneditable at the client
- **Delivery** — from Tere's authenticated `terehealth.co.nz` domain (identifies both prescriber and healthcare facility, per the "secure email" condition in the authorisation)
- **Controlled Drugs** — Tere will not send any Class A, B, or non-exempt Class C controlled drugs by email under this exemption. Those continue to require wet-ink signatures and are handled outside the standard e-prescription channel. Class C exempt / partially exempt medicines (paracetamol + codeine, Gee's Linctus, pholcodine) are the only Class C items that will appear on signature-exempt scripts.

**On NZePS:** we are in the Health New Zealand Digital Services approval queue for NZePS sending-party access. Application submitted; currently in the security-review phase (I responded to Trevor Lloyd's follow-up questions this week). Realistic timeline: NZePS credentials + UAT access within the next few months. Until then, direct email to the dispensary using the list you sent is our primary channel, with fax as fallback for the four stores not yet in the Medsafe register we scrape (Whangaparāoa, Constellation Drive, Homebase, Napier – Prebensen Drive — we'll pick those up automatically on the next register refresh).

When NZePS goes live for us, CW scripts will switch to NZePS as the primary channel (barcode + electronic download) and email will drop to backup.

If there's a specific header field or subject-line format your auto-routing rules need us to include so ingestion is smoother on your side, let me know and we'll adjust.

Ngā mihi,

Dr Patrick Herling
Founding Medical Officer, Tere Health Limited
MCNZ Registration: 99529
HPI-CPN: 24NSES
HPI-O: G11238-E
NZBN: 9429053723413
patrickherling@gmail.com
terehealth.co.nz
