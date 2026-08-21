// Tere Health Ltd corporate landing (tere.co.nz).
//
// Not a patient surface — this page never asks for health information,
// exposes intake, or collects data. It sits at the parent-company level
// and points visitors at the operating brands (Tere Health NZ,
// Tere Care US, Tere Health Australia when launched).
//
// Positioning: telemedicine platform / IP holder. Useful for investors,
// insurers, regulators, hiring, and press who land on the .co.nz "root"
// domain expecting a company page rather than a booking flow.

import React from 'react'

const NAVY   = '#0D2B45'
const TEAL   = '#0B6E76'
const CREAM  = '#F7F5F0'
const FF     = 'Plus Jakarta Sans, sans-serif'

const YEAR = new Date().getFullYear()

function Jurisdiction({ flag, brand, tagline, url, live, note }) {
  return (
    <a href={live ? url : undefined}
       onClick={live ? undefined : (e) => e.preventDefault()}
       style={{
         display: 'block', textDecoration: 'none', color: 'inherit',
         background: 'white', border: '1px solid #E2E8F0', borderRadius: 14,
         padding: '1.25rem 1.5rem', cursor: live ? 'pointer' : 'default',
         transition: 'transform .15s, box-shadow .15s',
         opacity: live ? 1 : 0.65,
       }}
       onMouseEnter={(e) => { if (live) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(13,43,69,0.08)' } }}
       onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '.6rem', marginBottom: '.35rem' }}>
        <span style={{ fontSize: '1.4rem' }}>{flag}</span>
        <span style={{ fontWeight: 700, color: NAVY, fontSize: '1.05rem' }}>{brand}</span>
        {!live && (
          <span style={{ marginLeft: 'auto', fontSize: '.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#92400E', background: '#FEF3C7', padding: '2px 8px', borderRadius: 99 }}>
            Preparing
          </span>
        )}
      </div>
      <div style={{ color: '#4B5563', fontSize: '.9rem', marginBottom: '.5rem' }}>{tagline}</div>
      <div style={{ color: TEAL, fontSize: '.85rem', fontWeight: 600 }}>
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
      {/* Hero */}
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '4rem 1.5rem 2rem' }}>
        <div style={{ fontSize: '.75rem', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: TEAL, marginBottom: '1rem' }}>
          Tere Health Ltd
        </div>
        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 800, lineHeight: 1.1, margin: '0 0 1.25rem', color: NAVY }}>
          Rural telemedicine platform.<br/>
          <span style={{ color: TEAL }}>Three jurisdictions, one clinical engine.</span>
        </h1>
        <p style={{ fontSize: '1.05rem', color: '#4B5563', lineHeight: 1.55, margin: '0 0 2rem', maxWidth: 640 }}>
          Tere Health Ltd builds and operates telemedicine services purpose-built for rural and remote patients — video visits, prescribing, imaging referral, HL7 messaging, and clinician workflow — under separate operating brands in each country we serve.
        </p>
      </div>

      {/* Operating brands */}
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '0 1.5rem 3rem' }}>
        <h2 style={{ fontSize: '.8rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6B7280', margin: '0 0 1rem' }}>
          Operating brands
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          <Jurisdiction
            flag="🇳🇿"
            brand="Tere Health"
            tagline="New Zealand rural telemedicine. HDC-registered, ACC-connected, HPI-O G11238-E."
            url="https://terehealth.co.nz"
            live
          />
          <Jurisdiction
            flag="🇺🇸"
            brand="Tere Care"
            tagline="US urgent telemedicine. HIPAA-covered. Cash-pay, no insurance friction."
            url="https://terecare.com"
            live
          />
          <Jurisdiction
            flag="🇦🇺"
            brand="Tere Health Australia"
            tagline="Rural + remote telemedicine for MMM6-7 communities. AHPRA registration + AU entity formation in progress."
            live={false}
            note="Launching Q4 2026"
          />
        </div>
      </div>

      {/* Platform + compliance */}
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '1rem 1.5rem 3rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
          <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 14, padding: '1.5rem 1.75rem' }}>
            <div style={{ fontWeight: 700, color: NAVY, marginBottom: '.75rem' }}>Platform</div>
            <p style={{ color: '#4B5563', fontSize: '.9rem', lineHeight: 1.55, margin: 0 }}>
              Single codebase across all jurisdictions. Region-scoped configuration for currency, e-prescribing, licensing, consent copy, and emergency numbers. Built-in HL7 v2 receive, secure messaging, video, structured clinical notes, imaging referrals, and prescriber workflow.
            </p>
          </div>
          <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 14, padding: '1.5rem 1.75rem' }}>
            <div style={{ fontWeight: 700, color: NAVY, marginBottom: '.75rem' }}>Compliance posture</div>
            <ComplianceRow label="NZ privacy" value="Health Information Privacy Code 2020" />
            <ComplianceRow label="US privacy" value="HIPAA (AWS BAA, Sydney region)" />
            <ComplianceRow label="Clinical AI" value="AWS Bedrock (BAA-covered)" />
            <ComplianceRow label="HPI directory" value="Te Whatu Ora HPI FHIR (approved)" />
            <ComplianceRow label="Payments" value="Windcave / Stripe (region-scoped)" />
            <ComplianceRow label="HL7 messaging" value="Medical-Objects (Capricorn)" />
          </div>
        </div>
      </div>

      {/* Contact */}
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '0 1.5rem 5rem' }}>
        <div style={{ background: NAVY, color: 'white', borderRadius: 14, padding: '2rem 2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem 2rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '.75rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: '.35rem' }}>
              Contact
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>hello@terehealth.co.nz</div>
            <div style={{ fontSize: '.85rem', color: '#CBD5E1', marginTop: '.35rem' }}>Partnerships, press, and clinician enquiries.</div>
          </div>
          <div style={{ fontSize: '.8rem', color: '#94A3B8', lineHeight: 1.6 }}>
            <div>Tere Health Ltd</div>
            <div>Nelson, New Zealand</div>
            <div>NZBN 9429053197519</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid #E2E8F0', padding: '1.5rem 1.5rem', textAlign: 'center', color: '#94A3B8', fontSize: '.75rem' }}>
        © {YEAR} Tere Health Ltd. Patients: visit{' '}
        <a href="https://terehealth.co.nz" style={{ color: TEAL, textDecoration: 'none', fontWeight: 600 }}>terehealth.co.nz</a>
        {' '}(NZ) or{' '}
        <a href="https://terecare.com" style={{ color: TEAL, textDecoration: 'none', fontWeight: 600 }}>terecare.com</a>
        {' '}(US).
      </div>
    </div>
  )
}
