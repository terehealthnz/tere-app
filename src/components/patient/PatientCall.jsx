import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LiveKitRoom, VideoConference } from '@livekit/components-react'
import '@livekit/components-styles'
import ChatPanel from '../ChatPanel'

export default function PatientCall() {
  const navigate = useNavigate()
  const [token, setToken] = useState(null)
  const [serverUrl, setServerUrl] = useState(null)
  const [error, setError] = useState(null)
  const consultationId   = sessionStorage.getItem('consultationId')
  const consultationType = sessionStorage.getItem('consultationType') || 'video'
  const isPhone = consultationType === 'phone'

  useEffect(() => {
    if (!consultationId) { navigate('/'); return }

    async function fetchToken() {
      try {
        const res = await fetch('/api/join-room', {
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
  }, [consultationId, navigate])

  if (error) return (
    <div style={{height:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'#0D1117',fontFamily:'Plus Jakarta Sans, sans-serif',color:'white',gap:'1rem',padding:'2rem',textAlign:'center'}}>
      <div style={{fontSize:'2rem'}}>⚠️</div>
      <p style={{color:'rgba(255,255,255,.7)',maxWidth:360,lineHeight:1.6}}>{error}</p>
      <button onClick={() => navigate('/waiting')}
        style={{background:'var(--teal)',border:'none',color:'white',padding:'10px 24px',borderRadius:'8px',cursor:'pointer',fontFamily:'Plus Jakarta Sans, sans-serif',fontWeight:600}}>
        Go back
      </button>
    </div>
  )

  if (!token || !serverUrl) return (
    <div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0D1117',fontFamily:'Plus Jakarta Sans, sans-serif'}}>
      <div style={{textAlign:'center',color:'rgba(255,255,255,.6)'}}>
        <div style={{width:36,height:36,border:'3px solid var(--teal)',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 1rem'}}/>
        <div>Connecting to {isPhone ? 'call' : 'video call'}…</div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ position: 'relative', height: '100vh' }}>
      {isPhone && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
          background: 'rgba(11,110,118,.9)', padding: '.5rem 1rem',
          display: 'flex', alignItems: 'center', gap: '.5rem',
          fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.875rem', color: 'white',
        }}>
          <span>📞</span>
          <span style={{ fontWeight: 600 }}>Audio only consultation</span>
          <span style={{ color: 'rgba(255,255,255,.6)', fontSize: '.8125rem' }}>— camera is disabled for this consultation type</span>
        </div>
      )}
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        video={!isPhone}
        audio={true}
        data-lk-theme="default"
        style={{ height: '100vh' }}
        onDisconnected={() => navigate('/done')}
      >
        <VideoConference />
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
    </div>
  )
}
