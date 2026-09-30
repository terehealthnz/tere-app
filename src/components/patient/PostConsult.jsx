import React, { useEffect, useState } from 'react'
import { getPatientConsult } from '../../lib/supabase'
import InsuranceReceiptUpsell from './InsuranceReceiptUpsell'
import { ACC_PATIENT_CONTRIBUTION_CENTS } from '../../lib/consultationType'

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

  function refreshConsult() {
    if (!consultationId) return
    getPatientConsult(consultationId).then(c => setConsult(c || null)).catch(() => {})
  }

  // Billing derivation. Only meaningful once the provider has finalised —
  // before that we don't know if this is ACC, employer-paid, waived, tier-
  // shifted, etc. Patrick 2026-09-29: don't front-run the provider's billing
  // decision with an estimated "Amount you paid" — patients were seeing a
  // billing block populated from the auth-time hold before the provider had
  // actually decided anything. Final billing shows here only after finalise
  // (status='complete'/'completed'), and the summary email carries the same
  // number as the source of truth.
  const billing = deriveBilling(consult)
  const isFinalised = consult && (consult.status === 'complete' || consult.status === 'completed' || consult.completed_at)
  // Employer-paid can safely show $0 immediately — the provider can't change
  // that (the payer is fixed by the intake path), so it's not front-running.
  const showBillingNow = isFinalised || billing.isEmployerPaid

  return (
    <div className="page">
      <nav className="navbar"><span className="navbar-brand">Tere</span></nav>
      <div className="container" style={{paddingTop:'2.5rem',paddingBottom:'3rem',textAlign:'center'}}>
        <div className="card">
          <div style={{fontSize:'3rem',marginBottom:'1rem'}}>✅</div>
          <h2 style={{marginBottom:'.5rem'}}>Consultation complete</h2>
          <p style={{marginBottom:'1.5rem'}}>
            {showBillingNow
              ? 'Your consultation summary and any prescriptions or referrals will be sent to you by SMS or email shortly.'
              : "Your doctor is finalising your notes now. Your consultation summary, any prescriptions or referrals, and the final billing will be sent to you by email once they're done — usually within a few minutes."}
          </p>

          {/* Billing summary — shown only after the provider has finalised
              (or immediately for employer-paid consults where the payer is
              fixed by intake). Otherwise we'd be publishing an auth-time
              estimate before the provider has decided ACC/private/waived. */}
          {!loading && consult && showBillingNow && (
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

        {/* Insurance receipt upsell — $10 for an itemised PDF. Component
            hides itself once purchased. Also gated behind finalisation:
            no bill to itemise until the provider has decided. */}
        {!loading && consult && consultationId && showBillingNow && (
          <InsuranceReceiptUpsell
            consult={consult}
            consultationId={consultationId}
            onPurchased={refreshConsult}
          />
        )}
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
    return { feeDollars: 0, paidDollars: 0, adminFeeDollars: 0, isAcc: false, isEmployerPaid: false, reasoning: null, claimNumber: null }
  }
  const isAcc = consult.is_acc === true
  // Employer-paid workers (/work/[slug] flow) never see a personal charge —
  // consultation_type='employee' + employer_paid=true → $0 to the patient.
  const isEmployerPaid = consult.consultation_type === 'employee' || consult.employer_paid === true
  // Tier-aware default; provider can override on ProviderNotes fee-tier picker.
  const feeCents = isEmployerPaid ? 0
                  : consult.consultation_type === 'international' ? 10000
                  : 6500
  const feeDollars = feeCents / 100
  const adminFeeDollars = isAcc ? ACC_PATIENT_CONTRIBUTION_CENTS / 100 : 0
  const paidDollars = isEmployerPaid ? 0
                    : isAcc ? adminFeeDollars
                    : (consult.payment_amount != null ? consult.payment_amount / 100 : feeDollars)
  let reasoning = null
  if (isEmployerPaid) {
    const employerName = consult.employer_name || 'your employer'
    reasoning = `This consultation is covered by ${employerName}. No charge to you.`
  } else if (isAcc) {
    reasoning = 'Your provider assessed this as an ACC-eligible injury. ACC covers the consultation. You have been charged a $25 administrative fee for lodging your ACC claim and looking after your records.'
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
    isEmployerPaid,
    reasoning,
    claimNumber: isAcc ? (consult.acc_claim_number || null) : null,
  }
}
