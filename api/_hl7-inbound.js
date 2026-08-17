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
  return String(raw).replace(/\r\n?/g, '\n').split('\n').filter(s => s.length > 0)
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

function parseMessage(raw) {
  const segments = normaliseSegments(raw)
  if (!segments.length || !segments[0].startsWith('MSH')) {
    throw new Error('Not an HL7 v2 message — missing MSH segment')
  }
  const sep = readSeparators(segments[0])
  const parsed = { segments: [], separators: sep }
  for (const line of segments) {
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
  // Swap sender/receiver: MSH-3/4 become MSH-5/6 of the ack, and vice versa.
  const origSendingApp   = field(msh, 3)
  const origSendingFac   = field(msh, 4)
  const origReceivingApp = field(msh, 5)
  const origReceivingFac = field(msh, 6)
  const origControlId    = field(msh, 10)
  const processingId     = field(msh, 11) || 'P'
  const version          = field(msh, 12) || '2.4'
  // MSH-10 of the ack MUST NOT equal MSA-2 of the ack (per checklist).
  // Use a random control id.
  const ackControlId = crypto.randomBytes(8).toString('hex').toUpperCase()

  const encChars = `${sep.componentSep}${sep.repetitionSep}${sep.escapeChar}${sep.subComponentSep}`
  const mshOut = [
    'MSH', encChars,
    origReceivingApp, origReceivingFac,
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

function extractSummary(parsed) {
  const msh = segment(parsed, 'MSH')
  const pid = segment(parsed, 'PID')
  const obr = segment(parsed, 'OBR')
  const obxes = segments(parsed, 'OBX')
  const ntes = segments(parsed, 'NTE')

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
    },
    obx: obxes.map(o => ({
      idx:      Number(field(o, 1)) || 0,
      valueType: field(o, 2),
      identifier: field(o, 3),
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

async function extractAndStorePdfs(supabase, messageId, parsed) {
  // OBX with ED (encapsulated data) type of ^PDF^Base64^<data> is the
  // common variant. See Medical-Objects "How to determine a PDF OBX".
  const obxes = segments(parsed, 'OBX')
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
  // If Vercel already parsed the body as JSON we'd lose delimiters. We only
  // trust text/plain or application/hl7-v2 — anything else is rejected.
  if (typeof req.body === 'string' && req.body.length) return req.body
  // Vercel exposes the raw stream for non-JSON content types.
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) throw new Error(`Message exceeds ${MAX_BODY_BYTES} bytes`)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

// ─── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).send('Method not allowed')
  }

  // Shared secret from upstream mTLS proxy. Absence = reject silently (200).
  const bridgeSecret = process.env.HL7_BRIDGE_SECRET
  const supplied = req.headers['x-tere-bridge-secret']
  if (!bridgeSecret || !supplied ||
      !crypto.timingSafeEqual(Buffer.from(String(supplied)), Buffer.from(bridgeSecret))) {
    // Log and reject as HL7 ack (Capricorn will retry — that's fine while we
    // debug the proxy config; better than a 401 that trips their alarms).
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    return res.status(200).send('MSH|^~\\&|TERE|TERE|UNKNOWN|UNKNOWN|20250101000000||ACK|00000000|P|2.4\rMSA|CR|UNKNOWN|Auth failed\r')
  }

  let raw
  try {
    raw = await readRawBody(req)
  } catch (e) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    return res.status(200).send(`MSH|^~\\&|TERE|TERE|UNKNOWN|UNKNOWN|20250101000000||ACK|00000000|P|2.4\rMSA|CR|UNKNOWN|${e.message}\r`)
  }
  if (!raw || !raw.trim()) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    return res.status(200).send('MSH|^~\\&|TERE|TERE|UNKNOWN|UNKNOWN|20250101000000||ACK|00000000|P|2.4\rMSA|CR|UNKNOWN|Empty body\r')
  }

  let parsed
  try {
    parsed = parseMessage(raw)
  } catch (e) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    return res.status(200).send(`MSH|^~\\&|TERE|TERE|UNKNOWN|UNKNOWN|20250101000000||ACK|00000000|P|2.4\rMSA|CR|UNKNOWN|${e.message}\r`)
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
  const summary = extractSummary(parsed)

  // Receiver match. Two acceptable shapes:
  //   1. MSH-6 = our HPI-O (org-level receipt — Medical-Objects routes the
  //      whole org, no provider identifier in the envelope). matched_provider_id
  //      stays null; provider ownership is inferred later from OBR-16 /
  //      PV1-7.1 (TODO once we see real production shapes).
  //   2. MSH-5/6 = a specific provider's HPI-CPN / hpi_number.
  const orgReceipt = msh6IsOurOrg(summary.receivingFacility)
  const provider = orgReceipt
    ? null
    : await matchProvider(supabase, summary.receivingFacility, summary.receivingApp)
  const patientMatch = await matchPatient(supabase, summary.patient)

  const requiredMissing = []
  if (!summary.controlId)         requiredMissing.push('MSH-10')
  if (!summary.patient.lastName)  requiredMissing.push('PID-5.1')
  if (!summary.messageType)       requiredMissing.push('MSH-9')

  let msaCode, errorText, status
  if (requiredMissing.length) {
    msaCode = 'CR'
    errorText = `Missing required fields: ${requiredMissing.join(', ')}`
    status = 'rejected'
  } else if (!provider && !orgReceipt) {
    msaCode = 'CR'
    errorText = `Receiver not registered with Tere Health (${summary.receivingApp || '?'}/${summary.receivingFacility || '?'})`
    status = 'rejected'
  } else {
    msaCode = 'CA'
    errorText = null
    status = patientMatch.match ? 'received' : 'needs_review'
  }

  // Update handling — same OBR-3.1 supersedes prior message from same sender.
  let supersedesId = null
  if (msaCode === 'CA' && summary.order.obr3_1) {
    const { data: prior } = await supabase
      .from('inbound_hl7_messages')
      .select('id')
      .eq('obr_3_1_filler_order', summary.order.obr3_1)
      .eq('msh_4_sending_facility', summary.sendingFacility || '')
      .is('superseded_by_id', null)
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (prior) supersedesId = prior.id
  }

  const insertRow = {
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
    raw_message:              raw.slice(0, MAX_BODY_BYTES),
    parsed_summary:           summary,
    has_pdf:                  summary.obx.some(o => o.valueType === 'ED'),
    supersedes_id:            supersedesId,
    ack_msa_1:                msaCode,
    ack_msa_3_error:          errorText,
    ack_returned_at:          new Date().toISOString(),
    status,
  }

  const { data: msg, error: insErr } = await supabase
    .from('inbound_hl7_messages')
    .insert(insertRow)
    .select('id')
    .maybeSingle()
  if (insErr) {
    console.error('[hl7-inbound] insert failed:', insErr.message)
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    return res.status(200).send(buildAck({ inbound: parsed, msaCode: 'CE', errorText: 'Internal storage error' }))
  }

  // Mark the prior row as superseded so the UI only shows the latest.
  if (supersedesId) {
    await supabase
      .from('inbound_hl7_messages')
      .update({ superseded_by_id: msg.id })
      .eq('id', supersedesId)
  }

  // Extract + store any PDF attachments (best-effort).
  if (msaCode === 'CA' && insertRow.has_pdf) {
    try { await extractAndStorePdfs(supabase, msg.id, parsed) }
    catch (e) { console.error('[hl7-inbound] pdf extract failed:', e.message) }
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  return res.status(200).send(buildAck({ inbound: parsed, msaCode, errorText }))
}

export const config = { api: { bodyParser: false } }
