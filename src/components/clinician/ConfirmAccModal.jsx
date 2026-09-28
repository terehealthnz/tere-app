import React, { useState } from 'react'
import { apiFetch } from '../../lib/api'

// Compact confirm-only ACC popup. Used when AI has already extracted
// mechanism + body part + ICD-10 into the consult row (visible in the
// Diagnosis card). Provider only sees a read-only summary + editable
// injury date + consent tick — no re-entering fields. The full-form
// ConvertToAccModal is still used for the fallback path where AI did
// not detect ACC and the provider is manually opening a claim.
export default function ConfirmAccModal({ consult, aiDx, onClose, onSuccess }) {
  const today = new Date().toISOString().slice(0, 10)
  const mechanism   = (consult?.acc_injury_details || '').trim()
  const bodyPart    = (consult?.acc_body_part || '').trim()
  const employer    = (consult?.acc_employer || '').trim()
  const accCode     = (aiDx?.accIcd10Code || consult?.acc_icd10_code || '').trim()
  const accDesc     = (aiDx?.accIcd10Description || consult?.acc_icd10_description || '').trim()
  const [injuryDate, setInjuryDate]   = useState(consult?.acc_injury_date || today)
  const [consentObtained, setConsentObtained] = useState(false)
  const [converting, setConverting]   = useState(false)
  const [done, setDone]               = useState(false)
  const [paymentNote, setPaymentNote] = useState('')
  const [err, setErr]                 = useState('')

  const canSubmit = !!accCode && !!injuryDate && consentObtained && !converting

  async function handleConfirm() {
    if (!canSubmit) return
    setConverting(true); setErr('')
    try {
      const res = await apiFetch('/api/convert-to-acc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultationId: consult.id,
          injuryDate,
          mechanism,
          bodyPart,
          workRelated: employer ? 'yes' : 'no',
          employer,
          accIcd10Code: accCode,
          accIcd10Description: accDesc,
          consentObtained,
          providerId: sessionStorage.getItem('providerId') || '',
          providerName: sessionStorage.getItem('providerDisplayName') || '',
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setDone(true)
        setPaymentNote(data.paymentNote || '')
        onSuccess?.()
      } else {
        setErr(data.error || 'Conversion failed')
      }
    } catch (e) {
      setErr(e.message)
    }
    setConverting(false)
  }

  const row = { display:'flex', justifyContent:'space-between', gap:12, padding:'8px 0', borderBottom:'1px solid #F3F4F6', fontSize:'.8125rem' }
  const rowLbl = { color:'#6B7280', fontWeight:600, flexShrink:0 }
  const rowVal = { color:'#0D2B45', textAlign:'right', wordBreak:'break-word' }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
      <div style={{ background:'white', borderRadius:16, width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 50px rgba(0,0,0,.25)', fontFamily:'Plus Jakarta Sans, sans-serif' }}>
        <div style={{ padding:'1rem 1.25rem', borderBottom:'1px solid #E2E8F0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <h3 style={{ margin:0, fontSize:'.9375rem', fontWeight:700, color:'#0D2B45' }}>Confirm ACC claim</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:'1.25rem', color:'#9CA3AF' }}>✕</button>
        </div>

        <div style={{ padding:'1rem 1.25rem' }}>
          {done ? (
            <>
              <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10, padding:'.9rem 1rem', marginBottom:'.9rem' }}>
                <div style={{ fontWeight:700, color:'#059669', fontSize:'.9rem', marginBottom:4 }}>✓ ACC claim confirmed</div>
                <div style={{ fontSize:'.75rem', color:'#065F46', lineHeight:1.5 }}>
                  Billing updated · patient notified · flagged for admin lodgement with ProviderHub.
                </div>
              </div>
              {paymentNote && (
                <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, padding:'.6rem .8rem', marginBottom:'.9rem', fontSize:'.75rem', color:'#92400E' }}>
                  {paymentNote}
                </div>
              )}
              <button onClick={onClose} style={{ width:'100%', padding:10, background:'#0B6E76', color:'white', border:'none', borderRadius:8, fontFamily:'Plus Jakarta Sans, sans-serif', fontWeight:700, cursor:'pointer' }}>
                Close
              </button>
            </>
          ) : (
            <>
              {/* Read-only summary of what will be lodged */}
              <div style={{ border:'1px solid #E2E8F0', borderRadius:10, padding:'.4rem .9rem', marginBottom:'.9rem' }}>
                <div style={row}>
                  <span style={rowLbl}>ICD-10</span>
                  <span style={rowVal}><b style={{ fontFamily:'monospace' }}>{accCode || '—'}</b> {accDesc && <> · {accDesc}</>}</span>
                </div>
                {bodyPart && (
                  <div style={row}>
                    <span style={rowLbl}>Body part</span>
                    <span style={rowVal}>{bodyPart}</span>
                  </div>
                )}
                {mechanism && (
                  <div style={row}>
                    <span style={rowLbl}>Mechanism</span>
                    <span style={rowVal}>{mechanism}</span>
                  </div>
                )}
                {employer && (
                  <div style={row}>
                    <span style={rowLbl}>Employer</span>
                    <span style={rowVal}>{employer}</span>
                  </div>
                )}
                <div style={{ ...row, borderBottom:'none' }}>
                  <span style={rowLbl}>Injury date</span>
                  <input type="date" value={injuryDate} onChange={e => setInjuryDate(e.target.value)}
                    style={{ border:'1px solid #E2E8F0', borderRadius:6, padding:'2px 6px', fontFamily:'Plus Jakarta Sans, sans-serif', fontSize:'.8125rem', color:'#0D2B45' }} />
                </div>
              </div>

              <label style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'10px 12px', border:`1.5px solid ${consentObtained ? '#0B6E76' : '#E2E8F0'}`, borderRadius:8, background:consentObtained ? '#F0FDFA' : 'white', cursor:'pointer', marginBottom:'.9rem' }}>
                <input type="checkbox" checked={consentObtained} onChange={e => setConsentObtained(e.target.checked)} style={{ marginTop:2 }} />
                <div>
                  <div style={{ fontSize:'.8125rem', fontWeight:700, color:consentObtained ? '#0B6E76' : '#0D2B45' }}>
                    Patient consent obtained <span style={{ color:'#DC2626' }}>*</span>
                  </div>
                  <div style={{ fontSize:'.6875rem', color:'#6B7280', marginTop:2, lineHeight:1.4 }}>
                    ACC45 three-part consent (billing · info-sharing · treatment). Recorded with provider ID + timestamp.
                  </div>
                </div>
              </label>

              {err && (
                <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'.5rem .75rem', marginBottom:'.75rem', fontSize:'.75rem', color:'#991B1B' }}>
                  {err}
                </div>
              )}

              <div style={{ display:'flex', gap:8 }}>
                <button onClick={onClose}
                  style={{ flex:1, padding:10, border:'1px solid #E2E8F0', borderRadius:8, background:'white', cursor:'pointer', fontFamily:'Plus Jakarta Sans, sans-serif', fontWeight:600, color:'#6B7280' }}>
                  Cancel
                </button>
                <button onClick={handleConfirm} disabled={!canSubmit}
                  style={{ flex:2, padding:10, border:'none', borderRadius:8, background:!canSubmit ? '#E2E8F0' : '#059669', color:!canSubmit ? '#9CA3AF' : 'white', cursor:!canSubmit ? 'default' : 'pointer', fontFamily:'Plus Jakarta Sans, sans-serif', fontWeight:700 }}>
                  {converting ? 'Confirming…' : '✓ Confirm & lodge'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
