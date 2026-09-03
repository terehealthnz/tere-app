# ISO/IEC 27001:2022 Certification Pathway — Tere Health Ltd

**Status:** Phase 1 draft (planning) · **Owner:** Patrick Herling (CMO) · **Target certification date:** Q4 2027
**Standard:** ISO/IEC 27001:2022 — Information Security Management Systems
**Aligned frameworks:** HISO 10029:2022 (NZ) · SOC 2 Type II (US market) · NIST CSF 2.0

This plan describes how Tere reaches ISO 27001 certification in a phased, low-cost way suitable for a two-founder company scaling to ~10 staff and enterprise NZ health customers (PHOs, DHBs, insurers, ACC).

---

## Why certification, why now

- **NZ enterprise customers** (PHOs, HNZ, insurers, corporate wellness) increasingly require an information-security certification before signing SaaS contracts. HISO 10029 is table stakes; ISO 27001 is what earns you a seat at the table.
- **US market entry** (via terecare.com) — HIPAA covers the healthcare-specific pieces, but SaaS buyers still ask for ISO 27001 or SOC 2. Certifying against ISO 27001 gives us a globally-recognised badge that maps cleanly onto SOC 2 Trust Services Criteria (TSC) for a future SOC 2 add-on with minimal extra work.
- **Insurance premium** — Delta and MPS both discount cyber premiums for certified organisations (~15-30% off).
- **Regulatory tailwind** — MoH's National Digital Health Strategy 2024 signalled all critical health SaaS should be certified within 24 months.

## Cost/timeline reality check

| Item | Cost estimate (NZD) | Notes |
|---|---|---|
| Gap analysis (external consultant) | $6,000–12,000 | Half a day of workshops + ~2 weeks written gap report |
| ISMS documentation work | ~$0 (internal, Patrick) | Reuse HISO 10029 pack + privacy runbook as starting evidence |
| Internal audit (independent) | $4,000–8,000 | Same consultant or a different one — required before certification audit |
| Stage 1 audit (readiness) | $4,000–6,000 | Registrar review of documentation |
| Stage 2 audit (certification) | $10,000–15,000 | On-site + evidence sampling |
| Annual surveillance audit | $6,000–10,000 | Years 2 + 3 |
| Recertification (Year 4) | $10,000–15,000 | Full audit again |
| **Year-1 total** | **$24,000–41,000** | Excluding staff time |

Realistic timeline: **12–18 months** from gap analysis to Stage 2 certification, depending on remediation velocity. At current 2-person team + Patrick's other loads, target **October 2027** for Stage 2 completion.

---

## Where Tere already stands (based on internal pen test + HISO 10029 pack)

**Strong — likely to pass with light polish:**
- Access control (guardProvider + PhiRevealGate + MFA + role snapshots) — A.9 / A.5.15
- Cryptography in transit + at rest (TLS 1.2+, AES-256, mTLS on HL7 receive) — A.10 / A.8.24
- Backup + PITR (Supabase 7-day window, tested via #264 recovery) — A.12.3 / A.8.13
- Logging + monitoring (audit_logs + security_events + nightly anomaly cron) — A.12.4 / A.8.15/16/17
- Incident response (privacy-breach-runbook + security-alert + break-in alerting) — A.16 / A.5.24/25/26/27/28
- Supplier management (BAAs, DPAs, PIA sub-processor register) — A.15 / A.5.19/20/21/22/23
- Physical security (no on-prem, all SOC 2 vendors) — A.11 / A.7.*
- Change management (git + PR review) — A.12.1 / A.8.32

**Partial — needs remediation:**
- Formal risk assessment methodology (we have implicit judgements; no documented register)
- Statement of Applicability (SoA) — required deliverable, doesn't exist
- Documented ISMS scope + policies (informal today)
- Business continuity plan (DR runbook exists; BCP as a document does not)
- Asset register (data classification is implicit; formal register missing)
- Awareness training records (informal; no attendance log)
- Supplier assurance evidence file (BAAs exist; consolidated file doesn't)
- Malware protection on file uploads (flagged as gap in HISO 10029 doc)
- Formal SBOM
- Regular internal audit programme (nothing formal today)

**Not started:**
- Management review cycle
- Documented objectives + KPIs for security
- ISMS committee / governance meetings

---

## Phased plan

### Phase 1 — Foundation (months 1–3, target Q1 2027)

Goal: get the mandatory ISMS artefacts written and living in the repo. No external spend yet.

**Deliverables:**
1. **ISMS scope document** — defines what's in-scope for certification (product, environments, personnel, sub-processors). Draft location: `docs/regulatory/isms/00-scope.md`
2. **Information security policy** (top-level) — 2-page management commitment statement, signed by Patrick + Rachel. `docs/regulatory/isms/01-policy.md`
3. **Risk assessment methodology + register** — pick a method (recommend NIST CSF risk register format for accessibility). Populate with top 30 risks. `docs/regulatory/isms/02-risk-register.md`
4. **Statement of Applicability (SoA)** — table of all 93 Annex A controls with "Applicable Y/N + evidence pointer". Massive reuse of the HISO 10029 doc. `docs/regulatory/isms/03-soa.md`
5. **Asset register** — data classification, sub-processors, business systems. `docs/regulatory/isms/04-asset-register.md`
6. **BCP** — recovery objectives, DR playbook. Extends existing incident runbook. `docs/regulatory/isms/05-bcp.md`
7. **Training + awareness log** — start recording every provider's onboarding cybersecurity briefing + annual refresh. Extend the existing training checklist.
8. **Supplier assurance file** — consolidated PDF of AWS BAA, Supabase DPA, Vercel DPA, Cloudflare DPA, Telnyx DPA, LiveKit MSA, Stripe DPA, Wise MSA, Sentry DPA, Resend DPA. Fresh signed copies where any expired.

**Executor:** Patrick, reusing existing docs. Estimated effort: 40 hours across 3 months.

### Phase 2 — Gap remediation (months 4–8, target Q2–Q3 2027)

Goal: close the technical gaps + establish operational cadence.

**Technical remediation:**
- Column-level pgcrypto encryption for highest-sensitivity PHI (task #296)
- Malware scanning on file uploads (ClamAV-style, integrated with existing upload path)
- Formal SBOM generation on every build (npm-based; use `@cyclonedx/cyclonedx-npm` in CI)
- Cloudflare Zero Trust on /admin (task #294)
- Cloudflare rate limiting per PHI endpoint (task #295)
- Automated dependency vulnerability scanning in CI (Dependabot + Snyk or GitHub Advanced Security)
- Break-glass account procedure documented + tested

**Operational cadence:**
- **Monthly ISMS committee meeting** — Patrick + Rachel + (later) any hire — 30 min. Review anomaly cron output, security_events, complaints, incidents, patch status.
- **Quarterly access review** — walk the providers list, confirm each role still appropriate, disable dormant accounts.
- **Semi-annual DR test** — restore prod from PITR to a scratch project, verify data integrity.
- **Annual policy review** — walk every ISMS document, update where needed.
- **Awareness training** — annual refresh, evidenced by signed attestation.

**Executor:** Patrick (code) + Rachel (governance meetings). Estimated effort: 100 hours across 5 months.

### Phase 3 — Internal audit + Stage 1 (months 9–11, target Q3 2027)

Goal: prove the ISMS is operating, hire an external consultant to do a mock audit, then book the certification body's Stage 1.

**Consultant engagement:**
- Get 2–3 quotes: **BSI** (large, expensive, well-known), **JAS-ANZ accredited registrars** like **AsureQuality** or **Certification Australia**, and **niche healthcare-focused firms** like **CyberCX** or **PS+C**.
- Preferred: healthcare-focused firm for the gap analysis + internal audit; then a larger registrar (BSI or SGS) for the actual certification audit (name recognition helps in customer conversations).

**Internal audit:**
- Consultant walks every Annex A control, samples evidence, reports non-conformities.
- Remediation window: 30 days.

**Stage 1 (registrar readiness review):**
- Documentation review only.
- Registrar issues findings; we fix them before Stage 2.

### Phase 4 — Stage 2 audit + certification (months 12–14, target Q4 2027)

- 3–5 day on-site + remote audit by the registrar's lead auditor.
- Evidence sampling: interview Patrick, Rachel, any staff; review audit_logs, security_events, incident records; test backup restore; walk through incident response with a tabletop exercise.
- Registrar issues certification decision.

**Post-certification:**
- Certificate valid 3 years, subject to annual surveillance audits (lighter than Stage 2).
- Recertification at Year 4.

---

## Sequencing with US expansion (SOC 2)

SOC 2 Type II covers roughly the same ground as ISO 27001 but reports observations against Trust Services Criteria for a *period* (e.g. 6 months). Getting ISO 27001 first, then adding SOC 2 Type II a year later, is the cheapest sequence:

- ISO 27001 → all the ISMS + controls work. Q4 2027.
- SOC 2 Type II add-on → 6 months of evidence collection after certification, then a formal audit. Q2–Q3 2028.

Do NOT try to do them in parallel — the paperwork overhead doubles for near-identical output.

---

## Immediate next actions (this quarter)

1. Create `docs/regulatory/isms/` directory + stub the 8 Phase 1 documents.
2. Get 3 quotes for gap analysis (BSI, Certification Australia, CyberCX healthcare). Budget line: $6-12K.
3. Book monthly ISMS committee slot in calendar (Patrick + Rachel).
4. Add ISMS as a Notion/whatever-you-use tracker so Phase 2 remediation gets sequential attention.

## Success criteria

- Stage 2 certification achieved by 2027-12-31.
- Zero major non-conformities at Stage 2.
- Certificate covers "clinical telehealth SaaS platform" including terehealth.co.nz + terecare.com.
- First enterprise customer signed within 90 days of certification (proof it unlocks revenue).

---

## Change log

- 2026-09-03 — v1.0 initial pathway plan. Assembled from HISO 10029 conformance pack + pen test outcomes + risk landscape assessment. Needs review by external consultant during gap analysis phase.
