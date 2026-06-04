import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'

function InfoRow({ label, value }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: '.625rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: '.9375rem', color: NAVY, lineHeight: 1.5 }}>{value}</div>
    </div>
  )
}

export default function ClinicianPatient() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [consult, setConsult]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [starting, setStarting] = useState(false)

  const displayName = sessionStorage.getItem('providerDisplayName') || 'Provider'
  const providerId  = sessionStorage.getItem('providerId')

  useEffect(() => {
    if (!sessionStorage.getItem('clinicianAuth')) navigate('/clinician')
  }, [navigate])

  useEffect(() => {
    async function load() {
      try {
        const { supabase } = await import('../../lib/supabase')
        const { data } = await supabase.from('consultations').select('*').eq('id', id).single()
        setConsult(data)
      } catch {} finally { setLoading(false) }
    }
    if (id) load()
  }, [id])

  async function startCall() {
    if (!consult) return
    setStarting(true)
    try {
      await apiFetch('/api/initiate-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultationId: id, providerId, providerName: displayName }),
      })
    } catch {}
    navigate(`/provider/consult/${id}`)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: '#F7F5F0' }}>
      <div className="spinner" />
    </div>
  )

  if (!consult) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', flexDirection: 'column', gap: '1rem', fontFamily: FF, padding: '2rem', textAlign: 'center' }}>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: NAVY }}>Patient not found</div>
      <button onClick={() => navigate('/provider')} style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 99, padding: '.75rem 1.5rem', fontWeight: 700, cursor: 'pointer', fontFamily: FF }}>
        ← Back to Queue
      </button>
    </div>
  )

  const v = consult.vitals
  const typeIcon = consult.consultation_type === 'phone' ? '📞' : consult.consultation_type === 'message' ? '✉️' : '📹'
  const isCallable = ['waiting', 'vitals_requested', 'vitals_complete', 'ready'].includes(consult.status)

  return (
    <div style={{ minHeight: '100dvh', background: '#F7F5F0', fontFamily: FF }}>
      {/* Header */}
      <div style={{ background: NAVY, paddingTop: 'calc(.875rem + env(safe-area-inset-top))', paddingBottom: '.875rem', paddingLeft: '1.25rem', paddingRight: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button onClick={() => navigate('/provider')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: '1.375rem', padding: 0, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center' }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Cormorant Garamond,Georgia,serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.1rem' }}>Tere</div>
          <div style={{ color: 'rgba(255,255,255,.55)', fontSize: '.75rem' }}>Patient details</div>
        </div>
      </div>

      <div style={{ padding: '1.25rem 1rem 6rem', maxWidth: 640, margin: '0 auto' }}>

        {/* Name + type */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '.875rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '.75rem' }}>
            <div>
              <div style={{ fontSize: '1.375rem', fontWeight: 700, color: NAVY, marginBottom: '.25rem' }}>
                {consult.patient_first_name} {consult.patient_last_name}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ background: '#EFF9F9', color: TEAL, fontSize: '.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>
                  {typeIcon} {consult.consultation_type}
                </span>
                {consult.acc_eligible === 'yes' && (
                  <span style={{ background: '#D4EEF0', color: TEAL, fontSize: '.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>✓ ACC</span>
                )}
                <span style={{ background: '#F3F4F6', color: '#6B7280', fontSize: '.6875rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99 }}>
                  {consult.status}
                </span>
              </div>
            </div>
          </div>

          {/* Chief complaint */}
          <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '1rem', borderLeft: `3px solid ${TEAL}` }}>
            <div style={{ fontSize: '.625rem', fontWeight: 700, color: TEAL, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.375rem' }}>Chief Complaint</div>
            <div style={{ fontSize: '.9375rem', color: NAVY, lineHeight: 1.6 }}>{consult.chief_complaint}</div>
          </div>
        </div>

        {/* Patient info */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '.875rem' }}>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem', marginBottom: '1rem' }}>Patient information</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <InfoRow label="Date of birth" value={consult.patient_dob ? new Date(consult.patient_dob).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' }) : null} />
            <InfoRow label="NHI" value={consult.patient_nhi} />
            <InfoRow label="Phone" value={consult.patient_phone} />
            <InfoRow label="Email" value={consult.patient_email} />
            <InfoRow label="Location" value={consult.patient_location} />
            <InfoRow label="GP" value={consult.gp_name ? `${consult.gp_name}${consult.gp_clinic ? ` — ${consult.gp_clinic}` : ''}` : null} />
            {consult.patient_allergies && consult.patient_allergies !== 'None' && (
              <div style={{ gridColumn: '1 / -1', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '.75rem 1rem' }}>
                <div style={{ fontSize: '.625rem', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.25rem' }}>⚠ Allergies</div>
                <div style={{ fontSize: '.9375rem', color: '#991B1B', fontWeight: 600 }}>{consult.patient_allergies}</div>
              </div>
            )}
            {consult.medications && (
              <div style={{ gridColumn: '1 / -1' }}>
                <InfoRow label="Current medications" value={consult.medications} />
              </div>
            )}
            {consult.medical_history && (
              <div style={{ gridColumn: '1 / -1' }}>
                <InfoRow label="Medical history" value={consult.medical_history} />
              </div>
            )}
          </div>
        </div>

        {/* Vitals */}
        {v && !v.skipped && (v.hr || v.rr || v.spo2) && (
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '.875rem' }}>
            <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem', marginBottom: '.875rem' }}>Vital signs</div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              {v.hr  && <div style={{ background: '#F0FDF4', borderRadius: 10, padding: '.75rem 1.25rem', textAlign: 'center' }}><div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669' }}>{v.hr}</div><div style={{ fontSize: '.6875rem', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>bpm</div></div>}
              {v.rr  && <div style={{ background: '#EFF9F9', borderRadius: 10, padding: '.75rem 1.25rem', textAlign: 'center' }}><div style={{ fontSize: '1.5rem', fontWeight: 700, color: TEAL }}>{v.rr}</div><div style={{ fontSize: '.6875rem', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>resp/min</div></div>}
              {v.spo2 && <div style={{ background: '#F5F3FF', borderRadius: 10, padding: '.75rem 1.25rem', textAlign: 'center' }}><div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#7C3AED' }}>{v.spo2}%</div><div style={{ fontSize: '.6875rem', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>SpO₂</div></div>}
            </div>
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      {isCallable && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid #E2E8F0', padding: '1rem', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))', display: 'flex', gap: '.75rem', maxWidth: 640, margin: '0 auto' }}>
          <button onClick={() => navigate('/provider')} style={{ background: 'white', border: '1.5px solid #D1D5DB', color: '#6B7280', borderRadius: 12, padding: '14px 20px', fontWeight: 600, fontSize: '.9375rem', cursor: 'pointer', fontFamily: FF }}>
            ← Back
          </button>
          <button
            onClick={startCall}
            disabled={starting}
            style={{ flex: 1, background: starting ? '#9CA3AF' : TEAL, color: 'white', border: 'none', borderRadius: 12, padding: '14px', fontWeight: 700, fontSize: '1rem', cursor: starting ? 'not-allowed' : 'pointer', fontFamily: FF, minHeight: 56 }}
          >
            {starting ? 'Connecting…' : consult.consultation_type === 'phone' ? '📞 Start phone call' : '📹 Start video call'}
          </button>
        </div>
      )}
    </div>
  )
}
