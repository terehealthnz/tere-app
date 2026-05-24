import React, { useState } from 'react'

// ── Ottawa Ankle Rules ────────────────────────────────────────────────────────
function OttawaAnkle({ onResult }) {
  const [checks, setChecks] = useState({
    tenderness_posterior_fibula: false,
    tenderness_posterior_tibia: false,
    tenderness_navicular: false,
    tenderness_base_5th: false,
    unable_to_weight_bear: false,
  })

  const toggle = k => setChecks(c => ({ ...c, [k]: !c[k] }))
  const xrayAnkle = checks.tenderness_posterior_fibula || checks.tenderness_posterior_tibia || checks.unable_to_weight_bear
  const xrayFoot  = checks.tenderness_navicular || checks.tenderness_base_5th || checks.unable_to_weight_bear

  const result = xrayAnkle || xrayFoot
    ? `Ottawa Ankle Rules: X-ray indicated (${[xrayAnkle && 'ankle', xrayFoot && 'foot'].filter(Boolean).join(' + ')})`
    : 'Ottawa Ankle Rules: X-ray NOT indicated — low probability of fracture'

  const CHECKS = [
    { key: 'tenderness_posterior_fibula',   label: 'Bone tenderness at posterior edge/tip of lateral malleolus (distal 6cm of fibula)' },
    { key: 'tenderness_posterior_tibia',    label: 'Bone tenderness at posterior edge/tip of medial malleolus (distal 6cm of tibia)' },
    { key: 'tenderness_navicular',          label: 'Bone tenderness at navicular' },
    { key: 'tenderness_base_5th',           label: 'Bone tenderness at base of 5th metatarsal' },
    { key: 'unable_to_weight_bear',         label: 'Unable to weight bear immediately and in ED/clinic (4 steps)' },
  ]

  return (
    <div>
      {CHECKS.map(({ key, label }) => (
        <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: '.625rem', cursor: 'pointer' }}>
          <div onClick={() => toggle(key)} style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 2, border: `2px solid ${checks[key] ? '#0B6E76' : '#D1D5DB'}`, background: checks[key] ? '#0B6E76' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {checks[key] && <span style={{ color: 'white', fontSize: 11, fontWeight: 700 }}>✓</span>}
          </div>
          <span style={{ fontSize: '.8125rem', color: '#374151', lineHeight: 1.4 }}>{label}</span>
        </label>
      ))}
      <div style={{ background: (xrayAnkle || xrayFoot) ? '#FEF3C7' : '#F0FDF4', borderRadius: 8, padding: '.75rem', marginTop: '.5rem', border: `1px solid ${(xrayAnkle || xrayFoot) ? '#FDE68A' : '#BBF7D0'}` }}>
        <div style={{ fontWeight: 700, color: (xrayAnkle || xrayFoot) ? '#92400E' : '#065F46', fontSize: '.875rem' }}>
          {(xrayAnkle || xrayFoot) ? '⚠ X-ray indicated' : '✓ X-ray not indicated'}
        </div>
        <div style={{ fontSize: '.8125rem', color: '#6B7280', marginTop: 2 }}>{(xrayAnkle || xrayFoot) ? `Ankle: ${xrayAnkle ? 'Yes' : 'No'} · Foot: ${xrayFoot ? 'Yes' : 'No'}` : 'Low probability of fracture'}</div>
      </div>
      <button onClick={() => onResult(result)} style={{ marginTop: '.75rem', background: '#0B6E76', color: 'white', border: 'none', padding: '7px 14px', borderRadius: 6, cursor: 'pointer', fontSize: '.8125rem', fontWeight: 600, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
        Add to MDM
      </button>
    </div>
  )
}

// ── Ottawa Knee Rules ─────────────────────────────────────────────────────────
function OttawaKnee({ onResult }) {
  const [checks, setChecks] = useState({
    age_55_plus: false,
    tenderness_fibula_head: false,
    isolated_tenderness_patella: false,
    inability_flex_90: false,
    unable_weight_bear: false,
  })
  const toggle = k => setChecks(c => ({ ...c, [k]: !c[k] }))
  const indicated = Object.values(checks).some(Boolean)
  const result = indicated
    ? 'Ottawa Knee Rules: X-ray indicated'
    : 'Ottawa Knee Rules: X-ray NOT indicated — low probability of fracture'

  return (
    <div>
      {[
        { key: 'age_55_plus',              label: 'Age ≥ 55 years' },
        { key: 'tenderness_fibula_head',   label: 'Isolated tenderness of the fibula head' },
        { key: 'isolated_tenderness_patella', label: 'Isolated tenderness of the patella (no other bony tenderness)' },
        { key: 'inability_flex_90',        label: 'Inability to flex knee to 90°' },
        { key: 'unable_weight_bear',       label: 'Unable to bear weight both immediately and in the ED/clinic (4 steps)' },
      ].map(({ key, label }) => (
        <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: '.625rem', cursor: 'pointer' }}>
          <div onClick={() => toggle(key)} style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 2, border: `2px solid ${checks[key] ? '#0B6E76' : '#D1D5DB'}`, background: checks[key] ? '#0B6E76' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {checks[key] && <span style={{ color: 'white', fontSize: 11, fontWeight: 700 }}>✓</span>}
          </div>
          <span style={{ fontSize: '.8125rem', color: '#374151', lineHeight: 1.4 }}>{label}</span>
        </label>
      ))}
      <div style={{ background: indicated ? '#FEF3C7' : '#F0FDF4', borderRadius: 8, padding: '.75rem', marginTop: '.5rem', border: `1px solid ${indicated ? '#FDE68A' : '#BBF7D0'}` }}>
        <div style={{ fontWeight: 700, color: indicated ? '#92400E' : '#065F46', fontSize: '.875rem' }}>{indicated ? '⚠ X-ray indicated' : '✓ X-ray not indicated'}</div>
      </div>
      <button onClick={() => onResult(result)} style={{ marginTop: '.75rem', background: '#0B6E76', color: 'white', border: 'none', padding: '7px 14px', borderRadius: 6, cursor: 'pointer', fontSize: '.8125rem', fontWeight: 600, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Add to MDM</button>
    </div>
  )
}

// ── HEART Score ───────────────────────────────────────────────────────────────
function HeartScore({ onResult }) {
  const [scores, setScores] = useState({ history: 0, ecg: 0, age: 0, risk: 0, troponin: 0 })
  const set = (k, v) => setScores(s => ({ ...s, [k]: v }))
  const total = Object.values(scores).reduce((a, b) => a + b, 0)
  const risk = total <= 3 ? 'low' : total <= 6 ? 'moderate' : 'high'
  const riskLabel = { low: 'Low risk (score 0-3) — safe for early discharge', moderate: 'Moderate risk (score 4-6) — observation recommended', high: 'High risk (score 7-10) — urgent cardiology review / admit' }
  const riskColor = { low: '#059669', moderate: '#D97706', high: '#DC2626' }
  const result = `HEART Score: ${total}/10 — ${riskLabel[risk]}`

  const ITEMS = [
    { key: 'history', label: 'History', opts: [[0,'Slightly suspicious'],[1,'Moderately suspicious'],[2,'Highly suspicious']] },
    { key: 'ecg', label: 'ECG', opts: [[0,'Normal'],[1,'Non-specific repolarisation disturbance'],[2,'Significant ST deviation']] },
    { key: 'age', label: 'Age', opts: [[0,'< 45'],[1,'45–65'],[2,'> 65']] },
    { key: 'risk', label: 'Risk factors', opts: [[0,'No known risk factors'],[1,'1–2 risk factors or obesity'],[2,'≥3 risk factors / atherosclerotic disease']] },
    { key: 'troponin', label: 'Troponin', opts: [[0,'≤ normal limit'],[1,'1–3× normal limit'],[2,'> 3× normal limit']] },
  ]

  return (
    <div>
      {ITEMS.map(({ key, label, opts }) => (
        <div key={key} style={{ marginBottom: '.75rem' }}>
          <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#6B7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {opts.map(([val, lbl]) => (
              <button key={val} onClick={() => set(key, val)} style={{ flex: 1, padding: '6px 4px', borderRadius: 6, border: `1.5px solid ${scores[key] === val ? '#0B6E76' : '#E2E8F0'}`, background: scores[key] === val ? '#EFF9F9' : 'white', color: scores[key] === val ? '#0B6E76' : '#6B7280', fontSize: '.7rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: 1.3 }}>{lbl}</button>
            ))}
          </div>
        </div>
      ))}
      <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '.875rem', border: '1px solid #E2E8F0', marginTop: '.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontWeight: 700, color: '#0D2B45', fontSize: '.9375rem' }}>HEART Score: {total}/10</span>
          <span style={{ fontWeight: 700, color: riskColor[risk], fontSize: '.875rem', textTransform: 'capitalize' }}>{risk} risk</span>
        </div>
        <div style={{ fontSize: '.8125rem', color: '#6B7280' }}>{riskLabel[risk]}</div>
      </div>
      <button onClick={() => onResult(result)} style={{ marginTop: '.75rem', background: '#0B6E76', color: 'white', border: 'none', padding: '7px 14px', borderRadius: 6, cursor: 'pointer', fontSize: '.8125rem', fontWeight: 600, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Add to MDM</button>
    </div>
  )
}

// ── Wells Score (DVT) ─────────────────────────────────────────────────────────
function WellsScore({ onResult }) {
  const [checks, setChecks] = useState({
    active_cancer: false, paralysis: false, immobile_3d: false,
    tenderness_deep_vein: false, entire_leg_swollen: false,
    calf_swollen_3cm: false, pitting_edema: false,
    collateral_veins: false, previous_dvt: false,
    alternative_dx: false,
  })
  const toggle = k => setChecks(c => ({ ...c, [k]: !c[k] }))
  const pos = Object.entries(checks).filter(([k, v]) => v && k !== 'alternative_dx').length
  const score = pos - (checks.alternative_dx ? 2 : 0)
  const risk = score >= 2 ? 'high' : score === 1 ? 'moderate' : 'low'
  const riskLabel = { low: 'Low probability (score ≤0) — DVT unlikely, consider D-dimer', moderate: 'Moderate probability (score 1) — D-dimer / ultrasound', high: 'High probability (score ≥2) — ultrasound recommended' }
  const result = `Wells DVT Score: ${score} — ${riskLabel[risk]}`

  const ITEMS = [
    { key: 'active_cancer',         label: 'Active cancer (treatment within 6 months or palliative)', pts: '+1' },
    { key: 'paralysis',             label: 'Paralysis, paresis, or recent plaster immobilisation of lower extremity', pts: '+1' },
    { key: 'immobile_3d',           label: 'Recently bedridden ≥3 days, or major surgery within 12 weeks', pts: '+1' },
    { key: 'tenderness_deep_vein',  label: 'Localised tenderness along deep venous system', pts: '+1' },
    { key: 'entire_leg_swollen',    label: 'Entire leg swollen', pts: '+1' },
    { key: 'calf_swollen_3cm',      label: 'Calf swelling ≥3cm larger than asymptomatic side', pts: '+1' },
    { key: 'pitting_edema',         label: 'Pitting oedema (greater in symptomatic leg)', pts: '+1' },
    { key: 'collateral_veins',      label: 'Collateral superficial veins (non-varicose)', pts: '+1' },
    { key: 'previous_dvt',          label: 'Previously documented DVT', pts: '+1' },
    { key: 'alternative_dx',        label: 'Alternative diagnosis at least as likely as DVT', pts: '-2' },
  ]

  return (
    <div>
      {ITEMS.map(({ key, label, pts }) => (
        <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: '.5rem', cursor: 'pointer' }}>
          <div onClick={() => toggle(key)} style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 2, border: `2px solid ${checks[key] ? '#0B6E76' : '#D1D5DB'}`, background: checks[key] ? '#0B6E76' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {checks[key] && <span style={{ color: 'white', fontSize: 11, fontWeight: 700 }}>✓</span>}
          </div>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '.8125rem', color: '#374151', lineHeight: 1.4 }}>{label}</span>
            <span style={{ fontSize: '.75rem', fontWeight: 700, color: pts.startsWith('+') ? '#0B6E76' : '#DC2626', marginLeft: 8, flexShrink: 0 }}>{pts}</span>
          </div>
        </label>
      ))}
      <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '.875rem', marginTop: '.5rem', border: '1px solid #E2E8F0' }}>
        <div style={{ fontWeight: 700, color: '#0D2B45', marginBottom: 4 }}>Wells Score: {score}</div>
        <div style={{ fontSize: '.8125rem', color: '#6B7280' }}>{riskLabel[risk]}</div>
      </div>
      <button onClick={() => onResult(result)} style={{ marginTop: '.75rem', background: '#0B6E76', color: 'white', border: 'none', padding: '7px 14px', borderRadius: 6, cursor: 'pointer', fontSize: '.8125rem', fontWeight: 600, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Add to MDM</button>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
const TOOLS = [
  { id: 'ottawa_ankle', label: 'Ottawa Ankle', icon: '🦶' },
  { id: 'ottawa_knee',  label: 'Ottawa Knee',  icon: '🦵' },
  { id: 'heart_score',  label: 'HEART Score',  icon: '❤️' },
  { id: 'wells_dvt',    label: 'Wells DVT',    icon: '🩸' },
]

export default function ClinicalTools({ onAddToMdm, onClose }) {
  const [activeTool, setActiveTool] = useState(null)

  function handleResult(text) {
    onAddToMdm?.(text)
    onClose?.()
  }

  return (
    <div style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      {/* Tool selector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '.5rem', marginBottom: '1rem' }}>
        {TOOLS.map(t => (
          <button key={t.id} onClick={() => setActiveTool(activeTool === t.id ? null : t.id)}
            style={{ padding: '.625rem .875rem', borderRadius: 8, border: `1.5px solid ${activeTool === t.id ? '#0B6E76' : '#E2E8F0'}`, background: activeTool === t.id ? '#EFF9F9' : 'white', color: activeTool === t.id ? '#0B6E76' : '#374151', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 600, fontSize: '.8125rem', cursor: 'pointer', textAlign: 'left' }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {activeTool === 'ottawa_ankle' && <OttawaAnkle onResult={handleResult} />}
      {activeTool === 'ottawa_knee'  && <OttawaKnee  onResult={handleResult} />}
      {activeTool === 'heart_score'  && <HeartScore  onResult={handleResult} />}
      {activeTool === 'wells_dvt'    && <WellsScore  onResult={handleResult} />}

      {!activeTool && (
        <div style={{ textAlign: 'center', padding: '1rem', color: '#9CA3AF', fontSize: '.875rem' }}>
          Select a tool above to calculate and auto-populate MDM
        </div>
      )}
    </div>
  )
}
