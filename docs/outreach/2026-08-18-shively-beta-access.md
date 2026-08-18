**To:** Patrick Shively <shively@patrickshively.com>  ← replace with his real address
**From:** terehealthnz@gmail.com
**Subject:** Tere Health beta — access + a walkthrough of what to poke at

Kia ora Patrick,

Great chat tonight. Really enjoyed the medlegal-market framing — sharpens where we should aim in AU.

Here's the current NZ beta so you can see what we've actually built (rather than what we say we've built). Everything below runs on our live prod stack — same code Kiwi patients hit right now.

**Patient journey (do this first — 5 min)**
- **https://terehealth.co.nz** — pick "I need to see a doctor", walk through triage. AI triage, vitals capture via webcam, live subtitles in 15+ languages, structured consent (HDC Rights, prescribing, research), pharmacy picker with the entire NZ pharmacy register.
- Get through to the "waiting for provider" screen — don't pay unless you want the full experience.
- Optional: hit the vitals capture — the rPPG heart rate / RR / SpO2 from just a webcam feed is the most-demoed feature.

**Provider journey (10 min — I'll set you up a demo login)**
- Reply and I'll send a PIN + walkthrough. You'll see the queue, the consult view with AI-scribed notes, the prescribing modal (with automatic pharmacy routing), radiology referrals (auto-region-routed to 8 RHCNZ centres), and the admin panel.

**Where to look for AU relevance**
- **Admin → Team & Careers** — how we're structuring provider onboarding (MCNZ verification via HPI FHIR API today; would be AHPRA in AU).
- **Admin → Compliance** — audit log, complaints, incidents, breaches. This is the "defensible telehealth" wedge we discussed — it's already boring-and-solid, which reads as exceptional in AU.
- **The referral + prescription PDFs** — IRD-compliant invoicing, DG signature-exemption statements, HPI-O routing. AU equivalents are different but the pattern is portable.

**What we'd carry across day-one to AU:**
- The whole clinical + admin stack (Vercel + Supabase + AWS Bedrock BAA-covered AI, all Sydney-region)
- The referral, prescription, PDF, HL7 receive, audit-log infrastructure
- The consent + record-keeping model

**What we'd rebuild for AU:**
- AHPRA verification (~2-4h) instead of MCNZ/HPI
- Medicare item codes + rebate flow instead of ACC MST1/MST3
- Provider-Medicare-number field on providers table
- State-based intake routing (starting NSW-only is materially simpler than nationwide day-one)

Have a poke around, jot anything that jars, and let's regroup once you've had a look. The frank feedback is the useful bit — a lot of what's polished in NZ will look different through an AU lens.

Ngā mihi,

Patrick H

---

Dr Patrick Herling
CMO, Tere Health Limited
MCNZ 99529 · HPI-CPN 24NSES · HPI-O G11238-E
terehealthnz@gmail.com · terehealth.co.nz
