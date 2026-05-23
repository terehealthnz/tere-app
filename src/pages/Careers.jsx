import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const TEAL_LIGHT = '#D4EEF0'
const FF = 'Plus Jakarta Sans, sans-serif'

function Nav() {
  return (
    <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: 'rgba(13,43,69,0.97)', backdropFilter: 'blur(8px)', padding: '.875rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <Link to="/" style={{ display: 'flex', alignItems: 'baseline', gap: '.75rem', textDecoration: 'none' }}>
        <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', color: TEAL_LIGHT, fontSize: '1.5rem', fontWeight: 600 }}>Tere Health</span>
        <span style={{ color: 'rgba(212,238,240,.45)', fontSize: '.75rem', letterSpacing: '.1em', textTransform: 'uppercase', fontFamily: FF }}>He tere, he ora</span>
      </Link>
      <Link to="/triage" style={{ background: TEAL, color: 'white', textDecoration: 'none', padding: '8px 18px', borderRadius: 99, fontSize: '.9rem', fontWeight: 700, fontFamily: FF }}>Book consultation</Link>
    </nav>
  )
}

function Hero() {
  return (
    <section style={{ background: `linear-gradient(160deg, ${NAVY} 0%, #0a3d52 100%)`, minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8rem 1.5rem 5rem', textAlign: 'center' }}>
      <div style={{ display: 'inline-block', background: 'rgba(11,110,118,.3)', border: '1px solid rgba(212,238,240,.2)', borderRadius: 99, padding: '5px 14px', fontSize: '.8rem', color: TEAL_LIGHT, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '1.5rem', fontFamily: FF }}>
        Join the team
      </div>
      <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(2.25rem, 5vw, 3.5rem)', fontWeight: 700, color: 'white', lineHeight: 1.15, margin: '0 0 1.25rem', maxWidth: 700 }}>
        Join the Tere Health team
      </h1>
      <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,.75)', lineHeight: 1.7, margin: '0 0 1rem', fontFamily: FF, maxWidth: 580 }}>
        We're building the future of rural telehealth in Aotearoa.
      </p>
      <p style={{ fontSize: '1.25rem', color: 'rgba(212,238,240,.55)', fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic' }}>
        He tere, he ora — swift action, healthy lives
      </p>
    </section>
  )
}

function About() {
  return (
    <section style={{ background: 'white', padding: '4rem 1.5rem' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', color: NAVY, marginBottom: '1.25rem' }}>
          Who we are
        </h2>
        <p style={{ fontSize: '1rem', color: '#374151', lineHeight: 1.8, marginBottom: '1rem', fontFamily: FF }}>
          Tere Health is a telehealth service built for rural New Zealand. We serve communities across the Marlborough Sounds and beyond — people who face long drives, limited GP access, and uncertain weather just to see a doctor.
        </p>
        <p style={{ fontSize: '1rem', color: '#374151', lineHeight: 1.8, fontFamily: FF }}>
          Our platform connects patients with registered New Zealand clinicians by video, phone, or message — from wherever they are. We handle ACC, prescriptions, referrals, and clinical notes automatically, so you can focus entirely on the patient in front of you.
        </p>
      </div>
    </section>
  )
}

function typeLabel(type) {
  return { 'full-time': 'Full-time', 'part-time': 'Part-time', contractor: 'Contractor' }[type] || type
}

function JobListings() {
  const [listings, setListings] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const { supabase } = await import('../lib/supabase')
        const { data } = await supabase
          .from('job_listings')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: true })
        setListings(data || [])
      } catch {
        setListings([])
      }
    }
    load()
  }, [])

  return (
    <section style={{ background: '#F0F2F5', padding: '4rem 1.5rem' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', color: NAVY, marginBottom: '.5rem', textAlign: 'center' }}>
          Current openings
        </h2>
        <p style={{ textAlign: 'center', color: '#6B7280', fontFamily: FF, fontSize: '.9375rem', marginBottom: '2.5rem' }}>
          All roles are remote and flexible. Work from anywhere in New Zealand.
        </p>

        {listings === null ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#9CA3AF', fontFamily: FF }}>Loading…</div>
        ) : listings.length === 0 ? (
          <div style={{ background: 'white', borderRadius: 16, padding: '2.5rem', textAlign: 'center', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '.75rem' }}>📭</div>
            <div style={{ fontWeight: 700, color: NAVY, marginBottom: '.375rem', fontFamily: FF }}>No current openings</div>
            <div style={{ color: '#6B7280', fontSize: '.9rem', fontFamily: FF }}>Check back soon — or send a speculative application to <a href="mailto:terehealthnz@gmail.com" style={{ color: TEAL, textDecoration: 'none', fontWeight: 600 }}>terehealthnz@gmail.com</a></div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {listings.map(job => (
              <div key={job.id} style={{ background: 'white', borderRadius: 16, padding: '2rem', border: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  <div>
                    <h3 style={{ fontFamily: FF, fontWeight: 700, fontSize: '1.125rem', color: NAVY, margin: '0 0 .375rem' }}>{job.title}</h3>
                    <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                      {job.location && <span style={{ background: '#EFF6FF', color: '#1D4ED8', fontSize: '.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, fontFamily: FF }}>📍 {job.location}</span>}
                      <span style={{ background: '#F0FDF4', color: '#065F46', fontSize: '.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, fontFamily: FF }}>{typeLabel(job.employment_type)}</span>
                    </div>
                  </div>
                  <a
                    href={`mailto:terehealthnz@gmail.com?subject=Application: ${encodeURIComponent(job.title)}`}
                    style={{ background: TEAL, color: 'white', textDecoration: 'none', padding: '9px 20px', borderRadius: 99, fontWeight: 700, fontSize: '.9rem', fontFamily: FF, whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    Apply now
                  </a>
                </div>

                {job.short_description && (
                  <p style={{ color: '#374151', fontSize: '.9375rem', lineHeight: 1.7, fontFamily: FF, margin: '0 0 1rem' }}>{job.short_description}</p>
                )}

                {job.full_description && (
                  <p style={{ color: '#6B7280', fontSize: '.875rem', lineHeight: 1.7, fontFamily: FF, margin: '0 0 1rem' }}>{job.full_description}</p>
                )}

                {job.requirements?.length > 0 && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '.875rem', color: NAVY, marginBottom: '.5rem', fontFamily: FF }}>Requirements</div>
                    <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                      {job.requirements.map((req, i) => (
                        <li key={i} style={{ color: '#374151', fontSize: '.875rem', lineHeight: 1.65, fontFamily: FF, marginBottom: '.25rem' }}>{req}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function WhyTere() {
  const points = [
    ['🏠', 'Work from anywhere in NZ', 'All consultations are remote. No commute, no fixed clinic hours.'],
    ['🕐', 'Set your own hours', 'Toggle your availability on or off any time. Work when it suits you.'],
    ['🌿', 'Make a real difference', 'Our patients are rural communities with limited access to care. Your work matters.'],
    ['🤖', 'Modern platform', 'No paperwork. Clinical notes are auto-generated from your consultation.'],
    ['✅', 'ACC handled automatically', 'We register and file ACC claims on your behalf.'],
    ['💊', 'Prescriptions sent electronically', 'Write and send prescriptions digitally — straight to the patient\'s pharmacy.'],
  ]
  return (
    <section style={{ background: NAVY, padding: '4rem 1.5rem' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', color: 'white', marginBottom: '.75rem', textAlign: 'center' }}>
          Why work with Tere?
        </h2>
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,.6)', fontFamily: FF, fontSize: '.9375rem', marginBottom: '2.5rem' }}>
          Built for clinicians who want flexibility without compromising on quality.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          {points.map(([icon, title, desc]) => (
            <div key={title} style={{ background: 'rgba(255,255,255,.07)', borderRadius: 12, padding: '1.5rem 1.25rem' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '.625rem' }}>{icon}</div>
              <div style={{ fontWeight: 700, color: TEAL_LIGHT, fontSize: '.9375rem', marginBottom: '.375rem', fontFamily: FF }}>{title}</div>
              <div style={{ fontSize: '.8125rem', color: 'rgba(255,255,255,.55)', lineHeight: 1.6, fontFamily: FF }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowToApply() {
  const steps = [
    { n: '1', title: 'Apply by email', desc: 'Send your CV and a short note about why you want to join Tere to terehealthnz@gmail.com — or click Apply now on any listing.' },
    { n: '2', title: '30-minute video call', desc: 'A quick call with our team to make sure it\'s a good fit. We\'ll walk you through the platform.' },
    { n: '3', title: 'Onboarding', desc: 'Get set up on the platform, complete a short orientation, and start seeing patients.' },
  ]
  return (
    <section style={{ background: 'white', padding: '4rem 1.5rem' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', color: NAVY, marginBottom: '.75rem' }}>
          How to apply
        </h2>
        <p style={{ color: '#6B7280', fontFamily: FF, fontSize: '.9375rem', marginBottom: '2.5rem' }}>
          We'll get back to you within 48 hours.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem', marginBottom: '2.5rem' }}>
          {steps.map(s => (
            <div key={s.n} style={{ background: '#F0F2F5', borderRadius: 16, padding: '2rem 1.25rem', position: 'relative' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: TEAL, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontWeight: 700, margin: '0 auto 1rem', fontFamily: FF }}>{s.n}</div>
              <div style={{ fontWeight: 700, fontSize: '.9375rem', color: NAVY, marginBottom: '.5rem', fontFamily: FF }}>{s.title}</div>
              <div style={{ fontSize: '.875rem', color: '#6B7280', lineHeight: 1.6, fontFamily: FF }}>{s.desc}</div>
            </div>
          ))}
        </div>
        <a href="mailto:terehealthnz@gmail.com" style={{ display: 'inline-block', background: TEAL, color: 'white', textDecoration: 'none', padding: '.9rem 2.25rem', borderRadius: 99, fontWeight: 700, fontSize: '1rem', fontFamily: FF, boxShadow: '0 4px 20px rgba(11,110,118,.3)' }}>
          Get in touch
        </a>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer style={{ background: NAVY, padding: '2rem 1.5rem', textAlign: 'center' }}>
      <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', color: TEAL_LIGHT, fontSize: '1.3rem', marginBottom: '.25rem' }}>Tere Health</div>
      <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '.875rem', flexWrap: 'wrap' }}>
        {[['Privacy', '/privacy'], ['Terms', '/terms'], ['Landing', '/landing']].map(([label, href]) => (
          <Link key={label} to={href} style={{ color: 'rgba(255,255,255,.5)', textDecoration: 'none', fontSize: '.875rem', fontFamily: FF }}>{label}</Link>
        ))}
      </div>
      <div style={{ marginTop: '.875rem', fontSize: '.75rem', color: 'rgba(255,255,255,.25)', fontFamily: FF }}>
        Marlborough Sounds, New Zealand · terehealthnz@gmail.com
      </div>
    </footer>
  )
}

export default function Careers() {
  return (
    <div style={{ fontFamily: FF }}>
      <Nav />
      <Hero />
      <About />
      <JobListings />
      <WhyTere />
      <HowToApply />
      <Footer />
    </div>
  )
}
