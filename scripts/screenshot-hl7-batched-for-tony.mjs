// scripts/screenshot-hl7-batched-for-tony.mjs
//
// Renders the 9 fanned-out inbox rows from Tony's 2026-08-20 batched ORU
// (control_id A4C0CCF1-42C7-45D7-B) into a single evidence screenshot,
// plus one detail card per patient. Sends to Tony as proof the parser
// fix correctly fans a multi-report MSH into per-patient inbox entries.
//
// Case ref: 1058382.
//
// Usage:
//   node scripts/screenshot-hl7-batched-for-tony.mjs
//   node scripts/screenshot-hl7-batched-for-tony.mjs <control_id>
//
// Output:
//   ~/Downloads/tony-hl7-batch-inbox.png   — combined 9-row inbox list
//   ~/Downloads/tony-hl7-batch-01.png ... 09.png — per-patient detail

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_SR  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SR) {
  console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SR, { auth: { persistSession: false } })

const controlId = process.argv[2] || 'A4C0CCF1-42C7-45D7-B'

async function fetchBatchRows(ctlId) {
  const { data, error } = await supabase
    .from('inbound_hl7_messages')
    .select('*')
    .eq('msh_10_control_id', ctlId)
    .order('batch_position', { ascending: true })
  if (error) throw new Error(`fetch batch: ${error.message}`)
  if (!data || !data.length) throw new Error(`no rows for control_id=${ctlId}`)
  return data
}

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Courier New", monospace'

function esc(s) {
  if (s == null) return ''
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// HL7 v2 CE (Coded Element) — <code>^<text>^<codesystem>. Prefer the
// human-readable middle component; fall back to the code if text missing.
function displayCE(ce) {
  if (!ce) return ''
  const parts = String(ce).split('^')
  return parts[1] || parts[0] || ''
}

// Parse the batched raw_message and enrich each row's obx entries with
// OBX-4 (Observation Sub-ID). Needed because the parsed_summary snapshot
// stored at ingest time only captures OBX-3 (main identifier) — but for
// a CBC differential the specific analyte (Neut Seg / Lymphocytes /
// Monocytes) lives in OBX-4, not OBX-3. Ingest parser should be updated
// to persist subId, but for this screenshot script we re-parse from
// raw_message which is the authoritative wire format.
function enrichObxWithSubId(row) {
  if (!row.raw_message || !row.parsed_summary?.obx) return
  const lines = String(row.raw_message).replace(/\r\n?/g, '\n').split('\n').filter(Boolean)
  // Walk to find OBR matching this row's filler order, then collect its OBX
  const filler = row.obr_3_1_filler_order || ''
  const obxes = []
  let inMyReport = false
  for (const line of lines) {
    if (line.startsWith('OBR|')) {
      const parts = line.split('|')
      const obrFiller = (parts[3] || '').split('^')[0]
      inMyReport = obrFiller === filler
      continue
    }
    if (line.startsWith('PID|')) { inMyReport = false; continue }
    if (inMyReport && line.startsWith('OBX|')) {
      obxes.push(line.split('|'))
    }
  }
  // Enrich parsed_summary.obx in-order (assumes idx alignment which is
  // safe because obx are sequential within a report)
  row.parsed_summary.obx.forEach((o, i) => {
    const obxSeg = obxes[i]
    if (obxSeg) {
      const subIdRaw = obxSeg[4] || ''
      o.subId = displayCE(subIdRaw)
    }
  })
}

// Render an HL7 v2 escaped text field into HTML.
//   \.br\  → line break
//   \H\    → start bold
//   \N\    → end bold
// Escape HTML metacharacters first, then replace the HL7 escapes.
function displayHl7Text(s) {
  if (s == null) return ''
  return esc(String(s))
    .replace(/\\\.br\\/gi, '<br>')
    .replace(/\\H\\/g, '<strong>')
    .replace(/\\N\\/g, '</strong>')
    .replace(/\\F\\/g, '|')     // field separator escape
    .replace(/\\S\\/g, '^')     // component separator escape
    .replace(/\\R\\/g, '~')     // repetition separator escape
    .replace(/\\T\\/g, '&amp;') // subcomponent separator escape
    .replace(/\\E\\/g, '\\')    // literal escape character
}

// Numeric abnormality detection — see src/lib/hl7Display.js for the
// canonical implementation. Duplicated here because the screenshot script
// runs standalone. Handles "min-max", ">min", "<max" reference ranges.
function computeNumericAbnormal(valueStr, rangeStr) {
  if (!valueStr || !rangeStr) return null
  const v = Number(String(valueStr).replace(/[^0-9.\-eE+]/g, ''))
  if (!isFinite(v)) return null
  const r = String(rangeStr).trim()
  const range = r.match(/^(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)$/)
  if (range) {
    const lo = Number(range[1]), hi = Number(range[2])
    if (v < lo) return 'L'
    if (v > hi) return 'H'
    return 'N'
  }
  const gt = r.match(/^>\s*(-?\d+(?:\.\d+)?)$/)
  if (gt) return v <= Number(gt[1]) ? 'L' : 'N'
  const lt = r.match(/^<\s*(-?\d+(?:\.\d+)?)$/)
  if (lt) return v >= Number(lt[1]) ? 'H' : 'N'
  return null
}
function effectiveAbnormal(obx) {
  const raw = String(obx?.abnormal || '').trim().toUpperCase()
  if (raw) return raw
  return computeNumericAbnormal(obx?.value, obx?.refRange)
}
function isAbnormalFlag(f) {
  if (!f) return false
  const s = String(f).trim().toUpperCase()
  return !!s && s !== 'N'
}

// Format an ISO datetime (parsed_summary.order.* dates are stored ISO)
// as dd/mm/yyyy hh:mm — matches Trinity Windows convention.
function fmtDt(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
function pill(text, bg, color) {
  return `<span style="display:inline-block;background:${bg};color:${color};padding:2px 8px;border-radius:99px;font-size:.72rem;font-weight:700;letter-spacing:.02em;text-transform:uppercase;">${esc(text)}</span>`
}

function renderInboxList(rows) {
  const first = rows[0]
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  body { font-family:${FF}; background:#F7F5F0; margin:0; padding:24px; color:${NAVY}; }
  .container { max-width: 1000px; margin: 0 auto; }
  h1 { margin:0 0 4px; font-size:1.4rem; }
  .subtitle { color:#4B5563; font-size:.9rem; margin-bottom:20px; }
  .callout { background:white; border:1px solid #E2E8F0; border-left:4px solid ${TEAL}; padding:12px 16px; border-radius:6px; margin-bottom:20px; font-size:.9rem; }
  .callout code { font-family:${MONO}; font-size:.85rem; background:#F1F5F9; padding:2px 5px; border-radius:3px; }
  .row { background:white; border:1px solid #E2E8F0; border-radius:8px; padding:14px 16px; margin-bottom:8px; display:grid; grid-template-columns:36px 1fr auto; gap:14px; align-items:center; }
  .rowidx { font-family:${MONO}; font-size:1rem; color:${TEAL}; font-weight:700; text-align:right; }
  .rowbody { display:flex; flex-direction:column; gap:4px; }
  .rowtitle { font-weight:700; font-size:.95rem; }
  .rowmeta { font-family:${MONO}; font-size:.75rem; color:#64748B; }
  .rowright { display:flex; flex-direction:column; align-items:flex-end; gap:6px; font-size:.75rem; color:#64748B; }
</style></head><body>
<div class="container">
  <h1>Provider inbox — batched ORU fan-out</h1>
  <div class="subtitle">Tere Health · Medical-Objects case #1058382 · 2026-08-20</div>

  <div class="callout">
    Single HL7 message received from MO with <strong>${rows.length} patient reports</strong> under one MSH.
    Parser fan-out created <strong>${rows.length} separate inbox entries</strong>, one per patient / order.<br>
    <span style="color:#4B5563;font-size:.85rem;">
      MSH-10 control_id: <code>${esc(first.msh_10_control_id)}</code>&nbsp;·&nbsp;
      MSH-4 sender: <code>${esc(first.msh_4_sending_facility)}</code>&nbsp;·&nbsp;
      MSH-12 version: <code>${esc(first.msh_12_version)}</code>&nbsp;·&nbsp;
      env: <code>${esc(first.env)}</code>&nbsp;·&nbsp;
      ACK: ${pill(first.ack_msa_1 || '—', '#D1FAE5', '#065F46')}
    </span>
  </div>

  ${rows.map((r, i) => {
    const patient = [r.patient_first_name, r.patient_last_name].filter(Boolean).join(' ') || '(no name)'
    const test = displayCE(r.obr_4_service_id) || '—'
    const rowAbn = (r.parsed_summary?.obx || []).some(o => isAbnormalFlag(effectiveAbnormal(o)))
    return `<div class="row">
      <div class="rowidx">#${r.batch_position}</div>
      <div class="rowbody">
        <div class="rowtitle">${esc(patient)}${r.patient_dob ? ` · DOB ${esc(r.patient_dob)}` : ''}</div>
        <div class="rowmeta">
          <strong>${esc(test)}</strong>&nbsp;·&nbsp;filler: ${esc(r.obr_3_1_filler_order || '—')}
        </div>
      </div>
      <div class="rowright">
        ${pill(r.status || '—', '#FEF3C7', '#92400E')}
        ${rowAbn ? pill('⚠ Abnormal', '#FEE2E2', '#991B1B') : ''}
        <span>received ${new Date(r.received_at).toISOString().slice(11,19)}Z</span>
      </div>
    </div>`
  }).join('')}

  <div style="margin-top:24px;font-size:.75rem;color:#94A3B8;text-align:center;">
    Tere Health · terehealth.co.nz · HPI-O G11238-E · case #1058382
  </div>
</div>
</body></html>`
}

function renderPatientDetail(row) {
  const patient = [row.patient_first_name, row.patient_last_name].filter(Boolean).join(' ') || '(no name)'
  const test = (row.obr_4_service_id || '').split('^')[1] || (row.obr_4_service_id || '').split('^')[0] || '—'
  const obx = (row.parsed_summary?.obx) || []
  const notes = (row.parsed_summary?.notes) || []
  const order = row.parsed_summary?.order || {}
  // Enrich each OBX with effective abnormal (server-stored or computed
  // from OBX-5 vs OBX-7). Feeds the top-of-report ABNORMAL indicator +
  // per-row red-bold styling — matches the inbox render.
  obx.forEach(o => { o.effective = effectiveAbnormal(o) })
  const anyAbnormal = obx.some(o => isAbnormalFlag(o.effective))
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  body { font-family:${FF}; background:#F7F5F0; margin:0; padding:24px; color:${NAVY}; }
  .card { max-width: 720px; margin: 0 auto; background:white; border:1px solid #E2E8F0; border-radius:10px; padding:24px 28px; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid #E2E8F0; }
  h1 { margin:0; font-size:1.3rem; color:${NAVY}; }
  .meta { color:#64748B; font-size:.85rem; margin-top:4px; font-family:${MONO}; }
  .kv { display:grid; grid-template-columns:auto 1fr; gap:6px 12px; font-size:.85rem; margin-bottom:20px; }
  .kv .k { color:#64748B; font-weight:600; }
  .kv .v { color:${NAVY}; font-family:${MONO}; }
  h2 { font-size:.85rem; text-transform:uppercase; letter-spacing:.08em; color:${TEAL}; margin:20px 0 8px; font-weight:700; }
  table { width:100%; border-collapse:collapse; font-size:.85rem; }
  th { text-align:left; background:#F1F5F9; padding:6px 8px; color:${NAVY}; font-weight:700; border-bottom:2px solid #CBD5E1; }
  td { padding:6px 8px; border-bottom:1px solid #E2E8F0; vertical-align:top; }
  td.mono { font-family:${MONO}; }
  .notes { background:#F8FAFC; padding:10px 14px; border-radius:6px; font-family:${MONO}; font-size:.82rem; color:#374151; white-space:pre-wrap; word-break:break-word; }
  .abnval { color:#991B1B; font-weight:700; }
</style></head><body>
<div class="card">
  <div class="header">
    <div>
      <h1>${esc(patient)}</h1>
      <div class="meta">${row.patient_dob ? `DOB ${esc(row.patient_dob)} · ` : ''}${esc(row.patient_sex || '')} · PID-3: ${esc(row.patient_pid_3 || '—')}</div>
    </div>
    <div style="text-align:right;">
      ${pill(row.status || '—', '#FEF3C7', '#92400E')}
      ${anyAbnormal ? ' ' + pill('⚠ Abnormal', '#FEE2E2', '#991B1B') : ''}
      <div class="meta" style="margin-top:6px;">batch #${row.batch_position}</div>
    </div>
  </div>

  <div class="kv">
    <div class="k">Test</div><div class="v">${esc(displayCE(row.obr_4_service_id) || '—')}${order.corrected ? ' <span style="color:#991B1B;font-weight:700;">— (Corrected)</span>' : ''}</div>
    ${order.requestedDate   ? `<div class="k">Requested date</div><div class="v">${esc(fmtDt(order.requestedDate))}</div>` : ''}
    ${order.observationDate ? `<div class="k">Effective / exam</div><div class="v">${esc(fmtDt(order.observationDate))}</div>` : ''}
    ${order.generatedDate   ? `<div class="k">Generated date</div><div class="v">${esc(fmtDt(order.generatedDate))}</div>` : ''}
    <div class="k">Filler order</div><div class="v">${esc(row.obr_3_1_filler_order || '—')}</div>
    <div class="k">MSH-10</div><div class="v">${esc(row.msh_10_control_id)}</div>
    <div class="k">Sender</div><div class="v">${esc(row.msh_4_sending_facility)}</div>
    <div class="k">Received</div><div class="v">${esc(new Date(row.received_at).toISOString())}</div>
    <div class="k">ACK</div><div class="v">${row.ack_msa_1 || '—'}</div>
  </div>

  ${obx.length ? `<h2>Observations (${obx.length})</h2>
    <table>
      <thead><tr><th>#</th><th>Test</th><th>Value</th><th>Units</th><th>Ref range</th><th>Flag</th></tr></thead>
      <tbody>
        ${obx.map(o => {
          const isFT = (o.valueType || '').toUpperCase() === 'FT'
          const abn = isAbnormalFlag(o.effective)
          const valueHtml = isFT ? displayHl7Text(o.value) : esc(o.value || '')
          const mainId = displayCE(o.identifier)
          const analyte = o.subId && o.subId !== mainId
            ? `${esc(mainId)} <span style="color:#94A3B8;">— ${esc(o.subId)}</span>`
            : esc(o.subId || mainId)
          return `<tr>
          <td class="mono">${o.idx}</td>
          <td>${analyte}</td>
          <td class="${isFT ? '' : 'mono'} ${abn ? 'abnval' : ''}">${valueHtml}</td>
          <td>${esc(displayCE(o.units))}</td>
          <td>${esc(o.refRange || '')}</td>
          <td class="${abn ? 'abnval' : ''}">${esc(o.effective || '')}</td>
        </tr>`}).join('')}
      </tbody>
    </table>` : ''}

  ${notes.length ? `<h2>Notes</h2>
    <div class="notes">${notes.map(n => displayHl7Text(n)).join('\n')}</div>` : ''}

  <div style="margin-top:24px;font-size:.72rem;color:#94A3B8;text-align:center;">
    Tere Health · HPI-O G11238-E · case #1058382 · batch position ${row.batch_position} of ${row.parsed_summary?.controlId ? '' : ''}
  </div>
</div>
</body></html>`
}

async function screenshot(browser, html, outPath, viewport = { width: 1080, height: 900 }) {
  const page = await browser.newPage({ viewport })
  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    const docHeight = await page.evaluate(() => Math.min(document.documentElement.scrollHeight + 40, 14000))
    await page.setViewportSize({ width: viewport.width, height: docHeight })
    await page.screenshot({ path: outPath, fullPage: false })
    const size = (await fs.stat(outPath)).size
    console.log(`  wrote ${outPath} (${(size/1024).toFixed(1)} KB)`)
  } finally {
    await page.close()
  }
}

async function main() {
  console.log(`Fetching batch rows for control_id=${controlId}…`)
  const rows = await fetchBatchRows(controlId)
  console.log(`Got ${rows.length} rows.`)

  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    // 1. Combined inbox list
    console.log('Rendering inbox list…')
    await screenshot(browser, renderInboxList(rows), path.join(os.homedir(), 'Downloads', 'tony-hl7-batch-inbox.png'))

    // 2. Per-patient detail card
    for (const row of rows) {
      enrichObxWithSubId(row)
      const n = String(row.batch_position + 1).padStart(2, '0')
      const outPath = path.join(os.homedir(), 'Downloads', `tony-hl7-batch-${n}.png`)
      console.log(`Rendering patient #${row.batch_position} → ${path.basename(outPath)}…`)
      await screenshot(browser, renderPatientDetail(row), outPath)
    }
  } finally {
    await browser.close()
  }

  console.log(`\nDone. ${rows.length + 1} PNGs in ~/Downloads/tony-hl7-batch-*.png`)
}

main().catch(err => { console.error(err); process.exit(1) })
