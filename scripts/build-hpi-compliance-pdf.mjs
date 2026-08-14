// scripts/build-hpi-compliance-pdf.mjs
//
// Turns the JSON evidence bundle from /api/hpi?action=compliance_pack into
// a PDF suitable for the Te Whatu Ora HPI FHIR API Compliance Submission
// form (Digital Services Hub).
//
// Usage:
//   1. As admin, hit https://terehealth.co.nz/api/hpi?action=compliance_pack
//      in your browser. Save the response as ~/Downloads/hpi-compliance-pack.json
//      (Cmd+S in Chrome, or copy-paste into a file).
//   2. Run:  node scripts/build-hpi-compliance-pdf.mjs
//   3. Output lands at ~/Downloads/Tere_Health_HPI_Compliance_Evidence.pdf,
//      ready to attach to the compliance form.
//
// You can pass a custom input path:
//   node scripts/build-hpi-compliance-pdf.mjs /path/to/pack.json

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'

const DEFAULT_IN  = path.join(os.homedir(), 'Downloads', 'hpi-compliance-pack.json')
const OUT_PATH    = path.join(os.homedir(), 'Downloads', 'Tere_Health_HPI_Compliance_Evidence.pdf')

const CSS = `
  @page { size: A4; margin: 22mm 18mm 22mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1A2A33; font-size: 10.5pt; line-height: 1.55; margin: 0; }
  h1 { color: #0B6E76; font-size: 20pt; margin: 0 0 4px; }
  h2 { color: #0B6E76; font-size: 15pt; margin: 22pt 0 8pt; padding-bottom: 4pt; border-bottom: 2px solid #0B6E76; }
  h3 { color: #0D2B45; font-size: 12pt; margin: 16pt 0 6pt; }
  p, ul { margin: 0 0 8pt; }
  ul { padding-left: 20pt; }
  li { margin: 3pt 0; }
  code { background: #F1F5F9; padding: 1pt 4pt; border-radius: 3px; font-family: 'SF Mono', Menlo, monospace; font-size: 9pt; color: #0B4F5A; }
  pre { background: #F8FAFC; border: 1px solid #E2E8F0; border-left: 3px solid #0B6E76; padding: 10pt 12pt; border-radius: 4px; font-size: 8.5pt; line-height: 1.45; white-space: pre-wrap; word-break: break-word; overflow: hidden; }
  strong { color: #0D2B45; }
  hr { border: none; border-top: 1px solid #E2E8F0; margin: 18pt 0; }
  table { width: 100%; border-collapse: collapse; margin: 8pt 0 12pt; font-size: 9.5pt; }
  th { background: #0D2B45; color: white; text-align: left; padding: 7pt 9pt; font-weight: 700; font-size: 9pt; }
  td { padding: 7pt 9pt; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
  tr:nth-child(even) td { background: #F8FAFC; }

  .cover { page-break-after: always; padding: 20mm 8mm 8mm; text-align: center; }
  .cover .brand { font-size: 26pt; font-weight: 800; color: #0D2B45; letter-spacing: .04em; margin-bottom: 6pt; }
  .cover .title { font-size: 22pt; color: #0B6E76; font-weight: 700; margin-bottom: 22pt; line-height: 1.15; }
  .cover .divider { height: 3px; background: #0B6E76; width: 60%; margin: 0 auto 30pt; }
  .cover .badges { display: flex; gap: 10pt; justify-content: center; margin: 20pt 0 30pt; flex-wrap: wrap; }
  .cover .badge { background: #0D2B45; color: white; padding: 7pt 14pt; border-radius: 24px; font-size: 10pt; font-weight: 700; }
  .cover .badge.accent { background: #0B6E76; }
  .cover .meta { margin: 20pt auto 0; max-width: 460pt; text-align: left; border-top: 1px solid #E2E8F0; border-bottom: 1px solid #E2E8F0; }
  .cover .meta-row { display: flex; padding: 8pt 12pt; border-bottom: 1px solid #F1F5F9; }
  .cover .meta-row:last-child { border-bottom: none; }
  .cover .meta-row:nth-child(even) { background: #F8FAFC; }
  .cover .meta-label { background: #0D2B45; color: white; font-weight: 700; padding: 6pt 10pt; width: 140pt; margin: -8pt 12pt -8pt -12pt; font-size: 9.5pt; display: flex; align-items: center; }
  .cover .meta-value { flex: 1; padding: 2pt 0; font-size: 10pt; color: #1A2A33; }

  .scenario { margin: 14pt 0 18pt; padding: 0; border: 1px solid #E2E8F0; border-radius: 6px; overflow: hidden; page-break-inside: avoid; }
  .scenario .head { padding: 8pt 12pt; background: #F8FAFC; display: flex; justify-content: space-between; align-items: baseline; }
  .scenario .name { font-weight: 700; color: #0D2B45; font-size: 11pt; }
  .scenario .outcome { font-weight: 800; font-size: 10pt; padding: 2pt 10pt; border-radius: 12px; }
  .outcome.PASS   { background: #ECFDF5; color: #065F46; }
  .outcome.REVIEW { background: #FEF3C7; color: #92400E; }
  .outcome.FAIL   { background: #FEE2E2; color: #7F1D1D; }
  .scenario .body { padding: 10pt 12pt; }
  .scenario .row  { margin: 6pt 0; font-size: 9.5pt; }
  .scenario .label { font-weight: 700; color: #6B7280; text-transform: uppercase; letter-spacing: .04em; font-size: 8pt; margin-bottom: 2pt; }
`

async function main() {
  const [, , inPath] = process.argv
  const src = inPath ? path.resolve(inPath) : DEFAULT_IN
  const raw = await fs.readFile(src, 'utf-8')
  const pack = JSON.parse(raw)

  const badges = [
    `Scenarios: ${pack.summary.total}`,
    `Passed: ${pack.summary.passed}`,
    `Env: ${pack.environment.name}`,
  ]

  const scopesList = (pack.scopes || []).map(s => `<code>${escapeHtml(s)}</code>`).join('<br>')
  const metaRows = [
    ['Product',         pack.product.name],
    ['Product ID',      pack.product.product_id],
    ['Organisation',    pack.product.organisation],
    ['Organisation ID', pack.product.organisation_id],
    ['Environment',     pack.environment.name],
    ['Gateway',         pack.environment.gateway],
    ['Auth',            pack.environment.auth],
    ['Generated',       new Date(pack.generated_at).toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })],
  ].map(([label, value]) => `
    <div class="meta-row">
      <div class="meta-label">${escapeHtml(label)}</div>
      <div class="meta-value">${escapeHtml(String(value ?? '—'))}</div>
    </div>`).join('')

  const summaryRow = ({ name, purpose, expected, outcome, response, duration_ms, error }) => `
    <tr>
      <td><strong>${escapeHtml(name)}</strong></td>
      <td>${escapeHtml(expected.description || '—')}</td>
      <td>${response ? response.status : (error ? 'ERROR' : '—')}</td>
      <td><span class="outcome ${outcome}">${outcome}</span></td>
      <td>${duration_ms != null ? duration_ms + ' ms' : '—'}</td>
    </tr>`

  const scenarioBlock = (s) => `
    <div class="scenario">
      <div class="head">
        <div class="name">${escapeHtml(s.name)}</div>
        <div class="outcome ${s.outcome}">${s.outcome}</div>
      </div>
      <div class="body">
        <div class="row"><div class="label">Purpose</div>${escapeHtml(s.purpose)}</div>
        <div class="row"><div class="label">Expected</div>${escapeHtml(s.expected.description)}</div>
        <div class="row"><div class="label">Request URL</div><code>${escapeHtml(s.request?.url || '—')}</code></div>
        <div class="row"><div class="label">Response status</div>${s.response ? s.response.status : (s.error ? 'ERROR — ' + escapeHtml(s.error) : '—')}</div>
        ${s.response?.body_excerpt ? `<div class="row"><div class="label">Response body (excerpt)</div><pre>${escapeHtml(prettyIfJson(s.response.body_excerpt))}</pre></div>` : ''}
        <div class="row"><div class="label">Duration</div>${s.duration_ms != null ? s.duration_ms + ' ms' : '—'}</div>
      </div>
    </div>`

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Tere Health — HPI FHIR Compliance Evidence</title><style>${CSS}</style></head>
<body>
  <section class="cover">
    <div class="brand">TERE HEALTH</div>
    <div class="title">HPI FHIR API<br>Compliance Evidence</div>
    <div class="divider"></div>
    <div class="badges">
      ${badges.map((b, i) => `<div class="badge ${i === 1 ? 'accent' : ''}">${escapeHtml(b)}</div>`).join('')}
    </div>
    <div class="meta">${metaRows}</div>
  </section>

  <h2>1. Scope of submission</h2>
  <p>Tere Health Limited (HPI-O <code>${escapeHtml(pack.product.organisation_id)}</code>) is submitting compliance evidence for the Health Provider Index (HPI) FHIR API. Tere Health is a small New Zealand telehealth clinic; the integration uses HPI for administrative provider verification during clinician onboarding to our roster. All calls are server-side only (no browser-side HPI credentials), gated behind our internal admin authentication.</p>
  <p><strong>Functions covered:</strong></p>
  <ul>
    <li>Get Practitioner</li>
    <li>Search Practitioner</li>
    <li>Get Facility (Location resource)</li>
  </ul>
  <p><strong>Approved scopes exercised:</strong></p>
  <p>${scopesList}</p>

  <h2>2. Environment &amp; authentication</h2>
  <table>
    <tr><th style="width:180pt">Item</th><th>Value</th></tr>
    <tr><td>Environment</td><td>${escapeHtml(pack.environment.name)}</td></tr>
    <tr><td>Gateway</td><td>${escapeHtml(pack.environment.gateway)}</td></tr>
    <tr><td>Base URL</td><td><code>${escapeHtml(pack.environment.base_url || '—')}</code></td></tr>
    <tr><td>Token URL</td><td><code>${escapeHtml(pack.environment.token_url || '—')}</code></td></tr>
    <tr><td>Authentication</td><td>${escapeHtml(pack.environment.auth)}</td></tr>
    <tr><td>Client Identity storage</td><td>Vercel encrypted env vars (server-side only, never bundled to client)</td></tr>
    <tr><td>Hosting</td><td>Vercel serverless, ap-southeast-2 (Sydney) via AWS</td></tr>
  </table>

  <h2>3. Scenario summary</h2>
  <table>
    <tr><th>Scenario</th><th>Expected</th><th>Observed status</th><th>Outcome</th><th>Latency</th></tr>
    ${pack.scenarios.map(summaryRow).join('')}
  </table>

  <h2>4. Scenario detail (with request/response evidence)</h2>
  ${pack.scenarios.map(scenarioBlock).join('')}

  <h2>5. Error handling &amp; resilience</h2>
  <ul>
    <li><strong>OAuth token caching:</strong> bearer cached in serverless-container memory for its full <code>expires_in</code> minus 5-second safety margin. Reduces HNZ token endpoint load and avoids per-request round trips.</li>
    <li><strong>Fail-safe error surfaces:</strong> non-2xx FHIR responses are relayed as JSON with the upstream body excerpt (max 4000 chars); no stack traces surface to callers.</li>
    <li><strong>Admin-only gate:</strong> the proxy endpoint sits behind our provider-authentication guard and further requires <code>is_admin=true</code>. Non-admin clinicians cannot exercise HPI even if authenticated.</li>
    <li><strong>Rate limits:</strong> the proxy inherits our per-IP router rate limits (1200/15 min for provider-authed routes).</li>
    <li><strong>PII handling:</strong> the FHIR resource is transformed into a minimal shape (name + active flag + qualifications only) before being returned to the UI, so the full resource never leaves the server.</li>
  </ul>

  <h2>6. Contact</h2>
  <p><strong>Compliance owner:</strong> Dr Patrick Herling (Chief Medical Officer, Tere Health Limited)<br>
     <strong>Email:</strong> patrickherling@gmail.com<br>
     <strong>Generated by:</strong> ${escapeHtml(pack.generated_by || '—')}</p>

</body></html>`

  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'load' })
  await page.pdf({
    path: OUT_PATH, format: 'A4', printBackground: true,
    margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
    displayHeaderFooter: true,
    footerTemplate: `<div style="width:100%;font-size:8pt;color:#9CA3AF;padding:0 16mm;display:flex;justify-content:space-between;"><span>Tere Health Limited · HPI FHIR Compliance Evidence</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    headerTemplate: '<div></div>',
  })
  await browser.close()
  console.log(`Wrote ${OUT_PATH}`)
}

function prettyIfJson(s) {
  try { return JSON.stringify(JSON.parse(s), null, 2) } catch { return s }
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

main().catch(err => { console.error(err); process.exit(1) })
