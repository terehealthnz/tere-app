// Single-review modal: shows patient + referral context, captures reviewer
// comment + decision, fires the outbound patient email (standard for normal,
// custom composer for concerning). Call button hits /api/make-call.

import React, { useState } from 'react'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-NZ', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Pacific/Auckland',
  })
}

function stdEmailPreview({ patientName, investigation, referralDate }) {
  const first = (patientName || '').split(' ')[0] || 'there'
  const modality = investigation || 'imaging'
  return `Kia ora ${first}, we've reviewed the report from your ${modality} on ${referralDate}. No acute findings. If your symptoms worsen or persist, please seek care. Ngā mihi — Tere Health.`
}

export default function ImagingReviewPanel({ review, onClose, onSubmitted }) {
  const ref     = review.referral || {}
  const consult = review.consultation || {}
  const [comment, setComment]           = useState('')
  const [decision, setDecision]         = useState(null) // 'normal' | 'concerning'
  const [customBody, setCustomBody]     = useState('')
  const [submitting, setSubmitting]     = useState(false)
  const [calling, setCalling]           = useState(false)
  const [error, setError]               = useState(null)
  const [msg, setMsg]                   = useState(null)

  const referralDate = fmtDate(ref.created_at || review.created_at)

  async function submit(chosenDecision) {
    setError(null); setMsg(null)
    if (!comment.trim()) { setError('Comment is required — this is your audit trail.'); return }
    if (chosenDecision === 'concerning' && !customBody.trim()) {
      setError('Type an email body for the patient before sending.')
      return
    }
    setSubmitting(true)
    try {
      const res = await apiFetch('/api/imaging-review', {
        method: 'POST',
        body: JSON.stringify({
          reviewId: review.id,
          decision: chosenDecision,
          comment: comment.trim(),
          customEmailBody: chosenDecision === 'concerning' ? customBody.trim() : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Submit failed')
      if (data.alreadySent) setMsg('Already reviewed — no email sent.')
      else if (data.emailSent) setMsg('Review saved. Patient email sent.')
      else setMsg(`Review saved. Email skipped (${data.emailSkipped || 'no patient email on file'}).`)
      setTimeout(() => onSubmitted?.(), 900)
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function callPatient() {
    if (!review.consultation_id) { setError('No consultation linked — cannot dial.'); return }
    setCalling(true); setError(null)
    try {
      const res = await apiFetch('/api/make-call', {
        method: 'POST',
        body: JSON.stringify({ consultationId: review.consultation_id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Call failed')
      setMsg('Calling patient…')
    } catch (e) {
      setError(e.message)
    } finally {
      setCalling(false)
    }
  }

  return (
    <div onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(13,43,69,.55)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:600, padding:'0', fontFamily:FF }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:'#F7F5F0', borderRadius:'16px 16px 0 0', width:'100%', maxWidth:640, maxHeight:'92dvh', display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ background:NAVY, color:'white', padding:'1rem 1.25rem', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:'.75rem', color:'#A7D4D8', letterSpacing:'.06em', textTransform:'uppercase', fontWeight:700 }}>Imaging review</div>
            <div style={{ fontSize:'1.125rem', fontWeight:700, marginTop:2 }}>{ref.patient_name || 'Patient'}</div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,.14)', border:'none', color:'white', borderRadius:99, width:36, height:36, cursor:'pointer', fontSize:'1.125rem' }}>✕</button>
        </div>

        {/* Content — scrollable */}
        <div style={{ flex:1, overflowY:'auto', padding:'1rem 1.25rem', minHeight:0, WebkitOverflowScrolling:'touch' }}>

          {/* Patient / referral summary card */}
          <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:'.875rem 1rem', marginBottom:'1rem' }}>
            <Row label="DOB" value={ref.patient_dob || '—'} />
            <Row label="Chief complaint" value={consult.chief_complaint || '—'} />
            <Row label="Investigation" value={[ref.investigation, ref.body_part].filter(Boolean).join(' — ') || '—'} />
            <Row label="Indication" value={ref.clinical_indication || ref.history || '—'} />
            <Row label="Urgency" value={ref.urgency || 'Routine'} />
            <Row label="Facility" value={ref.facility_name || '—'} />
            <Row label="Ordered by" value={ref.drafted_by_name || ref.provider_name || '—'} />
            <Row label="Referral date" value={referralDate} last />
          </div>

          {/* Comment (mandatory) */}
          <label style={{ display:'block', fontSize:'.75rem', fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:6 }}>
            Reviewer comment <span style={{ color:'#DC2626' }}>*</span>
          </label>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Summarise the radiology report and your assessment. This is the permanent audit trail."
            rows={5}
            style={{ width:'100%', boxSizing:'border-box', fontFamily:FF, fontSize:'.9375rem', padding:'.75rem', border:'1px solid #E2E8F0', borderRadius:10, resize:'vertical', minHeight:96 }}
          />

          {/* Concerning-only: custom email composer */}
          {decision === 'concerning' && (
            <>
              <label style={{ display:'block', fontSize:'.75rem', fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.04em', margin:'1rem 0 6px' }}>
                Patient email body <span style={{ color:'#DC2626' }}>*</span>
              </label>
              <textarea
                value={customBody}
                onChange={e => setCustomBody(e.target.value)}
                placeholder={`Kia ora ${(ref.patient_name || '').split(' ')[0] || 'there'}, your ${ref.investigation || 'imaging'} report showed…`}
                rows={7}
                style={{ width:'100%', boxSizing:'border-box', fontFamily:FF, fontSize:'.9375rem', padding:'.75rem', border:'1px solid #E2E8F0', borderRadius:10, resize:'vertical', minHeight:130 }}
              />
              <div style={{ display:'flex', gap:'.5rem', marginTop:'.5rem', flexWrap:'wrap' }}>
                <button onClick={callPatient} disabled={calling}
                  style={{ background:'#DC2626', color:'white', border:'none', borderRadius:99, padding:'.5rem .875rem', fontWeight:700, fontSize:'.8125rem', cursor:calling?'wait':'pointer', fontFamily:FF }}>
                  📞 {calling ? 'Calling…' : 'Call patient'}
                </button>
              </div>
            </>
          )}

          {/* Standard-email preview */}
          {decision === 'normal' && (
            <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10, padding:'.75rem .875rem', marginTop:'1rem', fontSize:'.8125rem', color:'#166534', lineHeight:1.5 }}>
              <div style={{ fontWeight:700, marginBottom:4 }}>Email to patient (preview)</div>
              {stdEmailPreview({ patientName:ref.patient_name, investigation:ref.investigation, referralDate })}
            </div>
          )}

          {error && (
            <div style={{ background:'#FEE2E2', border:'1px solid #FCA5A5', color:'#991B1B', padding:'.5rem .75rem', borderRadius:8, fontSize:'.8125rem', marginTop:'.75rem' }}>{error}</div>
          )}
          {msg && (
            <div style={{ background:'#ECFDF5', border:'1px solid #A7F3D0', color:'#065F46', padding:'.5rem .75rem', borderRadius:8, fontSize:'.8125rem', marginTop:'.75rem' }}>{msg}</div>
          )}
        </div>

        {/* Footer — decision buttons */}
        <div style={{ borderTop:'1px solid #E2E8F0', padding:'.875rem 1.25rem', background:'white', display:'flex', gap:'.5rem', flexWrap:'wrap', paddingBottom:'calc(.875rem + env(safe-area-inset-bottom))' }}>
          <button
            onClick={() => { setDecision('normal'); submit('normal') }}
            disabled={submitting}
            style={{ flex:'1 1 200px', background:submitting?'#9CA3AF':TEAL, color:'white', border:'none', borderRadius:12, padding:'.875rem', fontWeight:700, fontSize:'.9375rem', cursor:submitting?'wait':'pointer', fontFamily:FF, minHeight:52 }}>
            Normal — no acute findings
          </button>
          <button
            onClick={() => {
              if (decision !== 'concerning') { setDecision('concerning'); return }
              submit('concerning')
            }}
            disabled={submitting}
            style={{ flex:'1 1 200px', background:decision==='concerning' ? '#B91C1C' : 'white', color:decision==='concerning' ? 'white' : '#B91C1C', border:`2px solid #B91C1C`, borderRadius:12, padding:'.875rem', fontWeight:700, fontSize:'.9375rem', cursor:submitting?'wait':'pointer', fontFamily:FF, minHeight:52 }}>
            {decision === 'concerning' ? 'Send concerning-finding email →' : 'Concerning finding'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, last }) {
  return (
    <div style={{ display:'flex', gap:'.75rem', padding:'.375rem 0', borderBottom: last ? 'none' : '1px solid #F1F5F9', fontSize:'.8125rem' }}>
      <div style={{ width:110, color:'#6B7280', fontWeight:600, flexShrink:0 }}>{label}</div>
      <div style={{ flex:1, color:NAVY, wordBreak:'break-word' }}>{value}</div>
    </div>
  )
}
