// Adult abnormal-vital thresholds — single source of truth for the provider
// "please interpret this" workflow in ProviderNotes. Low-confidence values
// deliberately NOT flagged here (Patrick 2026-10-17): the red asterisk +
// hover tooltip on the vitals card already handles that signal; adding it
// as a close-time gate would over-trigger on noisy-but-normal scans.
//
// Thresholds chosen (Patrick 2026-10-17):
//   HR    < 50  or > 100  bpm
//   RR    < 12 or > 20   /min
//   SpO2  < 90          %         (NOT <95 — rPPG SpO2 is noisy in 90-94)
//   BP SBP < 90 or > 140
//   BP DBP < 60 or > 90
//
// Returns [{ key, label, value, reason }] — empty array if nothing abnormal.
// Caller gets a stable key per vital it can use to look up a persisted
// interpretation (vital_interpretations jsonb).

const VITAL_LABELS = {
  hr: 'HR',
  rr: 'RR',
  spo2: 'SpO₂',
  bp:  'BP',
}

export function abnormalVitals(vitals) {
  if (!vitals || vitals.skipped) return []
  const out = []
  const hr = Number(vitals.hr)
  if (Number.isFinite(hr) && hr > 0) {
    if (hr < 50)       out.push({ key:'hr', label:VITAL_LABELS.hr, value:`${hr} bpm`, reason:'bradycardia (<50)' })
    else if (hr > 100) out.push({ key:'hr', label:VITAL_LABELS.hr, value:`${hr} bpm`, reason:'tachycardia (>100)' })
  }
  const rr = Number(vitals.rr)
  if (Number.isFinite(rr) && rr > 0) {
    if (rr < 12)      out.push({ key:'rr', label:VITAL_LABELS.rr, value:`${rr}/min`, reason:'bradypnoea (<12)' })
    else if (rr > 20) out.push({ key:'rr', label:VITAL_LABELS.rr, value:`${rr}/min`, reason:'tachypnoea (>20)' })
  }
  const spo2 = Number(vitals.spo2)
  if (Number.isFinite(spo2) && spo2 > 0 && spo2 < 90) {
    out.push({ key:'spo2', label:VITAL_LABELS.spo2, value:`${spo2}%`, reason:'hypoxaemic (<90)' })
  }
  // BP shape: "sys/dia" string
  if (typeof vitals.bp === 'string' && vitals.bp.includes('/')) {
    const [sysStr, diaStr] = vitals.bp.split('/')
    const sys = Number(sysStr), dia = Number(diaStr)
    const sysBad = Number.isFinite(sys) && sys > 0 && (sys < 90 || sys > 140)
    const diaBad = Number.isFinite(dia) && dia > 0 && (dia < 60 || dia > 90)
    if (sysBad || diaBad) {
      const parts = []
      if (sysBad) parts.push(`SBP ${sys < 90 ? '<90' : '>140'} (${sys})`)
      if (diaBad) parts.push(`DBP ${dia < 60 ? '<60' : '>90'} (${dia})`)
      out.push({ key:'bp', label:VITAL_LABELS.bp, value:vitals.bp, reason:parts.join(' + ') })
    }
  }
  return out
}

// Interpretation status catalogue — shared with ProviderNotes UI + GP letter
// renderer so the status label (and the emoji/colour) stay consistent.
export const INTERPRETATION_STATUSES = [
  { key:'confirmed', label:'✓ Confirmed — acted on', short:'Confirmed, acted on', colour:'#059669' },
  { key:'artefact',  label:'⚠ Likely artefact',       short:'Likely artefact',      colour:'#D97706' },
  { key:'noted',     label:'○ Noted — no action',     short:'Noted, no action',     colour:'#6B7280' },
]

// Format one interpretation as a clinical note sentence. Used to append
// into the SOAP Assessment when the provider finalises. "SpO₂ 88% —
// likely artefact (patient asymptomatic, speaking in full sentences)."
export function interpretationSentence(abnormal, interpretation) {
  if (!abnormal || !interpretation?.status) return ''
  const statusLabel = (INTERPRETATION_STATUSES.find(s => s.key === interpretation.status) || {}).short
    || interpretation.status
  const reason = (interpretation.reason || '').trim()
  const reasonPart = reason ? ` (${reason})` : ''
  return `${abnormal.label} ${abnormal.value} — ${statusLabel}${reasonPart}.`
}
