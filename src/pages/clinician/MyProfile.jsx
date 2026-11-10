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

function TestSmsButton({ mobilePhone, unsavedChanges }) {
  const [state, setState] = useState('idle') // idle | sending | ok | err
  const [message, setMessage] = useState('')

  async function send() {
    if (state === 'sending') return
    if (!mobilePhone) {
      setState('err')
      setMessage('Enter a mobile number first.')
      return
    }
    if (unsavedChanges) {
      setState('err')
      setMessage('Save your profile first so the number is stored, then hit test.')
      return
    }
    setState('sending')
    setMessage('')
    try {
      const r = await apiFetch('/api/admin-test-sms?self=1')
      const j = await r.json().catch(() => ({}))
      if (r.ok) {
        setState('ok')
        setMessage(`Sent to ${j.to}. Check your phone.`)
      } else {
        setState('err')
        setMessage(j.error || j.detail || `HTTP ${r.status}`)
      }
    } catch (e) {
      setState('err')
      setMessage('Network error. Try again.')
    }
  }

  return (
    <div style={{ margin: '0 0 .75rem', padding: '.65rem .8rem', background: '#F0F9FA', border: '1px solid #C7EAEC', borderRadius: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.6rem', fontSize: '.8125rem' }}>
      <button
        type="button"
        onClick={send}
        disabled={state === 'sending'}
        style={{ background: TEAL, color: 'white', border: 'none', padding: '.4rem .85rem', borderRadius: 6, fontWeight: 700, fontSize: '.8125rem', cursor: state === 'sending' ? 'wait' : 'pointer', fontFamily: FF }}
      >
        {state === 'sending' ? 'Sending…' : 'Send test SMS'}
      </button>
      {state === 'ok' && <span style={{ color: '#047857' }}>{message}</span>}
      {state === 'err' && <span style={{ color: '#B91C1C' }}>{message}</span>}
      {state === 'idle' && <span style={{ color: '#64748B' }}>Verify your number receives on-call pings.</span>}
    </div>
  )
}

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
      { key: 'cpn',                      label: 'HPI-CPN', placeholder: 'e.g. 24NSES' },
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
      { key: 'gst_registered', type: 'gst_bcti' },
    ],
  },
  {
    title: 'On-call SMS',
    subtitle: 'Get a text when a new patient enters the queue. Toggle also lives in the top nav so you can flip it during a shift. Only fires 08:00-20:00 NZT, rate-limited to 1 text per 10 minutes. No patient info in the SMS.',
    fields: [
      { key: 'mobile_phone', label: 'Mobile number',   placeholder: '02x xxx xxxx' },
      { key: 'sms_on_call',  label: 'Text me when a new patient enters the queue', type: 'checkbox' },
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
        const cols = 'id,first_name,last_name,email,credential,specialty,mcnz_registration_number,prescriber_number,cpn,acc_provider_number,scope_of_practice,pgy_level,signature_url,tax_code,ird_number,bank_account,gst_registered,gst_number,gst_bcti_consent_at,gst_bcti_consent_version,provider_type,mobile_phone,sms_on_call'
        const r = await apiFetch(`/api/providers?id=${providerId}&columns=${encodeURIComponent(cols)}`)
        if (!r.ok) throw new Error(`Load failed (${r.status})`)
        const j = await r.json()
        const row = j.provider || j.providers?.[0]
        if (!row) throw new Error('Provider row not found')
        setMe(row)
        // Prefill form with all editable fields; empty string for null so
        // the inputs are controlled rather than swinging between un/controlled.
        // Booleans preserve their type so checkbox inputs work.
        const seeded = {}
        for (const s of SECTIONS) for (const f of s.fields) {
          if (f.type === 'gst_bcti') {
            // gst_bcti is a composite: gst_registered checkbox + gst_number input +
            // read-only consent timestamp. Seed both scalar fields explicitly.
            seeded.gst_registered = !!row.gst_registered
            seeded.gst_number     = row.gst_number || ''
            continue
          }
          seeded[f.key] = f.type === 'checkbox' ? !!row[f.key] : (row[f.key] || '')
        }
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
            {sec.title === 'On-call SMS' && (
              <TestSmsButton
                mobilePhone={form.mobile_phone}
                unsavedChanges={form.mobile_phone !== me?.mobile_phone}
              />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '.75rem' }}>
              {sec.fields.map(f => {
                // Prescriber-number quick-fill: for MCNZ-registered doctors the
                // prescriber number IS the MCNZ number. NPs / dentists / pharmacist
                // prescribers have distinct codes — that's why the fields stay
                // separate — but for the 90% case, a one-tap 'same as MCNZ' is
                // faster than typing the same 5 digits twice.
                const canCopyFromMcnz = f.key === 'prescriber_number'
                  && form.mcnz_registration_number
                  && form.prescriber_number !== form.mcnz_registration_number
                // Fields that depend on a checkbox above them (e.g. gst_number
                // only makes sense when gst_registered is true).
                if (f.key === 'gst_number' && !form.gst_registered) return null
                // GST + BCTI consent — custom multi-line block. The checkbox tick
                // is also written acceptance of the BCTI arrangement under IRD
                // GST Act s24(2). The backend (_providers.js) stamps
                // gst_bcti_consent_at when gst_registered flips to true.
                if (f.type === 'gst_bcti') {
                  return (
                    <div key={f.key} style={{ gridColumn: '1 / -1', background: '#FAFBFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '1rem' }}>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!form.gst_registered}
                          onChange={e => setForm({ ...form, gst_registered: e.target.checked })}
                          style={{ width: 16, height: 16, cursor: 'pointer', marginTop: 2 }}
                        />
                        <span style={{ fontSize: '.8125rem', color: '#111827', lineHeight: 1.5 }}>
                          <b>I am GST registered.</b>
                          {' '}By ticking this, I agree that Tere Health Ltd will issue me Buyer-Created Tax Invoices (BCTIs) for services I provide to Tere Health, and I will not issue separate tax invoices for the same services. I can revoke this agreement at any time by un-ticking this box or by notifying Tere Health in writing.
                        </span>
                      </label>
                      {form.gst_registered && (
                        <div style={{ marginTop: '.75rem', display: 'flex', flexDirection: 'column', gap: 4, fontSize: '.8125rem', color: '#4B5563' }}>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span>GST number <span style={{ color: '#DC2626' }}>*</span></span>
                            <input
                              type="text"
                              value={form.gst_number || ''}
                              onChange={e => setForm({ ...form, gst_number: e.target.value })}
                              placeholder="123-456-789"
                              style={{ padding: '.5rem .65rem', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: '.875rem', fontFamily: FF }}
                            />
                          </label>
                          {me.gst_bcti_consent_at && (
                            <div style={{ marginTop: '.4rem', fontSize: '.7rem', color: '#6B7280' }}>
                              BCTI agreement accepted {new Date(me.gst_bcti_consent_at).toLocaleString('en-NZ', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                              {me.gst_bcti_consent_version ? ` (${me.gst_bcti_consent_version})` : ''}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                }
                if (f.type === 'checkbox') {
                  return (
                    <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.8125rem', color: '#4B5563', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!!form[f.key]}
                        onChange={e => setForm({ ...form, [f.key]: e.target.checked })}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                      <span>{f.label}{f.required && <span style={{ color: '#DC2626' }}> *</span>}</span>
                    </label>
                  )
                }
                return (
                  <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '.8125rem', color: '#4B5563' }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span>{f.label}{f.required && <span style={{ color: '#DC2626' }}> *</span>}</span>
                      {canCopyFromMcnz && (
                        <button type="button"
                          onClick={() => setForm({ ...form, prescriber_number: form.mcnz_registration_number })}
                          style={{ background: 'none', border: 'none', color: TEAL, fontSize: '.75rem', cursor: 'pointer', padding: 0, fontFamily: FF, fontWeight: 600 }}>
                          Same as MCNZ ↑
                        </button>
                      )}
                    </span>
                    <input
                      type="text"
                      value={form[f.key] ?? ''}
                      placeholder={f.placeholder || ''}
                      onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                      style={{ padding: '.55rem .7rem', border: '1.5px solid #E2E8F0', borderRadius: 8, fontFamily: FF, fontSize: '.9rem', outline: 'none' }}
                    />
                  </label>
                )
              })}
            </div>
          </section>
        ))}

        <SignatureSection me={me} onUpdated={url => setMe({ ...me, signature_url: url })} />

        <ComplianceSection me={me} />

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
      <h3 style={{ fontSize: '.95rem', fontWeight: 700, color: NAVY, margin: '0 0 .35rem' }}>Signature</h3>
      <div style={{ fontSize: '.75rem', color: '#6B7280', marginBottom: '.5rem' }}>
        Used on prescriptions (for clinical prescribers) and on countersigned contracts (for authorised signers).
      </div>
      {me.signature_url ? (
        <div style={{ marginBottom: '.75rem' }}>
          <div style={{ fontSize: '.75rem', color: '#6B7280', marginBottom: 4 }}>Current signature on file:</div>
          <img src={me.signature_url} alt="current signature" style={{ maxHeight: 80, background: 'white', border: '1px solid #E2E8F0', borderRadius: 6, padding: 4 }} />
        </div>
      ) : (
        <div style={{ fontSize: '.8125rem', color: '#B45309', marginBottom: '.75rem' }}>No signature on file. Draw one below to add it.</div>
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

// ── Compliance documents ────────────────────────────────────────────────────
// APC (Annual Practising Certificate) + Medical Indemnity + active contract.
// Reads compliance state on mount; provider can upload/replace each PDF +
// set expiry metadata. Contract is read-only here — admin sends the sign
// link from the providers list in Admin.
function ComplianceSection({ me }) {
  const [state, setState] = useState({ loading: true, compliance: null, msg: '' })
  async function reload() {
    try {
      const { getProviderCompliance } = await import('../../lib/supabase')
      const c = await getProviderCompliance()
      setState(s => ({ ...s, loading: false, compliance: c }))
    } catch (e) { setState(s => ({ ...s, loading: false, msg: 'Error: ' + e.message })) }
  }
  useEffect(() => { reload() }, [])

  if (state.loading) {
    return (
      <section style={{ background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #E2E8F0', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '.95rem', fontWeight: 700, color: NAVY, margin: '0 0 .5rem' }}>Compliance documents</h3>
        <div style={{ fontSize: '.8rem', color: '#6B7280' }}>Loading…</div>
      </section>
    )
  }
  const c = state.compliance || {}
  return (
    <section style={{ background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #E2E8F0', marginBottom: '1rem' }}>
      <h3 style={{ fontSize: '.95rem', fontWeight: 700, color: NAVY, margin: '0 0 .35rem' }}>Compliance documents</h3>
      <div style={{ fontSize: '.75rem', color: '#6B7280', marginBottom: '.85rem' }}>
        Keep your Annual Practising Certificate and Medical Indemnity current. Tere admin sees expiry dates and gets reminders 60/30/7 days before they lapse.
      </div>

      <ComplianceDocCard
        title="Annual Practising Certificate (APC)"
        kind="apc"
        fields={[
          { key: 'apcNumber',     label: 'APC number',   placeholder: 'e.g. 12345' },
          { key: 'apcExpiryDate', label: 'Expiry date',  type: 'date', required: true },
        ]}
        currentMeta={c.apc}
        onDone={reload}
      />

      <ComplianceDocCard
        title="Medical Indemnity"
        kind="mi"
        fields={[
          { key: 'miInsurer',      label: 'Insurer',        placeholder: 'MPS, Medico Legal Society NZ, etc.' },
          { key: 'miPolicyNumber', label: 'Policy number',  placeholder: 'e.g. MPS-123456' },
          { key: 'miExpiryDate',   label: 'Expiry date',    type: 'date', required: true },
        ]}
        currentMeta={c.medical_indemnity}
        onDone={reload}
      />

      <div style={{ marginTop: '1rem', padding: '.85rem 1rem', background: c.contract?.countersigned_at ? '#ECFDF5' : c.contract ? '#FFFBEB' : '#F8FAFC', border: `1px solid ${c.contract?.countersigned_at ? '#A7F3D0' : c.contract ? '#FDE68A' : '#E2E8F0'}`, borderRadius: 10 }}>
        <div style={{ fontWeight: 700, color: NAVY, fontSize: '.85rem', marginBottom: 4 }}>Independent Contractor Agreement</div>
        {c.contract?.countersigned_at ? (
          <div style={{ fontSize: '.8rem', color: '#065F46' }}>
            ✓ Signed &amp; countersigned {new Date(c.contract.countersigned_at).toLocaleDateString('en-NZ')}
            {c.contract.signed_pdf_url && (
              <> — <a href={c.contract.signed_pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: TEAL, textDecoration: 'underline' }}>download signed PDF</a></>
            )}
          </div>
        ) : c.contract?.applicant_signed_at ? (
          <div style={{ fontSize: '.8rem', color: '#92400E' }}>You've signed — waiting for Tere Health to countersign.</div>
        ) : c.contract ? (
          <div style={{ fontSize: '.8rem', color: '#92400E' }}>Contract awaiting your signature — check your email for the sign link.</div>
        ) : (
          <div style={{ fontSize: '.8rem', color: '#6B7280' }}>No contract on file yet. Contact admin if you should have one.</div>
        )}
      </div>

      {state.msg && <div style={{ fontSize: '.8rem', color: '#DC2626', marginTop: 8 }}>{state.msg}</div>}
    </section>
  )
}

function ComplianceDocCard({ title, kind, fields, currentMeta, onDone }) {
  const [form, setForm] = useState({})
  const [pdfB64, setPdfB64] = useState(null)
  const [pdfName, setPdfName] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function pickPdf(file) {
    if (!file) return
    if (file.type !== 'application/pdf') { setMsg('PDF only.'); return }
    if (file.size > 4 * 1024 * 1024)   { setMsg('4MB max.'); return }
    const { fileToBase64 } = await import('../../lib/supabase')
    setPdfB64(await fileToBase64(file))
    setPdfName(file.name)
    setMsg('')
  }
  async function submit() {
    if (!pdfB64) { setMsg('Attach a PDF first.'); return }
    const expiryKey = kind === 'apc' ? 'apcExpiryDate' : 'miExpiryDate'
    if (!form[expiryKey]) { setMsg('Expiry date required.'); return }
    setSaving(true); setMsg('')
    try {
      const { uploadProviderCompliancePdf } = await import('../../lib/supabase')
      await uploadProviderCompliancePdf({ kind, pdfBase64: pdfB64, pdfName, ...form })
      setPdfB64(null); setPdfName(null); setForm({})
      setMsg('Saved.')
      await onDone?.()
    } catch (e) { setMsg('Error: ' + e.message) }
    finally { setSaving(false) }
  }

  const currentExpiry = currentMeta?.expiry_date
  const expiryStatus = (() => {
    if (!currentExpiry) return { color: '#6B7280', label: 'no date on file' }
    const days = Math.floor((new Date(currentExpiry) - new Date()) / 86_400_000)
    if (days < 0)   return { color: '#DC2626', label: `expired ${-days}d ago` }
    if (days <= 30) return { color: '#B45309', label: `expires in ${days}d` }
    return { color: '#059669', label: `valid until ${new Date(currentExpiry).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}` }
  })()

  return (
    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '.85rem 1rem', marginBottom: '.85rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9rem' }}>{title}</div>
        <div style={{ fontSize: '.72rem', color: expiryStatus.color, fontWeight: 600 }}>{expiryStatus.label}</div>
      </div>

      {currentMeta?.file_url && (
        <div style={{ fontSize: '.78rem', color: '#374151', marginBottom: 8 }}>
          📎 <a href={currentMeta.file_url} target="_blank" rel="noopener noreferrer" style={{ color: TEAL, textDecoration: 'underline' }}>current PDF on file</a>
          {kind === 'apc' && currentMeta.number && <> · APC #{currentMeta.number}</>}
          {kind === 'mi' && currentMeta.insurer && <> · {currentMeta.insurer}{currentMeta.policy_number ? ` (${currentMeta.policy_number})` : ''}</>}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.5rem', marginBottom: '.5rem' }}>
        {fields.map(f => (
          <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '.75rem', color: '#4B5563' }}>
            {f.label}{f.required && <span style={{ color: '#DC2626' }}> *</span>}
            <input
              type={f.type || 'text'}
              value={form[f.key] ?? ''}
              placeholder={f.placeholder || ''}
              onChange={e => setForm({ ...form, [f.key]: e.target.value })}
              style={{ padding: '.4rem .6rem', border: '1.5px solid #E2E8F0', borderRadius: 6, fontFamily: FF, fontSize: '.85rem' }}
            />
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="file" accept="application/pdf" onChange={e => pickPdf(e.target.files?.[0])} style={{ fontSize: '.8rem' }} disabled={saving} />
        {pdfName && <span style={{ fontSize: '.75rem', color: '#0B6E76' }}>📎 {pdfName}</span>}
        <button onClick={submit} disabled={saving || !pdfB64}
          style={{ marginLeft: 'auto', background: TEAL, color: 'white', border: 'none', padding: '.4rem .9rem', borderRadius: 6, fontWeight: 700, fontFamily: FF, fontSize: '.8rem', cursor: (saving || !pdfB64) ? 'not-allowed' : 'pointer', opacity: (saving || !pdfB64) ? .6 : 1 }}>
          {saving ? 'Saving…' : (currentMeta?.file_url ? 'Replace' : 'Upload')}
        </button>
      </div>
      {msg && <div style={{ fontSize: '.75rem', color: msg.startsWith('Error') ? '#DC2626' : '#059669', marginTop: 6 }}>{msg}</div>}
    </div>
  )
}
