// scripts/build-pdfs.mjs
//
// Regenerates the Tere Health compliance PDFs from their markdown sources.
// Uses Playwright (already installed) to render styled HTML → PDF.
//
// Usage:
//   node scripts/build-pdfs.mjs                    # all compliance docs
//   node scripts/build-pdfs.mjs security-compliance  # just one
//
// Output goes to ~/Downloads/ next to the earlier PDFs.

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'
import { marked } from 'marked'

const ROOT = path.resolve(new URL('..', import.meta.url).pathname)
const DOCS = path.join(ROOT, 'docs')
const OUT_DIR = path.join(os.homedir(), 'Downloads')

// Which markdown files build which PDF names + which badges to show on cover.
const DOCS_MAP = {
  'security-compliance': {
    src: 'security-compliance.md',
    out: 'Tere_Health_Security_Compliance.pdf',
    title: 'Security & Compliance Overview',
    badges: ['HIPC 2020 Compliant', 'AWS BAA Signed', 'HDC Code of Rights'],
  },
  'privacy-impact-assessment': {
    src: 'privacy-impact-assessment.md',
    out: 'Tere_Health_PIA.pdf',
    title: 'Privacy Impact Assessment',
    badges: ['HIPC Rules 1–12', 'Risk Register', 'Committed Actions'],
  },
  'disaster-recovery-plan': {
    src: 'disaster-recovery-plan.md',
    out: 'Tere_Health_DR_Plan.pdf',
    title: 'Disaster Recovery Plan',
    badges: ['RTO 30 min — critical', 'RPO ≤ 5 min', '7 runbooks'],
  },
  'incident-response-plan': {
    src: 'incident-response-plan.md',
    out: 'Tere_Health_IR_Plan.pdf',
    title: 'Incident Response Plan',
    badges: ['P0 triage ≤ 15 min', 'Contain ≤ 60 min', 'OPC notify ≤ 72 hr'],
  },
  'incident-tabletop-exercise': {
    src: 'incident-tabletop-exercise.md',
    out: 'Tere_Health_Tabletop.pdf',
    title: 'Incident Response Tabletop Exercise',
    badges: ['60–90 minutes', '5 scenarios', 'No live systems'],
  },
  'maori-data-sovereignty': {
    src: 'maori-data-sovereignty.md',
    out: 'Tere_Maori_Data_Sovereignty.pdf',
    title: 'Māori Data Sovereignty and Te Tiriti o Waitangi Obligations',
    badges: ['Working draft', 'Pre-Māori review', 'Honest gaps'],
  },
  'cost-and-unit-economics': {
    src: 'cost-and-unit-economics.md',
    out: 'Tere_Health_Cost_Structure.pdf',
    title: 'Cost Structure & Unit Economics',
    badges: ['Confidential', 'Internal review', '2026-07-08'],
  },
}

const CSS = `
  @page { size: A4; margin: 22mm 18mm 22mm 18mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    color: #1A2A33;
    font-size: 10.5pt;
    line-height: 1.55;
    margin: 0;
  }
  h1 { color: #0B6E76; font-size: 20pt; margin: 0 0 4px; letter-spacing: -.01em; }
  h2 {
    color: #0B6E76;
    font-size: 15pt;
    margin: 22pt 0 8pt;
    padding-bottom: 4pt;
    border-bottom: 2px solid #0B6E76;
  }
  h3 { color: #0D2B45; font-size: 12pt; margin: 16pt 0 6pt; }
  h4 { color: #0D2B45; font-size: 11pt; margin: 12pt 0 4pt; }
  p, ul, ol { margin: 0 0 8pt; }
  ul, ol { padding-left: 20pt; }
  li { margin: 3pt 0; }
  code {
    background: #F1F5F9;
    padding: 1pt 4pt;
    border-radius: 3px;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    font-size: 9pt;
    color: #0B4F5A;
  }
  pre {
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-left: 3px solid #0B6E76;
    padding: 10pt 12pt;
    border-radius: 4px;
    overflow: hidden;
    font-size: 9pt;
    line-height: 1.45;
  }
  pre code { background: none; padding: 0; color: #1A2A33; }
  a { color: #0B6E76; text-decoration: none; }
  strong { color: #0D2B45; }
  em { color: #374151; font-style: italic; }
  blockquote {
    margin: 8pt 0;
    padding: 8pt 14pt;
    background: #F0F9FA;
    border-left: 3px solid #0B6E76;
    color: #0D2B45;
    font-style: normal;
  }
  hr { border: none; border-top: 1px solid #E2E8F0; margin: 18pt 0; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8pt 0 12pt;
    font-size: 9.5pt;
  }
  th {
    background: #0D2B45;
    color: white;
    text-align: left;
    padding: 7pt 9pt;
    font-weight: 700;
    font-size: 9pt;
  }
  td { padding: 7pt 9pt; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
  tr:nth-child(even) td { background: #F8FAFC; }

  .cover {
    page-break-after: always;
    padding: 20mm 8mm 8mm;
    text-align: center;
  }
  .cover .brand {
    font-size: 26pt;
    font-weight: 800;
    color: #0D2B45;
    letter-spacing: .04em;
    margin-bottom: 6pt;
  }
  .cover .title {
    font-size: 22pt;
    color: #0B6E76;
    font-weight: 700;
    margin-bottom: 22pt;
    line-height: 1.15;
  }
  .cover .divider {
    height: 3px;
    background: #0B6E76;
    width: 60%;
    margin: 0 auto 30pt;
  }
  .cover .badges {
    display: flex;
    gap: 10pt;
    justify-content: center;
    margin: 20pt 0 30pt;
    flex-wrap: wrap;
  }
  .cover .badge {
    background: #0D2B45;
    color: white;
    padding: 7pt 14pt;
    border-radius: 24px;
    font-size: 10pt;
    font-weight: 700;
  }
  .cover .badge.accent { background: #0B6E76; }
  .cover .meta {
    margin: 20pt auto 0;
    max-width: 460pt;
    text-align: left;
    border-top: 1px solid #E2E8F0;
    border-bottom: 1px solid #E2E8F0;
  }
  .cover .meta-row {
    display: flex;
    padding: 8pt 12pt;
    border-bottom: 1px solid #F1F5F9;
  }
  .cover .meta-row:last-child { border-bottom: none; }
  .cover .meta-row:nth-child(even) { background: #F8FAFC; }
  .cover .meta-label {
    background: #0D2B45;
    color: white;
    font-weight: 700;
    padding: 6pt 10pt;
    width: 140pt;
    margin: -8pt 12pt -8pt -12pt;
    font-size: 9.5pt;
    display: flex;
    align-items: center;
  }
  .cover .meta-value {
    flex: 1;
    padding: 2pt 0;
    font-size: 10pt;
    color: #1A2A33;
  }

  .footer-note {
    margin-top: 40pt;
    font-size: 8.5pt;
    color: #9CA3AF;
    text-align: center;
    border-top: 1px solid #E2E8F0;
    padding-top: 10pt;
  }
`

async function extractMeta(md) {
  // Pull the top block of "**Key:** value" lines that precede the first ---
  const lines = md.split(/\r?\n/)
  const meta = {}
  for (const line of lines.slice(0, 30)) {
    const match = line.match(/^\*\*([^*]+):\*\*\s+(.+)$/)
    if (match) {
      meta[match[1].trim()] = match[2].replace(/`([^`]+)`/g, '$1').trim()
    }
    if (line.startsWith('---')) break
  }
  return meta
}

async function buildOne(key, cfg) {
  const srcPath = path.join(DOCS, cfg.src)
  const outPath = path.join(OUT_DIR, cfg.out)
  const raw = await fs.readFile(srcPath, 'utf-8')

  // Strip the H1 title from the markdown body — we render our own cover.
  const withoutH1 = raw.replace(/^#\s+.+\n\n?/, '')
  // Strip the leading meta block (up to the first --- separator) — we render our own cover meta.
  const bodyStart = withoutH1.indexOf('\n---\n')
  const body = bodyStart >= 0 ? withoutH1.slice(bodyStart + 5).trimStart() : withoutH1

  const meta = await extractMeta(raw)
  const bodyHtml = marked.parse(body, { headerIds: false, mangle: false })

  const metaRows = Object.entries(meta).slice(0, 8).map(([label, value]) => `
    <div class="meta-row">
      <div class="meta-label">${escapeHtml(label)}</div>
      <div class="meta-value">${escapeHtml(value)}</div>
    </div>`).join('')

  const badges = cfg.badges.map((b, i) => `
    <div class="badge ${i === 1 ? 'accent' : ''}">✓ ${escapeHtml(b)}</div>`).join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(cfg.title)}</title>
<style>${CSS}</style>
</head>
<body>
  <section class="cover">
    <div class="brand">TERE HEALTH</div>
    <div class="title">${escapeHtml(cfg.title)}</div>
    <div class="divider"></div>
    <div class="badges">${badges}</div>
    <div class="meta">${metaRows}</div>
    <div class="footer-note">
      Tere Health Limited · terehealth.co.nz · Confidential
    </div>
  </section>
  ${bodyHtml}
</body>
</html>`

  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'load' })
  await page.pdf({
    path: outPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
    displayHeaderFooter: true,
    footerTemplate: `
      <div style="width:100%;font-size:8pt;color:#9CA3AF;padding:0 16mm;display:flex;justify-content:space-between;">
        <span>Tere Health Limited · ${escapeHtml(cfg.title)}</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>`,
    headerTemplate: '<div></div>',
  })
  await browser.close()
  return outPath
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function main() {
  const [, , which] = process.argv
  const keys = which ? [which] : Object.keys(DOCS_MAP)
  console.log(`Building ${keys.length} PDF${keys.length === 1 ? '' : 's'} → ${OUT_DIR}`)
  for (const key of keys) {
    const cfg = DOCS_MAP[key]
    if (!cfg) {
      console.error(`Unknown doc key: ${key}`)
      console.error(`Available: ${Object.keys(DOCS_MAP).join(', ')}`)
      process.exit(1)
    }
    process.stdout.write(`  ${key} → `)
    const out = await buildOne(key, cfg)
    console.log(path.basename(out))
  }
  console.log(`Done.`)
}

main().catch(err => { console.error(err); process.exit(1) })
