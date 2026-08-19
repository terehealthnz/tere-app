// Self-service profile edit for the currently signed-in provider.
// Writes go to the SAME providers row that Admin → Team edits, so any
// change here is immediately visible to admin (and vice versa).
//
// Field scope mirrors api/_providers.js SELF_UPDATE_ALLOWLIST — the API
// rejects any attempt to PATCH admin-only fields (role flags, capabilities,
// is_active, color, base_rate, supervision, MFA), so this form deliberately
// doesn't render them.
//
// The signature drawing pad reuses the /api/providers?action=upload_signature
// endpoint (server-mediated PNG upload with magic-byte + 512KB checks) but
// passes provider_id=self so the API's self-check permits it.

import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF = 'Plus Jakarta Sans, sans-serif'

const SECTIONS = [
  {
    title: 'Identity',
    fields: [
      { key: 'first_name', label: 'First name', required: true },
      { key: 'last_name',  label: 'Last name',  required: true },
      { key: 'credential', label: 'Credential', placeholder: 'Dr, MBChB, NP, RN…' },
      { key: 'specialty',  label: 'Specialty',  placeholder: 'Emergency Medicine, GP, Rural Hospital…' },
    ],
  },
  {
    title: 'Clinical identifiers',
    fields: [
      { key: 'mcnz_registration_number', label: 'MCNZ registration number' },
      { key: 'prescriber_number',        label: 'Prescriber number' },
      { key: 'cpn',                      label: 'HPI-CPN' },
      { key: 'hpi_number',               label: 'HPI number (personal HPI)' },
      { key: 'acc_provider_number',      label: 'ACC provider number' },
      { key: 'scope_of_practice',        label: 'Scope of practice' },
      { key: 'pgy_level',                label: 'PGY level (if RMO)' },
    ],
  },
  {
    title: 'Payroll & tax',
    subtitle: '🔒 Only you and Tere admin can see these fields.',
    fields: [
      { key: 'tax_code',    label: 'Tax code',       placeholder: 'M, ME, S…' },
      { key: 'ird_number',  label: 'IRD number',     placeholder: '123-456-789' },
      { key: 'bank_account',label: 'Bank account',   placeholder: '01-0123-4567890-00' },
    ],
  },
]

export default function MyProfile() {
  const navigate = useNavigate()
  const [me, setMe] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Load the provider's own row on mount.
  useEffect(() => {
    const providerId = sessionStorage.getItem('providerId')
    if (!providerId) { navigate('/clinician'); return }
    ;(async () => {
      try {
        const cols = 'id,first_name,last_name,email,credential,specialty,mcnz_registration_number,prescriber_number,cpn,hpi_number,acc_provider_number,scope_of_practice,pgy_level,signature_url,tax_code,ird_number,bank_account,provider_type'
        const r = await apiFetch(`/api/providers?id=${providerId}&columns=${encodeURIComponent(cols)}`)
        if (!r.ok) throw new Error(`Load failed (${r.status})`)
        const j = await r.json()
        const row = j.provider || j.providers?.[0]
        if (!row) throw new Error('Provider row not found')
        setMe(row)
        // Prefill form with all editable fields; empty string for null so
        // the inputs are controlled rather than swinging between un/controlled.
        const seeded = {}
        for (const s of SECTIONS) for (const f of s.fields) seeded[f.key] = row[f.key] || ''
        setForm(seeded)
      } catch (e) { setError(e.message) }
    })()
  }, [navigate])

  async function save() {
    setError(''); setSuccess(''); setSaving(true)
    try {
      // Coerce empty strings to null so Postgres doesn't reject typed columns
      // (pgy_level is integer, dates are timestamp, etc — "" fails cast with
      // 'invalid input syntax for type integer'). null is the correct
      // representation of a cleared field.
      const cleaned = {}
      for (const [k, v] of Object.entries(form)) {
        cleaned[k] = (typeof v === 'string' && v.trim() === '') ? null : v
      }
      const r = await apiFetch(`/api/providers?id=${me.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleaned),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Save failed')
      setSuccess('Profile saved.')
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  if (!me) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6B7280', fontFamily: FF }}>
        {error || 'Loading your profile…'}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#F7F5F0', fontFamily: FF, paddingBottom: '4rem' }}>
      <nav style={{ background: NAVY, color: 'white', padding: '.9rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.4rem', cursor: 'pointer', padding: 0 }}>←</button>
        <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>My profile</div>
      </nav>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '1.5rem 1rem' }}>
        <div style={{ background: '#F0F9FA', border: '1px solid #C7EAEC', borderRadius: 10, padding: '.85rem 1rem', color: NAVY, fontSize: '.875rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
          These details are used on your prescriptions, referrals, ACC claims, and the shift roster. Update them any time — admin sees the same values.
        </div>

        {SECTIONS.map(sec => (
          <section key={sec.title} style={{ background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #E2E8F0', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '.95rem', fontWeight: 700, color: NAVY, margin: '0 0 .35rem' }}>{sec.title}</h3>
            {sec.subtitle && <div style={{ fontSize: '.75rem', color: '#6B7280', marginBottom: '.75rem' }}>{sec.subtitle}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '.75rem' }}>
              {sec.fields.map(f => (
                <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '.8125rem', color: '#4B5563' }}>
                  {f.label}{f.required && <span style={{ color: '#DC2626' }}> *</span>}
                  <input
                    type="text"
                    value={form[f.key] ?? ''}
                    placeholder={f.placeholder || ''}
                    onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                    style={{ padding: '.55rem .7rem', border: '1.5px solid #E2E8F0', borderRadius: 8, fontFamily: FF, fontSize: '.9rem', outline: 'none' }}
                  />
                </label>
              ))}
            </div>
          </section>
        ))}

        <SignatureSection me={me} onUpdated={url => setMe({ ...me, signature_url: url })} />

        <div style={{ position: 'sticky', bottom: 12, background: 'white', borderRadius: 12, padding: '.85rem 1rem', border: '1px solid #E2E8F0', marginTop: '1rem', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 4px 16px rgba(0,0,0,.06)' }}>
          <div style={{ fontSize: '.85rem', color: success ? '#059669' : error ? '#DC2626' : '#6B7280', flex: 1 }}>
            {success || error || 'Changes save to your provider record.'}
          </div>
          <button onClick={save} disabled={saving}
            style={{ background: TEAL, color: 'white', border: 'none', padding: '.65rem 1.4rem', borderRadius: 10, fontWeight: 700, fontFamily: FF, cursor: saving ? 'wait' : 'pointer', fontSize: '.9rem' }}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Signature draw pad ──────────────────────────────────────────────────────
function SignatureSection({ me, onUpdated }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.strokeStyle = '#111827'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
  }, [])

  function pos(e) {
    const c = canvasRef.current
    const r = c.getBoundingClientRect()
    const scaleX = c.width / r.width
    const scaleY = c.height / r.height
    const t = e.touches?.[0] || e
    return { x: (t.clientX - r.left) * scaleX, y: (t.clientY - r.top) * scaleY }
  }
  function start(e) { e.preventDefault(); drawingRef.current = true; const p = pos(e); canvasRef.current.getContext('2d').beginPath(); canvasRef.current.getContext('2d').moveTo(p.x, p.y) }
  function move(e)  { if (!drawingRef.current) return; e.preventDefault(); const p = pos(e); const ctx = canvasRef.current.getContext('2d'); ctx.lineTo(p.x, p.y); ctx.stroke() }
  function stop()   { drawingRef.current = false }
  function clear()  { const c = canvasRef.current; const ctx = c.getContext('2d'); ctx.fillStyle='white'; ctx.fillRect(0,0,c.width,c.height); setMsg('') }

  async function upload() {
    setMsg(''); setUploading(true)
    try {
      const c = canvasRef.current
      const dataUrl = c.toDataURL('image/png')
      const b64 = dataUrl.split(',')[1]
      const r = await apiFetch(`/api/providers?action=upload_signature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ png_base64: b64, provider_id: me.id }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Upload failed')
      onUpdated?.(j.signature_url)
      setMsg('Signature updated.')
      setTimeout(() => setMsg(''), 3000)
    } catch (e) { setMsg(`Error: ${e.message}`) }
    finally { setUploading(false) }
  }

  return (
    <section style={{ background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #E2E8F0', marginBottom: '1rem' }}>
      <h3 style={{ fontSize: '.95rem', fontWeight: 700, color: NAVY, margin: '0 0 .35rem' }}>Prescribing signature</h3>
      {me.signature_url ? (
        <div style={{ marginBottom: '.75rem' }}>
          <div style={{ fontSize: '.75rem', color: '#6B7280', marginBottom: 4 }}>Current signature on file:</div>
          <img src={me.signature_url} alt="current signature" style={{ maxHeight: 80, background: 'white', border: '1px solid #E2E8F0', borderRadius: 6, padding: 4 }} />
        </div>
      ) : (
        <div style={{ fontSize: '.8125rem', color: '#B45309', marginBottom: '.75rem' }}>No signature on file. Sign below to add one — needed for prescriptions.</div>
      )}
      <div style={{ fontSize: '.75rem', color: '#6B7280', marginBottom: 6 }}>Draw below to replace the current signature. Leaving it blank keeps the existing one.</div>
      <canvas
        ref={canvasRef}
        width={520}
        height={140}
        style={{ width: '100%', height: 140, background: 'white', border: '1.5px dashed #94A3B8', borderRadius: 8, touchAction: 'none', display: 'block' }}
        onMouseDown={start} onMouseMove={move} onMouseUp={stop} onMouseLeave={stop}
        onTouchStart={start} onTouchMove={move} onTouchEnd={stop}
      />
      <div style={{ fontSize: '.7rem', color: '#9CA3AF', marginTop: 2 }}>Sign above the line</div>
      <div style={{ display: 'flex', gap: 8, marginTop: '.75rem', alignItems: 'center' }}>
        <button onClick={clear}
          style={{ background: 'none', border: '1px solid #E5E7EB', color: '#6B7280', padding: '.45rem .9rem', borderRadius: 8, cursor: 'pointer', fontFamily: FF, fontSize: '.8125rem' }}>
          Clear
        </button>
        <button onClick={upload} disabled={uploading}
          style={{ background: TEAL, color: 'white', border: 'none', padding: '.45rem 1rem', borderRadius: 8, fontWeight: 700, fontFamily: FF, cursor: uploading ? 'wait' : 'pointer', fontSize: '.8125rem' }}>
          {uploading ? 'Uploading…' : 'Save signature'}
        </button>
        <div style={{ fontSize: '.8rem', color: msg.startsWith('Error') ? '#DC2626' : '#059669', flex: 1 }}>{msg}</div>
      </div>
    </section>
  )
}
