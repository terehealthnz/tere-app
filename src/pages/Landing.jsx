import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

const BRAND = {
  navy: '#0D2B45',
  teal: '#0B6E76',
  tealLight: '#D4EEF0',
  bg: '#F0F2F5',
  // Soft cream used across hero + alt sections. Replaces the dark navy
  // gradient hero per the Nov 2026 concept review — warmer, more welcoming
  // for rural patients, better contrast for the orange CTA.
  cream: '#F7F1E8',
  creamDeep: '#EEE4D1',
  accent: '#C98B2A',
}

// Always use a relative URL. An earlier iteration routed prod traffic to
// https://tere.co.nz/start (the short vanity domain), which 308-redirects
// to terehealth.co.nz/start. That extra hop revived a stale service worker
// registered on the tere.co.nz origin, causing cross-origin blocks
// ("Unsafe attempt to load URL"), double Supabase clients, and downstream
// React "removeChild" crashes when the SW served stale HTML.
const CONSULT_URL = '/start'

function Nav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', h)
    return () => window.removeEventListener('scroll', h)
  }, [])
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: scrolled ? 'rgba(247,241,232,.95)' : 'transparent',
      borderBottom: scrolled ? '1px solid rgba(13,43,69,.08)' : 'none',
      backdropFilter: scrolled ? 'blur(10px)' : 'none',
      transition: 'background .25s, border-color .25s',
      padding: '.875rem 1.5rem',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <Link to="/" style={{ display: 'flex', alignItems: 'baseline', gap: '.75rem', textDecoration: 'none' }}>
        <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', color: BRAND.navy, fontSize: '1.5rem', fontWeight: 600, transition: 'opacity .15s' }} onMouseEnter={e=>e.currentTarget.style.opacity='.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>Tere Health</span>
      </Link>
      <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
        <div className="nav-links-desktop" style={{ display: 'flex', gap: '1.125rem', alignItems: 'center' }}>
          <a href="#how-it-works" style={{ color: BRAND.navy, opacity: .75, textDecoration: 'none', fontSize: '.9rem', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 500 }}>How it works</a>
          <a href="#pricing" style={{ color: BRAND.navy, opacity: .75, textDecoration: 'none', fontSize: '.9rem', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 500 }}>Pricing</a>
          <a href="#faq" style={{ color: BRAND.navy, opacity: .75, textDecoration: 'none', fontSize: '.9rem', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 500 }}>FAQ</a>
          <Link to="/employers" style={{ color: BRAND.navy, opacity: .75, textDecoration: 'none', fontSize: '.9rem', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 500 }}>Employers</Link>
          <Link to="/contact" style={{ color: BRAND.navy, opacity: .75, textDecoration: 'none', fontSize: '.9rem', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 500 }}>Support</Link>
        </div>
        <a href={CONSULT_URL} style={{
          background: BRAND.navy, color: 'white', textDecoration: 'none',
          padding: '9px 20px', borderRadius: 99, fontSize: '.9rem', fontWeight: 700,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
        }}>Book a consult</a>
      </div>
    </nav>
  )
}

// Decorative "coastal hills" strip — pure CSS, no image dependency. Evokes
// the NZ landscape framing from Concepts C and F without requiring Patrick
// to source a licensed photo. Swap for a real landscape image later if
// marketing commissions one; just replace this component's output.
function HillsStrip() {
  return (
    <div style={{
      position: 'relative', width: '100%',
      height: 'clamp(140px, 22vw, 220px)',
      marginTop: '-1rem', overflow: 'hidden',
      background: `linear-gradient(180deg, ${BRAND.cream} 0%, ${BRAND.creamDeep} 100%)`,
    }}>
      <svg viewBox="0 0 1200 220" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden>
        <path d="M0,180 C150,120 300,140 450,110 C600,80 750,120 900,100 C1050,80 1150,110 1200,100 L1200,220 L0,220 Z" fill="#8DB4A6" opacity=".55" />
        <path d="M0,200 C180,160 360,180 540,150 C720,120 900,160 1080,140 C1140,135 1180,145 1200,150 L1200,220 L0,220 Z" fill="#4F8A75" opacity=".7" />
        <path d="M0,215 C200,195 400,210 600,195 C800,180 1000,205 1200,195 L1200,220 L0,220 Z" fill={BRAND.teal} opacity=".9" />
      </svg>
    </div>
  )
}

function TrustChip({ icon, title, sub }) {
  return (
    <div style={{
      background: 'white', borderRadius: 14, padding: '1rem 1.1rem',
      boxShadow: '0 2px 10px rgba(13,43,69,.06)',
      border: '1px solid rgba(13,43,69,.06)',
      display: 'flex', flexDirection: 'column', gap: '.1rem',
      fontFamily: 'Plus Jakarta Sans, sans-serif',
    }}>
      <div style={{ fontSize: '1.1rem', marginBottom: '.1rem' }}>{icon}</div>
      <div style={{ fontWeight: 700, color: BRAND.navy, fontSize: '.9rem' }}>{title}</div>
      <div style={{ fontSize: '.75rem', color: '#6B7280' }}>{sub}</div>
    </div>
  )
}

function Hero() {
  return (
    <>
      <section style={{
        background: BRAND.cream,
        padding: '7rem 1.5rem 2.5rem', textAlign: 'center',
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '.5rem',
            background: 'rgba(11,110,118,.08)', border: '1px solid rgba(11,110,118,.2)',
            borderRadius: 99, padding: '5px 14px', fontSize: '.75rem',
            color: BRAND.teal, letterSpacing: '.08em', textTransform: 'uppercase',
            fontWeight: 700, marginBottom: '1.5rem', fontFamily: 'Plus Jakarta Sans, sans-serif',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
            Doctors available 8am to 8pm NZT
          </div>
          <h1 style={{
            fontFamily: 'Cormorant Garamond, Georgia, serif',
            fontSize: 'clamp(2.5rem, 6vw, 4rem)', fontWeight: 700,
            color: BRAND.navy, lineHeight: 1.1, margin: '0 0 1.25rem',
            letterSpacing: '-.01em',
          }}>
            Emergency doctors,<br />wherever you call home.
          </h1>
          <p style={{
            fontSize: '1.125rem', color: '#374151', lineHeight: 1.65,
            margin: '0 auto 1.75rem', fontFamily: 'Plus Jakarta Sans, sans-serif',
            maxWidth: 560,
          }}>
            See an NZ-registered emergency specialist by video or phone, usually within 2 hours. No trip to town, no waiting room, ACC claims handled on the spot.
          </p>
          <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '.75rem' }}>
            <a href={CONSULT_URL} style={{
              background: '#F97316', color: 'white', textDecoration: 'none',
              padding: '1rem 2.25rem', borderRadius: 99, fontSize: '1.125rem', fontWeight: 700,
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              boxShadow: '0 8px 24px rgba(249,115,22,.35)',
              letterSpacing: '.01em',
            }}>Start consultation</a>
            <a href="#how-it-works" style={{
              background: 'white', color: BRAND.navy, textDecoration: 'none',
              padding: '1rem 2rem', borderRadius: 99, fontSize: '1rem', fontWeight: 700,
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              border: `1.5px solid ${BRAND.navy}`,
            }}>How it works</a>
          </div>
          <div style={{
            fontSize: '.8125rem', color: '#6B7280',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            marginTop: '.75rem',
          }}>
            Submit after 8pm and you'll be at the top of the morning queue. <span style={{ color: '#B91C1C', fontWeight: 600 }}>For life-threatening emergencies, call 111.</span>
          </div>
        </div>
      </section>

      <HillsStrip />

      <section style={{ background: BRAND.cream, padding: '2rem 1.5rem 4rem' }}>
        <div style={{
          maxWidth: 900, margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '.75rem',
        }}>
          <TrustChip icon="🏥" title="FACEM-led"      sub="Medical director" />
          <TrustChip icon="🩺" title="MCNZ-registered" sub="Current APCs" />
          <TrustChip icon="🛡️" title="ACC registered" sub="Claims handled" />
          <TrustChip icon="⏱️" title="Within 2 hours" sub="8am to 8pm NZT" />
        </div>
      </section>
    </>
  )
}


function HowItWorks() {
  const steps = [
    { n: '1', icon: '💬', title: 'Chat',   desc: 'Share your symptoms with our triage assistant. A couple of minutes, from the couch.' },
    { n: '2', icon: '📷', title: 'Show',   desc: 'Snap a photo of any visible issue. Guided vitals if the doctor needs them.' },
    { n: '3', icon: '📞', title: 'Talk',   desc: 'A doctor calls you. Usually within 2 hours between 8am and 8pm. Video optional.' },
    { n: '4', icon: '✅', title: 'Sorted', desc: 'Scripts to any NZ pharmacy. X-ray or ultrasound arranged. Referrals and ACC filed.' },
  ]
  return (
    <section id="how-it-works" style={{ background: 'white', padding: '5rem 1.5rem' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(2rem, 4vw, 2.75rem)', color: BRAND.navy, marginBottom: '.75rem' }}>
          Simple, human, quick
        </h2>
        <p style={{ fontSize: '1rem', color: '#6B7280', marginBottom: '3rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          Four easy steps, all on your own device.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.5rem' }}>
          {steps.map(s => (
            <div key={s.n} style={{ background: BRAND.bg, borderRadius: 16, padding: '2rem 1.25rem', textAlign: 'center', position: 'relative' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: BRAND.teal, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', margin: '0 auto 1rem', boxShadow: '0 4px 12px rgba(11,110,118,.25)' }}>{s.icon}</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: BRAND.navy, marginBottom: '.5rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{s.title}</div>
              <div style={{ fontSize: '.875rem', color: '#374151', lineHeight: 1.6, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{s.desc}</div>
              <div style={{ position: 'absolute', top: 12, right: 14, fontWeight: 800, fontSize: '2rem', color: 'rgba(11,110,118,.08)', fontFamily: 'Cormorant Garamond, serif' }}>{s.n}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '2.5rem' }}>
          <Link to="/watch" style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', background: 'white', color: BRAND.teal, border: `2px solid ${BRAND.teal}`, textDecoration: 'none', padding: '12px 26px', borderRadius: 99, fontSize: '.9375rem', fontWeight: 700, fontFamily: 'Plus Jakarta Sans, sans-serif', transition: 'background .15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = BRAND.teal; e.currentTarget.style.color = 'white' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = BRAND.teal }}>
            ▶ Watch the 2-minute walkthrough
          </Link>
        </div>
      </div>
    </section>
  )
}

// Dark compliance block sits between HowItWorks and Pricing. Anchors trust
// in the standards-and-registration story that matters most to NZ rural
// patients and employer buyers: FACEM medical director, MCNZ APCs, ACC-
// registered, nationwide coverage. From Concept F review 2026-11-03.
function Compliance() {
  const items = [
    { label: 'FACEM',   sub: 'Medical director' },
    { label: 'MCNZ',    sub: 'Current APCs' },
    { label: 'ACC',     sub: 'Registered provider' },
    { label: 'NZ-wide', sub: 'Any pharmacy, any region' },
  ]
  return (
    <section style={{ background: BRAND.cream, padding: '4rem 1.5rem' }}>
      <div style={{
        maxWidth: 1080, margin: '0 auto',
        background: '#143D33', color: 'white',
        borderRadius: 20, padding: '2.5rem 2rem',
        display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) 1.3fr', gap: '2rem',
        alignItems: 'center',
      }} className="compliance-grid">
        <div>
          <h2 style={{
            fontFamily: 'Cormorant Garamond, Georgia, serif',
            fontSize: 'clamp(1.5rem, 3vw, 2rem)',
            margin: '0 0 .75rem', lineHeight: 1.15,
          }}>
            Qualified, registered,<br />accountable.
          </h2>
          <p style={{
            fontSize: '.9375rem', color: 'rgba(255,255,255,.75)',
            lineHeight: 1.6, margin: 0,
            fontFamily: 'Plus Jakarta Sans, sans-serif',
          }}>
            Every consultation is with an MCNZ-registered doctor holding a current practising certificate, under a FACEM medical director.
          </p>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '.75rem',
        }}>
          {items.map(it => (
            <div key={it.label} style={{
              background: 'rgba(255,255,255,.06)',
              border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 12, padding: '1rem .9rem',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
            }}>
              <div style={{ fontWeight: 700, color: BRAND.accent, fontSize: '.8125rem', letterSpacing: '.04em' }}>{it.label}</div>
              <div style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.75)', marginTop: 2 }}>{it.sub}</div>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @media (max-width: 720px) {
          .compliance-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  )
}

function Pricing() {
  // Three-tier side-by-side card layout (per Concept F review 2026-11-03).
  // Previous one-card-with-notes layout buried the $25-with-ACC and
  // $100-visitors prices in body text; now each is a scannable card.
  // Highlight remains the standard tier (most patients land there).
  const tiers = [
    {
      price: 65, label: 'Acute & emergent consultation',
      sub: 'Standard patient fee',
      features: ['Specialist within 2 hours', 'Scripts, referrals, ACC filed', 'Video optional', 'Summary emailed'],
      highlight: true,
      ctaLabel: 'Book now',
    },
    {
      price: 25, label: 'With ACC cover',
      sub: 'ACC-eligible injury or accident',
      features: ['Admin fee only', 'ACC covers consultation if claim accepted', 'Claim lodged during consult', 'Same specialist team'],
      ctaLabel: 'Book now',
    },
    {
      price: 100, label: 'Visitors & non-residents',
      sub: 'Flat consultation fee',
      features: ['No NZ residency required', 'Travellers, work visa holders', 'Same specialist team', 'Payment at time of consult'],
      ctaLabel: 'Book now',
    },
  ]
  return (
    <section id="pricing" style={{ background: BRAND.bg, padding: '5rem 1.5rem' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(2rem, 4vw, 2.75rem)', color: BRAND.navy, marginBottom: '.75rem' }}>
          Clear pricing
        </h2>
        <p style={{ fontSize: '.9375rem', color: '#6B7280', marginBottom: '2.5rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          Prices in NZD. Pay by card after your consultation.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
          {tiers.map(t => (
            <div key={t.label} style={{
              background: t.highlight ? BRAND.navy : 'white',
              color: t.highlight ? 'white' : BRAND.navy,
              borderRadius: 16, padding: '1.75rem 1.5rem',
              border: t.highlight ? 'none' : '1px solid #E2E8F0',
              boxShadow: t.highlight ? '0 10px 36px rgba(13,43,69,.18)' : '0 2px 10px rgba(13,43,69,.04)',
              position: 'relative', textAlign: 'left',
              display: 'flex', flexDirection: 'column',
            }}>
              {t.highlight && (
                <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: BRAND.accent, color: 'white', fontSize: '.7rem', fontWeight: 700, padding: '4px 12px', borderRadius: 99, whiteSpace: 'nowrap', fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '.05em', textTransform: 'uppercase' }}>
                  Most patients
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '.25rem', marginBottom: '.25rem' }}>
                <span style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '-.02em' }}>${t.price}</span>
                <span style={{ fontSize: '.8125rem', opacity: .65, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>NZD</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: '.9375rem', marginBottom: '.125rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{t.label}</div>
              <div style={{ fontSize: '.8125rem', opacity: .75, marginBottom: '1.25rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{t.sub}</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem', flex: 1 }}>
                {t.features.map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', fontSize: '.8125rem', marginBottom: '.5rem', fontFamily: 'Plus Jakarta Sans, sans-serif', opacity: .9 }}>
                    <span style={{ color: t.highlight ? BRAND.tealLight : BRAND.teal, fontWeight: 700, flexShrink: 0 }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <a href={CONSULT_URL} style={{
                display: 'block', textAlign: 'center', textDecoration: 'none',
                background: t.highlight ? '#F97316' : BRAND.navy,
                color: 'white',
                padding: '.75rem', borderRadius: 99, fontWeight: 700, fontSize: '.9375rem',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                marginTop: 'auto',
              }}>{t.ctaLabel}</a>
            </div>
          ))}
        </div>
        {/* Support pointer — patients with a prescription error, referral
            question, ACC follow-up, or billing query shouldn't feel forced
            into a $65 consultation booking for a $0 admin issue. */}
        <div style={{
          background: 'white', borderRadius: 12, padding: '1rem 1.25rem',
          marginTop: '1.25rem', border: '1px solid #E2E8F0',
          fontSize: '.875rem', color: '#374151',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: '.75rem',
        }}>
          <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>💬</span>
          <div>
            <strong style={{ color: BRAND.navy, display: 'block', marginBottom: 2 }}>Prescription, referral, or admin question?</strong>
            <span>No consultation needed. <a href="/contact" style={{ color: BRAND.teal, fontWeight: 700 }}>Message our support team</a>. No charge, we reply within 24 hours.</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function ForEmployers() {
  return (
    <section style={{ background: BRAND.navy, padding: '5rem 1.5rem', textAlign: 'center' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <div style={{ display: 'inline-block', background: 'rgba(212,238,240,.15)', border: '1px solid rgba(212,238,240,.25)', borderRadius: 99, padding: '4px 14px', fontSize: '.8rem', color: BRAND.tealLight, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '1.25rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          For employers
        </div>
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', color: 'white', marginBottom: '1rem', lineHeight: 1.2 }}>
          Keep your team healthy and working
        </h2>
        <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,.7)', lineHeight: 1.75, marginBottom: '2rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          A monthly per-employee retainer gives your entire workforce unlimited access to Tere Health consultations at no cost to them. Less sick leave, faster recoveries, and a healthier team, all for a fixed, predictable cost.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
          {[
            ['Zero co-pay', 'Employees pay nothing per visit'],
            ['Fixed monthly cost', 'Predictable per-employee rate'],
            ['Instant access', 'No approvals or referrals needed'],
            ['ACC integrated', 'Injury claims handled end-to-end'],
          ].map(([title, desc]) => (
            <div key={title} style={{ background: 'rgba(255,255,255,.07)', borderRadius: 12, padding: '1.25rem 1rem' }}>
              <div style={{ fontWeight: 700, color: BRAND.tealLight, fontSize: '.9rem', marginBottom: '.375rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{title}</div>
              <div style={{ fontSize: '.8125rem', color: 'rgba(255,255,255,.8)', lineHeight: 1.5, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{desc}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Link to="/employers" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: BRAND.teal, color: 'white', textDecoration: 'none',
            padding: '.875rem 2rem', borderRadius: 99, fontWeight: 700, fontSize: '1rem',
            fontFamily: 'Plus Jakarta Sans, sans-serif', boxShadow: '0 4px 20px rgba(11,110,118,.4)',
            minHeight: 48, minWidth: 200, cursor: 'pointer',
            WebkitTapHighlightColor: 'rgba(0,0,0,.1)',
          }}>Learn about employer plans</Link>
        </div>
      </div>
    </section>
  )
}

function About() {
  return (
    <section style={{ background: 'white', padding: '5rem 1.5rem' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(2rem, 4vw, 2.75rem)', color: BRAND.navy, marginBottom: '.75rem' }}>
            A doctor's opinion, without leaving home.
          </h2>
          <p style={{ fontSize: '1rem', color: '#6B7280', lineHeight: 1.7, fontFamily: 'Plus Jakarta Sans, sans-serif', maxWidth: 620, margin: '0 auto' }}>
            Not every health worry needs a trip to a clinic, but a lot of them do need a doctor. Tere Health connects you with a New Zealand-registered doctor by video or phone for the everyday health issues that come up: infections, injuries needing an opinion, medication questions, ACC claims, the "should I be worried?" check. If your problem needs hands-on care, we'll tell you and help you get to the right place. <strong>For life-threatening emergencies, always call 111.</strong>
          </p>
        </div>
        <div style={{ background: 'rgba(11,110,118,.06)', border: '1px solid rgba(11,110,118,.2)', borderRadius: 12, padding: '1.5rem 1.75rem', fontSize: '.875rem', color: '#374151', lineHeight: 1.8, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          <div style={{ fontWeight: 700, color: BRAND.navy, marginBottom: '.5rem', fontSize: '.9375rem' }}>MCNZ Telehealth Standards</div>
          <p>Tere Health operates in accordance with the Medical Council of New Zealand's Statement on Telehealth (August 2023). All consultations are conducted by MCNZ-registered doctors holding current Annual Practising Certificates. The standard of care meets MCNZ Telehealth Standards, within the acknowledged limitations of the telehealth modality. We are not an accredited Urgent Care Clinic or an emergency department, and we do not substitute for either.</p>
          <p style={{ marginTop: '.75rem' }}>Tere Health has established pathways for arranging physical examinations when clinically required. If your presentation requires in-person assessment, your Tere provider will advise you of the most appropriate local service and arrange referral. <strong>In an emergency, always call 111.</strong></p>
          <p style={{ marginTop: '.75rem' }}>With your consent, Tere Health will share a summary of your consultation with your regular GP or health provider. If you do not have a regular provider, we will provide you with a written record of your care.</p>
        </div>
      </div>
    </section>
  )
}


function FAQ() {
  const [open, setOpen] = useState(null)
  const faqs = [
    {
      q: 'Is this ACC-funded?',
      a: 'If your condition is the result of an accident or injury and ACC accepts your claim, ACC covers the consultation. You pay a NZ$25 administrative fee to Tere for lodging your ACC claim and looking after your records. We lodge the ACC claim during the consultation. If ACC declines cover, our standard consult fee applies.',
    },
    {
      q: 'What can Tere Health treat?',
      a: 'Tere Health provides tele-emergency care across a broad range of acute presentations: infections, lacerations, sprains and musculoskeletal injuries, rashes, chest infections, UTIs, mental health concerns, medication queries, and more. Our team manages the same presentations seen in an emergency department, via your phone. We cannot treat true emergencies. If your life is at risk, call 111.',
    },
    {
      q: 'How do I pay?',
      a: 'Credit or debit card online, processed securely via Windcave. Payment is taken after your consultation is complete. ACC administrative fees are charged at the same time.',
    },
    {
      q: 'Where in NZ do you cover?',
      a: 'All of Aotearoa. We send prescriptions electronically to any community pharmacy in New Zealand. You choose the one closest to you at booking. For imaging (X-ray or ultrasound), your Tere doctor can arrange a referral to a clinic in your region as part of the consultation.',
    },
    {
      q: 'What if I submit after 8pm?',
      a: 'You can still submit any time. After-hours submissions go to the top of the queue and receive a callback from 8am the next morning. If you have an emergency, call 111 immediately. Don\'t wait.',
    },
    {
      q: 'What if it\'s an emergency?',
      a: 'Do not use Tere Health for emergencies. Call 111 immediately or go to your nearest emergency department. Our triage will redirect you to 111 if your symptoms suggest you need emergency care.',
    },
  ]
  return (
    <section id="faq" style={{ background: BRAND.bg, padding: '5rem 1.5rem' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(2rem, 4vw, 2.75rem)', color: BRAND.navy, marginBottom: '.5rem', textAlign: 'center' }}>
          Common questions
        </h2>
        <p style={{ fontSize: '1rem', color: '#374151', textAlign: 'center', marginBottom: '2.5rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          Still unsure? <a href="mailto:terehealthnz@gmail.com" style={{ color: BRAND.teal, textDecoration: 'underline', fontWeight: 600 }}>Email us</a>
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
          {faqs.map((faq, i) => (
            <div key={i} style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              <button onClick={() => setOpen(open === i ? null : i)} style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '1.125rem 1.375rem', background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, fontSize: '.9375rem', color: BRAND.navy,
                textAlign: 'left', gap: '1rem',
              }}>
                {faq.q}
                <span style={{ color: BRAND.teal, fontSize: '1.25rem', flexShrink: 0, transition: 'transform .2s', transform: open === i ? 'rotate(45deg)' : 'none' }}>+</span>
              </button>
              {open === i && (
                <div style={{ padding: '0 1.375rem 1.125rem', fontSize: '.9375rem', color: '#374151', lineHeight: 1.7, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer style={{ background: BRAND.navy, padding: '2.5rem 1.5rem', textAlign: 'center' }}>
      <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.3rem', marginBottom: '.75rem' }}>Tere Health</div>
      <div style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.55)', fontFamily: 'Plus Jakarta Sans, sans-serif', marginBottom: '1.25rem' }}>
        Tere Health Limited · Aotearoa New Zealand · <a href="mailto:terehealthnz@gmail.com" style={{ color: '#D4EEF0', textDecoration: 'underline' }}>terehealthnz@gmail.com</a>
      </div>
      <div style={{ display: 'flex', gap: '1.25rem', justifyContent: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[['Privacy', '/privacy'], ['Terms', '/terms'], ['My record', '/patient/portal'], ['Complaints', '/complaints'], ['Accessibility', '/accessibility'], ['Careers', '/careers'], ['Employers', '/employers'], ['About', '/corporate']].map(([label, href]) => (
          <Link key={label} to={href} style={{ color: 'rgba(255,255,255,.75)', textDecoration: 'none', fontSize: '.8125rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{label}</Link>
        ))}
      </div>
      <div style={{ fontSize: '.8125rem', color: 'rgba(255,255,255,.55)', fontFamily: 'Plus Jakarta Sans, sans-serif', marginBottom: '.5rem' }}>
        🇳🇿 New Zealand patients only · Services provided by MCNZ-registered doctors
      </div>
      <div style={{ fontSize: '.8125rem', color: 'rgba(255,255,255,.65)', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 600, marginBottom: '.75rem' }}>
        In an emergency, call <strong style={{ color: '#FF8080' }}>111</strong> · Mental health crisis: call or text <strong style={{ color: 'rgba(255,255,255,.85)' }}>1737</strong>
      </div>
      <div style={{ fontSize: '.75rem', color: 'rgba(212,238,240,.35)', fontFamily: 'Plus Jakarta Sans, sans-serif', borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: '.75rem', marginTop: '.25rem' }}>
        Practising in accordance with MCNZ Telehealth Standards August 2023 · All doctors MCNZ registered with current APC
      </div>
      <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', gap: '.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        {[['🩺 Provider login', '/clinician'], ['⚙️ Admin login', '/clinician/admin']].map(([label, to]) => (
          <Link key={to} to={to} style={{
            display: 'inline-flex', alignItems: 'center', gap: '.5rem',
            color: 'rgba(255,255,255,.6)', textDecoration: 'none',
            fontSize: '.8125rem', fontFamily: 'Plus Jakarta Sans, sans-serif',
            border: '1px solid rgba(255,255,255,.25)', borderRadius: 99,
            padding: '.45rem 1rem',
          }}>{label}</Link>
        ))}
      </div>
    </footer>
  )
}

export default function Landing() {
  return (
    <div style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <Nav />
      <main>
        <Hero />
        <HowItWorks />
        <Compliance />
        <Pricing />
        <ForEmployers />
        <About />
        <FAQ />
      </main>
      <Footer />
    </div>
  )
}
