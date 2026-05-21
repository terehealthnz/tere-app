import React from 'react'
import { Link } from 'react-router-dom'

const BRAND = { navy: '#0D2B45', teal: '#0B6E76' }

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '1.5rem', color: BRAND.navy, marginBottom: '.75rem', fontWeight: 700 }}>{title}</h2>
      <div style={{ fontSize: '.9375rem', color: '#374151', lineHeight: 1.8, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{children}</div>
    </div>
  )
}

export default function Terms() {
  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <nav style={{ background: BRAND.navy, padding: '.875rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to="/landing" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.4rem' }}>Tere Health</span>
        </Link>
        <Link to="/" style={{ background: BRAND.teal, color: 'white', textDecoration: 'none', padding: '7px 16px', borderRadius: 99, fontSize: '.875rem', fontWeight: 700 }}>
          Book consultation
        </Link>
      </nav>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem 5rem' }}>
        <div style={{ marginBottom: '2.5rem' }}>
          <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(2rem, 5vw, 2.75rem)', color: BRAND.navy, marginBottom: '.5rem', fontWeight: 700 }}>
            Terms of Service
          </h1>
          <p style={{ fontSize: '.9rem', color: '#9CA3AF' }}>Last updated: May 2026</p>
        </div>

        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '2.5rem' }}>
          <strong style={{ color: '#991B1B', display: 'block', marginBottom: '.375rem' }}>In an emergency, call 111.</strong>
          <span style={{ fontSize: '.9rem', color: '#7F1D1D' }}>Tere Health is not an emergency service. If your life or someone else's life is at risk, stop and call 111 immediately.</span>
        </div>

        <Section title="1. What Tere Health is">
          <p>Tere Health provides telehealth consultations with New Zealand-registered doctors via video call, phone, or written message. We serve patients primarily in the Marlborough region and rural New Zealand.</p>
          <p style={{ marginTop: '.75rem' }}>Our service is designed for urgent care — conditions that need prompt attention but are not life-threatening emergencies. We can issue prescriptions, ACC claims, referrals, and medical certificates where clinically appropriate.</p>
        </Section>

        <Section title="2. What we are not">
          <p>Tere Health is <strong>not an emergency service</strong> and is not a substitute for emergency care. We do not provide ongoing general practice care or chronic disease management as a primary care provider.</p>
          <p style={{ marginTop: '.75rem' }}>Consultations are provided by independent registered clinicians. Tere Health is the platform operator. The treating clinician is responsible for the clinical care provided.</p>
        </Section>

        <Section title="3. Payment and fees">
          <p>Consultation fees are charged at the time of booking:</p>
          <ul style={{ marginTop: '.5rem', paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '.375rem' }}>Video consultation: $65 (or $25 ACC co-payment)</li>
            <li style={{ marginBottom: '.375rem' }}>Phone consultation: $45 (or $15 ACC co-payment)</li>
            <li style={{ marginBottom: '.375rem' }}>Written response: $25 (ACC not applicable)</li>
          </ul>
          <p style={{ marginTop: '.75rem' }}>Prices are in New Zealand dollars and include GST. Payment is processed securely via Stripe. We do not store your card details.</p>
        </Section>

        <Section title="4. Refund policy">
          <p>You may cancel and receive a full refund at any time before your consultation begins. Once a clinician has opened your consultation and started reviewing your notes, no refund is available — the clinician's time has been committed.</p>
          <p style={{ marginTop: '.75rem' }}>If a clinician determines they cannot assist with your query and closes the consultation without providing care, you will receive a full refund. We exercise this discretion fairly.</p>
        </Section>

        <Section title="5. ACC claims">
          <p>For injuries eligible under the Accident Compensation Act 2001, we will file an ACC claim on your behalf at no additional charge. The ACC co-payment (if applicable) is your contribution toward the consultation cost.</p>
          <p style={{ marginTop: '.75rem' }}>Eligibility for ACC cover is determined by ACC, not by Tere Health. If ACC declines your claim, the full private consultation fee applies and you will be invoiced for the difference.</p>
        </Section>

        <Section title="6. Your responsibilities">
          <p>By using Tere Health you agree to:</p>
          <ul style={{ marginTop: '.5rem', paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '.375rem' }}>Provide accurate and complete information about your symptoms and medical history</li>
            <li style={{ marginBottom: '.375rem' }}>Consult a clinician only for genuine health concerns</li>
            <li style={{ marginBottom: '.375rem' }}>Not use the platform for emergency situations — call 111 instead</li>
            <li style={{ marginBottom: '.375rem' }}>Follow up with your GP for ongoing or complex conditions</li>
            <li style={{ marginBottom: '.375rem' }}>Be 18 or older, or have parental/guardian consent</li>
          </ul>
        </Section>

        <Section title="7. Privacy">
          <p>We collect and store health information about you to provide the service. Your information is handled in accordance with the Health Information Privacy Code 2020 and the Privacy Act 2020.</p>
          <p style={{ marginTop: '.75rem' }}>Your consultation record may be shared with your regular GP if you request it or if clinically necessary. We do not sell or share your health information with third parties for commercial purposes.</p>
          <p style={{ marginTop: '.75rem' }}>View our full <Link to="/privacy" style={{ color: BRAND.teal, textDecoration: 'none', fontWeight: 600 }}>Privacy Policy</Link> for details.</p>
        </Section>

        <Section title="8. Recording consent">
          <p>Video and audio consultations may be recorded for clinical quality assurance and training purposes. You will be asked to consent to recording before your consultation begins. You may decline without affecting your access to care.</p>
        </Section>

        <Section title="9. Limitation of liability">
          <p>To the extent permitted by New Zealand law, Tere Health's liability is limited to the amount you paid for the consultation in question. We are not liable for indirect, consequential, or special damages.</p>
          <p style={{ marginTop: '.75rem' }}>Nothing in these terms limits your rights under the Consumer Guarantees Act 1993 or the Fair Trading Act 1986.</p>
        </Section>

        <Section title="10. Changes to these terms">
          <p>We may update these terms from time to time. Material changes will be communicated via email if you have an account with us. Continued use of Tere Health after changes are published constitutes acceptance.</p>
        </Section>

        <Section title="11. Governing law">
          <p>These terms are governed by the laws of New Zealand. Any disputes will be resolved in the courts of New Zealand. If a dispute cannot be resolved directly, we are happy to engage in mediation before formal proceedings.</p>
        </Section>

        <Section title="Contact us">
          <p>Questions about these terms?</p>
          <p style={{ marginTop: '.5rem' }}>
            <a href="mailto:hello@terehealth.co.nz" style={{ color: BRAND.teal, textDecoration: 'none', fontWeight: 600 }}>hello@terehealth.co.nz</a><br />
            <span style={{ color: '#9CA3AF' }}>Tere Health · Marlborough Sounds, New Zealand</span>
          </p>
        </Section>
      </div>

      <footer style={{ background: BRAND.navy, padding: '1.5rem', textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {[['Landing', '/landing'], ['Privacy', '/privacy'], ['Home', '/']].map(([label, path]) => (
            <Link key={label} to={path} style={{ color: 'rgba(255,255,255,.5)', textDecoration: 'none', fontSize: '.875rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{label}</Link>
          ))}
        </div>
      </footer>
    </div>
  )
}
