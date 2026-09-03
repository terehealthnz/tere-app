// Interpreter source recording (task #436). Shown on ClinicianPatient when
// consult.interpreter_requested=true. Provider records HOW interpretation
// was delivered. Selecting a family-member source triggers a red HDC-risk
// banner — using a child or relative is a well-known HDC-criticised
// failure mode.

import React, { useState } from 'react'
import { updateConsultation } from '../../lib/supabase'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const RED  = '#DC2626'
const AMBER = '#D97706'
const GREEN = '#059669'
const FF   = 'Plus Jakarta Sans, sans-serif'

const SOURCE_OPTIONS = [
  { v: 'certified_service',            l: 'Certified interpreter service (Language Line / Ezispeak)', tone: 'good' },
  { v: 'certified_bilingual_clinician', l: 'Certified bilingual clinician (self or peer)',            tone: 'good' },
  { v: 'family_member_adult',           l: 'Family member (adult) — HDC risk',                        tone: 'risky' },
  { v: 'family_member_child',           l: 'Family member (child) — strongly discouraged',             tone: 'high_risk' },
  { v: 'friend',                        l: 'Friend / bystander — risky',                              tone: 'risky' },
  { v: 'declined',                      l: 'Patient declined despite offer',                          tone: 'neutral' },
  { v: 'not_needed',                    l: 'Reassessed — interpreter not needed',                     tone: 'neutral' },
]

const card = { background:'white', borderRadius:14, padding:'1.25rem', marginBottom:12, border:'1.5px solid #E2E8F0', fontFamily: FF }
const inp  = { padding: '.5rem .625rem', border: '1px solid #E2E8F0', borderRadius: 6, fontFamily: FF, fontSize: '.8125rem', width: '100%', boxSizing: 'border-box' }
const lbl  = { fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }

export default function InterpreterSourcePanel({ consult, onUpdated }) {
  const requested = !!consult?.interpreter_requested
  const [source, setSource] = useState(consult?.interpreter_source || '')
  const [notes,  setNotes]  = useState(consult?.interpreter_source_notes || '')
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState(null)

  if (!requested) return null   // only show when patient ticked "I need an interpreter"

  const alreadyRecorded = !!consult?.interpreter_source_recorded_at
  const selected = SOURCE_OPTIONS.find(o => o.v === source)
  const isRisky = selected?.tone === 'risky' || selected?.tone === 'high_risk'
  const isHighRisk = selected?.tone === 'high_risk'

  async function save() {
    if (!source) { setErr('Pick an interpreter source'); return }
    if (isRisky && notes.trim().length < 20) { setErr('Notes required (≥ 20 chars) when a non-certified source is used'); return }
    setBusy(true); setErr(null)
    try {
      const providerId = sessionStorage.getItem('providerId') || null
      await updateConsultation(consult.id, {
        interpreter_source:             source,
        interpreter_source_notes:       notes.trim() || null,
        interpreter_source_recorded_at: new Date().toISOString(),
        interpreter_source_recorded_by: providerId,
      })
      onUpdated?.()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  if (alreadyRecorded) {
    const opt = SOURCE_OPTIONS.find(s => s.v === consult.interpreter_source)
    const toneColour = opt?.tone === 'good' ? GREEN : opt?.tone === 'neutral' ? '#374151' : opt?.tone === 'risky' ? AMBER : RED
    return (
      <div style={{ ...card, background: opt?.tone === 'good' ? '#F0FDF4' : opt?.tone === 'high_risk' ? '#FEF2F2' : '#FFFBEB' }}>
        <div style={{ fontSize:'.6875rem', color:'#6B7280', fontWeight:700, textTransform:'uppercase' }}>Interpreter</div>
        <div style={{ fontWeight:700, color: toneColour, fontSize:'.9375rem' }}>
          {consult.interpreter_language ? `${consult.interpreter_language} · ` : ''}{opt?.l || consult.interpreter_source}
        </div>
        {consult.interpreter_source_notes && (
          <div style={{ fontSize:'.75rem', color:'#6B7280', marginTop:4 }}>{consult.interpreter_source_notes}</div>
        )}
      </div>
    )
  }

  return (
    <div style={{ ...card, borderColor: '#E2E8F0' }}>
      <div style={{ fontSize:'.6875rem', color:'#9CA3AF', fontWeight:700, textTransform:'uppercase', marginBottom:6 }}>
        Interpreter source (patient requested{consult?.interpreter_language ? ` — ${consult.interpreter_language}` : ''}) <span style={{ color:'#DC2626' }}>*</span>
      </div>
      {SOURCE_OPTIONS.map(o => (
        <label key={o.v} style={{ display:'flex', gap:8, alignItems:'flex-start', padding:'.375rem 0', cursor:'pointer', fontSize:'.8125rem',
          color: o.tone === 'good' ? '#065F46' : o.tone === 'high_risk' ? '#991B1B' : o.tone === 'risky' ? '#78350F' : '#374151' }}>
          <input type="radio" name="interp-src" value={o.v} checked={source === o.v} onChange={() => setSource(o.v)} style={{ marginTop:3 }} />
          {o.l}
        </label>
      ))}

      {isRisky && (
        <div style={{ background: isHighRisk ? '#FEE2E2' : '#FEF3C7', border: `1px solid ${isHighRisk ? '#FECACA' : '#FDE68A'}`, color: isHighRisk ? '#991B1B' : '#78350F', padding:'.625rem .75rem', borderRadius:8, fontSize:'.8125rem', marginTop:8, lineHeight:1.5 }}>
          {isHighRisk ? (
            <>
              <strong>HDC-CRITICISED PRACTICE.</strong> Using a child to interpret an acute consult is repeatedly named in HDC decisions as unsafe + inappropriate. Please pause and try to arrange a certified interpreter (Language Line 0800 733 336 / Ezispeak 0800 400 100). If you must proceed, document why in the notes below.
            </>
          ) : (
            <>
              <strong>HDC risk.</strong> Family members / friends may withhold information, sanitise, or coerce. Prefer a certified interpreter service (Language Line 0800 733 336 / Ezispeak 0800 400 100). If you proceed, document the clinical justification in the notes below.
            </>
          )}
        </div>
      )}

      {(isRisky || source === 'declined') && (
        <>
          <label style={{ ...lbl, marginTop:8 }}>Notes {isRisky && <span style={{ color:'#DC2626' }}>(≥ 20 chars)</span>}</label>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2}
            placeholder={isRisky ? 'Why was a certified interpreter not used? What steps did you take?' : 'Optional context'}
            style={{ ...inp, minHeight:60 }} />
        </>
      )}

      {err && <div style={{ background:'#FEE2E2', color:'#991B1B', padding:'.5rem .75rem', borderRadius:6, fontSize:'.75rem', marginTop:8 }}>{err}</div>}

      <button onClick={save} disabled={busy || !source} style={{ marginTop:10, padding:'.5rem 1rem', background: source ? TEAL : '#CBD5E1', color:'white', border:'none', borderRadius:8, fontFamily:FF, fontSize:'.8125rem', fontWeight:700, cursor: source ? 'pointer' : 'not-allowed' }}>
        {busy ? 'Recording…' : 'Record interpreter source'}
      </button>
    </div>
  )
}
