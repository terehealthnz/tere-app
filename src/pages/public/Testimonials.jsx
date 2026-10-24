import React from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

const BRAND = { navy: '#0D2B45', teal: '#0B6E76', tealLight: '#D4EEF0', cream: '#F7F5F0' }

function fmtDate(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' })
  } catch {
    return ''
  }
}

export default function Testimonials() {
  const navigate = useNavigate()
  const [loading, setLoading] = React.useState(true)
  const [items, setItems] = React.useState([])
  const [error, setError] = React.useState(null)

  React.useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch('/api/public-testimonials')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not load')
        setItems(data.testimonials || [])
      } catch (e) {
        setError(e.message)
      }
      setLoading(false)
    }
    load()
    document.title = 'Patient testimonials - Tere Health'
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: BRAND.cream, fontFamily: 'Plus Jakarta Sans, sans-serif', color: '#1A2A33' }}>
      <nav style={{ background: BRAND.navy, padding: '.875rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="navbar-brand" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', color: BRAND.tealLight, fontSize: '1.5rem', fontWeight: 600, cursor: 'pointer' }} onClick={() => navigate('/')}>Tere Health</span>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: '.9rem' }}>Home</button>
      </nav>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '2.5rem 1.5rem 3rem' }}>
        <header style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 .5rem', color: BRAND.navy }}>What our patients say</h1>
          <p style={{ fontSize: '.9375rem', color: '#4B5563', lineHeight: 1.6, margin: 0 }}>
            Shared with permission after their Tere Health consult. Every testimonial is reviewed by our team before it goes up.
          </p>
        </header>

        {loading && <div style={{ color: '#6B7280', fontSize: '.9375rem' }}>Loading...</div>}
        {error && <div style={{ color: '#B91C1C', fontSize: '.9375rem' }}>Could not load testimonials right now. Please try again later.</div>}

        {!loading && !error && items.length === 0 && (
          <div style={{ background: 'white', borderRadius: 12, padding: '2rem', border: '1px solid #E2E8F0', color: '#6B7280', textAlign: 'center' }}>
            New testimonials are on the way. Check back soon.
          </div>
        )}

        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {items.map((t, i) => (
            <li key={i} style={{ background: 'white', borderRadius: 12, padding: '1.25rem 1.5rem', border: '1px solid #E2E8F0', boxShadow: '0 1px 2px rgba(13,43,69,.04)' }}>
              <blockquote style={{ margin: 0, fontSize: '1rem', lineHeight: 1.65, color: '#1A2A33', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                &ldquo;{t.text}&rdquo;
              </blockquote>
              <div style={{ marginTop: '.75rem', fontSize: '.8125rem', color: '#6B7280', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: BRAND.teal }}>{t.display_name}</span>
                <span>{fmtDate(t.created_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
