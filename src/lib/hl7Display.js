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
export function formatHl7Datetime(s) {
  if (!s) return null
  const clean = String(s).replace(/[^\d]/g, '').slice(0, 14)
  if (clean.length < 8) return null
  const y = clean.slice(0, 4), mo = clean.slice(4, 6), d = clean.slice(6, 8)
  if (clean.length < 12) return `${d}/${mo}/${y}`
  const hr = clean.slice(8, 10), mi = clean.slice(10, 12)
  return `${d}/${mo}/${y} ${hr}:${mi}`
}

// Extract display fields from raw HL7. Handles pipe-delimited v2.1 through
// v2.5 uniformly — we only touch fields our UI needs (MSH-7, OBR-4/6/7/25,
// OBX rows, NTE per-line). Batch wrappers (FHS/BHS/BTS/FTS) are skipped
// exactly as the backend parser does.
export function parseHl7Display(raw) {
  const empty = {
    obr4_1: '', obr4_2: '', obr4Label: '',
    corrected: false,
    dates: { generated: null, requested: null, observation: null },
    obxRows: [],
    notesLines: [],
    isLit: false,
    litText: null,
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
    return {
      idx:        Number(f[1]) || 0,
      valueType:  (f[2] || '').toUpperCase(),
      identifier: identRaw,
      identLabel: identParts[1] || identParts[0] || '',
      value:      f[5] || '',
      units:      f[6] || '',
      refRange:   f[7] || '',
      abnormal:   f[8] || '',
    }
  })

  const notesLines = nteSegs.map(line => {
    const f = line.split('|')
    return decodeHl7Escapes(f[3] || '')
  }).filter(Boolean)

  // For LIT (referral copy / rendered report), the FT/TX observation and the
  // ED (PDF) observation are two representations of the SAME content per HL7
  // standard. Extract the FT text as the primary display; the PDF stays as an
  // attachment. Otherwise the FT text with `\.br\` escapes shows as a huge
  // single cell in the OBX table which is unreadable.
  let litText = null
  if (isLit) {
    const textObx = obxRows.find(o => o.valueType === 'FT' || o.valueType === 'TX')
    if (textObx) litText = decodeHl7Escapes(textObx.value)
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
    notesLines,
    isLit,
    litText,
  }
}
