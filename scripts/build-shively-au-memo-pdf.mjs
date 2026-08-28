// scripts/build-shively-au-memo-pdf.mjs
//
// Generates the Shively-facing AU expansion memo PDF. Companion to the
// Justin-facing memo (build-au-expansion-memo-pdf.mjs) but written for
// Shively as the audience — presenting the Justin-agreed structure as
// the opening offer.
//
// Usage:
//   node scripts/build-shively-au-memo-pdf.mjs
//
// Output: ~/Downloads/Tere_AU_Shively_Partnership_Memo.pdf

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'

const OUT_PATH = path.join(os.homedir(), 'Downloads', 'Tere_AU_Shively_Partnership_Memo.pdf')

const CSS = `
  @page { size: A4; margin: 20mm 18mm 22mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1A2A33; font-size: 10.5pt; line-height: 1.55; margin: 0; }
  h1 { color: #0B6E76; font-size: 20pt; margin: 0 0 4px; }
  h2 { color: #0B6E76; font-size: 14pt; margin: 20pt 0 6pt; padding-bottom: 3pt; border-bottom: 2px solid #0B6E76; }
  h3 { color: #0D2B45; font-size: 11.5pt; margin: 14pt 0 5pt; }
  p, ul, ol { margin: 0 0 8pt; }
  ul, ol { padding-left: 20pt; }
  li { margin: 3pt 0; }
  strong { color: #0D2B45; }
  em { color: #4B5563; }
  hr { border: none; border-top: 1px solid #E2E8F0; margin: 16pt 0; }
  table { width: 100%; border-collapse: collapse; margin: 8pt 0 12pt; font-size: 10pt; }
  th { text-align: left; background: #F1F5F9; padding: 6pt 8pt; color: #0D2B45; font-weight: 700; border-bottom: 2px solid #CBD5E1; }
  td { padding: 5pt 8pt; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
  .subtitle { color: #64748B; font-size: 11pt; margin-top: 4pt; }
  .meta { color: #64748B; font-size: 9.5pt; margin-top: 2pt; }
  .callout { background: #F0F9FA; border: 1px solid #C7EAEC; border-left: 3px solid #0B6E76; border-radius: 4px; padding: 10pt 14pt; margin: 10pt 0 14pt; font-size: 10pt; }
  .warn { background: #FEF3C7; border: 1px solid #FCD34D; border-left: 3px solid #B45309; border-radius: 4px; padding: 10pt 14pt; margin: 10pt 0 14pt; font-size: 10pt; color: #78350F; }
  .diagram { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 14pt 16pt; margin: 10pt 0 14pt; font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 9.5pt; line-height: 1.55; white-space: pre; color: #0D2B45; overflow: hidden; }
  .ask { background: #ECFDF5; border: 1px solid #6EE7B7; border-left: 3px solid #059669; border-radius: 4px; padding: 12pt 16pt; margin: 12pt 0 16pt; }
  .ask h3 { margin-top: 0; color: #065F46; }
  .footer { color: #94A3B8; font-size: 8.5pt; margin-top: 24pt; padding-top: 8pt; border-top: 1px solid #E2E8F0; }
  .amount { font-family: 'SF Mono', Menlo, monospace; font-size: 9.5pt; }
  .pct { font-weight: 700; color: #0B6E76; font-family: 'SF Mono', Menlo, monospace; }
`

const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>${CSS}</style></head><body>

<h1>Tere Health Australia — Partnership Proposal</h1>
<div class="subtitle">Founder proposal · Patrick Herling &amp; Justin Thomas → Patrick Shively</div>
<div class="meta">Draft · pre-legal · 2026-08-18</div>

<hr>

<h2>1. What this is</h2>
<p>Justin and I have talked through how we'd like to structure Tere's AU expansion with you as co-founder. This memo lays out the opening proposal in one place so you can react before we engage lawyers. Nothing here is legally binding — it's the shape of the deal, not the deal itself.</p>

<div class="callout">
  <strong>Headline:</strong> you co-found <strong>Tere Health Australia Pty Ltd</strong>. You hold <strong>33% direct equity</strong>; Tere Global (our NZ parent, 50/50 Justin and me) holds the other 67%. You're sole AU-resident director. You practise clinically on the platform. You share in AU's upside directly, plus tag-along protection into any future group sale.
</div>

<h2>2. The structure at a glance</h2>

<div class="diagram">          Tere Global Holdings Ltd (NZ) — new
          ├─ Herling: 50%
          └─ Thomas:  50%
             [owns all platform IP + Tere brand + 100% of NZ Tere Ltd
              + majority stakes in every country subsidiary]
                          │
             ┌────────────┴─────────────────────┐
             │                                  │
        NZ Tere Ltd                       AU Tere Pty Ltd
        Global 100%                       Global    67%
                                          Shively   33% ← YOU
                                          (direct — from day one)
                                          [Shively as sole director + AHPRA clinician]</div>

<p><strong>Two entities:</strong></p>
<ul>
  <li><strong>Tere Global Holdings Ltd (NZ)</strong> — the parent. Owned 50/50 by Justin and me. Holds all platform IP, 100% of NZ Tere Ltd, and majority stakes in every country subsidiary (AU first, likely US/UK later). This is where the crown jewel (the IP) lives; you do not sit on this cap table because you weren't part of the year of NZ back-work.</li>
  <li><strong>Tere Health Australia Pty Ltd</strong> — the AU operating company. Global holds 67%, you hold 33% direct. You're sole director, see patients on it clinically, and are a real co-founder of the AU country business from day one.</li>
</ul>

<h2>3. Your equity — 33% direct from day one</h2>

<table>
  <thead><tr><th>Shareholder</th><th>AU Tere Pty Ltd stake</th></tr></thead>
  <tbody>
    <tr><td>Tere Global Holdings Ltd (Herling + Thomas)</td><td class="pct">67%</td></tr>
    <tr><td>Patrick Shively (you) — direct</td><td class="pct">33%</td></tr>
  </tbody>
</table>

<p>No vesting schedule, no earn-in triggers, no revenue milestones. Once AU Tere Pty Ltd is formed at ASIC, you're the 33% direct shareholder alongside Global. Global's 67% reflects Justin and me together through the parent — we don't hold AU stakes personally.</p>

<h2>4. Why this structure (and why the IP sits where it does)</h2>
<p>Being direct with you on the shape of the deal: Justin and I have a year of work in the NZ platform + IP, built from scratch. Full MCNZ/ACC/HPI regulatory rails, live production, clinical roster, patient traffic. That IP sits in Tere Global Holdings (the NZ parent), owned 50/50 by Justin and me. You don't share in that historical work — which is why Global is a separate cap table you're not on.</p>
<p>AU is a new business you'll co-found. Rather than three individuals on the AU cap table, we're going Global-as-majority-owner + you as direct minority. Reasons:</p>
<ul>
  <li><strong>Cleaner exit.</strong> An acquirer buys Global (getting IP + NZ + Global's 67% of AU) and drags your 33% on the same terms — single transaction, one buyer. Simpler than chasing three individual signatures.</li>
  <li><strong>Scales for future countries.</strong> When we launch US, UK, etc., the pattern repeats: Global holds majority, local co-founder holds direct minority. Your AU stake is unaffected by future country expansions.</li>
  <li><strong>Parent-level decisions stay at parent.</strong> IP direction, brand strategy, cross-country capital allocation — those live at Global (Justin and me). You get to focus entirely on AU without being roped into parent-level governance you weren't part of building.</li>
</ul>
<p>You get real ownership of the country you'll build (33% direct AU equity), coupled with the platform IP licensed in from Global at a fair rate (see §7). We all share AU's upside directly.</p>

<h2>5. Your role</h2>
<ul>
  <li><strong>Sole director of AU Tere Pty Ltd</strong> — satisfies ASIC's mandatory AU-resident director requirement. Gives you formal decision authority over AU operations.</li>
  <li><strong>AHPRA-registered clinician on the platform</strong> — seeing AU patients yourself, generating consult revenue from day one. This is a real clinical practice, not a figurehead role.</li>
  <li><strong>Founding clinical operator</strong> — building the AU provider roster around you. You interview and onboard the first cohort of AU clinicians.</li>
  <li><strong>AU market entry + business development</strong> — leveraging your AU network, GP relationships, and market knowledge to grow AU consult volume.</li>
</ul>

<h2>6. Your income streams</h2>
<p>You'll have four sources of income from AU:</p>
<ol>
  <li><strong>Per-consult income</strong> for the patients you see personally on the platform (paid by AU Tere at the standard AU clinician per-consult rate, TBD but comparable to NZ's A$25/consult adjusted for market)</li>
  <li><strong>Market-rate consulting fee</strong> from AU Tere for any dev work you contribute (product tweaks, AU integrations, clinical protocols). Rate TBD — we'd agree it separately.</li>
  <li><strong>Director's fee</strong> from AU Tere for your director role (standard AU director-of-early-stage-startup range — $0 to $2k/month, negotiable)</li>
  <li><strong>Equity appreciation</strong> on your 10% (→33% at trigger) stake — realised at exit or via dividends if AU becomes profitable enough</li>
</ol>

<h2>7. IP treatment</h2>
<p>All platform IP — including AU-specific extensions we build together — sits with Tere Global. This includes any AU-jurisdictional work: Medicare integration, AHPRA scope logic, AU pharmacy connectors, AU clinical protocols. Work-for-hire clause in your agreements assigns those back to Global.</p>
<p>AU Tere pays Global an IP licence fee as a percentage of AU revenue:</p>
<table>
  <thead><tr><th>AU annual revenue band</th><th>Licence rate</th></tr></thead>
  <tbody>
    <tr><td>Below A$1M</td><td class="pct">4%</td></tr>
    <tr><td>A$1M – A$3M</td><td class="pct">6%</td></tr>
    <tr><td>Above A$3M</td><td class="pct">8%</td></tr>
  </tbody>
</table>
<p>This is the standard SaaS franchisor pattern. Similar to how Uber or Shopify structure country subsidiaries — country ops entity licences platform IP from the parent, pays a royalty, keeps the local operating profit.</p>
<p><strong>Why it's fair to you:</strong> the licence fee is capped at percentages you can model in your unit economics. As AU scales, more absolute dollars go to Global (because we built the platform), but you keep the majority of AU's operating margin — 92%+ of it in the early years, 94% at scale (net of the licence).</p>

<h2>8. Exit mechanics — what happens if we sell the group</h2>
<p>Two clauses matter to you here, both to be in the AU Tere shareholder agreement:</p>

<h3>Drag-along (protects Global)</h3>
<p>If an acquirer offers to buy Global (which owns IP + NZ + 67% of AU) and Justin + I accept, standard drag-along means you're contractually required to sell your 33% AU stake to the same acquirer on the same per-share terms. Single transaction, one buyer, no separate negotiation. This is what makes the group sellable at all — an acquirer needs to buy the whole stack, not chase minority holdouts.</p>
<p><strong>Your economic outcome:</strong> you receive 33% of whatever the acquirer allocates to AU Tere in the deal. Independent valuation applied to AU on the same fairness standard as Global.</p>

<h3>Tag-along (protects you)</h3>
<p>If Justin and I sell our Global stake pre-exit to a third party, you can force pro-rata sale of your AU stake to the same buyer on the same terms. This protects you from being stranded in AU with a new majority owner you didn't pick. If we sell out, you get to sell out too.</p>

<div class="callout">
  <strong>Net position:</strong> you have real upside on the AU business (33% direct equity from day one), full tag-along protection if we exit (so you're never stranded), and no downside from parent-level (Global) decisions you're not part of. Justin and I hold IP + NZ upside through Global; you hold AU upside directly.
</div>

<h2>9. What we need from you</h2>
<ul>
  <li><strong>Director ID</strong> via ABRS (30 min, free — Australian Business Registry Services)</li>
  <li><strong>AHPRA registration</strong> for practising through AU Tere (6–12 weeks — start early; Trans-Tasman Mutual Recognition Act should make this straightforward)</li>
  <li><strong>Sign the AU Tere shareholder agreement</strong> with the terms above (vesting, drag-along, tag-along, IP licence, work-for-hire)</li>
  <li><strong>Full-time commitment to AU launch for the first 6 months minimum</strong> — this is what the 10% base is buying. After launch, your time commitment scales with AU volume.</li>
</ul>

<h2>10. Timing</h2>
<p>Realistic timeline from your yes:</p>
<ul>
  <li><strong>Week 0–1:</strong> engage Trans-Tasman corporate lawyer (Justin and I will drive this — Minter Ellison Rudd Watts or Bell Gully)</li>
  <li><strong>Week 1–2:</strong> Global holdco formed in NZ; NZ Tere shares rolled up into Global (share-for-share swap, IRD-neutral)</li>
  <li><strong>Week 2–4:</strong> AU Tere Pty Ltd formed at ASIC; you appointed director; ABN + GST registration</li>
  <li><strong>Week 3–4:</strong> shareholder agreement drafted, reviewed, signed by all three</li>
  <li><strong>Parallel (starts week 0):</strong> AHPRA registration for you</li>
  <li><strong>Week 4+:</strong> AU platform build + launch prep</li>
</ul>

<div class="ask">
  <h3>What we'd like to hear from you</h3>
  <ol>
    <li><strong>Structural yes or no</strong> — does 33% direct AU equity (with Global as majority owner at 67% and IP licensed in from Global) work for you as a co-founder framework? <em>(y/n + any concerns)</em></li>
    <li><strong>IP licence rate</strong> — 4% / 6% / 8% tiered on AU revenue. Comfortable, or does the model need adjustment?</li>
    <li><strong>Time commitment</strong> — are you positioned to give this the first 6 months full-time? What does your current commitment landscape look like?</li>
    <li><strong>Anything missing</strong> — protective clauses you'd want, roles you'd want defined differently, income structure you'd rather see. This is our opening offer, not a take-it-or-leave-it.</li>
  </ol>
</div>

<div class="warn">
  <strong>What we're not open to:</strong> equity at Global (the NZ parent). That's the one non-negotiable — Global stays 50/50 Justin and me because the NZ back-work is done. Everything at the AU Tere level (royalty rate, income structure, protective terms) is on the table.
</div>

<h2>11. Why we're proposing this specifically to you</h2>
<p>Being direct: this is not a "we need any AU-resident director" pitch. AU-resident directorship is a nominee service you can buy for $1.5k/yr. We're offering you 33% of the AU country business because we think you're the right founding operator for AU:</p>
<ul>
  <li>You're an AHPRA-registered clinician who can practise on the platform day one — that's revenue generation from month one, not month six</li>
  <li>You know the AU market — GP referral patterns, patient behaviour, chemist workflows, Medicare vs private mix</li>
  <li>You can recruit AU clinicians because you're one — clinical roster growth via your network</li>
  <li>You're already engaged with what we've built in NZ and understand the platform's design intent</li>
</ul>
<p>You bring what a nominee director can't. That's why the equity offer is 33% and not a directorship fee.</p>

<div class="footer">
  Draft prepared jointly by Dr Patrick Herling and Justin Thomas · Tere Health Limited · <strong>Nothing in this memo is a legal agreement.</strong> Any final structure must be executed through a qualified Trans-Tasman corporate lawyer. Numbers, thresholds, and split percentages are subject to change based on our joint discussion.
</div>

</body></html>`

async function main() {
  console.log('[shively-au-memo] launching headless Chromium…')
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent(HTML, { waitUntil: 'networkidle' })
  await page.pdf({
    path: OUT_PATH,
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', bottom: '22mm', left: '18mm', right: '18mm' },
  })
  await browser.close()
  const size = (await fs.stat(OUT_PATH)).size
  console.log(`[shively-au-memo] wrote ${OUT_PATH} (${(size/1024).toFixed(1)} KB)`)
}

main().catch(e => { console.error(e); process.exit(1) })
