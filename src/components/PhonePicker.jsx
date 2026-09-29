// Two-part phone input: country dropdown + local number field.
//
// Emits E.164 (e.g. "+64212345678") to onChange so downstream code
// (SMS, ACC lodgement, HPI, notes) always sees a consistently
// formatted number regardless of how the patient typed it. NZ is
// pinned to the top because 99% of triage traffic is NZ residents.
// Pasifika + tourist origins next, then a curated common set — no
// point loading 250 obscure countries when 99% won't be picked.
//
// Handles patient-typed leading "0" (common in NZ mobiles: "0212345678")
// by stripping it before joining to the country code, so both
// "021 234 5678" and "+64 21 234 5678" and "21 234 5678" all
// normalise to "+64212345678".

import React from 'react'

// NZ first (default), then curated common source countries. Ordered
// by likely-use for our patient base, not alphabetically. Trailing
// section is alphabetical by common name so a patient scanning for
// their country can eyeball-scan quickly.
const COUNTRIES = [
  { code: 'NZ', name: 'New Zealand',        dial: '+64', flag: '🇳🇿' },
  { code: 'AU', name: 'Australia',          dial: '+61', flag: '🇦🇺' },
  { code: 'GB', name: 'United Kingdom',     dial: '+44', flag: '🇬🇧' },
  { code: 'US', name: 'United States',      dial: '+1',  flag: '🇺🇸' },
  { code: 'FJ', name: 'Fiji',               dial: '+679', flag: '🇫🇯' },
  { code: 'WS', name: 'Samoa',              dial: '+685', flag: '🇼🇸' },
  { code: 'TO', name: 'Tonga',              dial: '+676', flag: '🇹🇴' },
  { code: 'CK', name: 'Cook Islands',       dial: '+682', flag: '🇨🇰' },
  { code: 'NU', name: 'Niue',               dial: '+683', flag: '🇳🇺' },
  { code: 'VU', name: 'Vanuatu',            dial: '+678', flag: '🇻🇺' },
  { code: 'SB', name: 'Solomon Islands',    dial: '+677', flag: '🇸🇧' },
  { code: 'PG', name: 'Papua New Guinea',   dial: '+675', flag: '🇵🇬' },
  { code: 'CA', name: 'Canada',             dial: '+1',   flag: '🇨🇦' },
  { code: 'IE', name: 'Ireland',            dial: '+353', flag: '🇮🇪' },
  { code: 'ZA', name: 'South Africa',       dial: '+27',  flag: '🇿🇦' },
  { code: 'IN', name: 'India',              dial: '+91',  flag: '🇮🇳' },
  { code: 'PH', name: 'Philippines',        dial: '+63',  flag: '🇵🇭' },
  { code: 'CN', name: 'China',              dial: '+86',  flag: '🇨🇳' },
  { code: 'HK', name: 'Hong Kong',          dial: '+852', flag: '🇭🇰' },
  { code: 'JP', name: 'Japan',              dial: '+81',  flag: '🇯🇵' },
  { code: 'KR', name: 'South Korea',        dial: '+82',  flag: '🇰🇷' },
  { code: 'DE', name: 'Germany',            dial: '+49',  flag: '🇩🇪' },
  { code: 'FR', name: 'France',             dial: '+33',  flag: '🇫🇷' },
  { code: 'NL', name: 'Netherlands',        dial: '+31',  flag: '🇳🇱' },
  { code: 'BR', name: 'Brazil',             dial: '+55',  flag: '🇧🇷' },
]

// Strip everything except digits, then drop a single leading 0
// (common NZ mobile format the patient may type by habit).
function normaliseLocal(raw) {
  const digits = String(raw || '').replace(/[^\d]/g, '')
  return digits.startsWith('0') ? digits.slice(1) : digits
}

// Split an existing E.164 back into (dial, local) so the picker
// re-hydrates correctly on step navigation. If we can't identify
// the dial code, fall back to NZ + whole string.
function splitE164(value) {
  if (!value || typeof value !== 'string') return { dial: '+64', local: '' }
  const v = value.trim()
  if (!v.startsWith('+')) return { dial: '+64', local: normaliseLocal(v) }
  // Try longest match against known dial codes (so +679 wins over +67...).
  const dials = [...new Set(COUNTRIES.map(c => c.dial))].sort((a, b) => b.length - a.length)
  for (const d of dials) {
    if (v.startsWith(d)) return { dial: d, local: v.slice(d.length).replace(/[^\d]/g, '') }
  }
  return { dial: '+64', local: v.replace(/[^\d]/g, '') }
}

export default function PhonePicker({ value, onChange }) {
  const initial = splitE164(value)
  const [dial, setDial] = React.useState(initial.dial)
  const [local, setLocal] = React.useState(initial.local)

  // Emit E.164 upstream whenever either half changes. Empty local
  // emits '' so the step's own validate() gate keeps working.
  const emit = (d, l) => {
    const clean = normaliseLocal(l)
    onChange(clean ? `${d}${clean}` : '')
  }

  const selectStyle = { padding: '.6rem .75rem', border: '1.5px solid var(--border)', borderRadius: 8, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.95rem', background: 'white', minWidth: 130 }
  const inputStyle  = { flex: 1, padding: '.6rem .75rem', border: '1.5px solid var(--border)', borderRadius: 8, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.95rem', minWidth: 0 }

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <select
        value={dial}
        onChange={e => { const d = e.target.value; setDial(d); emit(d, local) }}
        style={selectStyle}
        aria-label="Country dial code"
      >
        {COUNTRIES.map(c => (
          <option key={c.code} value={c.dial}>{c.flag} {c.name} ({c.dial})</option>
        ))}
      </select>
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={local}
        onChange={e => { const l = e.target.value; setLocal(l); emit(dial, l) }}
        placeholder={dial === '+64' ? '21 234 5678' : 'Phone number'}
        style={inputStyle}
        aria-label="Phone number"
      />
    </div>
  )
}
