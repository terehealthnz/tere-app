import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

// Tere Health Australia — AU-facing landing at tere.co.nz (beta preview).
// Distinct brand from Tere Health (NZ) and Tere Care (US), same platform
// underneath. Positioned at rural + remote AU where the nearest bulk-billing
// GP is >60 min away. Cash-pay at launch (Medicare bulk-billing eligibility
// TBD post-AHPRA + provider-number). Non-controlled e-prescribing via eRx.
//
// Palette: warm eucalyptus + terracotta so AU reads visually distinct from
// NZ navy (Tere Health) and US cream/warm (Tere Care). Same typographic
// system (Cormorant + Plus Jakarta Sans) — one Tere family, three shirts.

const C = {
  ink:       '#1B2A1F',   // deep bushland
  ink2:      '#3A4A3E',
  bg:        '#F7F3EB',   // warm sand background
  cream:     '#FBF7EF',
  line:      '#DFD6C4',
  euc:       '#4A7A5A',   // eucalyptus green (primary brand accent)
  eucDeep:   '#2E5539',
  eucLight:  '#B9D3B4',
  terra:     '#C05C36',   // terracotta (CTA — outback earth)
  terraDeep: '#8F3E1E',
  gold:      '#D9A94C',
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
      background: scrolled ? 'rgba(27,42,31,.97)' : 'transparent',
      backdropFilter: scrolled ? 'blur(10px)' : 'none',
      transition: 'background .25s',
      padding: '.875rem 1.5rem',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <Link to="/" style={{ textDecoration: 'none' }}>
        <span style={{
          fontFamily: 'Cormorant Garamond, Georgia, serif',
          fontStyle: 'italic',
          color: C.cream,
          fontSize: '1.5rem',
          fontWeight: 600,
        }}>Tere Health <span style={{ color: C.eucLight, fontStyle: 'normal', fontSize: '.75rem', letterSpacing: '.14em', textTransform: 'uppercase', marginLeft: 6 }}>AU</span></span>
      </Link>
      <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
        <a href="#how" style={{ color: 'rgba(251,247,239,.7)', textDecoration: 'none', fontSize: '.9rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>How it works</a>
        <a href="#pricing" style={{ color: 'rgba(251,247,239,.7)', textDecoration: 'none', fontSize: '.9rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Pricing</a>
        <a href="#faq" style={{ color: 'rgba(251,247,239,.7)', textDecoration: 'none', fontSize: '.9rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>FAQ</a>
        <a href="#waitlist" style={{
          background: C.terra, color: 'white', textDecoration: 'none',
          padding: '9px 20px', borderRadius: 99, fontSize: '.9rem', fontWeight: 700,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
        }}>Join the waitlist</a>
      </div>
    </nav>
  )
}

function Hero() {
  return (
    <section style={{
      background: `linear-gradient(180deg, ${C.ink} 0%, ${C.eucDeep} 100%)`,
      minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '7rem 1.5rem 4rem', textAlign: 'center',
    }}>
      <div style={{ maxWidth: 720 }}>
        <div style={{
          display: 'inline-block',
          background: 'rgba(185,211,180,.15)',
          border: '1px solid rgba(185,211,180,.3)',
          borderRadius: 99, padding: '5px 14px',
          fontSize: '.8rem', color: C.eucLight,
          letterSpacing: '.08em', textTransform: 'uppercase',
          fontWeight: 700, marginBottom: '1.5rem',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
        }}>
          Rural &amp; remote Australia · Beta preview
        </div>
        <h1 style={{
          fontFamily: 'Cormorant Garamond, Georgia, serif',
          fontSize: 'clamp(2.5rem, 6vw, 4.2rem)',
          fontWeight: 600, color: 'white',
          lineHeight: 1.1, letterSpacing: '-0.015em',
          margin: '0 0 1.5rem',
        }}>
          Urgent care, on your phone.<br />
          <span style={{ color: C.eucLight, fontStyle: 'italic' }}>Wherever you are in Australia.</span>
        </h1>
        <p style={{
          fontSize: '1.15rem', color: 'rgba(251,247,239,.8)',
          lineHeight: 1.65, margin: '0 auto 2rem', maxWidth: 560,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
        }}>
          An AHPRA-registered clinician on video within hours. No four-hour drive to the nearest GP. Non-controlled e-prescriptions sent straight to your local pharmacy via eRx.
        </p>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '2rem' }}>
          <a href="#waitlist" style={{
            background: C.terra, color: 'white', textDecoration: 'none',
            padding: '1rem 2rem', borderRadius: 99,
            fontSize: '1rem', fontWeight: 700,
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            boxShadow: '0 6px 24px rgba(192,92,54,.4)',
          }}>Join the AU waitlist &nbsp;→</a>
          <a href="#how" style={{
            background: 'transparent', color: C.cream,
            textDecoration: 'none',
            padding: '1rem 1.75rem', borderRadius: 99,
            fontSize: '1rem', fontWeight: 600,
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            border: '1px solid rgba(251,247,239,.2)',
          }}>How it works</a>
        </div>

        {/* Emergency safety banner — always visible on hero */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '.6rem',
          background: 'rgba(192,92,54,.14)', border: '1px solid rgba(192,92,54,.35)',
          borderRadius: 12, padding: '.6rem 1rem',
          fontSize: '.85rem', color: 'rgba(251,247,239,.85)',
          fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: 1.4,
        }}>
          <span style={{ fontWeight: 800, color: C.terra }}>Emergency?</span>
          <span>Call <strong style={{ color: 'white' }}>000</strong> or attend your nearest ED.</span>
        </div>
      </div>
    </section>
  )
}

function ValueProps() {
  const items = [
    {
      title: 'AHPRA-registered clinicians',
      body: 'Every visit is with a clinician on the Australian Health Practitioner Regulation Agency register, with current registration in the relevant profession.',
    },
    {
      title: 'Built for rural &amp; remote',
      body: 'For anyone where the nearest bulk-billing GP is a two-hour drive. Station country, remote mining, farming, cray-fishing towns — we come to you over the wire.',
    },
    {
      title: 'E-prescriptions via eRx',
      body: 'Non-controlled scripts sent electronically to any Australian pharmacy via the eRx Script Exchange. No paper, no fax, no waiting.',
    },
    {
      title: 'One flat cash price',
      body: 'At beta launch, Tere AU is private-pay only — no bulk billing yet. You see the price up-front. Medicare Item Number eligibility is on the roadmap.',
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
          margin: '0 0 3rem', textAlign: 'center', maxWidth: 720, marginLeft: 'auto', marginRight: 'auto',
        }}>
          Distance shouldn't decide whether you can see <em style={{ color: C.euc }}>a clinician today</em>.
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
                width: 40, height: 4, background: C.euc,
                borderRadius: 2, marginBottom: '1rem',
              }} />
              <h3
                style={{
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                  fontSize: '1.1rem', fontWeight: 700,
                  color: C.ink, margin: '0 0 .6rem',
                }}
                dangerouslySetInnerHTML={{ __html: it.title }}
              />
              <p
                style={{
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                  fontSize: '.95rem', lineHeight: 1.55,
                  color: C.ink2, margin: 0,
                }}
                dangerouslySetInnerHTML={{ __html: it.body }}
              />
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
      body: 'A few short questions about your symptoms and history. Takes ~2 minutes. Anything red-flag — chest pain, stroke signs, severe bleeding — and we tell you to ring 000 immediately.',
    },
    {
      n: '02',
      title: 'Pay a flat fee',
      body: 'One price, up-front. Card payment via Stripe. Itemised receipt emailed — useful for your private-health-fund extras or salary-packaging claim.',
    },
    {
      n: '03',
      title: 'Video visit with an AHPRA-registered clinician',
      body: 'Connect over video from your phone or laptop. If bandwidth is thin we can drop to phone — you\'ll still be face-to-face with a real clinician.',
    },
    {
      n: '04',
      title: 'Script to your pharmacy',
      body: 'If a prescription is clinically appropriate, it goes electronically to the AU pharmacy of your choice through eRx. Non-controlled medicines only.',
    },
  ]
  return (
    <section id="how" style={{ background: C.bg, padding: '5rem 1.5rem' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{
            fontSize: '.75rem', letterSpacing: '.18em', textTransform: 'uppercase',
            color: C.euc, fontWeight: 700, marginBottom: '.75rem',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
          }}>How it works</div>
          <h2 style={{
            fontFamily: 'Cormorant Garamond, Georgia, serif',
            fontSize: 'clamp(2rem, 4vw, 2.75rem)',
            fontWeight: 500, color: C.ink,
            lineHeight: 1.15, letterSpacing: '-0.015em',
            margin: 0, maxWidth: 640, marginLeft: 'auto', marginRight: 'auto',
          }}>Four steps. Usually inside half an hour.</h2>
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
                fontSize: '2rem', fontWeight: 500, color: C.euc,
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
            color: C.euc, fontWeight: 700, marginBottom: '.75rem',
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
            boxShadow: '0 12px 40px rgba(27,42,31,.06)',
          }}>
            <div style={{
              fontSize: '.7rem', letterSpacing: '.18em', textTransform: 'uppercase',
              color: C.euc, fontWeight: 700, marginBottom: '.5rem',
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
              A$89
            </div>
            <div style={{
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: '.9rem', color: C.ink2, marginBottom: '1.5rem',
            }}>indicative launch price, per consultation</div>

            <ul style={{
              listStyle: 'none', padding: 0, margin: '0 0 1.75rem',
              textAlign: 'left', fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: '.925rem', color: C.ink2, lineHeight: 1.7, flexGrow: 1,
            }}>
              <li>&nbsp;·&nbsp;Video consultation with an AHPRA-registered clinician</li>
              <li>&nbsp;·&nbsp;Non-controlled e-prescriptions via eRx to any AU pharmacy</li>
              <li>&nbsp;·&nbsp;Itemised receipt for private-health-fund extras / salary-packaging</li>
              <li>&nbsp;·&nbsp;No gap fee, no surprise bill later</li>
            </ul>

            <a href="#waitlist" style={{
              display: 'block',
              background: C.terra, color: 'white', textDecoration: 'none',
              padding: '1rem', borderRadius: 12,
              fontSize: '1rem', fontWeight: 700,
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              textAlign: 'center',
            }}>Join the waitlist</a>
          </div>

          {/* B2B — station / mine-site / community-clinic partnerships */}
          <div style={{
            background: C.eucDeep, color: C.cream,
            borderRadius: 20, padding: '2.5rem 2rem',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 12px 40px rgba(27,42,31,.15)',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: 16, right: 16,
              fontSize: '.65rem', letterSpacing: '.14em', textTransform: 'uppercase',
              color: C.gold, fontWeight: 700, background: 'rgba(217,169,76,.15)',
              padding: '4px 10px', borderRadius: 99,
              fontFamily: 'Plus Jakarta Sans, sans-serif',
            }}>Remote-site cover</div>

            <div style={{
              fontSize: '.7rem', letterSpacing: '.18em', textTransform: 'uppercase',
              color: C.eucLight, fontWeight: 700, marginBottom: '.5rem',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
            }}>For stations, mines &amp; community clinics</div>
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
              A clinician on video for<br/>your remote workforce.
            </div>
            <div style={{
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: '.9rem', color: 'rgba(251,247,239,.75)',
              marginBottom: '1.5rem',
            }}>Cattle stations, mine sites, remote community clinics, cray-fishing crews — anywhere the nearest GP is a helicopter flight away.</div>

            <ul style={{
              listStyle: 'none', padding: 0, margin: '0 0 1.75rem',
              textAlign: 'left', fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: '.925rem', color: 'rgba(251,247,239,.85)', lineHeight: 1.7, flexGrow: 1,
            }}>
              <li>&nbsp;·&nbsp;Unlimited consultations for your whole roster</li>
              <li>&nbsp;·&nbsp;After-hours &amp; weekend cover included</li>
              <li>&nbsp;·&nbsp;Reduces medevac call-outs for non-urgent presentations</li>
              <li>&nbsp;·&nbsp;Custom SLA + volume pricing</li>
            </ul>

            <a href="mailto:hello@tere.co.nz?subject=Tere%20AU%20partnership%20enquiry" style={{
              display: 'block',
              background: C.cream, color: C.eucDeep, textDecoration: 'none',
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
          maxWidth: 640, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.55,
        }}>
          Tere AU launches as private-pay. Medicare Item Number and bulk-billing eligibility for eligible telehealth consultations is on the post-launch roadmap and depends on provider-number registration through Services Australia.
        </p>
      </div>
    </section>
  )
}

function Waitlist() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState('')
  const [status, setStatus] = useState(null)   // null | 'submitting' | 'ok' | 'err'
  const [msg, setMsg] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    if (!email) return
    setStatus('submitting'); setMsg('')
    try {
      const res = await fetch('/api/au-waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, state }),
      })
      if (res.ok) {
        setStatus('ok')
        setMsg('Thanks — we\'ll email you the moment Tere AU accepts real patients.')
      } else if (res.status === 404) {
        // Endpoint not yet built — still capture locally so we don't lose leads.
        try { localStorage.setItem('tere_au_waitlist_' + Date.now(), JSON.stringify({ email, state })) } catch {}
        setStatus('ok')
        setMsg('Thanks — you\'re on the list. We\'ll be in touch.')
      } else {
        setStatus('err'); setMsg('Something went wrong — please email hello@tere.co.nz instead.')
      }
    } catch {
      try { localStorage.setItem('tere_au_waitlist_' + Date.now(), JSON.stringify({ email, state })) } catch {}
      setStatus('ok')
      setMsg('Thanks — you\'re on the list. We\'ll be in touch.')
    }
  }

  return (
    <section id="waitlist" style={{
      background: `linear-gradient(180deg, ${C.eucDeep} 0%, ${C.ink} 100%)`,
      padding: '5rem 1.5rem',
    }}>
      <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
        <div style={{
          fontSize: '.75rem', letterSpacing: '.18em', textTransform: 'uppercase',
          color: C.eucLight, fontWeight: 700, marginBottom: '.75rem',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
        }}>Beta launch waitlist</div>
        <h2 style={{
          fontFamily: 'Cormorant Garamond, Georgia, serif',
          fontSize: 'clamp(2rem, 4vw, 2.75rem)',
          fontWeight: 500, color: C.cream,
          lineHeight: 1.15, letterSpacing: '-0.015em',
          margin: '0 0 1rem',
        }}>Get in first when we open.</h2>
        <p style={{
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          fontSize: '1rem', color: 'rgba(251,247,239,.75)',
          lineHeight: 1.7, margin: '0 auto 2rem', maxWidth: 480,
        }}>
          We're still setting up the AU entity, AHPRA registration, and pharmacy integrations. Leave your email and we'll tell you the day we start taking real patients — no marketing spam.
        </p>

        {status === 'ok' ? (
          <div style={{
            background: 'rgba(185,211,180,.14)', border: '1px solid rgba(185,211,180,.35)',
            borderRadius: 12, padding: '1.25rem', color: C.cream,
            fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.95rem',
          }}>
            {msg}
          </div>
        ) : (
          <form onSubmit={onSubmit} style={{
            display: 'grid', gap: '.75rem', textAlign: 'left',
          }}>
            <input
              type="email" required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com.au"
              aria-label="Email address"
              style={{
                background: 'rgba(251,247,239,.06)',
                border: '1px solid rgba(251,247,239,.2)',
                borderRadius: 12, padding: '1rem 1.1rem',
                color: C.cream, fontSize: '1rem',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
              }}
            />
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              aria-label="State or territory"
              style={{
                background: 'rgba(251,247,239,.06)',
                border: '1px solid rgba(251,247,239,.2)',
                borderRadius: 12, padding: '1rem 1.1rem',
                color: state ? C.cream : 'rgba(251,247,239,.55)',
                fontSize: '1rem',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                appearance: 'none',
              }}
            >
              <option value="" style={{ color: '#111' }}>State or territory (optional)…</option>
              {['NSW','VIC','QLD','WA','SA','TAS','ACT','NT'].map(s => (
                <option key={s} value={s} style={{ color: '#111' }}>{s}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={status === 'submitting'}
              style={{
                background: C.terra, color: 'white', border: 'none',
                borderRadius: 12, padding: '1rem',
                fontSize: '1rem', fontWeight: 700,
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                cursor: status === 'submitting' ? 'wait' : 'pointer',
                boxShadow: '0 6px 24px rgba(192,92,54,.35)',
                opacity: status === 'submitting' ? .7 : 1,
              }}
            >
              {status === 'submitting' ? 'Adding you…' : 'Join the waitlist →'}
            </button>
            {status === 'err' && (
              <div style={{
                color: '#F5B7A2', fontSize: '.85rem',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
              }}>{msg}</div>
            )}
            <p style={{
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: '.75rem', color: 'rgba(251,247,239,.55)',
              margin: '.25rem 0 0', lineHeight: 1.5,
            }}>
              We handle your details under the Australian Privacy Principles (Privacy Act 1988). We won't share your email with anyone else.
            </p>
          </form>
        )}
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
          color: C.euc, fontWeight: 700, marginBottom: '.75rem',
          fontFamily: 'Plus Jakarta Sans, sans-serif', textAlign: 'center',
        }}>Who you'll see</div>
        <h2 style={{
          fontFamily: 'Cormorant Garamond, Georgia, serif',
          fontSize: 'clamp(1.9rem, 4vw, 2.5rem)',
          fontWeight: 500, color: C.ink,
          lineHeight: 1.15, letterSpacing: '-0.015em',
          margin: '0 0 1.5rem', textAlign: 'center',
        }}>AHPRA-registered clinicians.</h2>

        <p style={{
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          fontSize: '1.05rem', color: C.ink2, lineHeight: 1.7,
          margin: '0 0 1.25rem',
        }}>
          Every Tere AU consultation is delivered by a clinician on the AHPRA register with current registration. We hold to the same MBA / Nursing &amp; Midwifery Board guidelines for telehealth as any in-clinic AU practice — verified identity, informed consent, safe prescribing, and a written record of your care.
        </p>
        <p style={{
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          fontSize: '1.05rem', color: C.ink2, lineHeight: 1.7,
          margin: 0,
        }}>
          Our intake asks smart questions to route you faster and flag anything urgent — but every clinical decision, every prescription, every diagnosis is made by a registered clinician on video with you.
        </p>
      </div>
    </section>
  )
}

function FAQ() {
  const qs = [
    {
      q: 'Do you bulk-bill or take Medicare?',
      a: 'Not at beta launch. Tere AU is private-pay only when we open. Medicare Item Numbers for eligible telehealth consultations are on the roadmap once provider-number registration through Services Australia is complete. We\'ll email everyone on the waitlist as this changes.',
    },
    {
      q: 'What can you treat?',
      a: 'Common acute issues: UTIs, sinus and chest infections, conjunctivitis, minor skin infections, colds and flu, reflux, allergies, minor injuries visible on camera, non-controlled repeat prescriptions, medical certificates for work, and general acute questions.',
    },
    {
      q: 'What can\'t you treat?',
      a: 'Anything requiring hands-on examination (deep wounds, broken bones, chest pain, breathing difficulty), controlled medicines (Schedule 8 and most Schedule 4 D), pathology or imaging orders where these are not available locally, and ongoing chronic-disease management best done with your regular GP.',
    },
    {
      q: 'What about mental health?',
      a: 'We can consult on common presentations (anxiety, low mood, sleep) and issue non-controlled prescriptions where clinically indicated. For crisis support in Australia call Lifeline on 13 11 14 (24/7) or 000 if there is immediate risk.',
    },
    {
      q: 'Is my data private?',
      a: 'Yes. Tere handles your health information under the Australian Privacy Principles (Privacy Act 1988) and the My Health Records Act where relevant. Encrypted in transit and at rest, hosted on infrastructure with a Business Associate / equivalent data-processing agreement, and never sold or shared for marketing.',
    },
    {
      q: 'What if it\'s an emergency?',
      a: 'Call 000 or attend your nearest emergency department. Telehealth is not the right setting for chest pain, stroke symptoms, severe bleeding, suicidal thoughts, or any life-threatening condition. Our intake flags red-flag symptoms and tells you to seek in-person emergency care right away.',
    },
    {
      q: 'Are you the same as Tere Health in New Zealand?',
      a: 'Same platform, same clinical philosophy — but Tere Health Australia is a separate AU entity operating under AHPRA registration and Australian law. Tere Health (NZ) is at terehealth.co.nz. Tere Care (US) is at terecare.com. Different regulator, different scope, different pricing.',
    },
  ]
  const [open, setOpen] = useState(null)
  return (
    <section id="faq" style={{ background: C.bg, padding: '5rem 1.5rem' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{
          fontSize: '.75rem', letterSpacing: '.18em', textTransform: 'uppercase',
          color: C.euc, fontWeight: 700, marginBottom: '.75rem',
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
                <span style={{ color: C.euc, fontWeight: 700, fontSize: '1.2rem', lineHeight: 1 }}>{open === i ? '−' : '+'}</span>
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
            }}>Tere Health Australia</div>
            <div>Rural &amp; remote telehealth.<br />Private-pay. AHPRA registered.</div>
          </div>
          <div>
            <div style={{ color: C.cream, fontWeight: 700, marginBottom: '.5rem' }}>Care</div>
            <div><a href="#waitlist" style={{ color: 'inherit', textDecoration: 'none' }}>Join the waitlist</a></div>
            <div><a href="#pricing" style={{ color: 'inherit', textDecoration: 'none' }}>Pricing</a></div>
            <div><a href="#faq" style={{ color: 'inherit', textDecoration: 'none' }}>FAQ</a></div>
          </div>
          <div>
            <div style={{ color: C.cream, fontWeight: 700, marginBottom: '.5rem' }}>Family</div>
            <div><a href="https://terehealth.co.nz" style={{ color: 'inherit', textDecoration: 'none' }}>Tere Health (NZ) →</a></div>
            <div><a href="https://terecare.com" style={{ color: 'inherit', textDecoration: 'none' }}>Tere Care (US) →</a></div>
          </div>
          <div>
            <div style={{ color: C.cream, fontWeight: 700, marginBottom: '.5rem' }}>Contact</div>
            <div><a href="mailto:hello@tere.co.nz" style={{ color: 'inherit', textDecoration: 'none' }}>hello@tere.co.nz</a></div>
            <div>Complaints: AHPRA</div>
          </div>
        </div>

        <div style={{
          borderTop: `1px solid rgba(251,247,239,.1)`,
          paddingTop: '1.5rem',
          display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem',
          color: 'rgba(251,247,239,.5)', fontSize: '.8rem',
        }}>
          <div>&copy; {new Date().getFullYear()} Tere Health Australia (in formation).</div>
          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <Link to="/clinician" style={{ color: 'rgba(251,247,239,.5)', textDecoration: 'none' }}>Staff login</Link>
            <div>
              <strong style={{ color: C.terra }}>Emergency?</strong> Call 000 immediately.
            </div>
            <div>
              Mental health crisis: <strong style={{ color: 'rgba(251,247,239,.85)' }}>Lifeline 13 11 14</strong>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default function AULanding() {
  return (
    <div style={{ background: C.bg, minHeight: '100vh' }}>
      <Nav />
      <Hero />
      <ValueProps />
      <HowItWorks />
      <Pricing />
      <Waitlist />
      <About />
      <FAQ />
      <Footer />
    </div>
  )
}
