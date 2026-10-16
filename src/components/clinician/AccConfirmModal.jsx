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
// NO  → provider captures reason + top-up action (charge differential via
//        Windcave email link / waive / defer to admin). Endpoint stamps
//        declined_at/by/reason, flips is_acc=false + acc_eligible='no',
//        and optionally creates a Windcave session + patient email.
//
// Safety hint: if the diagnosis already recorded on the consult matches
// a known non-injury keyword list (otitis externa, UTI, URTI, etc.),
// the stage-1 popup shows an extra warning banner. Doesn't block "Yes"
// — a splinter-caused cellulitis is still legitimately ACC — just nudges.

import { useState } from 'react'
import { apiFetch } from '../../lib/api'
import { diagnosisLooksNonInjury } from '../../lib/accNonInjuryKeywords'

const NAVY   = '#0D2B45'
const TEAL   = '#0B6E76'
const RED    = '#DC2626'
const AMBER  = '#B45309'
const BORDER = '#E2E8F0'

// Pricing — kept in sync with api/_windcave-create-session.js PRICES.
// Hardcoded on the client only to show the differential nicely in the
// top-up UI. Server is the authoritative source of what gets charged.
const PRIVATE_CONSULT_CENTS = 6500 // $65 standard private telehealth consult
const ACC_COPAY_CENTS       = 2500 // $25 ACC patient surcharge

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(13, 43, 69, 0.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 10000, padding: 16,
}
const card = {
  background: 'white', borderRadius: 16, padding: 24,
  maxWidth: 520, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,.2)',
  fontFamily: 'Plus Jakarta Sans, sans-serif',
  maxHeight: '92vh', overflowY: 'auto',
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
const numInput = {
  width: 120, boxSizing: 'border-box', padding: '8px 10px',
  border: `1.5px solid ${BORDER}`, borderRadius: 8,
  fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.9375rem',
  outline: 'none',
}
const radioRow = {
  display: 'flex', alignItems: 'flex-start', gap: 10,
  padding: 10, borderRadius: 10, border: `1.5px solid ${BORDER}`,
  cursor: 'pointer', marginBottom: 8,
}

function fmtMoney(cents) {
  return `$${(cents / 100).toFixed(2)}`
}

export default function AccConfirmModal({ consultationId, consult, onDecided }) {
  const [stage, setStage] = useState('ask') // 'ask' | 'declining'
  const [reason, setReason] = useState('')
  const [topUpAction, setTopUpAction] = useState('charge') // charge | waive | defer
  const [topUpAmount, setTopUpAmount] = useState(
    ((PRIVATE_CONSULT_CENTS - ACC_COPAY_CENTS) / 100).toFixed(2)
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Non-injury hint — looks at the diagnosis the provider has already
  // captured on the consult. Returns the matched term (e.g. "otitis externa")
  // or null if clean / no diagnosis yet.
  const diagnosis = consult?.diagnosis || consult?.diagnosis_description || ''
  const nonInjuryHit = diagnosisLooksNonInjury(diagnosis)

  // Employer-paid consults: no differential to collect from the patient
  // because the employer paid the flat employer rate upfront (WorkIntake
  // flow). Still need the popup to fire so the ACC flag gets corrected,
  // but hide the top-up charge/waive/defer radio — it's not applicable.
  const isEmployerPaid = consult?.consultation_type === 'employee'
                      || consult?.employer_paid === true

  async function submit(decision) {
    if (busy) return
    // ACC diagnosis gate: confirming an ACC consult requires an ICD-10 code
    // on the row — ACC's billing engine matches invoice lines against the
    // claim's registered diagnosis. Closing without it means silent decline
    // or 14-28 day manual review. Patrick 2026-10-16.
    if (decision === 'confirmed' && !consult?.acc_icd10_code) {
      setError('ACC consult needs an ICD-10 diagnosis code before closing. Open the ACC details panel on this consult\'s chart (Convert to ACC → ACC ICD-10 picker) and add it, then return here.')
      return
    }
    setBusy(true); setError('')
    try {
      const body = {
        consultationId,
        decision,
        providerId: sessionStorage.getItem('providerId') || undefined,
      }
      if (decision === 'declined') {
        body.declineReason = reason.trim()
        // Employer-paid: no top-up action — server will record status=waived
        // regardless (nothing to charge the employee for).
        if (isEmployerPaid) {
          body.topUpAction = 'waive'
        } else {
          body.topUpAction = topUpAction
          if (topUpAction === 'charge') {
            const cents = Math.round(parseFloat(topUpAmount || '0') * 100)
            if (!cents || cents < 100) {
              setError('Top-up amount must be at least $1.00')
              setBusy(false)
              return
            }
            body.topUpAmountCents = cents
          }
        }
      }
      const res = await apiFetch('/api/acc-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `Server returned ${res.status}`)
      onDecided(decision, data.consultation, data)
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
          {nonInjuryHit && (
            <div style={{
              background: '#FEF3C7', border: `1.5px solid #F59E0B`,
              color: '#92400E', padding: '10px 12px', borderRadius: 10,
              fontSize: '.8125rem', marginBottom: 16, lineHeight: 1.4,
            }}>
              ⚠️ Diagnosis contains <strong>"{nonInjuryHit}"</strong>, which
              typically isn't an injury. ACC usually doesn't cover this.
              Unless the presentation was triggered by a specific accident,
              pick <strong>No, not ACC</strong>.
            </div>
          )}
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
          {isEmployerPaid ? (
            <>This flips the consult off ACC. <strong>No billing adjustment needed</strong> — the employer paid the flat employer rate upfront, so there's no differential to collect from the patient.</>
          ) : (
            <>This flips the consult off ACC. Patient paid <strong>{fmtMoney(ACC_COPAY_CENTS)}</strong> (ACC co-pay); standard private rate is <strong>{fmtMoney(PRIVATE_CONSULT_CENTS)}</strong>. Pick what to do with the differential.</>
          )}
        </p>

        <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 600, color: '#475569', marginBottom: 6 }}>
          Reason (shown in admin audit)
        </label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder={nonInjuryHit ? `e.g. ${nonInjuryHit} — infection, not injury` : 'e.g. medical review, not an accident'}
          style={textarea}
          disabled={busy}
          autoFocus
        />

        {!isEmployerPaid && (
        <div style={{ fontSize: '.75rem', fontWeight: 600, color: '#475569', margin: '16px 0 6px' }}>
          Differential ({fmtMoney(PRIVATE_CONSULT_CENTS - ACC_COPAY_CENTS)})
        </div>
        )}

        {!isEmployerPaid && (<>
        <label style={{ ...radioRow, borderColor: topUpAction === 'charge' ? TEAL : BORDER }}>
          <input
            type="radio"
            name="topup"
            value="charge"
            checked={topUpAction === 'charge'}
            onChange={() => setTopUpAction('charge')}
            disabled={busy}
            style={{ marginTop: 3 }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.875rem', fontWeight: 600, color: NAVY }}>Charge via email link</div>
            <div style={{ fontSize: '.75rem', color: '#64748B', marginTop: 2 }}>
              Patient gets an email with a Windcave payment link for
              <span style={{ margin: '0 4px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                $<input
                  type="number"
                  step="0.01"
                  min="1"
                  value={topUpAmount}
                  onChange={e => setTopUpAmount(e.target.value)}
                  style={{ ...numInput, width: 80, padding: '4px 8px' }}
                  disabled={busy || topUpAction !== 'charge'}
                />
              </span>
            </div>
          </div>
        </label>

        <label style={{ ...radioRow, borderColor: topUpAction === 'waive' ? TEAL : BORDER }}>
          <input
            type="radio"
            name="topup"
            value="waive"
            checked={topUpAction === 'waive'}
            onChange={() => setTopUpAction('waive')}
            disabled={busy}
            style={{ marginTop: 3 }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.875rem', fontWeight: 600, color: NAVY }}>Waive (goodwill)</div>
            <div style={{ fontSize: '.75rem', color: '#64748B', marginTop: 2 }}>
              No further charge. Patient paid {fmtMoney(ACC_COPAY_CENTS)} and that's it.
            </div>
          </div>
        </label>

        <label style={{ ...radioRow, borderColor: topUpAction === 'defer' ? TEAL : BORDER }}>
          <input
            type="radio"
            name="topup"
            value="defer"
            checked={topUpAction === 'defer'}
            onChange={() => setTopUpAction('defer')}
            disabled={busy}
            style={{ marginTop: 3 }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.875rem', fontWeight: 600, color: NAVY }}>Defer to admin</div>
            <div style={{ fontSize: '.75rem', color: '#64748B', marginTop: 2 }}>
              Flag it in the Reclassifications tab — admin decides later.
            </div>
          </div>
        </label>
        </>)}

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
            onClick={() => submit('declined')}
            disabled={busy || !reason.trim()}
            style={{ ...btn(RED, 'white'), opacity: (busy || !reason.trim()) ? .5 : 1 }}>
            {busy ? '…' : 'Reclassify as non-ACC'}
          </button>
        </div>
      </div>
    </div>
  )
}
