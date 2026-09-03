# Vendor Management Policy

**Version:** v1.0 · **Date:** 3 September 2026 · **Owner:** Patrick Herling
**Aligned to:** ISO 27001:2022 A.15 (Supplier Relationships), HISO 10029:2022 Domain 11, Privacy Act 2020 IPP12.

This policy describes how Tere Health selects, contracts with, monitors, and offboards third-party vendors that touch our data or our patients.

---

## 1. Scope

All third parties who:
- Store, process, or transmit Tere or patient data ("processors")
- Provide critical operational services (email, SMS, video, hosting, payment, AI)
- Handle regulated data (health, financial, personal)

Includes SaaS, PaaS, IaaS, professional services, and freelance contractors.

## 2. Vendor tiers

**Tier 1 (critical / PHI-touching)** — full assessment required:
- Supabase (Postgres + Storage + Auth)
- Vercel (compute + hosting)
- AWS (Bedrock + SES + SNS + Transcribe)
- Cloudflare (DNS + WAF + mTLS)
- LiveKit (video)
- Medical-Objects (HL7 receive)
- Stripe (payments)
- Wise (payouts)
- Telnyx (fax + SMS)
- Resend (email fallback)
- Sentry (error monitoring)

**Tier 2 (supporting / no direct PHI)** — light assessment:
- GitHub (code hosting)
- Notion / Google Workspace (internal collab)
- Domo / analytics tools (if adopted)
- Marketing tools (Mailchimp / Klaviyo — none currently)

**Tier 3 (peripheral)** — contract-only:
- Merchandise, printing, physical office supplies

## 3. Onboarding assessment (Tier 1)

Before signing:

1. **Data processing agreement (DPA) or BAA** — mandatory for anything PHI-adjacent.
2. **Security posture review** — SOC 2 Type II report requested; ISO 27001 cert acceptable; HITRUST also acceptable. If none, deep questionnaire.
3. **Data residency** — where is our data physically? NZ or Australia preferred; other regions require IPP12 disclosure + patient notification.
4. **Sub-processor list** — do they have sub-processors of their own? Chain-of-custody must be understood.
5. **Incident notification SLA** — must commit to notifying us of breaches within 48 hours (aligned to our 72h OPC obligation).
6. **Data deletion on termination** — must return or destroy all data on contract end, with certification.
7. **Right to audit** — we retain the right (though rarely exercised for large vendors).
8. **Insurance** — vendor carries adequate cyber/professional liability.

## 4. Ongoing monitoring

- **Annual review** of all Tier 1 vendors, aligned to quarterly access review cadence.
- **Sub-processor changes** — vendor must notify us; we assess whether new sub-processor changes IPP12 disclosure.
- **Security incidents at vendors** — we monitor status pages + incident emails.
- **Certification refresh** — annual SOC 2/ISO 27001 report requested.
- **Cost + usage** — monthly finance review for anomalies.

## 5. Register

The authoritative vendor register lives in `docs/regulatory/hiso-10029-conformance.md` §11. Duplicated for reference:

| Vendor | Purpose | Region | BAA/DPA | Compliance |
|---|---|---|---|---|
| AWS | AI/email/SMS/transcription | Sydney | ✓ BAA | SOC 2, ISO 27001, HIPAA |
| Supabase | DB + storage + auth | AWS us-east-1 | DPA | SOC 2 Type II |
| Vercel | Compute + hosting | Global edge, Sydney compute | DPA | SOC 2 Type II, ISO 27001 |
| Cloudflare | DNS + WAF + mTLS | Global edge | DPA | SOC 2, ISO 27001 |
| LiveKit | Video | Sydney | Confirmed E2EE audio | SOC 2 |
| Medical-Objects | HL7 messaging | AU | NDA + mTLS pinned | HL7 international |
| Stripe | Card payments | Global | Payment processor | PCI DSS L1 |
| Wise | Payouts | Global | Payment processor | PCI DSS + FSA |
| Telnyx | Fax + SMS | Global | DPA, HIPAA-eligible | SOC 2 |
| Resend | Email fallback | Global | DPA reviewed (task #307) | SOC 2 |
| Sentry | Error monitoring | EU | PII-scrubbed | SOC 2 |

## 6. Onboarding checklist (Tier 1)

- [ ] Business case + owner named
- [ ] DPA/BAA signed and filed in `docs/regulatory/vendor-agreements/`
- [ ] Security posture reviewed + captured
- [ ] Data residency documented + IPP12 disclosure updated if offshore
- [ ] Sub-processor list captured
- [ ] Incident notification pathway confirmed
- [ ] Access provisioned per least-privilege
- [ ] Cost centre allocated
- [ ] Added to vendor register
- [ ] Annual review scheduled

## 7. Offboarding checklist

- [ ] Notice period per contract
- [ ] Data extraction + verification
- [ ] Deletion certificate obtained
- [ ] Access revoked
- [ ] Cost centre closed
- [ ] Register updated
- [ ] Retention of contract for 7y post termination

## 8. Vendor risk incidents

If a Tier 1 vendor has a security incident:
1. Assess whether Tere data is affected.
2. If YES → treat as our incident (follow `privacy-breach-runbook.md`).
3. If UNKNOWN → assume yes until proven otherwise.
4. Document everything.

## 9. Review

- Reviewed annually by Patrick.
- Onboarding process reviewed after any new Tier 1 vendor.

## Change log

- 2026-09-03 — v1.0 initial policy.
