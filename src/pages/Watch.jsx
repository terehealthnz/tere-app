import React from 'react'
import { Link } from 'react-router-dom'

const BRAND = { navy: '#0D2B45', teal: '#0B6E76', tealLight: '#D4EEF0', cream: '#F7F5F0' }

export default function Watch() {
  return (
    <div style={{ minHeight: '100vh', background: BRAND.cream, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <nav style={{ background: BRAND.navy, padding: '.875rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', color: BRAND.tealLight, fontSize: '1.4rem' }}>Tere Health</span>
        </Link>
        <Link to="/start" style={{ background: BRAND.teal, color: 'white', textDecoration: 'none', padding: '7px 16px', borderRadius: 99, fontSize: '.875rem', fontWeight: 700 }}>
          Book consultation
        </Link>
      </nav>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '3rem 1.25rem 5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ display: 'inline-block', background: 'rgba(11,110,118,.08)', border: `1px solid ${BRAND.tealLight}`, borderRadius: 99, padding: '5px 14px', fontSize: '.75rem', color: BRAND.teal, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '1.25rem' }}>
            See it in action
          </div>
          <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(2rem, 5vw, 2.75rem)', color: BRAND.navy, marginBottom: '.5rem', fontWeight: 700, lineHeight: 1.15 }}>
            A Tere consultation, end to end.
          </h1>
          <p style={{ fontSize: '1rem', color: '#4A5568', maxWidth: 620, margin: '.75rem auto 0', lineHeight: 1.6 }}>
            From opening the site to speaking with an Emergency Medicine physician — in under two minutes.
          </p>
        </div>

        <div style={{ background: '#000', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 64px rgba(13,43,69,.25)' }}>
          <video
            controls
            preload="metadata"
            playsInline
            style={{ width: '100%', height: 'auto', display: 'block' }}
          >
            <source src="/videos/tere-demo.mp4" type="video/mp4" />
            Your browser doesn't support HTML5 video. <a href="/videos/tere-demo.mp4" style={{ color: BRAND.tealLight }}>Download the video</a>.
          </video>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '2.5rem' }}>
          {[
            { title: 'MCNZ-registered', body: 'Every consult with a New Zealand registered Emergency Medicine physician.' },
            { title: 'No app', body: 'Works on any phone browser. Open tere.co.nz, no download.' },
            { title: 'ACC-integrated', body: 'Injury claims lodged directly during the consultation.' },
            { title: 'Prescriptions delivered', body: 'To your chosen NZ pharmacy — electronic or fax.' },
          ].map(f => (
            <div key={f.title} style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '1rem 1.25rem' }}>
              <div style={{ fontWeight: 700, color: BRAND.navy, fontSize: '.9375rem', marginBottom: '.25rem' }}>{f.title}</div>
              <div style={{ fontSize: '.8125rem', color: '#4A5568', lineHeight: 1.55 }}>{f.body}</div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: '3rem' }}>
          <Link to="/start" style={{ display: 'inline-block', background: BRAND.teal, color: 'white', textDecoration: 'none', padding: '14px 32px', borderRadius: 99, fontSize: '1rem', fontWeight: 700, boxShadow: '0 8px 24px rgba(11,110,118,.3)' }}>
            Start a consultation →
          </Link>
          <p style={{ fontSize: '.8125rem', color: '#6B7280', marginTop: '1rem' }}>
            Partner or payer enquiries — <a href="mailto:terehealthnz@gmail.com" style={{ color: BRAND.teal, fontWeight: 600 }}>terehealthnz@gmail.com</a>
          </p>
        </div>
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
