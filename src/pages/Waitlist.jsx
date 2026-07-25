import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { apiFetch } from '../lib/api'

const BRAND = { navy: '#0D2B45', teal: '#0B6E76', tealLight: '#D4EEF0', cream: '#F7F5F0' }

export default function Waitlist() {
  const location = useLocation()
  const source = new URLSearchParams(location.search).get('src') || 'landing'

  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [region, setRegion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await apiFetch('/api/waitlist-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          firstName: firstName.trim() || null,
          phone: phone.trim() || null,
          region: region.trim() || null,
          source,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Something went wrong. Please try again.')
        setLoading(false)
        return
      }
      setDone(true)
    } catch {
      setError('Connection error. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: BRAND.cream, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <nav style={{ background: BRAND.navy, padding: '.875rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', color: BRAND.tealLight, fontSize: '1.4rem' }}>Tere Health</span>
        </Link>
      </nav>

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '3rem 1.25rem 5rem' }}>
        {done ? (
          <div style={{ background: 'white', borderRadius: 16, padding: '2.5rem 2rem', textAlign: 'center', boxShadow: '0 4px 16px rgba(13,43,69,.08)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✅</div>
            <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '2rem', color: BRAND.navy, marginBottom: '.75rem', fontWeight: 700 }}>You're on the list</h1>
            <p style={{ fontSize: '1rem', color: '#4A5568', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              We'll email <strong>{email}</strong> in the coming weeks with a link to book your first consultation as soon as bookings open.
            </p>
            <p style={{ fontSize: '.875rem', color: '#6B7280', lineHeight: 1.6, marginBottom: '2rem' }}>
              If you need urgent medical help right now, please see your usual GP or call Healthline on <strong>0800 611 116</strong>. In an emergency, dial <strong>111</strong>.
            </p>
            <Link to="/" style={{ display: 'inline-block', background: 'transparent', color: BRAND.teal, textDecoration: 'none', padding: '10px 22px', border: `1.5px solid ${BRAND.teal}`, borderRadius: 99, fontSize: '.9375rem', fontWeight: 700 }}>
              Back to home
            </Link>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div style={{ display: 'inline-block', background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.35)', borderRadius: 99, padding: '5px 14px', fontSize: '.75rem', color: '#B45309', letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '1.25rem' }}>
                Coming soon · Beta launch
              </div>
              <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(2rem, 5vw, 2.5rem)', color: BRAND.navy, marginBottom: '.5rem', fontWeight: 700, lineHeight: 1.15 }}>
                Join the Tere Health waitlist
              </h1>
              <p style={{ fontSize: '1rem', color: '#4A5568', lineHeight: 1.6, maxWidth: 420, margin: '.75rem auto 0' }}>
                Same-day telehealth by NZ Emergency Medicine physicians. Bookings open shortly — join the waitlist to be first.
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ background: 'white', borderRadius: 16, padding: '2rem', boxShadow: '0 4px 16px rgba(13,43,69,.08)' }}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '.875rem', fontWeight: 700, color: BRAND.navy, marginBottom: '.375rem' }}>First name</label>
                <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                  placeholder="Optional" autoComplete="given-name"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: '1rem', fontFamily: 'Plus Jakarta Sans, sans-serif', boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '.875rem', fontWeight: 700, color: BRAND.navy, marginBottom: '.375rem' }}>Email <span style={{ color: '#DC2626' }}>*</span></label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" required autoComplete="email"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: '1rem', fontFamily: 'Plus Jakarta Sans, sans-serif', boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '.875rem', fontWeight: 700, color: BRAND.navy, marginBottom: '.375rem' }}>Mobile</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="Optional — for launch SMS" autoComplete="tel"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: '1rem', fontFamily: 'Plus Jakarta Sans, sans-serif', boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '.875rem', fontWeight: 700, color: BRAND.navy, marginBottom: '.375rem' }}>Region</label>
                <input type="text" value={region} onChange={e => setRegion(e.target.value)}
                  placeholder="Optional — e.g. Marlborough, Auckland"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: '1rem', fontFamily: 'Plus Jakarta Sans, sans-serif', boxSizing: 'border-box' }} />
              </div>

              {error && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: '.875rem', color: '#991B1B', marginBottom: '1rem' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading || !email.includes('@')}
                style={{ width: '100%', minHeight: 48, background: BRAND.teal, color: 'white', border: 'none', borderRadius: 99, fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, fontSize: '1rem', cursor: loading ? 'wait' : 'pointer', opacity: (loading || !email.includes('@')) ? 0.6 : 1, boxShadow: '0 8px 20px rgba(11,110,118,.25)' }}>
                {loading ? 'Joining…' : 'Join the waitlist'}
              </button>

              <p style={{ fontSize: '.75rem', color: '#6B7280', textAlign: 'center', marginTop: '1rem', lineHeight: 1.5 }}>
                We'll only use your details to notify you when bookings open. You can unsubscribe any time.
              </p>
            </form>

            <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '.8125rem', color: '#6B7280' }}>
              Partner, employer, or clinician enquiry?{' '}
              <a href="mailto:terehealthnz@gmail.com" style={{ color: BRAND.teal, fontWeight: 700 }}>Email us</a>.
            </p>
          </>
        )}
      </div>

      <footer style={{ background: BRAND.navy, padding: '1.5rem', textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {[['Home', '/'], ['Privacy', '/privacy'], ['Terms', '/terms'], ['Complaints', '/complaints']].map(([label, path]) => (
            <Link key={label} to={path} style={{ color: 'rgba(255,255,255,.5)', textDecoration: 'none', fontSize: '.875rem' }}>{label}</Link>
          ))}
        </div>
      </footer>
    </div>
  )
}
