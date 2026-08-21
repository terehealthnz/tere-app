// Display-only HL7 v2 parser for the inbox renderer.
//
// Complements the server-side parser in api/_hl7-inbound.js — we re-parse the
// raw message on the client (or in the screenshot script) to pull display
// fields Tony Cruice at Medical-Objects asked for after reviewing the first
// pass on 2026-08-19 (case #1058382). Doing it client-side avoids a backfill
// migration for the two existing test messages whose parsed_summary was
// captured before these fields were extracted.
//
// This is intentionally small — we only pull what the UI shows, not a full
// parse. The authoritative parse still lives in the backend.

// Decode standard HL7 v2 escape sequences that carry formatting inside FT/TX
// observations. `\.br\` is the newline; other escapes come up rarely but we
// decode the standard set so text renders cleanly.
// HL7 uses `\H\` for start-highlight and `\N\` for return-to-normal — Trinity
// Windows renders these as bold. Return the emphasis markers as HTML tags so
// the calling renderer can wrap them (safe here because the surrounding value
// text is escaped separately before this runs).
export function decodeHl7Escapes(s) {
  return String(s || '')
    .replace(/\\\.br\\/g, '\n')
    .replace(/\\\.sp\+?\d*\\/g, '\n')
    .replace(/\\H\\/g, '__HL7BOLD_START__')
    .replace(/\\N\\/g, '__HL7BOLD_END__')
    .replace(/\\F\\/g, '|')
    .replace(/\\S\\/g, '^')
    .replace(/\\R\\/g, '~')
    .replace(/\\T\\/g, '&')
    .replace(/\\E\\/g, '\\')
}

// After HTML-escaping the display value, swap the sentinel markers for real
// <strong> tags. Callers that render plain text (no HTML) can skip this and
// the sentinels will just show as raw underscores — obvious debugging cue.
export function applyHl7EmphasisTags(escapedHtml) {
  return String(escapedHtml || '')
    .replace(/__HL7BOLD_START__/g, '<strong>')
    .replace(/__HL7BOLD_END__/g, '</strong>')
}

// HL7 datetime → dd/mm/yyyy [hh:mm]. Matches the Trinity Windows convention
// Tony showed in his screenshots so our render lines up alongside theirs.
// Also accepts ISO strings (the server already stores parsed_summary dates
// as ISO via parseHl7Datetime in _hl7-inbound.js).
export function formatHl7Datetime(s) {
  if (!s) return null
  const str = String(s)
  // ISO 8601 (e.g. 2026-08-19T14:00:00Z) — parse via Date.
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    const d = new Date(str)
    if (isNaN(d)) return null
    const pad = n => String(n).padStart(2, '0')
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const clean = str.replace(/[^\d]/g, '').slice(0, 14)
  if (clean.length < 8) return null
  const y = clean.slice(0, 4), mo = clean.slice(4, 6), d = clean.slice(6, 8)
  if (clean.length < 12) return `${d}/${mo}/${y}`
  const hr = clean.slice(8, 10), mi = clean.slice(10, 12)
  return `${d}/${mo}/${y} ${hr}:${mi}`
}

// Numeric abnormality: value outside the OBX-7 reference range. Handles the
// common formats laboratories emit:
//   "130-175"   — inclusive min–max
//   "3.5-11.0"  — decimal min–max
//   ">4.0"      — lower bound only
//   "<10"       — upper bound only
// Non-numeric ranges (e.g. "Negative", "See report") return null → we don't
// second-guess textual results, we just trust OBX-8. Value strings that
// aren't parseable numbers also return null.
export function computeNumericAbnormal(valueStr, rangeStr) {
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

// Effective abnormal flag for a single OBX row.
//   1. Prefer OBX-8 as sent (HL7 v2.3.1 table 0078: L/H/LL/HH/A/AA/N/…).
//   2. If OBX-8 empty AND we can parse both value + range, derive L/H/N.
//   3. Otherwise null (unknown).
// N or empty-after-derivation → normal; anything else → abnormal for the
// purposes of the top-of-report ABNORMAL indicator.
export function effectiveAbnormal(obx) {
  const raw = String(obx?.abnormal || '').trim().toUpperCase()
  if (raw) return raw
  const derived = computeNumericAbnormal(obx?.value, obx?.refRange)
  return derived
}

export function isAbnormal(flag) {
  if (!flag) return false
  const f = String(flag).trim().toUpperCase()
  if (!f || f === 'N') return false
  return true
}

// Extract display fields for the inbox renderer.
//
// PRIMARY source is `parsedSummary` — the per-report summary the server built
// at receive time (api/_hl7-inbound.js `extractSummary`). For batched messages
// that were fanned out into multiple rows, this is the ONLY correct source —
// each DB row shares the same full raw_message, so re-parsing it always
// grabs the first PID/OBR. Regression noted by Tony Cruice 2026-08-20
// (case #1058382): "Dates are missing again for Requested, Effective and
// Generated" — root cause was patient #2+ falling into raw parse instead
// of per-report summary.
//
// FALLBACK to raw parsing for legacy rows (pre-fanout, no parsed_summary)
// and for the LIT PDF/FT extraction which needs the full OBX segment string.
export function parseHl7Display(raw, parsedSummary) {
  const empty = {
    obr4_1: '', obr4_2: '', obr4Label: '',
    corrected: false,
    dates: { generated: null, requested: null, observation: null },
    obxRows: [],
    notesText: '',
    isLit: false,
    litText: null,
    orderingName: '',
    orderingId: '',
    anyAbnormal: false,
  }
  // Preferred path: server-parsed per-report summary. Guaranteed to be the
  // right patient's OBR/OBX/NTE even when raw_message is the batched envelope.
  if (parsedSummary?.order && parsedSummary?.obx) {
    const o = parsedSummary.order || {}
    const obr4Raw = o.obr4 || ''
    const obr4_1 = o.obr4_1 || obr4Raw.split('^')[0] || ''
    const obr4_2 = o.obr4_2 || obr4Raw.split('^')[1] || ''
    const isLit = String(obr4_1).toUpperCase() === 'LIT'
    const obxRows = (parsedSummary.obx || []).map(x => {
      const identRaw = x.identifier || ''
      const identParts = identRaw.split('^')
      const subRaw = x.subId || ''
      const subParts = subRaw.split('^')
      const unitsRaw = x.units || ''
      const unitsParts = unitsRaw.split('^')
      const valueType = String(x.valueType || '').toUpperCase()
      const rawValue = x.value || ''
      // Decode escapes for FT / TX formatted-text observations so \.br\
      // renders as a newline instead of raw backslash-dot-br-backslash.
      // Per HL7 v2 datatype 3.13 (Tony Cruice 2026-08-20).
      const value = (valueType === 'FT' || valueType === 'TX')
        ? decodeHl7Escapes(rawValue)
        : rawValue
      return {
        idx:        Number(x.idx) || 0,
        valueType,
        identifier: identRaw,
        identLabel: identParts[1] || identParts[0] || '',
        subId:      subRaw,
        subLabel:   subParts[1] || subParts[0] || '',
        value,
        rawValue,
        units:      unitsRaw,
        unitsLabel: unitsParts[1] || unitsParts[0] || '',
        refRange:   x.refRange || '',
        abnormal:   x.abnormal || '',
      }
    })
    // Compute per-row effective abnormal + a top-level any-abnormal flag,
    // so the header can show one ABNORMAL pill that matches how Trinity
    // Windows summarises a report.
    obxRows.forEach(row => { row.effectiveAbnormal = effectiveAbnormal(row) })
    const anyAbnormal = obxRows.some(r => isAbnormal(r.effectiveAbnormal))
    let litText = null
    if (isLit) {
      const textObx = obxRows.find(r => r.valueType === 'FT' || r.valueType === 'TX')
      if (textObx) litText = textObx.value  // already decoded above
    }
    // Notes: server stores each NTE segment's field(3) as an entry in the
    // `notes` array. Concatenate + decode escapes so downstream renders a
    // single continuous text block rather than one bordered card per NTE
    // (Tony Cruice 2026-08-20 point 5: "NTE segments visible boundary again").
    const notesText = (parsedSummary.notes || [])
      .map(n => decodeHl7Escapes(n))
      .join('\n')
    return {
      obr4_1, obr4_2,
      obr4Label: obr4_2 || obr4_1 || obr4Raw,
      corrected: !!o.corrected,
      dates: {
        generated:   formatHl7Datetime(o.generatedDate),
        requested:   formatHl7Datetime(o.requestedDate),
        observation: formatHl7Datetime(o.observationDate),
      },
      orderingName: '',
      orderingId:   '',
      obxRows,
      notesText,
      isLit,
      litText,
      anyAbnormal,
    }
  }
  if (!raw) return empty

  const segments = String(raw)
    .replace(/[\x00\x0B\x1C]/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter(l => l.trim())
    .filter(s => !/^(FHS|BHS|BTS|FTS)/.test(s))

  const findAll = name => segments.filter(s => s.startsWith(name + '|'))
  const findSeg = name => findAll(name)[0]

  const msh = findSeg('MSH')
  const obr = findSeg('OBR')
  const obxSegs = findAll('OBX')
  const nteSegs = findAll('NTE')

  const mshFields = msh ? msh.split('|') : []
  const obrFields = obr ? obr.split('|') : []

  // MSH is special: MSH-1 IS the field separator, MSH-2 IS the encoding chars.
  // After split('|'): [0]='MSH', [1]='^~\&', [2]=sending app (MSH-3), [3]=fac
  // (MSH-4), [4]=recv app (MSH-5), [5]=recv fac (MSH-6), [6]=datetime (MSH-7).
  const mshDatetime = mshFields[6]

  // Non-MSH segments split cleanly: field N is fields[N]. OBR-4 = fields[4],
  // OBR-7 = observation date, OBR-25 = result status, OBR-22 = report status
  // change date/time.
  //
  // Per Medical-Objects (Tony Cruice, case #1058382, 2026-08-19), the HL7
  // "expected" mapping is:
  //   Requested date  — OBR-27.4 (Q/T Start Date/Time), fallback OBR-6
  //   Effective/exam  — OBR-7
  //   Generated date  — OBR-22 (results rpt/status change), fallback MSH-7
  //
  // OBR-27 is the Quantity/Timing field, structured as
  //   <quantity>^<interval>^<duration>^<start dt>^<end dt>^<priority>^<condition>
  // so component 4 (index 3) is the requested start date/time.
  const obr4Raw = obrFields[4] || ''
  const [obr4_1 = '', obr4_2 = ''] = obr4Raw.split('^')
  const obr27 = obrFields[27] || ''
  const obr27_4 = obr27.split('^')[3] || ''
  const requested = formatHl7Datetime(obr27_4) || formatHl7Datetime(obrFields[6])
  const observation = formatHl7Datetime(obrFields[7])
  const generated = formatHl7Datetime(obrFields[22]) || formatHl7Datetime(mshDatetime)
  const obr25 = (obrFields[25] || '').trim().toUpperCase()
  const corrected = obr25 === 'C'
  const isLit = obr4_1.toUpperCase() === 'LIT'

  // Ordering provider ("Referred By" in Trinity Windows). Spec says OBR-16 but
  // some v2.1 senders write it at OBR-15 — prefer 16, fall back to 15. Field
  // is XCN: ID^Family^Given^Middle^Suffix^Prefix^...  Repetitions via ~ (first
  // takes precedence). Format the display as "Prefix Given Family" so it
  // matches how a clinician would speak the referrer's name.
  const orderingRaw = (obrFields[16] || obrFields[15] || '').split('~')[0] || ''
  const oc = orderingRaw.split('^')
  const orderingName = [oc[5], oc[2], oc[1]].filter(Boolean).join(' ').trim()
  const orderingId = oc[0] || ''

  const obxRows = obxSegs.map(line => {
    const f = line.split('|')
    const identRaw = f[3] || ''
    const identParts = identRaw.split('^')
    // OBX-4 = Observation Sub-ID. For panel results (CBC differential,
    // urine dipstick multi-analyte, tumour marker groups) the main OBX-3
    // is the panel code (e.g. 4030^DIFFERENTIAL^L) and OBX-4 carries the
    // specific analyte (NEUS^Neut Seg, LYMP^Lymphocytes, etc.). Without
    // this, every row in a differential collapses to the same label.
    const subRaw = f[4] || ''
    const subParts = subRaw.split('^')
    const unitsRaw = f[6] || ''
    const unitsParts = unitsRaw.split('^')
    const valueType = (f[2] || '').toUpperCase()
    const rawValue = f[5] || ''
    const value = (valueType === 'FT' || valueType === 'TX')
      ? decodeHl7Escapes(rawValue)
      : rawValue
    const row = {
      idx:        Number(f[1]) || 0,
      valueType,
      identifier: identRaw,
      identLabel: identParts[1] || identParts[0] || '',
      subId:      subRaw,
      subLabel:   subParts[1] || subParts[0] || '',
      value,
      rawValue,
      units:      unitsRaw,
      unitsLabel: unitsParts[1] || unitsParts[0] || '',
      refRange:   f[7] || '',
      abnormal:   f[8] || '',
    }
    row.effectiveAbnormal = effectiveAbnormal(row)
    return row
  })
  const anyAbnormal = obxRows.some(r => isAbnormal(r.effectiveAbnormal))

  const notesText = nteSegs.map(line => {
    const f = line.split('|')
    return decodeHl7Escapes(f[3] || '')
  }).filter(Boolean).join('\n')

  // For LIT (referral copy / rendered report), the FT/TX observation and the
  // ED (PDF) observation are two representations of the SAME content per HL7
  // standard. Extract the FT text as the primary display; the PDF stays as an
  // attachment. Otherwise the FT text with `\.br\` escapes shows as a huge
  // single cell in the OBX table which is unreadable.
  let litText = null
  if (isLit) {
    const textObx = obxRows.find(o => o.valueType === 'FT' || o.valueType === 'TX')
    if (textObx) litText = textObx.value  // already decoded in row build above
  }

  return {
    obr4_1,
    obr4_2,
    obr4Label: obr4_2 || obr4_1 || obr4Raw,
    corrected,
    dates: { generated, requested, observation },
    orderingName,
    orderingId,
    obxRows,
    notesText,
    isLit,
    litText,
    anyAbnormal,
  }
}
