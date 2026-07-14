import React, { useEffect, useState } from 'react'
import { getPatientConsult } from '../../lib/supabase'

export default function PostConsult() {
  const [consult, setConsult] = useState(null)
  const [loading, setLoading] = useState(true)
  const consultationId = sessionStorage.getItem('consultationId')

  useEffect(() => {
    if (!consultationId) { setLoading(false); return }
    let cancelled = false
    getPatientConsult(consultationId)
      .then(c => { if (!cancelled) { setConsult(c || null); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [consultationId])

  // Billing derivation. Handles both the current state (payment_amount set on
  // the row after finalise) and the transitional case where finalise hasn't
  // completed yet — we fall back to the auth amount + is_acc/acc_eligible so
  // the patient never sees a blank billing section.
  const billing = deriveBilling(consult)

  return (
    <div className="page">
      <nav className="navbar"><span className="navbar-brand">Tere</span></nav>
      <div className="container" style={{paddingTop:'2.5rem',paddingBottom:'3rem',textAlign:'center'}}>
        <div className="card">
          <div style={{fontSize:'3rem',marginBottom:'1rem'}}>✅</div>
          <h2 style={{marginBottom:'.5rem'}}>Consultation complete</h2>
          <p style={{marginBottom:'1.5rem'}}>
            Your consultation summary and any prescriptions or referrals will be
            sent to you by SMS or email shortly.
          </p>

          {/* Billing summary — always shown once the consult record loads.
              For ACC-covered consults the patient sees $0 explicitly with the
              claim reference; for private consults they see the $60 with the
              card last-4 if available. Silent charges break HDC Right 6. */}
          {!loading && consult && (
            <div style={{
              background: billing.isAcc ? '#F0FDF4' : 'var(--bg)',
              border: `1px solid ${billing.isAcc ? '#BBF7D0' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)', padding: '1rem 1.125rem',
              textAlign: 'left', marginBottom: '1.25rem',
            }}>
              <div style={{ fontSize:'.75rem', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:'.5rem' }}>Billing</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:'.375rem .75rem', fontSize:'.9375rem', color:'var(--text)' }}>
                <span>Consultation fee</span>
                <span style={{ fontWeight:600 }}>${billing.feeDollars.toFixed(2)}</span>
                {billing.isAcc && (
                  <>
                    <span style={{ color:'#065F46' }}>Billed to ACC</span>
                    <span style={{ fontWeight:600, color:'#065F46' }}>−${billing.feeDollars.toFixed(2)}</span>
                    <span>Administrative fee</span>
                    <span style={{ fontWeight:600 }}>+${billing.adminFeeDollars.toFixed(2)}</span>
                  </>
                )}
                <span style={{ borderTop:'1px solid #E2E8F0', paddingTop:'.5rem', fontWeight:700 }}>Amount you paid</span>
                <span style={{ borderTop:'1px solid #E2E8F0', paddingTop:'.5rem', fontWeight:800, color: billing.paidDollars === 0 ? '#059669' : 'var(--text)' }}>
                  ${billing.paidDollars.toFixed(2)}
                </span>
              </div>
              {billing.reasoning && (
                <p style={{ fontSize:'.8125rem', color:'#374151', lineHeight:1.55, marginTop:'.75rem', marginBottom:0 }}>
                  {billing.reasoning}
                </p>
              )}
              {billing.claimNumber && (
                <p style={{ fontSize:'.75rem', color:'var(--muted)', marginTop:'.5rem', marginBottom:0 }}>
                  ACC claim: <code style={{ background:'white', padding:'1px 6px', borderRadius:4, fontSize:'.75rem' }}>{billing.claimNumber}</code>
                </p>
              )}
            </div>
          )}

          <div style={{background:'var(--bg)',borderRadius:'var(--radius-sm)',padding:'1rem',textAlign:'left',marginBottom:'1.25rem'}}>
            <p style={{fontSize:'.875rem',lineHeight:1.7}}>
              <strong style={{display:'block',marginBottom:'.25rem',color:'var(--text)'}}>What happens next</strong>
              Your consultation notes have been sent to your doctor for final review. If a prescription was issued,
              your pharmacy will receive it electronically. If an X-ray or scan was ordered, you will receive
              the referral details by SMS.
            </p>
          </div>
          <a href="/triage" className="btn btn-primary btn-full">
            Start a new consultation
          </a>
        </div>
        <div style={{marginTop:'1.25rem',background:'#F0F9FA',border:'1px solid #D4EEF0',borderRadius:12,padding:'1rem 1.25rem',textAlign:'left'}}>
          <div style={{fontSize:'.9375rem',fontWeight:700,color:'#0D2B45',marginBottom:'.25rem'}}>Not sure about your charge? Need something else?</div>
          <p style={{fontSize:'.8125rem',color:'#374151',lineHeight:1.6,margin:'0 0 .75rem'}}>
            Prescription not received? Question about your bill? We usually reply within one business day — no charge.
          </p>
          <a href="/contact?source=post_consult" style={{display:'inline-block',background:'#0B6E76',color:'white',textDecoration:'none',padding:'8px 16px',borderRadius:99,fontSize:'.8125rem',fontWeight:700}}>
            Message support →
          </a>
        </div>
        <p style={{fontSize:'.8125rem',color:'var(--muted)',marginTop:'1.25rem'}}>
          Urgent concern? Call <strong>111</strong>. Non-emergency: return to Tere anytime.
        </p>
      </div>
    </div>
  )
}

// Derive the patient-visible billing summary from the consult row. Reasoning
// text is a canonical patient-friendly line — we do NOT surface AI reasoning
// or clinical notes verbatim (too technical, and could reveal information
// the provider hasn't yet shared). If the provider changes their mind post-
// consult, this page will reflect the new state on next load.
function deriveBilling(consult) {
  if (!consult) {
    return { feeDollars: 0, paidDollars: 0, adminFeeDollars: 0, isAcc: false, reasoning: null, claimNumber: null }
  }
  const feeCents = 6000
  const isAcc = consult.is_acc === true
  const feeDollars = feeCents / 100
  const adminFeeDollars = isAcc ? 20 : 0
  const paidDollars = isAcc
    ? adminFeeDollars
    : (consult.payment_amount != null ? consult.payment_amount / 100 : feeDollars)
  let reasoning = null
  if (isAcc) {
    reasoning = 'Your provider assessed this as an ACC-eligible injury. ACC covers the cost of your consultation directly. You have been charged a $20 administrative fee for platform access, prescription processing, and after-hours availability.'
  } else if (consult.acc_eligible === 'yes') {
    reasoning = 'Your provider assessed the presentation as not covered by ACC. The full consultation fee applies. If you think this should be an ACC claim, message support.'
  } else {
    reasoning = 'Standard consultation fee — thank you for booking with Tere Health.'
  }
  return {
    feeDollars,
    paidDollars,
    adminFeeDollars,
    isAcc,
    reasoning,
    claimNumber: isAcc ? (consult.acc_claim_number || null) : null,
  }
}
