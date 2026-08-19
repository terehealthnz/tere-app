// SendBackToQueueModal — admin-only modal fired from ClinicianPatient.
//
// Two encounter types:
//   * reopen  — same encounter, no new charge, capped at 7 days (server enforces)
//   * waiver  — fresh consult with fee_waived=true (Tere absorbs the patient fee;
//               provider still gets paid)
//
// Reason is a dropdown of 8 common cases + "Other" (unlocks free text).
// Optional patient notification (default on) sends an SMS + email letting the
// patient know a doctor will follow up.
//
// Payment note: the "New consult — patient pays" (billable) path is deliberately
// NOT here. Admin-initiated billable consults need a distinct email/SMS payment
// link workflow; that's a follow-up build.

import React, { useState } from 'react'
import { apiFetch } from '../../lib/api'
import { isNZ } from '../../lib/region'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'

// "NHI correction" is filtered out on the US surface (see effectiveReasons
// below) since US patients don't have NHIs.
const REASON_PRESETS = [
  'Pharmacy update',
  'Phone / contact update',
  'GP / clinic update',
  'NHI correction',
  'Clinical follow-up',
  'Repeat prescription request',
  'Service correction',
  'Other',
]

export default function SendBackToQueueModal({ patient, onClose, onDone }) {
  const [encounterType, setEncounterType] = useState('waiver') // 'reopen' | 'waiver'
  const [reasonPreset,  setReasonPreset]  = useState('Pharmacy update')
  const [freeText,      setFreeText]      = useState('')
  const [notifyPatient, setNotifyPatient] = useState(true)
  const [submitting,    setSubmitting]    = useState(false)
  const [error,         setError]         = useState(null)

  const isOther = reasonPreset === 'Other'
  const effectiveReason = isOther ? freeText.trim() : reasonPreset
  const canSubmit = effectiveReason.length >= 2 && !submitting

  async function submit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true); setError(null)
    try {
      const r = await apiFetch('/api/consultations?action=admin_send_to_queue', {
        method: 'POST',
        body:   JSON.stringify({
          patient_id:      patient.id,
          encounter_type:  encounterType,
          reason:          effectiveReason,
          waiver_reason:   encounterType === 'waiver' ? reasonPreset : null,
          notify_patient:  notifyPatient,
        }),
      })
      const j = await r.json()
      if (!r.ok) { setError(j?.error || `HTTP ${r.status}`); setSubmitting(false); return }
      onDone?.(j)
      onClose?.()
    } catch (err) {
      setError(err.message || 'Network error'); setSubmitting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(13,43,69,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: FF }}>
      <form onSubmit={submit} style={{ background: 'white', borderRadius: 16, maxWidth: 480, width: '100%', padding: '1.5rem' }}>
        <div style={{ fontWeight: 800, color: NAVY, fontSize: '1.1rem', marginBottom: 4 }}>Send back to provider queue</div>
        <div style={{ fontSize: '.8rem', color: '#6B7280', marginBottom: 16 }}>
          <strong>{patient.first_name} {patient.last_name}</strong>
          {isNZ() && patient.nhi && <> · NHI {patient.nhi}</>}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Reason</div>
          <select value={reasonPreset} onChange={(e) => setReasonPreset(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border,#E2E8F0)', fontFamily: 'inherit', fontSize: '.9rem', background: 'white' }}>
            {REASON_PRESETS.filter(r => isNZ() || r !== 'NHI correction').map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {isOther && (
            <input type="text" value={freeText} onChange={(e) => setFreeText(e.target.value)}
              placeholder="Describe the reason (2+ characters)"
              maxLength={200}
              style={{ marginTop: 8, width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border,#E2E8F0)', fontFamily: 'inherit', fontSize: '.9rem' }}
              autoFocus />
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Encounter</div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${encounterType === 'reopen' ? TEAL : '#E2E8F0'}`, marginBottom: 6, background: encounterType === 'reopen' ? 'rgba(11,110,118,.06)' : 'white', cursor: 'pointer' }}>
            <input type="radio" name="enc" checked={encounterType === 'reopen'} onChange={() => setEncounterType('reopen')} style={{ marginTop: 3, accentColor: TEAL }} />
            <span style={{ fontSize: '.85rem', color: NAVY, lineHeight: 1.5 }}>
              <strong>Reopen last consult</strong> — continues the most recent encounter (must be ≤ 7 days old). No charge. Provider payroll unchanged.
            </span>
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${encounterType === 'waiver' ? TEAL : '#E2E8F0'}`, background: encounterType === 'waiver' ? 'rgba(11,110,118,.06)' : 'white', cursor: 'pointer' }}>
            <input type="radio" name="enc" checked={encounterType === 'waiver'} onChange={() => setEncounterType('waiver')} style={{ marginTop: 3, accentColor: TEAL }} />
            <span style={{ fontSize: '.85rem', color: NAVY, lineHeight: 1.5 }}>
              <strong>New consult — admin fee waiver</strong> — fresh encounter. Patient pays nothing. Tere absorbs the fee; provider still gets paid per-consult.
            </span>
          </label>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: '.85rem', color: NAVY }}>
          <input type="checkbox" checked={notifyPatient} onChange={(e) => setNotifyPatient(e.target.checked)} style={{ accentColor: TEAL }} />
          <span>Notify patient by SMS + email that a doctor will follow up</span>
        </label>

        {error && (
          <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#7F1D1D', padding: '8px 10px', borderRadius: 6, fontSize: '.8rem', marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}
            style={{ background: 'transparent', border: '1px solid #E5E7EB', color: '#6B7280', padding: '.55rem 1rem', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '.85rem' }}>
            Cancel
          </button>
          <button type="submit" disabled={!canSubmit}
            style={{ background: canSubmit ? TEAL : '#D1D5DB', color: 'white', border: 'none', padding: '.55rem 1.25rem', borderRadius: 8, cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: 700, fontSize: '.9rem' }}>
            {submitting ? 'Sending…' : 'Send to queue'}
          </button>
        </div>
      </form>
    </div>
  )
}
