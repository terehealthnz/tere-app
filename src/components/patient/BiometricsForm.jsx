// Compound biometrics capture (sex + height + weight with unit toggles) for
// the AI triage flow. Fills patient_sex / patient_height_cm / patient_weight_kg
// on the consult so VitalsCapture can hand varying demographic features to
// predictBP(). Prior to this, the live /vitals flow passed subject={} and the
// BP model collapsed to the training mean on every patient (dashboard replay
// shows SBP SD ~1.1 vs cuff SD ~12.5 when subject is empty).

import React, { useState } from 'react'

const SEX_CHOICES = [
  { value: 'female',             label: 'Female' },
  { value: 'male',               label: 'Male' },
  { value: 'other',              label: 'Other' },
  { value: 'prefer_not_to_say',  label: 'Prefer not to say' },
]

// Imperial → metric conversions. inch → cm, lb → kg. Rounded to 1 dp.
const inchToCm = (inches) => Math.round(inches * 2.54 * 10) / 10
const lbToKg   = (lb)     => Math.round(lb * 0.453592 * 10) / 10

export default function BiometricsForm({ onSubmit, disabled }) {
  const [sex, setSex] = useState('')
  const [heightUnit, setHeightUnit] = useState('cm')  // 'cm' | 'ftin'
  const [heightCm, setHeightCm]     = useState('')
  const [heightFt, setHeightFt]     = useState('')
  const [heightIn, setHeightIn]     = useState('')
  const [weightUnit, setWeightUnit] = useState('kg')  // 'kg' | 'lb'
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

  function handleSubmit() {
    if (!valid) return
    onSubmit({
      patient_sex: sex,
      patient_height_cm: heightCmNum,
      patient_weight_kg: weightKgNum,
    })
  }

  const row = { padding: '0 1rem 10px', maxWidth: 600, margin: '0 auto', width: '100%', boxSizing: 'border-box' }
  const label = { fontSize: '.75rem', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }
  const chipBtn = (active) => ({
    padding: '7px 14px', borderRadius: 99, fontSize: '.8125rem', fontWeight: 600,
    border: active ? '1.5px solid var(--teal)' : '1px solid var(--border)',
    background: active ? 'var(--teal)' : 'white',
    color: active ? 'white' : 'var(--text)',
    cursor: 'pointer', fontFamily: 'inherit',
  })
  const unitToggle = (active) => ({
    padding: '5px 11px', borderRadius: 6, fontSize: '.75rem', fontWeight: 700,
    border: '1px solid var(--border)',
    background: active ? 'var(--teal)' : 'transparent',
    color: active ? 'white' : 'var(--text-muted, #6B7280)',
    cursor: 'pointer', fontFamily: 'inherit',
  })
  const input = {
    padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 8,
    fontSize: '1rem', fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box',
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

      {/* Submit */}
      <div style={{ ...row, paddingTop: 6 }}>
        <button type="button" onClick={handleSubmit} disabled={!valid || disabled}
          style={{
            width: '100%', padding: '14px 20px', borderRadius: 10,
            background: valid && !disabled ? 'var(--teal)' : '#E5E7EB',
            color: valid && !disabled ? 'white' : '#9CA3AF',
            border: 'none',
            fontSize: '1rem', fontWeight: 700, fontFamily: 'inherit',
            cursor: valid && !disabled ? 'pointer' : 'default',
          }}>
          Continue
        </button>
      </div>
    </div>
  )
}
