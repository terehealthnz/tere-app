// Compound biometrics capture (sex + height + weight with unit toggles) for
// the AI triage flow + employer intake. Fills patient_sex / patient_height_cm /
// patient_weight_kg on the consult so VitalsCapture can hand varying
// demographic features to predictBP(). Prior to this, the live /vitals flow
// passed subject={} and the BP model collapsed to the training mean on every
// patient (dashboard replay shows SBP SD ~1.1 vs cuff SD ~12.5 when subject
// is empty).
//
// Defaults: metric (cm + kg). Toggles let a US tourist flip to in/lb without
// a schema change — stored values are always normalised to cm + kg before
// submit, matching the DB CHECK constraints.
//
// Theme: `dark` prop renders on dark/navy backgrounds (used by WorkIntake);
// omit for the default light theme used by AITriage.

import React, { useState, useEffect } from 'react'

const SEX_CHOICES = [
  { value: 'female',             label: 'Female' },
  { value: 'male',               label: 'Male' },
  { value: 'other',              label: 'Other' },
  { value: 'prefer_not_to_say',  label: 'Prefer not to say' },
]

const inchToCm = (inches) => Math.round(inches * 2.54 * 10) / 10
const lbToKg   = (lb)     => Math.round(lb * 0.453592 * 10) / 10

export default function BiometricsForm({ onSubmit, onChange, disabled, dark = false, embedded = false }) {
  const [sex, setSex] = useState('')
  const [heightUnit, setHeightUnit] = useState('cm')  // default metric
  const [heightCm, setHeightCm]     = useState('')
  const [heightFt, setHeightFt]     = useState('')
  const [heightIn, setHeightIn]     = useState('')
  const [weightUnit, setWeightUnit] = useState('kg')  // default metric
  const [weightKg, setWeightKg]     = useState('')
  const [weightLb, setWeightLb]     = useState('')

  const heightCmNum = (() => {
    if (heightUnit === 'cm') {
      const n = parseFloat(heightCm)
      return isFinite(n) && n > 50 && n < 250 ? n : null
    }
    const ft = parseFloat(heightFt) || 0
    const inch = parseFloat(heightIn) || 0
    const total = ft * 12 + inch
    const cm = inchToCm(total)
    return cm > 50 && cm < 250 ? cm : null
  })()

  const weightKgNum = (() => {
    if (weightUnit === 'kg') {
      const n = parseFloat(weightKg)
      return isFinite(n) && n > 20 && n < 400 ? n : null
    }
    const n = parseFloat(weightLb)
    if (!isFinite(n)) return null
    const kg = lbToKg(n)
    return kg > 20 && kg < 400 ? kg : null
  })()

  const valid = sex && heightCmNum != null && weightKgNum != null

  // Embedded mode (WorkIntake): fire onChange on every value change so the
  // parent form can keep its own state in sync without needing the standalone
  // Continue button. Always normalised to cm/kg regardless of unit toggle.
  useEffect(() => {
    if (!embedded || !onChange) return
    onChange({
      patient_sex: sex || null,
      patient_height_cm: heightCmNum,
      patient_weight_kg: weightKgNum,
      valid,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sex, heightCmNum, weightKgNum, valid, embedded])

  function handleSubmit() {
    if (!valid) return
    onSubmit?.({
      patient_sex: sex,
      patient_height_cm: heightCmNum,
      patient_weight_kg: weightKgNum,
    })
  }

  // Theme tokens — swap between light (AITriage) and dark (WorkIntake navy).
  const TEAL = '#0B6E76'
  const TEAL_LIGHT = '#D4EEF0'
  const t = dark ? {
    labelColor:  'rgba(255,255,255,.9)',
    chipBg:      'rgba(255,255,255,.08)',
    chipBorder:  '1px solid rgba(255,255,255,.25)',
    chipColor:   'rgba(255,255,255,.85)',
    chipActiveBorder: `1.5px solid ${TEAL_LIGHT}`,
    chipActiveBg:     TEAL,
    chipActiveColor:  'white',
    toggleBg:     'rgba(255,255,255,.06)',
    toggleBorder: '1px solid rgba(255,255,255,.2)',
    toggleColor:  'rgba(255,255,255,.65)',
    toggleActiveBg:    TEAL,
    toggleActiveColor: 'white',
    inputBg:      'rgba(255,255,255,.08)',
    inputBorder:  '1.5px solid rgba(255,255,255,.25)',
    inputColor:   'white',
    btnActiveBg:    TEAL,
    btnActiveColor: 'white',
    btnDisabledBg:  'rgba(255,255,255,.1)',
    btnDisabledColor: 'rgba(255,255,255,.4)',
  } : {
    labelColor:  'var(--text)',
    chipBg:      'white',
    chipBorder:  '1px solid var(--border)',
    chipColor:   'var(--text)',
    chipActiveBorder: `1.5px solid ${TEAL}`,
    chipActiveBg:     TEAL,
    chipActiveColor:  'white',
    toggleBg:     'transparent',
    toggleBorder: '1px solid var(--border)',
    toggleColor:  'var(--text-muted, #6B7280)',
    toggleActiveBg:    TEAL,
    toggleActiveColor: 'white',
    inputBg:      'white',
    inputBorder:  '1.5px solid var(--border)',
    inputColor:   'var(--text)',
    btnActiveBg:    TEAL,
    btnActiveColor: 'white',
    btnDisabledBg:  '#E5E7EB',
    btnDisabledColor: '#9CA3AF',
  }

  const row = { padding: '0 1rem 10px', maxWidth: 600, margin: '0 auto', width: '100%', boxSizing: 'border-box' }
  const label = { fontSize: '.75rem', fontWeight: 700, color: t.labelColor, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }
  const chipBtn = (active) => ({
    padding: '7px 14px', borderRadius: 99, fontSize: '.8125rem', fontWeight: 600,
    border: active ? t.chipActiveBorder : t.chipBorder,
    background: active ? t.chipActiveBg : t.chipBg,
    color: active ? t.chipActiveColor : t.chipColor,
    cursor: 'pointer', fontFamily: 'inherit',
  })
  const unitToggle = (active) => ({
    padding: '5px 11px', borderRadius: 6, fontSize: '.75rem', fontWeight: 700,
    border: t.toggleBorder,
    background: active ? t.toggleActiveBg : t.toggleBg,
    color: active ? t.toggleActiveColor : t.toggleColor,
    cursor: 'pointer', fontFamily: 'inherit',
  })
  const input = {
    padding: '10px 12px', border: t.inputBorder, borderRadius: 8,
    background: t.inputBg, color: t.inputColor,
    fontSize: '1rem', fontFamily: 'inherit', outline: 'none',
    width: '100%', boxSizing: 'border-box',
  }

  return (
    <div style={{ padding: '0 0 .5rem' }}>
      {/* Sex */}
      <div style={row}>
        <div style={label}>Sex</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SEX_CHOICES.map(c => (
            <button key={c.value} type="button" onClick={() => setSex(c.value)} style={chipBtn(sex === c.value)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Height */}
      <div style={row}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
          <div style={{ ...label, marginBottom: 0 }}>Height</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" onClick={() => setHeightUnit('cm')} style={unitToggle(heightUnit === 'cm')}>cm</button>
            <button type="button" onClick={() => setHeightUnit('ftin')} style={unitToggle(heightUnit === 'ftin')}>ft/in</button>
          </div>
        </div>
        {heightUnit === 'cm' ? (
          <input
            type="number" inputMode="decimal" placeholder="e.g. 170"
            value={heightCm} onChange={e => setHeightCm(e.target.value)}
            style={input}
          />
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="number" inputMode="decimal" placeholder="ft (e.g. 5)"
              value={heightFt} onChange={e => setHeightFt(e.target.value)} style={input} />
            <input type="number" inputMode="decimal" placeholder="in (e.g. 7)"
              value={heightIn} onChange={e => setHeightIn(e.target.value)} style={input} />
          </div>
        )}
      </div>

      {/* Weight */}
      <div style={row}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
          <div style={{ ...label, marginBottom: 0 }}>Weight</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" onClick={() => setWeightUnit('kg')} style={unitToggle(weightUnit === 'kg')}>kg</button>
            <button type="button" onClick={() => setWeightUnit('lb')} style={unitToggle(weightUnit === 'lb')}>lb</button>
          </div>
        </div>
        {weightUnit === 'kg' ? (
          <input type="number" inputMode="decimal" placeholder="e.g. 75"
            value={weightKg} onChange={e => setWeightKg(e.target.value)} style={input} />
        ) : (
          <input type="number" inputMode="decimal" placeholder="e.g. 165"
            value={weightLb} onChange={e => setWeightLb(e.target.value)} style={input} />
        )}
      </div>

      {/* Submit — hidden in embedded mode (parent form owns the submit) */}
      {!embedded && (
        <div style={{ ...row, paddingTop: 6 }}>
          <button type="button" onClick={handleSubmit} disabled={!valid || disabled}
            style={{
              width: '100%', padding: '14px 20px', borderRadius: 10,
              background: valid && !disabled ? t.btnActiveBg : t.btnDisabledBg,
              color:      valid && !disabled ? t.btnActiveColor : t.btnDisabledColor,
              border: 'none',
              fontSize: '1rem', fontWeight: 700, fontFamily: 'inherit',
              cursor: valid && !disabled ? 'pointer' : 'default',
            }}>
            Continue
          </button>
        </div>
      )}
    </div>
  )
}
