// /meeting-host — host-side video room for business meetings.
//
// Host arrives from the admin Meetings tab with a one-shot LiveKit token
// in the query string (minted by POST /api/business-meetings?action=host_token).
// Refreshing fails — intentional; admin re-clicks Join as host from the panel.

import { useSearchParams } from 'react-router-dom'
import { LiveKitRoom, VideoConference } from '@livekit/components-react'
import '@livekit/components-styles'
import InterviewBrandOverlay from '../components/InterviewBrandOverlay'

export default function MeetingHostRoom() {
  const [params] = useSearchParams()
  const token     = params.get('token')
  const serverUrl = params.get('serverUrl')
  const title     = params.get('title') || 'Meeting'
  const guest     = params.get('guest') || ''

  if (!token || !serverUrl) {
    return (
      <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', padding:'2rem', background:'#F8FAFC', fontFamily:'Plus Jakarta Sans, sans-serif' }}>
        <div style={{ textAlign:'center', maxWidth:420 }}>
          <h1 style={{ color:'#991B1B', fontSize:'1.3rem', marginBottom:12 }}>Session token expired</h1>
          <p style={{ color:'#6B7280', fontSize:'.95rem' }}>Host join tokens are one-shot. Close this tab and click Join as host again from the Meetings panel.</p>
        </div>
      </div>
    )
  }

  const subtitle = guest ? `Guest: ${guest}` : null
  return (
    <div style={{ height:'100dvh', background:'#000', position:'relative' }}>
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        video={true}
        audio={true}
        data-lk-theme="default"
        style={{ height:'100dvh' }}
        onDisconnected={() => window.close()}
      >
        <VideoConference />
      </LiveKitRoom>
      <InterviewBrandOverlay title={title} subtitle={subtitle} />
    </div>
  )
}
