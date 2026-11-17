// Admin UI for issuing Practitioner's Supply Orders + Standing Orders
// to third-party organisations Tere Health acts as Medical Director for.

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'

export default function AdminPSO() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [mode, setMode] = useState('pso')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/api/pso?action=list')
      if (r.status === 401) { navigate('/clinician'); return }
      if (r.status === 403) { setErr('Admin access required.'); setData({ organisations: [], psos: [], standing_orders: [] }); return }
      const j = await r.json()
      setData(j)
      if (!selectedOrgId && j.organisations?.length) setSelectedOrgId(j.organisations[0].id)
    } catch (e) { setErr(e.message) }
  }, [navigate, selectedOrgId])

  useEffect(() => { load() }, [load])

  if (!data) return <div style={{ padding: '2rem', fontFamily: FF, color: '#6B7280' }}>Loading…</div>

  const org = data.organisations.find(o => o.id === selectedOrgId)
  const orgPsos = data.psos.filter(p => p.organisation_id === selectedOrgId)
  const orgSos  = data.standing_orders.filter(s => s.organisation_id === selectedOrgId)

  return (
    <div style={{ minHeight: '100dvh', background: '#F7F5F0', fontFamily: FF, paddingBottom: '4rem' }}>
      <nav style={{ background: NAVY, color: 'white', padding: '.9rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button onClick={() => navigate('/admin')} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.4rem', cursor: 'pointer', padding: 0 }}>←</button>
        <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>PSOs & Standing Orders</div>
        <div style={{ marginLeft: 'auto', fontSize: '.8125rem', color: 'rgba(212,238,240,0.7)' }}>Medical Director module</div>
      </nav>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 1rem', display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.25rem' }}>
        <aside>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
            <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em' }}>Organisations</div>
            <button onClick={() => setMode('new_org')} style={{ background: 'none', border: 'none', color: TEAL, fontSize: '.75rem', fontWeight: 700, cursor: 'pointer' }}>+ New</button>
          </div>
          {(data.organisations || []).map(o => (
            <button key={o.id} onClick={() => { setSelectedOrgId(o.id); setMode('pso') }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '.6rem .75rem', marginBottom: 4, borderRadius: 8, border: `1px solid ${o.id === selectedOrgId ? TEAL : '#E5E7EB'}`, background: o.id === selectedOrgId ? 'white' : '#F9FAFB', cursor: 'pointer', fontFamily: FF }}>
              <div style={{ fontWeight: 700, color: NAVY, fontSize: '.875rem' }}>{o.name}</div>
              {o.base_location && <div style={{ fontSize: '.6875rem', color: '#6B7280', marginTop: 2 }}>{o.base_location}</div>}
            </button>
          ))}
          {err && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '.5rem .75rem', borderRadius: 6, fontSize: '.75rem', marginTop: '.75rem' }}>{err}</div>}
        </aside>

        <main>
          {mode === 'new_org' ? (
            <NewOrgForm onDone={() => { setMode('pso'); load() }} onCancel={() => setMode('pso')} />
          ) : org ? (
            <>
              <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 10, padding: '1rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '1.0625rem', fontWeight: 700, color: NAVY }}>{org.name}</div>
                    <div style={{ fontSize: '.8125rem', color: '#6B7280', marginTop: 4 }}>
                      {org.base_location && <>{org.base_location} · </>}
                      {org.contact_name} ({org.contact_email})
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '.4rem' }}>
                    <TabBtn active={mode === 'pso'} onClick={() => setMode('pso')}>Issue PSO</TabBtn>
                    <TabBtn active={mode === 'so'}  onClick={() => setMode('so')}>Issue Standing Order</TabBtn>
                  </div>
                </div>
              </div>

              {mode === 'pso' && <PsoForm org={org} onDone={load} />}
              {mode === 'so'  && <StandingOrderForm org={org} psos={orgPsos} onDone={load} />}

              <History psos={orgPsos} sos={orgSos} />
            </>
          ) : (
            <div style={{ padding: '2rem', color: '#6B7280', fontSize: '.875rem' }}>Select or create an organisation.</div>
          )}
        </main>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      style={{ background: active ? TEAL : 'white', color: active ? 'white' : NAVY, border: `1px solid ${active ? TEAL : '#E5E7EB'}`, borderRadius: 6, padding: '.4rem .7rem', fontFamily: FF, fontSize: '.75rem', fontWeight: 700, cursor: 'pointer' }}>
      {children}
    </button>
  )
}

function Input({ label, value, onChange, placeholder, required }) {
  return (
    <div style={{ marginBottom: '.6rem' }}>
      <label style={{ display: 'block', fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>
        {label}{required && <span style={{ color: '#DC2626' }}> *</span>}
      </label>
      <input value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '.55rem .75rem', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: '.875rem', fontFamily: FF }} />
    </div>
  )
}

function TextArea({ label, value, onChange, placeholder, rows = 3, required }) {
  return (
    <div style={{ marginBottom: '.6rem' }}>
      <label style={{ display: 'block', fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>
        {label}{required && <span style={{ color: '#DC2626' }}> *</span>}
      </label>
      <textarea value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        style={{ width: '100%', padding: '.55rem .75rem', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: '.875rem', fontFamily: FF, resize: 'vertical' }} />
    </div>
  )
}

function NewOrgForm({ onDone, onCancel }) {
  const [form, setForm] = useState({ name: '', base_location: '', contact_name: '', contact_email: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function save() {
    setErr(''); setBusy(true)
    try {
      const r = await apiFetch('/api/pso?action=create_org', { method: 'POST', body: JSON.stringify(form) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Failed')
      onDone()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 10, padding: '1rem' }}>
      <div style={{ fontSize: '1rem', fontWeight: 700, color: NAVY, marginBottom: '.75rem' }}>New organisation</div>
      <Input label="Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} required />
      <Input label="Base location" value={form.base_location} onChange={v => setForm(f => ({ ...f, base_location: v }))} placeholder="e.g. Anakiwa, Marlborough Sounds" />
      <Input label="Receiving contact name" value={form.contact_name} onChange={v => setForm(f => ({ ...f, contact_name: v }))} />
      <Input label="Receiving contact email" value={form.contact_email} onChange={v => setForm(f => ({ ...f, contact_email: v }))} />
      {err && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '.5rem .75rem', borderRadius: 6, fontSize: '.8125rem', margin: '.5rem 0' }}>{err}</div>}
      <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
        <button onClick={onCancel} style={{ background: '#F3F4F6', border: 'none', borderRadius: 6, padding: '.55rem 1rem', fontFamily: FF, fontWeight: 600, fontSize: '.8125rem', cursor: 'pointer', color: '#4B5563' }}>Cancel</button>
        <button onClick={save} disabled={busy || !form.name} style={{ background: TEAL, border: 'none', borderRadius: 6, padding: '.55rem 1rem', fontFamily: FF, fontWeight: 700, fontSize: '.8125rem', cursor: 'pointer', color: 'white', opacity: (busy || !form.name) ? 0.5 : 1 }}>
          {busy ? 'Saving…' : 'Save organisation'}
        </button>
      </div>
    </div>
  )
}

function PsoForm({ org, onDone }) {
  const [items, setItems] = useState([{ name: '', strength: '', form: '', quantity: '' }])
  const [purpose, setPurpose] = useState('')
  const [storage, setStorage] = useState('')
  const [pharmacy, setPharmacy] = useState({ name: '', address: '', email: '' })
  const [validUntil, setValidUntil] = useState(new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  function updateItem(i, patch) { setItems(xs => xs.map((it, idx) => idx === i ? { ...it, ...patch } : it)) }
  function addItem() { setItems(xs => [...xs, { name: '', strength: '', form: '', quantity: '' }]) }
  function removeItem(i) { setItems(xs => xs.length === 1 ? xs : xs.filter((_, idx) => idx !== i)) }

  async function issue() {
    setBusy(true); setResult(null)
    try {
      const r = await apiFetch('/api/pso?action=issue_pso', {
        method: 'POST',
        body: JSON.stringify({
          organisation_id: org.id,
          items: items.filter(i => i.name && i.quantity),
          purpose,
          storage_location: storage,
          pharmacy_name: pharmacy.name, pharmacy_address: pharmacy.address, pharmacy_email: pharmacy.email,
          valid_until: validUntil,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Issue failed')
      setResult({ ok: true, psoNumber: j.pso?.pso_number, deliveryError: j.delivery_error })
      onDone()
    } catch (e) { setResult({ ok: false, error: e.message }) } finally { setBusy(false) }
  }

  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 10, padding: '1rem' }}>
      <div style={{ fontSize: '1rem', fontWeight: 700, color: NAVY, marginBottom: '.75rem' }}>Issue PSO to {org.name}</div>

      <div style={{ marginBottom: '.75rem' }}>
        <div style={{ fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>Medicines</div>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr 1fr auto', gap: 4, marginBottom: 4 }}>
            <input placeholder="Medicine" value={it.name} onChange={e => updateItem(i, { name: e.target.value })} style={{ padding: '.4rem .5rem', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: '.8125rem', fontFamily: FF }} />
            <input placeholder="Strength" value={it.strength} onChange={e => updateItem(i, { strength: e.target.value })} style={{ padding: '.4rem .5rem', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: '.8125rem', fontFamily: FF }} />
            <input placeholder="Form (e.g. MDI)" value={it.form} onChange={e => updateItem(i, { form: e.target.value })} style={{ padding: '.4rem .5rem', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: '.8125rem', fontFamily: FF }} />
            <input placeholder="Qty" value={it.quantity} onChange={e => updateItem(i, { quantity: e.target.value })} style={{ padding: '.4rem .5rem', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: '.8125rem', fontFamily: FF }} />
            <button onClick={() => removeItem(i)} disabled={items.length === 1} style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: '1rem', cursor: items.length === 1 ? 'default' : 'pointer', padding: '0 .3rem' }}>×</button>
          </div>
        ))}
        <button onClick={addItem} style={{ background: 'none', border: '1px dashed #D1D5DB', borderRadius: 6, padding: '.4rem', fontSize: '.75rem', color: TEAL, fontWeight: 600, cursor: 'pointer', fontFamily: FF, width: '100%' }}>+ Add another item</button>
      </div>

      <TextArea label="Purpose of supply" value={purpose} onChange={setPurpose} rows={3} required
        placeholder="e.g. Emergency treatment of acute bronchospasm in students and staff on Outward Bound courses. Administration by trained instructors under a written Standing Order (issued separately)." />
      <TextArea label="Storage location" value={storage} onChange={setStorage} rows={2}
        placeholder="e.g. Anakiwa base medical room AND in Instructor First Aid Kits" />

      <div style={{ borderTop: '1px solid #E5E7EB', margin: '.75rem 0 .5rem', paddingTop: '.5rem' }}>
        <div style={{ fontSize: '.75rem', fontWeight: 700, color: NAVY, marginBottom: '.4rem' }}>Dispensing pharmacy</div>
        <Input label="Pharmacy name" value={pharmacy.name} onChange={v => setPharmacy(p => ({ ...p, name: v }))} required placeholder="e.g. Picton Health Care Pharmacy" />
        <Input label="Address" value={pharmacy.address} onChange={v => setPharmacy(p => ({ ...p, address: v }))} placeholder="e.g. 6 High Street, Picton 7220" />
        <Input label="Email" value={pharmacy.email} onChange={v => setPharmacy(p => ({ ...p, email: v }))} required placeholder="pharmacy@..." />
      </div>

      <Input label="Valid until" value={validUntil} onChange={setValidUntil} placeholder="YYYY-MM-DD" />

      {result?.ok && (
        <div style={{ background: '#D1FAE5', color: '#065F46', padding: '.65rem .85rem', borderRadius: 8, fontSize: '.8125rem', margin: '.75rem 0', lineHeight: 1.5 }}>
          ✓ Issued <b>{result.psoNumber}</b>. {result.deliveryError
            ? <>Email failed: {result.deliveryError}. The PSO is saved; retry delivery manually.</>
            : <>Emailed to <b>{pharmacy.email}</b>{org.contact_email ? <> with <b>{org.contact_email}</b> cc'd</> : null}.</>}
        </div>
      )}
      {result?.error && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '.65rem .85rem', borderRadius: 8, fontSize: '.8125rem', margin: '.75rem 0' }}>{result.error}</div>}

      <button onClick={issue} disabled={busy || items.filter(i => i.name && i.quantity).length === 0 || !purpose || !pharmacy.name || !pharmacy.email}
        style={{ background: TEAL, border: 'none', borderRadius: 8, padding: '.7rem 1.5rem', fontFamily: FF, fontWeight: 700, fontSize: '.875rem', cursor: 'pointer', color: 'white', marginTop: '.5rem', opacity: busy ? 0.5 : 1 }}>
        {busy ? 'Issuing + emailing…' : '✓ Issue PSO + email pharmacy'}
      </button>
    </div>
  )
}

const DEFAULT_SALBUTAMOL_SO = {
  title: 'Salbutamol for Acute Wheeze',
  indication: 'Acute bronchospasm with audible wheeze, prolonged expiration, or respiratory distress in a student or staff member. Includes known asthmatics using their own rescue inhaler inadequately AND not-previously-diagnosed individuals presenting with the same clinical picture.',
  inclusion: [
    'Audible wheeze or prolonged expiration, with or without accessory muscle use',
    'Oxygen saturation (if measurable) ≥ 92% on room air',
    'Able to speak in phrases or short sentences',
    'Alert and oriented',
    'Age ≥ 6 years',
  ],
  exclusion: [
    'Cannot speak in words / silent chest / cyanosis',
    'Oxygen saturation < 92% on room air (if measurable)',
    'Altered consciousness, confusion, or exhaustion',
    'Known anaphylaxis or suspected anaphylaxis — administer EpiPen first and call 111',
    'Age < 6 years',
    'No response or worsening after the second dose',
  ],
  dose: 'Salbutamol 100 mcg metered dose inhaler via spacer.\n\nAdult and child ≥ 6 years: 6 puffs via spacer (1 puff at a time, 4 breaths between puffs).\n\nRepeat after 20 minutes if symptoms persist AND inclusion criteria still met AND no exclusion criteria present. Maximum 2 repeat doses (3 doses total in 60 minutes). If no improvement after 2 doses, call 111.',
  documentation: 'Record for every administration: recipient name, date and time, clinical presentation, dose administered, response, and administrator name. Submit records to the issuing practitioner weekly or at course close, whichever is sooner. Any 111 escalation must be reported within 24 hours.',
}

function StandingOrderForm({ org, psos, onDone }) {
  const [form, setForm] = useState({ ...DEFAULT_SALBUTAMOL_SO, linked_pso_id: psos[0]?.id || '', review_date: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10) })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  function updateList(field, idx, val) {
    setForm(f => ({ ...f, [field]: f[field].map((x, i) => i === idx ? val : x) }))
  }
  function addListItem(field) { setForm(f => ({ ...f, [field]: [...f[field], ''] })) }
  function removeListItem(field, idx) { setForm(f => ({ ...f, [field]: f[field].filter((_, i) => i !== idx) })) }

  async function issue() {
    setBusy(true); setResult(null)
    try {
      const r = await apiFetch('/api/pso?action=issue_standing_order', {
        method: 'POST',
        body: JSON.stringify({ organisation_id: org.id, ...form, inclusion: form.inclusion.filter(x => x.trim()), exclusion: form.exclusion.filter(x => x.trim()) }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Issue failed')
      setResult({ ok: true, soNumber: j.standing_order?.so_number, deliveryError: j.delivery_error })
      onDone()
    } catch (e) { setResult({ ok: false, error: e.message }) } finally { setBusy(false) }
  }

  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 10, padding: '1rem' }}>
      <div style={{ fontSize: '1rem', fontWeight: 700, color: NAVY, marginBottom: '.75rem' }}>Issue Standing Order to {org.name}</div>
      <div style={{ fontSize: '.75rem', color: '#6B7280', marginBottom: '.75rem', fontStyle: 'italic' }}>
        Pre-filled with the Salbutamol/acute-wheeze template. Edit as needed.
      </div>

      <Input label="Title" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} required />
      <TextArea label="Clinical indication" value={form.indication} onChange={v => setForm(f => ({ ...f, indication: v }))} rows={3} required />

      {psos.length > 0 && (
        <div style={{ marginBottom: '.6rem' }}>
          <label style={{ display: 'block', fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>Linked PSO (supply source)</label>
          <select value={form.linked_pso_id} onChange={e => setForm(f => ({ ...f, linked_pso_id: e.target.value }))} style={{ width: '100%', padding: '.55rem .75rem', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: '.875rem', fontFamily: FF, background: 'white' }}>
            <option value="">(none)</option>
            {psos.map(p => <option key={p.id} value={p.id}>{p.pso_number} · {p.items?.[0]?.name}{p.items?.length > 1 ? ` +${p.items.length - 1}` : ''}</option>)}
          </select>
        </div>
      )}

      <ListEditor label="Inclusion criteria" items={form.inclusion} onChange={(i, v) => updateList('inclusion', i, v)} onAdd={() => addListItem('inclusion')} onRemove={i => removeListItem('inclusion', i)} />
      <ListEditor label="Exclusion criteria (call 111)" items={form.exclusion} onChange={(i, v) => updateList('exclusion', i, v)} onAdd={() => addListItem('exclusion')} onRemove={i => removeListItem('exclusion', i)} />

      <TextArea label="Dose and administration" value={form.dose} onChange={v => setForm(f => ({ ...f, dose: v }))} rows={4} required />
      <TextArea label="Documentation requirements" value={form.documentation} onChange={v => setForm(f => ({ ...f, documentation: v }))} rows={3} />
      <Input label="Review date" value={form.review_date} onChange={v => setForm(f => ({ ...f, review_date: v }))} placeholder="YYYY-MM-DD" />

      {result?.ok && (
        <div style={{ background: '#D1FAE5', color: '#065F46', padding: '.65rem .85rem', borderRadius: 8, fontSize: '.8125rem', margin: '.75rem 0', lineHeight: 1.5 }}>
          ✓ Issued <b>{result.soNumber}</b>. {result.deliveryError ? <>Email to org contact failed: {result.deliveryError}.</> : org.contact_email ? <>Emailed to <b>{org.contact_email}</b>.</> : <>Saved (no org contact email on file).</>}
        </div>
      )}
      {result?.error && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '.65rem .85rem', borderRadius: 8, fontSize: '.8125rem', margin: '.75rem 0' }}>{result.error}</div>}

      <button onClick={issue} disabled={busy || !form.title || !form.indication || !form.dose}
        style={{ background: TEAL, border: 'none', borderRadius: 8, padding: '.7rem 1.5rem', fontFamily: FF, fontWeight: 700, fontSize: '.875rem', cursor: 'pointer', color: 'white', marginTop: '.5rem', opacity: busy ? 0.5 : 1 }}>
        {busy ? 'Issuing…' : `✓ Issue Standing Order${org.contact_email ? ' + email ' + org.contact_name : ''}`}
      </button>
    </div>
  )
}

function ListEditor({ label, items, onChange, onAdd, onRemove }) {
  return (
    <div style={{ marginBottom: '.6rem' }}>
      <label style={{ display: 'block', fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>{label}</label>
      {items.map((v, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <input value={v} onChange={e => onChange(i, e.target.value)} style={{ flex: 1, padding: '.4rem .5rem', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: '.8125rem', fontFamily: FF }} />
          <button onClick={() => onRemove(i)} style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: '1rem', cursor: 'pointer', padding: '0 .3rem' }}>×</button>
        </div>
      ))}
      <button onClick={onAdd} style={{ background: 'none', border: '1px dashed #D1D5DB', borderRadius: 6, padding: '.3rem', fontSize: '.6875rem', color: TEAL, fontWeight: 600, cursor: 'pointer', fontFamily: FF, width: '100%' }}>+ Add</button>
    </div>
  )
}

function History({ psos, sos }) {
  if (psos.length === 0 && sos.length === 0) return null
  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.5rem' }}>History</div>
      {psos.map(p => (
        <div key={p.id} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 8, padding: '.75rem 1rem', marginBottom: '.4rem', fontSize: '.8125rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <b style={{ color: NAVY }}>{p.pso_number}</b>
              <span style={{ color: '#6B7280', marginLeft: 6 }}>PSO · {(p.items || []).map(i => i.name).join(', ')}</span>
            </div>
            <div style={{ fontSize: '.6875rem', color: p.sent_at ? '#065F46' : '#92400E' }}>
              {p.sent_at ? `Sent ${new Date(p.sent_at).toLocaleDateString('en-NZ')}` : (p.delivery_error ? 'Email failed' : 'Not sent')}
            </div>
          </div>
          <div style={{ fontSize: '.6875rem', color: '#9CA3AF', marginTop: 2 }}>To {p.pharmacy_email} · Valid until {p.valid_until}</div>
        </div>
      ))}
      {sos.map(s => (
        <div key={s.id} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 8, padding: '.75rem 1rem', marginBottom: '.4rem', fontSize: '.8125rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <b style={{ color: NAVY }}>{s.so_number}</b>
              <span style={{ color: '#6B7280', marginLeft: 6 }}>Standing Order · {s.title}</span>
            </div>
            <div style={{ fontSize: '.6875rem', color: s.sent_at ? '#065F46' : '#92400E' }}>
              {s.sent_at ? `Sent ${new Date(s.sent_at).toLocaleDateString('en-NZ')}` : 'Saved'}
            </div>
          </div>
          <div style={{ fontSize: '.6875rem', color: '#9CA3AF', marginTop: 2 }}>Review by {s.review_date}</div>
        </div>
      ))}
    </div>
  )
}
