// scripts/build-au-expansion-memo-pdf.mjs
//
// Generates a founder decision memo PDF from Patrick to Justin about the
// proposed AU expansion + Shively partnership structure. Output ready to
// email / print / drop into a shared drive.
//
// Usage:
//   node scripts/build-au-expansion-memo-pdf.mjs
//
// Output: ~/Downloads/Tere_AU_Expansion_Memo.pdf

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'

const OUT_PATH = path.join(os.homedir(), 'Downloads', 'Tere_AU_Expansion_Memo.pdf')

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

<h1>Tere Health — AU Expansion &amp; Shively Partnership</h1>
<div class="subtitle">Founder decision memo · Patrick → Justin</div>
<div class="meta">Draft v2 · not sent · 2026-08-18</div>

<hr>

<h2>1. TL;DR</h2>
<p>Shively is interested in helping us launch Tere AU. This memo proposes how we structure the partnership so it's fair to what we've already built, fair to what he brings, clean at exit, and preserves our full ownership + control of the parent.</p>

<div class="callout">
  <strong>Recommended structure:</strong> new NZ holding company (Tere Global Holdings Ltd) owned <strong>50 / 50 by you and me</strong>. Global owns 100% of NZ Tere, 100% of the platform IP, and is majority owner of every future country subsidiary. Shively co-founds <strong>AU Tere Pty Ltd only</strong> — starting at 10%, vesting to 33% direct AU equity when AU hits A$300k cumulative revenue. Global holds the other 67% of AU. Sale decision stays with you and me alone; Shively is drag-along-bound to sell his AU stake alongside on the same terms.
</div>

<h2>2. Where we are today</h2>
<ul>
  <li><strong>Tere Health Ltd (NZ)</strong> — you and I own it 50 / 50. Full platform IP, MCNZ/ACC/HPI regulatory rails, brand, live prod, ~1 year of dev.</li>
  <li><strong>Shively</strong> — AU-based, interested in co-founding Tere AU. Brings <strong>four things at once</strong>:
    <ul>
      <li>AU-resident directorship (satisfies ASIC's mandatory local director rule for free)</li>
      <li>AU market entry + BD network</li>
      <li>AHPRA-registered clinical practice — <strong>seeing patients on the platform himself</strong>, generating consult revenue day one</li>
      <li>Founding clinical operator to build the AU provider roster around</li>
    </ul>
  </li>
  <li><strong>No AU entity yet.</strong> No shareholder agreement with vesting on our existing NZ shares. Both are OK for two founders but need fixing before a third joins.</li>
</ul>

<h2>3. Proposed structure</h2>

<div class="diagram">           Tere Global Holdings Ltd (NZ)
           ├─ Herling: 50%
           └─ Thomas:  50%
              [owns platform IP + Tere brand + 100% NZ + majority of every country sub]
                          │
             ┌────────────┼─────────────────────┐
             │            │                     │
        NZ Tere Ltd   AU Tere Pty Ltd     future subs
        Global 100%   Global    67%       (US, UK, etc.)
                      Shively   33% ←──   Global 100% (or country-partner 67/33)
                      (direct — vests
                       from 10% at A$300k)
                      [Shively as sole director + AHPRA clinician]</div>

<p>You and I own the mothership 50 / 50. The mothership owns 100% of NZ Tere, all platform IP, and controlling stakes in every country subsidiary. Shively co-founds AU Tere Pty Ltd only — direct minority equity in the country business he's building. He never sits on the Global cap table.</p>

<h3>Why subsidiary-only equity (vs Shively equity in Global itself)</h3>
<ul>
  <li><strong>No dilution to us at the parent.</strong> You and I stay 50 / 50 in Global for the life of the company. NZ upside is fully retained. Future country expansions don't touch our parent cap table either.</li>
  <li><strong>Equity shape matches contribution shape.</strong> Shively is building AU. He gets economic upside from AU. He doesn't get economic upside from NZ (which he had no hand in) or from a future US/UK launch (which he also won't build).</li>
  <li><strong>Scales cleanly for future country co-founders.</strong> US launch in 2027? Slot a US-resident co-founder into US Tere Inc at 33%, Global keeps 67%. UK in 2028? Same pattern. Parent cap table never changes; each country entity has its own local co-founder economics.</li>
  <li><strong>IP value stays with us.</strong> IP sits in Global. Every country sub pays Global an IP licence fee (see §5). Shively is compensated for AU dev work via salary + AU equity, but the IP appreciation flows to us via Global.</li>
</ul>

<h2>4. Shively equity — single-trigger earn-in on AU only</h2>

<p>Shively starts at <strong>10% of AU Tere Pty Ltd</strong> day one. If AU hits <strong>A$300k cumulative revenue</strong>, Shively vests to <strong>33.33%</strong> of AU Tere. Global's 67% is unaffected — the top-up comes from Global-issued dilution inside AU (Global 90% → 67%). No changes at any point to Global's 50 / 50 Herling / Thomas cap table.</p>

<table>
  <thead><tr><th>State</th><th>AU Tere cap table (Global / Shively)</th><th>Global cap table (Herling / Thomas)</th></tr></thead>
  <tbody>
    <tr><td>Day one — AU entity formed, Shively director + AHPRA active</td><td class="amount">90 / 10</td><td class="amount">50 / 50</td></tr>
    <tr><td>AU Tere hits A$300k cumulative revenue</td><td class="amount">67 / 33.33</td><td class="amount">50 / 50 (unchanged)</td></tr>
  </tbody>
</table>

<p><strong>Mechanic:</strong> AU Tere issues new shares to Shively on the trigger event; Global's holding dilutes from 90% to 67%. Trigger written into the AU Tere shareholder agreement as an automatic vest — verified by our accountant against AU Tere's revenue books.</p>

<div class="callout">
  <strong>Why A$300k:</strong> ~4,600 A$65 consults, or a small clinic's worth of AU volume — enough to prove AU is a real, running business, not a science project. Because Shively will be seeing AU patients himself as an AHPRA-registered clinician on the platform, his own consult throughput contributes directly toward the trigger — he's incentivised on both sides (BD and personal clinical output). If Shively gets us there, he's earned equal partnership in the country he built. If AU never gets past a few hundred consults, he keeps 10% of a small subsidiary rather than 33% of it.
</div>

<h3>Sale mechanics — how the exit works cleanly</h3>
<p>The SHA needs four clauses to make Justin's subsidiary structure exit-clean:</p>
<ol>
  <li><strong>Drag-along on Shively's 33%.</strong> If an acquirer offers to buy Global (owning IP + NZ + 67% AU) and Global's shareholders (you + me) accept, Shively is contractually forced to sell his 33% AU stake to the same acquirer on the same per-share terms. Single transaction, one buyer, no separate negotiation.</li>
  <li><strong>Tag-along for Shively.</strong> Conversely, if you and I sell our Global stake pre-exit to a third party, Shively can force pro-rata sale of his AU stake to the same buyer. Protects him from being stranded with a new majority owner he didn't pick.</li>
  <li><strong>IP licence from AU Tere to Global.</strong> Base 4% of AU revenue, stepping up to 6% at A$1M and 8% at A$3M. Locks IP value inside Global regardless of how big AU gets.</li>
  <li><strong>Work-for-hire clause.</strong> Any AU-jurisdictional IP work (protocols, AHPRA workflows, AU pharmacy connectors, Medicare integration) assigns back to Global. Shively is compensated for this via his consult rate + salary, not AU equity.</li>
</ol>

<h3>Protection: time-based reverse cliff</h3>
<p>If AU Pty Ltd has not billed a single patient within <strong>6 months</strong> of entity formation, Shively's 10% base repurchases at nominal value. Prevents the "he ties up 10% of AU doing nothing" scenario.</p>

<h2>5. IP treatment</h2>
<p>The platform will be modified for AU (Medicare integration replacing ACC, AHPRA vs MCNZ scope logic, AU pharmacy connectors, etc). We propose:</p>
<ul>
  <li><strong>All IP — including AU-specific extensions — is owned by Tere Global</strong> via work-for-hire clauses in Shively's shareholder + employment agreements.</li>
  <li><strong>AU Tere pays Global an IP licence fee</strong> tiered on AU revenue: 4% below A$1M, 6% between A$1M and A$3M, 8% above A$3M. This means as AU scales, more of the value flows back to Global (and therefore to us).</li>
  <li><strong>Shively is compensated for his AU dev work</strong> via (a) a market-rate salary or consulting fee paid by AU Pty Ltd, and (b) his AU Tere equity, which appreciates directly with AU revenue.</li>
  <li>This is how every SaaS franchisor structures country expansions. Alternative (AU keeps AU-specific IP) fragments the crown jewel and destroys the exit story.</li>
</ul>

<h2>6. What Shively gets from this</h2>
<ul>
  <li>Genuine co-founder status <strong>of Tere AU</strong> — 33.33% direct equity in the country business he builds, at trigger</li>
  <li>Immediate 10% AU stake for showing up and getting AU legally ready</li>
  <li>Directorship of AU Pty Ltd, per-consult income for the patients he sees himself, and market-rate compensation for AU dev work he contributes</li>
  <li>Meaningful upside on the AU business he builds — the entity he's most directly responsible for</li>
  <li>Because he's a clinician on the platform, his own consult volume contributes directly to hitting the A$300k trigger — his equity vest is aligned with his own patient throughput, not just business development</li>
  <li>Tag-along protection — if we sell Global to a third party, he can force pro-rata sale of his AU stake to the same buyer on the same terms</li>
</ul>

<h2>7. What this asks of us</h2>
<ul>
  <li>Set up Tere Global Holdings Ltd (NZ Companies Office, ~1 week)</li>
  <li>Share-for-share swap: move our NZ Tere Ltd shares into Global (needs accountant rollover opinion — IRD-neutral if done right, taxable if done wrong)</li>
  <li>Form AU Tere Pty Ltd as 90% Global / 10% Shively at incorporation (ASIC, ~2 weeks)</li>
  <li>Sign shareholder agreement for AU Tere with milestone vesting, drag-along, tag-along, IP licence terms</li>
  <li>Sign shareholder agreement at Global level with retroactive vesting on our existing NZ shares (which we should have done at incorporation)</li>
  <li>Assign platform IP up to Global via intra-group IP assignment</li>
</ul>

<p><strong>Total legal + accounting cost:</strong> ~$10–18k NZD, one-time (two SHAs vs one adds a bit). Ongoing overhead: ~$2k/yr per extra entity.</p>

<h2>8. Timing</h2>
<p>Whole restructure realistic in <strong>4–6 weeks</strong> from decision. Cheapest possible moment to do it — pre-revenue, pre-investor, pre-option-pool. Every day we add complexity (raise, hire, employee options) this same reorg gets 3–5x more expensive to unwind later.</p>

<h2>9. Alternatives we considered and rejected</h2>
<table>
  <thead><tr><th>Structure</th><th>Why not</th></tr></thead>
  <tbody>
    <tr><td>Shively 33% of Global holding company (equal partner in parent)</td><td>Dilutes us to 33.33% each in Global — Shively gets NZ + IP + future country upside he didn't contribute to. Also gives him a vote in sale decisions and future country expansions, which don't concern him.</td></tr>
    <tr><td>Shively 25% of Global holding company (capped parent equity)</td><td>Smaller dilution but same conceptual problem — parent equity for country-scoped contribution. Also creates awkward voting minority in Global (25% is loud enough to be noise, not enough to be decisive).</td></tr>
    <tr><td>Direct 33 / 33 / 33 in AU Pty Ltd (no holdco, no NZ Tere restructure, no drag-along)</td><td>Cross-border IP messiness. No mechanism to force joint sale at exit. Also gives Shively equal AU say from day one before he's proved anything.</td></tr>
    <tr><td>Multi-milestone earn-in (10% → 15% → 20% → 25% → 30% → 33% across 5 triggers)</td><td>Fairer in theory but administratively noisy — 5 vesting events to track, plus felt more like a probation ladder than partnership. Single-trigger jump is cleaner and lands the same place.</td></tr>
    <tr><td>Salary-only for Shively, no equity</td><td>He wouldn't take it — this is a co-founder pitch, not a hire.</td></tr>
  </tbody>
</table>

<h2>10. The Shively conversation</h2>
<p>Framing when we present this to him:</p>
<p><em>"You're co-founding Tere AU. Global (NZ parent) owns 90% of AU day one, you own 10%. As AU hits A$300k cumulative revenue, your stake vests to 33% — you become an equal partner in the AU country business you build. Global holds all platform IP and 67% of AU, so as AU scales the IP appreciation flows to the parent; you're compensated for AU dev work via salary plus your AU equity. You'll be sole director of AU Pty Ltd, seeing patients on the platform yourself, and building the AU provider roster. If we ever sell Global as a whole company, standard drag-along means your AU stake sells alongside on the same terms — no separate negotiation, you get 33% of whatever the acquirer values AU at."</em></p>

<div class="warn">
  <strong>Watch:</strong> Shively may push for Global-level equity (equal parent partnership), or a higher AU day-one base (15–20%), or a lower trigger (A$200k). Have a floor in mind before the conversation. Justin's and my floor: <strong>10% AU day one, 33% AU at A$300k, zero Global equity ever</strong>. The parent cap table is not open for discussion — that's the deal. If he can't accept the AU-only frame, we have a bigger conversation about whether the partnership fits.
</div>

<h2>11. Legal / tax path</h2>
<ol>
  <li>Engage a Trans-Tasman corporate lawyer for the bundle: holdco formation, share swap, AU incorporation, two SHAs (Global + AU Tere), IP assignment + licence agreement. Suggested firms (any of): MinterEllisonRuddWatts, Bell Gully, Buddle Findlay. Fixed-fee quote likely in the $10–18k NZD range.</li>
  <li>Accountant signs off on the NZ share-for-share rollover before we execute — this is the one step that goes badly if done DIY.</li>
  <li>Shively applies for Director ID via ABRS (30 min, free).</li>
  <li>ASIC incorporation for AU Pty Ltd. ABN + GST registration follows.</li>
  <li>AHPRA registration for any doctor practising through the AU entity — starts in parallel, takes 6–12 weeks (long pole; kick off early).</li>
</ol>

<div class="ask">
  <h3>The specific ask</h3>
  <ol>
    <li>Do you agree with the <strong>Global holdco + AU-only Shively equity</strong> structure (parent stays 50 / 50 you and me forever, Shively gets AU country equity only)? <em>(y/n + any concerns)</em></li>
    <li>Are you OK with the day-one AU cap table: <strong>Global 90 / Shively 10</strong>, moving to <strong>67 / 33.33</strong> at A$300k AU revenue? <em>(y/n)</em></li>
    <li>Any changes to the trigger threshold (A$300k) or the IP licence rate tiers (4% / 6% / 8%) before we present it to Shively? <em>(these are starting numbers, not final)</em></li>
    <li>Do you want to be on the call when we present this to Shively, or delegate to me?</li>
    <li>Any preferred Trans-Tasman lawyer or accountant, or shall I get quotes from the three named above?</li>
  </ol>
</div>

<div class="footer">
  Draft prepared by Dr Patrick Herling, CMO · Tere Health Limited · <strong>Nothing in this memo is a legal agreement.</strong> Any final structure must be executed through a qualified Trans-Tasman corporate lawyer and reviewed by our accountant before signing. Numbers, thresholds, and split percentages are all subject to change based on our joint discussion + Shively's response.
</div>

</body></html>`

async function main() {
  console.log('[au-expansion-memo] launching headless Chromium…')
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
  console.log(`[au-expansion-memo] wrote ${OUT_PATH} (${(size/1024).toFixed(1)} KB)`)
}

main().catch(e => { console.error(e); process.exit(1) })
