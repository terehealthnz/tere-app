import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

export default function ConsultationSummary() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch(`/api/consultation-token?token=${token}`)
        const json = await res.json()
        if (!res.ok || json.error) { setError(json.error || 'Failed to load'); return }
        setData(json)
      } catch { setError('Could not load your consultation summary.') }
      setLoading(false)
    }
    load()
  }, [token])

  const inp = { fontFamily: 'Plus Jakarta Sans, sans-serif' }

  if (loading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F0F2F5', ...inp }}>
      <div style={{ textAlign: 'center', color: '#9CA3AF' }}>Loading your consultation summary…</div>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F0F2F5', ...inp }}>
      <div style={{ textAlign: 'center', maxWidth: 400, padding: '2rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠</div>
        <div style={{ fontWeight: 700, color: '#0D2B45', marginBottom: '.5rem' }}>Link unavailable</div>
        <div style={{ color: '#6B7280', fontSize: '.9375rem' }}>{error}</div>
      </div>
    </div>
  )

  const { consult, prescriptions, plan } = data
  const name = `${consult.patient_first_name} ${consult.patient_last_name}`

  return (
    <div style={{ minHeight: '100dvh', background: '#F0F2F5', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <nav style={{ background: '#0D2B45', padding: '.875rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <span style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.3rem' }}>Tere</span>
        <span style={{ color: 'rgba(255,255,255,.4)', fontSize: '.875rem' }}>Consultation Summary</span>
      </nav>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '2rem 1.25rem' }}>
        {/* Header */}
        <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', marginBottom: '1rem', border: '1px solid #E2E8F0', borderTop: '4px solid #0B6E76' }}>
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', color: '#0B6E76', fontSize: '.875rem', marginBottom: '.5rem' }}>Tere Health — Consultation Summary</div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0D2B45', marginBottom: '.375rem' }}>{name}</h1>
          <div style={{ fontSize: '.875rem', color: '#6B7280' }}>
            {consult.patient_dob && `DOB: ${new Date(consult.patient_dob).toLocaleDateString('en-NZ')} · `}
            NHI: {consult.patient_nhi || '—'}
          </div>
          <div style={{ marginTop: '.75rem', fontSize: '.875rem', color: '#374151' }}>
            <strong>{new Date(consult.created_at).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong>
            {consult.provider_display_name && ` · ${consult.provider_display_name}`}
          </div>
        </div>

        {/* Complaint */}
        <div style={{ background: 'white', borderRadius: 12, padding: '1.25rem', marginBottom: '1rem', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#6B7280', marginBottom: '.5rem' }}>Reason for visit</div>
          <div style={{ fontSize: '.9375rem', color: '#0D2B45' }}>{consult.chief_complaint}</div>
        </div>

        {/* Plan */}
        {plan && (
          <div style={{ background: 'white', borderRadius: 12, padding: '1.25rem', marginBottom: '1rem', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#6B7280', marginBottom: '.5rem' }}>Your treatment plan</div>
            <div style={{ fontSize: '.9rem', color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{plan}</div>
          </div>
        )}

        {/* Prescriptions */}
        {prescriptions?.length > 0 && (
          <div style={{ background: 'white', borderRadius: 12, padding: '1.25rem', marginBottom: '1rem', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#6B7280', marginBottom: '.75rem' }}>Prescriptions</div>
            {prescriptions.map((rx, i) => (
              <div key={i} style={{ padding: '.625rem .875rem', background: '#F8FAFC', borderRadius: 8, marginBottom: '.5rem', border: '1px solid #E2E8F0' }}>
                <div style={{ fontWeight: 700, color: '#0D2B45', fontSize: '.9rem' }}>{rx.drug} {rx.dose}</div>
                <div style={{ fontSize: '.8125rem', color: '#6B7280', marginTop: 2 }}>{rx.directions}</div>
                {rx.qty && <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginTop: 2 }}>Qty: {rx.qty} · Repeats: {rx.repeats || 0}</div>}
              </div>
            ))}
            {consult.pharmacy && <div style={{ fontSize: '.8125rem', color: '#6B7280', marginTop: '.5rem' }}>Sent to: {consult.pharmacy}</div>}
          </div>
        )}

        {/* Outcome + follow-up */}
        <div style={{ background: 'white', borderRadius: 12, padding: '1.25rem', marginBottom: '1rem', border: '1px solid #E2E8F0' }}>
          {[
            consult.outcome && ['Outcome', consult.outcome.replace(/_/g, ' ')],
            consult.acc_eligible === 'yes' && ['ACC claim', `${consult.acc_read_code || 'Lodged'}`],
            consult.medical_certificate_issued && ['Medical certificate', 'Issued and emailed'],
            consult.gp_name && ['GP notified', consult.gp_name],
            consult.recall_date && ['Follow-up', `${new Date(consult.recall_date).toLocaleDateString('en-NZ')}${consult.recall_note ? ' — ' + consult.recall_note : ''}`],
          ].filter(Boolean).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #F9FAFB', fontSize: '.875rem' }}>
              <span style={{ color: '#9CA3AF', fontWeight: 600 }}>{k}</span>
              <span style={{ color: '#374151', textTransform: 'capitalize' }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', fontSize: '.75rem', color: '#9CA3AF', lineHeight: 1.6 }}>
          This summary is for your personal records only.<br />
          For clinical concerns, contact your provider or call 111 in an emergency.<br />
          This link expires 30 days after your consultation.
        </div>
      </div>
    </div>
  )
}
