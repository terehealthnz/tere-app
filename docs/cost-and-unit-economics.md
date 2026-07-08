# Tere Health — Cost Structure & Unit Economics

*Prepared: 2026-07-08 — internal review*

## Executive summary

Tere Health operates a bootstrapped rural NZ telehealth platform. Unit economics are strong: each $65 NZD video consult retains ~66% margin after all vendor costs and provider fees (~$42.73 net to Tere). At 10 consults per day the business generates ~$74k after-tax retained profit annually (before company overhead).

## Assumptions

- **Currency conversion**: 1 USD = 1.67 NZD (spot rate at time of writing)
- **Payment processor**: Windcave (recommended) at 1.9% + $0.30 NZD per transaction. Currently on Stripe (2.9% + $0.30 USD).
- **Provider fees**: $20 NZD per video/phone consult; $10 NZD per async message consult
- **Working pattern**: 240 days/year (5 days/week × 48 weeks) unless stated otherwise
- **NZ company tax rate**: 28%
- **Vendor rates** verified against current supplier pricing as at July 2026

## Vendor stack — variable costs per consult

| Vendor | Purpose | Cost per consult (NZD) |
|---|---|---:|
| Deepgram (nova-3-medical) | Speech-to-text for Scribe | $0.28 |
| AWS Bedrock (Claude Sonnet 4.5) | Note generation, triage AI, translations | $0.05–0.95 |
| Telnyx | SMS patient notifications | $0.08 |
| Telnyx | Fax prescriptions to pharmacy | $0.13 |
| Resend | Email delivery (join links, receipts) | $0.00 (free tier) |
| LiveKit Cloud | Video/audio SFU | $0.00 (free tier) |
| Supabase | Database + storage | $0.00 (free tier) |
| Vercel | Web hosting + serverless functions | $0.00 (free tier) |

## Fixed monthly overhead

| Item | NZD/mo |
|---|---:|
| Telnyx AU SMS number | $9.20 |
| Telnyx NZ fax number | $8.35 |
| Domain (terehealth.co.nz) | $5.00 |
| **Total fixed overhead** | **~$22.55** |

At 300 consults/month (10/day × 30) that's ~$0.08 per consult — negligible.

## Per-consult unit economics

### Video/phone consult — $65 NZD

| Line | NZD |
|---:|---:|
| Patient charge | +$65.00 |
| Windcave payment fee | −$1.54 |
| Provider fee | −$20.00 |
| Deepgram STT (Scribe) | −$0.28 |
| AWS Bedrock (notes + triage AI) | −$0.08 |
| Telnyx SMS (join notification) | −$0.08 |
| Telnyx fax (prescription delivery) | −$0.13 |
| Fixed overhead allocation | −$0.16 |
| **Tere Health net (per consult)** | **$42.73 (65.7%)** |

### Video consult with AI subtitles — non-English patient

Adds Deepgram second stream (−$0.28) and Bedrock Sonnet 4.5 translation (−$1.50). Net: **$40.95 (63%)**.

### Async message consult — $25 NZD

| Line | NZD |
|---:|---:|
| Patient charge | +$25.00 |
| Windcave payment fee | −$0.78 |
| Provider fee | −$10.00 |
| AWS Bedrock (response generation) | −$0.08 |
| Telnyx SMS | −$0.08 |
| Fixed overhead allocation | −$0.16 |
| **Tere Health net (per consult)** | **$13.90 (55.6%)** |

## Scale scenarios — annual business P&L

Based on 10 video consults per day, various working patterns:

| Working pattern | Consults/yr | Gross revenue | Profit before tax | After 28% tax |
|---|---:|---:|---:|---:|
| 5 days/wk, 4 wks off (240 days) | 2,400 | $156,000 | $102,552 | **$73,837** |
| 5 days/wk, 2 wks off (250 days) | 2,500 | $162,500 | $106,825 | **$76,914** |
| 6 days/wk, 4 wks off (288 days) | 2,880 | $187,200 | $123,062 | **$88,605** |
| 7 days/wk, 2 wks off (336 days) | 3,360 | $218,400 | $143,573 | **$103,372** |

### Alternative mixes at 10 consults/day, 240 working days

| Mix | Annual profit before tax | After 28% tax |
|---|---:|---:|
| All video (10v) | $102,552 | **$73,837** |
| 8 video + 2 async | $88,714 | **$63,874** |
| 6 video + 4 async | $74,875 | **$53,910** |

## Payment processor comparison — Stripe vs Windcave

| Consult type | Stripe fee (NZD) | Windcave fee (NZD) | Saving per consult |
|---|---:|---:|---:|
| Video $65 | $3.65 | $1.54 | **$2.11** |
| Async $25 | $1.62 | $0.78 | **$0.84** |

**At 100 video + 50 async / month**: ~NZ$253/mo saved = **~NZ$3,036/yr**

**At 200 video + 100 async / month**: ~NZ$506/mo saved = **~NZ$6,072/yr**

Plus removal of USD FX exposure and NZD invoicing for accounting simplicity.

## Overhead not modelled above

For a realistic operating budget, add:

| Item | NZD/yr estimate |
|---|---:|
| Xero accounting subscription | $840 |
| Professional indemnity + PI insurance | $3,000–$5,000 |
| Legal + compliance reviews (PIA, contracts) | $2,000–$4,000 |
| Marketing / patient acquisition | $5,000–$30,000 (variable) |
| Provider recruitment (per hire) | $500–$2,000 |
| Software subscriptions (Slack, dev tools, etc.) | $2,000–$4,000 |
| **Realistic annual overhead** | **~$10,000–$15,000** |

## Realistic bottom line

At **10 video consults per day, 5 days per week, 48 weeks per year**:

- Gross annual revenue: **$156,000**
- Vendor costs + provider fees: **−$53,448**
- Company overhead (mid-range estimate): **−$12,000**
- Profit before tax: **~$90,000**
- Company tax (28%): **−$25,200**
- **Retained after-tax profit: ~$65,000**

Break-even is under 2 consults per day — the business is profitable from very early scale.

## Path to higher revenue

Options for growing beyond solo-clinician cap:

1. **Higher price point** ($75–$85/consult) — improves margins directly; test market tolerance
2. **Higher utilisation** — marketing spend + repeat patient loyalty programs
3. **Adds part-time providers** — each new provider adds ~$22 platform take per consult without Patrick working; scales linearly
4. **Expand async consult volume** — lower price but faster throughput; margin per consult is lower but time-per-consult is dramatically less
5. **B2B / employer contracts** — recurring flat-fee revenue via employer wellness programs

## Data sources

- Payment fees: Windcave standard SME pricing (public), Stripe NZ (public)
- AI/vendor rates: nova-3-medical Deepgram public pricing, AWS Bedrock Claude Sonnet 4.5 public pricing, Telnyx SMS/fax rates
- FX rate: RBNZ mid-market 2026-07-08
- Provider fees: internal Tere Health provider contract standard rate
- NZ tax rates: IRD 2026 company income tax
