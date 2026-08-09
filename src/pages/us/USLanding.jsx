import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { US_STATES, detectStateFromIP } from '../../lib/usStates'

// Tere Care — US-facing landing at terecare.com.
// Distinct brand from Tere Health (NZ), same platform underneath.
// Cash-pay only. Non-controlled prescribing via DoseSpot/SureScripts.
// No labs, no imaging, no insurance credentialing. Eligible state
// verification happens during the triage flow, not on the landing.
//
// Palette: warmer than the NZ Tere Health navy — the "Care" naming
// wants a softer visual voice, and US-consumer telehealth peers
// (Sesame, Amazon Clinic, PlushCare) all lean warm-neutral / soft.

const C = {
  ink:      '#0F2029',
  ink2:     '#2A3B44',
  cream:    '#FBF7EF',
  cream2:   '#F1EADB',
  line:     '#DED6C4',
  teal:     '#1C6E63',
  tealDeep: '#0F4A44',
  sage:     '#B7CFB1',
  warm:     '#D97742',   // primary CTA
  warmDeep: '#B85D2C',
  gold:     '#C9A24A',
}

const START_URL = '/start'

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
      background: scrolled ? 'rgba(15,32,41,.97)' : 'transparent',
      backdropFilter: scrolled ? 'blur(10px)' : 'none',
      transition: 'background .25s',
      padding: '.875rem 1.5rem',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <a href="/" style={{ textDecoration: 'none' }}>
        <span style={{
          fontFamily: 'Cormorant Garamond, Georgia, serif',
          fontStyle: 'italic',
          color: C.cream,
          fontSize: '1.5rem',
          fontWeight: 600,
        }}>Tere Care</span>
      </a>
      <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
        <a href="#how" style={{ color: 'rgba(251,247,239,.7)', textDecoration: 'none', fontSize: '.9rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>How it works</a>
        <a href="#pricing" style={{ color: 'rgba(251,247,239,.7)', textDecoration: 'none', fontSize: '.9rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Pricing</a>
        <a href="#faq" style={{ color: 'rgba(251,247,239,.7)', textDecoration: 'none', fontSize: '.9rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>FAQ</a>
        <a href={START_URL} style={{
          background: C.warm, color: 'white', textDecoration: 'none',
          padding: '9px 20px', borderRadius: 99, fontSize: '.9rem', fontWeight: 700,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
        }}>Start visit</a>
      </div>
    </nav>
  )
}

function StartWidget() {
  const [state, setState] = useState('')
  const [detected, setDetected] = useState(null)

  useEffect(() => {
    let cancelled = false
    detectStateFromIP().then(code => {
      if (!cancelled && code) { setDetected(code); setState(code) }
    })
    return () => { cancelled = true }
  }, [])

  const canGo = !!state
  const startUrl = state ? `${START_URL}?state=${state}` : '#'

  return (
    <div style={{
      background: 'rgba(251,247,239,.08)',
      border: '1.5px solid rgba(251,247,239,.15)',
      borderRadius: 20,
      padding: '1.25rem',
      maxWidth: 520,
      margin: '0 auto 1.75rem',
      backdropFilter: 'blur(8px)',
      boxShadow: '0 12px 40px rgba(0,0,0,.2)',
    }}>
      <div style={{
        fontSize: '.75rem', letterSpacing: '.14em', textTransform: 'uppercase',
        color: C.sage, fontWeight: 700, marginBottom: '.9rem',
        fontFamily: 'Plus Jakarta Sans, sans-serif', textAlign: 'left',
      }}>Start your consultation</div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '.6rem',
        alignItems: 'stretch',
      }} className="tere-start-widget-row">
        <div style={{ position: 'relative' }}>
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            aria-label="Your state"
            style={{
              width: '100%', height: '100%',
              padding: '.95rem 2.5rem .95rem 1rem',
              fontSize: '.95rem',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              color: state ? C.ink : C.muted,
              background: C.cream,
              border: 'none', borderRadius: 12,
              appearance: 'none',
              cursor: 'pointer',
              boxSizing: 'border-box',
            }}
          >
            <option value="">Choose your state…</option>
            {US_STATES.map(s => (
              <option key={s.code} value={s.code} style={{ color: '#111' }}>{s.name}</option>
            ))}
          </select>
          <span aria-hidden style={{
            position: 'absolute', right: '.85rem', top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none', color: C.muted, fontSize: '.7rem',
          }}>▼</span>
        </div>
        <a
          href={startUrl}
          onClick={(e) => { if (!canGo) e.preventDefault() }}
          aria-disabled={!canGo}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: C.warm, color: 'white',
            textDecoration: 'none',
            padding: '0 1.5rem', borderRadius: 12,
            fontSize: '1rem', fontWeight: 700,
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            whiteSpace: 'nowrap',
            opacity: canGo ? 1 : .5,
            cursor: canGo ? 'pointer' : 'not-allowed',
            boxShadow: canGo ? '0 6px 24px rgba(217,119,66,.4)' : 'none',
            transition: 'opacity .15s',
          }}
        >
          Start &nbsp;→
        </a>
      </div>

      {detected && detected === state && (
        <div style={{
          fontSize: '.78rem', color: C.sage, marginTop: '.75rem',
          fontFamily: 'Plus Jakarta Sans, sans-serif', textAlign: 'left',
        }}>
          ✓ Detected from your connection. You can change if wrong.
        </div>
      )}
    </div>
  )
}

const stackWidgetOnMobile = `
@media (max-width: 480px) {
  .tere-start-widget-row {
    grid-template-columns: 1fr !important;
  }
  .tere-start-widget-row > a {
    padding: 1rem 1.5rem !important;
  }
}
`

function Hero() {
  return (
    <section style={{
      background: `linear-gradient(180deg, ${C.ink} 0%, ${C.tealDeep} 100%)`,
      minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '7rem 1.5rem 4rem', textAlign: 'center',
    }}>
      <div style={{ maxWidth: 720 }}>
        <div style={{
          display: 'inline-block',
          background: 'rgba(183,207,177,.15)',
          border: '1px solid rgba(183,207,177,.3)',
          borderRadius: 99, padding: '5px 14px',
          fontSize: '.8rem', color: C.sage,
          letterSpacing: '.08em', textTransform: 'uppercase',
          fontWeight: 700, marginBottom: '1.5rem',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
        }}>
          Cash pay · No insurance needed
        </div>
        <h1 style={{
          fontFamily: 'Cormorant Garamond, Georgia, serif',
          fontSize: 'clamp(2.5rem, 6vw, 4.2rem)',
          fontWeight: 600, color: 'white',
          lineHeight: 1.1, letterSpacing: '-0.015em',
          margin: '0 0 1.5rem',
        }}>
          Urgent care, on your phone.<br />
          <span style={{ color: C.sage, fontStyle: 'italic' }}>Without the wait.</span>
        </h1>
        <p style={{
          fontSize: '1.15rem', color: 'rgba(251,247,239,.8)',
          lineHeight: 1.65, margin: '0 auto 2rem', maxWidth: 560,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
        }}>
          A state-licensed provider on video in minutes. Flat cash price, no insurance forms, prescriptions sent straight to your pharmacy. Simple.
        </p>

        <StartWidget />

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '2rem' }}>
          <a href="#how" style={{
            background: 'transparent', color: C.cream, textDecoration: 'none',
            padding: '.75rem 1.5rem', borderRadius: 99,
            fontSize: '.9rem', fontWeight: 600,
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            opacity: .8,
          }}>How it works &nbsp;·</a>
          <a href="#pricing" style={{
            background: 'transparent', color: C.cream, textDecoration: 'none',
            padding: '.75rem 1.5rem', borderRadius: 99,
            fontSize: '.9rem', fontWeight: 600,
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            opacity: .8,
          }}>Pricing</a>
        </div>

        {/* Emergency safety banner — always visible on hero */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '.6rem',
          background: 'rgba(217,119,66,.12)', border: '1px solid rgba(217,119,66,.35)',
          borderRadius: 12, padding: '.6rem 1rem',
          fontSize: '.85rem', color: 'rgba(251,247,239,.85)',
          fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: 1.4,
        }}>
          <span style={{ fontWeight: 800, color: C.warm }}>Emergency?</span>
          <span>Call <strong style={{ color: 'white' }}>911</strong> or go to your nearest ER.</span>
        </div>
      </div>
    </section>
  )
}

function ValueProps() {
  const items = [
    {
      title: 'State-licensed providers',
      body: 'Every visit is with a provider actively licensed in the state you are physically located in at the time of your visit.',
    },
    {
      title: 'One flat cash price',
      body: 'No copays, no insurance forms, no surprise bills. Pay the price you see, get an itemized receipt for HSA/FSA reimbursement.',
    },
    {
      title: 'Prescriptions to your pharmacy',
      body: 'Non-controlled prescriptions sent electronically to any US pharmacy via SureScripts. Usually ready by the time you get there.',
    },
    {
      title: 'Under 30 minutes, start to finish',
      body: 'No waiting rooms, no drive time. Book, brief, video visit, done. Get back to your day.',
    },
  ]
  return (
    <section style={{ background: C.cream, padding: '5rem 1.5rem' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <h2 style={{
          fontFamily: 'Cormorant Garamond, Georgia, serif',
          fontSize: 'clamp(2rem, 4vw, 2.75rem)',
          fontWeight: 500, color: C.ink,
          lineHeight: 1.15, letterSpacing: '-0.015em',
          margin: '0 0 3rem', textAlign: 'center', maxWidth: 640, marginLeft: 'auto', marginRight: 'auto',
        }}>
          Care that respects <em style={{ color: C.teal }}>your time</em> and <em style={{ color: C.teal }}>your wallet</em>.
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1.5rem',
        }}>
          {items.map((it) => (
            <div key={it.title} style={{
              background: 'white', border: `1px solid ${C.line}`,
              borderRadius: 16, padding: '1.75rem',
            }}>
              <div style={{
                width: 40, height: 4, background: C.teal,
                borderRadius: 2, marginBottom: '1rem',
              }} />
              <h3 style={{
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '1.1rem', fontWeight: 700,
                color: C.ink, margin: '0 0 .6rem',
              }}>{it.title}</h3>
              <p style={{
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '.95rem', lineHeight: 1.55,
                color: C.ink2, margin: 0,
              }}>{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  const steps = [
    {
      n: '01',
      title: 'Tell us what’s going on',
      body: 'Answer a few questions about your symptoms. Takes ~2 minutes. We’ll flag anything that needs the emergency room right away.',
    },
    {
      n: '02',
      title: 'Pay a flat fee',
      body: 'One price, upfront. No copay, no deductible, no surprise bill later. HSA/FSA cards accepted.',
    },
    {
      n: '03',
      title: 'Video visit with a licensed provider',
      body: 'Connect over video from your phone or laptop. A real clinician, not a chatbot.',
    },
    {
      n: '04',
      title: 'Prescriptions to your pharmacy',
      body: 'If you need a prescription, it goes electronically to the pharmacy of your choice. Non-controlled medications only.',
    },
  ]
  return (
    <section id="how" style={{ background: C.cream2, padding: '5rem 1.5rem' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{
            fontSize: '.75rem', letterSpacing: '.18em', textTransform: 'uppercase',
            color: C.teal, fontWeight: 700, marginBottom: '.75rem',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
          }}>How it works</div>
          <h2 style={{
            fontFamily: 'Cormorant Garamond, Georgia, serif',
            fontSize: 'clamp(2rem, 4vw, 2.75rem)',
            fontWeight: 500, color: C.ink,
            lineHeight: 1.15, letterSpacing: '-0.015em',
            margin: 0, maxWidth: 640, marginLeft: 'auto', marginRight: 'auto',
          }}>Four steps. Usually under half an hour.</h2>
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>
          {steps.map((s) => (
            <div key={s.n} style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '1.5rem', alignItems: 'start',
              background: 'white', border: `1px solid ${C.line}`,
              borderRadius: 16, padding: '1.5rem 1.75rem',
            }}>
              <div style={{
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: '2rem', fontWeight: 500, color: C.teal,
                lineHeight: 1, letterSpacing: '-.01em', minWidth: 48,
              }}>{s.n}</div>
              <div>
                <h3 style={{
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                  fontSize: '1.1rem', fontWeight: 700,
                  color: C.ink, margin: '0 0 .4rem',
                }}>{s.title}</h3>
                <p style={{
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                  fontSize: '.95rem', lineHeight: 1.55,
                  color: C.ink2, margin: 0,
                }}>{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Pricing() {
  return (
    <section id="pricing" style={{ background: C.cream, padding: '5rem 1.5rem' }}>
      <div style={{ maxWidth: 1020, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{
            fontSize: '.75rem', letterSpacing: '.18em', textTransform: 'uppercase',
            color: C.teal, fontWeight: 700, marginBottom: '.75rem',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
          }}>Pricing</div>
          <h2 style={{
            fontFamily: 'Cormorant Garamond, Georgia, serif',
            fontSize: 'clamp(2rem, 4vw, 2.75rem)',
            fontWeight: 500, color: C.ink,
            lineHeight: 1.15, letterSpacing: '-0.015em',
            margin: 0,
          }}>Two ways to work with us.</h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.5rem', alignItems: 'stretch',
        }}>
          {/* PATIENT — pay per visit */}
          <div style={{
            background: 'white', border: `1px solid ${C.line}`,
            borderRadius: 20, padding: '2.5rem 2rem',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 12px 40px rgba(15,32,41,.06)',
          }}>
            <div style={{
              fontSize: '.7rem', letterSpacing: '.18em', textTransform: 'uppercase',
              color: C.teal, fontWeight: 700, marginBottom: '.5rem',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
            }}>For patients</div>
            <h3 style={{
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontSize: '1.6rem', fontWeight: 500, color: C.ink,
              margin: '.25rem 0 1.25rem', letterSpacing: '-.01em',
            }}>Pay per visit</h3>
            <div style={{
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontSize: '4rem', fontWeight: 500, color: C.ink,
              lineHeight: 1, letterSpacing: '-.02em', margin: '0 0 .25rem',
            }}>
              $79
            </div>
            <div style={{
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: '.9rem', color: C.ink2, marginBottom: '1.5rem',
            }}>flat cash price, per visit</div>

            <ul style={{
              listStyle: 'none', padding: 0, margin: '0 0 1.75rem',
              textAlign: 'left', fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: '.925rem', color: C.ink2, lineHeight: 1.7, flexGrow: 1,
            }}>
              <li>&nbsp;·&nbsp;Video consultation with a state-licensed provider</li>
              <li>&nbsp;·&nbsp;Non-controlled prescriptions to any US pharmacy</li>
              <li>&nbsp;·&nbsp;Itemized receipt for HSA / FSA reimbursement</li>
              <li>&nbsp;·&nbsp;No copay, no deductible, no surprise bill</li>
            </ul>

            <a href={START_URL} style={{
              display: 'block',
              background: C.warm, color: 'white', textDecoration: 'none',
              padding: '1rem', borderRadius: 12,
              fontSize: '1rem', fontWeight: 700,
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              textAlign: 'center',
            }}>Start a visit</a>
          </div>

          {/* B2B — clinic partnerships / after-hours coverage */}
          <div style={{
            background: C.tealDeep, color: C.cream,
            borderRadius: 20, padding: '2.5rem 2rem',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 12px 40px rgba(15,32,41,.15)',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: 16, right: 16,
              fontSize: '.65rem', letterSpacing: '.14em', textTransform: 'uppercase',
              color: C.gold, fontWeight: 700, background: 'rgba(201,162,74,.15)',
              padding: '4px 10px', borderRadius: 99,
              fontFamily: 'Plus Jakarta Sans, sans-serif',
            }}>After-hours coverage</div>

            <div style={{
              fontSize: '.7rem', letterSpacing: '.18em', textTransform: 'uppercase',
              color: C.sage, fontWeight: 700, marginBottom: '.5rem',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
            }}>For clinics &amp; PCP offices</div>
            <h3 style={{
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontSize: '1.6rem', fontWeight: 500, color: C.cream,
              margin: '.25rem 0 1.25rem', letterSpacing: '-.01em',
            }}>Partner with us</h3>

            <div style={{
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontSize: '2rem', fontWeight: 500, color: C.cream,
              lineHeight: 1.15, letterSpacing: '-.01em', margin: '0 0 .5rem',
              fontStyle: 'italic',
            }}>
              Follow-the-sun cover for<br/>your patient panel.
            </div>
            <div style={{
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: '.9rem', color: 'rgba(251,247,239,.75)',
              marginBottom: '1.5rem',
            }}>Our clinicians are awake when your office is closed.</div>

            <ul style={{
              listStyle: 'none', padding: 0, margin: '0 0 1.75rem',
              textAlign: 'left', fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: '.925rem', color: 'rgba(251,247,239,.85)', lineHeight: 1.7, flexGrow: 1,
            }}>
              <li>&nbsp;·&nbsp;Evening, overnight &amp; weekend cover for your patient panel</li>
              <li>&nbsp;·&nbsp;Continuity — visit notes back to you by the next morning</li>
              <li>&nbsp;·&nbsp;Keeps your patients out of the ER for non-emergencies</li>
              <li>&nbsp;·&nbsp;White-label option — patients see your practice, not ours</li>
              <li>&nbsp;·&nbsp;Custom SLA, integration, and volume pricing</li>
            </ul>

            <a href="mailto:hello@terecare.com?subject=Tere%20Care%20clinic%20partnership%20enquiry" style={{
              display: 'block',
              background: C.cream, color: C.tealDeep, textDecoration: 'none',
              padding: '1rem', borderRadius: 12,
              fontSize: '1rem', fontWeight: 700,
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              textAlign: 'center',
            }}>Contact us</a>
          </div>
        </div>

        <p style={{
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          fontSize: '.85rem', color: C.ink2, marginTop: '2rem', textAlign: 'center',
          maxWidth: 560, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.55,
        }}>
          Tere Care does not accept insurance for patient visits. We keep prices low by cutting out billing overhead — your visit is straight provider-to-patient, no middlemen.
        </p>
      </div>
    </section>
  )
}

function About() {
  return (
    <section style={{ background: C.cream, padding: '5rem 1.5rem' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{
          fontSize: '.75rem', letterSpacing: '.18em', textTransform: 'uppercase',
          color: C.teal, fontWeight: 700, marginBottom: '.75rem',
          fontFamily: 'Plus Jakarta Sans, sans-serif', textAlign: 'center',
        }}>Who you'll see</div>
        <h2 style={{
          fontFamily: 'Cormorant Garamond, Georgia, serif',
          fontSize: 'clamp(1.9rem, 4vw, 2.5rem)',
          fontWeight: 500, color: C.ink,
          lineHeight: 1.15, letterSpacing: '-0.015em',
          margin: '0 0 1.5rem', textAlign: 'center',
        }}>State-licensed providers.</h2>

        <p style={{
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          fontSize: '1.05rem', color: C.ink2, lineHeight: 1.7,
          margin: '0 0 1.25rem',
        }}>
          Every Tere Care visit is delivered by a provider actively licensed in the state you are physically located in at the time of your visit. Verified credentials, verified licenses.
        </p>
        <p style={{
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          fontSize: '1.05rem', color: C.ink2, lineHeight: 1.7,
          margin: 0,
        }}>
          No rotating offshore call center. No triage bot routing you before you see a real clinician. A licensed provider, on video, giving you real time and real answers.
        </p>
      </div>
    </section>
  )
}

function FAQ() {
  const qs = [
    {
      q: 'Do you take insurance?',
      a: 'No. Tere Care is cash-pay only. We keep the price flat and low by cutting out insurance billing entirely. We provide an itemized receipt you can submit to your HSA/FSA, or to your insurer for out-of-network reimbursement if your plan allows.',
    },
    {
      q: 'What can you treat?',
      a: 'Common urgent issues: UTIs, sinus infections, pink eye, minor skin infections, colds and flu, acid reflux, allergies, minor injuries you can see on camera, medication refills for non-controlled prescriptions, and general acute questions.',
    },
    {
      q: 'What can’t you treat?',
      a: 'Anything requiring in-person exam (broken bones, deep wounds, chest pain, breathing difficulty), controlled substances (Schedule II–V), labs, imaging, or ongoing chronic disease management. If your issue needs any of those, we’ll tell you upfront so you don’t pay for a visit that can’t help.',
    },
    {
      q: 'Are prescriptions guaranteed?',
      a: 'No. The provider will prescribe only if it’s clinically appropriate. If a prescription isn’t indicated, no prescription will be issued. The visit fee is for the provider’s time and clinical decision, not for a specific outcome.',
    },
    {
      q: 'What if I need controlled substances?',
      a: 'Tere Care does not prescribe controlled substances (opioids, benzodiazepines, ADHD stimulants, etc.). Those require in-person care or a specialist telemedicine service licensed for controlled prescribing.',
    },
    {
      q: 'Is my data private?',
      a: 'Yes. Tere Care is HIPAA-compliant and operates under a Business Associate Agreement with our hosting and AI infrastructure providers. Your medical information is encrypted in transit and at rest, and never sold or shared with third parties for marketing.',
    },
    {
      q: 'What if it’s an emergency?',
      a: 'Call 911 or go to your nearest emergency room. Telemedicine is not the right setting for chest pain, stroke symptoms, severe bleeding, suicidal thoughts, or any life-threatening condition. We’ll flag red-flag symptoms during intake and tell you to get in-person care right away.',
    },
  ]
  const [open, setOpen] = useState(null)
  return (
    <section id="faq" style={{ background: C.cream2, padding: '5rem 1.5rem' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{
          fontSize: '.75rem', letterSpacing: '.18em', textTransform: 'uppercase',
          color: C.teal, fontWeight: 700, marginBottom: '.75rem',
          fontFamily: 'Plus Jakarta Sans, sans-serif', textAlign: 'center',
        }}>FAQ</div>
        <h2 style={{
          fontFamily: 'Cormorant Garamond, Georgia, serif',
          fontSize: 'clamp(2rem, 4vw, 2.75rem)',
          fontWeight: 500, color: C.ink,
          lineHeight: 1.15, letterSpacing: '-0.015em',
          margin: '0 0 3rem', textAlign: 'center',
        }}>Common questions</h2>

        <div style={{ display: 'grid', gap: '.6rem' }}>
          {qs.map((it, i) => (
            <button
              key={it.q}
              onClick={() => setOpen(open === i ? null : i)}
              style={{
                textAlign: 'left', cursor: 'pointer',
                background: 'white', border: `1px solid ${C.line}`,
                borderRadius: 12, padding: '1.1rem 1.25rem',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '.95rem', color: C.ink,
                width: '100%',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontWeight: 700 }}>{it.q}</span>
                <span style={{ color: C.teal, fontWeight: 700, fontSize: '1.2rem', lineHeight: 1 }}>{open === i ? '−' : '+'}</span>
              </div>
              {open === i && (
                <p style={{
                  margin: '.85rem 0 0', color: C.ink2,
                  fontSize: '.925rem', lineHeight: 1.65, fontWeight: 400,
                }}>{it.a}</p>
              )}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer style={{ background: C.ink, color: 'rgba(251,247,239,.6)', padding: '3rem 1.5rem 2rem' }}>
      <div style={{
        maxWidth: 1080, margin: '0 auto',
        fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.85rem', lineHeight: 1.7,
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '2rem', marginBottom: '2rem',
        }}>
          <div>
            <div style={{
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontStyle: 'italic', color: C.cream, fontSize: '1.35rem',
              fontWeight: 600, marginBottom: '.75rem',
            }}>Tere Care</div>
            <div>Urgent telemedicine.<br />Cash pay. No insurance.</div>
          </div>
          <div>
            <div style={{ color: C.cream, fontWeight: 700, marginBottom: '.5rem' }}>Care</div>
            <div><a href={START_URL} style={{ color: 'inherit', textDecoration: 'none' }}>Start a visit</a></div>
            <div><a href="#pricing" style={{ color: 'inherit', textDecoration: 'none' }}>Pricing</a></div>
            <div><a href="#faq" style={{ color: 'inherit', textDecoration: 'none' }}>FAQ</a></div>
          </div>
          <div>
            <div style={{ color: C.cream, fontWeight: 700, marginBottom: '.5rem' }}>Legal</div>
            <div><Link to="/terms" style={{ color: 'inherit', textDecoration: 'none' }}>Terms of service</Link></div>
            <div><Link to="/privacy" style={{ color: 'inherit', textDecoration: 'none' }}>Privacy (HIPAA)</Link></div>
            <div><Link to="/accessibility" style={{ color: 'inherit', textDecoration: 'none' }}>Accessibility</Link></div>
          </div>
          <div>
            <div style={{ color: C.cream, fontWeight: 700, marginBottom: '.5rem' }}>Contact</div>
            <div><a href="mailto:hello@terecare.com" style={{ color: 'inherit', textDecoration: 'none' }}>hello@terecare.com</a></div>
            <div>Complaints: HHS Office for Civil Rights</div>
          </div>
        </div>

        <div style={{
          borderTop: `1px solid rgba(251,247,239,.1)`,
          paddingTop: '1.5rem',
          display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem',
          color: 'rgba(251,247,239,.4)', fontSize: '.8rem',
        }}>
          <div>&copy; {new Date().getFullYear()} Tere Care. All rights reserved.</div>
          <div>
            <strong style={{ color: C.warm }}>Emergency?</strong> Call 911 immediately.
          </div>
        </div>
      </div>
    </footer>
  )
}

export default function USLanding() {
  return (
    <div style={{ background: C.cream, minHeight: '100vh' }}>
      <style>{stackWidgetOnMobile}</style>
      <Nav />
      <Hero />
      <ValueProps />
      <HowItWorks />
      <Pricing />
      <About />
      <FAQ />
      <Footer />
    </div>
  )
}
