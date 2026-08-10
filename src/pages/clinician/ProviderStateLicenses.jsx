// /clinician/state-licenses — provider self-service for US state licenses.
//
// Add a state + license number + expiration + license doc upload → row lands
// in provider_state_licenses with status='pending_review'. Admin reviews.
// Approved rows populate providers.licensed_states which drives US patient
// queue eligibility.

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { US_STATES, stateName } from '../../lib/usStates'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF = 'Plus Jakarta Sans, sans-serif'
const BUCKET = 'provider-licenses'

const STATUS_META = {
  pending_review: { label: 'Pending review',   color: '#B45309', bg: '#FEF3C7' },
  active:         { label: 'Active',            color: '#065F46', bg: '#D1FAE5' },
  rejected:       { label: 'Rejected',          color: '#991B1B', bg: '#FEE2E2' },
  expired:        { label: 'Expired',           color: '#6B7280', bg: '#F3F4F6' },
  revoked:        { label: 'Revoked',           color: '#6B7280', bg: '#F3F4F6' },
}

function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.pending_review
  return (
    <span style={{
      background: m.bg, color: m.color, padding: '3px 10px', borderRadius: 99,
      fontSize: '.72rem', fontWeight: 700, letterSpacing: '.02em', textTransform: 'uppercase',
    }}>{m.label}</span>
  )
}

async function uploadLicenseDoc(file) {
  // 1. Ask the API for a signed upload URL scoped to this provider.
  const res = await apiFetch('/api/provider-licenses?action=upload_url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name }),
  })
  if (!res.ok) throw new Error('Could not get upload URL')
  const { path, token, signedUrl } = await res.json()
  // 2. PUT the file directly to Supabase Storage using the signed URL.
  const put = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!put.ok) throw new Error('Upload failed')
  return path
}

function AddLicenseForm({ existingCodes, onCreated }) {
  const [stateCode, setStateCode] = useState('')
  const [number, setNumber] = useState('')
  const [expires, setExpires] = useState('')
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const available = US_STATES.filter(s => !existingCodes.has(s.code))
  const canSubmit = stateCode && number.trim() && expires && !submitting

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null); setSubmitting(true)
    try {
      let docPath = null
      if (file) docPath = await uploadLicenseDoc(file)
      const res = await apiFetch('/api/provider-licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state_code:      stateCode,
          license_number:  number.trim(),
          expires_at:      expires,
          license_doc_url: docPath,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`)
      setStateCode(''); setNumber(''); setExpires(''); setFile(null)
      onCreated?.(json.license)
    } catch (err) {
      setError(String(err.message || err))
    } finally { setSubmitting(false) }
  }

  return (
    <form onSubmit={handleSubmit} style={{
      background: 'white', border: '1px solid #E2E8F0', borderRadius: 12,
      padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
    }}>
      <div style={{ fontWeight: 700, color: NAVY, marginBottom: '.75rem', fontSize: '.95rem' }}>
        Add a new state license
      </div>

      <div style={{ display: 'grid', gap: '.9rem', gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div>
          <label style={labelStyle}>State</label>
          <select value={stateCode} onChange={(e) => setStateCode(e.target.value)} style={inputStyle}>
            <option value="">— Select —</option>
            {available.map(s => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>License number</label>
          <input type="text" required value={number} onChange={(e) => setNumber(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Expires</label>
          <input type="date" required value={expires} onChange={(e) => setExpires(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            style={inputStyle} />
        </div>
      </div>

      <div style={{ marginTop: '.9rem' }}>
        <label style={labelStyle}>License document (PDF / image) — optional but strongly recommended</label>
        <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{ ...inputStyle, padding: '.5rem' }} />
      </div>

      {error && (
        <div style={{ marginTop: '.9rem', color: '#991B1B', background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '.6rem .9rem', fontSize: '.85rem' }}>
          {error}
        </div>
      )}

      <button type="submit" disabled={!canSubmit} style={{
        marginTop: '1rem',
        background: canSubmit ? TEAL : '#D1D5DB',
        color: 'white', border: 'none', borderRadius: 8,
        padding: '.7rem 1.5rem', fontFamily: FF, fontWeight: 700, fontSize: '.9rem',
        cursor: canSubmit ? 'pointer' : 'not-allowed',
      }}>
        {submitting ? 'Submitting…' : 'Submit for review'}
      </button>
    </form>
  )
}

function LicenseRow({ row, onDeleted }) {
  const [deleting, setDeleting] = useState(false)
  async function remove() {
    if (!confirm(`Remove your ${row.state_code} license entry?`)) return
    setDeleting(true)
    try {
      const res = await apiFetch(`/api/provider-licenses?id=${row.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      onDeleted?.(row.id)
    } catch (e) { alert(String(e.message || e)); setDeleting(false) }
  }
  return (
    <div style={{
      background: 'white', border: '1px solid #E2E8F0', borderRadius: 12,
      padding: '1rem 1.25rem', display: 'flex', alignItems: 'center',
      gap: '1rem', flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: 4 }}>
          <span style={{ fontWeight: 700, color: NAVY, fontSize: '1rem' }}>{stateName(row.state_code)} ({row.state_code})</span>
          <StatusPill status={row.status} />
        </div>
        <div style={{ fontSize: '.85rem', color: '#4B5563' }}>
          License #{row.license_number} · expires {row.expires_at}
        </div>
        {row.review_notes && row.status === 'rejected' && (
          <div style={{ fontSize: '.82rem', color: '#991B1B', marginTop: 6, background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 6, padding: '.45rem .7rem' }}>
            <strong>Reviewer notes:</strong> {row.review_notes}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '.5rem' }}>
        {row.license_doc_signed_url && (
          <a href={row.license_doc_signed_url} target="_blank" rel="noopener noreferrer"
            style={{ background: '#F3F4F6', color: NAVY, border: '1px solid #E5E7EB', borderRadius: 8, padding: '.5rem .9rem', textDecoration: 'none', fontSize: '.85rem', fontWeight: 600 }}>
            View doc
          </a>
        )}
        <button onClick={remove} disabled={deleting} style={{
          background: 'none', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: 8,
          padding: '.5rem .9rem', fontSize: '.85rem', fontWeight: 600, cursor: 'pointer',
        }}>{deleting ? '…' : 'Remove'}</button>
      </div>
    </div>
  )
}

export default function ProviderStateLicenses() {
  const navigate = useNavigate()
  const [licenses, setLicenses] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    if (!sessionStorage.getItem('clinicianAuth')) { navigate('/clinician?redirect=/clinician/state-licenses'); return }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await apiFetch('/api/provider-licenses')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Load failed')
      setLicenses(json.licenses || [])
    } catch (e) { setError(String(e.message || e)) }
    finally     { setLoading(false) }
  }

  const existingCodes = new Set(licenses.map(l => l.state_code))

  return (
    <div style={{ minHeight: '100dvh', background: '#F7F5F0', fontFamily: FF }}>
      <div style={{ background: NAVY, color: 'white', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button onClick={() => navigate(-1)}
          style={{ background: 'rgba(255,255,255,.1)', border: 'none', color: 'white', borderRadius: 6, padding: '6px 12px', fontSize: '.8125rem', cursor: 'pointer' }}>
          ← Back
        </button>
        <div style={{ fontWeight: 700, fontSize: '1.0625rem' }}>US state licenses</div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem 1.25rem 3rem' }}>
        <p style={{ color: '#4B5563', lineHeight: 1.6, marginBottom: '1.25rem', fontSize: '.925rem' }}>
          Each state you're licensed in must be added here and approved by a Tere admin before you can see patients from that state.
          Upload your license PDF/photo — admin reviews within 1 business day.
        </p>

        <AddLicenseForm existingCodes={existingCodes} onCreated={() => load()} />

        {loading && <div style={{ textAlign: 'center', color: '#6B7280' }}>Loading…</div>}
        {error && <div style={{ color: '#991B1B', background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '.75rem 1rem', marginBottom: '1rem', fontSize: '.9rem' }}>{error}</div>}
        {!loading && !licenses.length && (
          <div style={{ background: 'white', border: '1px dashed #D1D5DB', borderRadius: 12, padding: '2rem', textAlign: 'center', color: '#6B7280', fontSize: '.9rem' }}>
            No state licenses yet. Add one above.
          </div>
        )}

        <div style={{ display: 'grid', gap: '.75rem' }}>
          {licenses.map(l => <LicenseRow key={l.id} row={l} onDeleted={() => load()} />)}
        </div>
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '.6rem .8rem',
  fontSize: '.9rem',
  fontFamily: FF,
  background: 'white',
  border: '1.5px solid #E2E8F0',
  borderRadius: 8,
  boxSizing: 'border-box',
}
const labelStyle = {
  display: 'block',
  fontSize: '.78rem',
  fontWeight: 700,
  color: '#374151',
  marginBottom: '.35rem',
  letterSpacing: '.02em',
}
