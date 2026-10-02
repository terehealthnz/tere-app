// Tere GP (tere.co.nz) — "coming soon · beta" landing page.
//
// Replaces TereCorporate as the default render for the CORP region
// (tere.co.nz) now that the domain is being repurposed as Tere GP, the
// new enrolled-and-capitated general practice product alongside the
// existing Tere Health acute/urgent-care service on terehealth.co.nz.
//
// Status: the GP product is NOT built yet. This page is a holding slot
// with a prominent BETA block so anyone landing here from PHO contacts,
// Triple O conversations, or Marlborough PHO outreach sees "in dev,
// here's what it will be, here's where to get real care today."
//
// The previous corporate landing content (Tere Health Ltd corporate +
// tech-IP pitch, task #285) now lives at /corporate on BOTH domains —
// terehealth.co.nz/corporate and tere.co.nz/corporate serve the same
// TereCorporate component. See App.jsx routing + PwaRoot.
//
// Pentest scope note: no new API surface here — static page, uses the
// same React/Vercel shell Blacklock cert covers. When Tere GP actually
// gets its enrolment flow + GMS claims + PMS integration, those WILL
// need a fresh pentest before patients land.

import React from 'react'
import { Link } from 'react-router-dom'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const TEAL_LIGHT = '#D4EEF0'
const AMBER_BG = '#FEF3C7'
const AMBER_BORDER = '#FDE68A'
const AMBER_FG = '#92400E'
const FF = "'Plus Jakarta Sans','Helvetica Neue',Arial,sans-serif"

export default function TereGPLanding() {
  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(180deg, ${NAVY} 0%, #0A1F33 100%)`,
      color: 'white',
      fontFamily: FF,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* BETA BLOCK — unmissable at the top. Keeps the Blacklock pentest
          and marketing honest while the GP product is in dev. */}
      <div style={{
        background: `linear-gradient(90deg, ${AMBER_BG} 0%, ${AMBER_BORDER} 100%)`,
        borderBottom: `1px solid ${AMBER_BORDER}`,
        padding: '12px 20px',
        textAlign: 'center',
        color: AMBER_FG,
        fontSize: '.875rem',
        lineHeight: 1.5,
        fontWeight: 600,
      }}>
        <strong style={{ letterSpacing: '.05em' }}>BETA · IN DEVELOPMENT.</strong>{' '}
        Tere GP is not yet accepting enrolled patients. Launching in partnership with Marlborough PHO (Kimi Hauora Wairau).
      </div>

      {/* Nav strip */}
      <div style={{
        padding: '18px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        maxWidth: 1100, width: '100%', margin: '0 auto', boxSizing: 'border-box',
      }}>
        <div style={{
          fontFamily: 'Georgia, serif', fontStyle: 'italic',
          fontSize: '1.6rem', color: TEAL_LIGHT, letterSpacing: '.02em',
        }}>Tere GP</div>
        <div style={{ display: 'flex', gap: 18, fontSize: '.875rem' }}>
          <Link to="/corporate" style={{ color: 'rgba(255,255,255,.85)', textDecoration: 'none' }}>
            About Tere Health Ltd
          </Link>
          <a href="https://terehealth.co.nz" style={{ color: 'rgba(255,255,255,.85)', textDecoration: 'none' }}>
            Urgent care →
          </a>
        </div>
      </div>

      {/* Hero */}
      <div style={{
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px 60px',
      }}>
        <div style={{ maxWidth: 720, textAlign: 'center' }}>
          <div style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: 999,
            background: 'rgba(127,196,200,.15)',
            border: '1px solid rgba(127,196,200,.3)',
            fontSize: '.75rem', fontWeight: 700, letterSpacing: '.1em',
            color: TEAL_LIGHT, textTransform: 'uppercase',
            marginBottom: 24,
          }}>
            Coming to Marlborough
          </div>

          <h1 style={{
            fontFamily: 'Georgia, serif',
            fontWeight: 400,
            fontSize: 'clamp(2.25rem, 5vw, 3.5rem)',
            lineHeight: 1.1,
            margin: '0 0 24px',
            letterSpacing: '-.5pt',
          }}>
            A virtual general practice built for rural Aotearoa.
          </h1>

          <p style={{
            fontSize: '1.0625rem',
            lineHeight: 1.65,
            color: 'rgba(255,255,255,.78)',
            maxWidth: 580,
            margin: '0 auto 36px',
          }}>
            Tere GP will offer enrolled general practice care through your phone or
            laptop — same named GP, continuity of care, prescriptions, referrals and
            long-term condition management. No trip to town, no missed day of work.
          </p>

          {/* What this is vs isn't */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
            textAlign: 'left',
            marginBottom: 40,
          }}>
            <InfoCard label="Status" value="In development · 2026" />
            <InfoCard label="PHO" value="Marlborough PHO (Kimi Hauora Wairau)" />
            <InfoCard label="Workforce" value="RNZCGP-registered GPs via Triple O" />
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="mailto:hello@terehealth.co.nz?subject=Tere%20GP%20interest"
              style={{
                background: TEAL, color: 'white', border: 'none',
                padding: '14px 24px', borderRadius: 12,
                fontSize: '.9375rem', fontWeight: 700,
                textDecoration: 'none', fontFamily: FF,
                boxShadow: '0 4px 20px rgba(11,110,118,.35)',
              }}>
              Register interest
            </a>
            <a href="https://terehealth.co.nz"
              style={{
                background: 'transparent', color: TEAL_LIGHT,
                border: '1px solid rgba(212,238,240,.3)',
                padding: '14px 24px', borderRadius: 12,
                fontSize: '.9375rem', fontWeight: 600,
                textDecoration: 'none', fontFamily: FF,
              }}>
              Need urgent care today →
            </a>
          </div>

          {/* Honest footer about what's live now */}
          <div style={{
            marginTop: 44,
            padding: '14px 18px',
            background: 'rgba(255,255,255,.04)',
            border: '1px solid rgba(255,255,255,.08)',
            borderRadius: 10,
            fontSize: '.8125rem',
            color: 'rgba(255,255,255,.6)',
            lineHeight: 1.55,
            textAlign: 'left',
          }}>
            <strong style={{ color: 'rgba(255,255,255,.85)' }}>Already open:</strong>{' '}
            Tere Health urgent-care telehealth (acute illness, injuries, after-hours,
            ACC) is live now at{' '}
            <a href="https://terehealth.co.nz" style={{ color: TEAL_LIGHT }}>
              terehealth.co.nz
            </a>. Tere GP is a separate product in development; both are run by Tere
            Health Ltd.
          </div>
        </div>
      </div>

      {/* Footer strip */}
      <div style={{
        padding: '20px 24px',
        borderTop: '1px solid rgba(255,255,255,.08)',
        fontSize: '.75rem',
        color: 'rgba(255,255,255,.4)',
        textAlign: 'center',
        lineHeight: 1.6,
      }}>
        Tere Health Ltd · NZBN 9429052142716 · Blenheim, Aotearoa New Zealand<br />
        <Link to="/corporate" style={{ color: 'rgba(212,238,240,.6)' }}>
          Corporate &amp; partnership information
        </Link>
        {' · '}
        <a href="mailto:hello@terehealth.co.nz" style={{ color: 'rgba(212,238,240,.6)' }}>
          hello@terehealth.co.nz
        </a>
      </div>
    </div>
  )
}

function InfoCard({ label, value }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,.04)',
      border: '1px solid rgba(127,196,200,.15)',
      borderRadius: 10,
      padding: '12px 14px',
    }}>
      <div style={{
        fontSize: '.6875rem', fontWeight: 700,
        letterSpacing: '.1em', textTransform: 'uppercase',
        color: TEAL_LIGHT, marginBottom: 4,
      }}>{label}</div>
      <div style={{ fontSize: '.875rem', color: 'rgba(255,255,255,.85)', lineHeight: 1.4 }}>
        {value}
      </div>
    </div>
  )
}
