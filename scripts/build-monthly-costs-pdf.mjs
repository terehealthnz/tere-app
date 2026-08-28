// scripts/build-monthly-costs-pdf.mjs
//
// Generates a monthly cost breakdown PDF for Patrick to review with Justin.
// Categorises every recurring line item Tere Health pays with a low/high
// estimate range where actuals aren't known — cells marked "CONFIRM" need
// Patrick's actual invoice amount before this can be signed off.
//
// Numbers are Patrick's best-guess from prior conversations + env-var
// inventory, not from live billing dashboards. Founder review only.
//
// Usage:
//   node scripts/build-monthly-costs-pdf.mjs
//
// Output: ~/Downloads/Tere_Monthly_Costs.pdf

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'

const OUT_PATH = path.join(os.homedir(), 'Downloads', 'Tere_Monthly_Costs.pdf')

// ─── Cost lines ─────────────────────────────────────────────────────────────
// low/high in NZD per month. status: 'active' | 'pending_cancel' | 'variable'
// | 'annualised' | 'confirm' (needs Patrick to fill actual).
// notes: short comment for the review conversation.

const COSTS = [
  // ── INFRASTRUCTURE ──────────────────────────────────────────────────────
  { cat: 'Infrastructure',   vendor: 'Vercel',              plan: 'Pro (hosting + serverless)',       low: 33,   high: 80,   status: 'confirm',       notes: 'US$20/mo base + bandwidth/functions overage. Confirm from Vercel invoice.' },
  { cat: 'Infrastructure',   vendor: 'Supabase',            plan: 'Pro (Postgres + auth + storage)',   low: 42,   high: 42,   status: 'active',        notes: 'US$25/mo Pro. Add-ons (PITR backup, log retention) may push higher.' },
  { cat: 'Infrastructure',   vendor: 'Fly.io',              plan: 'HL7 mTLS proxy (2 apps: prod + test)', low: 8,   high: 15,   status: 'active',        notes: 'nz-prod + nz-test proxies routing Medical-Objects HL7 to Vercel.' },
  { cat: 'Infrastructure',   vendor: 'Cloudflare',          plan: 'DNS + CDN',                         low: 0,    high: 0,    status: 'active',        notes: 'Free tier for the domains we route through.' },
  { cat: 'Infrastructure',   vendor: 'Domain names',        plan: 'terehealth.co.nz, tere.co.nz, terecare.com', low: 8, high: 15, status: 'annualised', notes: 'Annual fee amortised. ~$50/yr each = ~$150/yr total.' },
  { cat: 'Infrastructure',   vendor: 'GitHub',              plan: 'Team (repo + Actions)',             low: 7,    high: 15,   status: 'confirm',       notes: 'US$4/user/mo team. Confirm number of paid seats.' },

  // ── AI / TRANSCRIPTION ──────────────────────────────────────────────────
  { cat: 'AI & transcription', vendor: 'AWS Bedrock',       plan: 'Claude Sonnet 4.6 + Haiku (5 endpoints)', low: 80, high: 400, status: 'variable', notes: 'Triage, notes, scribe summarise, pharmacy match, imaging referral. Scales with consult volume.' },
  { cat: 'AI & transcription', vendor: 'Deepgram',          plan: 'Nova-3 Medical (scribe transcription)', low: 40, high: 200, status: 'variable', notes: '$0.0043/min. Per 15-min consult = ~$0.065. ~50 consults/mo = ~$3, 500 consults = ~$32.' },
  { cat: 'AI & transcription', vendor: 'AWS Transcribe',    plan: 'Live subtitles (streaming)',        low: 20,   high: 100,  status: 'variable',      notes: 'US$0.024/min streaming. Only when subtitles opted-in during call.' },
  { cat: 'AI & transcription', vendor: 'MediaPipe (rPPG)',  plan: 'On-device face landmarks',          low: 0,    high: 0,    status: 'active',        notes: 'Runs in patient browser — no server cost.' },

  // ── COMMS ───────────────────────────────────────────────────────────────
  { cat: 'Communications',   vendor: 'LiveKit',             plan: 'Cloud (video/audio bridge)',        low: 42,   high: 250,  status: 'variable',      notes: 'Baseline seat fees + minutes. Cost per consult ~$0.15-0.30 in participant minutes.' },
  { cat: 'Communications',   vendor: 'Telnyx',              plan: 'Fax (+64 3 568 8145) + inbound',    low: 15,   high: 50,   status: 'active',        notes: 'Number fee + per-page. Fax volume low, mostly prescriptions.' },
  { cat: 'Communications',   vendor: 'Telnyx SMS',          plan: '(migrated off, cancel due)',        low: 0,    high: 15,   status: 'pending_cancel', notes: 'Task #158 — cancel. SMS moved to AWS SNS. Remove line entirely.' },
  { cat: 'Communications',   vendor: '2talk',               plan: 'Voice + fax (unused, cancel due)',  low: 0,    high: 40,   status: 'pending_cancel', notes: 'Task #159 — cancel. Numbers unused after Telnyx migration.' },
  { cat: 'Communications',   vendor: 'AWS SNS',             plan: 'SMS (patient notifications)',       low: 20,   high: 100,  status: 'variable',      notes: 'Spend cap set at $100/mo. Notifications trigger on booking/consult events.' },
  { cat: 'Communications',   vendor: 'Resend',              plan: 'Transactional email',               low: 33,   high: 33,   status: 'active',        notes: 'US$20/mo. Provider welcome, patient receipts, admin alerts.' },

  // ── PAYMENTS ────────────────────────────────────────────────────────────
  { cat: 'Payments',         vendor: 'Stripe',              plan: '2.9% + 30c per NZ card',            low: 0,    high: 0,    status: 'variable',      notes: 'No monthly fee. Percentage-of-revenue not shown here — factor into per-consult economics.' },

  // ── COMPLIANCE / REGULATORY / INSURANCE ─────────────────────────────────
  { cat: 'Compliance & insurance', vendor: 'Delta Insurance', plan: 'PI + Cyber + Tech E&O (ON HOLD)', low: 740, high: 802,  status: 'annualised',    notes: '$8,874/yr direct or $9,621 via Monument instalments (10 × $957 + $50). CURRENTLY ON HOLD pending amendments (retro date, AU territory, business description).' },
  { cat: 'Compliance & insurance', vendor: 'MCNZ practising cert', plan: 'Patrick + Justin annual',    low: 130,  high: 130,  status: 'annualised',    notes: '~$780/yr per doctor. Patrick short-cert this cycle expires 30 Nov 2026 (task #171).' },
  { cat: 'Compliance & insurance', vendor: 'MPS (medical indemnity)', plan: 'Legacy, replaced by Delta',   low: 0,    high: 0,    status: 'pending_cancel', notes: 'Cancel once Delta bound. Overlap risk — confirm no gap in cover.' },
  { cat: 'Compliance & insurance', vendor: 'Companies Office annual return', plan: 'Tere Health Limited', low: 4,   high: 4,    status: 'annualised',    notes: '$45/yr.' },
  { cat: 'Compliance & insurance', vendor: 'HPI / HDEC / HNZ APIs', plan: 'Access fees',                 low: 0,    high: 20,   status: 'confirm',       notes: 'HNZ integrations currently free at UAT tier. Confirm prod fees when NZePS / MWS approved.' },

  // ── PROVIDER PAYROLL (variable, per-consult) ────────────────────────────
  { cat: 'Provider payroll (variable)', vendor: 'Patrick H',   plan: '$25/consult own consults',       low: 0,    high: 0,    status: 'variable',      notes: 'Per-consult only. No hourly. Scales with volume.' },
  { cat: 'Provider payroll (variable)', vendor: 'Justin T',    plan: '$25/consult own consults',       low: 0,    high: 0,    status: 'variable',      notes: 'Per-consult only.' },
  { cat: 'Provider payroll (variable)', vendor: 'Rachel T',    plan: '$25/consult + supervisor duties', low: 0,    high: 0,    status: 'variable',      notes: 'Sole named supervisor for RMO/supervised providers. Per-consult own + supervision arrangement.' },
  { cat: 'Provider payroll (variable)', vendor: 'Holly (NP)',  plan: 'Per-consult contractor',         low: 0,    high: 0,    status: 'confirm',       notes: 'Rate TBC.' },

  // ── OPERATIONS / ADMIN ──────────────────────────────────────────────────
  { cat: 'Operations & admin', vendor: 'Accountant',          plan: 'Bookkeeping + IR return',         low: 200,  high: 500,  status: 'confirm',       notes: 'Xero + monthly reconciliation + annual return. Confirm actual retainer.' },
  { cat: 'Operations & admin', vendor: 'Xero / accounting SaaS', plan: 'Standard NZ plan',             low: 60,   high: 80,   status: 'confirm',       notes: 'If self-managed. May be bundled with accountant fee.' },
  { cat: 'Operations & admin', vendor: 'Google Workspace',    plan: 'Per seat',                        low: 10,   high: 40,   status: 'confirm',       notes: 'US$6-12/user/mo. Confirm seat count.' },
  { cat: 'Operations & admin', vendor: 'Legal / regulatory advice', plan: 'Ad-hoc',                    low: 0,    high: 500,  status: 'variable',      notes: 'Bursty — heavy during structural changes (AU expansion, HDEC, contracts).' },
  { cat: 'Operations & admin', vendor: 'Registered office',   plan: '41 Adams Lane',                   low: 0,    high: 0,    status: 'active',        notes: 'Personal address — no external cost.' },

  // ── MARKETING (variable, unknown) ───────────────────────────────────────
  { cat: 'Marketing (variable)', vendor: 'Meta / Google / LinkedIn ads', plan: 'If running',           low: 0,    high: 500,  status: 'confirm',       notes: 'Confirm current ad spend. Ties into patient acquisition cost model.' },

  // ── PENDING (not billing yet, but coming) ───────────────────────────────
  { cat: 'Pending (not billing yet)', vendor: 'NZePS API',    plan: 'ePrescribing',                    low: 0,    high: 0,    status: 'confirm',       notes: 'Task #168 pending HNZ approval. Fees unknown — likely nominal.' },
  { cat: 'Pending (not billing yet)', vendor: 'RHCNZ imaging integration', plan: 'Per-referral or subscription', low: 0, high: 0, status: 'confirm', notes: 'Meeting held; commercial model pending BDM reply.' },
  { cat: 'Pending (not billing yet)', vendor: 'AU Tere Pty Ltd setup', plan: 'Formation + registrations', low: 0, high: 0, status: 'confirm',       notes: 'One-off ~$10-18k NZD legal + accountant. Not monthly.' },
]

// ─── PDF generation ─────────────────────────────────────────────────────────

function sumRange(rows) {
  const low = rows.reduce((a, r) => a + r.low, 0)
  const high = rows.reduce((a, r) => a + r.high, 0)
  return { low, high }
}

function fmtMoney(n) {
  if (n === 0) return '$0'
  return '$' + n.toLocaleString('en-NZ', { maximumFractionDigits: 0 })
}

function fmtRange(low, high) {
  if (low === 0 && high === 0) return '—'
  if (low === high) return fmtMoney(low)
  return `${fmtMoney(low)} – ${fmtMoney(high)}`
}

function statusBadge(status) {
  const map = {
    active:         { bg: '#D1FAE5', color: '#065F46', label: 'Active' },
    variable:       { bg: '#FEF3C7', color: '#92400E', label: 'Variable' },
    annualised:     { bg: '#DBEAFE', color: '#1E40AF', label: 'Annualised' },
    confirm:        { bg: '#FDE68A', color: '#78350F', label: 'CONFIRM' },
    pending_cancel: { bg: '#FEE2E2', color: '#991B1B', label: 'Cancel due' },
  }
  const m = map[status] || map.active
  return `<span style="background:${m.bg};color:${m.color};padding:2px 7px;border-radius:99px;font-size:8pt;font-weight:700;letter-spacing:.02em;">${m.label}</span>`
}

function categoryBlock(name, rows) {
  const { low, high } = sumRange(rows)
  const isVariablePayroll = name.startsWith('Provider payroll')
  return `
    <h3 style="color:#0D2B45;font-size:11pt;margin:16pt 0 4pt;">${name}
      <span style="float:right;color:#0B6E76;font-weight:700;font-size:10pt;">${isVariablePayroll ? 'Variable (per-consult)' : `subtotal: ${fmtRange(low, high)}`}</span>
    </h3>
    <table style="width:100%;border-collapse:collapse;font-size:9.5pt;">
      <thead>
        <tr style="background:#F1F5F9;color:#0D2B45;font-weight:700;">
          <th style="text-align:left;padding:5pt 8pt;width:22%;border-bottom:1.5px solid #CBD5E1;">Vendor</th>
          <th style="text-align:left;padding:5pt 8pt;width:28%;border-bottom:1.5px solid #CBD5E1;">Plan / usage</th>
          <th style="text-align:right;padding:5pt 8pt;width:14%;border-bottom:1.5px solid #CBD5E1;">NZD / month</th>
          <th style="text-align:left;padding:5pt 8pt;width:8%;border-bottom:1.5px solid #CBD5E1;">Status</th>
          <th style="text-align:left;padding:5pt 8pt;width:28%;border-bottom:1.5px solid #CBD5E1;">Notes</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr style="border-bottom:1px solid #E2E8F0;${r.status === 'pending_cancel' ? 'background:#FEF2F2;' : ''}">
            <td style="padding:5pt 8pt;font-weight:700;color:#0D2B45;">${r.vendor}</td>
            <td style="padding:5pt 8pt;color:#4B5563;">${r.plan}</td>
            <td style="padding:5pt 8pt;text-align:right;font-family:'SF Mono',Menlo,monospace;color:#0D2B45;">${fmtRange(r.low, r.high)}</td>
            <td style="padding:5pt 8pt;">${statusBadge(r.status)}</td>
            <td style="padding:5pt 8pt;color:#4B5563;font-size:9pt;">${r.notes}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

function categoriesInOrder() {
  const order = ['Infrastructure', 'AI & transcription', 'Communications', 'Payments', 'Compliance & insurance', 'Provider payroll (variable)', 'Operations & admin', 'Marketing (variable)', 'Pending (not billing yet)']
  return order.map(name => ({ name, rows: COSTS.filter(c => c.cat === name) })).filter(g => g.rows.length)
}

const categories = categoriesInOrder()

// Roll-up excluding the "pending" and "provider payroll" categories (those
// don't add to fixed monthly burn).
const rollupRows = COSTS.filter(c => !c.cat.startsWith('Provider payroll') && !c.cat.startsWith('Pending'))
const rollupTotal = sumRange(rollupRows)
const cancelSavings = sumRange(COSTS.filter(c => c.status === 'pending_cancel'))

const CSS = `
  @page { size: A4; margin: 18mm 15mm 20mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1A2A33; font-size: 10pt; line-height: 1.45; margin: 0; }
  h1 { color: #0B6E76; font-size: 18pt; margin: 0 0 4px; }
  h2 { color: #0B6E76; font-size: 13pt; margin: 18pt 0 6pt; padding-bottom: 3pt; border-bottom: 2px solid #0B6E76; }
  h3 { color: #0D2B45; font-size: 11pt; margin: 14pt 0 5pt; }
  p { margin: 0 0 6pt; }
  ul, ol { padding-left: 18pt; margin: 0 0 6pt; }
  li { margin: 2pt 0; }
  strong { color: #0D2B45; }
  em { color: #4B5563; }
  hr { border: none; border-top: 1px solid #E2E8F0; margin: 14pt 0; }
  .subtitle { color: #64748B; font-size: 10.5pt; margin-top: 3pt; }
  .meta { color: #64748B; font-size: 9pt; margin-top: 2pt; }
  .callout { background: #F0F9FA; border: 1px solid #C7EAEC; border-left: 3px solid #0B6E76; border-radius: 4px; padding: 10pt 14pt; margin: 10pt 0 12pt; font-size: 10pt; }
  .warn { background: #FEF3C7; border: 1px solid #FCD34D; border-left: 3px solid #B45309; border-radius: 4px; padding: 10pt 14pt; margin: 10pt 0 12pt; font-size: 9.5pt; color: #78350F; }
  .rollup { background: #ECFDF5; border: 1px solid #6EE7B7; border-left: 3px solid #059669; border-radius: 4px; padding: 12pt 16pt; margin: 12pt 0 16pt; }
  .rollup h3 { margin-top: 0; color: #065F46; }
  .totalBig { font-size: 22pt; font-weight: 700; color: #065F46; font-family: 'SF Mono', Menlo, monospace; margin: 4pt 0; }
  .footer { color: #94A3B8; font-size: 8.5pt; margin-top: 20pt; padding-top: 6pt; border-top: 1px solid #E2E8F0; }
`

const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>${CSS}</style></head><body>

<h1>Tere Health — Monthly Cost Review</h1>
<div class="subtitle">Founder review · Patrick + Justin</div>
<div class="meta">Draft v1 · figures are best-estimate; anything marked <strong>CONFIRM</strong> needs actual invoice · 2026-08-18</div>

<hr>

<h2>1. TL;DR — where's the money going</h2>

<div class="rollup">
  <h3>Estimated fixed monthly burn (excl. provider payroll and pending items)</h3>
  <div class="totalBig">${fmtRange(rollupTotal.low, rollupTotal.high)}</div>
  <p style="margin:2pt 0 0;color:#065F46;font-size:9.5pt;">
    That's ~<strong>${fmtMoney(rollupTotal.low)}</strong> at the low end (steady-state minimal usage) and <strong>${fmtMoney(rollupTotal.high)}</strong> at the top (with maxed variable-usage services like Bedrock, LiveKit, ad spend). Provider payroll is per-consult on top of this and scales entirely with revenue.
  </p>
</div>

<div class="warn">
  <strong>Immediate savings identified:</strong> ${fmtRange(cancelSavings.low, cancelSavings.high)} / mo by cancelling Telnyx SMS (task #158), 2talk (task #159), and letting MPS lapse once Delta binds. Roughly one legal fee's worth of headroom per year.
</div>

<h2>2. Line-by-line by category</h2>

${categories.map(g => categoryBlock(g.name, g.rows)).join('')}

<h2>3. What needs Patrick's confirm before this is defensible</h2>
<p>Everything tagged <strong>CONFIRM</strong> is a best-guess range. To take this to a real budget:</p>
<ul>
  ${COSTS.filter(c => c.status === 'confirm').map(c => `<li><strong>${c.vendor}</strong> — currently estimated ${fmtRange(c.low, c.high)}. Need actual invoice or plan tier.</li>`).join('')}
</ul>

<h2>4. Per-consult economics (context for Justin)</h2>
<p>To make the fixed burn understandable in unit terms:</p>
<table style="width:100%;border-collapse:collapse;font-size:9.5pt;">
  <thead>
    <tr style="background:#F1F5F9;color:#0D2B45;">
      <th style="text-align:left;padding:5pt 8pt;border-bottom:1.5px solid #CBD5E1;">Consult volume / month</th>
      <th style="text-align:right;padding:5pt 8pt;border-bottom:1.5px solid #CBD5E1;">Revenue @ $65/consult</th>
      <th style="text-align:right;padding:5pt 8pt;border-bottom:1.5px solid #CBD5E1;">Provider cost @ $25/consult</th>
      <th style="text-align:right;padding:5pt 8pt;border-bottom:1.5px solid #CBD5E1;">Fixed burn (mid)</th>
      <th style="text-align:right;padding:5pt 8pt;border-bottom:1.5px solid #CBD5E1;">Contribution</th>
    </tr>
  </thead>
  <tbody>
    ${[50, 100, 250, 500, 1000].map(n => {
      const rev = n * 65
      const providerCost = n * 25
      const fixedMid = (rollupTotal.low + rollupTotal.high) / 2
      const contribution = rev - providerCost - fixedMid
      const contrColor = contribution >= 0 ? '#065F46' : '#991B1B'
      return `<tr style="border-bottom:1px solid #E2E8F0;">
        <td style="padding:5pt 8pt;">${n}</td>
        <td style="padding:5pt 8pt;text-align:right;font-family:'SF Mono',Menlo,monospace;">${fmtMoney(rev)}</td>
        <td style="padding:5pt 8pt;text-align:right;font-family:'SF Mono',Menlo,monospace;">${fmtMoney(providerCost)}</td>
        <td style="padding:5pt 8pt;text-align:right;font-family:'SF Mono',Menlo,monospace;">${fmtMoney(Math.round(fixedMid))}</td>
        <td style="padding:5pt 8pt;text-align:right;font-family:'SF Mono',Menlo,monospace;font-weight:700;color:${contrColor};">${contribution >= 0 ? '' : '-'}${fmtMoney(Math.abs(Math.round(contribution)))}</td>
      </tr>`
    }).join('')}
  </tbody>
</table>
<p style="font-size:9pt;color:#6B7280;margin-top:6pt;">
  Contribution = revenue − provider cost − fixed burn (mid estimate). Excludes Stripe (2.9% + 30c per transaction) and variable spikes in ad spend / legal fees. Break-even in this table sits around <strong>~${Math.ceil(((rollupTotal.low + rollupTotal.high) / 2) / (65 - 25))} consults/month</strong> at current pricing.
</p>

<h2>5. Discussion prompts for the Justin call</h2>
<ol>
  <li><strong>Confirm the CONFIRM rows</strong> — pull the invoices for Vercel, Bedrock, LiveKit, Google Workspace, accountant, GitHub. Sharpens the range from ${fmtRange(rollupTotal.low, rollupTotal.high)} to a real number.</li>
  <li><strong>Ad spend</strong> — is anything actively running? If yes, add the actual number. If no, decide whether to allocate a budget for Q4 2026 launch push.</li>
  <li><strong>Insurance</strong> — Delta is on hold pending amendments. If it goes through as-is: +$740/mo starting 8 Sept. If MPS is running in parallel: overlap risk.</li>
  <li><strong>AU expansion cost hit</strong> — Shively / AU Tere setup is ~$10–18k one-off (legal + accountant). Not in this monthly table but needs to be planned for cash-flow.</li>
  <li><strong>Break-even math</strong> — at mid-burn we need ~${Math.ceil(((rollupTotal.low + rollupTotal.high) / 2) / (65 - 25))} consults/month just to cover fixed costs. Are we tracking to this?</li>
  <li><strong>Cancellations</strong> — Telnyx SMS + 2talk + MPS = quick wins for ${fmtRange(cancelSavings.low, cancelSavings.high)}/mo. Assign an owner and a date.</li>
</ol>

<div class="footer">
  Draft prepared by Dr Patrick Herling, CMO · Tere Health Limited · Figures are internal-review estimates only; do not use for external reporting, tax, or investor materials without confirmation against actual billing statements. Some usage-based services (Bedrock, LiveKit, AWS SNS) have wide ranges because they scale with patient volume — model these against expected consult throughput before making commitments.
</div>

</body></html>`

async function main() {
  console.log('[monthly-costs] launching headless Chromium…')
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent(HTML, { waitUntil: 'networkidle' })
  await page.pdf({
    path: OUT_PATH,
    format: 'A4',
    printBackground: true,
    margin: { top: '18mm', bottom: '20mm', left: '15mm', right: '15mm' },
  })
  await browser.close()
  const size = (await fs.stat(OUT_PATH)).size
  console.log(`[monthly-costs] wrote ${OUT_PATH} (${(size/1024).toFixed(1)} KB)`)
}

main().catch(e => { console.error(e); process.exit(1) })
