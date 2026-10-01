import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { LiveKitRoom, VideoConference, useRoomContext, useParticipants } from '@livekit/components-react'
import '@livekit/components-styles'

// Shared intent flag consumed by <LiveKitRoom onDisconnected>. Any code path
// that deliberately tears down the call sets this to 'done' or 'waiting'
// BEFORE calling room.disconnect(). If the room disconnects without one of
// those flags (e.g. LiveKit's built-in disconnect button slipped past our
// CSS, network death), we default to /waiting/:id — safer than /done which
// declares the consult complete + fires the provider-side wrap-up cascade.
let __tereLeaveIntent = null

// Auto-leave when the provider disconnects. LiveKit's onDisconnected only
// fires when THIS client leaves, so without this watcher the patient sits
// alone in a live room with mic + camera still hot after the provider ends
// the call. We hook participantDisconnected on the Room and pull the plug
// once no remote (i.e. provider) remains — that triggers our onDisconnected
// handler above and navigates to /done.
function ProviderLeaveWatcher() {
  const room = useRoomContext()
  useEffect(() => {
    if (!room) return
    // Grace period before we conclude the provider is really gone. LiveKit
    // fires participantDisconnected briefly on the provider's side during
    // network hiccups + reconnects (verified 2026-09-27: provider console
    // showed "publishing track" twice from a reconnect, patient got kicked
    // to /done mid-call). 20s covers a typical reconnect; anything longer
    // and the provider probably intentionally left.
    let pending = null
    const onLeft = () => {
      if (pending) return
      pending = setTimeout(() => {
        pending = null
        try {
          if (!room.remoteParticipants || room.remoteParticipants.size === 0) {
            // Provider intentionally left after the grace window — treat
            // this as end-of-consult so onDisconnected routes to /done.
            __tereLeaveIntent = 'done'
            room.disconnect()
          }
        } catch (e) { console.warn('[PatientCall] auto-leave failed:', e?.message) }
      }, 20000)
    }
    const onJoined = () => {
      // Provider came back — cancel the pending disconnect.
      if (pending) { clearTimeout(pending); pending = null }
    }
    room.on('participantDisconnected', onLeft)
    room.on('participantConnected',    onJoined)
    return () => {
      try {
        room.off('participantDisconnected', onLeft)
        room.off('participantConnected',    onJoined)
      } catch {}
      if (pending) clearTimeout(pending)
    }
  }, [room])
  return null
}
// Custom Leave button + intent modal. Replaces LiveKit's default disconnect
// button so we can ask the patient WHY they're leaving:
//   - "Consult complete"      → doctor's done → /done (pending final decision)
//   - "No provider — queue"   → doctor never showed → back to /waiting/:id
// The Back-to-Queue path is disabled if a provider was actually in the room
// (blocks the "don't like advice → re-queue for free consult" exploit).
function PatientLeaveButton({ consultationId }) {
  const room = useRoomContext()
  const navigate = useNavigate()
  const participants = useParticipants()
  const [open, setOpen] = useState(false)
  const everSawProviderRef = useRef(false)
  useEffect(() => {
    // Any remote participant (identity NOT starting with 'patient-') counts
    // as the provider having been present at some point.
    const hasProvider = participants.some(p => {
      const id = p.identity || ''
      return !id.startsWith('patient-') && !id.startsWith('sip-patient-')
    })
    if (hasProvider) everSawProviderRef.current = true
  }, [participants])

  // BELT + BRACES for the LiveKit control-bar Leave button. CSS in the
  // LiveKitRoom subtree hides known variants, but LiveKit v2 sometimes ships
  // the Disconnect button with class/attr combos our selectors miss. Two
  // extra layers here:
  //
  //  1) MutationObserver that scans the LiveKit subtree and hides any
  //     <button> whose visible text is "Leave"/"Disconnect"/"Hang up"/"End
  //     call". Runs on every DOM mutation inside the LK tree. This is the
  //     load-bearing hide — text-match survives class renames.
  //
  //  2) Click-capture interceptor: if a click somehow lands on the button
  //     before we hide it (first paint race), open the intent modal instead
  //     of letting LiveKit disconnect.
  useEffect(() => {
    const LEAVE_TEXTS = ['leave', 'disconnect', 'hang up', 'end call']
    const isLeaveText = (t) => {
      const s = (t || '').trim().toLowerCase()
      return LEAVE_TEXTS.some(x => s === x || s.startsWith(x + ' ') || s.endsWith(' ' + x))
    }
    const isLeaveButton = (btn) => {
      if (!btn || btn.tagName !== 'BUTTON') return false
      // Never touch our own custom Leave button (which lives inside the LK
      // subtree because it's rendered inside <LiveKitRoom>).
      if (btn.getAttribute('data-tere-leave') === 'custom') return false
      const label = (btn.getAttribute('aria-label') || '').toLowerCase()
      const src   = (btn.getAttribute('data-lk-source') || '').toLowerCase()
      const kind  = (btn.getAttribute('data-lk-kind') || '').toLowerCase()
      const cls   = (btn.className || '').toString().toLowerCase()
      if (src === 'disconnect' || kind === 'disconnect') return true
      if (cls.includes('lk-disconnect-button')) return true
      if (LEAVE_TEXTS.some(x => label.includes(x))) return true
      if (isLeaveText(btn.textContent)) return true
      return false
    }
    const hideLeaveButtons = () => {
      const root = document.querySelector('.tere-patient-lk')
      if (!root) return
      root.querySelectorAll('button').forEach(btn => {
        if (isLeaveButton(btn) && btn.style.display !== 'none') {
          btn.style.display = 'none'
        }
      })
    }
    // Run once, then on every mutation inside the LK subtree.
    hideLeaveButtons()
    const observer = new MutationObserver(hideLeaveButtons)
    // Observe from body so we catch the LK tree mounting after this effect.
    observer.observe(document.body, { childList: true, subtree: true })

    const isDisconnectTarget = (el) => {
      if (!el || !(el instanceof Element)) return false
      let node = el
      for (let i = 0; i < 5 && node; i++) {
        try {
          if (node.tagName === 'BUTTON' && isLeaveButton(node)) return true
        } catch {}
        node = node.parentElement
      }
      return false
    }
    const onClick = (e) => {
      if (!isDisconnectTarget(e.target)) return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      setOpen(true)
    }
    document.addEventListener('click', onClick, true)
    return () => {
      observer.disconnect()
      document.removeEventListener('click', onClick, true)
    }
  }, [])

  async function finish(dest) {
    // Signal intent to the shared flag BEFORE disconnect so the room's
    // onDisconnected handler routes to the same destination we're about to
    // navigate to. Without this the handler falls back to /waiting/:id and
    // stomps our navigate() call.
    __tereLeaveIntent = dest.startsWith('/waiting') ? 'waiting' : 'done'
    try { await room?.disconnect?.() } catch {}
    navigate(dest)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-tere-leave="custom"
        style={{
          position: 'fixed',
          bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
          right: 20,
          zIndex: 50,
          background: '#dc2626',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          padding: '.65rem 1.1rem',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          fontSize: '.9375rem',
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,.35)',
        }}
      >
        Leave
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem', fontFamily: 'Plus Jakarta Sans, sans-serif',
          }}
        >
          <div style={{
            background: 'white', borderRadius: 12, padding: '1.5rem',
            maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,.4)',
          }}>
            <h3 style={{ margin: '0 0 .75rem', fontSize: '1.125rem', color: '#0E2E38' }}>
              Leave the call?
            </h3>
            <p style={{ margin: '0 0 1.25rem', color: '#374151', fontSize: '.9375rem', lineHeight: 1.5 }}>
              Which best describes what's happening?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
              <button
                onClick={() => finish('/done')}
                style={{
                  background: '#0B6E76', color: 'white', border: 'none',
                  borderRadius: 8, padding: '.85rem 1rem',
                  fontSize: '.9375rem', fontWeight: 600, cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                Consult complete
                <div style={{ fontWeight: 400, fontSize: '.8125rem', opacity: .9, marginTop: '.2rem' }}>
                  My doctor finished the visit. Your doctor will send you a summary shortly.
                </div>
              </button>
              <button
                onClick={() => finish(`/waiting/${consultationId}`)}
                style={{
                  background: '#f3f4f6',
                  color: '#0E2E38',
                  border: '1px solid #d1d5db',
                  borderRadius: 8, padding: '.85rem 1rem',
                  fontSize: '.9375rem', fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {everSawProviderRef.current
                  ? "Something's wrong — put me back in queue"
                  : 'No doctor here — back to queue'}
                <div style={{ fontWeight: 400, fontSize: '.8125rem', opacity: .85, marginTop: '.2rem' }}>
                  {everSawProviderRef.current
                    ? 'Call dropped, video froze, or something else went wrong. Return to the queue for a fresh call.'
                    : 'The doctor never joined. Return to the queue and wait for the next available doctor.'}
                </div>
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'transparent', color: '#6b7280', border: 'none',
                  padding: '.6rem', fontSize: '.875rem', cursor: 'pointer',
                  marginTop: '.25rem',
                }}
              >
                Cancel — stay in the call
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

import ChatPanel from '../ChatPanel'
import { apiFetch } from '../../lib/api'
import { getPatientConsult, subscribeToConsultationEnded } from '../../lib/supabase'
import { getLangMeta, t } from '../../lib/i18n'
import CallSubtitles from '../clinical/CallSubtitles'
import ChimeCallSubtitles from '../clinical/ChimeCallSubtitles'
import ChimeCall from '../call/ChimeCall'
import { useChimeSdk } from '../../lib/chime'

export default function PatientCall() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [token, setToken] = useState(null)
  const [serverUrl, setServerUrl] = useState(null)
  const [error, setError] = useState(null)
  // Permission gate — patient must click "Join video" to get a fresh
  // browser getUserMedia prompt. Browsers only prompt on user gesture AND
  // when permission isn't already resolved (grant OR deny). If the user
  // previously denied, LiveKit joins the room with no local tracks and the
  // patient sees a black screen. Explicit pre-flight surfaces denial as a
  // clear error message instead of a silent void.
  const [permission, setPermission] = useState('idle') // 'idle' | 'requesting' | 'granted' | 'denied'
  const [permissionError, setPermissionError] = useState(null)
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
  // Only the legacy 'phone' type is audio-only. 'consult' (unified) and
  // 'video' both start with the camera on; either side can toggle it off
  // mid-call via the VideoConference toolbar.
  const isPhone = consultationType === 'phone'
  // Set to the Chime meeting id once the provider has clicked Call server-
  // side. Populated from the same status-poll below. Gates the "Start call"
  // button on Chime so the patient can't tap before the meeting exists
  // (which would 409 → "Couldn't connect").
  const [chimeMeetingId, setChimeMeetingId] = useState(null)

  // Always refresh consultation_type from DB on mount. Triage may have
  // stored 'consult' or 'video' in sessionStorage, but the provider's
  // Video / Phone button click just before /api/initiate-call is the
  // authoritative choice (server writes it to consultations.consultation_type,
  // see api/_initiate-call.js). Without this refresh the patient's isPhone
  // check runs against stale sessionStorage, so provider-clicked Phone
  // would still open with video on the patient side.
  useEffect(() => {
    if (!consultationId) return
    getPatientConsult(consultationId).then(c => {
      if (c?.consultation_type) {
        setConsultationType(c.consultation_type)
        sessionStorage.setItem('consultationType', c.consultation_type)
      }
    }).catch(() => {})
  }, [consultationId])

  // Listen for provider End Call broadcast. Payload.reason tells us which
  // provider-side button was clicked:
  //   'call_failed'   → provider had video/audio issues; keep patient in
  //                     the queue (route back to /waiting/:id so their
  //                     UI shows the waiting-room, not post-consult).
  //   'provider_ended' / 'provider_left' → normal end-of-consult → /done.
  useEffect(() => {
    if (!consultationId) return
    const ch = subscribeToConsultationEnded(consultationId, (payload) => {
      // Signal intent so the LiveKitRoom's onDisconnected (which fires when
      // this component unmounts) routes to the same destination — otherwise
      // it defaults to /waiting and stomps our navigate.
      if (payload?.reason === 'call_failed') {
        __tereLeaveIntent = 'waiting'
        navigate(`/waiting/${consultationId}`)
      } else {
        __tereLeaveIntent = 'done'
        navigate('/done')
      }
    })
    return () => { try { ch?.unsubscribe?.() } catch {} }
  }, [consultationId, navigate])

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
        // Mirror server-side chime_meeting_id into state so ChimeCall's
        // providerReady prop flips true the moment the provider clicks Call.
        setChimeMeetingId(c.chime_meeting_id || null)
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

  const chimeMode = useChimeSdk()
  // Remote MediaStream captured from ChimeCall's bound <audio> element.
  // Fed to ChimeCallSubtitles when the patient enables subtitles so the
  // provider's speech gets STT + translation into the patient's language.
  const [chimeRemoteStream, setChimeRemoteStream] = useState(null)
  const chimeAudioReady = React.useCallback((el) => {
    try {
      const captureFn = el?.captureStream || el?.mozCaptureStream
      if (typeof captureFn === 'function') {
        const ms = captureFn.call(el)
        if (ms?.getAudioTracks?.().length) setChimeRemoteStream(ms)
      }
    } catch (e) { console.warn('[chime] audio captureStream failed:', e?.message) }
  }, [])

  useEffect(() => {
    if (!consultationId) { navigate('/start'); return }
    // Only fetch a LiveKit token once the status gate says it's OK to join.
    // While cooldown/waiting/no_show we render a dedicated screen instead.
    if (gate !== 'ready') return
    if (token) return
    // Chime path handles its own auth via /api/chime-meeting join-patient —
    // no LiveKit token needed. Skip the fetch entirely.
    if (chimeMode) return
    // Phone mode — audio flows over PSTN into the LiveKit room via SIP.
    // Patient's browser doesn't need to join LiveKit at all; it just
    // renders a "you're on a call" UI and listens for the provider_ended
    // broadcast to nav to /done. Skipping the token fetch prevents the
    // "Connecting to call…" spinner from hanging forever.
    if (isPhone) return
    // Video mode — gate the token fetch on explicit camera/mic permission.
    // If we skip this and permission was previously denied, LiveKit joins
    // the room with no local tracks and the patient sees a black screen
    // with no signal. The pre-flight permission check surfaces denial as
    // a clear error we can guide them to fix.
    if (permission !== 'granted') return

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
  }, [consultationId, navigate, gate, token, chimeMode, isPhone, permission])

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
</div>
  )

  if (gate === 'loading') return (
    <div style={{ height:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0D1117', fontFamily:'Plus Jakarta Sans, sans-serif' }}>
      <div style={{ textAlign:'center', color:'rgba(255,255,255,.6)' }}>
        <div style={{ width:36, height:36, border:'3px solid var(--teal, #0B6E76)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 1rem' }}/>
        <div>Checking your appointment…</div>
      </div>
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

  // Chime path — bypasses LiveKit entirely. ChimeCall handles auth via the
  // /api/chime-meeting server endpoint, manages its own device permissions,
  // and calls onEnded when the meeting drops. Must come BEFORE the LiveKit
  // token-wait gate below, otherwise Chime users get stuck forever on
  // "Connecting to video call…" because token stays null on the Chime path.
  if (chimeMode) {
    return (
      <div style={{ position: 'relative', height: '100dvh' }}>
        {(() => {
          const patientLang = sessionStorage.getItem('patient_language') || 'en'
          // Provider speaks English. Subtitles are only useful when the
          // patient reads a non-English supported language.
          const subtitlesAvailable = patientLang !== 'en'
          return (
            <ChimeCall
              role="patient"
              consultationId={consultationId}
              onEnded={() => navigate('/done')}
              onAudioElReady={chimeAudioReady}
              subtitlesAvailable={subtitlesAvailable}
              subtitlesOn={subtitlesOn}
              onToggleSubtitles={() => setSubtitlesOn(v => !v)}
              audioOnly={isPhone}
              providerReady={!!chimeMeetingId}
              overlay={subtitlesAvailable && subtitlesOn && chimeRemoteStream ? (
                <ChimeCallSubtitles
                  viewerRole="patient"
                  viewerLang={patientLang}
                  speakerLang="en"
                  enabled={subtitlesOn}
                  consultationId={consultationId}
                  remoteStream={chimeRemoteStream}
                />
              ) : null}
            />
          )
        })()}
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

  // Pre-flight camera/mic permission — video mode only. Browsers only
  // prompt on user gesture AND when permission isn't already resolved,
  // so a silent "black screen" is what you get if the user previously
  // denied. Forcing an explicit click here re-triggers getUserMedia and
  // surfaces denial as a helpful error instead of a void.
  if (!isPhone && !chimeMode && permission !== 'granted') {
    async function requestPermission() {
      setPermission('requesting')
      setPermissionError(null)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        // Immediately stop the tracks — LiveKit will re-acquire them when it joins.
        // We only wanted to trigger the browser prompt + confirm access.
        stream.getTracks().forEach(t => { try { t.stop() } catch {} })
        setPermission('granted')
      } catch (e) {
        setPermission('denied')
        setPermissionError(e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError'
          ? 'Your browser blocked camera or microphone access. Click the camera icon in the address bar → set to "Allow" → click Try again.'
          : e?.name === 'NotFoundError'
            ? 'No camera or microphone found on this device. Try a different device, or the clinician will call your phone.'
            : `Could not access camera/microphone: ${e?.message || e?.name || 'unknown error'}`)
      }
    }
    return (
      <div style={{height:'100dvh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0D1117',fontFamily:'Plus Jakarta Sans, sans-serif',padding:'2rem'}}>
        <div style={{textAlign:'center',color:'white',maxWidth:440}}>
          <div style={{fontSize:'3rem',marginBottom:'.75rem'}}>📹</div>
          <div style={{fontSize:'1.375rem',fontWeight:700,marginBottom:'.5rem'}}>Ready for your video consult</div>
          <div style={{fontSize:'.9375rem',color:'rgba(255,255,255,.7)',lineHeight:1.6,marginBottom:'1.5rem'}}>
            {permission === 'denied'
              ? <span style={{color:'#FCA5A5'}}>{permissionError}</span>
              : 'Your browser will ask for access to your camera and microphone. Click Allow so your clinician can see and hear you.'}
          </div>
          <button
            type="button"
            onClick={requestPermission}
            disabled={permission === 'requesting'}
            style={{
              background: '#0B6E76', color: 'white', border: 'none',
              padding: '.9rem 2rem', borderRadius: 999, fontWeight: 700,
              fontSize: '1rem', cursor: permission === 'requesting' ? 'wait' : 'pointer',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              minWidth: 200,
            }}
          >
            {permission === 'requesting' ? 'Requesting…' : permission === 'denied' ? 'Try again' : 'Join video'}
          </button>
          {permission === 'denied' && (
            <div style={{fontSize:'.8125rem',color:'rgba(255,255,255,.5)',marginTop:'1rem',lineHeight:1.5}}>
              Still stuck? Your clinician will call your phone as a backup.
            </div>
          )}
        </div>
      </div>
    )
  }

  // Phone mode — provider chose "Call phone" so audio flows PSTN → SIP →
  // LiveKit. Patient's browser doesn't join the room at all. Render a
  // dedicated "call in progress on your phone" panel and let the
  // provider_ended broadcast (subscribeToConsultationEnded above) redirect
  // to /done when the provider hangs up.
  if (isPhone) return (
    <div style={{height:'100dvh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0D1117',fontFamily:'Plus Jakarta Sans, sans-serif',padding:'2rem'}}>
      <div style={{textAlign:'center',color:'white',maxWidth:420}}>
        <div style={{fontSize:'3rem',marginBottom:'1rem'}}>📞</div>
        <div style={{fontSize:'1.375rem',fontWeight:700,marginBottom:'.5rem'}}>Answer your phone</div>
        <div style={{fontSize:'.9375rem',color:'rgba(255,255,255,.7)',lineHeight:1.6,marginBottom:'1.5rem'}}>
          Your clinician is calling you now. Pick up the call and talk with them there — you can leave this tab open.
        </div>
        <div style={{fontSize:'.8125rem',color:'rgba(255,255,255,.4)',lineHeight:1.5}}>
          This page will update when the call ends.
        </div>
      </div>
    </div>
  )

  // LiveKit fallback path (only reached when ?chime=0). Wait for token
  // before mounting <LiveKitRoom>. If the spinner takes more than a few
  // seconds, most likely: camera/mic permission denied, or WebRTC blocked
  // by a corporate/home firewall. The provider will phone-bridge the
  // patient at 15s (ring-timeout) as a fallback so care still happens.
  if (!token || !serverUrl) return (
    <div style={{height:'100dvh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0D1117',fontFamily:'Plus Jakarta Sans, sans-serif',padding:'2rem'}}>
      <div style={{textAlign:'center',color:'rgba(255,255,255,.6)',maxWidth:360}}>
        <div style={{width:36,height:36,border:'3px solid var(--teal)',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 1rem'}}/>
        <div style={{marginBottom:'.75rem'}}>Connecting to {isPhone ? 'call' : 'video call'}…</div>
        <div style={{fontSize:'.8125rem',color:'rgba(255,255,255,.45)',lineHeight:1.5}}>
          {error
            ? <span style={{color:'#FCA5A5'}}>{error}</span>
            : <>If this hangs for more than 15 seconds, make sure your browser allowed <strong style={{color:'rgba(255,255,255,.7)'}}>camera and microphone</strong> access. Your clinician will call your phone as a backup.</>
          }
        </div>
      </div>
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
        // Adaptive stream + dynacast — SFU downscales layers and pauses
        // off-screen tiles on constrained networks (rural mobile) instead
        // of hard-freezing the whole call.
        adaptiveStream
        dynacast
        // Force every connection through LiveKit Cloud's TURN relay over
        // TCP/443. Direct peer connections need outbound UDP which many
        // corporate / hotel / school firewalls silently block, producing
        // the "stuck on Connecting…" black screen. Relay traffic looks
        // like HTTPS so it tunnels through anything that allows web
        // browsing. ~50ms latency hit (imperceptible for voice/video),
        // works universally.
        connectOptions={{ rtcConfig: { iceTransportPolicy: 'relay' } }}
        onDisconnected={() => {
          // Read + clear the shared intent flag. If a deliberate leave path
          // (PatientLeaveButton or ProviderLeaveWatcher) set the flag before
          // calling room.disconnect(), respect it. Otherwise default to
          // /waiting/:id so a stray disconnect (LiveKit control bar, network
          // death, tab background-kill) doesn't accidentally declare the
          // consult complete + fire the provider's wrap-up cascade.
          const intent = __tereLeaveIntent
          __tereLeaveIntent = null
          if (intent === 'done') return navigate('/done')
          if (intent === 'waiting') return navigate(`/waiting/${consultationId}`)
          navigate(consultationId ? `/waiting/${consultationId}` : '/done')
        }}
      >
        {/* Hide LiveKit's built-in Disconnect button so only Microphone,
            Camera + Chat remain. Patient uses our own top-left Leave button
            (forces the intent modal so a stray click can't skip the "no
            doctor came back" path). Cast a wide net — newer LiveKit versions
            have shipped variants of this button under different selectors. */}
        <style>{`
          .tere-patient-lk .lk-disconnect-button,
          .tere-patient-lk button[data-lk-source="disconnect"],
          .tere-patient-lk .lk-button[data-lk-kind="disconnect"],
          .tere-patient-lk [aria-label*="Disconnect" i],
          .tere-patient-lk [aria-label*="Leave" i],
          .tere-patient-lk [aria-label*="Hang up" i],
          .tere-patient-lk [aria-label*="End call" i] {
            display: none !important;
          }
        `}</style>
        <ProviderLeaveWatcher />
        <PatientLeaveButton consultationId={consultationId} />
        <VideoConference />
        {(() => {
          const patientLang = sessionStorage.getItem('patient_language') || 'en'
          const meta = getLangMeta(patientLang)
          const supported = meta && (meta.subtitleSupport === 'excellent' || meta.subtitleSupport === 'very_good')
          // Always render the offer pill — English patients may still want
          // captions for accessibility (deaf or hard-of-hearing). Only bail
          // if the language has poor STT support, since captions in that case
          // are more misleading than helpful.
          if (!supported) return null
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
