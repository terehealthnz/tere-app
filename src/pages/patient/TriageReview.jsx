import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getConsultation, patientUpdateConsultation } from '../../lib/supabase'

const NAVY  = '#0D2B45'
const TEAL  = '#0B6E76'
const TEAL_L = '#D4EEF0'
const FF    = 'Plus Jakarta Sans, sans-serif'

const TYPE_LABELS = { video: 'Video consultation', phone: 'Phone consultation', message: 'Written response' }

export default function TriageReview() {
  const navigate  = useNavigate()
  const consultationId = sessionStorage.getItem('consultationId')

  const [consult, setConsult]   = useState(null)
  const [complaint, setComplaint] = useState(sessionStorage.getItem('triage_complaint') || '')
  const [saving, setSaving]     = useState(false)
  const [visible, setVisible]   = useState(false)

  useEffect(() => {
    if (!consultationId) { navigate('/triage', { replace: true }); return }
    setTimeout(() => setVisible(true), 60)
    getConsultation(consultationId)
      .then(c => {
        setConsult(c)
        if (c?.chief_complaint && !sessionStorage.getItem('triage_complaint')) {
          setComplaint(c.chief_complaint)
        }
      })
      .catch(() => {})
  }, [consultationId, navigate])

  async function handleContinue() {
    setSaving(true)
    try {
      await patientUpdateConsultation(consultationId, { chief_complaint: complaint.trim() })
      sessionStorage.setItem('triage_complaint', complaint.trim())
      navigate('/payment')
    } catch {
      setSaving(false)
    }
  }

  const anim = (delay = '0s') => ({
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(14px)',
    transition: `opacity 0.45s ${delay}, transform 0.45s ${delay}`,
  })

  const patientFirst = consult?.patient_first_name || sessionStorage.getItem('patientName')?.split(' ')[0] || ''
  const consultType  = sessionStorage.getItem('consultationType') || consult?.consultation_type || 'video'
  const isAcc        = (sessionStorage.getItem('accEligible') || consult?.acc_eligible) === 'yes'

  const rows = [
    consult?.medical_history && ['Medical history', consult.medical_history],
    consult?.medications      && ['Medications',     consult.medications],
    consult?.allergies        && ['Allergies',        consult.allergies],
  ].filter(Boolean)

  return (
    <div style={{
      background: NAVY,
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: 'calc(1.5rem + env(safe-area-inset-top))',
      paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))',
      paddingLeft: '1.25rem',
      paddingRight: '1.25rem',
      fontFamily: FF,
      overflowX: 'hidden',
    }}>

      {/* Background circles */}
      <div style={{ position:'fixed', width:300, height:300, borderRadius:'50%', background:TEAL, opacity:.05, top:-80, right:-80, pointerEvents:'none' }} />
      <div style={{ position:'fixed', width:180, height:180, borderRadius:'50%', background:TEAL, opacity:.05, bottom:80, left:-60, pointerEvents:'none' }} />

      <div style={{ width:'100%', maxWidth:420, display:'flex', flexDirection:'column', gap:'1rem' }}>

        {/* Brand */}
        <div style={{ ...anim('0s'), fontFamily:'Cormorant Garamond, serif', fontStyle:'italic', color:TEAL_L, fontSize:'1.3rem', marginBottom:'.25rem' }}>
          Tere
        </div>

        {/* Hero */}
        <div style={{ ...anim('0.08s') }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:'.5rem', background:'rgba(16,185,129,.18)', border:'1px solid rgba(16,185,129,.4)', borderRadius:99, padding:'5px 14px', marginBottom:'.875rem' }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:'#34D399', animation:'glow 1.6s ease-in-out infinite' }} />
            <span style={{ fontSize:'.75rem', fontWeight:700, color:'#6EE7B7', letterSpacing:'.06em', textTransform:'uppercase' }}>Clinic is now open</span>
          </div>
          <h1 style={{ margin:0, fontSize:'1.625rem', fontWeight:800, color:'white', lineHeight:1.2, letterSpacing:'-.01em' }}>
            {patientFirst ? `Ready when you are, ${patientFirst}` : 'Ready when you are'}
          </h1>
          <p style={{ margin:'.5rem 0 0', color:'rgba(212,238,240,.65)', fontSize:'.9rem', lineHeight:1.6 }}>
            Review your details below, update anything that's changed, then continue to payment.
          </p>
        </div>

        {/* Consultation type badge */}
        <div style={{ ...anim('0.16s'), display:'flex', alignItems:'center', gap:'.625rem', background:'rgba(11,110,118,.22)', border:`1px solid rgba(11,110,118,.45)`, borderRadius:12, padding:'.75rem 1rem' }}>
          <span style={{ fontSize:'1.25rem' }}>{consultType === 'phone' ? '📞' : consultType === 'message' ? '💬' : '📹'}</span>
          <div>
            <div style={{ fontWeight:700, color:TEAL_L, fontSize:'.9rem' }}>{TYPE_LABELS[consultType] || 'Video consultation'}</div>
            {isAcc && <div style={{ fontSize:'.75rem', color:'rgba(212,238,240,.55)', marginTop:1 }}>ACC co-payment applies</div>}
          </div>
        </div>

        {/* Complaint editor */}
        <div style={{ ...anim('0.22s'), background:'rgba(255,255,255,.97)', borderRadius:18, padding:'1.25rem', boxShadow:'0 6px 28px rgba(0,0,0,.2)' }}>
          <label style={{ display:'block', fontSize:'.75rem', fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'.625rem' }}>
            Your complaint
          </label>
          <textarea
            value={complaint}
            onChange={e => setComplaint(e.target.value)}
            rows={4}
            placeholder="Describe what's brought you in today…"
            style={{
              width:'100%', boxSizing:'border-box',
              border:'1.5px solid #E5E7EB', borderRadius:10,
              padding:'.75rem', fontFamily:FF, fontSize:'.9375rem',
              color:NAVY, lineHeight:1.6, resize:'vertical',
              outline:'none', transition:'border-color .15s',
            }}
            onFocus={e => e.target.style.borderColor = TEAL}
            onBlur={e => e.target.style.borderColor = '#E5E7EB'}
          />
          <p style={{ margin:'.5rem 0 0', fontSize:'.8rem', color:'#9CA3AF', lineHeight:1.5 }}>
            Edit if anything has changed since you first filled in your details.
          </p>
        </div>

        {/* Other details (read-only) */}
        {rows.length > 0 && (
          <div style={{ ...anim('0.28s'), background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', borderRadius:14, padding:'1rem 1.125rem' }}>
            <div style={{ fontSize:'.7rem', fontWeight:700, color:'rgba(212,238,240,.4)', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:'.75rem' }}>
              Your saved details
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'.625rem' }}>
              {rows.map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize:'.75rem', fontWeight:600, color:'rgba(212,238,240,.45)', marginBottom:2 }}>{label}</div>
                  <div style={{ fontSize:'.875rem', color:'rgba(212,238,240,.8)', lineHeight:1.55 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div style={{ ...anim('0.33s'), display:'flex', flexDirection:'column', gap:'.625rem' }}>
          <button
            onClick={handleContinue}
            disabled={saving || !complaint.trim()}
            style={{
              width:'100%', padding:'14px', border:'none', borderRadius:12,
              background: saving || !complaint.trim() ? '#9CA3AF' : TEAL,
              color:'white', fontFamily:FF, fontWeight:800, fontSize:'1rem',
              cursor: saving || !complaint.trim() ? 'not-allowed' : 'pointer',
              transition:'background .15s, transform .1s',
              letterSpacing:'.01em',
            }}
            onMouseEnter={e => { if (!saving && complaint.trim()) e.currentTarget.style.background = '#0a5a62' }}
            onMouseLeave={e => { if (!saving && complaint.trim()) e.currentTarget.style.background = TEAL }}
          >
            {saving ? 'Saving…' : 'Continue to payment →'}
          </button>

          <p style={{ margin:0, textAlign:'center', fontSize:'.75rem', color:'rgba(255,255,255,.25)' }}>
            Emergency? <a href="tel:111" style={{ color:'#EF4444', fontWeight:700, textDecoration:'none' }}>Call 111</a>
          </p>
        </div>

      </div>

      <style>{`
        @keyframes glow { 0%,100%{opacity:.6} 50%{opacity:1} }
      `}</style>
    </div>
  )
}
