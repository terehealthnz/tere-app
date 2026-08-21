// scripts/build-corporate-screenshots.mjs
//
// Generates the two product screenshots embedded in the corporate landing
// (src/pages/corporate/TereCorporate.jsx):
//
//   public/corporate/hl7-inbox.png     — inbox list (fanned-out batch)
//   public/corporate/hl7-abnormal.png  — HL7 detail with abnormal flags
//
// Uses hardcoded mock patient data. No DB access, no PHI risk. Rerun any
// time to refresh the marketing surface — the UI style closely mirrors the
// live provider inbox (src/pages/clinician/ProviderInbox.jsx + hl7Display.js).
//
// Distinct from scripts/screenshot-hl7-batched-for-tony.mjs which pulls
// real batch rows for engineering evidence to Medical-Objects (case
// #1058382). That script is for internal / support use, NOT marketing.

import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Courier New", monospace'

function esc(s) {
  if (s == null) return ''
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
function pill(text, bg, color) {
  return `<span style="display:inline-block;background:${bg};color:${color};padding:2px 8px;border-radius:99px;font-size:.72rem;font-weight:700;letter-spacing:.02em;text-transform:uppercase;">${esc(text)}</span>`
}

// Mock patients for the inbox list — realistic-sounding NZ + mixed names
// but not real people. DOB deliberately in the past century so nothing
// looks like a live patient identifier.
const INBOX = [
  { name: 'Sarah Wilson',    dob: '1972-04-12', test: 'CBC + differential',            time: '09:14', abnormal: true  },
  { name: 'James Ngata',     dob: '1958-11-30', test: 'HbA1c',                         time: '09:22', abnormal: false },
  { name: 'Aroha Mitchell',  dob: '1984-07-05', test: 'Iron studies',                  time: '09:31', abnormal: true  },
  { name: 'David Chen',      dob: '1969-02-18', test: 'Lipid panel',                   time: '09:47', abnormal: false },
  { name: 'Emily Thompson',  dob: '1991-09-24', test: 'TSH + free T4',                 time: '10:02', abnormal: false },
  { name: 'Tama Reweti',     dob: '1965-12-08', test: 'Urea + electrolytes',           time: '10:15', abnormal: true  },
  { name: 'Priya Sharma',    dob: '1978-06-14', test: 'Group + hold',                  time: '10:23', abnormal: false },
]

// Mock CBC report — the abnormal-detection showcase.
const REPORT = {
  patient: 'Sarah Wilson',
  dob:     '12/04/1972',
  sex:     'F',
  test:    'Full blood count + differential',
  dates: {
    requested:   '15/08/2026 08:25',
    observation: '15/08/2026 09:10',
    generated:   '15/08/2026 09:47',
  },
  orderedBy: 'Dr M. Patel, Nelson',
  observations: [
    { name: 'Haemoglobin',            value: '91',    units: 'g/L',       ref: '130–175', flag: 'L' },
    { name: 'PCV',                    value: '0.29',  units: 'L/L',       ref: '0.40–0.52', flag: 'L' },
    { name: 'MCV',                    value: '81',    units: 'fL',        ref: '80–99',   flag: 'N' },
    { name: 'MCH',                    value: '25',    units: 'pg',        ref: '27–33',   flag: 'L' },
    { name: 'WBC',                    value: '9.0',   units: '×10⁹/L',    ref: '4.0–11.0', flag: 'N' },
    { name: 'Differential — Neutrophils',  value: '6.3',   units: '×10⁹/L',    ref: '1.9–7.5',  flag: 'N' },
    { name: 'Differential — Lymphocytes',  value: '1.6',   units: '×10⁹/L',    ref: '1.0–4.0',  flag: 'N' },
    { name: 'Differential — Monocytes',    value: '0.8',   units: '×10⁹/L',    ref: '0.2–1.0',  flag: 'N' },
    { name: 'Differential — Eosinophils',  value: '0.2',   units: '×10⁹/L',    ref: '0.0–0.5',  flag: 'N' },
    { name: 'Platelet count',         value: '333',   units: '×10⁹/L',    ref: '150–400', flag: 'N' },
  ],
  notes: 'Note falling MCV; suggest review ferritin.\nIncreased polychromatic cells.\nBlood film reviewed by JM(H) MLT',
}

function renderInboxList() {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  body { font-family:${FF}; background:#F7F5F0; margin:0; padding:32px; color:${NAVY}; }
  .container { max-width: 960px; margin: 0 auto; }
  .head { display:flex; align-items:center; justify-content:space-between; margin-bottom:22px; }
  .brand { display:flex; align-items:baseline; gap:8px; }
  .brand .n { font-family:Cormorant Garamond,Georgia,serif; font-style:italic; color:${NAVY}; font-size:1.35rem; font-weight:700; }
  .brand .s { font-size:.68rem; letter-spacing:.14em; text-transform:uppercase; color:#6B7280; font-weight:700; }
  h1 { margin:0; font-size:1.35rem; }
  .subtitle { color:#4B5563; font-size:.85rem; margin-top:2px; }
  .row { background:white; border:1px solid #E2E8F0; border-radius:10px; padding:14px 18px; margin-bottom:8px; display:grid; grid-template-columns:1fr auto; gap:14px; align-items:center; }
  .rowbody { display:flex; flex-direction:column; gap:4px; min-width:0; }
  .rowtitle { font-weight:700; font-size:.95rem; }
  .rowmeta { font-family:${MONO}; font-size:.75rem; color:#64748B; }
  .rowright { display:flex; flex-direction:column; align-items:flex-end; gap:6px; font-size:.72rem; color:#64748B; }
</style></head><body>
<div class="container">
  <div class="head">
    <div>
      <h1>Inbox — inbound results &amp; referrals</h1>
      <div class="subtitle">${INBOX.length} messages routed to you today</div>
    </div>
    <div class="brand">
      <span class="n">Tere</span>
      <span class="s">Provider</span>
    </div>
  </div>

  ${INBOX.map(r => `
    <div class="row">
      <div class="rowbody">
        <div class="rowtitle">${esc(r.name)} <span style="color:#6B7280;font-weight:500;">· DOB ${esc(r.dob)}</span></div>
        <div class="rowmeta"><strong style="color:${NAVY}">${esc(r.test)}</strong> · received ${r.time}</div>
      </div>
      <div class="rowright">
        ${r.abnormal ? pill('⚠ Abnormal', '#FEE2E2', '#991B1B') : pill('Received', '#DBEAFE', '#1E40AF')}
      </div>
    </div>`).join('')}
</div>
</body></html>`
}

function renderReportDetail() {
  const anyAbnormal = REPORT.observations.some(o => o.flag && o.flag !== 'N')
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  body { font-family:${FF}; background:#F7F5F0; margin:0; padding:24px; color:${NAVY}; }
  .card { max-width: 720px; margin: 0 auto; background:white; border:1px solid #E2E8F0; border-radius:12px; padding:26px 30px; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid #E2E8F0; }
  h1 { margin:0; font-size:1.35rem; color:${NAVY}; }
  .meta { color:#64748B; font-size:.85rem; margin-top:4px; }
  .kv { display:grid; grid-template-columns:auto 1fr; gap:6px 12px; font-size:.85rem; margin-bottom:20px; }
  .kv .k { color:#64748B; font-weight:600; }
  .kv .v { color:${NAVY}; }
  h2 { font-size:.75rem; text-transform:uppercase; letter-spacing:.1em; color:${TEAL}; margin:22px 0 10px; font-weight:700; }
  table { width:100%; border-collapse:collapse; font-size:.85rem; }
  th { text-align:left; background:#F1F5F9; padding:8px 10px; color:${NAVY}; font-weight:700; border-bottom:2px solid #CBD5E1; font-size:.72rem; letter-spacing:.05em; text-transform:uppercase; }
  td { padding:7px 10px; border-bottom:1px solid #F1F5F9; vertical-align:top; }
  td.mono { font-family:${MONO}; }
  .abnval { color:#991B1B; font-weight:700; }
  .notes { background:#F8FAFC; padding:12px 16px; border-radius:8px; font-size:.85rem; color:#374151; white-space:pre-wrap; word-break:break-word; line-height:1.55; }
</style></head><body>
<div class="card">
  <div class="header">
    <div>
      <h1>${esc(REPORT.patient)}</h1>
      <div class="meta">DOB ${esc(REPORT.dob)} · ${esc(REPORT.sex)}</div>
    </div>
    <div style="text-align:right;">
      ${pill('New', '#DBEAFE', '#1E40AF')}
      ${anyAbnormal ? ' ' + pill('⚠ Abnormal', '#FEE2E2', '#991B1B') : ''}
    </div>
  </div>

  <div class="kv">
    <div class="k">Test</div><div class="v"><strong>${esc(REPORT.test)}</strong></div>
    <div class="k">Requested</div><div class="v">${esc(REPORT.dates.requested)}</div>
    <div class="k">Effective</div><div class="v">${esc(REPORT.dates.observation)}</div>
    <div class="k">Generated</div><div class="v">${esc(REPORT.dates.generated)}</div>
    <div class="k">Referred by</div><div class="v">${esc(REPORT.orderedBy)}</div>
  </div>

  <h2>Observations (${REPORT.observations.length})</h2>
  <table>
    <thead><tr><th>Test</th><th>Value</th><th>Units</th><th>Ref range</th><th>Flag</th></tr></thead>
    <tbody>
      ${REPORT.observations.map(o => {
        const abn = o.flag && o.flag !== 'N'
        return `<tr>
          <td>${esc(o.name)}</td>
          <td class="mono ${abn ? 'abnval' : ''}">${esc(o.value)}</td>
          <td>${esc(o.units)}</td>
          <td>${esc(o.ref)}</td>
          <td class="${abn ? 'abnval' : ''}">${esc(o.flag || '')}</td>
        </tr>`
      }).join('')}
    </tbody>
  </table>

  <h2>Notes</h2>
  <div class="notes">${esc(REPORT.notes)}</div>
</div>
</body></html>`
}

async function shoot(html, outPath, viewportHeight) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1120, height: viewportHeight }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.setContent(html, { waitUntil: 'domcontentloaded' })
  // Trim: measure actual content height so the screenshot fits tightly.
  const contentHeight = await page.evaluate(() => {
    const body = document.body
    const container = body.querySelector('.container') || body.querySelector('.card') || body
    const rect = container.getBoundingClientRect()
    return Math.ceil(rect.bottom + 32)
  })
  await page.setViewportSize({ width: 1120, height: contentHeight })
  await page.screenshot({ path: outPath, fullPage: false })
  await browser.close()
  const stat = await fs.stat(outPath)
  console.log(`  wrote ${outPath} (${Math.round(stat.size / 1024)} KB, ${contentHeight}px tall)`)
}

async function main() {
  const outDir = path.resolve('public/corporate')
  await fs.mkdir(outDir, { recursive: true })
  console.log('Rendering inbox list…')
  await shoot(renderInboxList(),  path.join(outDir, 'hl7-inbox.png'),    900)
  console.log('Rendering report detail…')
  await shoot(renderReportDetail(), path.join(outDir, 'hl7-abnormal.png'), 900)
  console.log('\nDone. Refresh tere.co.nz to see updated screenshots.')
}

main().catch(err => { console.error(err); process.exit(1) })
