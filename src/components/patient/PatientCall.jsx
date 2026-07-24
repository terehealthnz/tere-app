import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { LiveKitRoom, VideoConference } from '@livekit/components-react'
import '@livekit/components-styles'
import ChatPanel from '../ChatPanel'
import { apiFetch } from '../../lib/api'
import { getPatientConsult } from '../../lib/supabase'
import { getLangMeta, t } from '../../lib/i18n'
import CallSubtitles from '../clinical/CallSubtitles'

export default function PatientCall() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [token, setToken] = useState(null)
  const [serverUrl, setServerUrl] = useState(null)
  const [error, setError] = useState(null)
  // Consult status gate — determines whether the patient can join now, has to
  // wait through a cooldown, or has been marked no-show. See the two-attempt
  // no-show flow in supabase-no-show-migration.sql.
  //
  // gate:
  //   'loading'              — still checking DB
  //   'no_show'              — provider marked no-show; show sorry screen
  //   'cooldown'             — provider timed out ring; wait until cooldown_until
  //   'waiting_for_provider' — cooldown elapsed but provider hasn't restarted
  //                            call yet; poll until status=in_progress
  //   'ready'                — status is joinable; fetch LiveKit token
  const [gate, setGate] = useState('loading')
  const [cooldownUntil, setCooldownUntil] = useState(null)
  const [nowTick, setNowTick] = useState(Date.now())
  // Opt-in subtitles. Off by default even for non-English patients — many
  // understand enough English that firing STT + Bedrock every consult is
  // wasted spend. Patient clicks "Show subtitles" if they can't follow the
  // provider. Once ON they can Hide during the same call.
  const [subtitlesOn, setSubtitlesOn] = useState(false)
  // Prefer ?consultation=<id> from the email deep-link (empty sessionStorage on
  // a fresh browser). Fall back to sessionStorage for in-app navigation.
  const urlConsultId = params.get('consultation')
  if (urlConsultId && !sessionStorage.getItem('consultationId')) {
    sessionStorage.setItem('consultationId', urlConsultId)
  }
  const consultationId = urlConsultId || sessionStorage.getItem('consultationId')
  const ssType = sessionStorage.getItem('consultationType')
  const [consultationType, setConsultationType] = useState(ssType || 'video')
  // Both 'phone' (legacy) and 'consult' (unified type) default to audio-only —
  // camera is a toggle on top, not a mode. Only historical 'video' defaults
  // camera on.
  const isPhone = consultationType === 'phone' || consultationType === 'consult'

  // When sessionStorage was cleared (browser reopened), fetch type from DB
  useEffect(() => {
    if (!consultationId || ssType) return
    getPatientConsult(consultationId).then(c => {
      if (c?.consultation_type) {
        setConsultationType(c.consultation_type)
        sessionStorage.setItem('consultationType', c.consultation_type)
      }
    }).catch(() => {})
  }, [consultationId])

  // Poll consult status. Runs every 3s whenever we're in a gated state so we
  // can detect status flips (cooldown → waiting → in_progress) without the
  // patient having to click anything.
  useEffect(() => {
    if (!consultationId) return
    let cancelled = false
    async function checkStatus() {
      try {
        const c = await getPatientConsult(consultationId)
        if (cancelled || !c) return
        if (c.status === 'no_show') {
          setGate('no_show')
          return
        }
        const cd = c.cooldown_until ? new Date(c.cooldown_until) : null
        if (cd && cd > new Date()) {
          setCooldownUntil(cd)
          setGate('cooldown')
          return
        }
        if (c.status === 'in_progress' || c.status === 'ready') {
          setGate('ready')
          return
        }
        // 'waiting' post-cooldown, or any other joinable-ish state: sit tight
        // and keep polling; the provider will re-initiate the call soon.
        if (cd && cd <= new Date()) {
          setGate('waiting_for_provider')
          return
        }
        // Normal fresh call — go straight through.
        setGate('ready')
      } catch { /* transient — keep last gate */ }
    }
    checkStatus()
    const interval = setInterval(checkStatus, 3000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [consultationId])

  // Cooldown countdown ticker — only ticks while in cooldown gate.
  useEffect(() => {
    if (gate !== 'cooldown') return
    const t = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [gate])

  // Keep screen awake during consultation
  useEffect(() => {
    let wakeLock = null
    async function acquire() {
      try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen') } catch {}
    }
    acquire()
    const reacquire = () => { if (document.visibilityState === 'visible') acquire() }
    document.addEventListener('visibilitychange', reacquire)
    return () => {
      document.removeEventListener('visibilitychange', reacquire)
      wakeLock?.release().catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!consultationId) { navigate('/start'); return }
    // Only fetch a LiveKit token once the status gate says it's OK to join.
    // While cooldown/waiting/no_show we render a dedicated screen instead.
    if (gate !== 'ready') return
    if (token) return

    async function fetchToken() {
      try {
        const res = await apiFetch('/api/join-room', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consultationId,
            identity: `patient-${consultationId.slice(0, 8)}`,
          }),
        })
        if (!res.ok) throw new Error('Server error')
        const data = await res.json()
        if (!data.token) throw new Error('No token received')
        setToken(data.token)
        setServerUrl(data.serverUrl)
      } catch (e) {
        console.error(e)
        setError('Could not connect. Please refresh and try again.')
      }
    }

    fetchToken()
  }, [consultationId, navigate, gate, token])

  // Gated: no-show — provider tried twice and marked us as missed. Payment
  // hold has been released. Offer patient a path back into triage.
  if (gate === 'no_show') return (
    <div style={{ height:'100dvh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0D1117', fontFamily:'Plus Jakarta Sans, sans-serif', color:'white', gap:'1.25rem', padding:'2rem', textAlign:'center' }}>
      <div style={{ fontSize:'2.5rem' }}>💔</div>
      <div style={{ fontWeight:800, fontSize:'1.5rem' }}>We missed you today</div>
      <p style={{ color:'rgba(255,255,255,.7)', maxWidth:400, lineHeight:1.6 }}>
        We tried to reach you twice and weren't able to connect. <strong style={{ color:'white' }}>No charge has been applied.</strong> Please start a new consultation whenever you're ready.
      </p>
      <button onClick={() => { sessionStorage.clear(); navigate('/start') }}
        style={{ background:'var(--teal, #0B6E76)', border:'none', color:'white', padding:'12px 28px', borderRadius:99, cursor:'pointer', fontFamily:'Plus Jakarta Sans, sans-serif', fontWeight:700, fontSize:'1rem', marginTop:'.5rem' }}>
        Start a new consultation →
      </button>
      <div style={{ marginTop:'2rem', fontSize:'.8125rem', color:'rgba(255,255,255,.4)' }}>
        Emergency? <a href="tel:111" style={{ color:'white', fontWeight:700 }}>Call 111</a>
      </div>
    </div>
  )

  // Gated: cooldown — provider tried once and stepped away. Countdown until
  // they're able to try again. Poll flips gate to 'waiting_for_provider' at 0,
  // then to 'ready' once the provider re-initiates the call.
  if (gate === 'cooldown' && cooldownUntil) {
    const msLeft = Math.max(0, cooldownUntil - nowTick)
    const secs = Math.round(msLeft / 1000)
    const mm = String(Math.floor(secs / 60))
    const ss = String(secs % 60).padStart(2, '0')
    return (
      <div style={{ height:'100dvh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0D1117', fontFamily:'Plus Jakarta Sans, sans-serif', color:'white', gap:'1.25rem', padding:'2rem', textAlign:'center' }}>
        <div style={{ fontSize:'2.5rem' }}>🕐</div>
        <div style={{ fontWeight:800, fontSize:'1.5rem' }}>Your provider will try again shortly</div>
        <div style={{ fontFamily:'monospace', fontSize:'3rem', fontWeight:800, color:'#0B6E76', lineHeight:1 }}>
          {mm}:{ss}
        </div>
        <p style={{ color:'rgba(255,255,255,.7)', maxWidth:380, lineHeight:1.6 }}>
          Please keep this page open. When your provider is ready, this screen will connect you automatically.
        </p>
        <div style={{ marginTop:'2rem', fontSize:'.8125rem', color:'rgba(255,255,255,.4)' }}>
          Emergency? <a href="tel:111" style={{ color:'white', fontWeight:700 }}>Call 111</a>
        </div>
      </div>
    )
  }

  // Gated: cooldown elapsed, provider hasn't started attempt 2 yet. Spinner
  // + status polling every 3s; gate flips to 'ready' when they click Start.
  if (gate === 'waiting_for_provider') return (
    <div style={{ height:'100dvh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0D1117', fontFamily:'Plus Jakarta Sans, sans-serif', color:'white', gap:'1.25rem', padding:'2rem', textAlign:'center' }}>
      <div style={{ width:52, height:52, border:'4px solid rgba(255,255,255,.15)', borderTopColor:'#0B6E76', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <div style={{ fontWeight:800, fontSize:'1.25rem', marginTop:'.5rem' }}>Waiting for your provider…</div>
      <p style={{ color:'rgba(255,255,255,.6)', maxWidth:380, lineHeight:1.6, fontSize:'.9375rem' }}>
        Please keep this page open. You'll be connected automatically as soon as your provider is ready.
      </p>
      <div style={{ marginTop:'2rem', fontSize:'.8125rem', color:'rgba(255,255,255,.4)' }}>
        Emergency? <a href="tel:111" style={{ color:'white', fontWeight:700 }}>Call 111</a>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (gate === 'loading') return (
    <div style={{ height:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0D1117', fontFamily:'Plus Jakarta Sans, sans-serif' }}>
      <div style={{ textAlign:'center', color:'rgba(255,255,255,.6)' }}>
        <div style={{ width:36, height:36, border:'3px solid var(--teal, #0B6E76)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 1rem' }}/>
        <div>Checking your appointment…</div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (error) return (
    <div style={{height:'100dvh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'#0D1117',fontFamily:'Plus Jakarta Sans, sans-serif',color:'white',gap:'1rem',padding:'2rem',textAlign:'center'}}>
      <div style={{fontSize:'2rem'}}>⚠️</div>
      <p style={{color:'rgba(255,255,255,.7)',maxWidth:360,lineHeight:1.6}}>{error}</p>
      <button onClick={() => navigate('/waiting')}
        style={{background:'var(--teal)',border:'none',color:'white',padding:'10px 24px',borderRadius:'8px',cursor:'pointer',fontFamily:'Plus Jakarta Sans, sans-serif',fontWeight:600}}>
        Go back
      </button>
    </div>
  )

  if (!token || !serverUrl) return (
    <div style={{height:'100dvh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0D1117',fontFamily:'Plus Jakarta Sans, sans-serif'}}>
      <div style={{textAlign:'center',color:'rgba(255,255,255,.6)'}}>
        <div style={{width:36,height:36,border:'3px solid var(--teal)',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 1rem'}}/>
        <div>Connecting to {isPhone ? 'call' : 'video call'}…</div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ position: 'relative', height: '100dvh' }}>
      {isPhone && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
          background: 'rgba(11,110,118,.9)', padding: '.5rem 1rem',
          paddingTop: 'calc(.5rem + env(safe-area-inset-top, 0px))',
          display: 'flex', alignItems: 'center', gap: '.5rem',
          fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.875rem', color: 'white',
        }}>
          <span>📞</span>
          <span style={{ fontWeight: 600 }}>Audio call in progress</span>
          <span style={{ color: 'rgba(255,255,255,.75)', fontSize: '.8125rem' }}>— tap the 📷 camera button to turn on video any time</span>
        </div>
      )}
      {/* Scoped style — hides LiveKit's Share screen button on the patient
          side only. Provider still gets it via ProviderConsult's identical
          <VideoConference/>. LiveKit doesn't expose a prop to disable
          individual controls on the bundled VideoConference component,
          so we target the button by its data-lk-source attribute. */}
      <style>{`.tere-patient-lk [data-lk-source="screen_share"] { display: none !important; }`}</style>
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        // Camera off by default for audio-first consults; VideoConference's
        // ControlBar still exposes the toggle so the patient can turn it on
        // to show something clinical (rash, wound, etc.) mid-call.
        video={!isPhone}
        audio={true}
        data-lk-theme="default"
        className="tere-patient-lk"
        style={{ height: '100dvh' }}
        onDisconnected={() => navigate('/done')}
      >
        <VideoConference />
        {(() => {
          const patientLang = sessionStorage.getItem('patient_language') || 'en'
          const meta = getLangMeta(patientLang)
          const supported = meta && (meta.subtitleSupport === 'excellent' || meta.subtitleSupport === 'very_good')
          if (patientLang === 'en' || !supported) return null
          // Subtitles component only renders when enabled; when the patient
          // Hides them (subtitlesOn=false) the offer pill comes back so they
          // can turn them on again mid-call.
          if (!subtitlesOn) {
            // Compact offer pill in the top-right — unobtrusive when the
            // patient doesn't need translation, one tap away when they do.
            return (
              <button
                onClick={() => setSubtitlesOn(true)}
                title={t('subtitle_offer_hint', patientLang)}
                style={{
                  position: 'fixed', top: 'calc(12px + env(safe-area-inset-top, 0px))', right: 12, zIndex: 40,
                  background: 'rgba(11,110,118,.92)', color: 'white',
                  border: '1px solid rgba(255,255,255,.25)',
                  padding: '8px 14px', borderRadius: 99,
                  fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, fontSize: '.8125rem',
                  cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,.4)',
                  backdropFilter: 'blur(6px)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                <span style={{ fontSize: '.75rem', opacity: .8, fontWeight: 600 }}>{t('subtitle_offer_hint', patientLang)}</span>
                <span>💬 {t('subtitle_offer_btn', patientLang)}</span>
              </button>
            )
          }
          return (
            <CallSubtitles
              viewerRole="patient"
              viewerLang={patientLang}
              speakerLang="en"
              enabled={true}
              modalOpen={false}
              consultationId={consultationId}
              onHide={() => setSubtitlesOn(false)}
            />
          )
        })()}
      </LiveKitRoom>
      {consultationId && (
        <div style={{ position: 'absolute', bottom: 0, right: 0, top: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'relative', height: '100%', pointerEvents: 'auto' }}>
            <ChatPanel
              consultationId={consultationId}
              sender="patient"
              patientLanguage={sessionStorage.getItem('patient_language') || 'en'}
              style={{ bottom: 90, right: 16 }}
            />
          </div>
        </div>
      )}
      <div style={{position:'absolute',top:0,left:0,right:0,zIndex:4,pointerEvents:'none',display:'flex',justifyContent:'center'}}>
        <div style={{background:'rgba(0,0,0,.5)',backdropFilter:'blur(4px)',color:'rgba(255,255,255,.7)',fontSize:'.75rem',padding:'3px 10px',borderRadius:'0 0 6px 6px'}}>
          Emergency? <a href="tel:111" style={{color:'white',fontWeight:700,pointerEvents:'auto'}}>Call 111</a>
        </div>
      </div>
    </div>
  )
}
