import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { db } from '../../lib/supabase'

export default function Summary() {
  const { id } = useParams()
  const [c, setC] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    db.consultations.getById(id)
      .then(setC)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="page-shell" style={{ alignItems:'center', justifyContent:'center' }}>
      <div className="spinner spinner-lg"></div>
    </div>
  )

  if (!c) return (
    <div className="page-shell">
      <div className="page-content" style={{ textAlign:'center', paddingTop:'3rem' }}>
        <p>Consultation not found.</p>
      </div>
    </div>
  )

  const rxList = Array.isArray(c.prescriptions) ? c.prescriptions : []
  const xrList = Array.isArray(c.radiology_referrals) ? c.radiology_referrals : []

  return (
    <div className="page-shell">
      <header className="page-header">
        <span className="page-logo">TERE</span>
      </header>

      <div className="page-content">
        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:'1.5rem' }}>
          <div style={{
            width:72, height:72, background:'var(--success-bg)', borderRadius:'50%',
            display:'flex', alignItems:'center', justifyContent:'center',
            margin:'0 auto 1rem', fontSize:'2rem'
          }}>✅</div>
          <h1 style={{ fontSize:'1.4rem', marginBottom:'0.25rem' }}>Consultation complete</h1>
          <p style={{ color:'var(--muted)', fontSize:'0.9rem' }}>
            Ngā mihi nui, {c.patient_name?.split(' ')[0]}. Here's a summary of your visit.
          </p>
        </div>

        {/* ACC claim */}
        {c.is_acc && c.acc_claim_number && (
          <div className="alert alert-success" style={{ marginBottom:'1rem' }}>
            <span>🎉</span>
            <div>
              <strong>ACC claim lodged</strong>
              <p style={{ marginTop:2, fontSize:'0.875rem' }}>
                Claim reference: <strong>{c.acc_claim_number}</strong>
              </p>
            </div>
          </div>
        )}

        {/* Prescriptions */}
        {rxList.length > 0 && (
          <div className="card" style={{ marginBottom:'1rem' }}>
            <h2 style={{ fontSize:'1rem', marginBottom:'0.75rem', display:'flex', gap:8, alignItems:'center' }}>
              <span>💊</span> Your prescriptions
            </h2>
            {rxList.map((rx, i) => (
              <div key={i} style={{
                background:'var(--bg)', padding:'0.875rem', borderRadius:'var(--radius)',
                marginBottom: i < rxList.length-1 ? '0.5rem' : 0
              }}>
                <p style={{ fontWeight:600 }}>{rx.medication}</p>
                <p style={{ fontSize:'0.875rem', color:'var(--muted)' }}>{rx.directions}</p>
                {rx.pharmacy && <p style={{ fontSize:'0.8rem', color:'var(--teal)', marginTop:4 }}>
                  📍 Sent to {rx.pharmacy}
                </p>}
              </div>
            ))}
          </div>
        )}

        {/* Radiology referrals */}
        {xrList.length > 0 && (
          <div className="card" style={{ marginBottom:'1rem' }}>
            <h2 style={{ fontSize:'1rem', marginBottom:'0.75rem', display:'flex', gap:8, alignItems:'center' }}>
              <span>🩻</span> Imaging referral
            </h2>
            {xrList.map((xr, i) => (
              <div key={i} style={{
                background:'var(--bg)', padding:'0.875rem', borderRadius:'var(--radius)'
              }}>
                <p style={{ fontWeight:600 }}>{xr.investigation}</p>
                <p style={{ fontSize:'0.875rem', color:'var(--muted)' }}>
                  {xr.urgency} · {xr.provider}
                </p>
                {c.is_acc && (
                  <p style={{ fontSize:'0.8rem', color:'var(--success)', marginTop:4 }}>
                    ✓ Covered by your ACC claim
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Clinical plan */}
        {c.soap_plan && (
          <div className="card" style={{ marginBottom:'1rem' }}>
            <h2 style={{ fontSize:'1rem', marginBottom:'0.75rem' }}>Your doctor's plan</h2>
            <p style={{ fontSize:'0.9rem', lineHeight:1.7, whiteSpace:'pre-wrap' }}>{c.soap_plan}</p>
          </div>
        )}

        {/* Next steps */}
        <div className="card" style={{ marginBottom:'1rem' }}>
          <h2 style={{ fontSize:'1rem', marginBottom:'0.75rem' }}>Next steps</h2>
          {[
            rxList.length > 0 && `Collect your prescription from ${rxList[0]?.pharmacy || 'your nominated pharmacy'}`,
            xrList.length > 0 && `Book your ${xrList[0]?.investigation} at ${xrList[0]?.provider}`,
            'If your condition worsens, call 111 or go to your nearest emergency department',
            'For follow-up, return to terehealth.co.nz',
          ].filter(Boolean).map((step, i) => (
            <div key={i} style={{ display:'flex', gap:10, marginBottom:8, fontSize:'0.9rem' }}>
              <span style={{ color:'var(--teal)', fontWeight:700, flexShrink:0 }}>{i+1}.</span>
              <span>{step}</span>
            </div>
          ))}
        </div>

        {/* Book again */}
        <a href="/start" className="btn btn-primary btn-lg" style={{ width:'100%', marginBottom:'1rem', textDecoration:'none', display:'flex' }}>
          Start a new consultation
        </a>

        <p style={{ textAlign:'center', fontSize:'0.78rem', color:'var(--muted)' }}>
          Tere Health Limited · MCNZ Registered · terehealth.co.nz
          <br />If this is an emergency call <a href="tel:111" style={{ color:'var(--danger)' }}>111</a>
        </p>
      </div>
    </div>
  )
}
