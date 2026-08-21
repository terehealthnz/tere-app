// Tere Health Ltd corporate landing (tere.co.nz).
//
// Not a patient surface — this page never asks for health information,
// exposes intake, or collects data.
//
// Positioning (2026-08-21): NZ-built telemedicine platform, live in-market,
// with IP components (rPPG vitals estimator, HL7 v2 receive pipeline,
// consult workflow) that can be integrated into an existing GP practice
// or rural health provider's workflow. Primary audience: NZ practice
// managers + rural health leads evaluating a platform partner.

import React from 'react'

const NAVY   = '#0D2B45'
const TEAL   = '#0B6E76'
const TEAL_L = '#D4EEF0'
const CREAM  = '#F7F5F0'
const FF     = 'Plus Jakarta Sans, sans-serif'
const SERIF  = 'Cormorant Garamond, Georgia, serif'

const YEAR = new Date().getFullYear()

function IntegrationCard({ title, body }) {
  return (
    <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '1.1rem 1.25rem' }}>
      <div style={{ fontWeight: 700, color: NAVY, marginBottom: '.35rem', fontSize: '.95rem' }}>{title}</div>
      <div style={{ color: '#4B5563', fontSize: '.85rem', lineHeight: 1.55 }}>{body}</div>
    </div>
  )
}

function VitalMetric({ label, unit, note }) {
  return (
    <div style={{ background: 'rgba(11,110,118,.06)', border: `1px solid ${TEAL_L}`, borderRadius: 10, padding: '.85rem 1rem', textAlign: 'center' }}>
      <div style={{ fontWeight: 700, color: NAVY, fontSize: '.95rem' }}>{label}</div>
      <div style={{ color: TEAL, fontWeight: 700, fontSize: '.85rem', margin: '2px 0' }}>{unit}</div>
      {note && <div style={{ color: '#6B7280', fontSize: '.7rem', lineHeight: 1.35 }}>{note}</div>}
    </div>
  )
}

function Jurisdiction({ flag, brand, tagline, url, live, note }) {
  return (
    <a href={live ? url : undefined}
       onClick={live ? undefined : (e) => e.preventDefault()}
       style={{
         display: 'block', textDecoration: 'none', color: 'inherit',
         background: 'white', border: '1px solid #E2E8F0', borderRadius: 14,
         padding: '1.1rem 1.25rem', cursor: live ? 'pointer' : 'default',
         transition: 'transform .15s, box-shadow .15s',
         opacity: live ? 1 : 0.65,
       }}
       onMouseEnter={(e) => { if (live) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(13,43,69,0.08)' } }}
       onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '.6rem', marginBottom: '.3rem' }}>
        <span style={{ fontSize: '1.2rem' }}>{flag}</span>
        <span style={{ fontWeight: 700, color: NAVY, fontSize: '.95rem' }}>{brand}</span>
        {!live && (
          <span style={{ marginLeft: 'auto', fontSize: '.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#92400E', background: '#FEF3C7', padding: '2px 8px', borderRadius: 99 }}>
            Preparing
          </span>
        )}
      </div>
      <div style={{ color: '#4B5563', fontSize: '.82rem', marginBottom: '.4rem', lineHeight: 1.5 }}>{tagline}</div>
      <div style={{ color: TEAL, fontSize: '.8rem', fontWeight: 600 }}>
        {live ? `${url.replace(/^https?:\/\//, '')} →` : (note || 'Launching soon')}
      </div>
    </a>
  )
}

function ComplianceRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', padding: '.55rem 0', borderTop: '1px solid #E2E8F0' }}>
      <span style={{ color: '#4B5563', fontSize: '.85rem' }}>{label}</span>
      <span style={{ color: NAVY, fontWeight: 600, fontSize: '.85rem', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

export default function TereCorporate() {
  return (
    <div style={{ minHeight: '100dvh', background: CREAM, fontFamily: FF, color: NAVY }}>
      {/* Hero — repositioned around NZ IP licensing / integration */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '4rem 1.5rem 2.5rem' }}>
        <div style={{ fontSize: '.75rem', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: TEAL, marginBottom: '1rem' }}>
          Tere Health Ltd
        </div>
        <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(2.1rem, 5vw, 3.2rem)', fontWeight: 700, lineHeight: 1.1, margin: '0 0 1.25rem', color: NAVY }}>
          A New Zealand telemedicine platform,<br/>
          <span style={{ color: TEAL, fontStyle: 'italic' }}>ready to integrate into your practice.</span>
        </h1>
        <p style={{ fontSize: '1.05rem', color: '#4B5563', lineHeight: 1.55, margin: '0 0 1.5rem', maxWidth: 680 }}>
          Tere Health builds the clinical software behind our own telemedicine service — vitals estimation from a phone camera, HL7 messaging with community labs, structured clinical notes, prescribing, and video consult. GP practices and rural health providers can integrate these components into their existing workflow.
        </p>
        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
          <a href="mailto:hello@terehealth.co.nz?subject=Tere%20platform%20—%20integration%20enquiry" style={{ background: TEAL, color: 'white', textDecoration: 'none', padding: '10px 20px', borderRadius: 99, fontWeight: 700, fontSize: '.9rem' }}>
            Talk to us about integration
          </a>
          <a href="#demo" style={{ background: 'transparent', color: NAVY, textDecoration: 'none', padding: '10px 20px', borderRadius: 99, fontWeight: 700, fontSize: '.9rem', border: '1px solid #CBD5E1' }}>
            Watch a consultation ↓
          </a>
        </div>
      </div>

      {/* For NZ providers — the main pitch */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '1rem 1.5rem 3rem' }}>
        <div style={{ display: 'inline-block', background: TEAL_L, color: TEAL, padding: '3px 10px', borderRadius: 99, fontSize: '.7rem', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: '.75rem' }}>
          For NZ GP + rural health providers
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: NAVY, margin: '0 0 .5rem' }}>
          Plug into a proven telemedicine stack, without building it yourself.
        </h2>
        <p style={{ color: '#4B5563', fontSize: '.95rem', margin: '0 0 1.5rem', maxWidth: 680, lineHeight: 1.6 }}>
          Every component below runs in production today serving NZ patients. We can license the pieces you need, run the full platform under your brand, or partner on rural service delivery — whichever shape works for your practice.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '.75rem' }}>
          <IntegrationCard title="Video consult"     body="LiveKit-based video with AI subtitles in 20+ languages. Waiting room, screenshot capture, transcript." />
          <IntegrationCard title="Vitals estimation" body="rPPG from phone camera — HR, SpO2, respiratory rate. Under active clinical validation." />
          <IntegrationCard title="HL7 v2 receive"    body="Live Medical-Objects integration receiving lab + referral messages, auto-filing to patient chart on NHI match." />
          <IntegrationCard title="Prescribing"       body="NZ signature-exempt prescriptions to community pharmacy by email or fax, controlled-drug classification, drug-allergy cross-checks." />
          <IntegrationCard title="Imaging referral"  body="Structured PDF referrals to private radiology (RHCNZ + MMI) with region-aware clinic routing." />
          <IntegrationCard title="Structured chart"  body="Allergens, medications, conditions as first-class rows. HL7 GP-letter segments auto-import." />
          <IntegrationCard title="AI clinical notes" body="Consult transcript → structured SOAP note draft. BAA-covered, no training on patient data." />
          <IntegrationCard title="Patient identity"  body="HPI directory lookup, NHI matching, MCNZ supervision workflow, MFA for providers." />
        </div>
      </div>

      {/* Vitals estimator — technical differentiator */}
      <div style={{ background: 'white', borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '3rem 1.5rem' }}>
          <div style={{ display: 'inline-block', background: TEAL_L, color: TEAL, padding: '3px 10px', borderRadius: 99, fontSize: '.7rem', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: '.75rem' }}>
            Signature IP
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: NAVY, margin: '0 0 .5rem' }}>
            Vitals estimator — measurement from a phone camera.
          </h2>
          <p style={{ color: '#4B5563', fontSize: '.95rem', margin: '0 0 1.5rem', maxWidth: 680, lineHeight: 1.6 }}>
            Our remote photoplethysmography (rPPG) pipeline extracts pulse from subtle skin-tone changes in the video signal. No wearable, no peripheral — the patient's own phone becomes the sensor. Runs client-side, models loaded on-demand, video never leaves the device.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.6rem', marginBottom: '1.5rem' }}>
            <VitalMetric label="Heart rate"      unit="bpm"     note="~30 s scan" />
            <VitalMetric label="SpO2"            unit="%"       note="Calibrated per-device" />
            <VitalMetric label="Respiratory rate" unit="breaths/min" note="From chest micro-motion" />
            <VitalMetric label="Blood pressure"  unit="mmHg"    note="Under validation" />
          </div>
          <div style={{ background: CREAM, borderRadius: 10, padding: '1rem 1.25rem', fontSize: '.85rem', color: '#4B5563', lineHeight: 1.55 }}>
            <strong style={{ color: NAVY }}>Clinical validation status:</strong> Heart rate and SpO2 in use in production; respiratory rate ships with confidence gating. Blood pressure runs behind an HDEC-scoped research study for accuracy vs cuff standard. WAND registration on file.
          </div>
        </div>
      </div>

      {/* Demo video */}
      <div id="demo" style={{ maxWidth: 960, margin: '0 auto', padding: '3rem 1.5rem 1.5rem' }}>
        <div style={{ display: 'inline-block', background: TEAL_L, color: TEAL, padding: '3px 10px', borderRadius: 99, fontSize: '.7rem', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: '.75rem' }}>
          See it in action
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: NAVY, margin: '0 0 .5rem' }}>
          A full consultation, end to end.
        </h2>
        <p style={{ color: '#4B5563', fontSize: '.95rem', margin: '0 0 1.25rem', maxWidth: 680, lineHeight: 1.6 }}>
          From landing on the site to speaking with an emergency physician — vitals scan, triage, video consult, prescription — in under two minutes.
        </p>
        <div style={{ background: '#000', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 64px rgba(13,43,69,.25)' }}>
          <video controls preload="metadata" playsInline style={{ width: '100%', height: 'auto', display: 'block' }}>
            <source src="/videos/tere-demo.mp4" type="video/mp4" />
            Your browser doesn't support HTML5 video. <a href="/videos/tere-demo.mp4" style={{ color: TEAL_L }}>Download the video</a>.
          </video>
        </div>
      </div>

      {/* Platform + compliance side-by-side */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '3rem 1.5rem 2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
          <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 14, padding: '1.5rem 1.75rem' }}>
            <div style={{ fontWeight: 700, color: NAVY, marginBottom: '.75rem' }}>Platform architecture</div>
            <p style={{ color: '#4B5563', fontSize: '.9rem', lineHeight: 1.55, margin: 0 }}>
              Single codebase across jurisdictions. Region-scoped configuration for currency, e-prescribing, licensing, consent, emergency numbers. Server-mediated PHI access, feature-flagged rollouts, and role-based provider / admin / billing surfaces. Client-side rPPG so raw video never crosses the network.
            </p>
          </div>
          <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 14, padding: '1.5rem 1.75rem' }}>
            <div style={{ fontWeight: 700, color: NAVY, marginBottom: '.75rem' }}>Compliance posture</div>
            <ComplianceRow label="NZ privacy" value="Health Information Privacy Code 2020" />
            <ComplianceRow label="US privacy" value="HIPAA (BAA-covered, PHI hosted in-region)" />
            <ComplianceRow label="Clinical AI" value="Encrypted, BAA-covered, not used for model training" />
            <ComplianceRow label="Audit"      value="Every clinical PHI access logged and reviewable" />
          </div>
        </div>
      </div>

      {/* Deployment frames — how the same platform serves different customer shapes */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem 3rem' }}>
        <div style={{ display: 'inline-block', background: TEAL_L, color: TEAL, padding: '3px 10px', borderRadius: 99, fontSize: '.7rem', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: '.75rem' }}>
          How it's used
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: NAVY, margin: '0 0 .5rem' }}>
          One platform, several deployment shapes.
        </h2>
        <p style={{ color: '#4B5563', fontSize: '.95rem', margin: '0 0 1.5rem', maxWidth: 680, lineHeight: 1.6 }}>
          Same clinical engine underneath. Different fronts, different commercial models, different regulatory frameworks — configured per deployment.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '.75rem' }}>
          <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '.5rem', marginBottom: '.35rem' }}>
              <span style={{ fontSize: '1.1rem' }}>🇳🇿</span>
              <span style={{ fontWeight: 700, color: NAVY, fontSize: '.95rem' }}>NZ direct telehealth</span>
              <span style={{ marginLeft: 'auto', fontSize: '.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#065F46', background: '#D1FAE5', padding: '2px 8px', borderRadius: 99 }}>Live</span>
            </div>
            <div style={{ color: '#4B5563', fontSize: '.85rem', lineHeight: 1.55, marginBottom: '.5rem' }}>
              Tere Health, our own consumer telemedicine service for rural NZ. HDC-registered, ACC-connected, MOH-notified. Live proof point for everything on this page.
            </div>
            <a href="https://terehealth.co.nz" style={{ color: TEAL, fontSize: '.8rem', fontWeight: 600, textDecoration: 'none' }}>terehealth.co.nz →</a>
          </div>
          <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '.5rem', marginBottom: '.35rem' }}>
              <span style={{ fontSize: '1.1rem' }}>🏥</span>
              <span style={{ fontWeight: 700, color: NAVY, fontSize: '.95rem' }}>GP practice / PHO integration</span>
              <span style={{ marginLeft: 'auto', fontSize: '.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#92400E', background: '#FEF3C7', padding: '2px 8px', borderRadius: 99 }}>Available</span>
            </div>
            <div style={{ color: '#4B5563', fontSize: '.85rem', lineHeight: 1.55, marginBottom: '.5rem' }}>
              White-label the platform under your practice or PHO brand, or license individual components (rPPG, HL7 receive, prescribing) into your existing workflow. Data flows stay with you.
            </div>
            <a href="mailto:hello@terehealth.co.nz?subject=GP%20/%20PHO%20integration" style={{ color: TEAL, fontSize: '.8rem', fontWeight: 600, textDecoration: 'none' }}>Talk to us →</a>
          </div>
          <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '.5rem', marginBottom: '.35rem' }}>
              <span style={{ fontSize: '1.1rem' }}>🇺🇸</span>
              <span style={{ fontWeight: 700, color: NAVY, fontSize: '.95rem' }}>US B2B2C + B2B</span>
              <span style={{ marginLeft: 'auto', fontSize: '.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#92400E', background: '#FEF3C7', padding: '2px 8px', borderRadius: 99 }}>Preparing</span>
            </div>
            <div style={{ color: '#4B5563', fontSize: '.85rem', lineHeight: 1.55, marginBottom: '.5rem' }}>
              Tere Care US surface, positioned for employer-benefit / insurer partnerships (B2B2C) and direct enterprise deployment (B2B). HIPAA-covered, provider state-licensing built in.
            </div>
            <span style={{ color: '#6B7280', fontSize: '.8rem', fontStyle: 'italic' }}>Launching soon</span>
          </div>
          <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '.5rem', marginBottom: '.35rem' }}>
              <span style={{ fontSize: '1.1rem' }}>🇦🇺</span>
              <span style={{ fontWeight: 700, color: NAVY, fontSize: '.95rem' }}>AU rural + remote</span>
              <span style={{ marginLeft: 'auto', fontSize: '.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#92400E', background: '#FEF3C7', padding: '2px 8px', borderRadius: 99 }}>Preparing</span>
            </div>
            <div style={{ color: '#4B5563', fontSize: '.85rem', lineHeight: 1.55, marginBottom: '.5rem' }}>
              Tere Health Australia, planned for MMM6-7 rural + remote communities. AHPRA registration + AU entity formation in progress; Medical Director via TTMRA.
            </div>
            <span style={{ color: '#6B7280', fontSize: '.8rem', fontStyle: 'italic' }}>In preparation</span>
          </div>
        </div>
      </div>

      {/* Contact */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 1.5rem 5rem' }}>
        <div style={{ background: NAVY, color: 'white', borderRadius: 14, padding: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem 2rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '.75rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: '.35rem' }}>
              Talk to us
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>hello@terehealth.co.nz</div>
            <div style={{ fontSize: '.85rem', color: '#CBD5E1', marginTop: '.35rem' }}>Practice integration, licensing, partnerships, press.</div>
          </div>
          <div style={{ fontSize: '.8rem', color: '#94A3B8', lineHeight: 1.6 }}>
            <div>Tere Health Ltd</div>
            <div>Nelson, New Zealand</div>
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid #E2E8F0', padding: '1.5rem', textAlign: 'center', color: '#94A3B8', fontSize: '.75rem' }}>
        © {YEAR} Tere Health Ltd. NZ patients:{' '}
        <a href="https://terehealth.co.nz" style={{ color: TEAL, textDecoration: 'none', fontWeight: 600 }}>terehealth.co.nz</a>
      </div>
    </div>
  )
}
