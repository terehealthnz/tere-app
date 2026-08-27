// /interview-room — interviewer-side video room.
//
// The interviewer arrives here from the admin careers panel with the LiveKit
// token, server URL, and room name already in the query string (minted by
// POST /api/job-applications?action=start_interview). Because the token
// grant is one-shot, refreshing this page will fail — that's intentional;
// admins should re-click Join from the panel.

import { useSearchParams, useNavigate } from 'react-router-dom'
import { LiveKitRoom, VideoConference } from '@livekit/components-react'
import '@livekit/components-styles'

export default function InterviewerRoom() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token     = params.get('token')
  const serverUrl = params.get('serverUrl')
  const room      = params.get('room')

  if (!token || !serverUrl) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: '#F8FAFC', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <h1 style={{ color: '#991B1B', fontSize: '1.3rem', marginBottom: 12 }}>Session token expired</h1>
          <p style={{ color: '#6B7280', fontSize: '.95rem' }}>Interviewer join tokens are one-shot. Close this tab and click Join again from the applicant panel.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100dvh', background: '#000' }}>
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        video={true}
        audio={true}
        data-lk-theme="default"
        style={{ height: '100dvh' }}
        onDisconnected={() => window.close()}
      >
        <VideoConference />
      </LiveKitRoom>
    </div>
  )
}
