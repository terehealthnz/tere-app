// EncounterActionBar — four-button provider action row for a consultation.
//
//   [ Video ]  [ Phone ]  [ No Answer ]  [ Complete Encounter ]
//
// Rendered on the queue-detail patient page, the in-call ProviderConsult
// screen, and anywhere else a provider needs to act on a consult. Replaces
// the previous "auto-push to notes when the LiveKit call ends" behaviour —
// now the transition to the notes screen only happens when the provider
// explicitly clicks Complete Encounter.
//
// Video vs Phone is an explicit provider choice (2026-09-28): the earlier
// single "Call" button lied — it read "phone" but started video. Providers
// know from the waiting-room state whether the patient can do video, so
// making them pick is faster than the hidden 15s fallback and clearer for
// rural-older patients where phone is the norm. onCall receives the chosen
// channel ('livekit' | 'phone') and the parent wires forcePhone accordingly.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { encounterAction } from '../../lib/supabase'
import AccConfirmModal from './AccConfirmModal'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const RED  = '#DC2626'

// Decide whether the Complete Encounter click needs to gate on the ACC
// confirmation popup. Fires every time the consult is still flagged ACC
// AND provider hasn't explicitly converted it themselves — including after
// a prior answer. Patrick 2026-10-16: previously we skipped if
// acc_provider_confirmed_at / _declined_at was already stamped (one-shot
// gate), but that left providers with no way to change their mind at close
// if they'd mis-answered the earlier popup. Chart-level toggle buttons
// handle the explicit undo path; this re-fire catches the "I want to
// reconsider at close" case. Provider-converted (acc_converted_by_provider)
// consults still skip the popup because the convert flow is an explicit
// affirmation of ACC — no need to re-ask.
function needsAccConfirmation(consult) {
  if (!consult) return false
  const flaggedAcc = consult.is_acc === true || consult.acc_eligible === 'yes'
  if (!flaggedAcc) return false
  if (consult.acc_converted_by_provider) return false
  return true
}

export default function EncounterActionBar({
  consultationId,
  consult,     // optional: full consultation row — used to detect is_practice
  onCall,      // optional: (deliveryChannel: 'livekit' | 'phone', reason: string) => void
  onNoAnswer,  // optional: (res: { dismissed?: boolean, smsSent?: boolean, consultation? }) => void
  onComplete,  // optional: () => void — defaults to navigate('/provider/notes/:id')
  disabled = false,
  compact = false,
  // In post-call overlays the Call button is nonsensical (you can't call
  // from an "ended" state) — hide it so providers only see No Answer +
  // Complete Encounter.
  hideCall = false,
}) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null)  // 'call_video' | 'call_phone' | 'no_answer' | 'complete' | null
  const [accGateOpen, setAccGateOpen] = useState(false)
  const isPractice = !!consult?.is_practice

  async function fire(action, cb, channelOverride) {
    if (busy || disabled) return
    setBusy(action)
    try {
      // Sandbox short-circuit: practice-flagged consults never invoke the
      // real LiveKit / phone-bridge stack — the "call" is simulated so the
      // new-hire training exercise can tick without a ghost patient on the
      // other end. Only intercept call actions; no_answer and complete
      // still record properly for training-progress tracking.
      const isCall = action === 'call_video' || action === 'call_phone'
      if (isCall && isPractice) {
        await encounterAction(consultationId, 'call').catch(() => {})
        if (typeof cb === 'function') cb({ deliveryChannel: 'practice', reason: 'sandbox' })
        return
      }
      // encounter-action still records 'call' (the workflow event); the
      // channel choice is a separate concern the parent handles.
      const serverAction = isCall ? 'call' : action
      const res = await encounterAction(consultationId, serverAction)
      if (typeof cb === 'function') cb({ ...res, deliveryChannel: channelOverride || res.deliveryChannel })
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
      {!hideCall && !isPractice && (
        <>
          <button
            type="button"
            onClick={() => fire('call_video', (res) => {
              if (typeof onCall === 'function') onCall(res.deliveryChannel || 'livekit', res.reason)
              else navigate(`/provider/consult/${consultationId}`)
            }, 'livekit')}
            disabled={busy !== null || disabled}
            style={{
              flex: 1, background: TEAL, color: 'white', border: 'none',
              borderRadius: 10, padding: pad, fontSize: font, fontWeight: 700,
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              cursor: (busy || disabled) ? 'not-allowed' : 'pointer',
              opacity: (busy && busy !== 'call_video') ? .5 : 1,
            }}>
            {busy === 'call_video' ? '…' : '🎥 Video'}
          </button>
          <button
            type="button"
            onClick={() => fire('call_phone', (res) => {
              if (typeof onCall === 'function') onCall('phone', res.reason)
              else navigate(`/provider/consult/${consultationId}`)
            }, 'phone')}
            disabled={busy !== null || disabled}
            style={{
              flex: 1, background: 'white', color: TEAL, border: `1.5px solid ${TEAL}`,
              borderRadius: 10, padding: pad, fontSize: font, fontWeight: 700,
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              cursor: (busy || disabled) ? 'not-allowed' : 'pointer',
              opacity: (busy && busy !== 'call_phone') ? .5 : 1,
            }}>
            {busy === 'call_phone' ? '…' : '📞 Phone'}
          </button>
        </>
      )}
      {!hideCall && isPractice && (
        <button
          type="button"
          onClick={() => fire('call_video', (res) => {
            if (typeof onCall === 'function') onCall(res.deliveryChannel || 'livekit', res.reason)
            else navigate(`/provider/consult/${consultationId}`)
          }, 'livekit')}
          disabled={busy !== null || disabled}
          style={{
            flex: 1, background: TEAL, color: 'white', border: 'none',
            borderRadius: 10, padding: pad, fontSize: font, fontWeight: 700,
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            cursor: (busy || disabled) ? 'not-allowed' : 'pointer',
            opacity: (busy && busy !== 'call_video') ? .5 : 1,
          }}>
          {busy === 'call_video' ? '…' : '📞 Simulate call (practice)'}
        </button>
      )}

      <button
        type="button"
        onClick={() => fire('no_answer', (res) => { if (typeof onNoAnswer === 'function') onNoAnswer(res) })}
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
        onClick={() => {
          // ACC confirmation gate: if this consult is still flagged ACC from
          // patient triage and the provider hasn't answered, open the popup
          // first. The actual complete_encounter fires in onDecided below.
          if (needsAccConfirmation(consult) && !isPractice) {
            setAccGateOpen(true)
            return
          }
          fire('complete_encounter', () => {
            if (typeof onComplete === 'function') onComplete()
            else navigate(`/provider/notes/${consultationId}`)
          })
        }}
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

      {accGateOpen && (
        <AccConfirmModal
          consultationId={consultationId}
          consult={consult}
          onDecided={() => {
            setAccGateOpen(false)
            // Fire the real completion handler now that the provider has
            // answered. The consult row is already patched server-side with
            // their decision, so needsAccConfirmation() will return false
            // on any subsequent close.
            fire('complete_encounter', () => {
              if (typeof onComplete === 'function') onComplete()
              else navigate(`/provider/notes/${consultationId}`)
            })
          }}
        />
      )}
    </div>
  )
}
