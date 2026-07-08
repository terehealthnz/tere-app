// PhiRevealGate — wraps any clinical PHI display in an admin surface.
//
// Rendering rules:
//   1. Provider role (is_provider === true): pass through, no gate. Providers
//      have direct clinical need — logged only at session start.
//   2. Billing-admin role: replace children with a "no clinical access" pill.
//      Auditor cannot unlock — architectural block, not just UI.
//   3. Admin role: show a redacted stub with a "Reveal" button. Click asks for
//      a reason (once per consult per session), writes /api/audit-log, then
//      renders children. Reason cached in sessionStorage keyed by consultationId
//      so opening the same chart later in the session doesn't re-prompt.
//
// Session cache lives in sessionStorage only — a fresh browser tab / new sign-in
// re-prompts. This matches "reasonable safeguards" without being annoying.

import React, { useState } from 'react'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF = 'Plus Jakarta Sans, sans-serif'

const REASONS = [
  { value: 'billing_dispute',         label: 'Billing dispute',          hint: 'Payment reconciliation, refund query, ACC amount check' },
  { value: 'complaint_investigation', label: 'Complaint investigation',  hint: 'HDC-track or patient complaint response' },
  { value: 'quality_audit',           label: 'Quality audit',            hint: 'Scheduled clinical review, peer-review sample' },
  { value: 'support_ticket_response', label: 'Support ticket',           hint: 'Handling a patient contact form submission' },
  { value: 'patient_request',         label: 'Patient information request', hint: 'Patient asked for their own records (Right 6)' },
  { value: 'other',                   label: 'Other (explain below)',    hint: 'Requires a note' },
]

function isBillingAdmin() {
  return sessionStorage.getItem('providerIsBillingAdmin') === 'true'
}
function isProvider() {
  return sessionStorage.getItem('providerIsProvider') === 'true'
}
function sessionKey(consultationId) {
  return `tere_phi_reveal_${consultationId || 'none'}`
}

// Read cached reason for a specific consultation (undefined if not yet revealed).
export function getCachedReason(consultationId) {
  try {
    const raw = sessionStorage.getItem(sessionKey(consultationId))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

async function writeAudit({ action, reason, reason_notes, consultation_id, resource_type, resource_id, metadata }) {
  try {
    await apiFetch('/api/audit-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason, reason_notes, consultation_id, resource_type, resource_id, metadata }),
    })
  } catch (e) {
    console.warn('[PhiRevealGate] audit write failed:', e.message)
  }
}

export function ReasonPicker({ open, onCancel, onConfirm, subject }) {
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  if (!open) return null
  const canSubmit = !!reason && (reason !== 'other' || notes.trim().length >= 5)
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(13,43,69,.6)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'white', borderRadius:14, padding:'1.5rem', maxWidth:520, width:'100%', maxHeight:'90vh', overflowY:'auto', fontFamily:FF }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
          <span style={{ fontSize:'1.25rem' }}>🔒</span>
          <div style={{ fontWeight:800, fontSize:'1.0625rem', color:NAVY }}>Reason for accessing PHI</div>
        </div>
        <p style={{ fontSize:'.8125rem', color:'#6B7280', margin:'0 0 1rem', lineHeight:1.55 }}>
          You are about to view protected health information. Under HIPC Rule 5 and the Privacy Act 2020, every access must be logged with a legitimate purpose. This will be recorded in the audit log against your account.
        </p>
        {subject && (
          <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:8, padding:'.5rem .75rem', fontSize:'.8125rem', color:'#374151', marginBottom:'1rem' }}>
            {subject}
          </div>
        )}
        <div style={{ display:'flex', flexDirection:'column', gap:'.5rem', marginBottom:'1rem' }}>
          {REASONS.map(r => (
            <label key={r.value} style={{ display:'flex', alignItems:'flex-start', gap:'.625rem', cursor:'pointer', background: reason === r.value ? '#EFF9F9' : 'white', border: `1px solid ${reason === r.value ? '#A7D4D8' : '#E2E8F0'}`, borderRadius:8, padding:'.625rem .75rem' }}>
              <input type="radio" name="phi-reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} style={{ marginTop:3 }} />
              <div>
                <div style={{ fontWeight:700, fontSize:'.875rem', color:NAVY }}>{r.label}</div>
                <div style={{ fontSize:'.75rem', color:'#6B7280' }}>{r.hint}</div>
              </div>
            </label>
          ))}
        </div>
        <div style={{ marginBottom:'1rem' }}>
          <label style={{ fontSize:'.75rem', color:'#6B7280', fontWeight:700, display:'block', marginBottom:4 }}>
            Notes {reason === 'other' && <span style={{ color:'#DC2626' }}>(required)</span>}
          </label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder={reason === 'other' ? 'Explain the reason for access…' : 'Optional context (e.g. ticket #, case reference)'}
            style={{ width:'100%', boxSizing:'border-box', padding:'.5rem .75rem', border:'1px solid #E2E8F0', borderRadius:6, fontFamily:FF, fontSize:'.8125rem', resize:'vertical', minHeight:60 }} />
        </div>
        <div style={{ display:'flex', gap:'.5rem', justifyContent:'flex-end' }}>
          <button onClick={onCancel} style={{ background:'white', border:'1px solid #E2E8F0', color:'#374151', padding:'.5rem 1rem', borderRadius:8, fontFamily:FF, fontSize:'.875rem', fontWeight:600, cursor:'pointer' }}>
            Cancel
          </button>
          <button disabled={!canSubmit || submitting}
            onClick={async () => { setSubmitting(true); await onConfirm({ reason, reason_notes: notes.trim() }); setSubmitting(false) }}
            style={{ background: canSubmit ? TEAL : '#CBD5E1', color:'white', border:'none', padding:'.5rem 1rem', borderRadius:8, fontFamily:FF, fontSize:'.875rem', fontWeight:700, cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
            {submitting ? 'Recording…' : 'Reveal + log'}
          </button>
        </div>
      </div>
    </div>
  )
}

// PhiRevealGate — main wrapper. Consult must be identified so audit logs
// attach correctly and reason cache scopes to the chart being viewed.
//
// Props:
//   consultationId  — REQUIRED; used for cache key + audit target
//   action          — audit event_type, e.g. 'view_consult_notes'
//   resourceType    — 'consultation' | 'prescription' | 'transcript'
//   resourceId      — optional secondary resource id
//   summary         — short pill text shown redacted, e.g. "Clinical notes (hidden)"
//   subject         — one-line context passed to the reason picker
//   children        — the actual PHI to reveal after logging
export default function PhiRevealGate({ consultationId, action, resourceType, resourceId, summary, subject, children }) {
  const [showPicker, setShowPicker] = useState(false)
  const [revealed, setRevealed] = useState(!!getCachedReason(consultationId))

  // Providers get direct access — clinical care is the legitimate purpose.
  if (isProvider()) return children

  // Billing admin: architectural block. No reveal button.
  if (isBillingAdmin()) {
    return (
      <div style={{ background:'#F1F5F9', border:'1px dashed #94A3B8', borderRadius:8, padding:'.625rem .875rem', color:'#475569', fontSize:'.8125rem', fontFamily:FF }}>
        🚫 Clinical detail hidden — your role does not include clinical access.
      </div>
    )
  }

  if (revealed) return children

  return (
    <>
      <div style={{ background:'#FEF3C7', border:'1px solid #FCD34D', borderRadius:8, padding:'.625rem .875rem', display:'flex', alignItems:'center', gap:'.75rem', fontFamily:FF, fontSize:'.8125rem' }}>
        <span style={{ fontSize:'1rem' }}>🔒</span>
        <div style={{ flex:1, color:'#78350F' }}>
          {summary || 'Clinical detail hidden — reveal to view'}
        </div>
        <button onClick={() => setShowPicker(true)}
          style={{ background:'#F59E0B', color:'white', border:'none', padding:'.375rem .75rem', borderRadius:6, fontFamily:FF, fontSize:'.75rem', fontWeight:700, cursor:'pointer' }}>
          Reveal →
        </button>
      </div>
      <ReasonPicker
        open={showPicker}
        subject={subject}
        onCancel={() => setShowPicker(false)}
        onConfirm={async ({ reason, reason_notes }) => {
          await writeAudit({
            action: action || 'view_phi',
            reason,
            reason_notes,
            consultation_id: consultationId,
            resource_type: resourceType || 'consultation',
            resource_id: resourceId || consultationId,
          })
          try {
            sessionStorage.setItem(sessionKey(consultationId), JSON.stringify({ reason, reason_notes, at: Date.now() }))
          } catch {}
          setRevealed(true)
          setShowPicker(false)
        }}
      />
    </>
  )
}
