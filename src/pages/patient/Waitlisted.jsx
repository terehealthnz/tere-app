import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getAvailability, getConsultation, getSchedule } from '../../lib/supabase'

const NAVY  = '#0D2B45'
const TEAL  = '#0B6E76'
const TEAL_L = '#D4EEF0'
const FF    = 'Plus Jakarta Sans, sans-serif'

function KiwiMascot() {
  return (
    <svg width="86" height="108" viewBox="0 0 70 90" style={{ animation: 'kiwiBob 2.6s ease-in-out infinite', overflow: 'visible', filter: 'drop-shadow(0 8px 24px rgba(11,110,118,.35))' }}>
      <ellipse cx="35" cy="55" rx="22" ry="20" fill="#6B4F2A"/>
      <ellipse cx="35" cy="32" rx="16" ry="14" fill="#7C5C30"/>
      <path d="M35 32 Q55 28 58 34 Q55 38 35 36Z" fill="#C4A05A" style={{ transformOrigin: '35px 34px', animation: 'kiwiTail 1.8s ease-in-out infinite' }}/>
      <circle cx="42" cy="28" r="3.5" fill="white"/>
      <circle cx="43" cy="28" r="2" fill="#1a1a1a" style={{ transformOrigin: '43px 28px', animation: 'kiwiBlink 3.5s 1.2s infinite' }}/>
      <circle cx="44" cy="27" r=".7" fill="white"/>
      <ellipse cx="20" cy="52" rx="8" ry="12" fill="#5A3E1A" transform="rotate(-10,20,52)"/>
      <path d="M54 62 Q62 55 64 68 Q58 68 54 62Z" fill="#5A3E1A" style={{ transformOrigin: '54px 64px', animation: 'kiwiTail 2s .5s ease-in-out infinite' }}/>
      <line x1="28" y1="73" x2="24" y2="86" stroke="#C4A05A" strokeWidth="3" strokeLinecap="round"/>
      <line x1="38" y1="73" x2="42" y2="86" stroke="#C4A05A" strokeWidth="3" strokeLinecap="round"/>
      <path d="M24 86 Q20 88 18 84 M24 86 Q22 90 19 90 M24 86 Q26 90 24 90" stroke="#C4A05A" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M42 86 Q46 88 48 84 M42 86 Q44 90 47 90 M42 86 Q40 90 42 90" stroke="#C4A05A" strokeWidth="2" fill="none" strokeLinecap="round"/>
      {/* Little "on list" clipboard */}
      <rect x="20" y="82" width="10" height="5" rx="2" fill="white" opacity=".9"/>
      <line x1="25" y1="82" x2="25" y2="87" stroke="#DC2626" strokeWidth="1.5"/>
      {/* Stethoscope */}
      <rect x="10" y="44" width="14" height="20" rx="2" fill="#1A2A33" stroke={TEAL} strokeWidth="1"/>
      <rect x="12" y="46" width="10" height="14" rx="1" fill={TEAL} opacity=".6"/>
      <circle cx="17" cy="62" r="1.5" fill="#555"/>
    </svg>
  )
}

function TealCheck() {
  return (
    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(11,110,118,.18)', border: `1.5px solid ${TEAL}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
        <path d="M1 5l3 3 7-7" stroke={TEAL} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}

export default function Waitlisted() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [visible, setVisible] = useState(false)
  const [consult, setConsult] = useState(null)
  const [nextTimes, setNextTimes] = useState('')

  useEffect(() => {
    setTimeout(() => setVisible(true), 80)

    // Load consultation details for patient summary card
    getConsultation(id).then(c => setConsult(c)).catch(() => {})
    // Load next opening times from schedule
    getSchedule().then(s => setNextTimes(s?.next_times || '')).catch(() => {})

    // Poll availability — redirect when clinic opens
    const check = async () => {
      try {
        const av = await getAvailability()
        if (av.is_open) {
          sessionStorage.setItem('consultationId', id)
          const c = await getConsultation(id)
          sessionStorage.setItem('accEligible', c?.acc_eligible || 'no')
          const { supabase } = await import('../../lib/supabase')
          await supabase.from('consultations')
            .update({ status: 'waiting', updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('status', 'waitlisted')
          navigate('/triage-review', { replace: true })
        }
      } catch {}
    }
    check()
    const interval = setInterval(check, 10000)
    const onVisible = () => { if (!document.hidden) check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [id, navigate])

  const anim = (delay = '0s') => ({
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(16px)',
    transition: `opacity 0.55s ${delay}, transform 0.55s ${delay}`,
  })

  const shortId = id ? id.slice(0, 8).toUpperCase() : ''

  return (
    <div style={{
      background: NAVY,
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: 'calc(2rem + env(safe-area-inset-top))',
      paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))',
      paddingLeft: '1.25rem',
      paddingRight: '1.25rem',
      position: 'relative',
      overflowX: 'hidden',
      fontFamily: FF,
    }}>

      {/* Background circles */}
      <div style={{ position: 'absolute', width: 320, height: 320, borderRadius: '50%', background: TEAL, opacity: .05, top: -100, right: -100, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', background: TEAL, opacity: .05, bottom: 60, left: -80, pointerEvents: 'none' }} />

      {/* Animated wave */}
      <svg style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 70, opacity: .1, pointerEvents: 'none' }} viewBox="0 0 380 70" preserveAspectRatio="none">
        <path d="M0 40 Q95 18 190 40 Q285 62 380 40 L380 70 L0 70 Z" fill={TEAL}/>
        <path d="M0 52 Q95 32 190 52 Q285 72 380 52 L380 70 L0 70 Z" fill={TEAL_L} opacity="0.3"/>
      </svg>

      <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', flex: 1 }}>

        {/* Hero — kiwi + badge + heading */}
        <div style={{ ...anim('0.1s'), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.75rem', marginTop: '.5rem' }}>
          {/* Pulse ring behind kiwi */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', width: 110, height: 110, borderRadius: '50%', border: `2px solid ${TEAL}`, animation: 'pulse 2.4s ease-out infinite', opacity: 0 }} />
            <div style={{ position: 'absolute', width: 90, height: 90, borderRadius: '50%', border: `1.5px solid rgba(11,110,118,.45)`, animation: 'pulse 2.4s .8s ease-out infinite', opacity: 0 }} />
            <KiwiMascot />
          </div>

          {/* "On the list" badge */}
          <div style={{ background: 'rgba(11,110,118,.25)', border: `1px solid rgba(11,110,118,.55)`, borderRadius: 99, padding: '5px 16px', fontSize: '.75rem', fontWeight: 700, color: TEAL_L, letterSpacing: '.07em', textTransform: 'uppercase' }}>
            You're on the list
          </div>

          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: 'white', textAlign: 'center', lineHeight: 1.2, letterSpacing: '-.01em' }}>
            We'll let you know when we open
          </h1>
          <p style={{ margin: 0, color: 'rgba(212,238,240,.75)', fontSize: '.9rem', textAlign: 'center', lineHeight: 1.65, maxWidth: 320 }}>
            We're closed right now but your details are saved. When we open, you'll get a text and email with <strong style={{ color: TEAL_L }}>15 minutes</strong> to complete your consultation.
          </p>
        </div>

        {/* Status card */}
        <div style={{ ...anim('0.25s'), width: '100%', background: 'rgba(255,255,255,.97)', borderRadius: 20, padding: '1.25rem 1.375rem', boxShadow: '0 8px 32px rgba(0,0,0,.22)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem', marginBottom: '1rem' }}>
            {[
              'Your details are saved',
              "We'll notify you when we open",
              'You have 15 minutes to respond',
            ].map(text => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                <TealCheck />
                <span style={{ fontSize: '.9rem', fontWeight: 600, color: '#1A2A33' }}>{text}</span>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid #F0F2F5', paddingTop: '.875rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: nextTimes ? '#F59E0B' : '#9CA3AF', animation: nextTimes ? 'dotPulse 1.8s ease-in-out infinite' : 'none', flexShrink: 0 }} />
            <span style={{ fontSize: '.8125rem', color: '#6B7280' }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>Next available: </span>
              {nextTimes || 'Check back soon'}
            </span>
          </div>
        </div>

        {/* What happens next */}
        <div style={{ ...anim('0.38s'), width: '100%' }}>
          <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'rgba(212,238,240,.45)', textTransform: 'uppercase', letterSpacing: '.1em', textAlign: 'center', marginBottom: '.875rem' }}>
            What happens next
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.625rem' }}>
            {[
              { icon: '📱', title: "We'll text and email you", desc: 'We send a notification the moment the clinic opens' },
              { icon: '⏱️', title: 'You have 15 minutes', desc: 'Tap the link in your notification to secure your spot' },
              { icon: '🩺', title: 'See a provider', desc: 'Complete your consultation via video or phone' },
            ].map(({ icon, title, desc }) => (
              <div key={title} style={{ display: 'flex', gap: '.875rem', alignItems: 'flex-start', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 14, padding: '.875rem 1rem' }}>
                <div style={{ fontSize: '1.375rem', lineHeight: 1, flexShrink: 0, marginTop: 1 }}>{icon}</div>
                <div>
                  <div style={{ fontWeight: 700, color: 'white', fontSize: '.875rem', marginBottom: 2 }}>{title}</div>
                  <div style={{ color: 'rgba(212,238,240,.65)', fontSize: '.8125rem', lineHeight: 1.45 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Patient reference card */}
        {consult && (
          <div style={{ ...anim('0.48s'), width: '100%', background: 'rgba(11,110,118,.12)', border: '1px solid rgba(11,110,118,.3)', borderRadius: 14, padding: '.875rem 1rem' }}>
            <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'rgba(212,238,240,.5)', textTransform: 'uppercase', letterSpacing: '.09em', marginBottom: '.625rem' }}>
              Your saved details
            </div>
            {[
              ['Saved for', consult.patient_first_name ? `${consult.patient_first_name} ${consult.patient_last_name || ''}`.trim() : null],
              ['Complaint', consult.chief_complaint],
              ['Reference', shortId],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '.8125rem' }}>
                <span style={{ color: 'rgba(212,238,240,.55)' }}>{k}</span>
                <span style={{ fontWeight: 600, color: TEAL_L, maxWidth: '65%', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
              </div>
            ))}
          </div>
        )}

        {/* Book instead CTA */}
        <div style={{ ...anim('0.55s'), width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '.8rem', color: 'rgba(212,238,240,.55)', marginBottom: '.625rem' }}>
            Don't want to wait?
          </div>
          <button
            onClick={() => { window.location.href = '/book' }}
            style={{ width: '100%', padding: '12px 20px', border: `1.5px solid rgba(212,238,240,.35)`, borderRadius: 12, background: 'rgba(255,255,255,.07)', color: 'rgba(212,238,240,.9)', cursor: 'pointer', fontFamily: FF, fontWeight: 700, fontSize: '.9375rem', letterSpacing: '.01em', transition: 'all .15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.12)'; e.currentTarget.style.borderColor = 'rgba(212,238,240,.55)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.07)'; e.currentTarget.style.borderColor = 'rgba(212,238,240,.35)' }}
          >
            Book a guaranteed time slot →
          </button>
        </div>

        {/* Polling indicator */}
        <div style={{ ...anim('0.6s'), display: 'flex', alignItems: 'center', gap: '.5rem', color: 'rgba(212,238,240,.35)', fontSize: '.75rem' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(11,110,118,.7)', animation: 'dotPulse 1.4s ease-in-out infinite' }} />
          Checking for clinic opening…
        </div>

        {/* Emergency */}
        <div style={{ ...anim('0.65s'), textAlign: 'center', paddingTop: '.25rem' }}>
          <p style={{ margin: 0, fontSize: '.8rem', color: 'rgba(255,255,255,.3)' }}>
            Emergency?{' '}
            <a href="tel:111" style={{ color: '#EF4444', fontWeight: 700, textDecoration: 'none' }}>Call 111</a>
            {' '}immediately.
          </p>
        </div>

      </div>

      <style>{`
        @keyframes kiwiBob   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        @keyframes kiwiBlink { 0%,88%,100%{transform:scaleY(1)} 93%{transform:scaleY(.08)} }
        @keyframes kiwiTail  { 0%,100%{transform:rotate(-10deg)} 50%{transform:rotate(10deg)} }
        @keyframes pulse     { 0%{transform:scale(.85);opacity:.55} 100%{transform:scale(1.55);opacity:0} }
        @keyframes dotPulse  { 0%,100%{opacity:.4} 50%{opacity:1} }
      `}</style>
    </div>
  )
}
