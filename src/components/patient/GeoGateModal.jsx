// GeoGateModal — shown when a patient hits "Get started" on TereIntro.
//
// Flow:
//   1. Immediately hit /api/geo-check (server-side ipapi.co lookup).
//   2. If country_code !== 'NZ' → block card, with a "Retry" button so a
//      patient who genuinely just disabled a VPN can try again.
//   3. If country_code === 'NZ' → attestation card asking the patient to
//      confirm they are physically in NZ right now. Continue button enabled
//      only once the checkbox is ticked.
//   4. Modal returns { attestedNz, ipCountry, ipHash } via onAccept so the
//      caller can pass them into createConsultation for storage.
//
// Lookup failure (ipapi.co timeout / 429) is treated as "unknown" — we still
// show the attestation card and let the patient through if they attest. IP
// alone isn't the legal signal anyway; the attestation is.

import React, { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF = 'Plus Jakarta Sans, sans-serif'

export default function GeoGateModal({ onAccept, onCancel }) {
  const [phase, setPhase] = useState('checking')  // checking | attest | block | error
  const [country, setCountry] = useState(null)
  const [ipHash, setIpHash] = useState(null)
  const [attested, setAttested] = useState(false)

  useEffect(() => { check() }, [])
  async function check() {
    setPhase('checking')
    try {
      const r = await apiFetch('/api/geo-check')
      const j = await r.json()
      setCountry(j.country_code || null)
      setIpHash(j.ip_hash || null)
      if (j.allowed) setPhase('attest')
      else if (j.country_code == null) setPhase('attest')  // lookup failed → attestation-only
      else setPhase('block')
    } catch {
      // Endpoint unreachable — allow through on attestation alone.
      setCountry(null); setIpHash(null); setPhase('attest')
    }
  }

  function proceed() {
    if (!attested) return
    onAccept({
      attestedNz:   true,
      ipCountry:    country,
      ipHash:       ipHash,
      attestedAt:   new Date().toISOString(),
    })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(13,43,69,.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem', fontFamily: FF,
    }}>
      <div style={{
        background: 'white', borderRadius: 16, maxWidth: 460, width: '100%',
        padding: '1.75rem 1.5rem', boxShadow: '0 20px 60px rgba(0,0,0,.35)',
      }}>
        {phase === 'checking' && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ fontWeight: 700, color: NAVY, marginBottom: 6 }}>Checking your location…</div>
            <div style={{ color: '#6B7280', fontSize: '.875rem' }}>One moment.</div>
          </div>
        )}

        {phase === 'block' && (
          <>
            <div style={{ fontSize: '2rem', textAlign: 'center', marginBottom: 8 }}>🌏</div>
            <div style={{ fontWeight: 800, color: NAVY, fontSize: '1.15rem', textAlign: 'center', marginBottom: 10 }}>
              Available in New Zealand only
            </div>
            <div style={{ color: '#374151', fontSize: '.925rem', lineHeight: 1.55, marginBottom: 14 }}>
              Tere Health can only see patients who are physically in Aotearoa New Zealand at the time of the consultation. Our physicians are registered under NZ law (MCNZ) and our indemnity cover is scoped to NZ care.
            </div>
            {country && (
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '.7rem .9rem', fontSize: '.85rem', color: '#4B5563', marginBottom: 14 }}>
                We're seeing your connection as <strong>{country}</strong>. If you're using a VPN or corporate network that routes traffic overseas, please disable it and try again.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={check} style={{
                flex: 1, background: TEAL, color: 'white', border: 'none',
                padding: '.7rem 1rem', borderRadius: 10, fontWeight: 700,
                cursor: 'pointer', fontFamily: FF, fontSize: '.9rem',
              }}>I'm in NZ — retry</button>
              {onCancel && (
                <button onClick={onCancel} style={{
                  background: 'none', color: '#6B7280', border: '1px solid #E5E7EB',
                  padding: '.7rem 1rem', borderRadius: 10, fontWeight: 600,
                  cursor: 'pointer', fontFamily: FF, fontSize: '.9rem',
                }}>Close</button>
              )}
            </div>
          </>
        )}

        {phase === 'attest' && (
          <>
            <div style={{ fontSize: '1.75rem', textAlign: 'center', marginBottom: 6 }}>🇳🇿</div>
            <div style={{ fontWeight: 800, color: NAVY, fontSize: '1.1rem', textAlign: 'center', marginBottom: 8 }}>
              Confirm you're in New Zealand
            </div>
            <div style={{ color: '#374151', fontSize: '.9rem', lineHeight: 1.55, marginBottom: 14 }}>
              Our physicians can only see patients who are physically in New Zealand at the time of the consultation. Please confirm below before we begin.
            </div>
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              background: attested ? 'rgba(11,110,118,.08)' : '#F8FAFC',
              border: `1.5px solid ${attested ? TEAL : '#E2E8F0'}`,
              borderRadius: 10, padding: '.75rem .9rem', cursor: 'pointer',
              marginBottom: 14,
            }}>
              <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)}
                style={{ marginTop: 3, cursor: 'pointer', flexShrink: 0, accentColor: TEAL, transform: 'scale(1.1)' }} />
              <span style={{ fontSize: '.9rem', color: NAVY, lineHeight: 1.5 }}>
                <strong>I am physically located in New Zealand right now.</strong> I understand that I cannot be seen by a Tere Health clinician if I am overseas, and that providing false information here is a serious matter.
              </span>
            </label>
            <button onClick={proceed} disabled={!attested} style={{
              width: '100%', background: attested ? TEAL : '#D1D5DB', color: 'white',
              border: 'none', padding: '.85rem 1rem', borderRadius: 12, fontWeight: 800,
              cursor: attested ? 'pointer' : 'not-allowed', fontFamily: FF, fontSize: '.95rem',
            }}>Continue →</button>
            {country && country !== 'NZ' && (
              <div style={{ marginTop: 10, fontSize: '.75rem', color: '#B45309', textAlign: 'center', lineHeight: 1.5 }}>
                (Your connection appears to be in {country}. We've flagged this for the clinician.)
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
