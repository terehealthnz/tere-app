import React from 'react'
import { Link } from 'react-router-dom'

const BRAND = { navy: '#0D2B45', teal: '#0B6E76' }

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '1.375rem', color: BRAND.navy, marginBottom: '.625rem', fontWeight: 700 }}>{title}</h2>
      <div style={{ fontSize: '.9375rem', color: '#374151', lineHeight: 1.8, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{children}</div>
    </div>
  )
}

export default function Accessibility() {
  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <nav style={{ background: BRAND.navy, padding: '.875rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.4rem' }}>Tere Health</span>
        </Link>
        <Link to="/start" style={{ background: BRAND.teal, color: 'white', textDecoration: 'none', padding: '7px 16px', borderRadius: 99, fontSize: '.875rem', fontWeight: 700 }}>
          Book consultation
        </Link>
      </nav>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem 5rem' }}>
        <div style={{ marginBottom: '2.5rem' }}>
          <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(2rem, 5vw, 2.75rem)', color: BRAND.navy, marginBottom: '.5rem', fontWeight: 700 }}>
            Accessibility Statement
          </h1>
          <p style={{ fontSize: '.9375rem', color: '#6B7280' }}>Last updated: May 2026</p>
        </div>

        <Section title="Our commitment">
          <p>Tere Health is committed to making our telehealth service accessible to all New Zealanders, including people with disabilities and those in remote or rural areas.</p>
          <p style={{ marginTop: '.75rem' }}>We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA standard. We are continuously improving our service to make it easier for everyone to use.</p>
        </Section>

        <Section title="Language support">
          <p>Tere Health supports consultations in 9 languages:</p>
          <ul style={{ marginTop: '.5rem', paddingLeft: '1.25rem' }}>
            {['English', 'Te Reo Māori', 'Samoan', 'Tongan', 'Hindi', 'Mandarin', 'Cantonese', 'Filipino (Tagalog)', 'Spanish'].map(l => (
              <li key={l} style={{ marginBottom: '.25rem' }}>{l}</li>
            ))}
          </ul>
          <p style={{ marginTop: '.75rem' }}>If you need a professional interpreter for your consultation, please indicate this during the intake process. We will make reasonable efforts to arrange an interpreter at no additional charge.</p>
        </Section>

        <Section title="Accessibility features">
          <ul style={{ paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '.5rem' }}><strong>Mobile-first design:</strong> The app is fully functional on smartphones and tablets, which is important for patients in rural areas with limited computer access</li>
            <li style={{ marginBottom: '.5rem' }}><strong>Large touch targets:</strong> Buttons and interactive elements meet minimum size requirements for motor accessibility</li>
            <li style={{ marginBottom: '.5rem' }}><strong>Colour contrast:</strong> Text and interactive elements meet WCAG 2.1 AA contrast ratios</li>
            <li style={{ marginBottom: '.5rem' }}><strong>Phone consultation option:</strong> Available for patients who cannot use video or who have hearing difficulties requiring voice-only interaction</li>
            <li style={{ marginBottom: '.5rem' }}><strong>Written consultation option:</strong> Available for patients who prefer or require text-based communication</li>
            <li style={{ marginBottom: '.5rem' }}><strong>No waiting room required:</strong> Patients can complete intake and wait from home, reducing barriers for people with mobility limitations</li>
          </ul>
        </Section>

        <Section title="Known limitations">
          <p>We are aware of the following limitations and are working to address them:</p>
          <ul style={{ marginTop: '.5rem', paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '.375rem' }}>Some pages are not yet fully optimised for screen readers</li>
            <li style={{ marginBottom: '.375rem' }}>The video consultation interface relies on WebRTC, which may not work with all assistive technologies</li>
            <li style={{ marginBottom: '.375rem' }}>The vital signs camera function requires a smartphone camera and may not be accessible to all patients</li>
          </ul>
          <p style={{ marginTop: '.75rem' }}>If the vital signs function is inaccessible to you, you can skip it or enter readings manually. Vital signs are optional and you will still receive a full consultation.</p>
        </Section>

        <Section title="How to get help">
          <p>If you are having difficulty accessing any part of our service, please contact us:</p>
          <ul style={{ marginTop: '.5rem', paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '.375rem' }}>
              <strong>Email:</strong>{' '}
              <a href="mailto:terehealthnz@gmail.com" style={{ color: BRAND.teal, fontWeight: 600 }}>terehealthnz@gmail.com</a>
            </li>
          </ul>
          <p style={{ marginTop: '.75rem' }}>We will respond within 2 working days and work with you to find a way to access our service.</p>
        </Section>

        <Section title="Feedback">
          <p>We welcome feedback on the accessibility of Tere Health. If you find any barriers to access, please tell us so we can improve.</p>
          <p style={{ marginTop: '.75rem' }}>
            <a href="mailto:terehealthnz@gmail.com" style={{ color: BRAND.teal, fontWeight: 600 }}>terehealthnz@gmail.com</a>
          </p>
        </Section>

        <Section title="Third-party tools">
          <p>Tere Health uses the following third-party tools, which have their own accessibility statements:</p>
          <ul style={{ paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '.375rem' }}>Stripe (payment processing) — <a href="https://stripe.com/accessibility" target="_blank" rel="noreferrer" style={{ color: BRAND.teal }}>stripe.com/accessibility</a></li>
            <li style={{ marginBottom: '.375rem' }}>LiveKit (video calls) — end-to-end encrypted WebRTC</li>
          </ul>
        </Section>
      </div>

      <footer style={{ background: BRAND.navy, padding: '1.5rem', textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {[['Home', '/'], ['Privacy', '/privacy'], ['Terms', '/terms'], ['Complaints', '/complaints']].map(([label, path]) => (
            <Link key={label} to={path} style={{ color: 'rgba(255,255,255,.5)', textDecoration: 'none', fontSize: '.875rem' }}>{label}</Link>
          ))}
        </div>
      </footer>
    </div>
  )
}
