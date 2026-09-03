# HQSC Serious Adverse Event Reporting SOP

**Regulator:** Health Quality & Safety Commission (Te Tāhū Hauora).
**Framework:** Adverse Events Learning Programme (formerly National Adverse Events Reporting Policy 2017).
**Owner:** Dr Rachel Thomas (Medical Director, clinical accountable). Patrick Herling operational.
**Distinct from:** CARM (drug adverse reactions — see `carm-reporting-sop.md`) and the HDC complaint pathway.

---

## 1. What HQSC wants reported

HQSC operates the Severity Assessment Code (SAC) matrix:

| SAC | Description | Report to HQSC? | Timeframe |
|---|---|---|---|
| **SAC1** | Death, severe permanent harm, or major loss of function directly attributable to healthcare. | **YES** — mandatory | Within **15 working days** of becoming aware |
| **SAC2** | Moderate permanent harm, or serious harm that resolved with treatment. | **YES** — mandatory | Within **15 working days** |
| **SAC3** | Minor harm requiring intervention. | Internal review; may report if pattern-forming | Optional |
| **SAC4** | No harm / near miss. | Internal only | N/A |

**Always Report and Review events** (specific list HQSC maintains) also trigger reporting regardless of SAC — e.g. wrong-site procedure, medication error causing serious harm, retained item.

For a telehealth service like Tere the most likely SAC1/SAC2 triggers are:
- Missed diagnosis leading to death or major morbidity within 30 days of a Tere consult
- Prescription error causing serious harm
- Failure to recognise a red-flag symptom (missed sepsis, MI, stroke, PE)
- Failure to escalate to 111 when clinically warranted

## 2. Detection

Serious events surface via:
1. **Provider self-report** — clinician identifies a concern during or after a consult.
2. **Patient complaint** — routed via `complaints` table; if severity='high' + care-affecting → check SAC coding.
3. **External notification** — GP letter, hospital discharge summary, coroner query.
4. **Family/carer contact** — via support form or complaint pathway.
5. **Media/regulator query** — rare but possible.

Every candidate event goes into the `incidents` table with `sac_severity` set (SAC1|SAC2|SAC3|SAC4).

## 3. Response timeline

### T = 0: Awareness
- Person identifying the event notifies Medical Director (Rachel) within 4 hours.
- Preserve all records: audit_logs, consultation notes, disclosure_events, related HL7 messages. Do NOT delete anything.

### T + 1 business day: Initial assessment
- Rachel + Patrick review: is this SAC1/SAC2?
- Confirm SAC coding; update `incidents.sac_severity`.
- If SAC1/SAC2: HQSC notification is now on a 15-working-day clock.

### T + 5 business days: Notify affected parties
- **Patient / family** — open disclosure conversation. Rachel leads. Documented in `incidents.disclosure_notes`.
- **Referrers** (GP, ACC, hospital) — if the event affects their onward care.
- **Insurer** (MPS, Delta) — mandatory per policy terms.

### T + 15 working days: HQSC notification
- Submit via HQSC's adverse events reporting portal.
- Include: what happened, SAC coding, immediate response, planned root-cause analysis, contact person.
- Save HQSC reference to `incidents.hqsc_reference` + stamp `hqsc_notified_at`.

### T + 70 working days: Root Cause Analysis (RCA)
- Structured RCA using HQSC's RCA toolkit.
- Involves: Rachel, Patrick, treating clinician (if not the reporter), external clinical review if warranted, patient/family input.
- Findings + corrective actions submitted to HQSC.
- Corrective actions become live tasks with owners + due dates.
- Anonymised summary shared at next Clinical Governance Meeting.

## 4. Concurrent obligations

An SAC1/SAC2 event will typically also trigger:

- **HDC notification** — if the event breached the Code of Rights, patient may complain to HDC (their choice); we may self-notify.
- **MCNZ/NCNZ notification** — if the event relates to a practitioner's competence, self-refer within 7 days.
- **Coroner** — if the patient died, mandatory Section 15 Coroners Act 2006 referral. See `coroner-death-reporting-sop.md`.
- **Insurer** — MPS + Delta both require prompt notification.
- **Privacy Commissioner** — only if a privacy breach also occurred (see privacy-breach-runbook.md).

## 5. Communication with the patient/family

- **Open disclosure principle** — patient told what happened, why we think it happened, what we're doing about it. Not "sorry you feel that way" — "sorry this happened."
- Do NOT admit legal liability without insurer consultation.
- Written follow-up within 10 working days summarising the conversation.
- Offer independent advocate (HDC Advocacy Service 0800 555 050).

## 6. Learning cycle

- RCA findings feed into onboarding + provider training.
- If a systemic issue (e.g. a UI element that led to error), Patrick opens a code task and prioritises.
- Anonymised summaries stored in `docs/regulatory/rca/YYYY-MM-brief-name.md` for organisational learning.
- After 5 years, RCA summaries move to the HDC Advisory learning archive per existing SOP.

## 7. Legal + insurance protection

- MPS policy requires prompt notification (typically within 5 working days). Do NOT settle or apologise-legally without their sign-off.
- Delta cyber cover triggers if an IT incident contributed to the event.

## 8. HQSC portal + contact

- Portal: https://www.hqsc.govt.nz/our-work/system-safety/adverse-events/
- Contact: adverse.events@hqsc.govt.nz
- Phone: (04) 901 6070

## 9. Roles quick-reference

| Task | Owner | Timeframe |
|---|---|---|
| Detect + report to Rachel | Any staff | 4 hours |
| Confirm SAC coding | Rachel + Patrick | 1 business day |
| Open disclosure to patient/family | Rachel | 5 business days |
| Notify insurer | Patrick | 5 business days |
| Submit HQSC notification | Rachel | 15 working days |
| Root Cause Analysis | Rachel + external if needed | 70 working days |
| CGM review | Rachel | Next CGM after RCA |

## Change log

- 2026-09-03 — v1.0 initial SOP. Rachel to review + sign off.
