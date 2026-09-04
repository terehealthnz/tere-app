import React, { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../lib/api'

export default function HpiSearch({ type = 'pharmacy', onSelect, placeholder, value, patientNhi, patientId, consultationId }) {
  const [query, setQuery] = useState(value || '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isMock, setIsMock] = useState(false)
  const timerRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    if (value !== undefined) setQuery(value)
  }, [value])

  useEffect(() => {
    function onClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function handleChange(e) {
    const q = e.target.value
    setQuery(q)
    clearTimeout(timerRef.current)
    if (q.length < 2) { setResults([]); setOpen(false); return }
    timerRef.current = setTimeout(() => search(q), 400)
  }

  async function search(q) {
    setLoading(true)
    try {
      // HNZ traceability (task #440, IN-3502 Security 3): send caller-specific
      // userid so the HPI audit log attributes the request to the individual
      // patient (via NHI) or the individual provider (via CPN / provider id)
      // rather than our shared service account.
      const providerCpn = typeof window !== 'undefined' ? sessionStorage.getItem('providerCpn') : null
      const providerHpi = typeof window !== 'undefined' ? sessionStorage.getItem('providerHpiNumber') : null
      const providerId  = typeof window !== 'undefined' ? sessionStorage.getItem('providerId') : null
      const res = await apiFetch('/api/hpi-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          type,
          // Patient-flow identifiers (props) preferred; provider identifiers
          // (sessionStorage) used when no patient context is passed.
          patientNhi, patientId, consultationId,
          providerCpn, providerHpi, providerId,
        }),
      })
      const data = await res.json()
      setResults(data.results || [])
      setIsMock(!!data.mock)
      setOpen(true)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  function select(r) {
    setQuery(r.name)
    setOpen(false)
    onSelect(r)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder || (type === 'radiology' ? 'Search radiology providers…' : 'Search pharmacies…')}
          style={{ width: '100%', paddingRight: loading ? '2rem' : undefined }}
        />
        {loading && (
          <div style={{ position: 'absolute', right: '.625rem', top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, border: '2px solid var(--teal)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
        )}
      </div>

      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: 'white', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)',
          boxShadow: '0 4px 16px rgba(0,0,0,.12)', marginTop: 2, maxHeight: 260, overflowY: 'auto',
        }}>
          {isMock && (
            <div style={{
              padding: '8px 12px', fontSize: '.75rem', fontWeight: 800, color: 'white',
              background: '#B91C1C', borderBottom: '2px solid #7F1D1D',
              textTransform: 'uppercase', letterSpacing: '.04em',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontSize: '1rem' }}>⚠</span>
              Demo data — not from HPI
            </div>
          )}
          {results.map((r, i) => (
            <div key={r.hpiId || i}
              onMouseDown={() => select(r)}
              style={{
                padding: '.625rem .875rem', cursor: 'pointer', borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none',
                transition: 'background .1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
              onMouseLeave={e => e.currentTarget.style.background = 'white'}
            >
              <div style={{ fontWeight: 600, fontSize: '.875rem', color: 'var(--navy)' }}>{r.name}</div>
              {r.address && <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 1 }}>{r.address}</div>}
              <div style={{ fontSize: '.75rem', color: 'var(--muted)', display: 'flex', gap: '.75rem', marginTop: 1 }}>
                {r.phone && <span>📞 {r.phone}</span>}
                {r.email && <span>✉ {r.email}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {open && results.length === 0 && !loading && query.length >= 2 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: 'white', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)',
          padding: '.75rem', fontSize: '.875rem', color: 'var(--muted)', marginTop: 2,
        }}>
          No results found. Enter details manually.
        </div>
      )}
    </div>
  )
}
