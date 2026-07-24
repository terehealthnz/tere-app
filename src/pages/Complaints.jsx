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

export default function Complaints() {
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
            Complaints
          </h1>
          <p style={{ fontSize: '.9375rem', color: '#6B7280' }}>
            We take every concern seriously. Here is how to raise one.
          </p>
        </div>

        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '2.5rem' }}>
          <strong style={{ color: '#065F46', display: 'block', marginBottom: '.375rem' }}>We respond within 5 working days.</strong>
          <span style={{ fontSize: '.9rem', color: '#374151' }}>Email us at{' '}
            <a href="mailto:terehealthnz@gmail.com" style={{ color: BRAND.teal, fontWeight: 600 }}>terehealthnz@gmail.com</a>
            {' '}and we will acknowledge your complaint within 1 working day and provide a full response within 5 working days.
          </span>
        </div>

        <Section title="1. How to make a complaint to Tere Health">
          <p>If you are unhappy with any aspect of your care or experience, please contact us:</p>
          <ul style={{ marginTop: '.5rem', paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '.375rem' }}>
              <strong>Email:</strong>{' '}
              <a href="mailto:terehealthnz@gmail.com" style={{ color: BRAND.teal, fontWeight: 600 }}>terehealthnz@gmail.com</a>
            </li>
            <li style={{ marginBottom: '.375rem' }}>
              <strong>Post:</strong> Tere Health Limited, 41 Adams Lane, Springlands, Blenheim 7201
            </li>
          </ul>
          <p style={{ marginTop: '.75rem' }}>Please include your name, the date of your consultation, and a description of your concern. You may remain anonymous, but we may be unable to fully investigate without some identifying information.</p>
        </Section>

        <Section title="2. What happens after you complain">
          <ul style={{ paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '.5rem' }}><strong>Day 1:</strong> We acknowledge receipt of your complaint</li>
            <li style={{ marginBottom: '.5rem' }}><strong>Within 5 working days:</strong> We provide a full written response</li>
            <li style={{ marginBottom: '.5rem' }}><strong>If complex:</strong> We may request up to 20 working days and will keep you informed of progress</li>
            <li style={{ marginBottom: '.5rem' }}><strong>Outcome:</strong> We will explain what happened, apologise if appropriate, and outline any changes we have made</li>
          </ul>
        </Section>

        <Section title="3. If you are not satisfied with our response">
          <p>You have the right to escalate your complaint to external bodies. These services are free of charge.</p>

          <div style={{ background: 'white', borderRadius: 10, border: '1px solid #E2E8F0', padding: '1.25rem', marginTop: '.875rem', marginBottom: '.875rem' }}>
            <div style={{ fontWeight: 700, color: BRAND.navy, marginBottom: '.25rem' }}>Health and Disability Commissioner (HDC)</div>
            <div style={{ fontSize: '.875rem', color: '#6B7280', marginBottom: '.375rem' }}>For complaints about health and disability services</div>
            <div style={{ fontSize: '.9rem' }}>
              <a href="https://hdc.org.nz/complaints" target="_blank" rel="noreferrer" style={{ color: BRAND.teal, fontWeight: 600 }}>hdc.org.nz/complaints</a>
              {' '}· Phone: 0800 11 22 33
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: 10, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '.875rem' }}>
            <div style={{ fontWeight: 700, color: BRAND.navy, marginBottom: '.25rem' }}>Office of the Privacy Commissioner</div>
            <div style={{ fontSize: '.875rem', color: '#6B7280', marginBottom: '.375rem' }}>For complaints about how your personal information was handled</div>
            <div style={{ fontSize: '.9rem' }}>
              <a href="https://privacy.org.nz" target="_blank" rel="noreferrer" style={{ color: BRAND.teal, fontWeight: 600 }}>privacy.org.nz</a>
              {' '}· Phone: 0800 803 909
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: 10, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '.875rem' }}>
            <div style={{ fontWeight: 700, color: BRAND.navy, marginBottom: '.25rem' }}>Medical Council of New Zealand (MCNZ)</div>
            <div style={{ fontSize: '.875rem', color: '#6B7280', marginBottom: '.375rem' }}>For complaints about a doctor's professional conduct</div>
            <div style={{ fontSize: '.9rem' }}>
              <a href="https://mcnz.org.nz" target="_blank" rel="noreferrer" style={{ color: BRAND.teal, fontWeight: 600 }}>mcnz.org.nz</a>
              {' '}· Phone: 0800 286 801
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: 10, border: '1px solid #E2E8F0', padding: '1.25rem' }}>
            <div style={{ fontWeight: 700, color: BRAND.navy, marginBottom: '.25rem' }}>Disputes Tribunal</div>
            <div style={{ fontSize: '.875rem', color: '#6B7280', marginBottom: '.375rem' }}>For disputes about fees or refunds (claims up to $30,000)</div>
            <div style={{ fontSize: '.9rem' }}>
              <a href="https://disputestribunal.govt.nz" target="_blank" rel="noreferrer" style={{ color: BRAND.teal, fontWeight: 600 }}>disputestribunal.govt.nz</a>
            </div>
          </div>
        </Section>

        <Section title="4. Your rights under the HDC Code of Rights">
          <p>Under the Health and Disability Commissioner Code of Rights 1996, you have the right to:</p>
          <ul style={{ marginTop: '.5rem', paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '.375rem' }}>Be treated with respect and dignity</li>
            <li style={{ marginBottom: '.375rem' }}>Receive fair treatment without discrimination</li>
            <li style={{ marginBottom: '.375rem' }}>Receive services of an appropriate standard</li>
            <li style={{ marginBottom: '.375rem' }}>Receive effective communication and be fully informed</li>
            <li style={{ marginBottom: '.375rem' }}>Make an informed choice and give informed consent</li>
            <li style={{ marginBottom: '.375rem' }}>Have a support person present</li>
            <li style={{ marginBottom: '.375rem' }}>Complain about your care without it affecting your treatment</li>
          </ul>
          <p style={{ marginTop: '.75rem' }}>
            <a href="https://hdc.org.nz/your-rights/the-code-and-your-rights/" target="_blank" rel="noreferrer" style={{ color: BRAND.teal, fontWeight: 600 }}>Read the full Code of Rights at hdc.org.nz →</a>
          </p>
        </Section>

        <Section title="5. Complaints about privacy">
          <p>
            If you believe Tere Health has mishandled your personal or health information, please contact our Privacy Officer:{' '}
            <a href="mailto:terehealthnz@gmail.com" style={{ color: BRAND.teal, fontWeight: 600 }}>terehealthnz@gmail.com</a>
          </p>
          <p style={{ marginTop: '.75rem' }}>You may also contact the Office of the Privacy Commissioner directly at any time — you do not need to contact us first.</p>
        </Section>

        <div style={{ background: '#F8FAFC', borderRadius: 12, border: '1px solid #E2E8F0', padding: '1.25rem 1.5rem', marginTop: '2rem' }}>
          <div style={{ fontSize: '.875rem', color: '#6B7280' }}>
            <strong style={{ color: BRAND.navy }}>Tere Health Limited</strong><br />
            Marlborough Sounds, New Zealand<br />
            <a href="mailto:terehealthnz@gmail.com" style={{ color: BRAND.teal }}>terehealthnz@gmail.com</a>
          </div>
        </div>
      </div>

      <footer style={{ background: BRAND.navy, padding: '1.5rem', textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {[['Home', '/'], ['Privacy', '/privacy'], ['Terms', '/terms'], ['Accessibility', '/accessibility']].map(([label, path]) => (
            <Link key={label} to={path} style={{ color: 'rgba(255,255,255,.5)', textDecoration: 'none', fontSize: '.875rem' }}>{label}</Link>
          ))}
        </div>
      </footer>
    </div>
  )
}
