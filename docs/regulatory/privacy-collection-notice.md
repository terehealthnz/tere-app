# Tere Health — Privacy Collection Notice

**Version 1.0 · 3 September 2026**

This is the notice we present to patients at the point of collection (Privacy Act 2020 IPP3, Health Information Privacy Code 2020 Rule 3).

---

## Who we are

Tere Health Limited (NZBN 9429053723413), HPI-O G11238-E, is a private rural telehealth service operating in New Zealand. Registered office: 41 Adams Lane, Blenheim 7201.

## What we collect

To provide safe telehealth care and meet our clinical, safety, and legal obligations we collect:

- **Identification** — your name, date of birth, gender, and (if you have one) your NHI number.
- **Contact information** — your phone, email, and physical address (for prescriptions and letters).
- **Health information** — your reason for consulting us, current medications, allergies, past medical history, and anything you tell your provider during the consultation. This includes your vitals (heart rate, oxygen saturation, respiratory rate) if captured by your device.
- **Clinical outputs** — the notes, prescriptions, referrals, and letters your provider writes.
- **Payment information** — the card / account used for payment (processed by our payment processor; we do not store card numbers).
- **Technical information** — your IP address, device type, and browser, captured automatically for security and audit purposes.
- **Recordings** — audio during your consultation may be captured for AI transcription (subtitles + notes). You can opt out at any time; the recording is not kept beyond note generation unless you specifically consent to research use.

## Why we collect it

- To provide your consultation and any prescription / referral / letter arising from it.
- To coordinate your ongoing care with your GP or another provider (with your consent).
- To meet safety and clinical duty-of-care obligations (e.g. controlled-drug prescribing rules, urgent handovers).
- To meet legal and regulatory obligations (Medical Council of New Zealand, ACC, Medsafe, HDC).
- To bill you (or ACC, if applicable) for the service.
- To keep an audit trail of who accessed your information and when (Rule 5).

## Who sees it

- **Your treating clinician** at Tere Health.
- **Their supervisor** if they are a supervised prescriber.
- **Our administrative team**, on a need-to-know basis, for scheduling, billing, and quality assurance. Every admin access is logged with a reason.
- **Your GP** (with your consent) — we send a summary letter after each consult.
- **Other providers** you consent to receive information (e.g. radiology, pharmacy, specialists).
- **ACC** if we bill the consult to your ACC claim.
- **Health New Zealand (Te Whatu Ora)** systems: HPI (provider identity), NHI (patient identity), NZePS (electronic prescriptions), MWS (medical warnings) — when connected.
- **Our regulator (HDC)** or **the Privacy Commissioner** if you complain about our care or a breach of your privacy.
- **A court**, if lawfully required (subpoena, coroner, etc.).

## Where it's stored

Your record is stored in encrypted databases operated by **Supabase** and **Amazon Web Services** in the **Sydney, Australia** region. Some processing (AI note-drafting, email delivery, SMS delivery, audio transcription) is performed by AWS in Sydney under a signed Business Associate Agreement. **This is an offshore disclosure under IPP12** — we have satisfied ourselves that AWS Sydney provides comparable safeguards to New Zealand law and is bound by our BAA.

Video calls run on **LiveKit** infrastructure in the Sydney region. Video audio is not persisted server-side by LiveKit.

Email delivery is via **Amazon SES** (Sydney) under BAA; SMS via **Amazon SNS** (Sydney) under BAA.

Payment processing is via **Stripe** (global). Card numbers never touch our servers.

## How long we keep it

- **Clinical records** — at least 10 years from the date of your last consultation (HIPC Rule 4, which sets the minimum retention period). Longer if we consider it necessary for your ongoing care.
- **Audit access log** — indefinitely (append-only) to satisfy accountability requirements.
- **Payment records** — 7 years (IRD business record requirement).
- **Security event log** — 24 months.

After the minimum retention period we may destroy records that are no longer needed. We will do this in a way that irreversibly removes them.

## Your rights

You have the right to:

1. **Access** your health information — request a copy at any time (Right 6 / IPP6).
2. **Correction** — ask us to correct information you believe is wrong or misleading (Rule 7 / IPP7). If we decline, we will note your correction alongside the disputed record.
3. **Withdraw consent** to share with your GP or another provider at any future point.
4. **Ask us to stop using AI features** — subtitles, AI note drafting, or research consent — at any time. This does not affect the clinical service.
5. **Complain** — to us directly first (support@terehealth.co.nz), then to the Health and Disability Commissioner (hdc.org.nz · 0800 11 22 33) for clinical concerns, or to the Office of the Privacy Commissioner (privacy.org.nz · 0800 803 909) for privacy concerns.

To exercise any of these rights: email **support@terehealth.co.nz** or use the Patient Support form on our website.

## Contact

- **Privacy Officer:** Dr Patrick Herling, Chief Medical Officer · privacy@terehealth.co.nz (or terehealthnz@gmail.com if that address bounces).
- **Postal:** 41 Adams Lane, Blenheim 7201.
- **Phone (queries):** +64 29 043 234 27.

Full privacy statement (technical detail, sub-processors, data flow diagrams): available on request or in `docs/regulatory/privacy-statement-full.md`.

---

## Change log

- 2026-09-03 — v1.0 initial notice, adds IPP12 offshore disclosure + full data-processor list. Supersedes the ad-hoc collection tick used in triage previously.
