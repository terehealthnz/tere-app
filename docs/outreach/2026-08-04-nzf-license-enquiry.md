# Draft — NZ Formulary license enquiry

**Date:** 2026-08-04
**To:** licence@nzformulary.org (verify — the URL patrick shared has the license form: https://www.nzfchildren.org.nz/home/licence)
**Cc:** (none)
**From:** Dr Patrick Herling — patrickherling@gmail.com

**Subject:** Licence enquiry — NZ Formulary + NZFC integration for a NZ telehealth service

---

## Draft body

Tēnā koutou,

I am writing to enquire about licensing the New Zealand Formulary (NZF) and New Zealand Formulary for Children (NZFC) for integration into a new NZ-registered clinical service.

**About us**

Tere Health Limited (terehealth.co.nz) is a NZ-owned tele-urgent care service, currently pre-launch, built to serve people who can't easily reach a clinic — rural and remote communities, shift workers, and after-hours patients. All clinical decisions are made by MCNZ-registered doctors and NCNZ-registered nurse practitioners.

**What we would like to do**

We want to integrate NZF (and NZFC for paediatric consults) into our prescribing workflow so that:

1. A prescriber selecting a common presentation can see the current NZF-recommended drug, standard adult dose, standard paediatric weight-based dose, and duration for that indication.
2. The prescriber can pre-fill the prescription from that NZF recommendation and edit as clinically appropriate before finalising and signing.
3. The prescriber sees NZF interaction warnings if a proposed medicine is contraindicated with something already on the patient's active medications list.

This is not a public consumer-facing product — the NZF content would only be visible to authenticated NZ-registered prescribers during their clinical workflow.

**What we're asking**

1. **Data access route.** Is there a supported API or data feed for NZF/NZFC content, or is licensing limited to the interactive website? If an API exists, we'd like the technical documentation.
2. **License terms and cost.** What are the license fees for a small NZ clinical service (initially <10 prescribers, expected to grow)? Are there tiered pricing structures?
3. **Update cadence.** How often is NZF/NZFC content refreshed, and what mechanism keeps a licensed integration in sync?
4. **Attribution requirements.** What acknowledgement wording is required in-product and in exported prescriptions?
5. **Restrictions.** Are there any restrictions on caching, on which drugs (e.g. controlled drugs), or on the interaction warning subset we can expose?

**Ethical + clinical positioning**

Tere Health uses NZF as the authoritative reference — we do not want to substitute a curated in-app drug list for the real NZF content in a way that could go out of date and cause harm. If a proper NZF license is not available, we would prefer to continue directing prescribers to the NZF website for reference rather than build a smaller, un-updated internal list.

Happy to arrange a call or share our clinical workflow documentation if that would help scope the conversation.

Ngā mihi,

**Dr Patrick Herling**
Founding Medical Officer, Tere Health Limited
NZ Medical Council Registration: 99529
patrickherling@gmail.com
terehealth.co.nz

---

## Notes for Patrick before sending

1. **Verify the recipient email**. The license page linked has a form (https://www.nzfchildren.org.nz/home/licence) — that's probably the correct route. If there's also a general contact email like `licence@nzformulary.org`, use it. If unclear, submit via the form and Cc the same content to `enquiries@nzformulary.org` (if that address exists).
2. **Timing**. NZF is a small team. Realistic reply timeframe: 1–3 weeks.
3. **Budget mental model**. Similar NZ health data licenses (Medsafe register, HL7 NZ, HISO codes) tend to run in the low thousands NZD per year for small commercial users. NZF may be similar or higher — set expectations that this could be $2–10k/year and factor into the ~pre-launch budget.
4. **If they say no or price is prohibitive**. Fallback options in order of preference:
   - Point prescribers to the NZF website in a Reference tab (no license needed — just deep-links)
   - License a smaller-scope resource (e.g. bpac.org.nz decision-support snippets)
   - Build a curated internal template list with a stern "Confirm against NZF" warning, refreshed manually every 3 months
