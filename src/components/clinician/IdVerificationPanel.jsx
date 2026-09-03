// Patient identity verification attestation (task #426).
// Renders inline on ClinicianPatient. Provider records how they verified
// the on-camera person is the NHI holder. Recorded per-consult in the
// audit trail. Prevents wrong-patient records + NHI-borrow fraud.

import React, { useState } from 'react'
import { updateConsultation } from '../../lib/supabase'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const GREEN = '#059669'
const AMBER = '#D97706'
const FF   = 'Plus Jakarta Sans, sans-serif'

const STATUS_OPTIONS = [
  { v: 'verified_photo_id',            l: 'Verified — photo ID sighted (driver’s licence / passport)', ok: true },
  { v: 'verified_kba',                 l: 'Verified — knowledge-based (NHI + DOB + address match)',    ok: true },
  { v: 'verified_repeat_patient',      l: 'Verified — repeat patient, recognised visually',            ok: true },
  { v: 'verified_carer_present',       l: 'Verified — carer present, vouches for identity',            ok: true },
  { v: 'unverified_declined_by_patient', l: 'Unverified — patient declined',                           ok: false },
  { v: 'unverified_no_id_available',   l: 'Unverified — no ID available',                              ok: false },
  { v: 'unverified_uncertain_match',   l: 'Unverified — uncertain match, defer prescribing',           ok: false },
]

const card = { background:'white', borderRadius:14, padding:'1.25rem', marginBottom:12, border:'1.5px solid #E2E8F0', fontFamily: FF }
const inp  = { padding: '.5rem .625rem', border: '1px solid #E2E8F0', borderRadius: 6, fontFamily: FF, fontSize: '.8125rem', width: '100%', boxSizing: 'border-box' }
const lbl  = { fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }

export default function IdVerificationPanel({ consult, onUpdated }) {
  const initialStatus = consult?.id_verification_status || ''
  const [status, setStatus] = useState(initialStatus)
  const [docType, setDocType] = useState(consult?.id_verification_document_type || '')
  const [notes, setNotes] = useState(consult?.id_verification_notes || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState(null)

  const isVerified = STATUS_OPTIONS.find(s => s.v === status)?.ok
  const already = !!consult?.id_verification_at

  async function save() {
    if (!status) { setErr('Pick a verification status'); return }
    setBusy(true); setErr(null)
    try {
      const providerName = sessionStorage.getItem('providerDisplayName') || ''
      const providerId   = sessionStorage.getItem('providerId') || null
      await updateConsultation(consult.id, {
        id_verification_status:        status,
        id_verification_method:        status === 'verified_photo_id' ? 'photo_id_camera'
                                     : status === 'verified_kba'      ? 'knowledge_based'
                                     : status === 'verified_repeat_patient' ? 'repeat_visual'
                                     : 'other',
        id_verification_document_type: docType || null,
        id_verification_provider_id:   providerId,
        id_verification_provider_name: providerName,
        id_verification_at:            new Date().toISOString(),
        id_verification_notes:         notes.trim() || null,
      })
      onUpdated?.()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  if (already && initialStatus === status) {
    // Show a compact verified badge + expand-to-edit
    const opt = STATUS_OPTIONS.find(s => s.v === status)
    return (
      <div style={{ ...card, background: opt?.ok ? '#F0FDF4' : '#FEF3C7', borderColor: opt?.ok ? '#BBF7D0' : '#FDE68A' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:'.6875rem', color:'#6B7280', fontWeight:700, textTransform:'uppercase' }}>Patient identity</div>
            <div style={{ fontWeight:700, color: opt?.ok ? GREEN : AMBER, fontSize:'.9375rem' }}>
              {opt?.ok ? '✓ ' : '⚠ '}{opt?.l || status}
            </div>
            <div style={{ fontSize:'.6875rem', color:'#6B7280', marginTop:2 }}>
              Verified by {consult.id_verification_provider_name || '—'} at {new Date(consult.id_verification_at).toLocaleString('en-NZ', { timeZone:'Pacific/Auckland' })}
              {notes && ` · ${notes}`}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={card}>
      <div style={{ fontSize:'.6875rem', color:'#9CA3AF', fontWeight:700, textTransform:'uppercase', marginBottom:8 }}>
        Patient identity verification <span style={{ color:'#DC2626' }}>*</span>
        <span style={{ color:'#9CA3AF', fontWeight:400, textTransform:'none', marginLeft:8 }}>
          — is the on-camera person the NHI holder?
        </span>
      </div>
      {STATUS_OPTIONS.map(o => (
        <label key={o.v} style={{ display:'flex', gap:8, alignItems:'flex-start', padding:'.375rem 0', cursor:'pointer', fontSize:'.8125rem', color: o.ok ? '#065F46' : '#78350F' }}>
          <input type="radio" name="idv-status" value={o.v} checked={status === o.v} onChange={() => setStatus(o.v)} style={{ marginTop:3 }} />
          {o.l}
        </label>
      ))}
      {isVerified && status === 'verified_photo_id' && (
        <div style={{ marginTop:8 }}>
          <label style={lbl}>Document type</label>
          <select value={docType} onChange={e => setDocType(e.target.value)} style={inp}>
            <option value="">Select…</option>
            <option value="drivers_licence">NZ Driver's Licence</option>
            <option value="passport">Passport</option>
            <option value="18_plus">18+ card</option>
            <option value="other">Other photo ID</option>
          </select>
        </div>
      )}
      {status && (
        <>
          <label style={{ ...lbl, marginTop:8 }}>Notes (optional)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. NHI-linked address confirmed, licence sighted onscreen" style={inp} />
        </>
      )}
      {err && <div style={{ background:'#FEE2E2', color:'#991B1B', padding:'.5rem .75rem', borderRadius:6, fontSize:'.75rem', marginTop:8 }}>{err}</div>}
      <button onClick={save} disabled={busy || !status} style={{ marginTop:10, padding:'.5rem 1rem', background: status ? TEAL : '#CBD5E1', color:'white', border:'none', borderRadius:8, fontFamily:FF, fontSize:'.8125rem', fontWeight:700, cursor: status ? 'pointer' : 'not-allowed' }}>
        {busy ? 'Recording…' : already ? 'Update attestation' : 'Record verification'}
      </button>
      <div style={{ fontSize:'.6875rem', color:'#9CA3AF', marginTop:8, lineHeight:1.5 }}>
        Prevents wrong-patient records + NHI-borrow prescribing fraud. Recorded per consult in the audit trail with your provider name.
      </div>
    </div>
  )
}
