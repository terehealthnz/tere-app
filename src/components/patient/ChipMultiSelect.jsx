import React, { useState, useMemo } from 'react'

// Reusable chip picker used inside AITriage for medications (NZF-backed),
// allergies (curated list), and medical history (curated list). Patient
// searches, clicks to add chips, can type anything not on the list into a
// free-text fallback. Submits a single comma-separated string so the
// existing free-text schema and provider chart continue to work unchanged.
//
// Props:
//   options    : Array<{ id: string, label: string }>
//   value      : current comma-separated string (or 'None')
//   onChange   : (nextStr) => void
//   onSubmit   : () => void    — fires when patient clicks Continue
//   placeholder: string        — search input placeholder
//   noneLabel  : string        — "None"-style button label (nullable)
//   labels     : { continueBtn, change, noMatch, freetextLabel, freetextPh }
//                — translated UI strings from the caller (i18n at call site)
export default function ChipMultiSelect({ options, value, onChange, onSubmit, placeholder, noneLabel, labels = {} }) {
  const L = {
    continueBtn:   labels.continueBtn   || 'Continue →',
    change:        labels.change        || 'Change',
    noMatch:       labels.noMatch       || 'Nothing matched. Add it below as free-text.',
    freetextLabel: labels.freetextLabel || 'Anything not in the list:',
    freetextPh:    labels.freetextPh    || 'Type here, separate with commas',
  }
  const [q, setQ] = useState('')

  // Parse the comma-separated value into (selected, custom-freetext-remainder).
  // Case-insensitive lookup against options so "PARACETAMOL" and "Paracetamol"
  // collapse to the same chip.
  const parsed = useMemo(() => {
    if (!value || !value.trim() || value.trim().toLowerCase() === 'none') {
      return { selected: [], custom: '' }
    }
    const parts = value.split(',').map(s => s.trim()).filter(Boolean)
    const selectedLabels = []
    const customParts = []
    const optIndex = new Map(options.map(o => [o.label.toLowerCase(), o.label]))
    for (const p of parts) {
      const canonical = optIndex.get(p.toLowerCase())
      if (canonical && !selectedLabels.includes(canonical)) selectedLabels.push(canonical)
      else if (!canonical) customParts.push(p)
    }
    return { selected: selectedLabels, custom: customParts.join(', ') }
  }, [value, options])

  const results = useMemo(() => {
    if (q.trim().length < 2) return []
    const qLow = q.trim().toLowerCase()
    const selectedSet = new Set(parsed.selected)
    return options
      .filter(o => o.label.toLowerCase().includes(qLow) && !selectedSet.has(o.label))
      .slice(0, 12)
  }, [q, options, parsed.selected])

  function reformat(nextSelected, nextCustom) {
    const parts = [...nextSelected]
    if (nextCustom.trim()) parts.push(...nextCustom.split(',').map(s => s.trim()).filter(Boolean))
    onChange(parts.join(', '))
  }

  function addChip(label) {
    if (parsed.selected.includes(label)) return
    reformat([...parsed.selected, label], parsed.custom)
    setQ('')
  }
  function removeChip(label) {
    reformat(parsed.selected.filter(l => l !== label), parsed.custom)
  }

  const isNone = value && value.trim().toLowerCase() === 'none'
  const empty  = !parsed.selected.length && !parsed.custom && !isNone

  return (
    <div style={{ padding: '0 1rem .5rem', maxWidth: 600, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      {/* One-tap "None" shortcut for the common case */}
      {noneLabel && empty && (
        <button
          onClick={() => { onChange('None'); setTimeout(onSubmit, 40) }}
          style={{ width: '100%', padding: '12px', marginBottom: 10, background: 'white', border: '1.5px solid var(--teal)', color: 'var(--teal)', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.9rem' }}>
          {noneLabel}
        </button>
      )}

      {isNone && (
        <div style={{ padding: '10px 12px', background: '#F0F9FA', border: '1px solid #C7EAEC', borderRadius: 8, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '.85rem', color: 'var(--teal)', fontWeight: 600 }}>{noneLabel || 'None'}</span>
          <button onClick={() => onChange('')} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '.75rem', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>
            {L.change}
          </button>
        </div>
      )}

      {/* Selected chips */}
      {parsed.selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {parsed.selected.map(label => (
            <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 8px 5px 12px', background: 'var(--teal)', color: 'white', borderRadius: 99, fontSize: '.8125rem', fontWeight: 600 }}>
              {label}
              <button onClick={() => removeChip(label)} aria-label={`Remove ${label}`}
                style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: 0, fontSize: '1.15rem', lineHeight: .8, width: 18, height: 18 }}>×</button>
            </span>
          ))}
        </div>
      )}

      {!isNone && (
        <>
          {/* Search input */}
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={placeholder}
            autoCorrect="off" autoCapitalize="none" spellCheck="false"
            style={{ width: '100%', padding: '.75rem 1rem', border: '1.5px solid var(--border)', borderRadius: 12, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.95rem', outline: 'none', boxSizing: 'border-box', marginBottom: 8 }}
          />

          {/* Search-result chips */}
          {results.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {results.map(o => (
                <button key={o.id} onClick={() => addChip(o.label)}
                  style={{ padding: '6px 12px', background: '#F0F9FA', color: 'var(--teal)', border: '1px solid #C7EAEC', borderRadius: 99, fontSize: '.8125rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  + {o.label}
                </button>
              ))}
            </div>
          )}
          {q.trim().length >= 2 && results.length === 0 && (
            <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginBottom: 10, fontStyle: 'italic' }}>
              {L.noMatch}
            </div>
          )}

          {/* Free-text fallback */}
          <div style={{ marginTop: 4 }}>
            <label style={{ fontSize: '.75rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
              {L.freetextLabel}
            </label>
            <input
              type="text"
              value={parsed.custom}
              onChange={e => reformat(parsed.selected, e.target.value)}
              placeholder={L.freetextPh}
              autoCorrect="off" autoCapitalize="none" spellCheck="false"
              style={{ width: '100%', padding: '.6rem .8rem', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.9rem', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </>
      )}

      {/* Continue */}
      <button
        onClick={onSubmit}
        disabled={empty && !isNone}
        style={{ width: '100%', marginTop: 12, padding: '12px', background: (empty && !isNone) ? '#E2E8F0' : 'var(--teal)', color: (empty && !isNone) ? '#94A3B8' : 'white', border: 'none', borderRadius: 10, fontWeight: 700, cursor: (empty && !isNone) ? 'not-allowed' : 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.95rem' }}>
        {L.continueBtn}
      </button>
    </div>
  )
}
