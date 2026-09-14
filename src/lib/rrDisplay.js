// Provider-side RR display policy.
//
// The rPPG pipeline (see MultiPassMeasurement._aggregate + fuseRR in
// src/lib/rppg.js) fuses three independent respiratory-rate sources
// (AM / FM / BW) and tags the aggregate with `rr_source` describing
// which sources agreed. This helper turns that tag into a provider-
// facing display tier so the vitals card, notes template, and any
// future consumer show a value proportional to our confidence in it.
//
// Physiological hard-clamp: values outside 10–24 bpm are suppressed
// regardless of fusion source. Genuine tachypnoea or bradypnoea can
// happen, but on outpatient rPPG scans those readings are almost
// always signal artefacts — better to show "—" than to have a
// provider anchor to a wrong number.
//
// Legacy handling: scans captured before the fusion work landed have
// no `rr_source` field. For those we show the raw rr value as-is (no
// downgrade) to avoid regressing historical display.

export function getRrDisplay(vitals) {
  if (!vitals || vitals.rr == null) {
    return { show: false, value: null, tier: 'none', caption: '' }
  }
  const rr = vitals.rr
  const src = vitals.rr_source

  // Physiological clamp — applies to fusion-era AND legacy readings.
  if (rr < 10 || rr > 24) {
    return { show: false, value: null, tier: 'clamped',
             caption: 'signal quality — reading out of physiological range' }
  }

  // Legacy pre-fusion scan (no rr_source metadata): show as-is.
  if (!src) return { show: true, value: rr, tier: 'legacy', caption: '' }

  // Fusion tiers
  if (src === 'am+fm+bw') return { show: true, value: rr, tier: 'high', caption: '' }
  if (src === 'am+fm' || src === 'am+bw' || src === 'fm+bw') {
    return { show: true, value: rr, tier: 'medium', caption: '2 of 3 signals agree' }
  }
  if (src === 'am-only' || src === 'fm-only' || src === 'bw-only') {
    const which = src.split('-')[0].toUpperCase()
    return { show: true, value: rr, tier: 'low', caption: `single source (${which}) — treat cautiously` }
  }
  // disagree2 / disagree3 / none — algorithm couldn't corroborate
  return { show: false, value: null, tier: 'suppressed',
           caption: 'signal quality — sources disagreed' }
}
