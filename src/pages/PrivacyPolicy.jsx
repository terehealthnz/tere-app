import React from 'react'
import { useNavigate } from 'react-router-dom'

export default function PrivacyPolicy() {
  const navigate = useNavigate()
  return (
    <div className="page-shell">
      <header className="page-header">
        <span className="page-logo">TERE</span>
        <span style={{fontSize:'0.8rem',color:'rgba(255,255,255,0.45)'}}>Privacy Policy</span>
      </header>
      <div className="page-content">
        <div className="card" style={{maxWidth:680,margin:'0 auto'}}>
          <h1 style={{fontSize:'1.4rem',marginBottom:'.25rem'}}>Privacy Policy</h1>
          <p style={{color:'var(--muted)',fontSize:'.875rem',marginBottom:'1.5rem'}}>Tere Health Limited — Version 1.0 — He tere, he ora</p>

          {[
            ['1. Who We Are', 'Tere Health Limited is a New Zealand telehealth company providing urgent care consultations to patients in rural and remote New Zealand. Our responsible clinician is Dr Patrick Herling, MBChB, a registered Emergency Medicine physician (MCNZ). Contact: privacy@terehealth.co.nz'],
            ['2. What We Collect', 'We collect your name, date of birth, NHI number, contact details, location, employer, medical history, medications, allergies, symptoms, photos (if provided), and ACC information. During your consultation we also collect vital signs, clinical notes, prescription details, and payment records.'],
            ['3. How We Use It', 'Your information is used only to provide your consultation, prepare your doctor, generate clinical notes, lodge ACC claims, arrange prescriptions and referrals, and notify you when a doctor is available. We do not use your health information for marketing or advertising.'],
            ['4. Where It Is Stored', 'All patient data is stored in a secure database in Sydney, Australia (encrypted at rest and in transit). Payment processing is handled by Stripe (PCI-DSS Level 1). Video consultations use end-to-end encrypted WebRTC via Daily.co.'],
            ['5. Who Can Access It', 'Only your treating clinician and authorised Tere Health staff can access your health information. We do not sell or share your data with third parties except as required to deliver your care (ACC, pharmacy, radiology) or by law.'],
            ['6. AI and Automated Processing', 'Tere uses AI to assist with triage and clinical note-taking. No clinical decisions are made by AI without clinician review. The treating physician is always responsible for your care. Tere Vitals readings are indicative screening estimates only.'],
            ['7. Data Retention', 'Health records are retained for a minimum of 10 years in accordance with the Health (Retention of Health Information) Regulations 1996.'],
            ['8. Your Rights', 'Under the Privacy Act 2020 and Health Information Privacy Code 2020, you have the right to access, correct, and request deletion of your information. Contact privacy@terehealth.co.nz. Complaints can be directed to the Office of the Privacy Commissioner (privacy.org.nz) or Health and Disability Commissioner (hdc.org.nz).'],
          ].map(([title, text]) => (
            <div key={title} style={{marginBottom:'1.25rem'}}>
              <h2 style={{fontSize:'1rem',fontWeight:700,color:'var(--navy)',marginBottom:'.375rem'}}>{title}</h2>
              <p style={{fontSize:'.9rem',lineHeight:1.7,color:'var(--text)'}}>{text}</p>
            </div>
          ))}

          <div style={{borderTop:'1px solid var(--border)',paddingTop:'1rem',marginTop:'1rem'}}>
            <p style={{fontSize:'.8125rem',color:'var(--muted)',fontStyle:'italic'}}>He tere, he ora — swift action, healthy lives.</p>
            <p style={{fontSize:'.8125rem',color:'var(--muted)'}}>Tere Health Limited | privacy@terehealth.co.nz</p>
          </div>

          <button onClick={() => navigate(-1)} className="btn btn-secondary" style={{marginTop:'1rem'}}>← Back</button>
        </div>
      </div>
    </div>
  )
}