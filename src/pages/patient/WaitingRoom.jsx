import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { db } from '../../lib/supabase'
import { joinRoom } from '../../lib/daily'

export default function WaitingRoom() {
  const { id } = useParams()
  const [consultation, setConsultation] = useState(null)
  const [status, setStatus] = useState('loading')  // loading | waiting | joining | incall
  const callContainerRef = useRef(null)
  const callFrameRef     = useRef(null)

  useEffect(() => {
    // Load consultation
    db.consultations.getById(id).then(c => {
      setConsultation(c)
      if (c.status === 'vitals_pending') { navigate(`/vitals/${c.id}`); return; }
      setStatus(c.status === 'in_progress' ? 'joining' : 'waiting')
    }).catch(() => setStatus('error'))

    // Subscribe to real-time updates
    const channel = db.consultations.subscribe(async ({ new: updated }) => {
      if (updated?.id !== id) return
      setConsultation(updated)
      if (updated.status === 'vitals_pending') { navigate(`/vitals/${id}`); return; }
      if (updated.status === 'in_progress' && updated.daily_room_url) {
        setStatus('joining')
      }
      if (updated.status === 'completed') {
        callFrameRef.current?.destroy()
        window.location.href = `/summary/${id}`
      }
    })
    return () => channel.unsubscribe?.()
  }, [id])

  // Join video call when room is ready
  useEffect(() => {
    if (status !== 'joining' || !consultation?.daily_room_url) return
    let mounted = true

    const join = async () => {
      try {
        const frame = await joinRoom(
          consultation.daily_room_url,
          consultation.daily_guest_token,
          callContainerRef.current
        )
        callFrameRef.current = frame
        if (mounted) setStatus('incall')

        frame.on('left-meeting', () => {
          window.location.href = `/summary/${id}`
        })
      } catch (err) {
        console.error('Video join failed:', err)
        setStatus('video_error')
      }
    }
    join()
    return () => { mounted = false }
  }, [status, consultation])

  if (status === 'loading') return (
    <div className="page-shell" style={{ alignItems:'center', justifyContent:'center' }}>
      <div className="spinner spinner-lg"></div>
    </div>
  )

  // ── In call ────────────────────────────────────────────────────────────
  if (status === 'incall' || status === 'joining') return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', background:'#0D1117' }}>
      <div style={{
        padding:'8px 1rem', background:'rgba(0,0,0,0.4)',
        display:'flex', alignItems:'center', gap:8, flexShrink:0
      }}>
        <span style={{ color:'var(--teal-light)', fontWeight:700, fontSize:'1rem', letterSpacing:'0.1em' }}>TERE</span>
        <span style={{ width:8, height:8, background:'#22C55E', borderRadius:'50%', animation:'pulse 2s infinite' }}></span>
        <span style={{ color:'rgba(255,255,255,0.5)', fontSize:'0.85rem' }}>Secure consultation</span>
      </div>
      {status === 'joining' && (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16 }}>
          <div className="spinner spinner-lg" style={{ borderColor:'rgba(255,255,255,0.2)', borderTopColor:'var(--teal)' }}></div>
          <p style={{ color:'rgba(255,255,255,0.6)' }}>Connecting to your doctor…</p>
        </div>
      )}
      <div ref={callContainerRef} style={{ flex:1, display: status === 'incall' ? 'block' : 'none' }}></div>
    </div>
  )

  // ── Waiting ────────────────────────────────────────────────────────────
  return (
    <div className="page-shell">
      <header className="page-header">
        <span className="page-logo">TERE</span>
        <span style={{ fontSize:'0.8rem', color:'rgba(255,255,255,0.45)' }}>He tere, he ora</span>
      </header>

      <div className="page-content" style={{ display:'flex', alignItems:'center' }}>
        <div className="card" style={{ textAlign:'center', width:'100%' }}>
          {/* Animated waiting indicator */}
          <div style={{ position:'relative', width:96, height:96, margin:'0 auto 1.5rem' }}>
            <div style={{
              position:'absolute', inset:0, borderRadius:'50%',
              border:'3px solid var(--teal-light)',
              animation:'ping 1.5s cubic-bezier(0,0,0.2,1) infinite'
            }}></div>
            <div style={{
              position:'absolute', inset:8, borderRadius:'50%',
              background:'var(--teal-light)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:'2rem'
            }}>🩺</div>
          </div>

          <style>{`
            @keyframes ping { 75%,100%{transform:scale(1.5);opacity:0} }
          `}</style>

          <h1 style={{ fontSize:'1.4rem', marginBottom:'0.5rem' }}>
            Your doctor will be with you shortly
          </h1>
          <p style={{ color:'var(--muted)', marginBottom:'1.5rem', fontSize:'0.95rem' }}>
            {consultation?.patient_name
              ? `Hi ${consultation.patient_name.split(' ')[0]}, you're`
              : "You're"} in the queue. Your doctor has received your details
            {consultation?.vitals_hr ? ` and your vital signs (HR ${consultation.vitals_hr} bpm)` : ''}.
          </p>

          {/* What to expect */}
          <div style={{
            background:'var(--bg)', borderRadius:'var(--radius)',
            padding:'1rem', textAlign:'left', marginBottom:'1.5rem'
          }}>
            <p style={{ fontSize:'0.85rem', fontWeight:600, marginBottom:'0.75rem' }}>
              While you wait:
            </p>
            {[
              'Make sure your camera and microphone are working',
              'Find a quiet, well-lit space if possible',
              'Have any relevant medications nearby',
              'The video call will start automatically on this screen',
            ].map(tip => (
              <div key={tip} style={{ display:'flex', gap:8, marginBottom:6, fontSize:'0.875rem', color:'var(--text)' }}>
                <span style={{ color:'var(--teal)', flexShrink:0 }}>✓</span>
                <span>{tip}</span>
              </div>
            ))}
          </div>

          <div style={{
            display:'flex', alignItems:'center', justifyContent:'center', gap:6,
            color:'var(--muted)', fontSize:'0.85rem'
          }}>
            <div className="spinner" style={{ width:14, height:14, borderWidth:2 }}></div>
            Waiting for your doctor…
          </div>

          <p style={{ fontSize:'0.75rem', color:'var(--muted)', marginTop:'1.5rem' }}>
            If this is now an emergency, call{' '}
            <a href="tel:111" style={{ color:'var(--danger)', fontWeight:700 }}>111</a> immediately.
            <br />Consultation ID: <code style={{ fontSize:'0.7rem' }}>{id?.slice(0,8)}</code>
          </p>
        </div>
      </div>
    </div>
  )
}
