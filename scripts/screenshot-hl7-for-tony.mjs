// scripts/screenshot-hl7-for-tony.mjs
//
// Renders the two Medical-Objects test messages (2.1 + 2.4) into the same
// visual style as /clinician/inbox and screenshots them as PNGs for
// case #1058382 evidence to Tony Cruice at Medical-Objects.
//
// Reads the messages directly from Supabase (service_role) and mounts a
// standalone HTML mirror of the ProviderInbox MessageView. Avoids needing
// a live provider login or reassignment of matched_provider_id in prod.
//
// Usage:
//   node scripts/screenshot-hl7-for-tony.mjs
//
// Output:
//   ~/Downloads/tony-hl7-2.1.png
//   ~/Downloads/tony-hl7-2.4.png

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { parseHl7Display, applyHl7EmphasisTags } from '../src/lib/hl7Display.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_SR  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SR) {
  console.error('[hl7-screenshot] Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Source .env.vercel first.')
  process.exit(1)
}

// The two messages Tony sent — matched by MSH-12 version + latest per version.
const supabase = createClient(SUPABASE_URL, SUPABASE_SR, { auth: { persistSession: false } })

async function fetchLatest(version) {
  const { data, error } = await supabase
    .from('inbound_hl7_messages')
    .select('*')
    .eq('msh_12_version', version)
    .eq('msh_4_sending_facility', 'FQ8266-A')
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`fetch ${version}: ${error.message}`)
  if (!data)  throw new Error(`no ${version} message found from FQ8266-A`)
  return data
}

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Courier New", monospace'

function statusPill(status) {
  const map = {
    received:     { bg: '#DBEAFE', color: '#1E40AF', label: 'Received' },
    needs_review: { bg: '#FEF3C7', color: '#92400E', label: 'Needs review' },
    processed:    { bg: '#D1FAE5', color: '#065F46', label: 'Processed' },
    rejected:     { bg: '#FEE2E2', color: '#991B1B', label: 'Rejected' },
    error:        { bg: '#FEE2E2', color: '#991B1B', label: 'Error' },
  }
  const m = map[status] || map.received
  return `<span style="display:inline-flex;align-items:center;gap:4px;background:${m.bg};color:${m.color};padding:2px 8px;border-radius:99px;font-size:.7rem;font-weight:700;letter-spacing:.02em;text-transform:uppercase;">${m.label}</span>`
}

function esc(s) {
  if (s == null) return ''
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// Extract PDF base64 for a LIT message directly from raw_message. Needed for
// standalone screenshots because the real inbox pulls signed URLs from Supabase
// Storage — those short-lived URLs don't survive HTML capture. Same logic as
// api/_hl7-inbound.js extractAndStorePdfs but reads the base64 out inline.
function extractLitPdfBase64(raw) {
  if (!raw) return null
  const segments = String(raw).replace(/\r/g, '\n').split('\n').filter(s => s.startsWith('OBX|'))
  for (const s of segments) {
    const f = s.split('|')
    if (f[2] !== 'ED') continue
    const parts = (f[5] || '').split('^')
    const format = (parts[2] || '').toUpperCase()
    const encoding = (parts[3] || '').toUpperCase()
    const data = parts[4] || ''
    if (format === 'PDF' && encoding === 'BASE64' && data) return data
  }
  return null
}

// Rasterise a PDF (base64) to a PNG data URL. Headless chromium treats
// data:application/pdf URIs as downloads (not renders), so we need to
// display the PDF inside a page that embeds it via a Blob URL + <embed>.
// The embed uses chromium's PDFium viewer which works in the headless-new
// mode. We wait for the viewer to paint then screenshot the viewport.
// Quick page count from raw PDF bytes: scan for /Type /Page (not /Pages)
// entries. Reliable enough for uncompressed / lightly-compressed PDFs like
// the Medical-Objects samples. Falls back to 1 if we can't parse.
function pdfPageCount(pdfBase64) {
  try {
    const buf = Buffer.from(pdfBase64, 'base64')
    const txt = buf.toString('binary')
    // Look for /Count N in the Pages root — most reliable.
    const countMatch = txt.match(/\/Type\s*\/Pages[\s\S]{0,400}?\/Count\s+(\d+)/)
    if (countMatch) return parseInt(countMatch[1], 10) || 1
    // Fallback: count /Type /Page (with word boundary — avoid matching /Pages).
    const pages = txt.match(/\/Type\s*\/Page(?!s)/g) || []
    return Math.max(pages.length, 1)
  } catch { return 1 }
}

async function rasterisePdfToPng(browser, pdfBase64, width = 900) {
  // Chromium's PDF viewer scrolls pages vertically inside its viewport. To
  // capture ALL pages in one screenshot we make the viewport tall enough to
  // fit every page inline (page_count × ~page_height_at_this_width, plus
  // padding for the page separators and viewer chrome). Cap at 12000px to
  // stay under chromium's max texture size.
  const pageCount = pdfPageCount(pdfBase64)
  // Bay Radiology-style A4 portrait at width=900 renders ~1275px tall.
  // Add ~30px of viewer padding per page.
  const perPage = 1310
  const viewportH = Math.min(pageCount * perPage + 40, 12000)

  const wrapper = `<!doctype html><html><head><style>
    html,body{margin:0;padding:0;background:#525659;}
    embed{width:100vw;height:100vh;border:0;}
  </style></head><body>
  <embed id="pdf" type="application/pdf"
    src="data:application/pdf;base64,${pdfBase64}#toolbar=0&navpanes=0&view=FitH" />
  </body></html>`
  const page = await browser.newPage({ viewport: { width, height: viewportH } })
  try {
    await page.setContent(wrapper, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3500 + Math.min(pageCount, 5) * 500)  // extra time per page
    const png = await page.screenshot({ type: 'png' })
    console.log(`[hl7-screenshot]   PDF: ${pageCount} pages, viewport ${width}x${viewportH}`)
    return `data:image/png;base64,${png.toString('base64')}`
  } finally {
    await page.close()
  }
}

function renderMessage(msg, opts = {}) {
  const patient = [msg.patient_first_name, msg.patient_last_name].filter(Boolean).join(' ') || 'Unknown patient'
  // Client-side re-parse of raw HL7 to pick up display fields (OBR-4.2 label,
  // requested/observation/generated dates, OBR-25 corrected flag, LIT
  // FT-vs-PDF pairing) that older parsed_summary rows don't have. Matches the
  // production ProviderInbox renderer.
  const display = parseHl7Display(msg.raw_message || '')
  const obxTableRows = display.isLit
    ? display.obxRows.filter(o => o.valueType !== 'FT' && o.valueType !== 'TX' && o.valueType !== 'ED')
    : display.obxRows

  // LIT rendering: PDF preferred, TXT fallback (per Medical-Objects Tony
  // Cruice 2026-08-19). Caller pre-rasterises PDF to a PNG data URL before
  // rendering — chromium's PDF plugin doesn't render in headless via <embed>,
  // so we screenshot the PDF viewer separately and embed as <img>.
  const litPdfPngDataUrl = opts.litPdfPngDataUrl || null
  const litBlock = (display.isLit && litPdfPngDataUrl) ? `
    <div style="background:white;border:1px solid #E2E8F0;border-radius:12px;padding:1.25rem 1.5rem;margin-bottom:1rem;">
      <div style="font-weight:700;color:${NAVY};margin-bottom:.6rem;">
        ${esc(display.obr4Label || 'Report')}
        ${display.corrected ? `<span style="margin-left:8px;color:#991B1B;">— (Corrected)</span>` : ''}
        <span style="margin-left:8px;font-size:.75rem;color:#6B7280;font-weight:400;">· PDF (first page shown; full PDF opens in the app)</span>
      </div>
      <img src="${litPdfPngDataUrl}" style="width:100%;border:1px solid #E5E7EB;border-radius:8px;display:block;" />
    </div>` : (display.isLit && display.litText) ? `
    <div style="background:white;border:1px solid #E2E8F0;border-radius:12px;padding:1.25rem 1.5rem;margin-bottom:1rem;">
      <div style="font-weight:700;color:${NAVY};margin-bottom:.6rem;">
        ${esc(display.obr4Label || 'Report')}
        ${display.corrected ? `<span style="margin-left:8px;color:#991B1B;">— (Corrected)</span>` : ''}
        <span style="margin-left:8px;font-size:.75rem;color:#6B7280;font-weight:400;">· plaintext fallback (no PDF attached)</span>
      </div>
      <pre style="font-family:${MONO};font-size:.85rem;color:#111827;white-space:pre-wrap;word-break:break-word;margin:0;">${applyHl7EmphasisTags(esc(display.litText))}</pre>
    </div>` : ''

  const obxTable = obxTableRows.length ? `
    <div style="background:white;border:1px solid #E2E8F0;border-radius:12px;padding:1.25rem 1.5rem;margin-bottom:1rem;">
      <div style="font-weight:700;color:${NAVY};margin-bottom:.6rem;">Results / observations (OBX)</div>
      <table style="width:100%;font-size:.85rem;border-collapse:collapse;">
        <thead>
          <tr style="text-align:left;color:#6B7280;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;">
            <th style="padding:4px 8px 4px 0;">Test</th>
            <th style="padding:4px 8px;">Value</th>
            <th style="padding:4px 8px;">Units</th>
            <th style="padding:4px 8px;">Ref</th>
            <th style="padding:4px 8px;">Flag</th>
          </tr>
        </thead>
        <tbody>
          ${obxTableRows.map(o => `
            <tr style="border-top:1px solid #F3F4F6;">
              <td style="padding:5px 8px 5px 0;">${esc(o.identLabel || o.identifier)}</td>
              <td style="padding:5px 8px;font-family:${MONO};">${esc(o.value)}</td>
              <td style="padding:5px 8px;color:#6B7280;">${esc(o.units)}</td>
              <td style="padding:5px 8px;color:#6B7280;">${esc(o.refRange)}</td>
              <td style="padding:5px 8px;color:${o.abnormal ? '#991B1B' : '#6B7280'};font-weight:${o.abnormal ? 700 : 400};">${esc(o.abnormal)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>` : ''

  const notesBlock = display.notesLines.length ? `
    <div style="background:white;border:1px solid #E2E8F0;border-radius:12px;padding:1.25rem 1.5rem;margin-bottom:1rem;">
      <div style="font-weight:700;color:${NAVY};margin-bottom:.5rem;">Notes (NTE)</div>
      <div style="font-family:${MONO};font-size:.82rem;color:#374151;">
        ${display.notesLines.map(line => `
          <div style="padding:1px 0;white-space:pre-wrap;">${esc(line)}</div>
        `).join('')}
      </div>
    </div>` : ''

  // Cap raw display so Playwright's full-page screenshot doesn't exceed the
  // Chromium max texture size (~16k px tall). The full message is intact in the DB.
  const rawFull = (msg.raw_message || '').replace(/\r/g, '\n')
  const rawLines = rawFull.split('\n')
  const rawText = rawLines.length > 60
    ? rawLines.slice(0, 60).join('\n') + `\n\n… (truncated for screenshot — ${rawLines.length - 60} more lines, full message stored server-side)`
    : rawFull

  return `<!doctype html>
<html><head><meta charset="utf-8">
<title>Tere Health inbox — HL7 ${msg.msh_12_version}</title>
<style>
  body { margin: 0; background: #F7F5F0; font-family: ${FF}; }
  code { font-family: ${MONO}; }
  details summary { cursor: pointer; }
</style>
</head><body>
  <div style="background:${NAVY};color:white;padding:1rem 1.5rem;display:flex;align-items:center;gap:1rem;">
    <span style="background:rgba(255,255,255,.1);border:none;color:white;border-radius:6px;padding:6px 12px;font-size:.8125rem;">← Back</span>
    <div style="font-weight:700;font-size:1.0625rem;">Inbox — inbound results &amp; referrals</div>
  </div>

  <div style="max-width:900px;margin:0 auto;padding:1.5rem 1.25rem 3rem;">
    <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:1rem;">
      <span style="background:white;color:${NAVY};border:1px solid #E5E7EB;border-radius:8px;padding:.5rem 1rem;font-weight:600;font-size:.85rem;">← Back to inbox</span>
      <span style="background:white;color:${NAVY};border:1px solid #E5E7EB;border-radius:8px;padding:.5rem 1rem;font-weight:600;font-size:.85rem;margin-left:auto;">Archive</span>
    </div>

    <div style="background:white;border:1px solid #E2E8F0;border-radius:12px;padding:1.25rem 1.5rem;margin-bottom:1rem;">
      <div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;margin-bottom:.6rem;">
        ${statusPill(msg.status)}
        <span style="font-weight:700;color:${NAVY};font-size:1.15rem;">${esc(patient)}</span>
        ${msg.patient_dob ? `<span style="color:#4B5563;font-size:.85rem;">· DOB ${esc(msg.patient_dob)}</span>` : ''}
        ${msg.patient_pid_3 ? `<span style="color:#4B5563;font-size:.85rem;">· PID ${esc(msg.patient_pid_3)}</span>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:160px 1fr;row-gap:4px;column-gap:12px;font-size:.85rem;color:#4B5563;">
        <div>Message type</div><div><code>${esc(msg.msh_9_message_type)} · v${esc(msg.msh_12_version)}</code></div>
        <div>From</div><div>${esc(msg.msh_4_sending_facility || '—')}</div>
        <div>OBR-3.1 filler</div><div><code>${esc(msg.obr_3_1_filler_order || '—')}</code></div>
        <div>Service</div><div>
          ${esc(display.obr4Label || msg.obr_4_service_id || '—')}
          ${display.corrected ? `<span style="margin-left:8px;color:#991B1B;font-weight:700;">— (Corrected)</span>` : ''}
        </div>
        ${display.orderingName ? `<div>Referred by</div><div>${esc(display.orderingName)}${display.orderingId ? `<span style="color:#6B7280;"> · ${esc(display.orderingId)}</span>` : ''}</div>` : ''}
        ${display.dates.requested ? `<div>Requested date</div><div>${esc(display.dates.requested)}</div>` : ''}
        ${display.dates.observation ? `<div>Effective / exam</div><div>${esc(display.dates.observation)}</div>` : ''}
        ${display.dates.generated ? `<div>Generated date</div><div>${esc(display.dates.generated)}</div>` : ''}
        <div>Received</div><div>${new Date(msg.received_at).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })}</div>
        <div>Ack sent</div><div><code>MSA|${esc(msg.ack_msa_1 || '')}</code>${msg.ack_msa_3_error ? ` · ${esc(msg.ack_msa_3_error)}` : ''}</div>
        <div>Match confidence</div><div>${esc(msg.match_confidence || '—')}</div>
      </div>
    </div>

    ${litBlock}
    ${obxTable}
    ${notesBlock}

    <details open style="background:white;border:1px solid #E2E8F0;border-radius:12px;padding:.75rem 1rem;">
      <summary style="font-weight:700;color:${NAVY};">Raw HL7 (for debugging)</summary>
      <pre style="margin-top:.5rem;font-family:${MONO};font-size:.78rem;color:#374151;white-space:pre-wrap;word-break:break-all;">${esc(rawText)}</pre>
    </details>
  </div>
</body></html>`
}

async function main() {
  console.log('[hl7-screenshot] fetching latest 2.1 + 2.4 messages…')
  const msg21 = await fetchLatest('2.1')
  const msg24 = await fetchLatest('2.4')

  console.log(`[hl7-screenshot] v2.1 id=${msg21.id} control=${msg21.msh_10_control_id} received=${msg21.received_at}`)
  console.log(`[hl7-screenshot] v2.4 id=${msg24.id} control=${msg24.msh_10_control_id} received=${msg24.received_at}`)

  // Use system Google Chrome instead of bundled Chromium — Playwright's
  // Chromium build doesn't include the PDF viewer plugin, and headless-mode
  // renders `Couldn't load plugin.` for embedded PDFs. System Chrome has
  // PDFium bundled and renders correctly.
  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    for (const [version, msg] of [['2.1', msg21], ['2.4', msg24]]) {
      // For LIT messages with a PDF, rasterise the PDF's first page via
      // chromium's native PDF viewer into a PNG data URL that we can embed
      // as an <img> in the main render.
      let litPdfPngDataUrl = null
      const display = parseHl7Display(msg.raw_message || '')
      if (display.isLit) {
        const b64 = extractLitPdfBase64(msg.raw_message)
        if (b64) {
          console.log(`[hl7-screenshot] v${version}: rasterising LIT PDF (${b64.length} chars base64)…`)
          try {
            litPdfPngDataUrl = await rasterisePdfToPng(browser, b64, 900)
          } catch (e) {
            console.warn(`[hl7-screenshot] PDF raster failed: ${e.message} — falling back to plaintext render`)
          }
        }
      }

      const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
      await page.setContent(renderMessage(msg, { litPdfPngDataUrl }), { waitUntil: 'domcontentloaded' })
      // Measure the rendered document height, then resize viewport up to that
      // (capped) and take a viewport screenshot. fullPage:true hit the
      // Chromium max-texture ceiling on the 2.4 message's tall OBX table.
      const docHeight = await page.evaluate(() => Math.min(document.documentElement.scrollHeight + 40, 14000))
      await page.setViewportSize({ width: 1200, height: docHeight })
      const out = path.join(os.homedir(), 'Downloads', `tony-hl7-${version}.png`)
      await page.screenshot({ path: out, fullPage: false })
      const size = (await fs.stat(out)).size
      console.log(`[hl7-screenshot] wrote ${out} (${(size/1024).toFixed(1)} KB, ${docHeight}px tall)`)
      await page.close()
    }
  } finally {
    await browser.close()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
