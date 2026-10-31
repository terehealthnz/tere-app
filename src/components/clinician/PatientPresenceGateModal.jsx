// Patient-presence gate modal.
//
// Fires when the provider clicks Video on a consult where the patient isn't
// actually in the waiting room (never joined, or last_seen_at > 60s ago).
// Three actions:
//   1. Send SMS with join link   -> /api/send-waiting-link
//   2. Call phone instead        -> /api/initiate-call with forcePhone:true
//   3. Cancel                    -> close
//
// A live "Waiting for patient to join..." footer polls the consult every 10s
// and auto-closes + fires onPatientJoined the moment presence flips to
// in_waiting_room. Polling (not realtime) because it's a short-lived modal
// and we already have /api/consultations?id= as a cheap read; piggy-backing
// on the queue subscribeToQueue isn't worth the plumbing when the modal is
// typically open for <60s.

import React, { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../../lib/api'
import { getPatientPresence, presenceLabel } from '../../lib/patientPresence'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'

// Last-4-digits mask so an over-the-shoulder glance doesn't leak the full
// number. The server endpoint returns the masked form in its success response
// too so the toast matches.
function maskPhone(phone) {
  const raw = String(phone || '').replace(/\s+/g, '')
  if (!raw) return 'no phone on record'
  if (raw.length <= 4) return raw
  const last4 = raw.slice(-4)
  const prefixLen = Math.max(0, raw.length - 4)
  return raw.slice(0, Math.min(3, prefixLen)) + ' '.repeat(0) + 'X'.repeat(Math.max(0, prefixLen - 3)) + ' ' + last4
}

export default function PatientPresenceGateModal({
  consult,
  providerId,
  providerName,
  onClose,
  onPatientJoined,       // called when polling observes presence flip -> in_waiting_room
  onPhoneFallback,       // called after a successful /api/initiate-call with forcePhone:true
}) {
  const consultationId = consult?.id
  const [livePresence, setLivePresence] = useState(() => getPatientPresence(consult))
  const [smsBusy, setSmsBusy] = useState(false)
  const [phoneBusy, setPhoneBusy] = useState(false)
  const [smsToast, setSmsToast] = useState(null)   // { ok: boolean, text: string }
  const [actionError, setActionError] = useState(null)
  const closedRef = useRef(false)

  // Poll the consult every 10s so we see the heartbeat land + the status flip
  // without waiting for the queue subscription to re-render the parent. First
  // tick fires at 10s (not immediately) because props already carry the latest
  // snapshot from the queue fetch.
  useEffect(() => {
    if (!consultationId) return
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
        if (next.status === 'in_waiting_room' && !closedRef.current) {
          closedRef.current = true
          if (typeof onPatientJoined === 'function') onPatientJoined(row)
        }
      } catch {}
    }
    const id = setInterval(poll, 10000)
    // Also re-tick the "ago" counter so the body copy stays fresh even when
    // the server-side state hasn't changed.
    const tick = setInterval(() => {
      setLivePresence(p => (p ? { ...p, lastSeenAgoSec: p.lastSeenAgoSec != null ? p.lastSeenAgoSec + 1 : null } : p))
    }, 1000)
    return () => { cancelled = true; clearInterval(id); clearInterval(tick) }
  }, [consultationId, onPatientJoined])

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
      setSmsToast({ ok: true, text: `Sent to ${j.to || maskPhone(consult?.patient_phone)}` })
    } catch (e) {
      setSmsToast({ ok: false, text: `SMS failed: ${e.message}` })
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

  function handleClose() {
    closedRef.current = true
    if (typeof onClose === 'function') onClose()
  }

  const phoneMasked = maskPhone(consult?.patient_phone)
  const hasPhone = !!(consult?.patient_phone && String(consult.patient_phone).trim())
  const presenceCopy = presenceLabel(livePresence)
  const livePill = livePresence?.status === 'in_waiting_room'

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
            Patient not ready for video
          </div>
          <div style={{ fontSize: '.8125rem', color: '#6B7280', marginTop: 4 }}>
            Starting video now would ring an empty tab. Pick an option below.
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{
            background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10,
            padding: '.75rem .875rem', fontSize: '.875rem', color: '#374151', lineHeight: 1.5,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600, color: NAVY }}>Presence</span>
              <span style={{ color: livePresence?.status === 'in_waiting_room' ? '#065F46' : livePresence?.status === 'joined_but_stale' ? '#92400E' : '#6B7280', fontWeight: 700 }}>
                {presenceCopy}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', marginTop: 6 }}>
              <span style={{ fontWeight: 600, color: NAVY }}>Phone</span>
              <span style={{ color: '#374151', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                {phoneMasked}
              </span>
            </div>
          </div>

          {smsToast && (
            <div style={{
              background: smsToast.ok ? '#F0FDF4' : '#FEF2F2',
              border: `1px solid ${smsToast.ok ? '#BBF7D0' : '#FECACA'}`,
              color: smsToast.ok ? '#065F46' : '#991B1B',
              borderRadius: 10, padding: '.6rem .75rem', fontSize: '.8125rem', fontWeight: 600,
            }}>
              {smsToast.ok ? '✓ ' : '⚠ '}{smsToast.text}
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

          <button
            type="button"
            onClick={handleSendSms}
            disabled={smsBusy || !hasPhone}
            style={{
              background: TEAL, color: 'white', border: 'none', borderRadius: 10,
              padding: '.75rem 1rem', fontWeight: 700, fontSize: '.9375rem', fontFamily: FF,
              cursor: (smsBusy || !hasPhone) ? 'not-allowed' : 'pointer',
              opacity: (smsBusy || !hasPhone) ? 0.65 : 1, minHeight: 44,
            }}
          >
            {smsBusy ? 'Sending...' : hasPhone ? 'Send SMS with join link' : 'No phone on record'}
          </button>
          <button
            type="button"
            onClick={handleCallPhone}
            disabled={phoneBusy || !hasPhone}
            style={{
              background: 'white', color: TEAL, border: `1.5px solid ${TEAL}`,
              borderRadius: 10, padding: '.75rem 1rem', fontWeight: 700, fontSize: '.9375rem',
              fontFamily: FF, cursor: (phoneBusy || !hasPhone) ? 'not-allowed' : 'pointer',
              opacity: (phoneBusy || !hasPhone) ? 0.65 : 1, minHeight: 44,
            }}
          >
            {phoneBusy ? 'Dialling...' : hasPhone ? 'Call phone instead' : 'No phone on record'}
          </button>
          <button
            type="button"
            onClick={handleClose}
            style={{
              background: 'white', color: '#6B7280', border: '1.5px solid #E2E8F0',
              borderRadius: 10, padding: '.6rem 1rem', fontWeight: 600, fontSize: '.875rem',
              fontFamily: FF, cursor: 'pointer', minHeight: 40,
            }}
          >
            Cancel
          </button>
        </div>

        {/* Footer: live "waiting for patient" tape. Flips to a green ready
            state the instant the poll observes in_waiting_room - the parent
            then closes the modal via onPatientJoined. */}
        <div style={{
          background: livePill ? '#F0FDF4' : '#F8FAFC',
          borderTop: `1px solid ${livePill ? '#BBF7D0' : '#F3F4F6'}`,
          padding: '.6rem 1.25rem', fontSize: '.75rem', fontWeight: 600,
          color: livePill ? '#065F46' : '#6B7280',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
            background: livePill ? '#10B981' : '#9CA3AF',
            boxShadow: livePill ? '0 0 0 4px rgba(16,185,129,.2)' : 'none',
          }} />
          {livePill ? 'Patient is ready - closing...' : 'Waiting for patient to join...'}
        </div>
      </div>
    </div>
  )
}
