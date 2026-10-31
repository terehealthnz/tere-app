// Patient-presence gate modal (state-driven flow).
//
// Fires when the provider clicks Video on a consult where the patient isn't
// actually in the waiting room (never joined, or last_seen_at > 60s ago).
//
// Four-state progression (replaces the earlier 3-button chooser):
//   READY             presence=in_waiting_room, !smsSent    -> Start video
//   NOT_PRESENT       presence!=in_waiting_room, !smsSent   -> Text patient
//   WAITING           presence!=in_waiting_room, smsSent    -> spinner, polling
//   READY_AFTER_WAIT  presence=in_waiting_room, smsSent     -> Start video
//
// The "Call phone instead" fallback is always a small secondary link at the
// bottom. Polling only runs while smsSent is true (State 3 -> State 4) so we
// don't spam /api/consultations?id= when the patient is already present.
// Poll cadence is 5s so the Ready-after-wait flip lands fast enough that
// providers don't retry text while the patient is already loading the room.
//
// The modal no longer auto-closes on presence flip. State 4 shows the primary
// Start video button and the provider explicitly clicks it. The parent's
// onPatientJoined toast still fires on the flip so the provider gets the
// "patient is now ready" nudge even if they're glancing elsewhere.

import React, { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../../lib/api'
import { getPatientPresence } from '../../lib/patientPresence'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'

// Last-4-digits mask so an over-the-shoulder glance doesn't leak the full
// number. The server endpoint returns the masked form in its success response
// too so the status copy matches.
function maskPhone(phone) {
  const raw = String(phone || '').replace(/\s+/g, '')
  if (!raw) return 'no phone on record'
  if (raw.length <= 4) return raw
  const last4 = raw.slice(-4)
  const prefixLen = Math.max(0, raw.length - 4)
  return raw.slice(0, Math.min(3, prefixLen)) + 'X'.repeat(Math.max(0, prefixLen - 3)) + ' ' + last4
}

export default function PatientPresenceGateModal({
  consult,
  providerId,
  providerName,
  onClose,
  onStartVideo,          // called when provider clicks Start video in State 1 or State 4
  onPatientJoined,       // called when polling observes presence flip to in_waiting_room (toast only, modal stays open)
  onPhoneFallback,       // called after a successful /api/initiate-call with forcePhone:true
}) {
  const consultationId = consult?.id
  const [livePresence, setLivePresence] = useState(() => getPatientPresence(consult))
  const [smsSent, setSmsSent] = useState(false)
  const [smsBusy, setSmsBusy] = useState(false)
  const [phoneBusy, setPhoneBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const closedRef = useRef(false)
  const joinedFiredRef = useRef(false)

  // Poll /api/consultations?id= every 5s while smsSent is true. Pre-SMS the
  // patient's presence is a stable snapshot from the queue fetch (State 1 or
  // State 2); no reason to burn requests. Once we text them we need the fast
  // tick to catch the join and flip to State 4.
  useEffect(() => {
    if (!consultationId) return
    if (!smsSent) return
    let cancelled = false
    const poll = async () => {
      if (cancelled || closedRef.current) return
      try {
        const r = await apiFetch(`/api/consultations?id=${encodeURIComponent(consultationId)}`)
        if (!r.ok) return
        const j = await r.json().catch(() => ({}))
        const row = j.consultation || j.consultations?.[0] || null
        if (!row || cancelled) return
        const next = getPatientPresence(row)
        setLivePresence(next)
        if (next.status === 'in_waiting_room' && !joinedFiredRef.current) {
          joinedFiredRef.current = true
          // Fire the parent toast once, but KEEP the modal open so the provider
          // can click Start video from State 4.
          if (typeof onPatientJoined === 'function') onPatientJoined(row)
        }
      } catch {}
    }
    const id = setInterval(poll, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [consultationId, smsSent, onPatientJoined])

  async function handleSendSms() {
    if (smsBusy) return
    setSmsBusy(true)
    setActionError(null)
    try {
      const r = await apiFetch('/api/send-waiting-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultation_id: consultationId }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j.ok === false) {
        throw new Error(j.error || `HTTP ${r.status}`)
      }
      setSmsSent(true)
    } catch (e) {
      setActionError(`SMS failed: ${e.message}`)
    } finally {
      setSmsBusy(false)
    }
  }

  async function handleCallPhone() {
    if (phoneBusy) return
    setPhoneBusy(true)
    setActionError(null)
    try {
      const r = await apiFetch('/api/initiate-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultationId,
          providerId,
          providerName,
          forcePhone: true,
        }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${r.status}`)
      }
      closedRef.current = true
      if (typeof onPhoneFallback === 'function') onPhoneFallback()
    } catch (e) {
      setActionError(`Could not start phone call: ${e.message}`)
      setPhoneBusy(false)
    }
  }

  function handleStartVideo() {
    closedRef.current = true
    if (typeof onStartVideo === 'function') onStartVideo()
  }

  function handleClose() {
    closedRef.current = true
    if (typeof onClose === 'function') onClose()
  }

  // Derive the current state from presence + smsSent.
  const inRoom = livePresence?.status === 'in_waiting_room'
  let state
  if (inRoom && !smsSent) state = 'READY'
  else if (!inRoom && !smsSent) state = 'NOT_PRESENT'
  else if (!inRoom && smsSent) state = 'WAITING'
  else state = 'READY_AFTER_WAIT'

  const phoneMasked = maskPhone(consult?.patient_phone)
  const hasPhone = !!(consult?.patient_phone && String(consult.patient_phone).trim())

  // State-specific copy + primary action config.
  let statusLine
  let statusTone = 'neutral' // 'neutral' | 'ok' | 'wait'
  let primary = null
  let showSpinner = false
  let subLine = null
  let showCancelLink = false

  if (state === 'READY') {
    statusLine = 'Patient is in the waiting room'
    statusTone = 'ok'
    primary = { label: 'Start video', onClick: handleStartVideo, disabled: false }
  } else if (state === 'NOT_PRESENT') {
    statusLine = 'Patient not in waiting room'
    statusTone = 'neutral'
    primary = {
      label: smsBusy ? 'Sending...' : (hasPhone ? 'Text patient to enter waiting room' : 'No phone on record'),
      onClick: handleSendSms,
      disabled: smsBusy || !hasPhone,
    }
  } else if (state === 'WAITING') {
    statusLine = `SMS sent to ${phoneMasked}. Please wait for patient to join...`
    statusTone = 'wait'
    showSpinner = true
    subLine = 'Checking every 5 seconds...'
    showCancelLink = true
  } else { // READY_AFTER_WAIT
    statusLine = '✓ Patient is now ready'
    statusTone = 'ok'
    primary = { label: 'Start video', onClick: handleStartVideo, disabled: false }
  }

  const statusColor = statusTone === 'ok' ? '#065F46' : statusTone === 'wait' ? '#1E40AF' : NAVY
  const statusBg    = statusTone === 'ok' ? '#F0FDF4' : statusTone === 'wait' ? '#EFF6FF' : '#F8FAFC'
  const statusBorder = statusTone === 'ok' ? '#BBF7D0' : statusTone === 'wait' ? '#BFDBFE' : '#E2E8F0'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(13,43,69,0.55)',
        zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div style={{
        background: 'white', borderRadius: 16, width: '100%', maxWidth: 440,
        boxShadow: '0 20px 60px rgba(0,0,0,.3)', fontFamily: FF, overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '1.1rem 1.25rem', borderBottom: '1px solid #F3F4F6' }}>
          <div style={{ fontSize: '1.0625rem', fontWeight: 800, color: NAVY, lineHeight: 1.3 }}>
            {state === 'READY' || state === 'READY_AFTER_WAIT' ? 'Ready to start video' : 'Patient not ready for video'}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Status card */}
          <div style={{
            background: statusBg, border: `1px solid ${statusBorder}`, borderRadius: 10,
            padding: '.85rem .95rem', fontSize: '.9375rem', color: statusColor,
            fontWeight: 700, lineHeight: 1.45, display: 'flex', alignItems: 'center', gap: 10,
          }}>
            {showSpinner && (
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block', width: 14, height: 14, borderRadius: '50%',
                  border: '2px solid #BFDBFE', borderTopColor: '#1E40AF',
                  animation: 'tere-presence-spin 0.9s linear infinite',
                  flexShrink: 0,
                }}
              />
            )}
            <span>{statusLine}</span>
          </div>

          {/* State 2 shows masked phone so the provider knows which number
              they're about to text before clicking. */}
          {state === 'NOT_PRESENT' && (
            <div style={{
              fontSize: '.8125rem', color: '#6B7280', fontFamily: FF,
              display: 'flex', justifyContent: 'space-between', gap: 8,
            }}>
              <span>Phone on file</span>
              <span style={{ color: '#374151', fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 600 }}>
                {phoneMasked}
              </span>
            </div>
          )}

          {/* State 3 sub-line (poll cadence hint). */}
          {subLine && (
            <div style={{ fontSize: '.8125rem', color: '#6B7280', fontWeight: 500 }}>
              {subLine}
            </div>
          )}

          {actionError && (
            <div style={{
              background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B',
              borderRadius: 10, padding: '.6rem .75rem', fontSize: '.8125rem', fontWeight: 600,
            }}>
              {actionError}
            </div>
          )}

          {/* Primary action. Absent in State 3 (WAITING). */}
          {primary && (
            <button
              type="button"
              onClick={primary.onClick}
              disabled={primary.disabled}
              style={{
                background: TEAL, color: 'white', border: 'none', borderRadius: 10,
                padding: '.8rem 1rem', fontWeight: 700, fontSize: '.9375rem', fontFamily: FF,
                cursor: primary.disabled ? 'not-allowed' : 'pointer',
                opacity: primary.disabled ? 0.65 : 1, minHeight: 48,
              }}
            >
              {primary.label}
            </button>
          )}

          {/* Secondary small links row. "Call phone instead" always visible,
              "Cancel" only in State 3 so the provider can bail out of the
              wait without closing the whole chart. */}
          <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            gap: 14, marginTop: 2, flexWrap: 'wrap',
          }}>
            <button
              type="button"
              onClick={handleCallPhone}
              disabled={phoneBusy || !hasPhone}
              style={{
                background: 'none', border: 'none', color: TEAL,
                fontSize: '.8125rem', fontWeight: 600, fontFamily: FF,
                cursor: (phoneBusy || !hasPhone) ? 'not-allowed' : 'pointer',
                opacity: (phoneBusy || !hasPhone) ? 0.5 : 1,
                padding: '.25rem .25rem', textDecoration: 'underline',
              }}
            >
              {phoneBusy ? 'Dialling...' : 'Call phone instead'}
            </button>
            {showCancelLink && (
              <>
                <span style={{ color: '#CBD5E1', fontSize: '.75rem' }} aria-hidden="true">|</span>
                <button
                  type="button"
                  onClick={handleClose}
                  style={{
                    background: 'none', border: 'none', color: '#6B7280',
                    fontSize: '.8125rem', fontWeight: 600, fontFamily: FF,
                    cursor: 'pointer', padding: '.25rem .25rem', textDecoration: 'underline',
                  }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      {/* Inline keyframes so we don't need a global CSS edit for the one
          spinner this modal uses. */}
      <style>{`@keyframes tere-presence-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
