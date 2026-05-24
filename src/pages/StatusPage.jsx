import React, { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'

const SERVICE_LABELS = {
  database: 'Database',
  ai: 'AI (Anthropic)',
  payments: 'Payments (Stripe)',
  email: 'Email (Resend)',
}

function StatusDot({ ok }) {
  return (
    <div style={{
      width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
      background: ok ? '#059669' : '#DC2626',
      boxShadow: ok ? '0 0 0 3px rgba(5,150,105,.2)' : '0 0 0 3px rgba(220,38,38,.2)',
    }} />
  )
}

export default function StatusPage() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastChecked, setLastChecked] = useState(null)

  async function check() {
    setLoading(true)
    try {
      const res = await apiFetch('/api/status')
      const data = await res.json()
      setStatus(data)
      setLastChecked(new Date())
    } catch {
      setStatus({ status: 'degraded', services: [{ name: 'api', ok: false, detail: 'Unreachable' }] })
    }
    setLoading(false)
  }

  useEffect(() => { check() }, [])
  // Auto-refresh every 60s
  useEffect(() => {
    const t = setInterval(check, 60000)
    return () => clearInterval(t)
  }, [])

  const allOk = status?.status === 'operational'

  return (
    <div style={{ minHeight: '100dvh', background: '#F0F2F5', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <nav style={{ background: '#0D2B45', padding: '.875rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <span style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.3rem' }}>Tere</span>
        <span style={{ color: 'rgba(255,255,255,.4)', fontSize: '.875rem' }}>System Status</span>
      </nav>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '2.5rem 1.25rem' }}>

        {/* Overall status banner */}
        <div style={{
          borderRadius: 16, padding: '1.5rem 2rem', marginBottom: '1.5rem', textAlign: 'center',
          background: loading ? '#F8FAFC' : allOk ? '#F0FDF4' : '#FEF2F2',
          border: `2px solid ${loading ? '#E2E8F0' : allOk ? '#BBF7D0' : '#FECACA'}`,
        }}>
          {loading ? (
            <div style={{ color: '#9CA3AF', fontSize: '.9375rem' }}>Checking systems…</div>
          ) : (
            <>
              <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>{allOk ? '✓' : '⚠'}</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: allOk ? '#059669' : '#DC2626', marginBottom: '.25rem' }}>
                {allOk ? 'All systems operational' : 'Service disruption detected'}
              </div>
              <div style={{ fontSize: '.875rem', color: '#6B7280' }}>
                tere.co.nz · {lastChecked?.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            </>
          )}
        </div>

        {/* Individual services */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: '1.5rem' }}>
          {(status?.services || []).map((s, i) => (
            <div key={s.name} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '1rem 1.25rem',
              borderBottom: i < (status?.services?.length - 1) ? '1px solid #F3F4F6' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                <StatusDot ok={s.ok} />
                <span style={{ fontWeight: 600, color: '#0D2B45', fontSize: '.9375rem' }}>
                  {SERVICE_LABELS[s.name] || s.name}
                </span>
                {s.detail && !s.ok && (
                  <span style={{ fontSize: '.75rem', color: '#DC2626' }}>{s.detail}</span>
                )}
              </div>
              <span style={{ fontSize: '.8125rem', fontWeight: 600, color: s.ok ? '#059669' : '#DC2626' }}>
                {s.ok ? 'Operational' : 'Degraded'}
              </span>
            </div>
          ))}
        </div>

        <button onClick={check} disabled={loading}
          style={{ background: '#F0F9FA', color: '#0B6E76', border: '1px solid #0B6E76', padding: '9px 20px', borderRadius: 8, fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 600, cursor: loading ? 'default' : 'pointer', fontSize: '.875rem', display: 'block', margin: '0 auto' }}>
          {loading ? 'Checking…' : '↻ Refresh'}
        </button>

        <div style={{ textAlign: 'center', marginTop: '2rem', fontSize: '.8125rem', color: '#9CA3AF' }}>
          Tere Health · New Zealand · Checks run every 60 seconds
        </div>
      </div>
    </div>
  )
}
