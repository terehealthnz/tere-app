import React from 'react'
import { Link } from 'react-router-dom'

const BRAND = { navy: '#0D2B45', teal: '#0B6E76', tealLight: '#D4EEF0', bg: '#F0F2F5' }
const FF = 'Plus Jakarta Sans, sans-serif'
const SERIF = 'Cormorant Garamond, Georgia, serif'
const CONTACT = 'terehealthnz@gmail.com'

function Nav() {
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: 'rgba(13,43,69,0.97)', backdropFilter: 'blur(8px)',
      padding: '.875rem 1.5rem',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <Link to="/" style={{ display: 'flex', alignItems: 'baseline', gap: '.75rem', textDecoration: 'none' }}>
        <span style={{ fontFamily: SERIF, fontStyle: 'italic', color: BRAND.tealLight, fontSize: '1.5rem', fontWeight: 600 }}>Tere Health</span>
      </Link>
      <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
        <a href="#pricing" className="nav-links-desktop" style={{ color: 'rgba(255,255,255,.7)', textDecoration: 'none', fontSize: '.9rem', fontFamily: FF }}>Pricing</a>
        <a href={`mailto:${CONTACT}?subject=Employer enquiry`} style={{
          background: BRAND.teal, color: 'white', textDecoration: 'none',
          padding: '8px 18px', borderRadius: 99, fontSize: '.9rem', fontWeight: 700, fontFamily: FF,
        }}>Get a quote</a>
      </div>
    </nav>
  )
}

function Hero() {
  return (
    <section style={{
      background: `linear-gradient(160deg, ${BRAND.navy} 0%, #0a3d52 100%)`,
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'flex-start',
      padding: '7rem 1.5rem 4rem', textAlign: 'center',
    }}>
      <div style={{ maxWidth: 680 }}>
        <div style={{ display: 'inline-block', background: 'rgba(11,110,118,.3)', border: '1px solid rgba(212,238,240,.2)', borderRadius: 99, padding: '5px 14px', fontSize: '.8rem', color: BRAND.tealLight, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '1.5rem', fontFamily: FF }}>
          For employers
        </div>
        <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(2.25rem, 5vw, 3.5rem)', fontWeight: 700, color: 'white', lineHeight: 1.2, margin: '0 0 1.25rem' }}>
          Healthcare for your workforce — wherever they work
        </h1>
        <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,.75)', lineHeight: 1.7, margin: '0 0 2.25rem', fontFamily: FF }}>
          Keep your team healthy and on the job with on-demand tele-emergency care — FACEM-led emergency medicine for rural and maritime New Zealand.
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href={`mailto:${CONTACT}?subject=Employer enquiry — get a quote`} style={{
            background: BRAND.teal, color: 'white', textDecoration: 'none',
            padding: '1.1rem 2.75rem', borderRadius: 99, fontSize: '1.125rem', fontWeight: 700,
            fontFamily: FF, boxShadow: '0 6px 32px rgba(11,110,118,.5)', letterSpacing: '.01em',
          }}>Get a quote</a>
          <a href="#pricing" style={{
            background: 'rgba(255,255,255,.1)', color: 'white', textDecoration: 'none',
            padding: '1.1rem 2.25rem', borderRadius: 99, fontSize: '1.125rem', fontWeight: 600,
            fontFamily: FF, border: '1px solid rgba(255,255,255,.2)',
          }}>View pricing</a>
        </div>
        <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', marginTop: '3rem', flexWrap: 'wrap' }}>
          {['ACC registered', 'NZ-licensed doctors', 'No app required'].map(text => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '.375rem', color: 'rgba(255,255,255,.65)', fontSize: '.875rem', fontFamily: FF }}>
              <span style={{ color: BRAND.tealLight, fontWeight: 700 }}>✓</span> {text}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function TheProblem() {
  const costs = [
    { icon: '⏱️', label: 'Half day lost', value: '$200–300 productivity per trip to the nearest clinic' },
    { icon: '📋', label: 'Unmanaged ACC claim', value: 'Delayed entitlements and incomplete documentation' },
    { icon: '⚠️', label: 'No occupational health coverage', value: 'H&S liability exposure and incident reporting gaps' },
    { icon: '🏥', label: 'After-hours illness', value: 'ED visit or wait until morning — neither good for anyone' },
  ]
  return (
    <section style={{ background: 'white', padding: '5rem 1.5rem' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(2rem, 4vw, 2.75rem)', color: BRAND.navy, marginBottom: '.75rem' }}>
            Your workers are far from the nearest clinic
          </h2>
          <p style={{ fontSize: '1rem', color: '#6B7280', lineHeight: 1.7, maxWidth: 560, margin: '0 auto', fontFamily: FF }}>
            When your team works in the Sounds, on farms, or on the water — a routine health issue becomes a half-day event. Here's what that costs.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
          {costs.map(c => (
            <div key={c.label} style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 16, padding: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '1.75rem', flexShrink: 0, marginTop: 2 }}>{c.icon}</div>
              <div>
                <div style={{ fontWeight: 700, color: '#991B1B', fontSize: '.9375rem', marginBottom: '.3rem', fontFamily: FF }}>{c.label}</div>
                <div style={{ fontSize: '.875rem', color: '#7F1D1D', lineHeight: 1.6, fontFamily: FF }}>{c.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  const steps = [
    { n: '1', icon: '📱', title: 'Worker opens tere.co.nz', desc: 'No app download. Works on any phone — including on 3G.' },
    { n: '2', icon: '💬', title: 'AI triage in 2 minutes', desc: 'Collects symptoms, history, ACC details, and medications automatically.' },
    { n: '3', icon: '📏', title: 'Vitals via phone camera', desc: 'Heart rate, respiratory assessment, and injury photos — no equipment needed.' },
    { n: '4', icon: '👨‍⚕️', title: 'Video or phone with a provider', desc: 'NZ-registered health provider assesses, diagnoses, and treats.' },
    { n: '5', icon: '📄', title: 'ACC lodged, prescription sent', desc: 'Claim filed, prescription sent to nearest pharmacy, medical certificate issued on the spot.' },
    { n: '6', icon: '✅', title: 'Back to work', desc: 'Total time: 15–20 minutes. No travel. No waiting room.' },
  ]
  return (
    <section style={{ background: BRAND.bg, padding: '5rem 1.5rem' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(2rem, 4vw, 2.75rem)', color: BRAND.navy, marginBottom: '.75rem' }}>
          How Tere works for employers
        </h2>
        <p style={{ fontSize: '1rem', color: '#6B7280', marginBottom: '3rem', fontFamily: FF }}>
          From first symptom to sorted — without leaving the worksite.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
          {steps.map(s => (
            <div key={s.n} style={{ background: 'white', borderRadius: 16, padding: '1.75rem 1.25rem', textAlign: 'left', position: 'relative', boxShadow: '0 2px 12px rgba(0,0,0,.06)' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: BRAND.teal, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', marginBottom: '1rem', boxShadow: '0 4px 12px rgba(11,110,118,.25)' }}>{s.icon}</div>
              <div style={{ fontWeight: 700, fontSize: '.9375rem', color: BRAND.navy, marginBottom: '.4rem', fontFamily: FF }}>{s.title}</div>
              <div style={{ fontSize: '.875rem', color: '#6B7280', lineHeight: 1.6, fontFamily: FF }}>{s.desc}</div>
              <div style={{ position: 'absolute', top: 12, right: 14, fontWeight: 800, fontSize: '2.25rem', color: 'rgba(11,110,118,.07)', fontFamily: SERIF }}>{s.n}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function WhatsIncluded() {
  const items = [
    { icon: '📋', title: 'ACC claims lodged automatically', desc: 'Filed during the consultation — no paperwork for your team.' },
    { icon: '💊', title: 'Electronic prescriptions', desc: 'Sent directly to the nearest pharmacy. Ready for collection same day.' },
    { icon: '🩻', title: 'Radiology referrals', desc: 'X-rays and imaging ordered remotely where clinically indicated.' },
    { icon: '📄', title: 'Medical certificates on the spot', desc: 'Issued instantly. No follow-up GP visit required.' },
    { icon: '📊', title: 'Monthly usage reports', desc: 'Injury trends, consultation counts, and ACC outcomes for your H&S records.' },
    { icon: '📶', title: 'Works on 3G, no app download', desc: 'Any smartphone, any browser. No IT setup, no staff training required.' },
  ]
  return (
    <section style={{ background: 'white', padding: '5rem 1.5rem' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(2rem, 4vw, 2.75rem)', color: BRAND.navy, marginBottom: '.75rem' }}>
            What's included
          </h2>
          <p style={{ fontSize: '1rem', color: '#6B7280', fontFamily: FF }}>Everything your workers need. Nothing they don't.</p>
        </div>
        <div className="employers-1col-mobile" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
          {items.map(item => (
            <div key={item.title} style={{ background: BRAND.bg, borderRadius: 16, padding: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '1.75rem', flexShrink: 0 }}>{item.icon}</div>
              <div>
                <div style={{ fontWeight: 700, color: BRAND.navy, fontSize: '.9375rem', marginBottom: '.3rem', fontFamily: FF }}>{item.title}</div>
                <div style={{ fontSize: '.875rem', color: '#6B7280', lineHeight: 1.6, fontFamily: FF }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Pricing() {
  const tiers = [
    { range: '10–29 staff',  monthly: 15, highlight: false, desc: 'Small crews and family businesses' },
    { range: '30–99 staff',  monthly: 12, highlight: true,  desc: 'Farms and maritime operators' },
    { range: '100–299 staff', monthly: 9, highlight: false, desc: 'Multi-site and larger operations' },
    { range: '300+ staff',   monthly: 7,  highlight: false, desc: 'Large employers — best value rate' },
  ]
  return (
    <section id="pricing" style={{ background: BRAND.bg, padding: '5rem 1.5rem' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(2rem, 4vw, 2.75rem)', color: BRAND.navy, marginBottom: '.75rem' }}>
          Simple, volume-based pricing
        </h2>
        <p style={{ fontSize: '1rem', color: '#6B7280', marginBottom: '.5rem', fontFamily: FF }}>
          The more staff you enrol, the lower your rate.
        </p>
        <p style={{ fontSize: '.875rem', color: '#9CA3AF', marginBottom: '3rem', fontFamily: FF }}>
          12-month contract · ACC billed separately at time of consultation
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '2.5rem' }}>
          {tiers.map(t => (
            <div key={t.range} style={{
              background: t.highlight ? BRAND.teal : 'white',
              color: t.highlight ? 'white' : BRAND.navy,
              borderRadius: 16, padding: '2rem 1.25rem', textAlign: 'center',
              boxShadow: t.highlight ? '0 8px 32px rgba(11,110,118,.35)' : '0 2px 12px rgba(0,0,0,.06)',
              position: 'relative',
            }}>
              {t.highlight && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#D97706', color: 'white', borderRadius: 99, padding: '3px 14px', fontSize: '.75rem', fontWeight: 700, fontFamily: FF, whiteSpace: 'nowrap' }}>
                  Most popular
                </div>
              )}
              <div style={{ fontSize: '.9375rem', fontWeight: 700, marginBottom: '.5rem', fontFamily: FF, color: t.highlight ? 'rgba(255,255,255,.8)' : '#6B7280' }}>{t.range}</div>
              <div style={{ fontSize: '3rem', fontWeight: 800, fontFamily: SERIF, lineHeight: 1, marginBottom: '.25rem' }}>${t.monthly}</div>
              <div style={{ fontSize: '.8125rem', color: t.highlight ? 'rgba(255,255,255,.7)' : '#9CA3AF', marginBottom: '1rem', fontFamily: FF }}>/employee/month</div>
              <div style={{ fontSize: '.8125rem', lineHeight: 1.5, color: t.highlight ? 'rgba(255,255,255,.75)' : '#6B7280', fontFamily: FF }}>{t.desc}</div>
            </div>
          ))}
        </div>

        {/* Comparison table */}
        <div style={{ background: 'white', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,.06)', marginBottom: '2rem', textAlign: 'left' }}>
          <div style={{ padding: '1.25rem 1.5rem', background: BRAND.navy }}>
            <div style={{ fontWeight: 700, color: 'white', fontFamily: FF }}>How Tere compares</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FF }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                  <th style={{ padding: '1rem 1.5rem', textAlign: 'left', fontSize: '.8125rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em' }}></th>
                  <th style={{ padding: '1rem 1.5rem', textAlign: 'center', fontSize: '.8125rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em' }}>Traditional occ health</th>
                  <th style={{ padding: '1rem 1.5rem', textAlign: 'center', fontSize: '.8125rem', fontWeight: 700, color: BRAND.teal, textTransform: 'uppercase', letterSpacing: '.05em' }}>Tere Health</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Cost', '$25–45/employee/month', '$7–15/employee/month'],
                  ['Location', 'Clinic-based only', 'Anywhere with a phone'],
                  ['Hours', 'Business hours only', 'Extended hours, 7 days'],
                  ['ACC lodgement', 'Manual, post-visit', 'Automatic during consultation'],
                  ['Medical certificates', 'Follow-up visit required', 'Issued on the spot'],
                  ['App required', 'Often yes', 'Never'],
                ].map(([label, traditional, tere]) => (
                  <tr key={label} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '.875rem 1.5rem', fontWeight: 600, color: BRAND.navy, fontSize: '.875rem' }}>{label}</td>
                    <td style={{ padding: '.875rem 1.5rem', textAlign: 'center', color: '#6B7280', fontSize: '.875rem' }}>{traditional}</td>
                    <td style={{ padding: '.875rem 1.5rem', textAlign: 'center', color: BRAND.teal, fontWeight: 600, fontSize: '.875rem' }}>{tere}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}

function WhoItsFor() {
  const sectors = [
    { icon: '🦪', label: 'Aquaculture & mussel farming' },
    { icon: '🚢', label: 'Commercial fishing & marine' },
    { icon: '⛵', label: 'Barge & maritime operators' },
    { icon: '🌾', label: 'Agriculture & horticulture' },
    { icon: '🌲', label: 'Forestry' },
    { icon: '🏕️', label: 'Tourism & hospitality' },
    { icon: '📍', label: 'Any employer with rural or remote workers' },
  ]
  return (
    <section style={{ background: 'white', padding: '5rem 1.5rem' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(2rem, 4vw, 2.75rem)', color: BRAND.navy, marginBottom: '.75rem' }}>
          Who it's for
        </h2>
        <p style={{ fontSize: '1rem', color: '#6B7280', marginBottom: '3rem', fontFamily: FF }}>
          Built for industries where getting to a clinic means losing half a working day.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem', justifyContent: 'center' }}>
          {sectors.map(s => (
            <div key={s.label} style={{ background: BRAND.bg, borderRadius: 99, padding: '.625rem 1.25rem', display: 'flex', alignItems: 'center', gap: '.5rem', fontFamily: FF, fontSize: '.9375rem', color: BRAND.navy, fontWeight: 600 }}>
              <span>{s.icon}</span> {s.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function AccAdvantage() {
  const points = [
    { icon: '💰', text: 'ACC pays Tere directly for every injury consultation' },
    { icon: '🤝', text: 'Your workers pay nothing at point of care for ACC-covered injuries' },
    { icon: '📑', text: 'You pay the monthly retainer — ACC covers the treatment cost' },
  ]
  return (
    <section style={{ background: `linear-gradient(135deg, ${BRAND.navy} 0%, #0a3d52 100%)`, padding: '5rem 1.5rem' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', background: 'rgba(11,110,118,.3)', border: '1px solid rgba(212,238,240,.2)', borderRadius: 99, padding: '5px 14px', fontSize: '.8rem', color: BRAND.tealLight, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '1.5rem', fontFamily: FF }}>
          The ACC advantage
        </div>
        <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(2rem, 4vw, 2.75rem)', color: 'white', marginBottom: '2.5rem' }}>
          ACC pays — your workers pay nothing
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left', marginBottom: '2.5rem' }}>
          {points.map(p => (
            <div key={p.text} style={{ background: 'rgba(255,255,255,.07)', borderRadius: 12, padding: '1.25rem 1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div style={{ fontSize: '1.75rem', flexShrink: 0 }}>{p.icon}</div>
              <div style={{ fontSize: '1rem', color: 'rgba(255,255,255,.9)', fontFamily: FF, lineHeight: 1.6 }}>{p.text}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '.9375rem', color: 'rgba(255,255,255,.55)', fontFamily: FF, lineHeight: 1.7 }}>
          For non-ACC consultations (illness, repeat prescriptions), the standard Tere co-payment applies. Employer plans can choose to cover this cost or pass it to the worker.
        </p>
      </div>
    </section>
  )
}

function GettingStarted() {
  const steps = [
    { n: '1', title: 'Sign a 12-month contract', desc: 'Simple agreement — we send it, you sign it digitally.' },
    { n: '2', title: 'Upload your employee list', desc: 'A simple CSV with names and email addresses. Takes 2 minutes.' },
    { n: '3', title: 'Workers access tere.co.nz', desc: 'Recognised automatically — payment step skipped for enrolled employees.' },
    { n: '4', title: 'No setup, no training, no IT', desc: "It works in any browser on any phone. Your workers won't need any help." },
  ]
  return (
    <section style={{ background: BRAND.bg, padding: '5rem 1.5rem' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(2rem, 4vw, 2.75rem)', color: BRAND.navy, marginBottom: '.75rem' }}>
          Getting started
        </h2>
        <p style={{ fontSize: '1rem', color: '#6B7280', marginBottom: '3rem', fontFamily: FF }}>
          Up and running in under 24 hours.
        </p>
        <div className="employers-1col-mobile" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem' }}>
          {steps.map(s => (
            <div key={s.n} style={{ background: 'white', borderRadius: 16, padding: '1.75rem 1.25rem', textAlign: 'left', position: 'relative', boxShadow: '0 2px 12px rgba(0,0,0,.06)' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: BRAND.teal, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1rem', marginBottom: '1rem', fontFamily: FF }}>{s.n}</div>
              <div style={{ fontWeight: 700, fontSize: '.9375rem', color: BRAND.navy, marginBottom: '.4rem', fontFamily: FF }}>{s.title}</div>
              <div style={{ fontSize: '.875rem', color: '#6B7280', lineHeight: 1.6, fontFamily: FF }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CTA() {
  return (
    <section style={{ background: 'white', padding: '5rem 1.5rem', textAlign: 'center' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(2rem, 4vw, 2.75rem)', color: BRAND.navy, marginBottom: '.75rem' }}>
          Ready to protect your workforce?
        </h2>
        <p style={{ fontSize: '1rem', color: '#6B7280', lineHeight: 1.7, marginBottom: '2rem', fontFamily: FF }}>
          Get in touch and we'll have a plan ready within 24 hours.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
          <a href={`mailto:${CONTACT}?subject=Employer enquiry`} style={{
            display: 'inline-block', background: BRAND.teal, color: 'white', textDecoration: 'none',
            padding: '1rem 2.5rem', borderRadius: 99, fontWeight: 700, fontSize: '1.0625rem',
            fontFamily: FF, boxShadow: '0 4px 20px rgba(11,110,118,.4)',
          }}>Email us — {CONTACT}</a>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer style={{ background: BRAND.navy, padding: '2.5rem 1.5rem', textAlign: 'center' }}>
      <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: '1.5rem', color: BRAND.tealLight, marginBottom: '.5rem' }}>Tere Health</div>
      <p style={{ color: 'rgba(255,255,255,.45)', fontSize: '.8125rem', fontFamily: FF, marginBottom: '1rem' }}>
        Marlborough Sounds, New Zealand · <a href="https://terehealth.co.nz" style={{ color: 'rgba(255,255,255,.4)', textDecoration: 'none' }}>terehealth.co.nz</a>
      </p>
      <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '.875rem' }}>
        {[['Home', '/'], ['Privacy', '/privacy'], ['Terms', '/terms'], ['Careers', '/careers']].map(([label, href]) => (
          <Link key={label} to={href} style={{ color: 'rgba(255,255,255,.4)', textDecoration: 'none', fontSize: '.8125rem', fontFamily: FF }}>{label}</Link>
        ))}
      </div>
      <div style={{ fontSize: '.7rem', color: 'rgba(212,238,240,.3)', fontFamily: FF }}>
        Practising in accordance with MCNZ Telehealth Standards August 2023 · All doctors MCNZ registered with current APC
      </div>
    </footer>
  )
}

export default function Employers() {
  return (
    <div style={{ fontFamily: FF }}>
      <Nav />
      <Hero />
      <TheProblem />
      <HowItWorks />
      <WhatsIncluded />
      <Pricing />
      <WhoItsFor />
      <AccAdvantage />
      <GettingStarted />
      <CTA />
      <Footer />
    </div>
  )
}
