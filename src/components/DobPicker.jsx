// Three-field date-of-birth picker: Day, Month (named), Year.
//
// Why not a native <input type="date">? Health-platform patient
// identification is the single most locale-sensitive field we collect
// (MM/DD/YYYY vs DD/MM/YYYY sees the same digits parsed as two wildly
// different dates). Spelling out the month as a NAMED dropdown makes
// the field un-ambiguable regardless of the user's browser locale, and
// matches the pattern used by MyChart / Epic patient portals and every
// serious EHR intake form.
//
// Emits '' while incomplete, ISO 8601 (YYYY-MM-DD) when all three
// values are set — same shape the backend already expects. Drop-in
// replacement for <input type="date" value={dob} onChange={...} />.

import React from 'react'

const MONTHS = [
  { v: 1,  name: 'January' },
  { v: 2,  name: 'February' },
  { v: 3,  name: 'March' },
  { v: 4,  name: 'April' },
  { v: 5,  name: 'May' },
  { v: 6,  name: 'June' },
  { v: 7,  name: 'July' },
  { v: 8,  name: 'August' },
  { v: 9,  name: 'September' },
  { v: 10, name: 'October' },
  { v: 11, name: 'November' },
  { v: 12, name: 'December' },
]

// Days-per-month, leap-year aware.
function daysInMonth(month, year) {
  if (!month) return 31
  if (month === 2) {
    const y = Number(year)
    if (!y) return 29
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
    return leap ? 29 : 28
  }
  if ([4, 6, 9, 11].includes(month)) return 30
  return 31
}

function parseIso(value) {
  if (!value || typeof value !== 'string') return { d: '', m: '', y: '' }
  const m = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!m) return { d: '', m: '', y: '' }
  return { y: m[1], m: String(Number(m[2])), d: String(Number(m[3])) }
}

function toIso(d, m, y) {
  const dn = Number(d), mn = Number(m), yn = Number(y)
  if (!dn || !mn || !yn) return ''
  if (yn < 1900 || yn > new Date().getFullYear()) return ''
  if (mn < 1 || mn > 12) return ''
  if (dn < 1 || dn > daysInMonth(mn, yn)) return ''
  return `${String(yn).padStart(4, '0')}-${String(mn).padStart(2, '0')}-${String(dn).padStart(2, '0')}`
}

export default function DobPicker({
  value = '',
  onChange,
  disabled = false,
  required = false,
  id,
  style,               // outer wrapper style
  inputStyle,          // per-field style — day input + year input
  selectStyle,         // per-field style — month select
  minYear = 1900,
  maxYear,
  autoComplete = 'bday',
}) {
  const [d, setD] = React.useState('')
  const [m, setM] = React.useState('')
  const [y, setY] = React.useState('')

  // Sync from parent-controlled `value` prop. Only overwrites local
  // state when the incoming ISO differs from what we'd emit — prevents
  // fighting the user's typing.
  React.useEffect(() => {
    const p = parseIso(value)
    const currentIso = toIso(d, m, y)
    if (currentIso !== value) {
      setD(p.d); setM(p.m); setY(p.y)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function emit(nd, nm, ny) {
    setD(nd); setM(nm); setY(ny)
    onChange?.(toIso(nd, nm, ny))
  }

  const maxY = maxYear || new Date().getFullYear()
  const dayBase = {
    padding: '6px 8px',
    border: '1.5px solid #E2E8F0',
    borderRadius: 6,
    fontSize: '.9rem',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    width: '4.5em',
  }
  const monthBase = {
    padding: '6px 8px',
    border: '1.5px solid #E2E8F0',
    borderRadius: 6,
    fontSize: '.9rem',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    flex: 1,
    minWidth: '9em',
    background: 'white',
  }
  const yearBase = { ...dayBase, width: '5.5em' }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', ...(style || {}) }}>
      <input
        id={id ? `${id}-day` : undefined}
        type="number"
        inputMode="numeric"
        min={1}
        max={daysInMonth(Number(m), Number(y))}
        placeholder="DD"
        value={d}
        onChange={e => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 2)
          emit(v, m, y)
        }}
        disabled={disabled}
        required={required}
        aria-label="Day of birth"
        autoComplete={autoComplete === 'bday' ? 'bday-day' : undefined}
        style={{ ...dayBase, ...(inputStyle || {}) }}
      />
      <select
        id={id ? `${id}-month` : undefined}
        value={m}
        onChange={e => emit(d, e.target.value, y)}
        disabled={disabled}
        required={required}
        aria-label="Month of birth"
        autoComplete={autoComplete === 'bday' ? 'bday-month' : undefined}
        style={{ ...monthBase, ...(selectStyle || {}) }}
      >
        <option value="">Month…</option>
        {MONTHS.map(mo => (
          <option key={mo.v} value={mo.v}>{mo.name}</option>
        ))}
      </select>
      <input
        id={id ? `${id}-year` : undefined}
        type="number"
        inputMode="numeric"
        min={minYear}
        max={maxY}
        placeholder="YYYY"
        value={y}
        onChange={e => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 4)
          emit(d, m, v)
        }}
        disabled={disabled}
        required={required}
        aria-label="Year of birth"
        autoComplete={autoComplete === 'bday' ? 'bday-year' : undefined}
        style={{ ...yearBase, ...(inputStyle || {}) }}
      />
    </div>
  )
}
