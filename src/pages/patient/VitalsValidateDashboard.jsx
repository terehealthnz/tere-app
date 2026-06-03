import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { getValidationReadings, getValidationSubjects, getModelVersions, getTrainableReadings } from '../../lib/supabase'
import { trainModel, getLocalMeta, BP_SHOW_THRESHOLD } from '../../lib/bpModel'

const PIN = import.meta.env.VITE_VALIDATION_PIN || 'tere2026'
const TEAL = '#0B6E76'
const NAVY = '#0D2B45'
const BG   = '#F7F5F0'

const FITZ_COLORS = ['#FDDBB4','#EAA882','#D08B5B','#AE5D29','#694D3D','#2C1503']

const MILESTONES = [
  { min: 0,    max: 30,       emoji: '🔴', label: 'Baseline' },
  { min: 31,   max: 100,      emoji: '🟡', label: 'Early data' },
  { min: 101,  max: 300,      emoji: '🟠', label: 'Building' },
  { min: 301,  max: 500,      emoji: '🟢', label: 'Strong dataset' },
  { min: 501,  max: 999,      emoji: '⭐',  label: 'Model-ready' },
  { min: 1000, max: Infinity, emoji: '⭐⭐', label: 'Excellent' },
]

function getMilestone(n) {
  return MILESTONES.find(m => n >= m.min && n <= m.max) || MILESTONES[0]
}

function computeMAE(readings) {
  const valid = readings.filter(r => r.manual_hr && r.tere_hr)
  if (!valid.length) return null
  return (valid.reduce((s, r) => s + Math.abs(r.manual_hr - r.tere_hr), 0) / valid.length).toFixed(1)
}

function exportCSV(readings, subjects) {
  const subMap = Object.fromEntries(subjects.map(s => [s.id, s]))
  const rows = [
    ['Date','Subject','Age','Sex','Fitzpatrick','Systolic','Diastolic','Manual HR','Tere HR','HR Diff','Tere RR','Confidence %','Notes','Conditions'],
    ...readings.map(r => {
      const sub = r.subject_id ? subMap[r.subject_id] : null
      return [
        new Date(r.recorded_at).toISOString(),
        r.subject_code || '',
        sub?.age || '', sub?.sex || '', sub?.fitzpatrick_scale || '',
        r.manual_systolic || '', r.manual_diastolic || '', r.manual_hr || '',
        r.tere_hr || '', r.hr_difference != null ? r.hr_difference : '',
        r.tere_rr || '', r.raw_rppg_signal?.numericConfidence || '',
        (r.notes || '').replace(/,/g, ';').replace(/\n/g, ' '),
        (r.session_conditions || '').replace(/,/g, ';').replace(/\n/g, ' '),
      ]
    })
  ]
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `tere-vitals-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function HRChart({ readings }) {
  const valid = readings.filter(r => r.manual_hr && r.tere_hr)
  if (!valid.length) {
    return <div style={{ color: '#6B7280', fontSize: '.9rem', textAlign: 'center', padding: '3rem 0' }}>No HR comparison data yet.</div>
  }
  const W = 380, H = 270, ml = 44, mr = 20, mt = 16, mb = 38
  const chartW = W - ml - mr, chartH = H - mt - mb
  const MIN = 40, MAX = 200
  const scl = (v) => Math.max(0, Math.min(1, (v - MIN) / (MAX - MIN)))
  const px = (v) => ml + scl(v) * chartW
  const py = (v) => mt + chartH - scl(v) * chartH
  const ticks = [50, 75, 100, 125, 150, 175]

  return (
    <div>
      <div style={{ fontSize: '.85rem', fontWeight: 600, color: NAVY, marginBottom: '.75rem' }}>Tere HR vs Manual HR</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: W, display: 'block' }}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={px(v)} y1={mt} x2={px(v)} y2={mt + chartH} stroke="#F3F4F6" strokeWidth={1} />
            <line x1={ml} y1={py(v)} x2={ml + chartW} y2={py(v)} stroke="#F3F4F6" strokeWidth={1} />
            <text x={px(v)} y={mt + chartH + 14} textAnchor="middle" fontSize={9} fill="#9CA3AF">{v}</text>
            <text x={ml - 5} y={py(v) + 3} textAnchor="end" fontSize={9} fill="#9CA3AF">{v}</text>
          </g>
        ))}
        <line x1={px(MIN)} y1={py(MIN)} x2={px(MAX)} y2={py(MAX)} stroke="#D1FAE5" strokeWidth={1.5} strokeDasharray="5 3" />
        {valid.map((r, i) => (
          <circle key={i} cx={px(r.manual_hr)} cy={py(r.tere_hr)} r={4} fill={TEAL} fillOpacity={.75} stroke="white" strokeWidth={1} />
        ))}
        <text x={ml + chartW / 2} y={H - 2} textAnchor="middle" fontSize={10} fill="#6B7280">Manual HR (bpm)</text>
        <text x={9} y={mt + chartH / 2} textAnchor="middle" fontSize={10} fill="#6B7280" transform={`rotate(-90,9,${mt + chartH / 2})`}>Tere HR (bpm)</text>
        <line x1={ml} y1={mt} x2={ml} y2={mt + chartH} stroke="#E5E7EB" strokeWidth={1} />
        <line x1={ml} y1={mt + chartH} x2={ml + chartW} y2={mt + chartH} stroke="#E5E7EB" strokeWidth={1} />
      </svg>
      <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginTop: '.5rem' }}>{valid.length} readings · dashed = perfect agreement</div>
    </div>
  )
}

function DiversityTracker({ subjects }) {
  if (!subjects.length) return <div style={{ color: '#6B7280', fontSize: '.9rem' }}>No subjects yet.</div>
  const ages = subjects.filter(s => s.age).map(s => s.age)
  const ageRange = ages.length ? `${Math.min(...ages)}–${Math.max(...ages)}` : '—'
  const sexCounts = subjects.reduce((acc, s) => { if (s.sex) acc[s.sex] = (acc[s.sex] || 0) + 1; return acc }, {})
  const fitzCovered = new Set(subjects.filter(s => s.fitzpatrick_scale).map(s => s.fitzpatrick_scale))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '.75rem', textAlign: 'center' }}>
        {[['Subjects', subjects.length], ['Age range', ageRange], ['Skin types', `${fitzCovered.size}/6`]].map(([lbl, val]) => (
          <div key={lbl} style={{ background: '#F9FAFB', borderRadius: 10, padding: '.75rem' }}>
            <div style={{ fontWeight: 800, fontSize: '1.15rem', color: NAVY }}>{val}</div>
            <div style={{ fontSize: '.75rem', color: '#6B7280' }}>{lbl}</div>
          </div>
        ))}
      </div>
      {Object.keys(sexCounts).length > 0 && (
        <div>
          <div style={{ fontSize: '.8rem', fontWeight: 600, color: NAVY, marginBottom: '.4rem' }}>Sex distribution</div>
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
            {Object.entries(sexCounts).map(([sex, count]) => (
              <div key={sex} style={{ background: '#F0F9FF', borderRadius: 99, padding: '.3rem .7rem', fontSize: '.8rem', color: NAVY }}>
                {sex}: {Math.round((count / subjects.length) * 100)}%
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <div style={{ fontSize: '.8rem', fontWeight: 600, color: NAVY, marginBottom: '.5rem' }}>Fitzpatrick coverage</div>
        <div style={{ display: 'flex', gap: '.4rem' }}>
          {FITZ_COLORS.map((color, i) => (
            <div key={i} title={`Type ${i + 1}`} style={{
              width: 32, height: 32, borderRadius: '50%', background: color,
              border: fitzCovered.has(i + 1) ? `3px solid ${TEAL}` : '2px solid #E5E7EB',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '.7rem', fontWeight: 700, color: i >= 3 ? 'rgba(255,255,255,.9)' : '#4B5563',
            }}>{i + 1}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ModelPanel({ readings, modelVersions, training, trainingStatus, onTrain }) {
  const localMeta   = getLocalMeta()
  const latestDB    = modelVersions[0]
  const meta        = localMeta || latestDB
  const totalReadings = readings.length

  const mae = meta?.val_mae ?? meta?.final_mae ?? meta?.valMae ?? meta?.finalMae ?? null
  const samples = meta?.training_samples ?? meta?.samples ?? 0

  const status = !meta ? 'none'
    : mae == null ? 'training'
    : mae > 20 ? 'building'
    : mae > 15 ? 'improving'
    : mae > 10 ? 'active'
    : 'clinical'

  const statusInfo = {
    none:     { bg: '#F3F4F6', color: '#6B7280', label: 'No model yet' },
    training: { bg: '#FEF3C7', color: '#92400E', label: 'Training — not ready for patients' },
    building: { bg: '#FEE2E2', color: '#991B1B', label: 'Training — not ready for patients' },
    improving:{ bg: '#FEF3C7', color: '#92400E', label: 'Improving — not ready yet' },
    active:   { bg: '#D1FAE5', color: '#065F46', label: '✓ Active — showing estimates to patients' },
    clinical: { bg: '#D1FAE5', color: '#065F46', label: '⭐ Clinical accuracy achieved (MAE ≤10 mmHg)' },
  }[status] || {}

  const patientPct = Math.min(100, Math.round((samples / BP_SHOW_THRESHOLD.samples) * 100))
  const nextAt = (Math.floor(totalReadings / 5) + 1) * 5
  const version = meta?.model_version ?? meta?.version ?? '—'

  return (
    <div style={{ background: 'white', borderRadius: 16, padding: '1.25rem', boxShadow: '0 1px 6px rgba(0,0,0,.05)', marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '.85rem' }}>
        <div>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '.95rem' }}>BP model</div>
          {meta && (
            <div style={{ fontSize: '.8rem', color: '#6B7280', marginTop: '.2rem' }}>
              {version} · {samples} samples{mae != null ? ` · MAE ±${Number(mae).toFixed(1)} mmHg` : ''}
            </div>
          )}
        </div>
        <button onClick={onTrain} disabled={!!training || totalReadings < 5}
          style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 99, padding: '.4rem 1rem', fontWeight: 700, fontSize: '.8rem', cursor: (training || totalReadings < 5) ? 'not-allowed' : 'pointer', opacity: (training || totalReadings < 5) ? .5 : 1, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          {training ? 'Training…' : 'Train now'}
        </button>
      </div>

      <div style={{ background: statusInfo.bg, color: statusInfo.color, borderRadius: 8, padding: '.5rem .75rem', fontSize: '.85rem', marginBottom: '1rem' }}>
        {statusInfo.label || ''}
      </div>

      {!meta && totalReadings < 5 && (
        <div style={{ fontSize: '.85rem', color: '#6B7280', marginBottom: '1rem' }}>
          Training begins at 5 readings — {5 - totalReadings} more needed.
        </div>
      )}

      <div style={{ marginBottom: training ? '1rem' : 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', color: '#6B7280', marginBottom: '.35rem' }}>
          <span>Patient visibility ({BP_SHOW_THRESHOLD.samples} samples + MAE ≤{BP_SHOW_THRESHOLD.valMae} mmHg)</span>
          <span>{samples}/{BP_SHOW_THRESHOLD.samples}</span>
        </div>
        <div style={{ background: '#F3F4F6', borderRadius: 99, height: 6 }}>
          <div style={{ background: TEAL, height: 6, borderRadius: 99, width: `${patientPct}%`, transition: 'width .5s' }} />
        </div>
        {!training && totalReadings >= 30 && (
          <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginTop: '.4rem' }}>Next auto-train at {nextAt} readings</div>
        )}
      </div>

      {training && (
        <div style={{ fontSize: '.8rem', color: '#6B7280', fontStyle: 'italic', marginTop: '.75rem' }}>{trainingStatus}</div>
      )}
    </div>
  )
}

export default function VitalsValidateDashboard() {
  const [authed, setAuthed]       = useState(!!sessionStorage.getItem('tere_validate_authed'))
  const [pinInput, setPinInput]   = useState('')
  const [pinError, setPinError]   = useState(false)
  const [readings, setReadings]   = useState([])
  const [subjects, setSubjects]   = useState([])
  const [modelVersions, setModelVersions] = useState([])
  const [loading, setLoading]     = useState(false)
  const [tab, setTab]             = useState('readings')
  const [filterSubject, setFilterSubject] = useState('')
  const [training, setTraining]   = useState(false)
  const [trainingStatus, setTrainingStatus] = useState('')

  useEffect(() => {
    if (!authed) return
    setLoading(true)
    Promise.all([getValidationReadings(), getValidationSubjects(), getModelVersions()])
      .then(([r, s, mv]) => { setReadings(r); setSubjects(s); setModelVersions(mv) })
      .catch(e => console.error('[Dashboard] load error:', e.message))
      .finally(() => setLoading(false))
  }, [authed])

  const handleTrain = useCallback(async () => {
    setTraining(true); setTrainingStatus('Fetching training data…')
    try {
      const trainable = await getTrainableReadings()
      if (trainable.length < 5) { setTrainingStatus('Not enough data (need 5 readings with raw signal)'); return }
      setTrainingStatus(`Training on ${trainable.length} readings…`)
      const result = await trainModel(trainable, (epoch, total, logs) => {
        const pct = Math.round((epoch + 1) / total * 100)
        setTrainingStatus(`Training… ${pct}% | loss ${logs.loss?.toFixed(3) || '?'}`)
      })
      if (result) {
        setTrainingStatus(`Done: ${result.version} · ${result.samples} samples · MAE ±${result.finalMae?.toFixed(1) || '?'} mmHg`)
        // Reload model versions
        const mv = await getModelVersions()
        setModelVersions(mv)
      }
    } catch (e) {
      setTrainingStatus('Training failed: ' + e.message)
    } finally {
      setTraining(false)
    }
  }, [])

  const wrap = (children) => (
    <div style={{ minHeight: '100dvh', background: BG, fontFamily: 'Plus Jakarta Sans, sans-serif', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '1.5rem' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'white', fontSize: '1.1rem', fontWeight: 900 }}>V</span>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: NAVY, fontSize: '1.05rem' }}>Vitals Validation Dashboard</div>
            <div style={{ fontSize: '.75rem', color: '#6B7280' }}>Clinical data collection</div>
          </div>
          <Link to="/vitals-validate" style={{ marginLeft: 'auto', fontSize: '.85rem', color: TEAL, fontWeight: 700, textDecoration: 'none', background: TEAL + '15', borderRadius: 99, padding: '.4rem 1rem' }}>
            + New reading
          </Link>
        </div>
        {children}
      </div>
    </div>
  )

  if (!authed) {
    const handlePin = () => {
      if (pinInput === PIN) { sessionStorage.setItem('tere_validate_authed', '1'); setAuthed(true) }
      else setPinError(true)
    }
    return wrap(
      <div style={{ background: 'white', borderRadius: 16, padding: '1.5rem', boxShadow: '0 2px 12px rgba(0,0,0,.06)', maxWidth: 380 }}>
        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: NAVY, marginBottom: '1.25rem' }}>Access required</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input type="password" value={pinInput}
            onChange={e => { setPinInput(e.target.value); setPinError(false) }}
            onKeyDown={e => e.key === 'Enter' && handlePin()} placeholder="PIN"
            style={{ border: `1.5px solid ${pinError ? '#EF4444' : '#E5E7EB'}`, borderRadius: 10, padding: '.75rem 1rem', fontSize: '1.1rem', fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '.15em', outline: 'none' }}
          />
          {pinError && <div style={{ color: '#EF4444', fontSize: '.85rem' }}>Incorrect PIN.</div>}
          <button onClick={handlePin}
            style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 99, padding: '.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '1rem' }}>
            Continue
          </button>
        </div>
      </div>
    )
  }

  const mae         = computeMAE(readings)
  const milestone   = getMilestone(readings.length)
  const oldest      = readings.length ? readings[readings.length - 1] : null
  const daysActive  = oldest ? Math.max(1, Math.ceil((Date.now() - new Date(oldest.recorded_at).getTime()) / 86400000)) : 0

  return wrap(
    <>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.75rem', marginBottom: '1.25rem' }}>
        {[
          { label: 'Readings',    value: readings.length, sub: `${milestone.emoji} ${milestone.label}` },
          { label: 'Subjects',    value: subjects.length,  sub: '' },
          { label: 'HR MAE',      value: mae ? `${mae} bpm` : '—', sub: 'mean abs error' },
          { label: 'Days active', value: daysActive || '—', sub: '' },
        ].map(({ label, value, sub }) => (
          <div key={label} style={{ background: 'white', borderRadius: 14, padding: '1rem', boxShadow: '0 1px 6px rgba(0,0,0,.05)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: NAVY }}>{value}</div>
            <div style={{ fontSize: '.75rem', fontWeight: 600, color: '#6B7280' }}>{label}</div>
            {sub && <div style={{ fontSize: '.7rem', color: '#9CA3AF', marginTop: '.2rem' }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* BP Model panel */}
      <ModelPanel
        readings={readings} modelVersions={modelVersions}
        training={training} trainingStatus={trainingStatus}
        onTrain={handleTrain}
      />

      {/* Diversity tracker */}
      <div style={{ background: 'white', borderRadius: 16, padding: '1.25rem', boxShadow: '0 1px 6px rgba(0,0,0,.05)', marginBottom: '1.25rem' }}>
        <div style={{ fontWeight: 700, color: NAVY, marginBottom: '1rem', fontSize: '.95rem' }}>Subject diversity</div>
        <DiversityTracker subjects={subjects} />
      </div>

      {/* Tabs */}
      <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 1px 6px rgba(0,0,0,.05)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1.5px solid #F3F4F6', alignItems: 'center' }}>
          {[['readings', 'Readings'], ['subjects', 'Subjects'], ['chart', 'HR Chart'], ['model', 'Model history']].map(([id, lbl]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: '.85rem 1.1rem', fontWeight: 700, fontSize: '.85rem', color: tab === id ? TEAL : '#6B7280',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: tab === id ? `2px solid ${TEAL}` : '2px solid transparent',
              marginBottom: -1.5, fontFamily: 'Plus Jakarta Sans, sans-serif',
            }}>{lbl}</button>
          ))}
          <button onClick={() => exportCSV(readings, subjects)} style={{ marginLeft: 'auto', padding: '.85rem 1.1rem', background: 'none', border: 'none', color: TEAL, fontWeight: 700, fontSize: '.85rem', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            Export CSV
          </button>
        </div>

        <div style={{ padding: '1.25rem', overflowX: 'auto' }}>
          {loading && <div style={{ textAlign: 'center', color: '#6B7280', padding: '3rem' }}>Loading…</div>}

          {!loading && tab === 'readings' && (
            readings.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#6B7280', padding: '2rem' }}>
                No readings yet. <Link to="/vitals-validate" style={{ color: TEAL, fontWeight: 600 }}>Take the first one →</Link>
              </div>
            ) : (() => {
              const subjectCodes = [...new Set(readings.map(r => r.subject_code).filter(Boolean))].sort()
              const filtered = filterSubject ? readings.filter(r => r.subject_code === filterSubject) : readings
              return (
              <>
                <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                  <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)}
                    style={{ border: '1.5px solid #E5E7EB', borderRadius: 8, padding: '.4rem .75rem', fontSize: '.85rem', fontFamily: 'Plus Jakarta Sans, sans-serif', color: NAVY, background: 'white', outline: 'none' }}>
                    <option value=''>All subjects ({readings.length})</option>
                    {subjectCodes.map(code => {
                      const sub = subjects.find(s => s.subject_code === code)
                      const name = sub ? ` — ${sub.first_name}` : ''
                      const count = readings.filter(r => r.subject_code === code).length
                      return <option key={code} value={code}>{code}{name} ({count})</option>
                    })}
                  </select>
                  {filterSubject && (
                    <button onClick={() => setFilterSubject('')}
                      style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: '.85rem', padding: 0 }}>
                      Clear
                    </button>
                  )}
                </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
                <thead>
                  <tr>
                    {['Date','Subject','BP','Manual HR','Tere HR','Diff','RR','Conf %','Notes'].map(h => (
                      <th key={h} style={{ padding: '.5rem .75rem', textAlign: 'left', borderBottom: '1px solid #F3F4F6', color: '#6B7280', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const diff = r.hr_difference
                    const dc = diff == null ? '#6B7280' : diff <= 5 ? '#10B981' : diff <= 10 ? '#F59E0B' : '#EF4444'
                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid #F9FAFB' }}>
                        <td style={{ padding: '.5rem .75rem', color: '#6B7280', whiteSpace: 'nowrap' }}>{new Date(r.recorded_at).toLocaleDateString()}</td>
                        <td style={{ padding: '.5rem .75rem', fontWeight: 700, color: TEAL }}>{r.subject_code || '—'}</td>
                        <td style={{ padding: '.5rem .75rem', color: NAVY }}>{r.manual_systolic && r.manual_diastolic ? `${r.manual_systolic}/${r.manual_diastolic}` : '—'}</td>
                        <td style={{ padding: '.5rem .75rem', color: NAVY }}>{r.manual_hr ?? '—'}</td>
                        <td style={{ padding: '.5rem .75rem', color: NAVY }}>{r.tere_hr ?? '—'}</td>
                        <td style={{ padding: '.5rem .75rem', fontWeight: 700, color: dc }}>{diff != null ? `±${diff}` : '—'}</td>
                        <td style={{ padding: '.5rem .75rem', color: '#6B7280' }}>{r.tere_rr ?? '—'}</td>
                        <td style={{ padding: '.5rem .75rem', color: '#6B7280' }}>{r.raw_rppg_signal?.numericConfidence ?? '—'}</td>
                        <td style={{ padding: '.5rem .75rem', color: '#6B7280', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.notes || ''}>{r.notes || ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </>
              )
            })()
          )}

          {!loading && tab === 'subjects' && (
            subjects.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#6B7280', padding: '2rem' }}>No subjects yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
                <thead>
                  <tr>
                    {['Code','Name','Age','Sex','Skin','HTN','DM','Share'].map(h => (
                      <th key={h} style={{ padding: '.5rem .75rem', textAlign: 'left', borderBottom: '1px solid #F3F4F6', color: '#6B7280', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {subjects.map(s => {
                    const shareUrl = `${window.location.origin}/vitals-validate?subject=${s.subject_code}`
                    return (
                      <tr key={s.id} style={{ borderBottom: '1px solid #F9FAFB' }}>
                        <td style={{ padding: '.5rem .75rem', fontWeight: 700, color: TEAL }}>{s.subject_code}</td>
                        <td style={{ padding: '.5rem .75rem', color: NAVY }}>{s.first_name}</td>
                        <td style={{ padding: '.5rem .75rem', color: '#6B7280' }}>{s.age ?? '—'}</td>
                        <td style={{ padding: '.5rem .75rem', color: '#6B7280' }}>{s.sex || '—'}</td>
                        <td style={{ padding: '.5rem .75rem' }}>
                          {s.fitzpatrick_scale
                            ? <div style={{ width: 20, height: 20, borderRadius: '50%', background: FITZ_COLORS[s.fitzpatrick_scale - 1] }} />
                            : <span style={{ color: '#9CA3AF' }}>—</span>}
                        </td>
                        <td style={{ padding: '.5rem .75rem', color: '#6B7280' }}>{s.has_hypertension || '—'}</td>
                        <td style={{ padding: '.5rem .75rem', color: '#6B7280' }}>{s.has_diabetes || '—'}</td>
                        <td style={{ padding: '.5rem .75rem' }}>
                          <button onClick={() => navigator.clipboard.writeText(shareUrl)}
                            style={{ background: 'none', border: 'none', color: TEAL, fontWeight: 700, cursor: 'pointer', fontSize: '.8rem', padding: 0 }}>
                            Copy
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          )}

          {!loading && tab === 'chart' && <HRChart readings={readings} />}

          {!loading && tab === 'model' && (
            modelVersions.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#6B7280', padding: '2rem' }}>
                No model versions yet. Collect 5+ readings with raw signal and click Train now.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
                <thead>
                  <tr>
                    {['Version','Samples','Loss','MAE (train)','MAE (val)','Trained at'].map(h => (
                      <th key={h} style={{ padding: '.5rem .75rem', textAlign: 'left', borderBottom: '1px solid #F3F4F6', color: '#6B7280', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modelVersions.map((mv, i) => {
                    const maeColor = mv.val_mae == null ? '#6B7280' : mv.val_mae <= 10 ? '#10B981' : mv.val_mae <= 15 ? '#F59E0B' : '#EF4444'
                    return (
                      <tr key={mv.id} style={{ borderBottom: '1px solid #F9FAFB', background: i === 0 ? '#FAFFF9' : 'transparent' }}>
                        <td style={{ padding: '.5rem .75rem', fontWeight: 700, color: TEAL }}>{mv.model_version}</td>
                        <td style={{ padding: '.5rem .75rem', color: NAVY }}>{mv.training_samples}</td>
                        <td style={{ padding: '.5rem .75rem', color: '#6B7280' }}>{mv.final_loss != null ? mv.final_loss.toFixed(4) : '—'}</td>
                        <td style={{ padding: '.5rem .75rem', color: '#6B7280' }}>{mv.final_mae != null ? `±${mv.final_mae.toFixed(1)} mmHg` : '—'}</td>
                        <td style={{ padding: '.5rem .75rem', fontWeight: 700, color: maeColor }}>{mv.val_mae != null ? `±${mv.val_mae.toFixed(1)} mmHg` : '—'}</td>
                        <td style={{ padding: '.5rem .75rem', color: '#6B7280', whiteSpace: 'nowrap' }}>{new Date(mv.trained_at).toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          )}
        </div>
      </div>
    </>
  )
}
