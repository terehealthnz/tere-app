// NhiLookup — provider/admin quick-jump: type an NHI (3 letters + 4 chars),
// hit Enter, navigate directly to the patient record.
//
// Every call server-side writes a `nhi_query` row to audit_logs so we can
// answer "who queried NHI X" during an HDC / OPC investigation. Provider
// clinical NHI queries are audited silently (no reason prompt); admin
// PHI reveals downstream still fire the existing PhiRevealGate.
//
// NHI format is enforced client-side as 3 letters + 4 alphanumeric chars
// (case-insensitive). The final position of a modern NHI may be a letter
// (post-2020 revised format), so we allow letter-or-digit there rather
// than digit-only.

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { findPatientByNhi } from '../../lib/supabase'

const NHI_RE = /^[A-Z]{3}[A-Z0-9]{4}$/i

export default function NhiLookup({ compact = false }) {
  const navigate = useNavigate()
  const [nhi, setNhi]         = useState('')
  const [state, setState]     = useState({ phase: 'idle' })

  async function search(e) {
    e?.preventDefault?.()
    const clean = nhi.trim().toUpperCase()
    if (!clean) return
    if (!NHI_RE.test(clean)) { setState({ phase: 'invalid' }); return }
    setState({ phase: 'searching' })
    try {
      const p = await findPatientByNhi(clean)
      if (p?.id) {
        setState({ phase: 'idle' })
        // ClinicianPatient is anchored on a consult id, so route to the
        // patient's most-recent consult where possible. Fallback: land on the
        // patient row and let admin use "Send back to queue" to create one.
        if (p.last_consultation_id) {
          navigate(`/clinician/patient/${p.last_consultation_id}`)
        } else {
          setState({ phase: 'no_consult', patient: p })
        }
      } else {
        setState({ phase: 'not_found' })
      }
    } catch (err) {
      setState({ phase: 'error', msg: err.message || 'Lookup failed' })
    }
  }

  const w = compact ? 200 : 260
  return (
    <form onSubmit={search} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="text"
          value={nhi}
          onChange={(e) => { setNhi(e.target.value); if (state.phase !== 'idle') setState({ phase: 'idle' }) }}
          placeholder="🔎 Look up by NHI (e.g. ABC1234)"
          maxLength={7}
          style={{
            width: w, padding: '6px 10px', borderRadius: 8,
            border: `1.5px solid ${state.phase === 'invalid' || state.phase === 'not_found' ? '#DC2626' : 'var(--border)'}`,
            fontSize: '.875rem', fontFamily: 'inherit', textTransform: 'uppercase',
            letterSpacing: '.05em',
          }}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={!nhi || state.phase === 'searching'}
          style={{
            background: nhi ? 'var(--teal)' : '#D1D5DB',
            color: 'white', border: 'none',
            padding: '6px 12px', borderRadius: 8,
            fontWeight: 700, fontSize: '.8rem',
            cursor: nhi ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
          }}>
          {state.phase === 'searching' ? '…' : 'Find'}
        </button>
      </div>
      {state.phase === 'invalid' && (
        <div style={{ fontSize: '.7rem', color: '#B91C1C' }}>NHI is 3 letters + 4 characters (e.g. ABC1234)</div>
      )}
      {state.phase === 'not_found' && (
        <div style={{ fontSize: '.7rem', color: '#B45309' }}>Not found in Tere records. Try a name search or create a new patient.</div>
      )}
      {state.phase === 'error' && (
        <div style={{ fontSize: '.7rem', color: '#B91C1C' }}>Error: {state.msg}</div>
      )}
      {state.phase === 'no_consult' && state.patient && (
        <div style={{ fontSize: '.75rem', color: '#065F46', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 6, padding: '6px 10px' }}>
          Found <strong>{state.patient.first_name} {state.patient.last_name}</strong> (NHI {state.patient.nhi}) — no consultations yet. Use Admin → Patients to view the record, or create their first consult via triage.
        </div>
      )}
    </form>
  )
}
