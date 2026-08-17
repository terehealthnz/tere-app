# RHCNZ imaging integration meeting — talking points for Justin

**Meeting:** Monday 17 August 2026, 10:00–11:00 NZST · Video call
**Their side:** Holly Johnson (Business Partner / Applications Consultant), Jesse Thorpe · referred by Shayne Hunter (Chief Digital Officer, RHCNZ)
**Our side:** Justin Thomas
**Scope:** Two-way radiology integration — Tere → RHCNZ (referrals) and RHCNZ → Tere (reports)
**Prior context:** Patrick H already agreed the model with Shayne (see emails 2026-08-02 to 2026-08-11). This is the implementation-detail follow-up.

---

## 1 · What Shayne already agreed with Patrick

**Do not re-open these — they're settled. Confirm and move on.**

1. **Referrals**: Tere sends imaging referrals to RHCNZ as **secure-emailed PDFs** (system-generated, formatted) as the interim pathway. Longer-term Tere may move to HealthLink HMS.
2. **Reports**: RHCNZ sends results back via **Medical Objects** to Tere's HPI-O **G11238-E**, routed to the Tere provider inbox.
3. RHCNZ recommended MO over HealthLink (better priced, preserves report structure + hyperlinks).
4. Alternative report pathways discussed: log into RHCNZ's PACS, or Aura Consult (their portal). Aura Consult API is being investigated by their supplier.
5. RHCNZ covers ARG, BAY, PRG (large private radiology network).

---

## 2 · Where we are on our side (Justin should be able to state this)

- **Tere is its own PMS** — internal clinical record, transcript, e-prescribing, referrals, discharge summaries, secure messaging. Not built on Medtech / indici / MyPractice. Rostered shift model, not fixed-clinician inboxes.
- **Medical Objects receive endpoint**: built and deployed. Sydney-hosted, mTLS-terminated. Parser validated against MO's NZ v2.1 and v2.4 samples.
- **MO client-cert exchange**: in progress with Tony Cruice at MO Helpdesk (case #1058382). Our HPI-O G11238-E confirmed as the org receiver.
- **HPI-O**: G11238-E (active).
- **Committed clinical SLA**: Tere reviews every imaging result within 24 hours.

---

## 3 · What we need to lock in on this call

### A. Referral pathway (Tere → RHCNZ)

1. **What email address do we send referrals to?** One per RHCNZ subdivision (ARG / BAY / PRG), or a central intake?
1a. **How do we coordinate the location of the imaging request?** This is the big operational unknown. Options — and we need to know which shape RHCNZ works to:
   - **(a)** Tere picks the RHCNZ site on the referral (based on patient's postcode / travel preference) and sends the PDF straight to that site.
   - **(b)** Tere sends to a single central intake; RHCNZ routes internally to the nearest branch based on patient address.
   - **(c)** Tere sends the referral; RHCNZ contacts the patient directly to offer / book a location.
   - **(d)** Patient phones RHCNZ themselves after we hand them a referral copy.

   Related: does the patient book their own slot, or does RHCNZ contact them with an appointment? Who owns the "did the patient actually turn up" loop — Tere follow-up, or RHCNZ?
2. **What PDF format and fields are mandatory?** Ask for a sample of what a compliant referral looks like today.
3. **Minimum patient identifiers required?** NHI, DOB, sex, address, contact? What happens if NHI missing (new patient, tourist)?
4. **Referring clinician identifiers required?** HPI-CPN, MCNZ number, contact phone?
5. **Clinical fields** — modality (X-ray, US, CT, MRI, DEXA), body part, indication, urgency, relevant clinical history, current medications, allergies (esp. contrast), pregnancy status?
6. **ACC vs privately funded** — how do you want us to indicate funding source? Do you need the ARC number on the referral?
7. **Urgency flags** — is there a fast-track pathway for urgent (24-hour) vs routine imaging?
8. **Confirmation / receipt** — do you send an auto-receipt when the referral is accepted, or is it silent?
9. **Rejection loop** — if a referral is incomplete, how does RHCNZ notify us (email back to sender, portal, phone)?

### B. Report delivery (RHCNZ → Tere via Medical Objects)

10. **Who at RHCNZ configures Tere as an outbound MO recipient?** Get the specific person + timeline.
11. **What MO identifier format do you send in MSH-5/MSH-6?** Confirm HPI-O G11238-E is what your MO config will target, and whether you use `G11238-E`, `(G11238-E)` variants, or a friendly name (we already accept all three at parser level).
12. **NHI in reports** — do you send it in PID-3? Any HL7 variant we should know about (2.1 vs 2.4)?
13. **Attachment handling** — do reports include PDF (OBX ED-typed, base64) or is it text/OBX narrative? Our parser handles both; want to know the default.
14. **Retention / duplicates** — if a report is amended, do you send a new message (with a supersedes reference) or the same control ID?
15. **Test-round-trip plan** — can you send us a de-identified sample HL7 message + PDF today (or point to one) so we can confirm our parser is happy before real referrals flow?

### C. Fallback / secondary pathways

16. **PACS / Aura Consult access** — Zoe McCormick set up Patrick's InteleConnect viewing account. Do we extend that to Tere's roster of clinicians, or keep it 1 account? What's the SSO / IdP situation?
17. **Aura Consult API** — status of the API investigation with your supplier. Any ETA or documentation we can review?

### D. Commercial + operational

18. **Any fees on the RHCNZ side** for MO outbound configuration or referral intake?
19. **Cutoff to go live** — once MO outbound is configured and test round-trip passes, what's the RHCNZ acceptance criteria for us to start sending real referrals?
20. **Escalation path** — a name + phone for when a report is time-critical (e.g. suspected PE on CTPA) and we need to raise it with a radiologist.

---

## 4 · Concrete asks (the "leave-with" list)

Justin should leave the call with the following actions committed:

- [ ] **Owner + timeline** for adding Tere (HPI-O G11238-E) as an outbound MO recipient in RHCNZ config.
- [ ] **Referral intake email address(es)** in writing.
- [ ] **Location-routing model** confirmed — Tere-picks-site, RHCNZ-routes, RHCNZ-books-patient, or patient-books-themselves — plus who owns the "did the patient turn up" loop.
- [ ] **Sample referral PDF** showing the format RHCNZ expects.
- [ ] **Sample HL7 report message** (de-identified) so we can smoke-test our parser end-to-end.
- [ ] **Escalation phone number** for time-critical findings.
- [ ] **Named contact** at RHCNZ for ongoing operational issues once live.

---

## 5 · What Justin should offer / provide

- Our Medical Objects endpoint is deployed and being finalised with Tony at MO Helpdesk — Tere is a couple of days from being ready to receive on the test network.
- Our HPI-O G11238-E is active and verified with Te Whatu Ora HPI.
- We can send a first test referral within a day of RHCNZ confirming the intake email.
- We handle report ingestion into the Tere provider inbox — no login-into-portal fatigue for our clinicians.
- We can share our hosting + data residency statement, WAND MedSafe notification, and Declaration of Conformity if useful (files in `docs/`).

---

## 6 · Watch-outs

- **Don't re-negotiate the referral format.** Shayne agreed PDF as interim. Confirm details, don't re-open the vehicle.
- **Don't commit to volume.** We're in beta with real patients but not yet at production scale — say "growing" not a specific number.
- **Don't sign anything on the call.** Any service agreement or data-sharing agreement goes to Patrick H for review.
- **Don't promise NZePS via RHCNZ** — that's the HNZ pathway, unrelated.
- **If they ask about paediatrics** — Tere WAND scope is adults 18+.

---

## 7 · Post-meeting deliverables (Justin commits to)

- Same-day written recap to Holly + Jesse: agreed intake email(s), agreed HPI-O routing, agreed test-round-trip plan, agreed timeline.
- Test referral sent within 1 business day of receiving the intake email.
- Test MO parser round-trip within 1 business day of receiving the sample HL7 message.
- Loop Patrick H in on any commercial or clinical scope questions we can't answer on the call.

---

## 8 · One-liner Justin can lead with

> "Kia ora Holly, Jesse — thanks for making time. Shayne and Patrick have already agreed the shape of this: we send you referrals as secure-emailed PDFs, you send reports back via Medical Objects to our HPI-O G11238-E. Our MO endpoint is standing up this week. I'm here to nail the operational detail — intake addresses, mandatory fields, and a test round-trip plan — so we can start with a first real referral within days rather than weeks. Sound OK?"

---

## Reference material to have open

- Prior email thread with Shayne Hunter (2026-08-02 to 2026-08-11) — settled scope
- MO integration status: `hl7-mtls-proxy/README.md` + `api/_hl7-inbound.js`
- Our identifiers: HPI-O G11238-E, HPI-CPN 24NSES (Patrick), MCNZ 99529
- Hosting statement: `docs/hosting-and-data-residency-statement.md`
- WAND cert: `docs/regulatory/2026-08-13_WAND_260729-WAND-786DQ9_Tere_Vitals_active.pdf`
