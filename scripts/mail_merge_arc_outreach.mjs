// scripts/mail_merge_arc_outreach.mjs
//
// One-shot mail-merge for the South Island aged residential care outreach
// (Oct 2026). Each facility gets a personally-addressed email with the
// Tere Health Aged Care flyer attached as a PDF.
//
// Usage:
//   node --env-file=.env scripts/mail_merge_arc_outreach.mjs
//     → dry run. Writes rendered HTML previews to
//       scripts/mail-merge-logs/preview/*.html, sends nothing.
//
//   node --env-file=.env scripts/mail_merge_arc_outreach.mjs --send
//     → sends live via sendEmail (SES per EMAIL_PROVIDER=ses).
//       300ms pause between sends. Writes a timestamped JSON log.
//
//   Add --limit=N to cap recipients (handy for a 3-send smoke test).

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { sendEmail, hasEmailProvider } from '../api/_email-client.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const SEND  = process.argv.includes('--send')
const LIMIT = (() => {
  const a = process.argv.find(x => x.startsWith('--limit='))
  return a ? parseInt(a.split('=')[1], 10) : null
})()

const FLYER_PATH = '/Users/patrickherling/Downloads/Tere_Health_Aged_Care.jpg'
const FROM       = 'Tere Health <hello@terehealth.co.nz>'
const CC         = ['patrick@terehealth.co.nz', 'justin@terehealth.co.nz']
const REPLY_TO   = 'hello@terehealth.co.nz'
const SUBJECT    = 'Doctor on screen for your residents'

const LOG_DIR     = path.join(__dirname, 'mail-merge-logs')
const PREVIEW_DIR = path.join(LOG_DIR, 'preview')
if (!fs.existsSync(PREVIEW_DIR)) fs.mkdirSync(PREVIEW_DIR, { recursive: true })

// ─── Recipients ────────────────────────────────────────────────────────────
// name       — facility name (interpolated into greeting)
// email      — delivery address
// first      — manager first name if captured (else null → "Kia ora,")
// region     — for log/preview filename sorting
//
// 78 facility-direct + 7 corporate = 85.

const RECIPIENTS = [
  // ── Marlborough ──
  { region: 'Marlborough', name: 'Heritage Lifecare Waterlea',     email: 'manager.waterlea@hll.org.nz',          first: 'Kathy' },
  { region: 'Marlborough', name: 'Heritage Lifecare Maxwell',      email: 'manager.maxwell@hll.org.nz',           first: 'Alta' },
  { region: 'Marlborough', name: 'Bethsaida Retirement Village',   email: 'manager@bethsaida.co.nz',              first: 'Kyla' },
  { region: 'Marlborough', name: 'Aberleigh Rest Home',            email: 'om@aberleigh.co.nz',                   first: null },

  // ── Nelson / Tasman ──
  { region: 'Nelson/Tasman', name: 'Wensley House',                email: 'wensleyhouse@xtra.co.nz',              first: null },
  { region: 'Nelson/Tasman', name: 'Alden Kensington Court',       email: 'manager.kensington@ultimatecare.co.nz', first: null },
  { region: 'Nelson/Tasman', name: 'Jack Inglis Aged Care Home',   email: 'info@jackinglishome.nz',               first: null },
  { region: 'Nelson/Tasman', name: 'Golden Bay Community Health',  email: 'receptiongb@nbph.org.nz',              first: null },
  { region: 'Nelson/Tasman', name: 'Tasman Rest Home',             email: 'oc@tasmanrh.co.nz',                    first: null },
  { region: 'Nelson/Tasman', name: 'Flaxmore Lifecare',            email: 'manager.flaxmore@hll.org.nz',          first: null },
  { region: 'Nelson/Tasman', name: 'Stillwater Lifecare',          email: 'manager.stillwater@hll.org.nz',        first: null },

  // ── West Coast ──
  { region: 'West Coast', name: 'Dixon House Rest Home',           email: 'dixonhouse.greymouth@gmail.com',       first: null },
  { region: 'West Coast', name: "O'Conor Memorial Home",           email: 'susan@oconorhome.co.nz',               first: 'Susan' },
  { region: 'West Coast', name: 'Granger House Lifecare',          email: 'manager.granger@hll.org.nz',           first: null },
  { region: 'West Coast', name: 'Allen Bryant',                    email: 'manager.allenbryant@ultimatecare.co.nz', first: null },

  // ── Canterbury ──
  { region: 'Canterbury', name: 'Nurse Maude Care Home',           email: 'admin@nursemaude.org.nz',              first: null },
  { region: 'Canterbury', name: 'Windsorcare',                     email: 'reception@windsorcare.co.nz',          first: null },
  { region: 'Canterbury', name: 'Wesley Care',                     email: 'manager@wesleycare.nz',                first: null },
  { region: 'Canterbury', name: 'Archer Thorrington',              email: 'sue@archer.org.nz',                    first: 'Sue' },
  { region: 'Canterbury', name: 'Archer Beckenham',                email: 'info@archer.org.nz',                   first: null },
  { region: 'Canterbury', name: 'Holly Lea Village',               email: 'info@hollylea.co.nz',                  first: null },
  { region: 'Canterbury', name: 'Kowhai Rest Home',                email: 'kowhairesthome@xnet.co.nz',            first: null },
  { region: 'Canterbury', name: 'Alpine View Care Centre',         email: 'reception@alpineview.co.nz',           first: null },
  { region: 'Canterbury', name: 'Burlington Village',              email: 'claire.h@burlingtonvillage.co.nz',     first: 'Claire' },
  { region: 'Canterbury', name: 'Chatswood Retirement Village',    email: 'manager@chatswoodretirement.co.nz',    first: null },
  { region: 'Canterbury', name: 'Avon Lifecare',                   email: 'reception@avoncare.co.nz',             first: null },
  { region: 'Canterbury', name: 'Pacific Haven Residential Care',  email: 'manager@pacifichaven.co.nz',           first: null },
  { region: 'Canterbury', name: 'Elms Court Rest Home',            email: 'elmscourtresthome@gmail.com',          first: null },
  { region: 'Canterbury', name: 'Westmar Senior Care',             email: 'westmar@xtra.co.nz',                   first: null },
  { region: 'Canterbury', name: 'Rangiora Lifecare',               email: 'manager@rangioralifecare.co.nz',       first: null },
  { region: 'Canterbury', name: 'Kaiapoi Lodge',                   email: 'jonathan@kaiapoilodge.co.nz',          first: 'Jonathan' },
  { region: 'Canterbury', name: 'Akaroa Health',                   email: 'generalmanager@akaroahealth.nz',       first: 'Emma' },
  { region: 'Canterbury', name: 'Methven Care Trust',              email: 'admin@methvencaretrust.co.nz',         first: 'Renee' },

  // ── South Canterbury ──
  { region: 'South Canterbury', name: 'Glenwood Home',             email: 'manager@glenwood.org.nz',              first: 'Hazel' },
  { region: 'South Canterbury', name: 'Lister Home and Hospital',  email: 'manager@listerhome.co.nz',             first: null },
  { region: 'South Canterbury', name: 'Geraldine Retirement Village', email: 'geraldinerh@xtra.co.nz',            first: null },

  // ── Otago ──
  { region: 'Otago', name: 'Montecillo Veterans Home',             email: 'information@montecillo.org.nz',        first: 'Lynley' },
  { region: 'Otago', name: 'Little Sisters of the Poor',           email: 'ms@lspdun.co.nz',                      first: null },
  { region: 'Otago', name: 'Thornbury House',                      email: 'manager@thornbury-house.co.nz',        first: 'Nicola' },
  { region: 'Otago', name: 'Home of St Barnabas Trust',            email: 'manager@stbarnabastrust.nz',           first: null },
  { region: 'Otago', name: 'Queen Rose Retirement Home',           email: 'queenrose@xtra.co.nz',                 first: null },
  { region: 'Otago', name: 'Marne Street Hospital',                email: 'manager@marnestreet.co.nz',            first: null },
  { region: 'Otago', name: 'Bradford Manor',                       email: 'manager@bradfordmanor.co.nz',          first: 'Michelle' },
  { region: 'Otago', name: 'Glendale Retirement Home',             email: 'glendalerh@xtra.co.nz',                first: null },
  { region: 'Otago', name: 'South Care Rest Home',                 email: 'fm@south-care.co.nz',                  first: null },
  { region: 'Otago', name: 'St Clair Park Residential Centre',     email: 'office@stclairpark.co.nz',             first: null },
  { region: 'Otago', name: 'Leslie Groves (Roslyn)',               email: 'admin@lesliegroves.co.nz',             first: null },
  { region: 'Otago', name: 'Leslie Groves (Wakari)',               email: 'execsupport@lesliegroves.co.nz',       first: null },
  { region: 'Otago', name: 'Oxford Court Lifecare',                email: 'manager@oxfordlifecare.co.nz',         first: null },
  { region: 'Otago', name: 'Mossbrae Lifecare',                    email: 'manager@mossbraelifecare.co.nz',       first: null },
  { region: 'Otago', name: 'Birchleigh Residential Care Centre',   email: 'office@birchleigh.com',                first: null },
  { region: 'Otago', name: 'Brooklands Retirement Village',        email: 'enquiries@brooklandsvillage.co.nz',    first: 'Tony' },
  { region: 'Otago', name: 'Ashlea Grove Rest Home',               email: 'manager@ashleagrove.co.nz',            first: 'Jasmine' },
  { region: 'Otago', name: 'West Otago Health (Ribbonwood)',       email: 'wohealth@wohealth.co.nz',              first: 'Karen' },
  { region: 'Otago', name: 'Aspiring Care',                        email: 'tracey@aspiringvillage.co.nz',         first: 'Tracey' },
  { region: 'Otago', name: 'Harbour View Rest Home',               email: 'manager@harbourviewoamaru.nz',         first: 'Arianna' },
  { region: 'Otago', name: 'Observatory Village Lifecare',         email: 'admin@observatoryvillage.nz',          first: 'Jane' },

  // ── Presbyterian Support / Enliven (South Canterbury) ──
  { region: 'South Canterbury', name: 'PSSC (Enliven) head office',  email: 'admin@pssc.co.nz',                   first: null },
  { region: 'South Canterbury', name: 'Enliven The Croft (Timaru)',  email: 'elt@pssc.co.nz',                     first: 'Annabelle' },

  // ── Presbyterian Support / Enliven (Otago) ──
  { region: 'Otago', name: 'PSOtago Enliven head office',          email: 'enliven@psotago.org.nz',               first: null },
  { region: 'Otago', name: 'Enliven Ross Home',                    email: 'ross.admin@psotago.org.nz',            first: null },
  { region: 'Otago', name: 'Enliven St Andrews',                   email: 'standrews@psotago.org.nz',             first: null },
  { region: 'Otago', name: 'Enliven Taieri Court',                 email: 'taiericourt@psotago.org.nz',           first: null },
  { region: 'Otago', name: 'Enliven Castlewood',                   email: 'castlewood.admin@psotago.org.nz',      first: null },
  { region: 'Otago', name: 'Enliven Holmdene',                     email: 'holmdene@psotago.org.nz',              first: null },
  { region: 'Otago', name: 'Enliven Iona',                         email: 'iona@psotago.org.nz',                  first: null },
  { region: 'Otago', name: 'Enliven Ranui',                        email: 'ranui@psotago.org.nz',                 first: null },
  { region: 'Otago', name: 'Enliven Elmslie House',                email: 'elmslie@psotago.org.nz',               first: null },

  // ── Southland ──
  { region: 'Southland', name: 'PS Southland Enliven head office', email: 'enquiry@enlivensld.nz',                first: null },
  { region: 'Southland', name: 'Enliven Peacehaven',               email: 'PHManager@enlivensld.nz',              first: null },
  { region: 'Southland', name: 'Enliven Vickery Court',            email: 'VCManager@enlivensld.nz',              first: null },
  { region: 'Southland', name: 'Enliven Walmsley House',           email: 'WHManager@enlivensld.nz',              first: null },
  { region: 'Southland', name: 'Albany Home & Hospital',           email: 'manager.albany@experioncare.co.nz',    first: null },
  { region: 'Southland', name: 'Wyndham & Districts Community Rest Home', email: 'admin@wyndhamresthome.co.nz',   first: null },
  { region: 'Southland', name: 'Rata Park Rest Home',              email: 'rata.park@xtra.co.nz',                 first: 'Darren' },
  { region: 'Southland', name: 'Calvary Hospital Southland',       email: 'calvaryhosp.inv@xtra.co.nz',           first: null },
  { region: 'Southland', name: 'Parata',                           email: 'parataresidence@xtra.co.nz',           first: null },

  // ── National chain corporate (one each) ──
  { region: 'Corporate', name: 'Ryman Healthcare (Partnerships)',  email: 'partnerships@rymanhealthcare.com',     first: null },
  { region: 'Corporate', name: 'Summerset Group (Head Office)',    email: 'headoffice.reception@summerset.co.nz', first: null },
  { region: 'Corporate', name: 'Oceania Healthcare (Enquiries)',   email: 'enquiry@oceaniahealthcare.co.nz',      first: null },
  { region: 'Corporate', name: 'Arvida Group',                     email: 'info@arvida.co.nz',                    first: null },
  { region: 'Corporate', name: 'Heritage Lifecare (Head Office)',  email: 'office@hll.org.nz',                    first: null },
  { region: 'Corporate', name: 'Dementia Care NZ (Head Office)',   email: 'office@dementiacarenz.co.nz',          first: null },
  { region: 'Corporate', name: 'Experion Care (Head Office)',      email: 'info@experioncare.co.nz',              first: null },
]

// ─── Template ──────────────────────────────────────────────────────────────

function salutation(first) {
  return first ? `Kia ora ${first},` : 'Kia ora,'
}

function renderText({ facility, first }) {
  return [
    salutation(first),
    '',
    `I'm Dr Patrick Herling, Emergency Medicine physician and co-founder of Tere Health. Writing to introduce a service built for aged care nurses: a video doctor your team can call for UTIs, chest infections, med refills, falls, skin tears, and after-hours deterioration. We're NZ-registered and run a 24/7 queue, with a current average wait of only 11 minutes to see a doctor.`,
    '',
    `A one-page overview is embedded below. Can I offer a 15-minute call with your Clinical Manager or DON to walk through how it would fit ${facility}'s workflow?`,
    '',
    'Ngā mihi,',
    '',
    'Patrick Herling',
    'Co-founder, Tere Health Ltd',
    'patrick@terehealth.co.nz',
    'terehealth.co.nz',
  ].join('\n')
}

function renderHtml({ facility, first }) {
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
  return `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0E2E38; max-width: 620px; line-height: 1.55;">
<p>${esc(salutation(first))}</p>

<p>I'm Dr Patrick Herling, Emergency Medicine physician and co-founder of Tere Health. Writing to introduce a service built for aged care nurses: a video doctor your team can call for UTIs, chest infections, med refills, falls, skin tears, and after-hours deterioration. We're NZ-registered and run a 24/7 queue, with a current average wait of only 11 minutes to see a doctor.</p>

<p>Can I offer a 15-minute call with your Clinical Manager or DON to walk through how it would fit ${esc(facility)}'s workflow?</p>

<p><img src="cid:tere-aged-care-flyer" alt="Tere Health aged care overview" style="max-width:100%; height:auto; display:block; border:0;"></p>

<p>Ngā mihi,</p>

<p style="margin-bottom: 0;">Patrick Herling<br>
Co-founder, Tere Health Ltd<br>
<a href="mailto:patrick@terehealth.co.nz" style="color: #0E2E38;">patrick@terehealth.co.nz</a><br>
<a href="https://terehealth.co.nz" style="color: #0E2E38;">terehealth.co.nz</a></p>
</body>
</html>`
}

// ─── Load attachment once ──────────────────────────────────────────────────

if (!fs.existsSync(FLYER_PATH)) {
  console.error(`\n✗ Flyer not found at ${FLYER_PATH}`)
  process.exit(1)
}
const flyerBuf = fs.readFileSync(FLYER_PATH)
const flyerAttachment = {
  filename: 'Tere_Health_Aged_Care.jpg',
  content: flyerBuf,
  contentType: 'image/jpeg',
  inline: true,
  contentId: 'tere-aged-care-flyer',
}

// ─── Dispatch ──────────────────────────────────────────────────────────────

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

const pool = LIMIT ? RECIPIENTS.slice(0, LIMIT) : RECIPIENTS

console.log('\n════════════════════════════════════════════════════════════════')
console.log(`  ARC outreach mail-merge · ${SEND ? 'LIVE SEND' : 'DRY RUN'}`)
console.log(`  Recipients: ${pool.length}${LIMIT ? ` (limited from ${RECIPIENTS.length})` : ''}`)
console.log(`  From: ${FROM}`)
console.log(`  CC:   ${CC.join(', ')}`)
console.log(`  Attachment: ${FLYER_PATH} (${(flyerBuf.length/1024).toFixed(0)} KB)`)
console.log('════════════════════════════════════════════════════════════════\n')

if (SEND && !hasEmailProvider()) {
  console.error('✗ EMAIL_PROVIDER env not set or credentials missing. Aborting.')
  process.exit(1)
}

const results = []
const started = Date.now()

for (let i = 0; i < pool.length; i++) {
  const r = pool[i]
  const html = renderHtml({ facility: r.name, first: r.first })
  const text = renderText({ facility: r.name, first: r.first })

  if (!SEND) {
    const previewPath = path.join(PREVIEW_DIR, `${String(i+1).padStart(2,'0')}-${slug(r.name)}.html`)
    // Inline the flyer as a data URI for preview-only rendering (the real
    // email uses the cid: reference against the MIME-attached image).
    const previewSrc = `data:image/jpeg;base64,${flyerBuf.toString('base64')}`
    const bodyInner = html
      .replace(/^<!doctype html>[\s\S]*?<body[^>]*>/, '')
      .replace(/<\/body>[\s\S]*$/, '')
      .replace(/src="cid:tere-aged-care-flyer"/g, `src="${previewSrc}"`)
    const previewHtml = `<!doctype html>
<html><head><meta charset="utf-8"></head><body style="font-family: sans-serif; background: #f5f5f5; padding: 20px;">
<div style="background: white; padding: 20px; max-width: 720px; margin: 0 auto; border: 1px solid #ddd;">
<p style="color: #666; font-size: 12px; border-bottom: 1px solid #eee; padding-bottom: 8px;">
<b>Preview</b> · ${i+1}/${pool.length} · ${r.region}<br>
<b>To:</b> ${r.email}<br>
<b>Cc:</b> ${CC.join(', ')}<br>
<b>From:</b> ${FROM}<br>
<b>Subject:</b> ${SUBJECT}<br>
<b>Inline image:</b> Tere_Health_Aged_Care.jpg (${(flyerBuf.length/1024).toFixed(0)} KB, embedded as cid:tere-aged-care-flyer)
</p>
${bodyInner}
</div>
</body></html>`
    fs.writeFileSync(previewPath, previewHtml)
    console.log(`  [${String(i+1).padStart(2,'0')}/${pool.length}]  ${r.email.padEnd(50)}  → preview written`)
    results.push({ ok: true, dryRun: true, recipient: r })
    continue
  }

  try {
    const res = await sendEmail({
      from: FROM,
      to: r.email,
      cc: CC,
      replyTo: REPLY_TO,
      subject: SUBJECT,
      html,
      text,
      attachments: [flyerAttachment],
    })
    const ok = Boolean(res?.ok)
    console.log(`  [${String(i+1).padStart(2,'0')}/${pool.length}]  ${r.email.padEnd(50)}  ${ok ? '✓' : '✗ ' + (res?.error || 'unknown')}`)
    results.push({ ok, id: res?.id, provider: res?.provider, error: res?.error, recipient: r })
  } catch (e) {
    console.log(`  [${String(i+1).padStart(2,'0')}/${pool.length}]  ${r.email.padEnd(50)}  ✗ ${e?.message || e}`)
    results.push({ ok: false, error: e?.message || String(e), recipient: r })
  }

  await new Promise(r => setTimeout(r, 300))
}

const ts = new Date().toISOString().replace(/[:.]/g, '-')
const logPath = path.join(LOG_DIR, `arc-southisland-${SEND ? 'send' : 'dry'}-${ts}.json`)
fs.writeFileSync(logPath, JSON.stringify({
  mode: SEND ? 'send' : 'dry',
  started: new Date(started).toISOString(),
  finished: new Date().toISOString(),
  recipientCount: pool.length,
  okCount: results.filter(r => r.ok).length,
  failCount: results.filter(r => !r.ok).length,
  from: FROM,
  cc: CC,
  replyTo: REPLY_TO,
  subject: SUBJECT,
  results,
}, null, 2))

console.log('\n────────────────────────────────────────────────────────────────')
console.log(`  ${results.filter(r => r.ok).length} ok · ${results.filter(r => !r.ok).length} failed`)
console.log(`  Log: ${logPath}`)
if (!SEND) {
  console.log(`  Previews: ${PREVIEW_DIR}/`)
  console.log(`  To send live:  node --env-file=.env scripts/mail_merge_arc_outreach.mjs --send`)
}
console.log('════════════════════════════════════════════════════════════════\n')
