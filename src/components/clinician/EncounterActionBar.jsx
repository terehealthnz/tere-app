// EncounterActionBar — three-button provider action row for a consultation.
//
//   [ Call ]  [ No Answer ]  [ Complete Encounter ]
//
// Rendered on the queue-detail patient page, the in-call ProviderConsult
// screen, and anywhere else a provider needs to act on a consult. Replaces
// the previous "auto-push to notes when the LiveKit call ends" behaviour —
// now the transition to the notes screen only happens when the provider
// explicitly clicks Complete Encounter.
//
// Call routes intelligently: the server checks patient heartbeat freshness
// (<30s = LiveKit, else phone bridge) and returns deliveryChannel in the
// response. The bar itself doesn't render the call surface — it dispatches
// via `onCall(deliveryChannel)` and the parent decides what to do (navigate
// to LiveKit page, initiate phone bridge, etc).

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { encounterAction } from '../../lib/supabase'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const RED  = '#DC2626'

export default function EncounterActionBar({
  consultationId,
  onCall,      // optional: (deliveryChannel: 'livekit' | 'phone', reason: string) => void
  onNoAnswer,  // optional: () => void
  onComplete,  // optional: () => void — defaults to navigate('/provider/notes/:id')
  disabled = false,
  compact = false,
}) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null)  // 'call' | 'no_answer' | 'complete' | null

  async function fire(action, cb) {
    if (busy || disabled) return
    setBusy(action)
    try {
      const res = await encounterAction(consultationId, action)
      if (typeof cb === 'function') cb(res)
    } catch (e) {
      console.error(`[encounter-action] ${action} failed:`, e.message)
      alert(`Failed to record ${action.replace('_', ' ')}: ${e.message}`)
    } finally {
      setBusy(null)
    }
  }

  const gap = compact ? 6 : 8
  const pad = compact ? '.5rem .75rem' : '.75rem 1rem'
  const font = compact ? '.8125rem' : '.9375rem'

  return (
    <div style={{ display: 'flex', gap, width: '100%' }}>
      <button
        type="button"
        onClick={() => fire('call', (res) => {
          if (typeof onCall === 'function') onCall(res.deliveryChannel, res.reason)
          else navigate(`/provider/consult/${consultationId}`)
        })}
        disabled={busy !== null || disabled}
        style={{
          flex: 1, background: TEAL, color: 'white', border: 'none',
          borderRadius: 10, padding: pad, fontSize: font, fontWeight: 700,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          cursor: (busy || disabled) ? 'not-allowed' : 'pointer',
          opacity: (busy && busy !== 'call') ? .5 : 1,
        }}>
        {busy === 'call' ? '…' : '📞 Call'}
      </button>

      <button
        type="button"
        onClick={() => fire('no_answer', () => { if (typeof onNoAnswer === 'function') onNoAnswer() })}
        disabled={busy !== null || disabled}
        style={{
          flex: 1, background: 'white', color: '#B45309', border: `1.5px solid #F59E0B`,
          borderRadius: 10, padding: pad, fontSize: font, fontWeight: 700,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          cursor: (busy || disabled) ? 'not-allowed' : 'pointer',
          opacity: (busy && busy !== 'no_answer') ? .5 : 1,
        }}>
        {busy === 'no_answer' ? '…' : 'No Answer'}
      </button>

      <button
        type="button"
        onClick={() => fire('complete_encounter', () => {
          if (typeof onComplete === 'function') onComplete()
          else navigate(`/provider/notes/${consultationId}`)
        })}
        disabled={busy !== null || disabled}
        style={{
          flex: 1, background: NAVY, color: 'white', border: 'none',
          borderRadius: 10, padding: pad, fontSize: font, fontWeight: 700,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          cursor: (busy || disabled) ? 'not-allowed' : 'pointer',
          opacity: (busy && busy !== 'complete_encounter') ? .5 : 1,
        }}>
        {busy === 'complete_encounter' ? '…' : '✓ Complete Encounter'}
      </button>
    </div>
  )
}
