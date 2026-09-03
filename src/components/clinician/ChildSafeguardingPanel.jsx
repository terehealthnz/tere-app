// Child / dependent consent + safeguarding pathway (task #434).
// Renders inline on ClinicianPatient. Two sections:
//   (A) Consenting adult (required when patient age < 18) — captures who
//       consented on the child's behalf + relationship + guardianship
//       verification, per HDC Right 7.
//   (B) Safeguarding concern (any age) — provider raises + describes any
//       abuse / neglect / unsafe situation observed or disclosed. Triggers
//       admin routing + the Oranga Tamariki mandatory-reporting runbook.

import React, { useState } from 'react'
import { updateConsultation } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const RED  = '#DC2626'
const AMBER = '#D97706'
const GREEN = '#059669'
const FF   = 'Plus Jakarta Sans, sans-serif'

const RELATIONSHIP_OPTIONS = [
  { v: 'parent',                l: 'Parent' },
  { v: 'legal_guardian',        l: 'Legal guardian' },
  { v: 'grandparent_carer',     l: 'Grandparent (primary carer)' },
  { v: 'foster_carer_ot',       l: 'Foster carer (Oranga Tamariki)' },
  { v: 'whanau_carer',          l: 'Whānau carer' },
  { v: 'oranga_tamariki_worker', l: 'Oranga Tamariki social worker' },
  { v: 'other_authorised',      l: 'Other (documented on file)' },
]

const CONCERN_TYPE_OPTIONS = [
  { v: 'suspected_physical_abuse',       l: 'Suspected physical abuse' },
  { v: 'suspected_sexual_abuse',         l: 'Suspected sexual abuse' },
  { v: 'suspected_neglect',              l: 'Suspected neglect' },
  { v: 'suspected_emotional_abuse',      l: 'Suspected emotional abuse' },
  { v: 'family_violence_disclosed',      l: 'Family violence disclosed' },
  { v: 'unsafe_home_environment',        l: 'Unsafe home environment' },
  { v: 'suicide_self_harm_dependent',    l: 'Suicide / self-harm risk (dependent)' },
  { v: 'other',                          l: 'Other (describe in notes)' },
]

const card = { background:'white', borderRadius:14, padding:'1.25rem', marginBottom:12, border:'1.5px solid #E2E8F0', fontFamily: FF }
const inp  = { padding: '.5rem .625rem', border: '1px solid #E2E8F0', borderRadius: 6, fontFamily: FF, fontSize: '.8125rem', width: '100%', boxSizing: 'border-box' }
const lbl  = { fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }

function ageFromDob(dobIso) {
  if (!dobIso) return null
  const d = new Date(dobIso); if (isNaN(d)) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age
}

export default function ChildSafeguardingPanel({ consult, onUpdated }) {
  const patientAge = ageFromDob(consult?.patient_dob)
  const isMinor    = patientAge != null && patientAge < 18

  const [adultName,        setAdultName]         = useState(consult?.consenting_adult_name || '')
  const [adultRelationship,setAdultRelationship] = useState(consult?.consenting_adult_relationship || '')
  const [adultPhone,       setAdultPhone]        = useState(consult?.consenting_adult_phone || '')
  const [safeguardOpen,    setSafeguardOpen]     = useState(false)
  const [concernType,      setConcernType]       = useState(consult?.safeguarding_concern_type || '')
  const [concernNotes,     setConcernNotes]      = useState(consult?.safeguarding_concern_notes || '')
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState(null)

  const consentComplete = !!(adultName.trim() && adultRelationship)
  const alreadyVerified = !!consult?.guardianship_verified_at

  async function saveConsent() {
    if (!consentComplete) { setErr('Name + relationship required'); return }
    setBusy(true); setErr(null)
    try {
      const providerId = sessionStorage.getItem('providerId') || null
      await updateConsultation(consult.id, {
        consenting_adult_name:         adultName.trim(),
        consenting_adult_relationship: adultRelationship,
        consenting_adult_phone:        adultPhone.trim() || null,
        guardianship_verified_at:      new Date().toISOString(),
        guardianship_verified_by:      providerId,
      })
      onUpdated?.()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  async function raiseSafeguarding() {
    if (!concernType || concernNotes.trim().length < 20) { setErr('Type + notes ≥ 20 chars required'); return }
    setBusy(true); setErr(null)
    try {
      const providerId   = sessionStorage.getItem('providerId') || null
      const providerName = sessionStorage.getItem('providerDisplayName') || ''
      await updateConsultation(consult.id, {
        safeguarding_concern_flagged:    true,
        safeguarding_concern_at:         new Date().toISOString(),
        safeguarding_concern_type:       concernType,
        safeguarding_concern_notes:      concernNotes.trim(),
        safeguarding_concern_flagged_by: providerId,
      })
      // Fire an admin notification so this doesn't sit unseen.
      try {
        await apiFetch('/api/audit-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action:          'safeguarding_concern_raised',
            consultation_id: consult.id,
            resource_type:   'consultation',
            resource_id:     consult.id,
            metadata:        { concern_type: concernType, patient_age: patientAge, provider_name: providerName },
          }),
        })
      } catch {}
      setSafeguardOpen(false)
      onUpdated?.()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  const alreadyConcern = !!consult?.safeguarding_concern_flagged

  return (
    <>
      {/* (A) Consenting adult — only shown when patient is a minor */}
      {isMinor && !alreadyVerified && (
        <div style={{ ...card, borderColor: consentComplete ? '#BBF7D0' : '#FDE68A' }}>
          <div style={{ fontSize:'.6875rem', color:'#9CA3AF', fontWeight:700, textTransform:'uppercase', marginBottom:6 }}>
            Consenting adult (patient is {patientAge}y — HDC Right 7) <span style={{ color:'#DC2626' }}>*</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr 1fr', gap:8 }}>
            <div>
              <label style={lbl}>Full name</label>
              <input value={adultName} onChange={e=>setAdultName(e.target.value)} style={inp} placeholder="e.g. Jane Smith" />
            </div>
            <div>
              <label style={lbl}>Relationship</label>
              <select value={adultRelationship} onChange={e=>setAdultRelationship(e.target.value)} style={inp}>
                <option value="">Select…</option>
                {RELATIONSHIP_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Contact phone</label>
              <input value={adultPhone} onChange={e=>setAdultPhone(e.target.value)} style={inp} placeholder="Optional" />
            </div>
          </div>
          {err && <div style={{ background:'#FEE2E2', color:'#991B1B', padding:'.5rem .75rem', borderRadius:6, fontSize:'.75rem', marginTop:8 }}>{err}</div>}
          <button onClick={saveConsent} disabled={busy || !consentComplete}
            style={{ marginTop:10, padding:'.5rem 1rem', background: consentComplete ? TEAL : '#CBD5E1', color:'white', border:'none', borderRadius:8, fontFamily:FF, fontSize:'.8125rem', fontWeight:700, cursor: consentComplete ? 'pointer' : 'not-allowed' }}>
            {busy ? 'Recording…' : 'Confirm consenting adult'}
          </button>
          <div style={{ fontSize:'.6875rem', color:'#9CA3AF', marginTop:8, lineHeight:1.5 }}>
            Recorded per HDC Right 7 (informed consent) + capacity-to-consent framework for minors.
            If in doubt about legal guardianship, do not proceed — refer to on-call supervisor.
          </div>
        </div>
      )}

      {isMinor && alreadyVerified && (
        <div style={{ ...card, background:'#F0FDF4', borderColor:'#BBF7D0' }}>
          <div style={{ fontSize:'.6875rem', color:'#6B7280', fontWeight:700, textTransform:'uppercase' }}>Consenting adult</div>
          <div style={{ fontWeight:700, color:GREEN, fontSize:'.9375rem' }}>
            ✓ {consult.consenting_adult_name} · {RELATIONSHIP_OPTIONS.find(r=>r.v===consult.consenting_adult_relationship)?.l || consult.consenting_adult_relationship}
            {consult.consenting_adult_phone && ` · ${consult.consenting_adult_phone}`}
          </div>
          <div style={{ fontSize:'.6875rem', color:'#6B7280', marginTop:2 }}>
            Verified {new Date(consult.guardianship_verified_at).toLocaleString('en-NZ', { timeZone:'Pacific/Auckland' })}
          </div>
        </div>
      )}

      {/* (B) Safeguarding concern flag — any age patient */}
      {!alreadyConcern && !safeguardOpen && (
        <button onClick={() => setSafeguardOpen(true)}
          style={{ display:'flex', alignItems:'center', gap:6, background:'white', border:`1px dashed ${RED}`, color:RED, padding:'.375rem .75rem', borderRadius:8, fontFamily:FF, fontSize:'.75rem', fontWeight:700, cursor:'pointer', marginBottom:12 }}>
          ⚠ Raise safeguarding concern
        </button>
      )}

      {safeguardOpen && !alreadyConcern && (
        <div style={{ ...card, background:'#FEF2F2', borderColor:'#FECACA' }}>
          <div style={{ fontSize:'.6875rem', color:RED, fontWeight:700, textTransform:'uppercase', marginBottom:6 }}>
            🚨 Raise safeguarding concern
          </div>
          <div style={{ fontSize:'.75rem', color:'#78350F', marginBottom:10, lineHeight:1.5 }}>
            Fires an admin ticket AND triggers the Oranga Tamariki mandatory-reporting runbook.
            <br/><em>Review: docs/regulatory/child-safeguarding-oranga-tamariki-runbook.md</em>
          </div>
          <label style={lbl}>Concern type</label>
          <select value={concernType} onChange={e=>setConcernType(e.target.value)} style={inp}>
            <option value="">Select…</option>
            {CONCERN_TYPE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <label style={{ ...lbl, marginTop:8 }}>Notes <span style={{ color:'#DC2626' }}>(min 20 chars — factual, non-judgemental)</span></label>
          <textarea value={concernNotes} onChange={e=>setConcernNotes(e.target.value)} rows={4}
            placeholder="What was disclosed or observed. Direct quotes preferred over interpretation. Include time + who was present."
            style={{ ...inp, minHeight:80, resize:'vertical' }} />
          {err && <div style={{ background:'#FEE2E2', color:'#991B1B', padding:'.5rem .75rem', borderRadius:6, fontSize:'.75rem', marginTop:8 }}>{err}</div>}
          <div style={{ display:'flex', gap:8, marginTop:10 }}>
            <button onClick={() => { setSafeguardOpen(false); setConcernType(''); setConcernNotes('') }} style={{ padding:'.5rem 1rem', background:'white', border:'1px solid #E2E8F0', color:'#374151', borderRadius:8, fontFamily:FF, fontSize:'.8125rem', fontWeight:600, cursor:'pointer' }}>
              Cancel
            </button>
            <button onClick={raiseSafeguarding} disabled={busy || !concernType || concernNotes.trim().length < 20}
              style={{ padding:'.5rem 1rem', background: (concernType && concernNotes.trim().length >= 20) ? RED : '#CBD5E1', color:'white', border:'none', borderRadius:8, fontFamily:FF, fontSize:'.8125rem', fontWeight:700, cursor: (concernType && concernNotes.trim().length >= 20) ? 'pointer' : 'not-allowed' }}>
              {busy ? 'Raising…' : '🚨 Raise concern + notify admin'}
            </button>
          </div>
        </div>
      )}

      {alreadyConcern && (
        <div style={{ ...card, background:'#FEF2F2', borderColor:'#FECACA' }}>
          <div style={{ fontSize:'.6875rem', color:RED, fontWeight:700, textTransform:'uppercase', marginBottom:4 }}>
            🚨 Safeguarding concern raised
          </div>
          <div style={{ fontSize:'.8125rem', color:'#78350F' }}>
            <strong>{CONCERN_TYPE_OPTIONS.find(c=>c.v===consult.safeguarding_concern_type)?.l || consult.safeguarding_concern_type}</strong>
            <div style={{ marginTop:6, whiteSpace:'pre-wrap', background:'white', padding:'.5rem .625rem', borderRadius:6, border:'1px solid #FECACA' }}>{consult.safeguarding_concern_notes}</div>
            <div style={{ marginTop:6, fontSize:'.6875rem', color:'#6B7280' }}>
              Raised {new Date(consult.safeguarding_concern_at).toLocaleString('en-NZ', { timeZone:'Pacific/Auckland' })} · Runbook: docs/regulatory/child-safeguarding-oranga-tamariki-runbook.md
            </div>
          </div>
        </div>
      )}
    </>
  )
}
