import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

const BRAND = { navy: '#0D2B45', teal: '#0B6E76', tealLight: '#D4EEF0', bg: '#F0F2F5' }

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
      background: scrolled ? 'rgba(13,43,69,0.97)' : 'transparent',
      backdropFilter: scrolled ? 'blur(8px)' : 'none',
      transition: 'background .25s',
      padding: '.875rem 1.5rem',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '.75rem' }}>
        <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.5rem', fontWeight: 600 }}>Tere Health</span>
        <span style={{ color: 'rgba(212,238,240,.45)', fontSize: '.75rem', letterSpacing: '.1em', textTransform: 'uppercase' }}>He tere, he ora</span>
      </div>
      <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
        <div className="nav-links-desktop" style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
          <a href="#pricing" style={{ color: 'rgba(255,255,255,.7)', textDecoration: 'none', fontSize: '.9rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Pricing</a>
          <a href="#faq" style={{ color: 'rgba(255,255,255,.7)', textDecoration: 'none', fontSize: '.9rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>FAQ</a>
          <Link to="/employers" style={{ color: 'rgba(255,255,255,.7)', textDecoration: 'none', fontSize: '.9rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>For employers</Link>
        </div>
        <Link to="/triage" style={{
          background: BRAND.teal, color: 'white', textDecoration: 'none',
          padding: '8px 18px', borderRadius: 99, fontSize: '.9rem', fontWeight: 700,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
        }}>Book consultation</Link>
      </div>
    </nav>
  )
}

function Hero() {
  return (
    <section style={{
      background: `linear-gradient(160deg, ${BRAND.navy} 0%, #0a3d52 100%)`,
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '6rem 1.5rem 4rem', textAlign: 'center',
    }}>
      <div style={{ maxWidth: 640 }}>
        <div style={{ display: 'inline-block', background: 'rgba(11,110,118,.3)', border: '1px solid rgba(212,238,240,.2)', borderRadius: 99, padding: '5px 14px', fontSize: '.8rem', color: BRAND.tealLight, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '1.5rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          Marlborough Sounds, New Zealand
        </div>
        <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(2.5rem, 6vw, 4rem)', fontWeight: 700, color: 'white', lineHeight: 1.15, margin: '0 0 1.25rem' }}>
          Acute telehealth care.<br />On your phone.
        </h1>
        <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,.75)', lineHeight: 1.7, margin: '0 0 2.25rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          See a New Zealand-registered doctor by video, phone, or message — from wherever you are in the Marlborough Sounds. ACC-registered. No waiting room.
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/triage" style={{
            background: BRAND.teal, color: 'white', textDecoration: 'none',
            padding: '1.1rem 2.75rem', borderRadius: 99, fontSize: '1.25rem', fontWeight: 700,
            fontFamily: 'Plus Jakarta Sans, sans-serif', boxShadow: '0 6px 32px rgba(11,110,118,.5)',
            letterSpacing: '.01em',
          }}>Start consultation</Link>
          <a href="#how-it-works" style={{
            background: 'rgba(255,255,255,.1)', color: 'white', textDecoration: 'none',
            padding: '.9rem 2rem', borderRadius: 99, fontSize: '1rem', fontWeight: 600,
            fontFamily: 'Plus Jakarta Sans, sans-serif', border: '1px solid rgba(255,255,255,.2)',
          }}>How it works</a>
        </div>
        <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', marginTop: '3rem', flexWrap: 'wrap' }}>
          {[['✓', 'ACC registered'], ['✓', 'NZ-licensed doctors'], ['✓', 'Open 7 days']].map(([tick, text]) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '.375rem', color: 'rgba(255,255,255,.65)', fontSize: '.875rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              <span style={{ color: BRAND.tealLight, fontWeight: 700 }}>{tick}</span> {text}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  const steps = [
    { n: '1', icon: '💬', title: 'Triage chat', desc: 'Our AI health assistant gathers your symptoms and history in minutes.' },
    { n: '2', icon: '📏', title: 'Vitals check', desc: 'Share a quick photo of any visible issue. Optional guided vitals if needed.' },
    { n: '3', icon: '👨‍⚕️', title: 'See the doctor', desc: 'Video, phone, or written consult — whichever suits your situation.' },
    { n: '4', icon: '✅', title: 'All sorted', desc: 'Prescriptions sent to your pharmacy. Referrals organised. ACC filed.' },
  ]
  return (
    <section id="how-it-works" style={{ background: 'white', padding: '5rem 1.5rem' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(2rem, 4vw, 2.75rem)', color: BRAND.navy, marginBottom: '.75rem' }}>
          From triage to sorted in minutes
        </h2>
        <p style={{ fontSize: '1rem', color: '#6B7280', marginBottom: '3rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          No phone tag, no waiting on hold. The whole consultation happens on your device.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.5rem' }}>
          {steps.map(s => (
            <div key={s.n} style={{ background: BRAND.bg, borderRadius: 16, padding: '2rem 1.25rem', textAlign: 'center', position: 'relative' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: BRAND.teal, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', margin: '0 auto 1rem', boxShadow: '0 4px 12px rgba(11,110,118,.25)' }}>{s.icon}</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: BRAND.navy, marginBottom: '.5rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{s.title}</div>
              <div style={{ fontSize: '.875rem', color: '#6B7280', lineHeight: 1.6, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{s.desc}</div>
              <div style={{ position: 'absolute', top: 12, right: 14, fontWeight: 800, fontSize: '2rem', color: 'rgba(11,110,118,.08)', fontFamily: 'Cormorant Garamond, serif' }}>{s.n}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Pricing() {
  const plans = [
    {
      icon: '📹', title: 'Video', subtitle: 'Face-to-face with your doctor',
      price: 65, accPrice: 25,
      features: ['Full clinical assessment', 'Prescriptions & referrals', 'ACC claims filed', 'Consultation summary emailed'],
      highlight: true,
    },
    {
      icon: '📞', title: 'Phone', subtitle: 'Audio call — no camera needed',
      price: 45, accPrice: 15,
      features: ['Talk with your doctor', 'Prescriptions & referrals', 'ACC claims filed', 'Good for low-bandwidth'],
      highlight: false,
    },
    {
      icon: '💬', title: 'Written response', subtitle: 'Within 2 hours',
      price: 25, accPrice: null,
      features: ['Doctor reviews your notes', 'Written advice to your email', 'Prescriptions if appropriate', 'No video or phone needed'],
      highlight: false,
    },
  ]
  return (
    <section id="pricing" style={{ background: BRAND.bg, padding: '5rem 1.5rem' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(2rem, 4vw, 2.75rem)', color: BRAND.navy, marginBottom: '.75rem' }}>
          Clear, upfront pricing
        </h2>
        <p style={{ fontSize: '1rem', color: '#6B7280', marginBottom: '3rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          ACC-eligible injury? Your cost is reduced to the co-payment. No surprises.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
          {plans.map(p => (
            <div key={p.title} style={{
              background: 'white', borderRadius: 16, padding: '2rem 1.5rem',
              border: p.highlight ? `2px solid ${BRAND.teal}` : '1px solid #E2E8F0',
              boxShadow: p.highlight ? '0 8px 32px rgba(11,110,118,.12)' : 'none',
              position: 'relative',
            }}>
              {p.highlight && (
                <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: BRAND.teal, color: 'white', fontSize: '.75rem', fontWeight: 700, padding: '3px 12px', borderRadius: 99, whiteSpace: 'nowrap', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  Most popular
                </div>
              )}
              <div style={{ fontSize: '2rem', marginBottom: '.75rem' }}>{p.icon}</div>
              <div style={{ fontWeight: 700, fontSize: '1.15rem', color: BRAND.navy, marginBottom: '.25rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{p.title}</div>
              <div style={{ fontSize: '.875rem', color: '#6B7280', marginBottom: '1.25rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{p.subtitle}</div>
              <div style={{ marginBottom: '1.25rem' }}>
                <span style={{ fontSize: '2.25rem', fontWeight: 800, color: BRAND.navy, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>${p.price}</span>
                {p.accPrice && (
                  <span style={{ fontSize: '.875rem', color: BRAND.teal, fontWeight: 600, marginLeft: '.5rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>or ${p.accPrice} ACC</span>
                )}
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem', textAlign: 'left' }}>
                {p.features.map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', fontSize: '.875rem', color: '#374151', marginBottom: '.5rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                    <span style={{ color: BRAND.teal, fontWeight: 700, flexShrink: 0 }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link to="/triage" style={{
                display: 'block', textAlign: 'center', textDecoration: 'none',
                background: p.highlight ? BRAND.teal : 'white',
                color: p.highlight ? 'white' : BRAND.teal,
                border: `2px solid ${BRAND.teal}`,
                padding: '.75rem', borderRadius: 99, fontWeight: 700, fontSize: '.9375rem',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
              }}>Book now</Link>
            </div>
          ))}
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
          A monthly per-employee retainer gives your entire workforce unlimited access to Tere Health consultations at no cost to them. Less sick leave, faster recoveries, and a healthier team — all for a fixed, predictable cost.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
          {[
            ['Zero co-pay', 'Employees pay nothing per visit'],
            ['Fixed monthly cost', 'Predictable per-employee rate'],
            ['Instant access', 'No approvals or referrals needed'],
            ['ACC integrated', 'Injury claims handled end-to-end'],
          ].map(([title, desc]) => (
            <div key={title} style={{ background: 'rgba(255,255,255,.07)', borderRadius: 12, padding: '1.25rem 1rem' }}>
              <div style={{ fontWeight: 700, color: BRAND.tealLight, fontSize: '.9rem', marginBottom: '.375rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{title}</div>
              <div style={{ fontSize: '.8125rem', color: 'rgba(255,255,255,.55)', lineHeight: 1.5, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{desc}</div>
            </div>
          ))}
        </div>
        <Link to="/employers" style={{
          display: 'inline-block', background: BRAND.teal, color: 'white', textDecoration: 'none',
          padding: '.875rem 2rem', borderRadius: 99, fontWeight: 700, fontSize: '1rem',
          fontFamily: 'Plus Jakarta Sans, sans-serif', boxShadow: '0 4px 20px rgba(11,110,118,.4)',
        }}>Learn about employer plans</Link>
      </div>
    </section>
  )
}

function About() {
  return (
    <section style={{ background: 'white', padding: '5rem 1.5rem' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(2rem, 4vw, 2.75rem)', color: BRAND.navy, marginBottom: '.75rem' }}>
          Built for the Sounds
        </h2>
        <p style={{ fontSize: '1rem', color: '#6B7280', lineHeight: 1.7, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          Tere Health was founded in Marlborough to address a simple problem: when you live an hour from the nearest town, a GP appointment takes a whole day. We built the service we wish existed.
        </p>
      </div>
    </section>
  )
}

function FAQ() {
  const [open, setOpen] = useState(null)
  const faqs = [
    {
      q: 'Is this ACC-funded?',
      a: 'Yes. If your condition is the result of an accident or injury, ACC covers most of the cost. You pay a small co-payment: $25 for video, $15 for phone. We handle the ACC claim for you.',
    },
    {
      q: 'What can Tere Health treat?',
      a: 'Most acute care conditions: infections, lacerations, sprains, musculoskeletal injuries, rashes, chest infections, UTIs, mental health concerns, medication queries, and more. We cannot treat true emergencies — if your life is at risk, call 111.',
    },
    {
      q: 'How do I pay?',
      a: 'Credit or debit card online, processed securely via Stripe. Payment is taken when your consultation is confirmed. ACC co-payments are charged at the same time.',
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
        <p style={{ fontSize: '1rem', color: '#6B7280', textAlign: 'center', marginBottom: '2.5rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          Still unsure? <a href="mailto:terehealthnz@gmail.com" style={{ color: BRAND.teal, textDecoration: 'none', fontWeight: 600 }}>Email us</a>
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
      <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.3rem', marginBottom: '.25rem' }}>Tere Health</div>
      <div style={{ color: 'rgba(212,238,240,.4)', fontSize: '.8rem', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '1.25rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>He tere, he ora</div>
      <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[['Privacy', '/privacy'], ['Terms', '/terms'], ['Careers', '/careers'], ['Employers', '/employers']].map(([label, href]) => (
          href.startsWith('/') ? (
            <Link key={label} to={href} style={{ color: 'rgba(255,255,255,.5)', textDecoration: 'none', fontSize: '.875rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{label}</Link>
          ) : (
            <a key={label} href={href} style={{ color: 'rgba(255,255,255,.5)', textDecoration: 'none', fontSize: '.875rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{label}</a>
          )
        ))}
      </div>
      <div style={{ fontSize: '.8125rem', color: 'rgba(255,255,255,.3)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
        Marlborough Sounds, New Zealand · <a href="https://terehealth.co.nz" style={{ color: 'rgba(255,255,255,.4)', textDecoration: 'none' }}>terehealth.co.nz</a>
      </div>
      <div style={{ marginTop: '.75rem', fontSize: '.75rem', color: 'rgba(255,255,255,.2)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
        In an emergency, call <strong style={{ color: 'rgba(255,255,255,.4)' }}>111</strong>
      </div>
      <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', gap: '.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        {[['🩺 Provider login', '/clinician'], ['⚙️ Admin login', '/clinician/admin']].map(([label, to]) => (
          <Link key={to} to={to} style={{
            display: 'inline-flex', alignItems: 'center', gap: '.5rem',
            color: 'rgba(255,255,255,.25)', textDecoration: 'none',
            fontSize: '.8125rem', fontFamily: 'Plus Jakarta Sans, sans-serif',
            border: '1px solid rgba(255,255,255,.12)', borderRadius: 99,
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
      <Hero />
      <HowItWorks />
      <Pricing />
      <ForEmployers />
      <About />
      <FAQ />
      <Footer />
    </div>
  )
}
