# Tere Health — Cost Structure & Unit Economics

*Prepared: 2026-07-11 — internal review · Supersedes prior versions*

## Executive summary

Tere Health is a NZ **tele-emergency** service — same-day access to an emergency medicine specialist for acute clinical presentations. Both providers (Patrick Herling · Rachel Thomas) are MCNZ-registered specialists in emergency medicine, which is the entire product proposition and pricing model. There is one live product: a **$60 NZD consultation** (video or audio at the provider's discretion inside the call). Async messaging has been retired from the public flow — it did not fit the tele-emergency positioning and was margin-diluting; existing message-consult rows continue to display but the product is no longer offered at booking time.

Because Patrick and Rachel are specialists, ACC-eligible consultations bill at the ACC **specialist telehealth** rates: **MST1 $96.38 (initial)** and **MST3 $48.20 (follow-up)**, paid direct by ACC with no patient co-pay.

Unit economics are strong: a private consult retains ~62% margin after all vendor costs and provider fees ($37.42 net to Tere). An ACC-initial consult under MST1 nets **$75.24 — roughly double the private margin**. Break-even is under two consults per day. At 10 consults/day, 7 days per week, with a 30% ACC-initial / 20% ACC-follow-up / 50% private mix, after-tax retained profit is approximately **NZ$142k/yr**.

## Assumptions

- **Currency conversion**: 1 USD = 1.67 NZD (RBNZ mid-market 2026-07-08)
- **Payment processor**: Windcave (target) at 1.9% + $0.30 NZD per transaction. Currently on Stripe (2.9% + $0.30 USD ≈ NZD $0.50) pending migration.
- **Provider fees**: $20 NZD per consultation (video or audio — flat)
- **Working pattern**: 7 days/week, 8am–8pm, 350 days/year (2 weeks off) as the primary model; alternatives modelled below
- **NZ company tax rate**: 28% (IRD 2026)
- **Vendor rates** verified against current supplier pricing as at July 2026

## Pricing (as at 2026-07-11)

| Product | Price to patient | ACC-eligible | ACC rate to Tere (direct) |
|---|---:|---|---|
| Emergency consultation (video or audio — provider picks inside the call) | $60 | ✓ | MST1 $96.38 initial / MST3 $48.20 follow-up |

Patient support (prescription errors, referral status, ACC follow-up, admin queries) runs through the existing free support-ticket system — not a billable product. See `docs/security-compliance.md` §11 for the support workflow.

**Key changes from prior model:**
- The previous video ($65) / phone ($45) split has been replaced with a flat $60. The provider makes the modality decision inside the call via an in-call camera toggle. Rationale: providers default to audio when given the choice (rural bandwidth, Doctegrity comparison confirms this), so flat pricing captures full value on what would otherwise be $45 phone consults, without losing meaningful revenue on the rare pure-video consult.
- Async written-response consult ($25) has been retired from the public flow. It didn't fit the tele-emergency positioning and diluted margins ($13.45 net vs $37.42 for a live consult), while also being ineligible for the ACC MST1 lever. Existing message-consult rows keep displaying in admin views for historical continuity; no new bookings.

## Vendor stack — variable costs per consult

| Vendor | Purpose | Cost per consult (NZD) |
|---|---|---:|
| AWS Transcribe | Speech-to-text for Scribe (streaming) | $0.24 |
| AWS Bedrock (Claude Sonnet 4.5) | Note generation, triage AI, live translations | $0.05–0.95 |
| Telnyx / 2talk (migrating) | SMS patient notifications | $0.08 |
| Telnyx / 2talk (migrating) | Fax prescriptions to pharmacy (until NZePS goes live) | $0.13 |
| Resend | Email delivery (join links, receipts, script + note) | $0.00 (free tier) |
| LiveKit Cloud | Video/audio SFU | $0.00–$0.03 (free tier → Ship plan overage) |
| Supabase | Database + storage + auth | $0.08 per consult (Pro plan flat) |
| Vercel | Web hosting + serverless functions | $0.07 per consult (Pro plan flat) |

## Fixed monthly overhead (post-free-tier)

| Item | NZD/mo | Notes |
|---|---:|---|
| Supabase Pro | $41.75 | $25 USD × 1.67 = NZD |
| Vercel Pro (1 seat) | $33.40 | $20 USD × 1.67 = NZD |
| LiveKit Ship plan | $83.50 | Needed once free 5,000 min/mo tier exhausted (~week 2 at 10/day) |
| 2talk 10 (voice + fax + SMS on one NZ Blenheim number) | $11.50 | $10 + GST — replaces Telnyx fax & SMS |
| Telnyx (fax fallback during migration) | $8.35 | Retire once 2talk migration is verified |
| Domain (terehealth.co.nz) | $5.00 |  |
| **Total fixed overhead** | **~$183.50** | **~NZD $2,202/year** |

At 300 consults/month this allocates to ~$0.61/consult — negligible.

## Per-consult unit economics

### Consultation — private pay ($60)

| Line item | NZD |
|---|---:|
| Patient charge | +$60.00 |
| Windcave payment fee (target — currently Stripe higher) | −$1.44 |
| Provider fee | −$20.00 |
| AWS Transcribe (Scribe) | −$0.24 |
| AWS Bedrock (notes + triage AI) | −$0.08 |
| Telnyx/2talk SMS + fax | −$0.21 |
| Fixed overhead allocation | −$0.61 |
| **Tere net (per consult)** | **$37.42 (62.4%)** |

### Consultation — ACC initial (MST1 $96.38)

| Line item | NZD |
|---|---:|
| ACC pays Tere direct | +$96.38 |
| Windcave payment fee | $0.00 (ACC paid by monthly invoice) |
| Provider fee | −$20.00 |
| AWS Transcribe | −$0.24 |
| AWS Bedrock | −$0.08 |
| Telnyx/2talk SMS + fax | −$0.21 |
| Fixed overhead allocation | −$0.61 |
| **Tere net (per consult)** | **$75.24 (78.1%)** |

### Consultation — ACC follow-up (MST3 $48.20)

| Line item | NZD |
|---|---:|
| ACC pays Tere direct | +$48.20 |
| Windcave payment fee | $0.00 (ACC monthly invoice) |
| Provider fee | −$20.00 |
| AWS Transcribe | −$0.24 |
| AWS Bedrock | −$0.08 |
| Telnyx/2talk SMS + fax | −$0.21 |
| Fixed overhead allocation | −$0.61 |
| **Tere net (per consult)** | **$27.06 (56.1%)** |

### Margin summary

| Product | Rate to Tere | Net | Margin |
|---|---:|---:|---:|
| Consultation — private | $60.00 | $37.42 | 62.4% |
| Consultation — ACC MST1 | $96.38 | $75.24 | 78.1% |
| Consultation — ACC MST3 | $48.20 | $27.06 | 56.1% |

**Key insight:** an ACC-initial consultation nets Tere approximately **twice as much as a private consult of the same duration**. Rural Marlborough has a naturally high ACC-claim mix (farming, maritime, RSE seasonal workers). Even a modest 30% MST1 mix materially lifts the annual bottom line.

## Scale scenarios — annual business P&L

Primary model: 7 days/week, 8am–8pm, 350 days/year, 10 consults/day.

### Working-pattern comparison (all-private)

| Working pattern | Days/yr | Consults/yr | Gross revenue | After 28% tax |
|---|---:|---:|---:|---:|
| 5 days/wk, 2 wks off | 250 | 2,500 | $150,000 | ~$69,300 |
| 6 days/wk, 4 wks off | 288 | 2,880 | $172,800 | ~$79,800 |
| 7 days/wk, 2 wks off (primary) | 350 | 3,500 | **$210,000** | **~$96,940** |

### ACC-mix sensitivity — 7 days/wk × 350 days × 10 consults/day

Mix applied to Consultation revenue: MST1 initial and MST3 follow-up substitute for private where the patient is ACC-eligible.

| ACC mix | Gross revenue | After-tax profit |
|---|---:|---:|
| All private (0/0/100) | $210,000 | ~$96,940 |
| 30% MST1 + 20% MST3 + 50% private | $319,355 | ~$180,500 |
| 50% MST1 + 20% MST3 + 30% private | $385,755 | ~$228,470 |

**Capacity note:** 8am–8pm × 7 days × 20–30 min per consult = 24–36 consults/day capacity. 10/day represents ~28–42% utilisation — significant headroom before adding providers.

## Payment processor comparison — Stripe vs Windcave

| Consult type | Stripe fee (NZD) | Windcave fee (NZD) | Saving per consult |
|---|---:|---:|---:|
| Consultation $60 (private) | $2.24 | $1.44 | **$0.80** |

At 10 consults/day × 350 days × 50% private (rest via ACC monthly invoice, no per-transaction fee): ~$1,400/yr saved. Plus removal of USD FX exposure and clean NZD invoicing for Xero.

## Company overhead (not in per-consult modelling)

| Item | NZD/yr estimate |
|---|---:|
| Xero accounting subscription | $840 |
| Professional indemnity + PI insurance | $3,000–$5,000 |
| Legal + compliance reviews (PIA, contracts) | $2,000–$4,000 |
| Marketing / patient acquisition | $5,000–$30,000 (variable) |
| Provider recruitment (per hire) | $500–$2,000 |
| Software subscriptions (dev tools) | $2,000–$4,000 |
| **Realistic annual overhead** | **~$10,000–$15,000** |

## Realistic bottom line

Three scenarios · 10 consults/day · 7 days/week · 350 days · single-product (all consults):

| Line | All private | 30% MST1 + 20% MST3 + 50% private | 50% MST1 + 20% MST3 + 30% private |
|---|---:|---:|---:|
| Gross annual revenue | $210,000 | $319,355 | $385,755 |
| Vendor costs + provider fees | −$79,170 | −$79,170 | −$79,170 |
| Company overhead (mid-range) | −$12,000 | −$12,000 | −$12,000 |
| Profit before tax | ~$118,830 | ~$228,185 | ~$294,585 |
| Company tax (28%) | −$33,272 | −$63,892 | −$82,484 |
| **Retained after-tax profit** | **~$85,560** | **~$164,290** | **~$212,100** |

The ACC specialist rate is the single biggest financial lever in the model. Rural Marlborough's injury-heavy demographic makes the ACC-mix scenarios realistic, not aspirational.

## Path to higher revenue

1. **Higher price point ($70–$80/consult)** — each $5 lift adds ~$17,500/yr at 3,500 private consults. Test market tolerance against Doctegrity, Practice Plus, Emerge, CareHQ, Tend ($55–75 range).
2. **Higher utilisation** — 20 consults/day at the same mix doubles profit (revenue $571k → ~$310k after-tax).
3. **Add part-time providers** — each new provider adds ~$22.42 platform take per private consult without Patrick working; scales linearly.
4. **B2B / employer contracts** — flat monthly retainer per employee. Removes Windcave transaction fee (invoice payment). Discussion of PHO / employer pricing tiers is in a separate document.
5. **NZePS integration** — once live, direct-to-pharmacy electronic prescriptions replace fax delivery. Same margin per consult but removes fax fallback complexity + Telnyx fax number ($8/mo).

## Revenue sensitivity — 7-day model · 30% MST1 mix

| Consults/day | Annual revenue (est.) | After-tax profit (est.) |
|---:|---:|---:|
| 5 | $142,492 | ~$60,000 |
| 10 (primary) | $284,984 | ~$142,000 |
| 15 | $427,476 | ~$220,000 |
| 20 | $569,968 | ~$300,000 |

## Data sources

- Payment fees: Windcave standard SME pricing (public); Stripe NZ (public)
- AI/vendor rates: AWS Transcribe (streaming) public pricing · AWS Bedrock Claude Sonnet 4.5 public pricing · Telnyx & 2talk NZ SMS/fax rates
- ACC specialist telehealth rates: MST1 / MST3 codes effective 1 June 2024 (confirmed via ACC schedule 2026)
- FX rate: RBNZ mid-market 2026-07-08 (1 USD = 1.67 NZD)
- Provider fees: internal Tere Health provider contract standard rate
- NZ tax rates: IRD 2026 company income tax (28%)
