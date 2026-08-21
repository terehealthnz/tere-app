// POST /api/hl7-inbound — Medical-Objects Capricorn Cloud receive endpoint.
//
// Authentication: shared secret in X-Tere-Bridge-Secret header. Vercel
// serverless functions do not terminate mTLS, so an upstream mTLS proxy
// (Fly.io / Cloudflare) validates the Capricorn client cert and forwards
// the raw HL7 body here with this secret attached. Requests without a
// matching secret get a 200 OK + rejection ack so bots don't get useful
// telemetry.
//
// Request:  raw HL7 v2 message (text/plain or application/hl7-v2)
// Response: raw HL7 ack (text/plain) — MSH + MSA
//
// Behaviour reference: Capricorn+Cloud+Integration+Details.pdf, case #1058382
// and the NZ Receive Conformance Testing Checklist.

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const ATTACHMENT_BUCKET = 'hl7-attachments'
const MAX_BODY_BYTES = 6 * 1024 * 1024   // 6MB — conformance requires 5MB

// Tere Health's HPI-O. Test/prod use the same identifier — Medical-Objects
// routes internally by HPI-O and treats us as one organisational receiver.
// Known MSH-6 variants Capricorn Cloud sends in the test network:
//   "DEMO Tere Heal (G11238-E)"   (truncated 20-char)
//   "DEMO Tere Health (G11238-E)"
//   "G11238-E"                    (raw)
const TERE_HPI_O = 'G11238-E'
function msh6IsOurOrg(receivingFacility) {
  if (!receivingFacility) return false
  const s = String(receivingFacility).toUpperCase().replace(/\s+/g, '')
  return s === TERE_HPI_O || s.includes(`(${TERE_HPI_O})`) || s.endsWith(TERE_HPI_O)
}

// ─── HL7 v2 parser ──────────────────────────────────────────────────────────
// HL7 v2 is pipe-delimited. Field separator is MSH-1 (default '|').
// Encoding chars are MSH-2 (default '^~\&' meaning component / repetition /
// escape / subcomponent). We read them from the MSH itself so we handle
// non-default separators (rare in practice but not impossible).

function normaliseSegments(raw) {
  // HL7 v2 nominally uses \r as the segment separator. Real-world Capricorn
  // samples mix \r with a trailing \r\n at EOF, and some senders use \n.
  // Normalise everything to \n then split, and drop empty lines.
  //
  // Belt-and-braces cleanup for anything a sender might prefix or embed:
  //   - MLLP framing bytes (0x0B start-block, 0x1C end-block)
  //   - BOMs (UTF-8 EF BB BF, UTF-16 FE FF / FF FE — encoding auto-detected
  //     one layer up in readRawBody, but a stray BOM char could still exist)
  //   - Null bytes (UTF-16-without-BOM misdetects should be caught upstream,
  //     but strip null bytes as a floor so 'M\0S\0H' → 'MSH')
  //   - Leading whitespace
  //   - Anything before the actual MSH: if we still don't see MSH at the
  //     start, slice from the first occurrence of "MSH" + a plausible field
  //     separator (|). This is the last line of defence against unknown
  //     length-prefix or wrapper framing we haven't seen yet.
  let stripped = String(raw)
    .replace(/[\x00\x0B\x1C﻿]/g, '')
    .replace(/^\s+/, '')
  if (!stripped.startsWith('MSH')) {
    const idx = stripped.search(/MSH[|^]/)
    if (idx > 0) stripped = stripped.slice(idx)
  }
  return stripped.replace(/\r\n?/g, '\n').split('\n').filter(s => s.length > 0)
}

// Hex dump of the first N bytes — used only when parse fails, so a downstream
// operator (Tony at MO in this case) can see exactly what bytes we received
// without needing us to plumb debug logs. Returned in MSA-3 of the reject ack.
function hexPrefix(raw, n = 32) {
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw), 'utf8')
  const slice = buf.slice(0, n)
  const hex = Array.from(slice, b => b.toString(16).padStart(2, '0')).join(' ')
  const ascii = Array.from(slice, b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('')
  return `hex[0..${slice.length}]=${hex} ascii="${ascii}"`
}

function readSeparators(mshSegment) {
  // MSH is special: the first character AFTER 'MSH' is the field separator,
  // and the next 4 characters (before the next field separator) are encoding
  // chars. So MSH|^~\& → sep='|', encoding='^~\&'.
  const sep = mshSegment[3] || '|'
  const enc = mshSegment.slice(4, 8)
  return {
    fieldSep:      sep,
    componentSep:  enc[0] || '^',
    repetitionSep: enc[1] || '~',
    escapeChar:    enc[2] || '\\',
    subComponentSep: enc[3] || '&',
  }
}

function parseMessage(raw, rawBuf) {
  const segments = normaliseSegments(raw)
  // Accept HL7 batch protocol wrappers: skip FHS/BHS/BTS/FTS headers and find
  // the actual MSH. If MSH isn't the first segment, that's OK — the batch
  // header segments carry no clinical data we care about at this layer.
  const mshIdx = segments.findIndex(s => s.startsWith('MSH'))
  if (mshIdx < 0) {
    // rawBuf preserves the pre-decode bytes so operators debugging on the
    // MO side see what actually arrived (encoding, framing bytes, wrappers).
    throw new Error(`Not an HL7 v2 message — no MSH segment found. ${hexPrefix(rawBuf || raw)}`)
  }
  // Drop everything before MSH (batch headers) and after any trailer.
  const msgSegments = segments.slice(mshIdx).filter(s => !/^(BTS|FTS)/.test(s))
  const sep = readSeparators(msgSegments[0])
  const parsed = { segments: [], separators: sep }
  for (const line of msgSegments) {
    // For MSH, the field separator is field 1 (a special case in HL7).
    // We normalise: MSH-1 = '|', then MSH-2 = encoding chars, then MSH-3...
    if (line.startsWith('MSH')) {
      const fields = line.split(sep.fieldSep)
      // Rewrite: fields[0] = 'MSH', fields[1] = encoding chars.
      // Push a virtual '|' as field 1 for consistent 1-based access downstream.
      const norm = ['MSH', sep.fieldSep, ...fields.slice(1)]
      parsed.segments.push({ name: 'MSH', fields: norm })
    } else {
      const fields = line.split(sep.fieldSep)
      parsed.segments.push({ name: fields[0], fields })
    }
  }
  return parsed
}

function segment(parsed, name) {
  return parsed.segments.find(s => s.name === name)
}

function segments(parsed, name) {
  return parsed.segments.filter(s => s.name === name)
}

// Walk parsed.segments in order and split into per-report groups.
// A "report" = one OBR + its trailing OBX/NTE segments, with the
// most-recent PID attached. This handles the NZ HealthLink batching
// pattern where multiple patient reports live under a single MSH.
//   PID → OBR → OBX* → NTE* → PID → OBR → OBX*  → ...
// If a message has no OBR at all, returns a single group with just
// the PID (may still be usable — the outer handler decides).
function groupBatchedReports(parsed) {
  const groups = []
  let currentPid = null
  let currentGroup = null
  for (const seg of parsed.segments) {
    switch (seg.name) {
      case 'MSH': case 'MSA': case 'FHS': case 'BHS': case 'BTS': case 'FTS':
        break // envelope, skip
      case 'PID':
        currentPid = seg
        currentGroup = null   // next OBR starts a fresh group under this PID
        break
      case 'OBR':
        currentGroup = { pid: currentPid, obr: seg, obxes: [], notes: [] }
        groups.push(currentGroup)
        break
      case 'OBX':
        if (currentGroup) currentGroup.obxes.push(seg)
        break
      case 'NTE':
        if (currentGroup) currentGroup.notes.push(seg)
        break
      // Unknown/uninteresting segments are ignored for grouping purposes;
      // the full raw_message is still stored per row for audit.
    }
  }
  // Edge case: PID present but no OBR (e.g. ADT-like or malformed). Return
  // a single stub group so the outer handler can still emit an ACK + row.
  if (!groups.length && currentPid) {
    groups.push({ pid: currentPid, obr: null, obxes: [], notes: [] })
  }
  return groups
}

function field(seg, index) {
  if (!seg) return ''
  return (seg.fields[index] ?? '').toString()
}

function component(seg, fieldIndex, componentIndex, parsed) {
  const v = field(seg, fieldIndex)
  if (!v) return ''
  return v.split(parsed.separators.componentSep)[componentIndex - 1] || ''
}

function parseHl7Datetime(s) {
  // HL7: YYYYMMDDHHMMSS[+/-ZZZZ]. Truncate at valid length.
  if (!s) return null
  const clean = String(s).replace(/\D/g, '').slice(0, 14)
  if (clean.length < 8) return null
  const yr = clean.slice(0, 4)
  const mo = clean.slice(4, 6)
  const dy = clean.slice(6, 8)
  const hr = clean.slice(8, 10) || '00'
  const mi = clean.slice(10, 12) || '00'
  const se = clean.slice(12, 14) || '00'
  const iso = `${yr}-${mo}-${dy}T${hr}:${mi}:${se}Z`
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function parseHl7Date(s) {
  if (!s) return null
  const clean = String(s).replace(/\D/g, '').slice(0, 8)
  if (clean.length !== 8) return null
  return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`
}

// ─── Ack generation ─────────────────────────────────────────────────────────

function buildAck({ inbound, msaCode, errorText }) {
  const msh = segment(inbound, 'MSH')
  const sep = inbound.separators
  const nowHl7 = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  // Swap sender/receiver: original MSH-3/4 (sender) become ACK MSH-5/6.
  const origSendingApp   = field(msh, 3)
  const origSendingFac   = field(msh, 4)
  const origControlId    = field(msh, 10)
  const processingId     = field(msh, 11) || 'P'
  const version          = field(msh, 12) || '2.4'
  // MSH-3 of ACK identifies the acknowledging system (us). Reflecting incoming
  // MSH-5 is wrong — senders often put a gateway name there (BOPHL7 etc), not
  // our real system name. Hardcode. See Medical-Objects helpdesk case #1058382
  // (2026-08-18) where our 2.1 ack returned MSH-3=BOPHL7 (echoed) instead of
  // "Tere Health". MSH-4 stays as our HPI-O (env-scoped).
  const ackSendingApp = 'Tere Health'
  const ackSendingFac = process.env.TERE_HPI_O || TERE_HPI_O
  // MSH-10 of the ack MUST NOT equal MSA-2 of the ack (per checklist).
  const ackControlId = crypto.randomBytes(8).toString('hex').toUpperCase()

  const encChars = `${sep.componentSep}${sep.repetitionSep}${sep.escapeChar}${sep.subComponentSep}`
  const mshOut = [
    'MSH', encChars,
    ackSendingApp, ackSendingFac,
    origSendingApp, origSendingFac,
    nowHl7, '',
    'ACK', ackControlId, processingId, version,
  ].join(sep.fieldSep)

  const msaFields = ['MSA', msaCode, origControlId]
  if (errorText) msaFields.push(String(errorText).slice(0, 500))
  const msaOut = msaFields.join(sep.fieldSep)

  return `${mshOut}\r${msaOut}\r`
}

// ─── Matching helpers ───────────────────────────────────────────────────────

// extractSummary now takes a per-report `group` produced by
// groupBatchedReports. MSH fields still come from the message-level
// header; PID/OBR/OBX/NTE come from the group so batched messages
// yield one summary per report. Callers that don't pass a group get
// the legacy behaviour (first PID + first OBR + all OBX/NTE) for
// backwards compatibility during rollout.
function extractSummary(parsed, group) {
  const msh = segment(parsed, 'MSH')
  const pid   = group ? group.pid   : segment(parsed, 'PID')
  const obr   = group ? group.obr   : segment(parsed, 'OBR')
  const obxes = group ? group.obxes : segments(parsed, 'OBX')
  const ntes  = group ? group.notes : segments(parsed, 'NTE')

  const pidName = field(pid, 5)                          // last^first^middle
  const [lastName, firstName, middleName] = pidName.split(parsed.separators.componentSep)

  return {
    version:               field(msh, 12),
    messageType:           field(msh, 9),
    controlId:             field(msh, 10),
    sendingFacility:       field(msh, 4),
    receivingApp:          field(msh, 5),
    receivingFacility:     field(msh, 6),
    patient: {
      pid3:      field(pid, 3),
      lastName:  lastName || '',
      firstName: firstName || '',
      middleName: middleName || '',
      dob:       parseHl7Date(field(pid, 7)),
      sex:       field(pid, 8),
    },
    order: {
      obr3_1:  component(obr, 3, 1, parsed),
      obr4:    field(obr, 4),
      // Component-level breakdown of OBR-4 (Universal Service Identifier).
      // Component 2 is the human-readable service name — that's what the
      // inbox UI should show, not the full "LIT^MO TEST 2.4 MSG - BAY X2".
      // OBR-4.1 = 'LIT' signals the FT observation is a rendered copy of
      // the same content in the PDF (HL7 v2 standard, see MO helpdesk case
      // #1058382, Tony Cruice review 2026-08-19).
      obr4_1:  component(obr, 4, 1, parsed),
      obr4_2:  component(obr, 4, 2, parsed),
      // Date mapping per Medical-Objects (Tony Cruice, 2026-08-19):
      //   Requested date  — OBR-27.4 (Q/T Start Date/Time), fallback OBR-6
      //   Effective/exam  — OBR-7
      //   Generated date  — OBR-22 (results rpt/status change), fallback MSH-7
      // OBR-27 is Quantity/Timing:
      //   qty^interval^duration^start^end^priority^condition
      // so subcomponent 4 (component index) is the requested start date/time.
      requestedDate:   parseHl7Datetime(component(obr, 27, 4, parsed)) || parseHl7Datetime(field(obr, 6)),
      observationDate: parseHl7Datetime(field(obr, 7)),
      generatedDate:   parseHl7Datetime(field(obr, 22)) || parseHl7Datetime(field(msh, 7)),
      // OBR-25 Result Status: 'C' = Corrected. Downstream UI highlights.
      resultStatus: field(obr, 25),
      corrected: (field(obr, 25) || '').trim().toUpperCase() === 'C',
    },
    obx: obxes.map(o => ({
      idx:      Number(field(o, 1)) || 0,
      valueType: field(o, 2),
      identifier: field(o, 3),
      // OBX-4 Observation Sub-ID — analyte within a panel (CBC differential
      // cell types, urine dipstick components). Without this every row in
      // a panel collapses to the same identifier label. Added 2026-08-20.
      subId:    field(o, 4),
      value:    field(o, 5),
      units:    field(o, 6),
      refRange: field(o, 7),
      abnormal: field(o, 8),
    })),
    notes: ntes.map(n => field(n, 3)).filter(Boolean),
  }
}

async function matchProvider(supabase, receivingFacility, receivingApp) {
  if (!receivingFacility && !receivingApp) return null
  // Try exact match on hpi_number, cpn, or a stored 'medical_objects_id'.
  const target = [receivingFacility, receivingApp].filter(Boolean)
  const { data } = await supabase
    .from('providers')
    .select('id, first_name, last_name, hpi_number, cpn')
    .in('hpi_number', target)
  if (data && data.length) return data[0]
  const { data: byCpn } = await supabase
    .from('providers')
    .select('id, first_name, last_name, hpi_number, cpn')
    .in('cpn', target)
  return (byCpn && byCpn[0]) || null
}

async function matchPatient(supabase, patient) {
  if (!patient) return { match: null, confidence: 'none' }
  // NHI first (PID-3 typically holds it in NZ). v2.4 messages use the HD-
  // variant format `EJH551Z^^NHI^NZLMOH^NI` — the actual ID is component 1.
  // v2.1 messages usually just have the raw ID. Handle both.
  const nhiCandidate = String(patient.pid3 || '').split('^')[0].trim()
  if (nhiCandidate) {
    const { data: byNhi } = await supabase
      .from('patients')
      .select('id, first_name, last_name, dob, nhi')
      .eq('nhi', nhiCandidate)
      .maybeSingle()
    if (byNhi) return { match: byNhi, confidence: 'strong' }
  }
  // Fall back to name + DOB.
  if (patient.firstName && patient.lastName && patient.dob) {
    const { data: byName } = await supabase
      .from('patients')
      .select('id, first_name, last_name, dob')
      .ilike('first_name', patient.firstName)
      .ilike('last_name',  patient.lastName)
      .eq('dob',           patient.dob)
      .maybeSingle()
    if (byName) return { match: byName, confidence: 'weak' }
  }
  return { match: null, confidence: 'none' }
}

async function ensureBucket(supabase) {
  try { await supabase.storage.createBucket(ATTACHMENT_BUCKET, { public: false }) }
  catch { /* already exists */ }
}

// extractAndStorePdfs now accepts an explicit list of OBX segments so
// batched messages associate each PDF with the correct row. Falls back
// to all OBX in the parsed message if `obxList` is not supplied
// (single-report messages / callers not updated yet).
async function extractAndStorePdfs(supabase, messageId, parsed, obxList) {
  // OBX with ED (encapsulated data) type of ^PDF^Base64^<data> is the
  // common variant. See Medical-Objects "How to determine a PDF OBX".
  const obxes = obxList || segments(parsed, 'OBX')
  const results = []
  for (const obx of obxes) {
    const valueType = field(obx, 2)
    if (valueType !== 'ED') continue
    const val = field(obx, 5)
    if (!val) continue
    const parts = val.split(parsed.separators.componentSep)
    // ^^PDF^Base64^<data>  (parts 0..4)
    const sourceApp = parts[0] || ''
    const dataType  = parts[1] || ''
    const format    = (parts[2] || '').toUpperCase()
    const encoding  = (parts[3] || '').toUpperCase()
    const data      = parts[4] || ''
    if (format !== 'PDF' || encoding !== 'BASE64' || !data) continue
    let bytes
    try { bytes = Buffer.from(data, 'base64') } catch { continue }
    if (!bytes.length) continue

    await ensureBucket(supabase)
    const idx = Number(field(obx, 1)) || 0
    const filename = `${messageId}_obx${idx}.pdf`
    const path = `${messageId}/${filename}`
    const { error: upErr } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .upload(path, bytes, { contentType: 'application/pdf', upsert: true })
    if (upErr) { console.error('[hl7-inbound] pdf upload failed:', upErr.message); continue }
    const { error: insErr } = await supabase
      .from('inbound_hl7_attachments')
      .insert({
        message_id: messageId,
        obx_index: idx,
        content_type: 'application/pdf',
        storage_path: path,
        filename,
        size_bytes: bytes.length,
      })
    if (insErr) console.error('[hl7-inbound] pdf attachment row failed:', insErr.message)
    results.push({ obx_index: idx, path, bytes: bytes.length })
  }
  return results
}

// ─── Body reader ────────────────────────────────────────────────────────────

async function readRawBody(req) {
  // Returns { text, buf } — text is the best-guess decoded string, buf is the
  // raw Buffer preserved for hex-dump diagnostics on parse failure. Encoding
  // auto-detected by BOM (UTF-16LE / UTF-16BE / UTF-8). If no BOM, defaults
  // to UTF-8. This matters because Medical-Objects's Capricorn Cloud sender
  // has historically shipped 2.4 messages as UTF-16LE — see case #1058382,
  // 2026-08-18. Bare .toString('utf8') on a UTF-16 buffer gives one null-byte
  // between every ASCII char, and MSH becomes M\0S\0H\0 — fails startsWith.
  if (typeof req.body === 'string' && req.body.length) {
    return { text: req.body, buf: Buffer.from(req.body, 'utf8') }
  }
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) throw new Error(`Message exceeds ${MAX_BODY_BYTES} bytes`)
    chunks.push(chunk)
  }
  const buf = Buffer.concat(chunks)
  let text
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    text = buf.slice(2).toString('utf16le')
  } else if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    // UTF-16BE — swap bytes then decode as LE
    const swapped = Buffer.alloc(buf.length - 2)
    for (let i = 2; i < buf.length; i += 2) {
      swapped[i - 2]     = buf[i + 1] || 0
      swapped[i - 2 + 1] = buf[i]
    }
    text = swapped.toString('utf16le')
  } else if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    text = buf.slice(3).toString('utf8')
  } else {
    text = buf.toString('utf8')
    // Heuristic: if the decoded text is >20% null bytes, it's probably
    // UTF-16LE-without-BOM. Re-decode.
    const nullCount = (text.match(/\x00/g) || []).length
    if (nullCount > text.length * 0.2) {
      text = buf.toString('utf16le')
    }
  }
  return { text, buf }
}

// ─── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).send('Method not allowed')
  }

  // Shared secret from upstream mTLS proxy. Absence = reject silently (200).
  // Length-check before timingSafeEqual — it throws on length mismatch, which
  // would surface as a 500 JSON error instead of a proper HL7 auth-fail ack.
  const bridgeSecret = process.env.HL7_BRIDGE_SECRET
  const supplied = req.headers['x-tere-bridge-secret']
  const suppliedBuf = Buffer.from(String(supplied || ''))
  const secretBuf   = Buffer.from(String(bridgeSecret || ''))
  if (!bridgeSecret || !supplied ||
      suppliedBuf.length !== secretBuf.length ||
      !crypto.timingSafeEqual(suppliedBuf, secretBuf)) {
    // Log and reject as HL7 ack (Capricorn will retry — that's fine while we
    // debug the proxy config; better than a 401 that trips their alarms).
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    return res.status(200).send('MSH|^~\\&|Tere Health|G11238-E|UNKNOWN|UNKNOWN|20250101000000||ACK|00000000|P|2.4\rMSA|AR|UNKNOWN|Auth failed\r')
  }

  let body
  try {
    body = await readRawBody(req)
  } catch (e) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    return res.status(200).send(`MSH|^~\\&|Tere Health|G11238-E|UNKNOWN|UNKNOWN|20250101000000||ACK|00000000|P|2.4\rMSA|AR|UNKNOWN|${e.message}\r`)
  }
  const raw = body.text
  const rawBuf = body.buf
  if (!raw || !raw.trim()) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    return res.status(200).send('MSH|^~\\&|Tere Health|G11238-E|UNKNOWN|UNKNOWN|20250101000000||ACK|00000000|P|2.4\rMSA|AR|UNKNOWN|Empty body\r')
  }

  let parsed
  try {
    parsed = parseMessage(raw, rawBuf)
  } catch (e) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    return res.status(200).send(`MSH|^~\\&|Tere Health|G11238-E|UNKNOWN|UNKNOWN|20250101000000||ACK|00000000|P|2.4\rMSA|AR|UNKNOWN|${e.message}\r`)
  }

  // If it's an incoming ACK to one of OUR sends, accept quietly with HTTP 200
  // (per Capricorn spec: don't return an ack for an ack — infinite loop).
  const msh = segment(parsed, 'MSH')
  const messageType = field(msh, 9)
  if (messageType.startsWith('ACK')) {
    // TODO: correlate MSA-2 with any outbound message we sent, mark delivered.
    return res.status(200).send('OK')
  }

  const supabase = admin()

  // Fan-out for batched ORU messages (NZ HealthLink cost-saving pattern —
  // multiple patient reports under one MSH). Each PID/OBR pair becomes its
  // own row so the provider inbox surfaces every patient distinctly.
  // Single-report messages are just a batch of size 1 — same code path.
  const groups = groupBatchedReports(parsed)
  if (!groups.length) {
    // No PID/OBR at all — pathological. Reject at message level.
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    return res.status(200).send(buildAck({
      inbound: parsed,
      msaCode: 'AR',
      errorText: 'Missing required fields: PID / OBR',
    }))
  }

  // Message-level receiver/env resolution — same for every report in the batch.
  const firstSummary = extractSummary(parsed, groups[0])
  const orgReceipt = msh6IsOurOrg(firstSummary.receivingFacility)
  const provider = orgReceipt
    ? null
    : await matchProvider(supabase, firstSummary.receivingFacility, firstSummary.receivingApp)

  // Which upstream mTLS proxy sent this? Set by the CF Worker / Fly proxy via
  // a header — 'nz-test' from the *-test proxy, 'nz-prod' from the prod proxy.
  // Naming pattern is <country>-<prod|test> so AU/US expansion drops in without
  // a migration. Defaults to 'nz-prod' for back-compat if header is missing.
  // Downstream auto-filing to patient charts (when built) MUST filter to env
  // in the *-prod set to avoid test messages polluting real patient records.
  // Scoped BEFORE supersede queries so a prod message with a colliding OBR-3.1
  // cannot swallow a test message and vice versa.
  const rawEnv = String(req.headers['x-tere-env'] || 'nz-prod').toLowerCase()
  const receivedEnv = /^[a-z]{2,3}-(prod|test)$/.test(rawEnv) ? rawEnv : 'nz-prod'

  // Message-level validation: MSH-10 + MSH-9 apply once. Missing means the
  // whole message is rejected (nothing to persist per-report either).
  const messageMissing = []
  if (!firstSummary.controlId)   messageMissing.push('MSH-10')
  if (!firstSummary.messageType) messageMissing.push('MSH-9')
  if (!provider && !orgReceipt)  messageMissing.push('receiver-not-registered')
  if (messageMissing.length) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    return res.status(200).send(buildAck({
      inbound: parsed,
      msaCode: 'AR',
      errorText: messageMissing[0] === 'receiver-not-registered'
        ? `Receiver not registered with Tere Health (${firstSummary.receivingApp || '?'}/${firstSummary.receivingFacility || '?'})`
        : `Missing required fields: ${messageMissing.join(', ')}`,
    }))
  }

  // Per-report insert loop. Each patient in the batch gets its own row keyed
  // by (msh_10_control_id, batch_position, env, msh_4_sending_facility).
  const rawMessage = raw.slice(0, MAX_BODY_BYTES)
  const nowIso = new Date().toISOString()
  const perReportResults = []

  for (let batchPosition = 0; batchPosition < groups.length; batchPosition++) {
    const group = groups[batchPosition]
    const summary = extractSummary(parsed, group)
    const patientMatch = await matchPatient(supabase, summary.patient)

    // Per-report validation: PID-5.1 (patient last name). If missing on THIS
    // report, mark it needs_review but keep going — other reports may be fine.
    let status, ackErrorText
    if (!summary.patient.lastName) {
      status = 'needs_review'
      ackErrorText = 'Missing PID-5.1 (patient last name)'
    } else {
      status = patientMatch.match ? 'received' : 'needs_review'
      ackErrorText = null
    }

    // Update handling — same OBR-3.1 supersedes prior message from same sender
    // WITHIN THE SAME ENV. Cross-env supersede would silently mix test + prod
    // provenance, defeating the separation Medical-Objects requires.
    let supersedesId = null
    if (summary.order.obr3_1) {
      const { data: prior } = await supabase
        .from('inbound_hl7_messages')
        .select('id')
        .eq('obr_3_1_filler_order', summary.order.obr3_1)
        .eq('msh_4_sending_facility', summary.sendingFacility || '')
        .eq('env', receivedEnv)
        .is('superseded_by_id', null)
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (prior) supersedesId = prior.id
    }

    // Auto-file on strong NHI match: PID-3 hit an existing patients row,
    // so this report unambiguously belongs to that patient. Set filing
    // metadata at receive time so it appears on the chart immediately
    // — no manual "File to chart" click needed for routine lab/imaging.
    // filed_by_provider_id stays NULL to signal system-filed vs manual.
    // Weaker matches (name+DOB only, or no match) sit in the inbox
    // needs_review queue for provider disposition.
    const autoFile = patientMatch.confidence === 'strong' && patientMatch.match?.id
    const filedToPatientId = autoFile ? patientMatch.match.id : null
    const filedAt          = autoFile ? nowIso : null

    const insertRow = {
      env:                      receivedEnv,
      batch_position:           batchPosition,
      msh_10_control_id:        summary.controlId,
      msh_9_message_type:       summary.messageType,
      msh_9_event:              summary.messageType.split('^')[1] || null,
      msh_12_version:           summary.version,
      msh_4_sending_facility:   summary.sendingFacility,
      msh_5_receiving_app:      summary.receivingApp,
      msh_6_receiving_facility: summary.receivingFacility,
      msh_7_datetime:           parseHl7Datetime(field(msh, 7)),
      patient_pid_3:            summary.patient.pid3,
      patient_first_name:       summary.patient.firstName,
      patient_last_name:        summary.patient.lastName,
      patient_middle_name:      summary.patient.middleName,
      patient_dob:              summary.patient.dob,
      patient_sex:              summary.patient.sex,
      obr_3_1_filler_order:     summary.order.obr3_1 || null,
      obr_4_service_id:         summary.order.obr4 || null,
      matched_provider_id:      provider?.id || null,
      matched_patient_id:       patientMatch.match?.id || null,
      match_confidence:         patientMatch.confidence,
      filed_to_patient_id:      filedToPatientId,
      filed_at:                 filedAt,
      filed_by_provider_id:     null,          // system-filed (NULL = auto)
      raw_message:              rawMessage,
      parsed_summary:           summary,
      has_pdf:                  summary.obx.some(o => o.valueType === 'ED'),
      supersedes_id:            supersedesId,
      ack_msa_1:                'AA',
      ack_msa_3_error:          ackErrorText,
      ack_returned_at:          nowIso,
      status,
    }

    // Upsert on the composite idempotency key — retries of the same message
    // update the existing row rather than duplicating.
    const { data: msg, error: insErr } = await supabase
      .from('inbound_hl7_messages')
      .upsert(insertRow, { onConflict: 'msh_10_control_id,batch_position,env,msh_4_sending_facility' })
      .select('id')
      .maybeSingle()
    if (insErr) {
      console.error('[hl7-inbound] insert failed:', insErr.message, 'batch_position=', batchPosition)
      perReportResults.push({ batchPosition, ok: false, error: insErr.message })
      continue
    }

    if (supersedesId) {
      await supabase
        .from('inbound_hl7_messages')
        .update({ superseded_by_id: msg.id })
        .eq('id', supersedesId)
    }

    if (insertRow.has_pdf) {
      try { await extractAndStorePdfs(supabase, msg.id, parsed, group.obxes) }
      catch (e) { console.error('[hl7-inbound] pdf extract failed:', e.message, 'batch_position=', batchPosition) }
    }

    perReportResults.push({ batchPosition, ok: true, msgId: msg.id })
  }

  // Message-level ACK: AA if at least one row landed. If EVERY report failed
  // to insert (unusual — probably a DB outage), return AE so MO retries.
  const allFailed = perReportResults.every(r => !r.ok)
  const anyFailed = perReportResults.some(r => !r.ok)
  const msaCode = allFailed ? 'AE' : 'AA'
  const errorText = allFailed
    ? 'Internal storage error on all reports'
    : anyFailed
      ? `Partial: ${perReportResults.filter(r => !r.ok).length}/${perReportResults.length} reports failed to persist`
      : null

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  return res.status(200).send(buildAck({ inbound: parsed, msaCode, errorText }))
}

export const config = { api: { bodyParser: false } }
