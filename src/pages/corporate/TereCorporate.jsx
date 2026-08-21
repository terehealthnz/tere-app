// Tere Health Ltd corporate landing (tere.co.nz).
//
// Audience: NZ GP office manager or PHO evaluating a platform partner.
// Positioning: NZ-built telemedicine IP, licensable component-by-component
// or as a white-label platform, with real product screenshots as proof.
//
// Not a patient surface — no health data flows, no intake.

import React from 'react'

const NAVY   = '#0D2B45'
const NAVY_D = '#081C33'
const TEAL   = '#0B6E76'
const TEAL_L = '#D4EEF0'
const CREAM  = '#F7F5F0'
const CREAM_D = '#EFEAE0'
const AMBER  = '#B45309'
const FF     = 'Plus Jakarta Sans, sans-serif'
const SERIF  = 'Cormorant Garamond, Georgia, serif'
const YEAR   = new Date().getFullYear()

// ─── Icons ────────────────────────────────────────────────────────────────
// Inline SVG in Lucide style — 24×24, currentColor stroke. Beats emoji.
const Icon = ({ path, size = 20, color = 'currentColor', fill = 'none' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color}
       strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
       style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
    {path}
  </svg>
)
const I = {
  activity:  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  heart:     <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />,
  inbox:     <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>,
  pill:      <><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" /><path d="m8.5 8.5 7 7" /></>,
  scan:      <><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><rect x="7" y="8" width="10" height="8" rx="1" /></>,
  video:     <><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></>,
  shield:    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  network:   <><circle cx="12" cy="12" r="3" /><circle cx="19" cy="5" r="2" /><circle cx="5" cy="5" r="2" /><circle cx="19" cy="19" r="2" /><circle cx="5" cy="19" r="2" /><line x1="10.5" y1="10.5" x2="6" y2="6" /><line x1="13.5" y1="10.5" x2="18" y2="6" /><line x1="13.5" y1="13.5" x2="18" y2="18" /><line x1="10.5" y1="13.5" x2="6" y2="18" /></>,
  file:      <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="14 3 14 9 20 9" /><line x1="9" y1="14" x2="15" y2="14" /><line x1="9" y1="17" x2="15" y2="17" /></>,
  users:     <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  check:     <polyline points="20 6 9 17 4 12" />,
  arrow:     <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>,
  play:      <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" />,
}

// ─── Small reusable pieces ────────────────────────────────────────────────
const Tag = ({ children, tone = 'teal' }) => {
  const map = {
    teal:  { bg: TEAL_L, fg: TEAL },
    amber: { bg: '#FEF3C7', fg: AMBER },
    green: { bg: '#D1FAE5', fg: '#065F46' },
  }
  const m = map[tone]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: m.bg, color: m.fg,
      padding: '3px 10px', borderRadius: 99,
      fontSize: '.7rem', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
    }}>
      {children}
    </span>
  )
}

const SectionEyebrow = ({ children }) => (
  <div style={{
    fontSize: '.72rem', fontWeight: 700, letterSpacing: '.14em',
    textTransform: 'uppercase', color: TEAL, marginBottom: '.9rem',
  }}>
    {children}
  </div>
)

const SectionHeading = ({ children, style }) => (
  <h2 style={{
    fontFamily: SERIF, fontSize: 'clamp(1.75rem, 3vw, 2.35rem)',
    fontWeight: 600, lineHeight: 1.1, margin: '0 0 1rem',
    color: NAVY, letterSpacing: '-.01em',
    ...style,
  }}>
    {children}
  </h2>
)

// Bento cell — the base tile in the feature grid. Variable size + optional
// image + optional dark background.
const Bento = ({ span = 1, dark, image, imageAlt, children, style }) => (
  <div style={{
    gridColumn: `span ${span}`,
    background: dark ? NAVY : 'white',
    color: dark ? 'white' : NAVY,
    border: dark ? 'none' : '1px solid #E2E8F0',
    borderRadius: 20,
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    minHeight: 240,
    ...style,
  }}>
    {image && (
      <div style={{
        background: dark ? NAVY_D : CREAM_D,
        padding: '1.25rem 1.25rem 0',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        minHeight: 200,
      }}>
        <img src={image} alt={imageAlt}
             style={{
               maxWidth: '100%', maxHeight: 220,
               borderRadius: '10px 10px 0 0',
               boxShadow: '0 20px 40px rgba(13,43,69,.15)',
               display: 'block',
             }} />
      </div>
    )}
    <div style={{ padding: '1.5rem 1.75rem', flex: 1 }}>
      {children}
    </div>
  </div>
)

const BentoTitle = ({ icon, children, dark }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.6rem' }}>
    <span style={{ color: dark ? TEAL_L : TEAL }}><Icon path={I[icon]} size={20} /></span>
    <span style={{ fontWeight: 700, fontSize: '1rem', color: dark ? 'white' : NAVY }}>{children}</span>
  </div>
)

const BentoBody = ({ children, dark }) => (
  <div style={{
    color: dark ? 'rgba(255,255,255,.75)' : '#4B5563',
    fontSize: '.875rem', lineHeight: 1.55,
  }}>
    {children}
  </div>
)

// ─── Page ─────────────────────────────────────────────────────────────────
export default function TereCorporate() {
  return (
    <div style={{
      minHeight: '100dvh', background: CREAM, fontFamily: FF, color: NAVY,
      // Progressive enhancement — subtle noise texture on cream for warmth.
      backgroundImage: 'radial-gradient(circle at 30% 20%, rgba(11,110,118,.04) 0, transparent 40%), radial-gradient(circle at 70% 80%, rgba(13,43,69,.03) 0, transparent 40%)',
    }}>

      {/* Slim top-of-page brand bar — no nav, no CTAs. Just presence. */}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '1.5rem 1.5rem 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '.6rem' }}>
          <span style={{ fontFamily: SERIF, fontStyle: 'italic', color: NAVY, fontSize: '1.5rem', fontWeight: 700 }}>Tere</span>
          <span style={{ fontSize: '.72rem', letterSpacing: '.14em', textTransform: 'uppercase', color: '#6B7280', fontWeight: 700 }}>Health Ltd</span>
        </div>
        <a href="mailto:hello@terehealth.co.nz" style={{ color: NAVY, textDecoration: 'none', fontSize: '.85rem', fontWeight: 600, opacity: .8 }}>
          hello@terehealth.co.nz
        </a>
      </div>

      {/* HERO — asymmetric bento. Copy left, product screenshot right. */}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '4rem 1.5rem 3.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 1fr)', gap: '3rem', alignItems: 'center' }}>
          <div>
            <Tag tone="green">
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 99, background: '#059669' }} /> Live in NZ
            </Tag>
            <h1 style={{
              fontFamily: SERIF, fontSize: 'clamp(2.4rem, 5.5vw, 4rem)',
              fontWeight: 600, lineHeight: 1.02, margin: '1.25rem 0 1.25rem',
              color: NAVY, letterSpacing: '-.02em',
            }}>
              The clinical software behind rural&nbsp;telehealth,{' '}
              <span style={{ color: TEAL, fontStyle: 'italic' }}>ready for your practice.</span>
            </h1>
            <p style={{
              fontSize: '1.075rem', color: '#4B5563', lineHeight: 1.55,
              margin: '0 0 1.75rem', maxWidth: 540,
            }}>
              Tere builds the platform behind our own NZ telemedicine service — vitals from a phone camera, HL7 messaging with community labs, structured prescribing, video consult. Available for GP practices and PHOs to integrate.
            </p>
            <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
              <a href="mailto:hello@terehealth.co.nz?subject=Book%20a%20call%20—%20Tere%20platform&body=Hi%20Tere%20team%2C%0A%0AI'd%20like%20to%20book%20a%2020-minute%20call%20to%20discuss%20how%20the%20platform%20could%20fit%20our%20practice.%0A%0APractice%2FPHO%3A%0AName%3A%0ARole%3A%0APreferred%20time%3A%0A%0AThanks." style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: NAVY, color: 'white', textDecoration: 'none',
                padding: '13px 22px', borderRadius: 12, fontWeight: 700, fontSize: '.9rem',
              }}>
                Book a call <Icon path={I.arrow} size={16} />
              </a>
              <a href="#demo" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'transparent', color: NAVY, textDecoration: 'none',
                padding: '13px 22px', borderRadius: 12, fontWeight: 700, fontSize: '.9rem',
                border: '1px solid #CBD5E1',
              }}>
                <Icon path={I.play} size={12} color={TEAL} fill={TEAL} /> Watch demo
              </a>
            </div>
          </div>

          {/* Hero screenshot — real product proof, off-set for visual depth */}
          <div style={{ position: 'relative', minHeight: 480 }}>
            <div style={{
              position: 'absolute', top: 20, left: 40, right: 0, bottom: 0,
              background: TEAL_L, borderRadius: 20, transform: 'rotate(2deg)',
            }} />
            <img src="/corporate/hl7-abnormal.png" alt="Provider view of an inbound HL7 lab report with abnormal detection"
                 style={{
                   position: 'relative', width: '100%', height: 'auto',
                   borderRadius: 20, boxShadow: '0 30px 60px rgba(13,43,69,.20)',
                   border: '1px solid #E2E8F0',
                 }} />
            {/* Little floating annotation to hint at what the reader is looking at */}
            <div style={{
              position: 'absolute', bottom: -20, left: -20,
              background: 'white', borderRadius: 12, padding: '.6rem .85rem',
              boxShadow: '0 12px 30px rgba(13,43,69,.15)',
              display: 'flex', alignItems: 'center', gap: '.6rem',
              fontSize: '.75rem', fontWeight: 600, color: NAVY,
            }}>
              <span style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 8, padding: '2px 8px', fontWeight: 700, fontSize: '.68rem' }}>⚠ ABNORMAL</span>
              HL7 message auto-parsed, flagged, filed to chart on NHI match.
            </div>
          </div>
        </div>
      </div>

      {/* Thin metric strip — quiet proof under the hero */}
      <div style={{ borderTop: '1px solid rgba(13,43,69,.08)', borderBottom: '1px solid rgba(13,43,69,.08)', background: 'rgba(255,255,255,.4)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '1rem 1.5rem', display: 'flex', flexWrap: 'wrap', gap: '.5rem 2rem', alignItems: 'center', justifyContent: 'center', color: '#4B5563', fontSize: '.78rem', fontWeight: 600 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon path={I.check} size={14} color={TEAL} /> HDC registered</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon path={I.check} size={14} color={TEAL} /> HIPAA + BAA-covered</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon path={I.check} size={14} color={TEAL} /> HPI directory connected</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon path={I.check} size={14} color={TEAL} /> HL7 v2 receive live</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon path={I.check} size={14} color={TEAL} /> rPPG in production</span>
        </div>
      </div>

      {/* BENTO — what we've built. Variable-size tiles, one large with the inbox screenshot. */}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '5rem 1.5rem 3rem' }}>
        <SectionEyebrow>What we've built</SectionEyebrow>
        <SectionHeading>Everything a rural telemedicine service needs — component by component.</SectionHeading>
        <p style={{ color: '#4B5563', fontSize: '1rem', margin: '0 0 2.5rem', maxWidth: 620, lineHeight: 1.6 }}>
          Each of these runs in production today, serving NZ patients. License the pieces that fit your workflow, or run the full platform under your brand.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '1rem' }}>
          {/* Row 1 — large HL7 tile with screenshot */}
          <Bento span={4} image="/corporate/hl7-inbox.png" imageAlt="Provider inbox showing inbound lab results, some flagged abnormal">
            <BentoTitle icon="inbox">Lab &amp; referral inbox</BentoTitle>
            <BentoBody>
              Inbound results and letters land in the provider inbox, matched to the right patient chart and flagged when out-of-range. No manual scanning of PDFs, no chasing paper.
            </BentoBody>
          </Bento>

          <Bento span={2} dark>
            <BentoTitle icon="scan" dark>Vitals from a phone camera</BentoTitle>
            <BentoBody dark>
              Patients hold up their phone and get heart rate, oxygen saturation, and respiratory rate in about 30 seconds. No wearable, no peripheral.
            </BentoBody>
            <div style={{ marginTop: '1.25rem', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['HR', 'SpO2', 'RR', 'BP'].map(v => (
                <span key={v} style={{ background: 'rgba(212,238,240,.15)', color: TEAL_L, border: `1px solid rgba(212,238,240,.3)`, borderRadius: 8, padding: '4px 10px', fontSize: '.72rem', fontWeight: 700 }}>{v}</span>
              ))}
            </div>
          </Bento>

          {/* Row 2 — 3 medium tiles */}
          <Bento span={2}>
            <BentoTitle icon="video">Video consult</BentoTitle>
            <BentoBody>End-to-end video visits with live subtitles in 20+ languages. Built for patients on rural connections and older devices.</BentoBody>
          </Bento>

          <Bento span={2}>
            <BentoTitle icon="pill">Prescribing</BentoTitle>
            <BentoBody>Send scripts straight to community pharmacies. Controlled-drug handling and drug-allergy safety checks built in.</BentoBody>
          </Bento>

          <Bento span={2}>
            <BentoTitle icon="file">Structured chart</BentoTitle>
            <BentoBody>Allergies, medications, and conditions as clean structured records — not free-text. Populated from inbound letters where possible.</BentoBody>
          </Bento>

          {/* Row 3 — 3 medium tiles */}
          <Bento span={2}>
            <BentoTitle icon="network">Imaging referrals</BentoTitle>
            <BentoBody>One-click referral to the nearest private imaging clinic, routed by patient postcode.</BentoBody>
          </Bento>

          <Bento span={2}>
            <BentoTitle icon="activity">Clinical notes</BentoTitle>
            <BentoBody>AI-assisted note drafts from the consultation, ready for the clinician to review and sign. Never trained on patient data.</BentoBody>
          </Bento>

          <Bento span={2}>
            <BentoTitle icon="users">Identity &amp; safety</BentoTitle>
            <BentoBody>Verified clinician identity, patient matching, and clinical governance workflows appropriate to the jurisdiction.</BentoBody>
          </Bento>
        </div>
      </div>

      {/* DARK FULL-BLEED — signature IP + demo video */}
      <div id="demo" style={{ background: NAVY, color: 'white', padding: '5rem 0 5rem' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)', gap: '3rem', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '.72rem', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: TEAL_L, marginBottom: '.9rem' }}>
                Signature IP
              </div>
              <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(1.9rem, 3.3vw, 2.6rem)', fontWeight: 600, lineHeight: 1.05, margin: '0 0 1.25rem', letterSpacing: '-.01em' }}>
                Vitals from a phone camera.<br/>
                <span style={{ color: TEAL_L, fontStyle: 'italic' }}>~30 seconds. No wearable.</span>
              </h2>
              <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,.78)', lineHeight: 1.6, margin: '0 0 1.75rem', maxWidth: 480 }}>
                The patient's own phone becomes the sensor. Meaningful readings without a wearable, without asking rural patients to buy hardware they don't have.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '.75rem', marginBottom: '1.5rem' }}>
                {[
                  { label: 'Heart rate',      unit: 'bpm',              note: 'In production' },
                  { label: 'SpO2',            unit: '%',                note: 'In production' },
                  { label: 'Respiratory rate', unit: 'breaths / min',   note: 'Confidence-gated' },
                  { label: 'Blood pressure',  unit: 'mmHg',             note: 'Under validation' },
                ].map(v => (
                  <div key={v.label} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(212,238,240,.15)', borderRadius: 10, padding: '.85rem 1rem' }}>
                    <div style={{ fontSize: '.85rem', fontWeight: 700 }}>{v.label}</div>
                    <div style={{ fontSize: '.75rem', color: TEAL_L, fontWeight: 600, marginTop: 2 }}>{v.unit}</div>
                    <div style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.55)', marginTop: 4 }}>{v.note}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.6)', lineHeight: 1.55 }}>
                In production for heart rate and oxygen saturation. Blood pressure under ongoing clinical validation.
              </div>
            </div>

            {/* Demo video */}
            <div>
              <div style={{ background: '#000', borderRadius: 16, overflow: 'hidden', boxShadow: '0 30px 60px rgba(0,0,0,.35)', border: '1px solid rgba(255,255,255,.08)' }}>
                <video controls preload="metadata" playsInline poster="/corporate/hl7-abnormal.png"
                       style={{ width: '100%', height: 'auto', display: 'block' }}>
                  <source src="/videos/tere-demo.mp4" type="video/mp4" />
                </video>
              </div>
              <div style={{ marginTop: '.85rem', fontSize: '.8rem', color: 'rgba(255,255,255,.6)', textAlign: 'center' }}>
                A full patient consultation, end to end — under two minutes.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* DEPLOYMENT FRAMES — 4 pill-style rows, not a card grid */}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '5rem 1.5rem 3rem' }}>
        <SectionEyebrow>Deployment shapes</SectionEyebrow>
        <SectionHeading>Same clinical engine, different frames.</SectionHeading>
        <p style={{ color: '#4B5563', fontSize: '1rem', margin: '0 0 2.5rem', maxWidth: 620, lineHeight: 1.6 }}>
          One platform underneath — different fronts, commercial models, and regulatory frameworks configured per deployment.
        </p>

        {[
          { icon: 'heart',   title: 'NZ direct telehealth',            desc: 'Our own consumer telemedicine service for rural NZ patients — the live proof point for everything above.', status: 'live', link: 'https://terehealth.co.nz' },
          { icon: 'network', title: 'GP practice / PHO integration',   desc: 'Run the full platform under your brand, or integrate the parts that fill gaps in what you already use. Your patient data stays with you.', status: 'available', link: 'mailto:hello@terehealth.co.nz?subject=Book%20a%20call%20—%20Practice%20integration' },
          { icon: 'shield',  title: 'US enterprise partnerships',       desc: 'Positioned for employer and insurer partnerships in the United States. Not yet open to the public.', status: 'preparing' },
          { icon: 'users',   title: 'Australia rural + remote',         desc: 'Planned for rural and remote communities. Entity formation and clinical registration in progress.', status: 'preparing' },
        ].map((row, i) => (
          <div key={row.title} style={{
            display: 'flex', alignItems: 'center', gap: '1.25rem',
            background: 'white', border: '1px solid #E2E8F0', borderRadius: 16,
            padding: '1.25rem 1.5rem', marginBottom: '.75rem',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: TEAL_L, color: TEAL,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Icon path={I[row.icon]} size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.2rem' }}>
                <span style={{ fontWeight: 700, color: NAVY, fontSize: '1rem' }}>{row.title}</span>
                {row.status === 'live'     && <Tag tone="green">Live</Tag>}
                {row.status === 'available' && <Tag tone="amber">Available</Tag>}
                {row.status === 'preparing' && <Tag tone="amber">Preparing</Tag>}
              </div>
              <div style={{ color: '#4B5563', fontSize: '.875rem', lineHeight: 1.55 }}>{row.desc}</div>
            </div>
            {row.link && (
              <a href={row.link} style={{
                color: TEAL, fontSize: '.85rem', fontWeight: 700,
                textDecoration: 'none', flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                {row.link.startsWith('mailto') ? 'Talk to us' : row.link.replace(/^https?:\/\//, '')} <Icon path={I.arrow} size={14} />
              </a>
            )}
          </div>
        ))}
      </div>

      {/* COMPLIANCE — pill row, not a table-in-a-card */}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '2rem 1.5rem 3rem' }}>
        <SectionEyebrow>Compliance posture</SectionEyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
          {[
            { label: 'NZ privacy',  value: 'Health Information Privacy Code 2020' },
            { label: 'US privacy',  value: 'HIPAA, BAA-covered, PHI in-region' },
            { label: 'Clinical AI', value: 'Encrypted, not used for model training' },
            { label: 'Audit',       value: 'Every clinical PHI access logged' },
          ].map(c => (
            <div key={c.label} style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '1rem 1.15rem' }}>
              <div style={{ fontSize: '.68rem', color: '#6B7280', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: '.85rem', color: NAVY, fontWeight: 600, lineHeight: 1.4 }}>{c.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CONTACT — full-bleed navy */}
      <div style={{ background: NAVY, color: 'white', padding: '4.5rem 0' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 1.5rem', display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '2.5rem', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '.72rem', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: TEAL_L, marginBottom: '.9rem' }}>
              Let's talk
            </div>
            <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(2rem, 3.6vw, 2.9rem)', fontWeight: 600, lineHeight: 1.05, margin: '0 0 1.25rem', letterSpacing: '-.01em' }}>
              Bring rural-grade telehealth into&nbsp;your practice.
            </h2>
            <p style={{ color: 'rgba(255,255,255,.75)', fontSize: '1rem', margin: '0 0 1.75rem', maxWidth: 520, lineHeight: 1.55 }}>
              Whether you're evaluating a full white-label deployment or want to plug a single component (rPPG, HL7 receive, prescribing) into what you already run — we'd like to hear how it might fit.
            </p>
            <a href="mailto:hello@terehealth.co.nz?subject=Tere%20platform%20—%20practice%20integration" style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              background: 'white', color: NAVY, textDecoration: 'none',
              padding: '14px 24px', borderRadius: 12, fontWeight: 700, fontSize: '.95rem',
            }}>
              hello@terehealth.co.nz <Icon path={I.arrow} size={16} />
            </a>
          </div>
          <div style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(212,238,240,.15)', borderRadius: 16, padding: '1.75rem 2rem' }}>
            <div style={{ fontSize: '.7rem', color: TEAL_L, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '.5rem' }}>Tere Health Ltd</div>
            <div style={{ fontSize: '.95rem', color: 'white', fontWeight: 600, lineHeight: 1.6 }}>
              Nelson, New Zealand<br/>
              NZ-registered clinical software company<br/>
              Operating <a href="https://terehealth.co.nz" style={{ color: TEAL_L, fontWeight: 600, textDecoration: 'none' }}>terehealth.co.nz</a>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: NAVY_D, color: 'rgba(255,255,255,.5)', padding: '1.25rem', textAlign: 'center', fontSize: '.75rem' }}>
        © {YEAR} Tere Health Ltd. NZ patients: <a href="https://terehealth.co.nz" style={{ color: TEAL_L, textDecoration: 'none', fontWeight: 600 }}>terehealth.co.nz</a>
      </div>
    </div>
  )
}
