// Tere GP (tere.co.nz) — "coming soon" landing. Deliberately quiet:
// the GP product is in development, nothing to sell, no partners to
// announce. Previous TereCorporate page is still reachable at /corporate.

import React from 'react'
import { Link } from 'react-router-dom'

const BRAND = { navy: '#0D2B45', teal: '#0B6E76', tealLight: '#D4EEF0' }
const AMBER_BG = '#FEF3C7'
const AMBER_BORDER = '#FDE68A'
const AMBER_FG = '#92400E'
const FF = "'Plus Jakarta Sans','Helvetica Neue',Arial,sans-serif"
const SERIF = "'Cormorant Garamond', Georgia, serif"

export default function TereGPLanding() {
  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(160deg, ${BRAND.navy} 0%, #0a3d52 100%)`,
      color: 'white',
      fontFamily: FF,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* BETA block — unmissable, no unconfirmed partner names */}
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
        Tere GP is not yet accepting enrolled patients.
      </div>

      {/* Nav */}
      <nav style={{
        padding: '18px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        maxWidth: 1100, width: '100%', margin: '0 auto', boxSizing: 'border-box',
      }}>
        <div style={{
          fontFamily: SERIF, fontStyle: 'italic', fontWeight: 600,
          fontSize: '1.6rem', color: BRAND.tealLight, letterSpacing: '.01em',
        }}>Tere GP</div>
        <div style={{ display: 'flex', gap: 20, fontSize: '.9rem', alignItems: 'center' }}>
          <Link to="/corporate" style={{ color: 'rgba(255,255,255,.75)', textDecoration: 'none' }}>
            About
          </Link>
          <a href="https://terehealth.co.nz" style={{
            color: 'white', background: BRAND.teal,
            padding: '8px 16px', borderRadius: 99,
            fontWeight: 700, textDecoration: 'none',
          }}>
            Tere Health
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px 80px', textAlign: 'center',
      }}>
        <div style={{ maxWidth: 680 }}>
          <div style={{
            display: 'inline-block',
            background: 'rgba(11,110,118,.3)',
            border: '1px solid rgba(212,238,240,.25)',
            borderRadius: 99,
            padding: '5px 14px',
            fontSize: '.8rem',
            color: BRAND.tealLight,
            letterSpacing: '.08em', textTransform: 'uppercase',
            fontWeight: 700,
            marginBottom: 28,
          }}>
            Coming 2026
          </div>

          <h1 style={{
            fontFamily: SERIF,
            fontWeight: 700,
            fontSize: 'clamp(2.5rem, 6vw, 4rem)',
            color: 'white',
            lineHeight: 1.15,
            margin: '0 0 20px',
          }}>
            A virtual general practice,<br />built for rural Aotearoa.
          </h1>

          <p style={{
            fontSize: '1.125rem',
            lineHeight: 1.65,
            color: 'rgba(255,255,255,.78)',
            maxWidth: 560,
            margin: '0 auto 36px',
          }}>
            Tere GP will offer enrolled general practice care through your phone
            or laptop. Same named GP, continuity of care, prescriptions, referrals
            and long-term condition management. No trip to town, no missed day of work.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="mailto:hello@terehealth.co.nz?subject=Tere%20GP%20interest"
              style={{
                background: BRAND.teal, color: 'white',
                padding: '14px 28px', borderRadius: 99,
                fontSize: '1rem', fontWeight: 700,
                textDecoration: 'none', fontFamily: FF,
                boxShadow: '0 6px 24px rgba(11,110,118,.5)',
              }}>
              Register interest
            </a>
            <a href="https://terehealth.co.nz"
              style={{
                background: 'rgba(255,255,255,.08)', color: 'white',
                border: '1px solid rgba(255,255,255,.2)',
                padding: '14px 24px', borderRadius: 99,
                fontSize: '1rem', fontWeight: 600,
                textDecoration: 'none', fontFamily: FF,
              }}>
              Need care today →
            </a>
          </div>

          {/* Honest footer-ish block about what's live */}
          <div style={{
            marginTop: 56,
            padding: '18px 22px',
            background: 'rgba(255,255,255,.04)',
            border: '1px solid rgba(255,255,255,.08)',
            borderRadius: 12,
            fontSize: '.875rem',
            color: 'rgba(255,255,255,.72)',
            lineHeight: 1.6,
            textAlign: 'left',
            maxWidth: 560, marginLeft: 'auto', marginRight: 'auto',
          }}>
            <div style={{ fontWeight: 700, color: 'white', marginBottom: 4 }}>
              Need care today?
            </div>
            Tere Health telehealth (acute &amp; emergent care, after-hours, ACC)
            is open today at{' '}
            <a href="https://terehealth.co.nz" style={{ color: BRAND.tealLight, fontWeight: 600 }}>
              terehealth.co.nz
            </a>. Tere GP is a separate product; both are run by Tere Health Ltd.
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '24px',
        borderTop: '1px solid rgba(255,255,255,.08)',
        fontSize: '.8125rem',
        color: 'rgba(255,255,255,.5)',
        textAlign: 'center',
        lineHeight: 1.7,
      }}>
        <div style={{ marginBottom: 4 }}>
          Tere Health Ltd · NZBN 9429052142716 · Aotearoa New Zealand
        </div>
        <div>
          <Link to="/corporate" style={{ color: 'rgba(212,238,240,.7)', textDecoration: 'none' }}>
            Corporate &amp; partnerships
          </Link>
          <span style={{ margin: '0 .5rem', color: 'rgba(255,255,255,.3)' }}>·</span>
          <a href="mailto:hello@terehealth.co.nz" style={{ color: 'rgba(212,238,240,.7)', textDecoration: 'none' }}>
            hello@terehealth.co.nz
          </a>
        </div>
      </footer>
    </div>
  )
}
