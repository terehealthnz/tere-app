// Consult break-glass prompt (task #414). Shown when a provider tries to
// open a chart that isn't in their active queue. Records their reason +
// notes; server writes audit_log; caller re-fetches after grant.

import React, { useState } from 'react'
import { grantConsultBreakGlass } from '../../lib/supabase'

const NAVY = '#0D2B45'
const AMBER = '#D97706'
const FF = 'Plus Jakarta Sans, sans-serif'

const REASONS = [
  { value: 'clinical_care',            label: 'Clinical care',            hint: 'Continuity of care, following up on this patient' },
  { value: 'complaint_investigation',  label: 'Complaint investigation',  hint: 'HDC-track or patient complaint response' },
  { value: 'quality_audit',            label: 'Quality audit',            hint: 'Peer review, scheduled audit sample' },
  { value: 'billing_dispute',          label: 'Billing dispute',          hint: 'Payment / ACC amount query' },
  { value: 'support_ticket_response',  label: 'Support ticket',           hint: 'Responding to a patient contact form' },
  { value: 'patient_request',          label: 'Patient information request', hint: 'Patient asked for their own records' },
  { value: 'other',                    label: 'Other (explain below)',    hint: 'Free text — required' },
]

export default function ConsultBreakGlassPrompt({ open, patientName, consultStatus, consultCreated, consultationId, onCancel, onGranted }) {
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  if (!open) return null

  const canSubmit = reason && notes.trim().length >= 20

  async function submit(e) {
    e?.preventDefault?.()
    if (!canSubmit) { setErr('A reason + at least 20 characters of justification are required.'); return }
    setBusy(true); setErr(null)
    try {
      await grantConsultBreakGlass(consultationId, { reason, reasonNotes: notes.trim() })
      onGranted?.()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,43,69,.75)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, fontFamily: FF }}>
      <form onSubmit={submit} style={{ background: 'white', borderRadius: 14, padding: '1.5rem', maxWidth: 520, width: '100%', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '.5rem' }}>
          <span style={{ fontSize: '1.5rem' }}>🚨</span>
          <div style={{ fontWeight: 800, color: NAVY, fontSize: '1.0625rem' }}>Break-glass access required</div>
        </div>
        <p style={{ fontSize: '.8125rem', color: '#374151', lineHeight: 1.6, margin: '0 0 .75rem' }}>
          This chart is not in your active queue. Opening it requires a documented reason under HDC accountability + our access control policy.
          Your justification will be recorded in the audit trail against your provider account.
        </p>
        {patientName && (
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '.5rem .75rem', fontSize: '.8125rem', color: '#374151', marginBottom: '1rem' }}>
            <strong>Patient:</strong> {patientName}
            {consultStatus && <> · <span style={{ color: '#6B7280' }}>status <strong>{consultStatus}</strong></span></>}
            {consultCreated && <> · <span style={{ color: '#6B7280' }}>consult from {new Date(consultCreated).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' })}</span></>}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.375rem', marginBottom: '1rem' }}>
          {REASONS.map(r => (
            <label key={r.value} style={{ display: 'flex', alignItems: 'flex-start', gap: '.625rem', cursor: 'pointer', background: reason === r.value ? '#FFFBEB' : 'white', border: `1px solid ${reason === r.value ? '#FDE68A' : '#E2E8F0'}`, borderRadius: 8, padding: '.5rem .75rem' }}>
              <input type="radio" name="bg-reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} style={{ marginTop: 3 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '.875rem', color: NAVY }}>{r.label}</div>
                <div style={{ fontSize: '.75rem', color: '#6B7280' }}>{r.hint}</div>
              </div>
            </label>
          ))}
        </div>
        <label style={{ fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
          Justification <span style={{ color: '#DC2626' }}>(required, ≥ 20 chars)</span>
        </label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
          placeholder="Describe why you need to open this chart. Include any reference IDs (ticket, complaint #, audit sample)."
          style={{ width: '100%', boxSizing: 'border-box', padding: '.5rem .75rem', border: '1px solid #E2E8F0', borderRadius: 6, fontFamily: FF, fontSize: '.8125rem', resize: 'vertical', minHeight: 80 }} />
        <div style={{ fontSize: '.6875rem', color: '#6B7280', marginTop: 4 }}>
          {notes.trim().length}/20 chars minimum
        </div>
        {err && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '.5rem .75rem', borderRadius: 6, fontSize: '.75rem', marginTop: '.75rem' }}>{err}</div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: '1.25rem', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={{ background: 'white', border: '1px solid #E2E8F0', color: '#374151', padding: '.5rem 1rem', borderRadius: 8, fontFamily: FF, fontSize: '.8125rem', fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="submit" disabled={!canSubmit || busy}
            style={{ background: canSubmit ? AMBER : '#CBD5E1', color: 'white', border: 'none', padding: '.5rem 1rem', borderRadius: 8, fontFamily: FF, fontSize: '.8125rem', fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
            {busy ? 'Recording…' : 'Break glass + open chart'}
          </button>
        </div>
        <div style={{ fontSize: '.6875rem', color: '#9CA3AF', marginTop: '.75rem', lineHeight: 1.4 }}>
          Unlock lasts 60 minutes on this chart for your account. Recorded in audit log against your provider ID. Admin will see this in the compliance panel.
        </div>
      </form>
    </div>
  )
}
