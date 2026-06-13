import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getConsultation } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'

function fmtCountdown(secs) {
  if (secs <= 0) return '0:00:00'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

async function ensureWaiting(consultationId) {
  if (!consultationId || consultationId.startsWith('demo')) return
  try {
    await apiFetch('/api/confirm-waiting', {
      method: 'POST',
      body: JSON.stringify({ consultationId }),
    })
  } catch {}
}

export default function WaitingRoom() {
  const navigate = useNavigate()
  const { id: idParam } = useParams()
  const [providerName, setProviderName] = useState(null)
  const consultationId = idParam || sessionStorage.getItem('consultationId')
  const pushFiredRef = useRef(false)
  const [createdAt, setCreatedAt] = useState(null)
  const [secsLeft, setSecsLeft] = useState(null)

  const patientName = (sessionStorage.getItem('patientName') || '').split(' ')[0] || null
  const consultType = sessionStorage.getItem('consultationType') || 'video'
  const afterHours  = sessionStorage.getItem('after_hours') === 'true'

  async function cancelConsultation() {
    try {
      const { supabase } = await import('../../lib/supabase')
      await supabase.from('consultations').update({ status: 'cancelled' }).eq('id', consultationId)
      const paymentIntentId = sessionStorage.getItem('paymentIntentId')
      if (paymentIntentId) {
        await apiFetch('/api/cancel-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId })
        })
      }
    } catch {}
    sessionStorage.clear()
    navigate('/triage')
  }

  useEffect(() => {
    ensureWaiting(consultationId)
  }, [consultationId])

  // Fetch created_at for the countdown
  useEffect(() => {
    if (!consultationId || consultationId.startsWith('demo')) return
    getConsultation(consultationId).then(c => {
      if (c?.created_at) setCreatedAt(c.created_at)
    }).catch(() => {})
  }, [consultationId])

  // Countdown ticks every second
  useEffect(() => {
    if (!createdAt) return
    const deadline = new Date(createdAt).getTime() + 2 * 60 * 60 * 1000
    const tick = () => setSecsLeft(Math.max(0, Math.floor((deadline - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [createdAt])

  // Fire push notification to providers once
  useEffect(() => {
    if (!consultationId || consultationId.startsWith('demo') || pushFiredRef.current) return
    pushFiredRef.current = true
    getConsultation(consultationId).then(c => {
      apiFetch('/api/push-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'new_patient',
          consultationId,
          patientName: `${c.patient_first_name || ''} ${c.patient_last_name || ''}`.trim(),
          chiefComplaint: c.chief_complaint || '',
          accEligible: c.acc_eligible === 'yes',
        }),
      }).catch(() => {})
    }).catch(() => {})
  }, [consultationId])

  // Poll + realtime: when provider initiates call, navigate to /call
  useEffect(() => {
    if (!consultationId || consultationId.startsWith('demo')) return

    function handleStatusChange(status, providerDisplayName) {
      if (providerDisplayName) setProviderName(providerDisplayName)
      if (['in_progress', 'ready'].includes(status)) { navigate('/call'); return }
    }

    const poll = async () => {
      try {
        const consult = await getConsultation(consultationId)
        if (!consult) return
        handleStatusChange(consult.status, consult.provider_display_name)
      } catch {}
    }

    poll()
    const interval = setInterval(poll, 4000)

    let channel
    ;(async () => {
      const { supabase } = await import('../../lib/supabase')
      channel = supabase
        .channel(`consult-patient-${consultationId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'consultations',
          filter: `id=eq.${consultationId}`,
        }, ({ new: row }) => {
          handleStatusChange(row.status, row.provider_display_name)
        })
        .subscribe()
    })()

    return () => {
      clearInterval(interval)
      channel?.unsubscribe?.()
    }
  }, [consultationId, navigate])

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(160deg, #0D2B45 0%, #0a2038 60%, #061525 100%)',
      fontFamily: 'Plus Jakarta Sans, sans-serif',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <style>{`
        @keyframes checkIn {
          0%   { transform: scale(0.6); opacity: 0; }
          70%  { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1);   opacity: 1; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-ring {
          0%   { transform: scale(1);   opacity: .4; }
          100% { transform: scale(2.4); opacity: 0; }
        }
      `}</style>

      {/* Header */}
      <div style={{ padding: '1.25rem 1.5rem', paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}>
        <div style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', color: 'rgba(212,238,240,.8)', fontSize: '1.3rem' }}>Tere</div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.5rem', textAlign: 'center' }}>

        {/* Animated check mark */}
        <div style={{ position: 'relative', width: 96, height: 96, marginBottom: '2rem' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.5px solid rgba(11,110,118,.5)', animation: 'pulse-ring 2.8s ease-out 0.4s infinite' }} />
          <div style={{
            position: 'absolute', inset: 0,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #0B6E76, #0a5a62)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2.5rem',
            animation: 'checkIn 0.5s cubic-bezier(.17,.67,.44,1.2) forwards',
            boxShadow: '0 0 40px rgba(11,110,118,.4)',
          }}>✓</div>
        </div>

        {patientName && (
          <div style={{ color: 'rgba(212,238,240,.55)', fontSize: '.9375rem', marginBottom: '.375rem', letterSpacing: '.02em', animation: 'fadeUp .5s .3s both' }}>
            Kia ora, {patientName}
          </div>
        )}

        <h1 style={{ color: 'white', fontSize: '1.625rem', fontWeight: 700, margin: '0 0 .75rem', lineHeight: 1.25, animation: 'fadeUp .5s .4s both' }}>
          Request submitted
        </h1>

        {/* Timer */}
        {afterHours ? (
          <div style={{ marginBottom: '1.25rem', animation: 'fadeUp .5s .45s both', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'rgba(212,238,240,.9)' }}>From 8am</div>
            <div style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.3)', marginTop: '.25rem' }}>
              your doctor will contact you when available
            </div>
          </div>
        ) : secsLeft !== null && (
          <div style={{ marginBottom: '1.25rem', animation: 'fadeUp .5s .45s both', textAlign: 'center' }}>
            <div style={{
              fontFamily: 'monospace',
              fontSize: '2.25rem',
              fontWeight: 700,
              letterSpacing: '.06em',
              color: secsLeft <= 0 ? '#EF4444' : secsLeft < 1800 ? '#FBBF24' : 'rgba(212,238,240,.9)',
            }}>
              {secsLeft <= 0 ? 'Window closed' : fmtCountdown(secsLeft)}
            </div>
            <div style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.3)', marginTop: '.25rem' }}>
              time remaining in your 2-hour window
            </div>
          </div>
        )}

        <p style={{ color: 'rgba(255,255,255,.55)', fontSize: '1rem', lineHeight: 1.7, maxWidth: 320, margin: '0 0 2rem', animation: 'fadeUp .5s .5s both' }}>
          {providerName ? `${providerName} will` : 'A doctor will'} review your notes and {consultType === 'phone' ? 'phone you' : consultType === 'message' ? 'send you a written reply' : 'video call you'} <strong style={{ color: 'rgba(255,255,255,.8)' }}>{afterHours ? 'from 8am' : 'within 2 hours'}</strong>.
        </p>

        {/* Info cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem', width: '100%', maxWidth: 360, marginBottom: '2rem', animation: 'fadeUp .5s .6s both' }}>
          <div style={{
            background: 'rgba(255,255,255,.06)',
            border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 14,
            padding: '1rem 1.25rem',
            textAlign: 'left',
            display: 'flex', alignItems: 'flex-start', gap: '1rem',
          }}>
            <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>
              {consultType === 'phone' ? '📞' : consultType === 'message' ? '💬' : '📹'}
            </span>
            <div>
              <div style={{ color: 'rgba(212,238,240,.8)', fontWeight: 700, fontSize: '.9375rem', marginBottom: '.25rem' }}>
                {consultType === 'message' ? 'Watch your email' : `Keep your ${consultType === 'phone' ? 'phone' : 'device'} nearby`}
              </div>
              <div style={{ color: 'rgba(255,255,255,.4)', fontSize: '.8125rem', lineHeight: 1.6 }}>
                {consultType === 'message'
                  ? afterHours
                    ? "Your doctor's written reply will arrive by email from 8am."
                    : "Your doctor's written reply will arrive by email within 2 hours."
                  : consultType === 'phone'
                    ? afterHours
                      ? 'Your doctor will phone you from 8am — keep your phone on and answer unknown NZ numbers.'
                      : "You'll receive a phone call — answer any unknown NZ numbers for the next 2 hours."
                    : afterHours
                      ? 'Your doctor will start a video call from 8am — keep this tab open.'
                      : "You'll get a notification to join a video call. Keep this tab open or check your email."}
              </div>
            </div>
          </div>

          {consultType !== 'message' && (
            <div style={{
              background: 'rgba(255,255,255,.06)',
              border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 14,
              padding: '1rem 1.25rem',
              textAlign: 'left',
              display: 'flex', alignItems: 'flex-start', gap: '1rem',
            }}>
              <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>📧</span>
              <div>
                <div style={{ color: 'rgba(212,238,240,.8)', fontWeight: 700, fontSize: '.9375rem', marginBottom: '.25rem' }}>
                  Watch your email
                </div>
                <div style={{ color: 'rgba(255,255,255,.4)', fontSize: '.8125rem', lineHeight: 1.6 }}>
                  {consultType === 'phone'
                    ? "You'll receive an email with a link to join your audio consultation."
                    : "You'll receive an email with a link to join your video call."}
                </div>
              </div>
            </div>
          )}
        </div>


        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: '2rem', animation: 'fadeUp .5s .7s both' }}>
          {[
            { label: 'Submitted', done: true },
            { label: 'Dr reviewing', done: false },
            { label: 'Callback', done: false },
          ].map((step, i, arr) => (
            <React.Fragment key={step.label}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: step.done ? '#0B6E76' : 'rgba(255,255,255,.08)',
                  border: step.done ? 'none' : '1.5px solid rgba(255,255,255,.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '.75rem', color: step.done ? 'white' : 'rgba(255,255,255,.3)',
                  fontWeight: 700,
                }}>
                  {step.done ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: '.6875rem', color: step.done ? 'rgba(212,238,240,.8)' : 'rgba(255,255,255,.3)', whiteSpace: 'nowrap' }}>
                  {step.label}
                </span>
              </div>
              {i < arr.length - 1 && (
                <div style={{ width: 36, height: 1, background: 'rgba(255,255,255,.12)', margin: '0 4px', marginBottom: 18 }} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* No-charge notice for after-hours */}
        {afterHours && (
          <div style={{ background: 'rgba(11,110,118,.2)', border: '1px solid rgba(11,110,118,.4)', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1.5rem', width: '100%', maxWidth: 360, animation: 'fadeUp .5s .75s both' }}>
            <div style={{ color: 'rgba(212,238,240,.9)', fontWeight: 700, fontSize: '.9375rem', marginBottom: '.25rem' }}>Card held, not charged yet</div>
            <div style={{ color: 'rgba(255,255,255,.5)', fontSize: '.8125rem', lineHeight: 1.6 }}>Your card is held but you won't be charged until your doctor contacts you. Cancel anytime and the hold is released automatically.</div>
          </div>
        )}

        {/* Cancel */}
        <button onClick={cancelConsultation}
          style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.2)', color: 'rgba(255,255,255,.7)', fontSize: '.9375rem', cursor: 'pointer', padding: '.75rem 1.5rem', borderRadius: 10, fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 600 }}>
          Cancel — remove me from the queue
        </button>
      </div>

      {/* Footer */}
      <div style={{ padding: '1.25rem 1.5rem', paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,.06)' }}>
        <div style={{ color: 'rgba(255,255,255,.25)', fontSize: '.75rem', lineHeight: 1.8 }}>
          Emergency? Call <a href="tel:111" style={{ color: '#ef4444', fontWeight: 700, textDecoration: 'none' }}>111</a> immediately
          &nbsp;·&nbsp;
          Mental health: call or text <a href="tel:1737" style={{ color: 'rgba(255,255,255,.4)', textDecoration: 'none' }}>1737</a>
        </div>
      </div>
    </div>
  )
}
