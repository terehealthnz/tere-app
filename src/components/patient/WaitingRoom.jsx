import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getPatientConsult, patientUpdateConsultation, sendPatientHeartbeat } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'

const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(b64) {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4)
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

async function registerPatientPush(consultationId) {
  try {
    const isNative = window.Capacitor?.isNativePlatform?.()
    if (isNative) {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      const status = await PushNotifications.checkPermissions()
      let perm = status.receive
      if (perm === 'prompt' || perm === 'prompt-with-rationale') {
        const result = await PushNotifications.requestPermissions()
        perm = result.receive
      }
      if (perm !== 'granted') return
      await PushNotifications.register()
      PushNotifications.addListener('registration', async (tokenData) => {
        await apiFetch('/api/push-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consultationId,
            token: tokenData.value,
            platform: window.Capacitor.getPlatform(),
          }),
        })
      })
    } else if ('serviceWorker' in navigator && 'PushManager' in window && VAPID_KEY) {
      if (Notification.permission === 'denied') return
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      const sub = existing || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_KEY) })
      await apiFetch('/api/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultationId, subscription: sub.toJSON() }),
      })
    }
  } catch {}
}

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

  // Pharmacy card + picker. Patient chose one in triage; they can swap it
  // here if they realise it's closed / far away. Updates land on the
  // consultations row via /api/patient-consult so the provider sees the
  // new pharmacy when they pick up the consult.
  const [pharmacyName, setPharmacyName] = useState(null)
  const [pharmacyId, setPharmacyId] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pharmacyIndex, setPharmacyIndex] = useState(null)
  const [pharmacyQuery, setPharmacyQuery] = useState('')
  const [savingPharmacy, setSavingPharmacy] = useState(false)

  const patientName = (sessionStorage.getItem('patientName') || '').split(' ')[0] || null
  const consultType = sessionStorage.getItem('consultationType') || 'video'
  const afterHours  = sessionStorage.getItem('after_hours') === 'true'

  async function cancelConsultation() {
    try {
      await patientUpdateConsultation(consultationId, { status: 'cancelled' })
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
    navigate('/start')
  }

  useEffect(() => {
    ensureWaiting(consultationId)
  }, [consultationId])

  // Presence heartbeat — pings /api/patient-heartbeat every 15s so the provider's
  // Call button can decide LiveKit-vs-phone routing based on how recently the
  // patient was seen (server treats <30s as "online"). Fire once on mount for
  // instant presence, then on interval.
  useEffect(() => {
    if (!consultationId || consultationId.startsWith('demo')) return
    sendPatientHeartbeat(consultationId)
    const id = setInterval(() => sendPatientHeartbeat(consultationId), 15000)
    return () => clearInterval(id)
  }, [consultationId])

  // Fetch created_at for the countdown + hydrate the pharmacy card from the
  // consult row (patient picked it in triage; may swap here).
  useEffect(() => {
    if (!consultationId || consultationId.startsWith('demo')) return
    getPatientConsult(consultationId).then(c => {
      if (c?.created_at) setCreatedAt(c.created_at)
      if (c?.pharmacy) setPharmacyName(c.pharmacy)
      if (c?.pharmacy_id) setPharmacyId(c.pharmacy_id)
    }).catch(() => {})
  }, [consultationId])

  // Lazy-load Medsafe pharmacy register the first time the picker opens,
  // then filter to pharmacies that have a dispensary_email on file (fax was
  // decommissioned 2026-08-01).
  useEffect(() => {
    if (!pickerOpen || pharmacyIndex !== null) return
    let cancelled = false
    ;(async () => {
      try {
        const [registerRes, { fetchEmailablePharmacyIds }] = await Promise.all([
          fetch('/pharmacies.json'),
          import('../../lib/supabase'),
        ])
        const list = registerRes.ok ? await registerRes.json() : []
        if (!Array.isArray(list)) { if (!cancelled) setPharmacyIndex([]); return }
        const emailable = await fetchEmailablePharmacyIds()
        const filtered = emailable && emailable.size > 0
          ? list.filter(p => emailable.has(p.id))
          : list
        if (!cancelled) setPharmacyIndex(filtered)
      } catch {
        if (!cancelled) setPharmacyIndex([])
      }
    })()
    return () => { cancelled = true }
  }, [pickerOpen, pharmacyIndex])

  const pharmacyResults = (() => {
    const q = pharmacyQuery.trim().toLowerCase()
    if (q.length < 2 || !pharmacyIndex) return []
    const nameHits = []
    const otherHits = []
    for (const p of pharmacyIndex) {
      const name    = (p.premises_name || '').toLowerCase()
      const address = (p.address       || '').toLowerCase()
      const town    = (p.town          || '').toLowerCase()
      const region  = (p.region        || '').toLowerCase()
      if (name.includes(q)) nameHits.push(p)
      else if (address.includes(q) || town.includes(q) || region.includes(q)) otherHits.push(p)
      if (nameHits.length + otherHits.length >= 40) break
    }
    return [...nameHits, ...otherHits].slice(0, 8)
  })()

  async function selectPharmacy(pharmacy) {
    if (!pharmacy?.premises_name) return
    setSavingPharmacy(true)
    const label = pharmacy.town
      ? `${pharmacy.premises_name}, ${pharmacy.town}`
      : pharmacy.premises_name
    try {
      await patientUpdateConsultation(consultationId, {
        pharmacy: label,
        pharmacy_id: pharmacy.id || null,
      })
      setPharmacyName(label)
      setPharmacyId(pharmacy.id || null)
      setPickerOpen(false)
      setPharmacyQuery('')
    } catch (e) {
      console.error('[waiting-room] pharmacy update failed:', e.message)
    }
    setSavingPharmacy(false)
  }

  // Countdown ticks every second
  useEffect(() => {
    if (!createdAt) return
    const deadline = new Date(createdAt).getTime() + 2 * 60 * 60 * 1000
    const tick = () => setSecsLeft(Math.max(0, Math.floor((deadline - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [createdAt])

  // Register patient's device for push (so provider can call them back from background)
  useEffect(() => {
    if (!consultationId || consultationId.startsWith('demo')) return
    registerPatientPush(consultationId)
  }, [consultationId])

  // Fire push notification to providers once
  useEffect(() => {
    if (!consultationId || consultationId.startsWith('demo') || pushFiredRef.current) return
    pushFiredRef.current = true
    getPatientConsult(consultationId).then(c => {
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
        const consult = await getPatientConsult(consultationId)
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
          {providerName ? `${providerName} will` : 'A doctor will'} review your notes and {consultType === 'message' ? 'send you a written reply' : consultType === 'video' ? 'video call you' : 'call you'} <strong style={{ color: 'rgba(255,255,255,.8)' }}>{afterHours ? 'from 8am' : 'within 2 hours'}</strong>.
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
              {consultType === 'message' ? '💬' : consultType === 'video' ? '📹' : '📞'}
            </span>
            <div>
              <div style={{ color: 'rgba(212,238,240,.8)', fontWeight: 700, fontSize: '.9375rem', marginBottom: '.25rem' }}>
                {consultType === 'message' ? 'Watch your email' : 'Keep your device nearby'}
              </div>
              <div style={{ color: 'rgba(255,255,255,.4)', fontSize: '.8125rem', lineHeight: 1.6 }}>
                {consultType === 'message'
                  ? afterHours
                    ? "Your doctor's written reply will arrive by email from 8am."
                    : "Your doctor's written reply will arrive by email within 2 hours."
                  : afterHours
                    ? 'Your doctor will start the call from 8am. Video is optional — turn it on any time.'
                    : "You'll get a notification when the call starts. Video is optional — turn it on any time."}
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
                  You'll receive an email with a link to join your consultation.
                </div>
              </div>
            </div>
          )}
        </div>


        {/* Pharmacy card — patient can swap before doctor prescribes */}
        {pharmacyName && (
          <div style={{
            background: 'rgba(255,255,255,.06)',
            border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 14,
            padding: '1rem 1.25rem',
            width: '100%',
            maxWidth: 360,
            marginBottom: '2rem',
            textAlign: 'left',
            animation: 'fadeUp .5s .65s both',
            display: 'flex', alignItems: 'flex-start', gap: '1rem',
          }}>
            <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>💊</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'rgba(212,238,240,.55)', fontSize: '.75rem', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: '.25rem' }}>
                Prescription pharmacy
              </div>
              <div style={{ color: 'rgba(212,238,240,.9)', fontWeight: 700, fontSize: '.9375rem', marginBottom: '.375rem', wordBreak: 'break-word' }}>
                {pharmacyName}
              </div>
              <div style={{ color: 'rgba(255,255,255,.4)', fontSize: '.75rem', lineHeight: 1.6, marginBottom: '.5rem' }}>
                If your doctor issues a prescription, it will be sent here. Please check the pharmacy is open when you need it.
              </div>
              <button onClick={() => setPickerOpen(true)}
                style={{ background: 'transparent', border: 'none', color: '#4FD1D9', fontSize: '.8125rem', fontWeight: 600, padding: 0, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
                Change pharmacy
              </button>
            </div>
          </div>
        )}

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

      {/* Pharmacy picker modal */}
      {pickerOpen && (
        <div onClick={e => { if (e.target === e.currentTarget) { setPickerOpen(false); setPharmacyQuery('') } }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(6,21,37,.72)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#0F2E4C', border: '1px solid rgba(255,255,255,.12)', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '90dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: 'white', fontWeight: 700, fontSize: '1rem' }}>Choose your pharmacy</div>
                <div style={{ color: 'rgba(255,255,255,.4)', fontSize: '.75rem', marginTop: 2 }}>Search by pharmacy name or suburb</div>
              </div>
              <button onClick={() => { setPickerOpen(false); setPharmacyQuery('') }}
                style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: 'white', width: 32, height: 32, borderRadius: 8, fontSize: '1.125rem', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '.875rem 1.25rem' }}>
              <input
                autoFocus
                value={pharmacyQuery}
                onChange={e => setPharmacyQuery(e.target.value)}
                placeholder="e.g. Unichem Whanganui"
                style={{ width: '100%', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 10, padding: '.75rem 1rem', color: 'white', fontSize: '.9375rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 .5rem 1rem' }}>
              {!pharmacyIndex && (
                <div style={{ color: 'rgba(255,255,255,.4)', fontSize: '.8125rem', padding: '1rem 1.25rem' }}>Loading pharmacy list…</div>
              )}
              {pharmacyIndex && pharmacyQuery.trim().length < 2 && (
                <div style={{ color: 'rgba(255,255,255,.4)', fontSize: '.8125rem', padding: '.5rem 1.25rem' }}>Type at least 2 characters to search.</div>
              )}
              {pharmacyIndex && pharmacyQuery.trim().length >= 2 && pharmacyResults.length === 0 && (
                <div style={{ color: 'rgba(255,255,255,.4)', fontSize: '.8125rem', padding: '.5rem 1.25rem' }}>No pharmacies matched. Try a different name or suburb.</div>
              )}
              {pharmacyResults.map(p => (
                <button key={p.id} disabled={savingPharmacy} onClick={() => selectPharmacy(p)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', color: 'white', padding: '.75rem 1rem', margin: '.375rem .75rem', borderRadius: 10, cursor: savingPharmacy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: savingPharmacy ? 0.6 : 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '.9375rem', color: 'rgba(212,238,240,.95)' }}>{p.premises_name}</div>
                  <div style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.45)', marginTop: 2 }}>{p.address || p.town || p.region || ''}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
