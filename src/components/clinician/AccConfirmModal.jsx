// AccConfirmModal — mandatory Yes/No gate at Complete Encounter.
//
// Fires only when the consult is still flagged ACC from the patient's triage
// answer (is_acc=true || acc_eligible='yes') AND the provider hasn't already
// confirmed or declined on this consult. Provider must pick an option — no
// dismiss, no X button, no backdrop-click close. This is the forcing-function
// Patrick wanted (2026-10-15, Melanie's otitis externa consult, where the
// patient's water-in-ear → "yes-to-accident" answer silently billed the visit
// at the ACC co-pay rate without the provider ever confirming).
//
// YES → endpoint stamps acc_provider_confirmed_at/by, is_acc stays true.
// NO  → provider captures reason (e.g. "otitis externa — infection"), endpoint
//        stamps declined_at/by/reason AND flips is_acc=false, acc_eligible='no'.
//
// Billing reconciliation (top-up charge, patient email) is intentionally NOT
// here — admin handles that separately via the existing surfaces once the flag
// is corrected.

import { useState } from 'react'
import { apiFetch } from '../../lib/api'

const NAVY   = '#0D2B45'
const TEAL   = '#0B6E76'
const RED    = '#DC2626'
const AMBER  = '#B45309'
const BORDER = '#E2E8F0'

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(13, 43, 69, 0.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 10000, padding: 16,
}
const card = {
  background: 'white', borderRadius: 16, padding: 24,
  maxWidth: 480, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,.2)',
  fontFamily: 'Plus Jakarta Sans, sans-serif',
}
const h = { fontSize: '1.125rem', fontWeight: 700, color: NAVY, margin: '0 0 8px' }
const sub = { fontSize: '.875rem', color: '#475569', lineHeight: 1.5, margin: '0 0 20px' }
const btn = (bg, color, border) => ({
  flex: 1, background: bg, color, border: border ? `1.5px solid ${border}` : 'none',
  borderRadius: 10, padding: '12px 16px', fontSize: '.9375rem', fontWeight: 700,
  fontFamily: 'Plus Jakarta Sans, sans-serif', cursor: 'pointer',
})
const textarea = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
  border: `1.5px solid ${BORDER}`, borderRadius: 10,
  fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.9375rem',
  resize: 'vertical', minHeight: 80, outline: 'none',
}

export default function AccConfirmModal({ consultationId, onDecided }) {
  const [stage, setStage] = useState('ask') // 'ask' | 'declining'
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(decision, declineReason) {
    if (busy) return
    setBusy(true); setError('')
    try {
      const res = await apiFetch('/api/acc-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultationId,
          decision,
          declineReason: declineReason || undefined,
          providerId: sessionStorage.getItem('providerId') || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `Server returned ${res.status}`)
      onDecided(decision, data.consultation)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  if (stage === 'ask') {
    return (
      <div style={overlay}>
        <div style={card}>
          <div style={h}>Is this an ACC claim?</div>
          <p style={sub}>
            The patient flagged this visit as ACC-related in triage.
            Please confirm or override before closing the encounter.
            ACC covers injuries from an accident; infections, illnesses,
            and medical reviews are not ACC-eligible.
          </p>
          {error && (
            <div style={{ background: '#FEF2F2', color: RED, padding: '8px 12px', borderRadius: 8, fontSize: '.8125rem', marginBottom: 12 }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => setStage('declining')}
              disabled={busy}
              style={btn('white', AMBER, '#F59E0B')}>
              No, not ACC
            </button>
            <button
              type="button"
              onClick={() => submit('confirmed')}
              disabled={busy}
              style={btn(TEAL, 'white')}>
              {busy ? '…' : 'Yes, this is ACC'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // stage === 'declining'
  return (
    <div style={overlay}>
      <div style={card}>
        <div style={h}>Reclassify as non-ACC</div>
        <p style={sub}>
          This will flip the consult off ACC. Billing adjustments (top-up charge
          to the patient, email, etc.) are handled separately by admin — not
          triggered by this action.
        </p>
        <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 600, color: '#475569', marginBottom: 6 }}>
          Reason (shown in admin audit)
        </label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. otitis externa — infection, not injury"
          style={textarea}
          disabled={busy}
          autoFocus
        />
        {error && (
          <div style={{ background: '#FEF2F2', color: RED, padding: '8px 12px', borderRadius: 8, fontSize: '.8125rem', marginTop: 12 }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={() => { setStage('ask'); setError('') }}
            disabled={busy}
            style={btn('white', '#64748B', '#CBD5E1')}>
            Back
          </button>
          <button
            type="button"
            onClick={() => submit('declined', reason.trim())}
            disabled={busy || !reason.trim()}
            style={{ ...btn(RED, 'white'), opacity: (busy || !reason.trim()) ? .5 : 1 }}>
            {busy ? '…' : 'Reclassify as non-ACC'}
          </button>
        </div>
      </div>
    </div>
  )
}
