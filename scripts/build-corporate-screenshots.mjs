// scripts/build-corporate-screenshots.mjs
//
// Generates the product screenshots embedded in the corporate landing
// (src/pages/corporate/TereCorporate.jsx):
//
//   public/corporate/consult-translation.png — hero: live consult with subtitles
//   public/corporate/vitals-capture.png      — featured: phone camera + vitals
//   public/corporate/hl7-inbox.png           — supporting: lab inbox
//   public/corporate/hl7-abnormal.png        — supporting: HL7 detail (unused hero, keep for reference)
//   public/corporate/og-preview.png          — 1200x630 social/text preview card
//
// Priority order matches Patrick's positioning (2026-08-21): language +
// vitals are the big selling points; HL7 receive is expected background.
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
  orderedBy: 'Dr M. Patel, Blenheim',
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

// ─── Consult with live subtitles ─────────────────────────────────────────
// Mock live consult surface. Two video panels + a language pill + a bottom
// subtitle bar showing source (Te Reo Māori) and English translation.
// Not a screenshot of the real call UI — a marketing render of the same
// visual language, safe for public display.
function renderConsultWithTranslation() {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  body { font-family:${FF}; background:#0B1220; margin:0; padding:0; color:white; }
  .frame { width:1120px; height:700px; background:linear-gradient(135deg,#0B1220 0%,#152238 100%); padding:24px; box-sizing:border-box; display:flex; flex-direction:column; gap:16px; }
  .topbar { display:flex; align-items:center; justify-content:space-between; padding:6px 10px; }
  .brand { display:flex; align-items:baseline; gap:8px; opacity:.9; }
  .brand .n { font-family:Cormorant Garamond,Georgia,serif; font-style:italic; color:#D4EEF0; font-size:1.3rem; font-weight:700; }
  .brand .s { font-size:.68rem; letter-spacing:.14em; text-transform:uppercase; color:#94A3B8; font-weight:700; }
  .timer { display:inline-flex; align-items:center; gap:8px; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1); border-radius:99px; padding:6px 14px; font-family:${MONO}; font-size:.78rem; color:#D4EEF0; }
  .dot { width:8px; height:8px; border-radius:50%; background:#DC2626; box-shadow:0 0 0 4px rgba(220,38,38,.15); }
  .videos { flex:1; display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .vid { background:#1F2937; border-radius:16px; position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center; }
  .vid.provider { background:radial-gradient(circle at 40% 30%, #334155 0%, #1F2937 60%); }
  .vid.patient  { background:radial-gradient(circle at 60% 40%, #3E4C63 0%, #1A2536 60%); }
  .silhouette { width:180px; height:180px; border-radius:50%; background:linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.04)); display:flex; align-items:center; justify-content:center; font-size:3rem; color:rgba(255,255,255,.4); font-weight:700; }
  .label { position:absolute; bottom:14px; left:14px; background:rgba(0,0,0,.55); backdrop-filter:blur(6px); color:white; padding:4px 12px; border-radius:8px; font-size:.75rem; font-weight:600; letter-spacing:.02em; }
  .lang { position:absolute; top:14px; right:14px; background:rgba(11,110,118,.9); color:white; padding:4px 12px; border-radius:8px; font-size:.7rem; font-weight:700; letter-spacing:.03em; display:inline-flex; align-items:center; gap:6px; }
  .subs { background:rgba(0,0,0,.55); backdrop-filter:blur(8px); border:1px solid rgba(212,238,240,.14); border-radius:16px; padding:18px 24px; min-height:120px; display:flex; flex-direction:column; gap:10px; }
  .subs .row1 { display:flex; align-items:flex-start; gap:12px; }
  .subs .who { font-size:.7rem; text-transform:uppercase; letter-spacing:.08em; color:#94A3B8; font-weight:700; padding-top:3px; min-width:70px; }
  .subs .txt { font-size:1.1rem; line-height:1.4; color:white; }
  .subs .txt.trans { color:#D4EEF0; font-style:italic; }
  .divider { border:0; border-top:1px solid rgba(255,255,255,.08); margin:2px 0; }
</style></head><body>
<div class="frame">
  <div class="topbar">
    <div class="brand"><span class="n">Tere</span><span class="s">Consult</span></div>
    <div class="timer"><span class="dot"></span> 04:12 · Live</div>
  </div>

  <div class="videos">
    <div class="vid provider">
      <div class="silhouette">👨🏻‍⚕️</div>
      <div class="label">Dr Aroha Whitiaua — Emergency</div>
    </div>
    <div class="vid patient">
      <div class="silhouette">👤</div>
      <div class="lang">🌐 Te Reo Māori → English</div>
      <div class="label">Tama · Kaikohe</div>
    </div>
  </div>

  <div class="subs">
    <div class="row1">
      <div class="who">Patient</div>
      <div class="txt">Kei te mamae taku pane, ā, ka mate taku puku.</div>
    </div>
    <hr class="divider"/>
    <div class="row1">
      <div class="who">Translation</div>
      <div class="txt trans">I have a headache, and I feel nauseous.</div>
    </div>
  </div>
</div>
</body></html>`
}

// ─── Vitals capture (phone camera) ───────────────────────────────────────
// Stylized rendering: phone mockup with camera preview + real-time vital
// readouts overlaying. Mock silhouette, no real face. Shows what the
// patient sees during a 30-second capture.
function renderVitalsCapture() {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  body { font-family:${FF}; background:#0B1220; margin:0; padding:0; color:white; }
  .frame { width:1120px; height:700px; background:linear-gradient(135deg,#152238 0%,#0B1220 100%); padding:32px; box-sizing:border-box; display:grid; grid-template-columns:1fr 1fr; gap:40px; align-items:center; }
  .side { display:flex; flex-direction:column; gap:14px; }
  .eyebrow { font-size:.7rem; letter-spacing:.14em; text-transform:uppercase; color:#0B6E76; font-weight:700; }
  h1 { font-family:Cormorant Garamond,Georgia,serif; font-size:2.4rem; line-height:1.05; margin:0; color:white; font-weight:600; letter-spacing:-.01em; }
  h1 .accent { color:#D4EEF0; font-style:italic; }
  p { color:rgba(255,255,255,.75); font-size:1rem; line-height:1.55; margin:0; }
  .metrics { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:10px; }
  .metric { background:rgba(255,255,255,.05); border:1px solid rgba(212,238,240,.15); border-radius:12px; padding:14px 16px; }
  .metric .label { font-size:.72rem; color:#94A3B8; letter-spacing:.05em; text-transform:uppercase; font-weight:700; }
  .metric .value { font-family:${MONO}; font-size:1.5rem; font-weight:700; color:white; margin-top:4px; }
  .metric .unit { font-size:.75rem; color:#D4EEF0; font-weight:600; }

  .phone-wrap { display:flex; align-items:center; justify-content:center; }
  .phone { width:320px; height:600px; background:#000; border-radius:44px; padding:12px; box-shadow:0 40px 80px rgba(0,0,0,.5); position:relative; }
  .screen { width:100%; height:100%; background:linear-gradient(180deg, #1E293B 0%, #0F172A 100%); border-radius:34px; overflow:hidden; position:relative; }
  .notch { position:absolute; top:14px; left:50%; transform:translateX(-50%); width:110px; height:26px; background:#000; border-radius:16px; z-index:2; }
  .camera-view { position:absolute; inset:0; padding:56px 16px 16px; display:flex; flex-direction:column; }
  .face-oval { flex:1; border:2px dashed rgba(212,238,240,.4); border-radius:180px/220px; display:flex; align-items:center; justify-content:center; position:relative; margin-bottom:12px; }
  .face-oval::after { content:''; position:absolute; inset:12px; border-radius:170px/210px; background:radial-gradient(ellipse at 50% 40%, rgba(212,238,240,.08) 0%, transparent 60%); }
  .face-icon { font-size:5rem; opacity:.35; }
  .pulse { position:absolute; top:14px; right:14px; background:rgba(220,38,38,.9); color:white; padding:4px 10px; border-radius:99px; font-size:.7rem; font-weight:700; display:inline-flex; align-items:center; gap:6px; }
  .pulse-dot { width:6px; height:6px; border-radius:50%; background:white; }
  .capture-status { text-align:center; font-size:.72rem; color:#94A3B8; letter-spacing:.05em; text-transform:uppercase; font-weight:700; margin-bottom:8px; }
  .progress { height:4px; background:rgba(255,255,255,.1); border-radius:2px; overflow:hidden; margin-bottom:14px; }
  .progress .bar { height:100%; width:68%; background:linear-gradient(90deg, #0B6E76, #D4EEF0); border-radius:2px; }
  .live-vitals { background:rgba(0,0,0,.5); border-radius:16px; padding:12px 14px; display:grid; grid-template-columns:1fr 1fr; gap:8px 12px; }
  .live-vitals .lv { display:flex; align-items:baseline; justify-content:space-between; }
  .live-vitals .lv .l { font-size:.65rem; color:#94A3B8; letter-spacing:.05em; text-transform:uppercase; font-weight:700; }
  .live-vitals .lv .v { font-family:${MONO}; font-size:1.1rem; font-weight:700; color:white; }
</style></head><body>
<div class="frame">
  <div class="side">
    <div class="eyebrow">Vitals in ~30 seconds</div>
    <h1>Just the phone.<br/><span class="accent">No wearable.</span></h1>
    <p>Rural patients hold up their phone. Heart rate, oxygen saturation, and respiratory rate stream in real time — no cuff, no oximeter, no equipment for them to buy or set up.</p>
    <div class="metrics">
      <div class="metric"><div class="label">Heart rate</div><div class="value">78 <span class="unit">bpm</span></div></div>
      <div class="metric"><div class="label">SpO2</div><div class="value">97 <span class="unit">%</span></div></div>
      <div class="metric"><div class="label">Resp rate</div><div class="value">16 <span class="unit">/ min</span></div></div>
      <div class="metric"><div class="label">Signal</div><div class="value">Strong <span class="unit">✓</span></div></div>
    </div>
  </div>

  <div class="phone-wrap">
    <div class="phone">
      <div class="screen">
        <div class="notch"></div>
        <div class="camera-view">
          <div class="pulse"><span class="pulse-dot"></span> LIVE</div>
          <div class="face-oval"><span class="face-icon">👤</span></div>
          <div class="capture-status">Hold still · 21 s remaining</div>
          <div class="progress"><div class="bar"></div></div>
          <div class="live-vitals">
            <div class="lv"><span class="l">HR</span><span class="v">78</span></div>
            <div class="lv"><span class="l">SpO₂</span><span class="v">97%</span></div>
            <div class="lv"><span class="l">RR</span><span class="v">16</span></div>
            <div class="lv"><span class="l">HRV</span><span class="v">42</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
</body></html>`
}

// ─── OG preview card (1200x630) ──────────────────────────────────────────
// Fixed-size social/text preview card. Shown when tere.co.nz is shared
// on Slack / iMessage / Twitter / LinkedIn / anywhere with OG scraping.
// Composition mimics the corporate hero: brand-lockup left, headline
// centered, mini language + vitals chips to hint at the two hero features.
function renderOgPreview() {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  html, body { margin:0; padding:0; }
  body { font-family:${FF}; background:#F7F5F0; color:${NAVY}; }
  .frame { width:1200px; height:630px; padding:80px 90px; box-sizing:border-box; display:flex; flex-direction:column; justify-content:space-between; position:relative; overflow:hidden;
           background: radial-gradient(circle at 20% 20%, rgba(11,110,118,.08) 0, transparent 45%), radial-gradient(circle at 85% 90%, rgba(13,43,69,.06) 0, transparent 45%), #F7F5F0; }
  .brand { display:flex; align-items:baseline; gap:14px; }
  .brand .n { font-family:Cormorant Garamond,Georgia,serif; font-style:italic; color:${NAVY}; font-size:3.2rem; font-weight:700; }
  .brand .s { font-size:1rem; letter-spacing:.14em; text-transform:uppercase; color:#6B7280; font-weight:700; }
  h1 { font-family:Cormorant Garamond,Georgia,serif; font-size:4.4rem; line-height:1; margin:0; color:${NAVY}; font-weight:600; letter-spacing:-.02em; max-width:1000px; }
  h1 .accent { color:${TEAL}; font-style:italic; }
  .sub { font-size:1.4rem; color:#4B5563; line-height:1.4; margin-top:22px; max-width:900px; }
  .foot { display:flex; align-items:center; justify-content:space-between; gap:24px; }
  .chips { display:flex; gap:10px; flex-wrap:wrap; }
  .chip { background:white; border:1px solid #E2E8F0; color:${NAVY}; padding:10px 18px; border-radius:999px; font-size:1rem; font-weight:700; display:inline-flex; align-items:center; gap:8px; }
  .chip .dot { width:8px; height:8px; border-radius:999px; background:${TEAL}; }
  .url { font-size:1.1rem; color:${TEAL}; font-weight:700; letter-spacing:.02em; }
</style></head><body>
<div class="frame">
  <div class="brand">
    <span class="n">Tere</span>
    <span class="s">Health Ltd</span>
  </div>
  <div>
    <h1>Telemedicine that reaches every patient,<br/><span class="accent">in their own language.</span></h1>
    <div class="sub">A New Zealand built platform. Live subtitle translation, vitals from a phone camera, video, prescribing and messaging on top.</div>
  </div>
  <div class="foot">
    <div class="chips">
      <span class="chip"><span class="dot"></span> Live translation</span>
      <span class="chip"><span class="dot"></span> Vitals from a phone</span>
      <span class="chip"><span class="dot"></span> Rural first</span>
    </div>
    <div class="url">tere.co.nz</div>
  </div>
</div>
</body></html>`
}

async function shoot(html, outPath, viewportHeight, opts = {}) {
  const width = opts.width || 1120
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width, height: viewportHeight }, deviceScaleFactor: opts.deviceScaleFactor || 2 })
  const page = await ctx.newPage()
  await page.setContent(html, { waitUntil: 'domcontentloaded' })
  let contentHeight = viewportHeight
  if (opts.fixedHeight) {
    // Fixed-size marketing mockups (frame is exactly W×H). Screenshot the
    // .frame element directly rather than auto-measuring, to keep the
    // aspect ratio consistent for landing-page embedding.
    await page.setViewportSize({ width, height: viewportHeight })
    const frame = await page.locator('.frame').first()
    await frame.screenshot({ path: outPath })
  } else {
    // Auto-trim: measure actual content height so the screenshot fits tightly.
    contentHeight = await page.evaluate(() => {
      const body = document.body
      const container = body.querySelector('.container') || body.querySelector('.card') || body
      const rect = container.getBoundingClientRect()
      return Math.ceil(rect.bottom + 32)
    })
    await page.setViewportSize({ width: 1120, height: contentHeight })
    await page.screenshot({ path: outPath, fullPage: false })
  }
  await browser.close()
  const stat = await fs.stat(outPath)
  console.log(`  wrote ${outPath} (${Math.round(stat.size / 1024)} KB)`)
}

async function main() {
  const outDir = path.resolve('public/corporate')
  await fs.mkdir(outDir, { recursive: true })
  console.log('Rendering consult with translation (HERO)…')
  await shoot(renderConsultWithTranslation(), path.join(outDir, 'consult-translation.png'), 700, { fixedHeight: true })
  console.log('Rendering vitals capture (FEATURED)…')
  await shoot(renderVitalsCapture(),          path.join(outDir, 'vitals-capture.png'),      700, { fixedHeight: true })
  console.log('Rendering inbox list (supporting)…')
  await shoot(renderInboxList(),              path.join(outDir, 'hl7-inbox.png'),           900)
  console.log('Rendering report detail (kept for reference)…')
  await shoot(renderReportDetail(),           path.join(outDir, 'hl7-abnormal.png'),        900)
  console.log('Rendering OG preview (1200x630 for social/text share)…')
  await shoot(renderOgPreview(),              path.join(outDir, 'og-preview.png'),          630, { fixedHeight: true, width: 1200, deviceScaleFactor: 1 })
  console.log('\nDone. Refresh tere.co.nz to see updated screenshots.')
}

main().catch(err => { console.error(err); process.exit(1) })
