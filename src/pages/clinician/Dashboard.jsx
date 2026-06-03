import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, supabase } from '../../lib/supabase'

function timeAgo(ts) {
  const mins = Math.floor((Date.now() - new Date(ts)) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins/60)}h ${mins%60}m ago`
}

function VitalBadge({ label, value, unit, normal }) {
  if (!value) return null
  const ok = normal ? normal(value) : true
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:3,
      background: ok ? 'var(--success-bg)' : 'var(--warning-bg)',
      color: ok ? 'var(--success)' : 'var(--warning)',
      fontSize:'0.75rem', fontWeight:600, padding:'2px 8px',
      borderRadius:99, marginRight:4
    }}>
      {label} {value}{unit}
    </span>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [consultations, setConsultations] = useState([])
  const [loading, setLoading]             = useState(true)
  const [filter, setFilter]               = useState('active')

  const load = async () => {
    const rows = await db.consultations.listWaiting()
    setConsultations(rows)
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = db.consultations.subscribe(() => load())
    return () => channel.unsubscribe?.()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    sessionStorage.removeItem('tere_clinician')
    navigate('/clinician/login')
  }

  const waiting    = consultations.filter(c => c.status === 'waiting')
  const inProgress = consultations.filter(c => c.status === 'in_progress')

  return (
    <div style={{ minHeight:'100dvh', background:'var(--bg)', display:'flex', flexDirection:'column' }}>
      {/* Top bar */}
      <div style={{
        background:'var(--navy)', padding:'0.875rem 1.5rem',
        display:'flex', alignItems:'center', justifyContent:'space-between'
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:'1.4rem', fontWeight:700, color:'var(--teal-light)', letterSpacing:'0.12em' }}>TERE</span>
          <span style={{ color:'rgba(255,255,255,0.4)', fontSize:'0.8rem' }}>Clinician Dashboard</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {waiting.length > 0 && (
            <span className="badge badge-live">
              {waiting.length} waiting
            </span>
          )}
          <button onClick={() => navigate('/clinician/admin')} className="btn btn-ghost btn-sm"
            style={{ color:'rgba(255,255,255,0.5)', fontSize:'0.8rem' }}>
            Admin
          </button>
          <button onClick={handleSignOut} className="btn btn-ghost btn-sm"
            style={{ color:'rgba(255,255,255,0.5)', fontSize:'0.8rem' }}>
            Sign out
          </button>
        </div>
      </div>

      <div style={{ padding:'1.5rem', maxWidth:900, margin:'0 auto', width:'100%' }}>

        {/* Stats row */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:'1.5rem' }}>
          {[
            { label:'Waiting', value: waiting.length, color:'var(--warning)' },
            { label:'In progress', value: inProgress.length, color:'var(--teal)' },
            { label:'Today completed', value: 0, color:'var(--success)' },  // TODO: query
          ].map(({ label, value, color }) => (
            <div key={label} className="card" style={{ padding:'1rem', textAlign:'center' }}>
              <div style={{ fontSize:'2rem', fontWeight:700, color, lineHeight:1 }}>{value}</div>
              <div style={{ fontSize:'0.8rem', color:'var(--muted)', marginTop:4 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Queue */}
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{
            padding:'0.875rem 1.25rem', borderBottom:'1px solid var(--border)',
            display:'flex', alignItems:'center', justifyContent:'space-between'
          }}>
            <h2 style={{ fontSize:'1rem', fontWeight:700 }}>Patient queue</h2>
            <button onClick={load} className="btn btn-secondary btn-sm">Refresh</button>
          </div>

          {loading && (
            <div style={{ padding:'2rem', textAlign:'center' }}>
              <div className="spinner" style={{ margin:'0 auto' }}></div>
            </div>
          )}

          {!loading && consultations.length === 0 && (
            <div style={{ padding:'3rem', textAlign:'center', color:'var(--muted)' }}>
              <div style={{ fontSize:'2rem', marginBottom:'0.75rem' }}>🎉</div>
              <p>No patients waiting. Queue is clear.</p>
            </div>
          )}

          {consultations.map(c => (
            <div key={c.id} style={{
              padding:'1rem 1.25rem', borderBottom:'1px solid var(--border)',
              display:'flex', alignItems:'flex-start', gap:'1rem',
              background: c.status === 'in_progress' ? '#F0FDF4' : 'white',
              transition:'background 0.2s'
            }}>
              {/* Status indicator */}
              <div style={{
                width:10, height:10, borderRadius:'50%', flexShrink:0, marginTop:5,
                background: c.status === 'in_progress' ? 'var(--success)' : 'var(--warning)',
                animation: c.status === 'waiting' ? 'pulse 2s infinite' : 'none'
              }}></div>

              {/* Patient info */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                  <span style={{ fontWeight:700, fontSize:'0.95rem' }}>{c.patient_name}</span>
                  {c.patient_dob && (
                    <span style={{ fontSize:'0.8rem', color:'var(--muted)' }}>
                      {new Date().getFullYear() - new Date(c.patient_dob).getFullYear()}y
                    </span>
                  )}
                  {c.is_acc && <span className="badge badge-purple">ACC</span>}
                  <span className="badge" style={{
                    background: c.status === 'in_progress' ? 'var(--success-bg)' : 'var(--warning-bg)',
                    color: c.status === 'in_progress' ? 'var(--success)' : 'var(--warning)'
                  }}>
                    {c.status === 'in_progress' ? 'In progress' : 'Waiting'}
                  </span>
                </div>

                <p style={{ fontSize:'0.875rem', color:'var(--text)', marginBottom:6, fontStyle:'italic' }}>
                  "{c.chief_complaint}"
                </p>

                {/* Vitals */}
                {(c.vitals_hr || c.vitals_spo2 || c.vitals_rr) && (
                  <div style={{ marginBottom:6 }}>
                    <VitalBadge label="HR" value={c.vitals_hr} unit=" bpm" normal={v=>v>=60&&v<=100} />
                    <VitalBadge label="RR" value={c.vitals_rr} unit="/min" normal={v=>v>=12&&v<=20} />
                    {c.vitals_spo2 && <VitalBadge label="SpO₂" value={c.vitals_spo2} unit="%" normal={v=>v>=95} />}
                    {c.vitals_bp_sys && <VitalBadge label="BP" value={`${c.vitals_bp_sys}/${c.vitals_bp_dia}`} unit="" normal={() => true} />}
                  </div>
                )}

                <div style={{ fontSize:'0.78rem', color:'var(--muted)' }}>
                  {c.patient_location} · {timeAgo(c.created_at)}
                  {c.patient_nhi && ` · NHI ${c.patient_nhi}`}
                </div>
              </div>

              {/* Action button */}
              <button
                onClick={async () => { await db.consultations.update(c.id, { status: 'vitals_pending' }); navigate(`/clinician/consult/${c.id}`); }}
                className={`btn btn-sm ${c.status === 'in_progress' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flexShrink:0 }}>
                {c.status === 'in_progress' ? 'Rejoin' : 'Start →'}
              </button>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
