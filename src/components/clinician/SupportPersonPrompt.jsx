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
  const [present, setPresent] = useState(null)
  const [name, setName] = useState('')
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

  async function save() {
    setBusy(true)
    try {
      await updateConsultation(consult.id, {
        support_person_present: !!present,
        support_person_name: present ? (name.trim() || null) : null,
      })
      onDone?.()
      setOpen(false)
    } catch (e) { console.warn('[SupportPersonPrompt] save failed:', e.message); setOpen(false) }
    setBusy(false)
  }

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,43,69,.7)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, fontFamily: FF }}>
      <div style={{ background: 'white', borderRadius: 14, padding: '1.5rem', maxWidth: 420, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,.25)' }}>
        <div style={{ fontWeight: 800, color: NAVY, fontSize: '1.0625rem', marginBottom: '.5rem' }}>Support person present?</div>
        <p style={{ fontSize: '.875rem', color: '#374151', lineHeight: 1.55, margin: '0 0 1rem' }}>
          Under HDC Code Right 8, patients have the right to a support person of their choice. Please confirm for this consult.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
          {[['No', false], ['Yes', true]].map(([label, val]) => (
            <button key={label} onClick={() => setPresent(val)}
              style={{ flex: 1, padding: '.5rem 1rem', border: `1.5px solid ${present === val ? TEAL : '#E2E8F0'}`, background: present === val ? '#EFF9F9' : 'white', color: present === val ? TEAL : NAVY, borderRadius: 8, fontFamily: FF, fontSize: '.875rem', fontWeight: 700, cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>
        {present && (
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Support person name / relationship (optional)"
            style={{ width: '100%', boxSizing: 'border-box', padding: '.5rem .75rem', border: '1.5px solid #E2E8F0', borderRadius: 8, fontFamily: FF, fontSize: '.875rem', marginBottom: '1rem' }} />
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => { setOpen(false); onDone?.() }} style={{ background: 'white', border: '1px solid #E2E8F0', color: '#374151', padding: '.5rem 1rem', borderRadius: 8, fontFamily: FF, fontSize: '.8125rem', fontWeight: 600, cursor: 'pointer' }}>Skip</button>
          <button onClick={save} disabled={present === null || busy}
            style={{ background: present !== null ? TEAL : '#CBD5E1', color: 'white', border: 'none', padding: '.5rem 1rem', borderRadius: 8, fontFamily: FF, fontSize: '.8125rem', fontWeight: 700, cursor: present !== null && !busy ? 'pointer' : 'not-allowed' }}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
