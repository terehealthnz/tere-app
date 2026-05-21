import React from 'react'

export default function PostConsult() {
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
          <div style={{background:'var(--bg)',borderRadius:'var(--radius-sm)',padding:'1rem',textAlign:'left',marginBottom:'1.25rem'}}>
            <p style={{fontSize:'.875rem',lineHeight:1.7}}>
              <strong style={{display:'block',marginBottom:'.25rem',color:'var(--text)'}}>What happens next</strong>
              Your consultation notes have been sent to your doctor for final review. If a prescription was issued,
              your pharmacy will receive it electronically. If an X-ray or scan was ordered, you will receive
              the referral details by SMS.
            </p>
          </div>
          <a href="/" className="btn btn-primary btn-full">
            Start a new consultation
          </a>
        </div>
        <p style={{fontSize:'.8125rem',color:'var(--muted)',marginTop:'1.25rem'}}>
          Urgent concern? Call <strong>111</strong>. Non-emergency: return to Tere anytime.
        </p>
      </div>
    </div>
  )
}
