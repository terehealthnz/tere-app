// Headless-Chrome contract renderer. Produces a pixel-perfect PDF that
// matches what the applicant saw in the browser at signing time, by
// building an HTML view whose structure + styles mirror
// src/contracts/ContractRenderer.jsx and letting real Chrome print it.
//
// Runs inside the Vercel serverless function via @sparticuz/chromium-min
// (Lambda-optimised Chromium binary) + puppeteer-core. Falls back to
// the pdfkit renderer if Chrome fails to launch.

import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium-min'

// Where the chromium binary is fetched from. @sparticuz/chromium-min
// requires the .tar.br to be served from somewhere — the public CDN URL
// matches the installed version. Bundling the ~50MB binary directly
// blows past Vercel's function size limit, so fetching on cold start is
// the standard pattern.
const CHROMIUM_TAR_URL = 'https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar'

// Escape HTML special chars — the JSON is authored, not user-input, but
// still defence in depth.
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Same substitute() shape as ContractRenderer.jsx + the server-side
// pdfkit renderer. contractor_signed_date + signer_date accept values
// from the caller (populated at rebuild time from offer.applicant_signed_at
// / offer.countersigned_at).
function substitute(text, contractor = {}) {
  if (!text) return ''
  const today = new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
  const AT_SIGN = '__________________________ (to be completed on signing)'
  const map = {
    contractor_full_name:    contractor.full_name || contractor.name || AT_SIGN,
    contractor_address:      contractor.address || AT_SIGN,
    contractor_notice_email: contractor.notice_email || contractor.email || AT_SIGN,
    agreement_date:          contractor.agreement_date || today,
    commencement_date:       contractor.commencement_date || 'as agreed with Tere Health',
    signer_name:             contractor.signer_name || 'Tere Health Limited',
    signer_title:            contractor.signer_title || 'Director',
    fee_per_consult:         contractor.fee_per_consult || '[FEE PER CONSULT — NOT SET]',
    contractor_signed_date:  contractor.contractor_signed_date || AT_SIGN,
    signer_date:             contractor.signer_date || AT_SIGN,
  }
  return String(text).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in map ? map[k] : m))
}

// Render one node to its HTML equivalent — matches ContractRenderer's
// tag + class mapping exactly.
function nodeToHtml(node, contractor) {
  const text = escapeHtml(substitute(node.text, contractor))
  if (node.type === 'heading') {
    const lvl = Number.isFinite(node.level) ? node.level : 3
    if (lvl === 0) return `<h1 class="h0">${text}</h1>`
    if (lvl === 1) return `<h2 class="h1">${text}</h2>`
    if (lvl === 2) return `<h3 class="h2">${text}</h3>`
    return `<h4 class="h3">${text}</h4>`
  }
  if (node.type === 'item') {
    return `<div class="item${node.bold ? ' bold' : ''}">${text}</div>`
  }
  return `<p class="para${node.bold ? ' bold' : ''}">${text}</p>`
}

// Build the full HTML shell. Styles ported 1:1 from
// src/contracts/ContractRenderer.jsx `styles` object. Plus Jakarta Sans
// loaded from Google Fonts — the network wait is baked into
// waitUntil: 'networkidle0'.
function buildHtml({ contract, contractor }) {
  const nodes = contract.nodes.map(n => nodeToHtml(n, contractor)).join('\n')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(contract.title || 'Contract')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; background: white; }
  .root {
    font-family: "Plus Jakarta Sans", "Helvetica Neue", Arial, sans-serif;
    color: #1A2A33;
    font-size: 10.5pt;
    line-height: 1.55;
    max-width: 780px;
    margin: 0 auto;
    background: white;
  }
  .titleBlock {
    border-bottom: 2px solid #0B6E76;
    padding-bottom: 1rem;
    margin-bottom: 1.5rem;
  }
  .titleBlock .kicker {
    font-size: 8.5pt;
    color: #6B7280;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-weight: 700;
    margin-bottom: 4px;
  }
  .titleBlock .version {
    font-size: 8.5pt;
    color: #6B7280;
    margin-top: 6px;
  }
  h1.h0 { font-size: 20pt; font-weight: 700; color: #0D2B45; margin: 0 0 0.25rem; letter-spacing: -0.01em; }
  h2.h1 { font-size: 14pt;  font-weight: 700; color: #0B6E76; margin: 1.75rem 0 0.75rem; page-break-after: avoid; }
  h3.h2 { font-size: 11pt;  font-weight: 700; color: #0D2B45; margin: 1.25rem 0 0.5rem;  text-transform: uppercase; letter-spacing: 0.03em; page-break-after: avoid; }
  h4.h3 { font-size: 10.5pt; font-weight: 700; color: #0D2B45; margin: 1rem 0 0.35rem; page-break-after: avoid; }
  p.para { margin: 0.55rem 0; text-align: justify; hyphens: auto; }
  p.para.bold { font-weight: 700; }
  div.item { margin: 0.35rem 0 0.35rem 1.5rem; text-align: justify; hyphens: auto; text-indent: -0.9rem; padding-left: 0.9rem; }
  div.item.bold { font-weight: 700; }
  div.item::before { content: "•  "; font-weight: 700; color: #0B6E76; }
  /* Keep short paragraphs with the following block to avoid orphan lines */
  p.para + h2.h1, p.para + h3.h2, p.para + h4.h3 { page-break-before: auto; }
</style>
</head>
<body>
<div class="root">
<div class="titleBlock">
<div class="kicker">Tere Health Limited</div>
<h1 class="h0">${escapeHtml(contract.title || 'Independent Contractor Services Agreement')}</h1>
<div class="version">Version ${escapeHtml(contract.version || '')}</div>
</div>
${nodes}
</div>
</body>
</html>`
}

// Launch state — cached across warm invocations to avoid the 3–8s
// Chrome cold-start on every request. Vercel serverless is short-lived
// but does keep container instances warm briefly.
let _browserPromise = null

async function getBrowser() {
  if (_browserPromise) return _browserPromise
  _browserPromise = (async () => {
    const executablePath = await chromium.executablePath(CHROMIUM_TAR_URL)
    return puppeteer.launch({
      args: [
        ...chromium.args,
        // These reduce memory + avoid /dev/shm exhaustion in Lambda-style
        // sandboxes. Standard for @sparticuz/chromium usage.
        '--disable-dev-shm-usage',
        '--single-process',
      ],
      defaultViewport: { width: 1200, height: 1600, deviceScaleFactor: 1 },
      executablePath,
      headless: true,
    })
  })()
  try {
    return await _browserPromise
  } catch (e) {
    _browserPromise = null
    throw e
  }
}

// Public API — renders one contract to a PDF Buffer.
// Throws on any failure so the caller can fall back to pdfkit.
export async function renderContractToPdfViaChrome({ contract, contractor = {} } = {}) {
  if (!contract || !Array.isArray(contract.nodes)) {
    throw new Error('renderContractToPdfViaChrome: contract JSON missing or malformed')
  }
  const html = buildHtml({ contract, contractor })
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    // Wait for fonts + external CSS to settle so the printed PDF
    // matches on-screen rendering. networkidle0 is picky but reliable
    // for a static page — the CSS + font load are the only requests.
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 })
    await page.emulateMediaType('print')
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' },
    })
    return Buffer.from(pdf)
  } finally {
    try { await page.close() } catch {}
  }
}
