# Software Licence Agreement v2 — Review Summary

**Source:** `software-licence-agreement-template.md` (v1, 855 lines)
**Output:** `software-licence-agreement-v2.md` (891 lines)
**Status:** ready for NZ lawyer review (recommended: Heather Collins at Pitt and Moore — confirm scope covers commercial IP as well as employment).

---

## Business decisions baked in (Patrick, 2026-09-07)

1. **Cl 15.2 liability cap** — dynamic reference to whatever Delta Tech Liability sum insured is at the time of the event, with the 12-month fees floor. Placeholder currently NZD 2,000,000 in Cl 18.1(a); update with actual Delta schedule figure before circulating.
2. **Cl 10.2A service credits** — only for P1 outages: 5% credit if >4 consecutive hours in a month, 10% if >24h cumulative, 25% if >72h cumulative. Capped at 25% of monthly Fees. Sole and exclusive financial remedy.
3. **Cl 18.2 Licensee PI** — category-based (mirrors contractor v8), not fixed quantum. Licensee's clinicians need Medical Indemnity in an appropriate category; entity holds appropriate PI. No specific dollar minimum.
4. **Cl 13.1(a) Tere Vitals disclosure** — kept in the clause (not moved to schedule) — honest, Delta-aligned.

## Structural changes (19 edits total)

### Definitions
- Added **Health Services** (used throughout, was previously undefined)
- Added **Medical Indemnity** (same phrasing as contractor v8, insurance-or-discretionary)

### Commercial terms
- Cl 3.1(c) "materially competing product or service" now defined (was undefined + open to interpretation)
- Cl 5.2 non-renewal notice: 60 days → **90 days** (enterprise-appropriate)
- Cl 6.3 fee-increase cap: CPI + 3%, or 3% flat, whichever greater. Anything above needs Licensee agreement.
- Cl 10.2A service credits (see above)
- Cl 11.5 acceptance testing (NEW) — 30-day UAT window post-go-live; Licensee may terminate with pro-rata refund if material defect not remedied in 20 Business Days.

### Data / privacy / security
- Cl 8.2(b) region filled: `ap-southeast-2` (Sydney)
- Cl 8.2(g) explicit incorporation-by-reference of Security Compliance Statement, PIA, and Hosting & Data-Residency Statement
- Cl 8.6 (NEW) HIPC Rule 12 offshore-notice obligation on Licensee — they must include an offshore-processing notice in their patient-facing privacy statement. Licensor will provide standard wording.
- Schedule 3 email provider filled: AWS SES Sydney (per SES cutover). LiveKit region flagged for pre-signature confirmation.

### Liability / insurance / IP
- Cl 15.2 cap now dynamic — tied to Cl 18.1(a) Tech Liability sum insured at time of event (with 12mo Fees floor)
- Cl 15.4 clinical-decision liability tightened: "Licensor has no liability for any Clinical Decision made by an Authorised User" (was defensively hedged)
- Cl 17.4 (NEW) IP infringement remedy chain: (a) procure right to continue, (b) modify to non-infringing, (c) terminate + pro-rata refund. Sole and exclusive remedy for third-party IP claims.
- Cl 18.1(a) Tech Liability limit now dynamic reference to Delta schedule (placeholder NZD 2M)
- Cl 18.2 Licensee PI split into Medical Indemnity (clinicians) + entity PI (organisation), both category/appropriate-to-scope rather than fixed quantum

### Governance / ops
- Cl 19.4 (NEW) joint-claim defence cooperation
- Cl 22.12 (NEW) audit rights — either party, 20 BD notice, max once per year, on Cl 8 + Cl 16 compliance
- Cl 22.13 (NEW) publicity — mutual consent required, except Licensor may add Licensee to public "customers" list unless objected in writing

### Drafting notes
- Updated end-of-doc drafting notes (9 items) to reflect current placeholder state + resolved items removed

## What v2 did NOT change (deliberately preserved)

- Cl 12 Clinical Responsibility — untouched, strong as-drafted
- Cl 13 Medical Device Status — WAND numbers, VitalsValidate disclosure — kept (Patrick's decision)
- Cl 22.11 Contracts (Privity) carve-out for Authorised Users to enforce Cl 12 — kept (flagged in drafting notes for lawyer's call)
- Cl 8.5 dual Health-Agency framing — kept, structurally correct
- Cl 9.4 90-day post-termination data deletion + retention exception — kept
- Governing law NZ (Cl 22.1) — kept, drafting notes flag AU/US as separate deal-by-deal

## Open items requiring Patrick / lawyer input

- **Cl 18.1(a) actual Delta Tech Liability sum insured** — insert real figure before circulating (currently placeholder NZD 2M). Cl 15.2(a) is now downstream of this so aligns automatically.
- **Schedule 3 LiveKit region** — confirm actual current LiveKit Cloud region deployed for Tere.
- **Whether Pitt and Moore does commercial IP** — this agreement is commercial/IP law rather than employment. Heather may take it, refer within, or say not their shop. Ask before you scope her against this doc.
- **Cl 22.11 privity carve-out** — retained but drafting notes flag it; lawyer's call whether to keep.
- **Cl 5.2 auto-renewal** — public-sector counterparties (PHOs) may refuse. Doesn't need pre-signature change but flag it if the first licensee is a PHO/GP practice.

## Sequencing recommendation

1. Fill Cl 18.1(a) with actual Delta Tech Liability limit + Schedule 3 LiveKit region (both ops tasks).
2. Send v2 to Heather Collins with a scoping question — does Pitt and Moore's coverage extend to commercial software licensing, or does she need to refer within the firm?
3. If yes, add v2 to the same engagement as the contractor v8 review (cost-efficient — same reviewer covers both).
4. If not, get a referral for a commercial IP lawyer.
5. Deferred: render v2 as PDF once lawyer edits are applied (contractor-agreement style).

## Rendering

Markdown source is preferred for lawyer review (they can mark up inline). PDF render is deferred until final version to avoid rendering twice.
