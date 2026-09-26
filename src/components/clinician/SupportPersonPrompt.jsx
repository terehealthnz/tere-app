// HDC Right 8 — support-person prompt on video consult first mount
// (task #398). One-tap "Yes/No" + name field; stamps
// consultations.support_person_present + name. Shows once per consult
// per session — sessionStorage flag prevents re-prompt.

import React, { useEffect, useState } from 'react'
import { updateConsultation } from '../../lib/supabase'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF = 'Plus Jakarta Sans, sans-serif'

export default function SupportPersonPrompt({ consult, onDone }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!consult?.id) return
    // Already answered on this consult in this session, or already stored → skip.
    if (consult.support_person_present !== null && consult.support_person_present !== undefined) return
    const flag = `tere_support_prompted_${consult.id}`
    if (sessionStorage.getItem(flag) === '1') return
    sessionStorage.setItem(flag, '1')
    setOpen(true)
  }, [consult?.id])

  // One-click: pressing Yes or No saves immediately and closes. Support-person
  // name capture moved to the chart edit surface — providers rarely enter it
  // mid-call and this modal blocked the call flow.
  async function pick(val) {
    if (busy) return
    setBusy(true)
    try {
      await updateConsultation(consult.id, {
        support_person_present: val,
        support_person_name: null,
      })
    } catch (e) { console.warn('[SupportPersonPrompt] save failed:', e.message) }
    setBusy(false)
    setOpen(false)
    onDone?.()
  }

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,43,69,.7)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, fontFamily: FF }}>
      <div style={{ background: 'white', borderRadius: 14, padding: '1.5rem', maxWidth: 420, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,.25)' }}>
        <div style={{ fontWeight: 800, color: NAVY, fontSize: '1.0625rem', marginBottom: '.5rem' }}>Support person present?</div>
        <p style={{ fontSize: '.875rem', color: '#374151', lineHeight: 1.55, margin: '0 0 1rem' }}>
          Under HDC Code Right 8, patients have the right to a support person of their choice. Please confirm for this consult.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['No', false], ['Yes', true]].map(([label, val]) => (
            <button key={label} onClick={() => pick(val)} disabled={busy}
              style={{ flex: 1, padding: '.75rem 1rem', border: `1.5px solid ${TEAL}`, background: busy ? '#F1F5F9' : 'white', color: TEAL, borderRadius: 8, fontFamily: FF, fontSize: '.9375rem', fontWeight: 800, cursor: busy ? 'not-allowed' : 'pointer' }}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
