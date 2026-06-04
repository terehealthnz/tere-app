import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LANGUAGES, t } from '../../lib/i18n'

export default function TereIntro({ onStart }) {
  const navigate = useNavigate()
  const [v, setV] = useState(false)
  const [starting, setStarting] = useState(false)
  const [lang, setLang] = useState(() => sessionStorage.getItem('patient_language') || 'en')
  useEffect(() => { setTimeout(() => setV(true), 100) }, [])

  async function handleStart() {
    if (starting) return
    setStarting(true)
    try {
      const { supabase } = await import('../../lib/supabase')
      const ua = navigator?.userAgent || ''
      const deviceType = /Mobile|iPhone|Android/.test(ua) ? (/iPad/.test(ua) ? 'tablet' : 'mobile') : 'desktop'
      const { data: pt } = await supabase
        .from('consultations')
        .insert({ status: 'pre_triage', patient_language: lang, device_type: deviceType })
        .select('id')
        .single()
      if (pt?.id) sessionStorage.setItem('consultation_id', pt.id)
    } catch {}
    if (onStart) onStart()
    else navigate('/consent')
  }

  function selectLang(code) {
    setLang(code)
    sessionStorage.setItem('patient_language', code)
  }
  const anim = (delay) => ({
    opacity: v ? 1 : 0,
    transform: v ? 'translateY(0)' : 'translateY(12px)',
    transition: `all 0.6s ${delay}`,
  })

  return (
    <main style={{ background:'#0D2B45', minHeight:'100dvh', display:'flex', flexDirection:'column', paddingTop:'calc(1.5rem + env(safe-area-inset-top))', paddingBottom:'2rem', paddingLeft:'1.5rem', paddingRight:'1.5rem', position:'relative', overflowX:'hidden', fontFamily:'Plus Jakarta Sans, sans-serif' }}>
      {/* Bg circles */}
      <div style={{ position:'absolute', width:300, height:300, borderRadius:'50%', background:'#0B6E76', opacity:.06, top:-80, right:-80 }} />
      <div style={{ position:'absolute', width:200, height:200, borderRadius:'50%', background:'#0B6E76', opacity:.06, bottom:-60, left:-60 }} />


{/* Wave */}
      <svg style={{ position:'absolute', bottom:0, left:0, width:'100%', height:60, opacity:.08 }} viewBox="0 0 380 60" preserveAspectRatio="none">
        <path d="M0 40 Q95 20 190 40 Q285 60 380 40 L380 60 L0 60 Z" fill="#0B6E76"/>
        <path d="M0 50 Q95 30 190 50 Q285 70 380 50 L380 60 L0 60 Z" fill="#D4EEF0" opacity="0.3"/>
      </svg>

      <div style={{ marginTop:'auto', marginBottom:'auto', display:'flex', flexDirection:'column', alignItems:'center', width:'100%' }}>
      {/* Logo */}
      <div style={{ ...anim('0.2s'), fontFamily:'Cormorant Garamond, Georgia, serif', fontStyle:'italic', fontSize:'2.8rem', color:'#D4EEF0', letterSpacing:'0.05em', marginBottom:2 }}>Tere Health</div>
      <div style={{ ...anim('0.4s'), fontSize:'0.65rem', color:'rgba(212,238,240,0.82)', letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:'1.25rem' }}>Emergency medicine. On your phone.</div>

      {/* Stage */}
      <div style={{ ...anim('0.8s'), display:'flex', alignItems:'flex-end', justifyContent:'center', gap:'1.5rem', marginBottom:'1rem' }}>
        {/* Kiwi */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
          <div style={{ background:'rgba(11,110,118,.25)', border:'1px solid rgba(11,110,118,.5)', borderRadius:'12px 12px 12px 2px', padding:'6px 10px', fontSize:'0.7rem', color:'#D4EEF0', marginBottom:4, opacity: v?1:0, transition:'opacity 0.5s 1.6s' }}>
            Sore ankle doc 🦵
          </div>
          <svg width="70" height="90" viewBox="0 0 70 90" style={{ animation:'bob 2.5s 1.2s infinite', overflow:'visible' }}>
            <ellipse cx="35" cy="55" rx="22" ry="20" fill="#6B4F2A"/>
            <ellipse cx="35" cy="32" rx="16" ry="14" fill="#7C5C30"/>
            <path d="M35 32 Q55 28 58 34 Q55 38 35 36Z" fill="#C4A05A" style={{ transformOrigin:'35px 34px', animation:'tail 1.8s 1s infinite ease-in-out' }}/>
            <circle cx="42" cy="28" r="3.5" fill="white"/>
            <circle cx="43" cy="28" r="2" fill="#1a1a1a" style={{ transformOrigin:'43px 28px', animation:'blink 3s 1.5s infinite' }}/>
            <circle cx="44" cy="27" r=".7" fill="white"/>
            <ellipse cx="20" cy="52" rx="8" ry="12" fill="#5A3E1A" transform="rotate(-10,20,52)"/>
            <path d="M54 62 Q62 55 64 68 Q58 68 54 62Z" fill="#5A3E1A" style={{ transformOrigin:'54px 64px', animation:'tail 2s .5s infinite ease-in-out' }}/>
            <line x1="28" y1="73" x2="24" y2="86" stroke="#C4A05A" strokeWidth="3" strokeLinecap="round"/>
            <line x1="38" y1="73" x2="42" y2="86" stroke="#C4A05A" strokeWidth="3" strokeLinecap="round"/>
            <path d="M24 86 Q20 88 18 84 M24 86 Q22 90 19 90 M24 86 Q26 90 24 90" stroke="#C4A05A" strokeWidth="2" fill="none" strokeLinecap="round"/>
            <path d="M42 86 Q46 88 48 84 M42 86 Q44 90 47 90 M42 86 Q40 90 42 90" stroke="#C4A05A" strokeWidth="2" fill="none" strokeLinecap="round"/>
            <rect x="20" y="82" width="10" height="5" rx="2" fill="white" opacity=".9"/>
            <line x1="25" y1="82" x2="25" y2="87" stroke="#DC2626" strokeWidth="1.5"/>
            <rect x="10" y="44" width="14" height="20" rx="2" fill="#1A2A33" stroke="#0B6E76" strokeWidth="1"/>
            <rect x="12" y="46" width="10" height="14" rx="1" fill="#0B6E76" opacity=".6"/>
            <circle cx="17" cy="62" r="1.5" fill="#555"/>
          </svg>
          <div style={{ fontSize:'.7rem', color:'rgba(212,238,240,0.87)', textTransform:'uppercase', letterSpacing:'.08em' }}>Patient</div>
        </div>

        {/* Signal */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, paddingBottom:30 }}>
          <div style={{ display:'flex', gap:3, opacity: v?1:0, transition:'opacity 0.4s 2s' }}>
            {[6,9,12,15].map((h,i) => <div key={i} style={{ width:3, height:h, background:'#0B6E76', borderRadius:1, animation:`bob .6s ${i*.1}s infinite` }} />)}
          </div>
          <svg width="40" height="28" viewBox="0 0 40 28" style={{ opacity:.5 }}>
            <path d="M5 14 Q20 4 35 14" stroke="#0B6E76" strokeWidth="1.5" fill="none" strokeDasharray="3 2"/>
            <path d="M10 20 Q20 12 30 20" stroke="#0B6E76" strokeWidth="1.5" fill="none" strokeDasharray="3 2"/>
          </svg>
          <div style={{ fontSize:'.6rem', color:'rgba(212,238,240,0.72)', letterSpacing:'.05em' }}>SECURE</div>
        </div>

        {/* Doctor */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
          <div style={{ background:'rgba(11,110,118,.25)', border:'1px solid rgba(11,110,118,.5)', borderRadius:'12px 12px 2px 12px', padding:'6px 10px', fontSize:'0.7rem', color:'#D4EEF0', marginBottom:4, opacity: v?1:0, transition:'opacity 0.5s 2s', display:'flex', gap:3, alignItems:'center' }}>
            <span style={{ width:5, height:5, background:'#0B6E76', borderRadius:'50%', animation:'bob .8s infinite', display:'inline-block' }}/>
            <span style={{ width:5, height:5, background:'#0B6E76', borderRadius:'50%', animation:'bob .8s .15s infinite', display:'inline-block' }}/>
            <span style={{ width:5, height:5, background:'#0B6E76', borderRadius:'50%', animation:'bob .8s .3s infinite', display:'inline-block' }}/>
          </div>
          <svg width="70" height="90" viewBox="0 0 70 90" style={{ animation:'bob 2.8s 1.4s infinite', overflow:'visible' }}>
            <rect x="14" y="50" width="42" height="36" rx="8" fill="white"/>
            <rect x="18" y="52" width="34" height="32" rx="6" fill="#0B6E76" opacity=".15"/>
            <path d="M28 50 L35 60 L42 50" fill="none" stroke="#E5E7EB" strokeWidth="1.5"/>
            <path d="M26 58 Q20 65 22 72 Q24 78 30 78 Q36 78 38 72" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="38" cy="72" r="4" fill="#374151"/>
            <circle cx="38" cy="72" r="2.5" fill="#6B7280"/>
            <rect x="38" y="60" width="12" height="8" rx="2" fill="none" stroke="#E5E7EB" strokeWidth="1"/>
            <line x1="42" y1="60" x2="42" y2="64" stroke="#0B6E76" strokeWidth="1.5"/>
            <ellipse cx="35" cy="32" rx="15" ry="17" fill="#FDDBB4"/>
            <ellipse cx="35" cy="18" rx="15" ry="8" fill="#374151"/>
            <rect x="20" y="18" width="30" height="8" fill="#374151"/>
            <ellipse cx="28" cy="32" rx="3" ry="3.5" fill="white"/>
            <ellipse cx="42" cy="32" rx="3" ry="3.5" fill="white"/>
            <circle cx="29" cy="33" r="2" fill="#1a1a1a" style={{ transformOrigin:'29px 33px', animation:'blink 4s 2s infinite' }}/>
            <circle cx="43" cy="33" r="2" fill="#1a1a1a" style={{ transformOrigin:'43px 33px', animation:'blink 4s 2s infinite' }}/>
            <circle cx="29.5" cy="32.5" r=".6" fill="white"/>
            <circle cx="43.5" cy="32.5" r=".6" fill="white"/>
            <path d="M28 40 Q35 46 42 40" fill="none" stroke="#C9956A" strokeWidth="1.5" strokeLinecap="round"/>
            <ellipse cx="20" cy="32" rx="3" ry="4" fill="#FDDBB4"/>
            <ellipse cx="50" cy="32" rx="3" ry="4" fill="#FDDBB4"/>
            <rect x="46" y="44" width="14" height="20" rx="2" fill="#1A2A33" stroke="#0B6E76" strokeWidth="1"/>
            <rect x="48" y="46" width="10" height="14" rx="1" fill="#0B6E76" opacity=".6"/>
            <circle cx="53" cy="62" r="1.5" fill="#555"/>
          </svg>
          <div style={{ fontSize:'.7rem', color:'rgba(212,238,240,0.87)', textTransform:'uppercase', letterSpacing:'.08em' }}>Doctor</div>
        </div>
      </div>

      {/* Language selector */}
      <div style={{ ...anim('2s'), marginBottom:'1.25rem', width:'100%', maxWidth:360 }}>
        <div style={{ fontSize:'.65rem', color:'rgba(212,238,240,0.82)', textAlign:'center', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:'.625rem' }}>
          {t('choose_language', lang)}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:6 }}>
          {LANGUAGES.map(l => (
            <button key={l.code} onClick={() => selectLang(l.code)}
              style={{ background: lang === l.code ? 'rgba(11,110,118,.5)' : 'rgba(255,255,255,.07)', border: `1.5px solid ${lang === l.code ? '#0B6E76' : 'rgba(255,255,255,.12)'}`, borderRadius:8, padding:'6px 4px', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:2, transition:'all .15s' }}>
              <span style={{ fontSize:'1.25rem', lineHeight:1 }}>{l.flag}</span>
              <span style={{ fontSize:'.6rem', color: lang === l.code ? '#D4EEF0' : 'rgba(212,238,240,0.87)', fontFamily:'Plus Jakarta Sans, sans-serif', fontWeight: lang === l.code ? 700 : 400 }}>{l.nativeName}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Steps */}
      <div style={{ ...anim('2.5s'), display:'flex', gap:'.75rem', marginBottom:'1.25rem', width:'100%', maxWidth:320 }}>
        {[['1','step_1'],['2','step_2'],['3','step_3'],['4','step_4']].map(([n,key]) => (
          <div key={n} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            <div style={{ width:28, height:28, borderRadius:'50%', background:'rgba(11,110,118,.3)', border:'1px solid rgba(11,110,118,.6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.75rem', color:'#D4EEF0', fontWeight:600 }}>{n}</div>
            <div style={{ fontSize:'.65rem', color:'rgba(212,238,240,0.87)', textAlign:'center', lineHeight:1.3 }}>{t(key, lang)}</div>
          </div>
        ))}
      </div>

      {/* Buttons */}
      {(() => { const bookingEnabled = import.meta.env.VITE_BOOKING_ENABLED === 'true'; return (
      <div style={{ ...anim('2.8s'), display:'flex', flexDirection:'column', gap:'.625rem', width:'100%', maxWidth:320 }}>
        <button onClick={handleStart} disabled={starting} data-testid="kiwi-cta" style={{ background:'#0B6E76', color:'white', border:'none', padding:'.875rem 1.5rem', borderRadius:12, fontSize:'.9375rem', fontWeight:700, cursor:'pointer', textAlign:'left', width:'100%', fontFamily:'Plus Jakarta Sans, sans-serif', opacity: starting ? 0.8 : 1 }}>
          <div>{t('get_started', lang)} →</div>
          <div style={{ fontWeight:400, fontSize:'.8rem', opacity:.95, marginTop:2 }}>Join the queue — see a provider today</div>
        </button>
        {/* BOOKING DISABLED — set VITE_BOOKING_ENABLED=true in Vercel to re-enable */}
        {bookingEnabled && (
          <button onClick={() => navigate('/book')} style={{ background:'rgba(255,255,255,.08)', color:'#D4EEF0', border:'1.5px solid rgba(212,238,240,.3)', padding:'.875rem 1.5rem', borderRadius:12, fontSize:'.9375rem', fontWeight:700, cursor:'pointer', textAlign:'left', width:'100%', fontFamily:'Plus Jakarta Sans, sans-serif' }}>
            <div>Book for later</div>
            <div style={{ fontWeight:400, fontSize:'.8rem', color:'rgba(212,238,240,0.87)', marginTop:2 }}>Reserve a time slot — $15 reservation fee</div>
          </button>
        )}
      </div>
      )})()}

      <div style={{ ...anim('3s'), display:'flex', gap:'1.25rem', marginTop:'.875rem', justifyContent:'center' }}>
        <Link to="/clinician" style={{ color:'rgba(212,238,240,0.72)', fontSize:'.75rem', textDecoration:'none', fontFamily:'Plus Jakarta Sans, sans-serif' }}>Provider login</Link>
        <Link to="/admin" style={{ color:'rgba(212,238,240,0.72)', fontSize:'.75rem', textDecoration:'none', fontFamily:'Plus Jakarta Sans, sans-serif' }}>Admin</Link>
        <Link to="/employers" style={{ color:'rgba(212,238,240,0.72)', fontSize:'.75rem', textDecoration:'none', fontFamily:'Plus Jakarta Sans, sans-serif' }}>For employers</Link>
      </div>

      <Link to="/careers" style={{ ...anim('3.1s'), display:'inline-block', background:'#F59E0B', color:'#1a1a1a', textDecoration:'none', padding:'5px 14px', borderRadius:99, fontSize:'.75rem', fontWeight:700, marginTop:'.625rem', fontFamily:'Plus Jakarta Sans, sans-serif' }}>
        We're hiring →
      </Link>
      </div>

      <div style={{ ...anim('3.2s'), position:'absolute', bottom:'1rem', fontSize:'.65rem', color:'rgba(255,255,255,.2)' }}>
        Marlborough Sounds, New Zealand · terehealth.co.nz
      </div>

      <style>{`
        @keyframes bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes blink { 0%,90%,100%{transform:scaleY(1)} 95%{transform:scaleY(.1)} }
        @keyframes tail { 0%,100%{transform:rotate(-10deg)} 50%{transform:rotate(10deg)} }
      `}</style>
    </main>
  )
}