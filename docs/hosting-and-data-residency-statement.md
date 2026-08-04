# Tere Health — Hosting and Data Residency Statement

**Version:** 1.0
**Date:** 2026-08-04
**Prepared for:** Health New Zealand — Te Whatu Ora, Digital Services (NZePS integration security review)
**Prepared by:** Dr Patrick Herling, Chief Medical Officer, Tere Health Limited

---

## 1. Company

| Field | Value |
|---|---|
| Legal entity | Tere Health Limited |
| NZBN | 9429053723413 |
| Registered office | 41 Adams Lane, Springlands, Blenheim 7201, New Zealand |
| HPI-O | G11238-E |
| ACC Vendor ID | G11238 |
| Company email | terehealthnz@gmail.com |
| Fax (inbound, Telnyx secure gateway) | +64 3 568 8145 |

---

## 2. Application hosting summary

Tere is a New Zealand-registered private telehealth service. All patient health information (PHI) is hosted in **Sydney, Australia (`ap-southeast-2`)** under AWS Business Associate Agreement (BAA, HIPAA-equivalent) and Supabase Data Processing Addendum. No PHI is stored in the United States.

| Layer | Provider | Region | Contract |
|---|---|---|---|
| Frontend + serverless API | Vercel | Sydney (Vercel Edge / AU region) | Standard Terms + DPA |
| Application database + storage | Supabase (managed Postgres) | Sydney (`ap-southeast-2`) | Standard Terms + DPA |
| AI inference (Anthropic Claude) | AWS Bedrock | Sydney (`ap-southeast-2`) via APAC cross-region inference profile | **BAA executed 2026-07-07** |
| Live subtitles (streaming ASR) | AWS Transcribe | Sydney (`ap-southeast-2`) | Covered under AWS BAA |
| SMS | AWS SNS | Sydney (`ap-southeast-2`) | Covered under AWS BAA |
| Video / audio (WebRTC) | LiveKit Cloud | Sydney (primary region); global edge for media relay only, no server-side recording | Standard Terms |
| Payment processing | Stripe | US (PCI-DSS Level 1). No PHI is sent to Stripe. | Standard Terms + DPA |
| Outbound email | Resend | US | Standard Terms (transactional email only, no clinical notes) |
| Outbound / inbound fax | Telnyx | US (transient transport) | Standard Terms |
| Error tracking (PII scrubbed) | Sentry | US | Standard Terms + DPA |

**Data-at-rest:** All PHI is stored in Sydney. US-based sub-processors (Resend, Telnyx, Sentry) handle transient data only and never receive full clinical records.

---

## 3. Data residency and cross-border transfer

- Patient consent for cross-border transfer (NZ → AU) is captured at the start of every consultation, in compliance with **HIPC Rule 12**.
- Consent copy explicitly names AWS Sydney and the BAA. Patients can decline; if they decline, the consultation does not proceed.
- No PHI is transferred outside AU/NZ. AI inference occurs in Sydney; live subtitles are streamed in Sydney; SMS is sent from Sydney.

---

## 4. NZePS-specific commitments

For the NZePS integration:

- All NZePS request/response payloads will be processed by Vercel functions in the AU region and persisted (if persisted) into the Supabase Sydney database.
- No NZePS payload will be sent to any US-hosted sub-processor.
- No NZePS payload will be sent to any AI provider. AI-assisted prescription drafting (e.g. Claude via Bedrock) operates on clinical-consult text upstream of NZePS submission; the NZePS message itself is generated deterministically by our code.

---

## 5. Verification checklist for Health NZ reviewer

The reviewer can independently verify each of the following:

| Item | How to verify |
|---|---|
| Supabase project region = Sydney | Ask Tere for the Supabase project dashboard URL — region is displayed at the top of the project settings page |
| AWS Bedrock region = ap-southeast-2 | Environment configuration in Vercel exposes `AWS_REGION=ap-southeast-2`; visible on AWS Bedrock console under the same account |
| AWS BAA in place | Copy of executed BAA available on request |
| LiveKit primary region = Sydney | LiveKit Cloud project settings page shows primary region |
| NZBN | https://www.nzbn.govt.nz search: `9429053723413` |
| HPI-O status | HPI-O G11238-E, issued by Shyam Dhanabalu (Health NZ Digital Services), 2026-07-26 |

---

## 6. Contact for verification

For any question on this document, or to request the executed AWS BAA, Supabase DPA, or Stripe DPA:

Dr Patrick Herling
Chief Medical Officer, Tere Health Limited
patrickherling@gmail.com
