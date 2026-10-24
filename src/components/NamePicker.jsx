// Two-field name input: First name + Last name.
//
// Why not a single free-text "Full name" input? Patients who type a single
// word (e.g. just "Callie") pass trivial length validation, which then
// cascades into: empty last_name on patients table, 400 on createPatient,
// patient_id = NULL on consultation, and Rx PDF rendering only the first
// name. The pharmacy phone call for Callie Moyo on 2026-10-24 is the
// anchor incident. A dedicated two-field picker — same shape as DobPicker
// — makes it structurally impossible to proceed with only one name token.
//
// Emits '' while incomplete and `${first} ${last}` (trimmed, single
// space) when both fields are populated. The caller (AITriage) stores it
// to `patient_name`, which existing downstream code splits on ' ' to
// extract first/last — so this is a drop-in replacement for the previous
// free-text input, no further wiring needed.

import React from 'react'

export default function NamePicker({
  value = '',
  onChange,
  disabled = false,
  required = false,
  id,
  style,          // outer wrapper
  inputStyle,     // per-field
  autoFocus = false,
}) {
  // Parse incoming "First Last" (or "First Middle Last") back into two
  // local-state fields. First token = first name, remainder = last name.
  const parse = (v) => {
    const parts = String(v || '').trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return { first: '', last: '' }
    if (parts.length === 1) return { first: parts[0], last: '' }
    return { first: parts[0], last: parts.slice(1).join(' ') }
  }

  const [first, setFirst] = React.useState('')
  const [last, setLast]   = React.useState('')
  const [firstTouched, setFirstTouched] = React.useState(false)
  const [lastTouched,  setLastTouched]  = React.useState(false)

  // Sync from parent-controlled `value`. Only overwrites local state when
  // the incoming string differs from what we'd emit — prevents fighting
  // the user's typing.
  React.useEffect(() => {
    const p = parse(value)
    const currentEmit = (first && last) ? `${first} ${last}`.trim() : ''
    if (currentEmit !== String(value || '').trim()) {
      setFirst(p.first); setLast(p.last)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function emit(nf, nl) {
    setFirst(nf); setLast(nl)
    const trimmedF = nf.trim()
    const trimmedL = nl.trim()
    onChange?.(trimmedF && trimmedL ? `${trimmedF} ${trimmedL}` : '')
  }

  // Amber highlight once the user has touched a field but left it empty.
  // Mirror of DobPicker's missing-field pattern. Keeps the Continue
  // button's greyed-out state from being a mystery.
  const firstMissing = firstTouched && !first.trim()
  const lastMissing  = lastTouched  && !last.trim()

  const baseField = {
    padding: '.6rem .75rem',
    borderRadius: 8,
    fontSize: '.95rem',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    flex: 1,
    minWidth: 0,
    ...(inputStyle || {}),
  }
  const firstStyle = { ...baseField, border: `1.5px solid ${firstMissing ? '#F59E0B' : 'var(--border)'}` }
  const lastStyle  = { ...baseField, border: `1.5px solid ${lastMissing  ? '#F59E0B' : 'var(--border)'}` }

  const missing = []
  if (firstMissing) missing.push('first name')
  if (lastMissing)  missing.push('last name')
  const hint = missing.length
    ? `Please enter your ${missing.join(' and ')} to continue.`
    : null

  return (
    <div style={style || undefined}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <input
          id={id ? `${id}-first` : undefined}
          type="text"
          value={first}
          onChange={e => emit(e.target.value, last)}
          onBlur={() => setFirstTouched(true)}
          placeholder="First name"
          autoComplete="given-name"
          autoCapitalize="words"
          autoCorrect="off"
          spellCheck="false"
          aria-label="First name"
          disabled={disabled}
          required={required}
          autoFocus={autoFocus}
          style={firstStyle}
        />
        <input
          id={id ? `${id}-last` : undefined}
          type="text"
          value={last}
          onChange={e => emit(first, e.target.value)}
          onBlur={() => setLastTouched(true)}
          placeholder="Last name"
          autoComplete="family-name"
          autoCapitalize="words"
          autoCorrect="off"
          spellCheck="false"
          aria-label="Last name"
          disabled={disabled}
          required={required}
          style={lastStyle}
        />
      </div>
      {hint && (
        <div style={{ marginTop: 6, fontSize: '.8rem', color: '#92400E', fontWeight: 600 }}>
          {hint}
        </div>
      )}
    </div>
  )
}
