// /arc/:slug — password-gated entry for ARC facility nurses.
//
// Design: a single-field password prompt in front of the existing
// /work/:slug intake flow. Shared facility password (one per facility,
// hashed in employers.access_password_hash) — nurses enter the password,
// we validate against /api/arc-access, stash the employer metadata in
// sessionStorage, and redirect to /work/:slug which runs the existing
// ARC-branched intake (calling-on-behalf, EPOA, facility vitals).
//
// Why a password gate instead of a slug-only URL (like /work/[slug]
// employers use): ARC respite turns over too fast for an Excel roster
// to stay in sync. The password is the authorisation signal; the nurse
// adds the resident on the fly in the intake form.
//
// v1 known gap: a leaked slug + no password still lets someone hit
// /work/kowhainui directly (the existing employer flow doesn't require
// the ARC password). Audit log catches anomalous volume; v2 adds server-
// signed tokens to /api/create-consultation. Patrick accepted this gap.

import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const TEAL_LIGHT = '#D4EEF0'
const FF = 'Plus Jakarta Sans, sans-serif'

const SS_KEY = 'tere_arc_session'

export default function ArcEntry() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // If a nurse has already authenticated in this browser session for this
  // same slug, skip the gate and go straight to the intake flow. Keeps
  // repeat consults in a single shift painless.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SS_KEY)
      if (!raw) return
      const sess = JSON.parse(raw)
      if (sess?.slug === slug && sess?.expires_at > Date.now()) {
        navigate(`/work/${slug}`)
      }
    } catch { /* ignore stale session */ }
  }, [slug, navigate])

  async function submit(e) {
    e?.preventDefault?.()
    if (busy) return
    if (!password.trim()) { setErr('Please enter the facility password.'); return }
    setBusy(true); setErr('')
    try {
      const r = await apiFetch('/api/arc-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, password }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setErr(j?.error || `Error ${r.status}`)
        return
      }
      // Stash the session so subsequent consults in this shift skip the
      // gate. 12h expiry roughly matches a long shift and auto-expires if
      // the tablet is left logged in overnight.
      sessionStorage.setItem(SS_KEY, JSON.stringify({
        slug,
        employer_id: j.employer.id,
        company_name: j.employer.company_name,
        org_type: j.employer.org_type,
        expires_at: Date.now() + 12 * 60 * 60 * 1000,
      }))
      navigate(`/work/${slug}`)
    } catch (e2) {
      setErr(e2?.message || 'Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', background: '#F5FBFC', fontFamily: FF, color: NAVY,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem',
    }}>
      <form onSubmit={submit} style={{
        background: 'white', borderRadius: 16, padding: '2.5rem 2rem',
        maxWidth: 420, width: '100%',
        boxShadow: '0 4px 24px rgba(13,43,69,.08)',
        border: `1px solid ${TEAL_LIGHT}`,
      }}>
        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: TEAL, marginBottom: '.4rem' }}>Tere Health</div>
        <div style={{ fontSize: '.8125rem', color: '#64748B', marginBottom: '1.5rem' }}>Care Anywhere, Aotearoa NZ</div>

        <div style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '.4rem' }}>Facility sign-in</div>
        <div style={{ fontSize: '.875rem', color: '#64748B', marginBottom: '1.25rem', lineHeight: 1.5 }}>
          Enter the shared facility password to begin a resident consult.
        </div>

        <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.4rem' }}>
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={e => { setPassword(e.target.value); setErr('') }}
          autoFocus
          autoComplete="current-password"
          placeholder="Facility password"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '.8rem 1rem', fontSize: '1rem', fontFamily: 'inherit',
            border: `1.5px solid ${err ? '#DC2626' : '#D4DEE4'}`,
            borderRadius: 10, marginBottom: '.6rem',
            outline: 'none',
          }}
        />
        {err && (
          <div style={{ color: '#991B1B', fontSize: '.8125rem', marginBottom: '.6rem', fontWeight: 600 }}>
            {err}
          </div>
        )}
        <button type="submit" disabled={busy || !password.trim()}
          style={{
            width: '100%', background: (busy || !password.trim()) ? '#94A3B8' : TEAL,
            color: 'white', border: 'none', padding: '.85rem 1rem', borderRadius: 10,
            fontWeight: 800, fontSize: '1rem', fontFamily: 'inherit',
            cursor: (busy || !password.trim()) ? 'not-allowed' : 'pointer',
          }}>
          {busy ? 'Checking…' : 'Continue'}
        </button>

        <div style={{ fontSize: '.75rem', color: '#94A3B8', marginTop: '1.25rem', lineHeight: 1.5 }}>
          Forgotten the password? Contact your facility manager. Tere Health does not store or transmit facility passwords by email.
        </div>
      </form>
    </div>
  )
}
