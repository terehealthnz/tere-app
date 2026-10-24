import React, { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'

const TEAL = '#0B6E76'
const NAVY = '#0D2B45'
const FF = 'Plus Jakarta Sans, sans-serif'

export default function AdminGpConfig() {
  const [loading, setLoading] = useState(true)
  const [providers, setProviders] = useState([])
  const [funders, setFunders] = useState([])
  const [slotTotals, setSlotTotals] = useState({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const [slotForm, setSlotForm] = useState({ provider_id: '', from_date: '', to_date: '', start_time: '09:00', end_time: '17:00', duration_minutes: 15, days_of_week: '1,2,3,4,5' })
  const [funderForm, setFunderForm] = useState({ name: '', funding_source: 'pho_capitated' })

  async function load() {
    setLoading(true)
    try {
      const r = await apiFetch('/api/admin-gp-config?action=list')
      const d = await r.json()
      setProviders(d.providers || [])
      setFunders(d.funders || [])
      setSlotTotals(d.slot_totals || {})
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function toggle(providerId, field, value) {
    setBusy(true); setMsg('')
    try {
      const r = await apiFetch('/api/admin-gp-config', { method: 'POST', body: JSON.stringify({ action: 'toggle_queue', provider_id: providerId, [field]: value }) })
      const d = await r.json()
      if (r.ok) { setMsg('Saved'); await load() } else setMsg(d.error || 'Error')
    } finally { setBusy(false) }
  }

  async function generateSlots() {
    if (!slotForm.provider_id || !slotForm.from_date || !slotForm.to_date) { setMsg('Pick a provider and date range.'); return }
    setBusy(true); setMsg('')
    try {
      const dow = String(slotForm.days_of_week).split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n))
      const r = await apiFetch('/api/admin-gp-config', { method: 'POST', body: JSON.stringify({ action: 'generate_slots', provider_id: slotForm.provider_id, from_date: slotForm.from_date, to_date: slotForm.to_date, start_time: slotForm.start_time, end_time: slotForm.end_time, duration_minutes: Number(slotForm.duration_minutes), days_of_week: dow }) })
      const d = await r.json()
      if (r.ok) { setMsg(`Inserted ${d.inserted} slots`); await load() } else setMsg(d.error || 'Error')
    } finally { setBusy(false) }
  }

  async function addFunder() {
    if (!funderForm.name) { setMsg('Funder name required.'); return }
    setBusy(true); setMsg('')
    try {
      const r = await apiFetch('/api/admin-gp-config', { method: 'POST', body: JSON.stringify({ action: 'add_funder', ...funderForm }) })
      const d = await r.json()
      if (r.ok) { setMsg('Funder added'); setFunderForm({ name: '', funding_source: 'pho_capitated' }); await load() } else setMsg(d.error || 'Error')
    } finally { setBusy(false) }
  }

  if (loading) return <div style={{ padding: '2rem', color: '#6B7280', fontFamily: FF }}>Loading GP config...</div>

  const sectionStyle = { background: 'white', borderRadius: 12, padding: '1.25rem', marginBottom: '1rem', border: '1px solid #E2E8F0' }
  const headingStyle = { fontSize: '1rem', fontWeight: 700, color: NAVY, marginBottom: '.75rem', fontFamily: FF }
  const inputStyle = { padding: '.5rem .625rem', border: '1.5px solid #E2E8F0', borderRadius: 6, fontFamily: FF, fontSize: '.875rem' }
  const btnStyle = { background: TEAL, color: 'white', border: 'none', padding: '.6rem 1rem', borderRadius: 8, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: FF, fontSize: '.875rem' }

  return (
    <div style={{ fontFamily: FF }}>
      {msg && <div style={{ padding: '.625rem', marginBottom: '1rem', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, color: '#166534', fontSize: '.875rem' }}>{msg}</div>}

      <div style={sectionStyle}>
        <div style={headingStyle}>Providers &mdash; queue participation</div>
        <div style={{ fontSize: '.8125rem', color: '#6B7280', marginBottom: '.75rem' }}>Flip which queues each provider appears in. Changes save on tap.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '.5rem', alignItems: 'center', fontSize: '.75rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', padding: '.5rem 0', borderBottom: '1px solid #E2E8F0' }}>
          <div>Name</div><div>Acute queue</div><div>Appointments</div><div>Slots</div>
        </div>
        {providers.map(p => {
          const t = slotTotals[p.id] || {}
          return (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '.5rem', alignItems: 'center', padding: '.625rem 0', borderBottom: '1px solid #F3F4F6' }}>
              <div style={{ color: NAVY, fontWeight: 600 }}>{p.display_name}<div style={{ color: '#9CA3AF', fontSize: '.6875rem', fontWeight: 400 }}>{p.provider_type}</div></div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8125rem' }}><input type="checkbox" checked={!!p.can_work_acute} disabled={busy} onChange={e => toggle(p.id, 'can_work_acute', e.target.checked)} />{p.can_work_acute ? 'On' : 'Off'}</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8125rem' }}><input type="checkbox" checked={!!p.can_work_gp} disabled={busy} onChange={e => toggle(p.id, 'can_work_gp', e.target.checked)} />{p.can_work_gp ? 'On' : 'Off'}</label>
              <div style={{ fontSize: '.75rem', color: '#6B7280' }}>{t.available || 0} open / {t.confirmed || 0} booked</div>
            </div>
          )
        })}
        {providers.length === 0 && <div style={{ color: '#6B7280', fontSize: '.875rem' }}>No providers.</div>}
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>Generate slots</div>
        <div style={{ fontSize: '.8125rem', color: '#6B7280', marginBottom: '.75rem' }}>Bulk-create available slots for a provider across a date range. Existing slots at the same (provider, start) are left untouched.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.5rem', marginBottom: '.75rem' }}>
          <select value={slotForm.provider_id} onChange={e => setSlotForm(f => ({ ...f, provider_id: e.target.value }))} style={inputStyle}>
            <option value="">-- GP --</option>
            {providers.filter(p => p.can_work_gp).map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
          <input type="date" value={slotForm.from_date} onChange={e => setSlotForm(f => ({ ...f, from_date: e.target.value }))} style={inputStyle} />
          <input type="date" value={slotForm.to_date} onChange={e => setSlotForm(f => ({ ...f, to_date: e.target.value }))} style={inputStyle} />
          <input type="time" value={slotForm.start_time} onChange={e => setSlotForm(f => ({ ...f, start_time: e.target.value }))} style={inputStyle} />
          <input type="time" value={slotForm.end_time} onChange={e => setSlotForm(f => ({ ...f, end_time: e.target.value }))} style={inputStyle} />
          <input type="number" min={5} max={120} value={slotForm.duration_minutes} onChange={e => setSlotForm(f => ({ ...f, duration_minutes: e.target.value }))} placeholder="Duration (min)" style={inputStyle} />
          <input type="text" value={slotForm.days_of_week} onChange={e => setSlotForm(f => ({ ...f, days_of_week: e.target.value }))} placeholder="Days 0-6 (0=Sun)" style={inputStyle} />
        </div>
        <button onClick={generateSlots} disabled={busy} style={btnStyle}>Generate</button>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>Funders</div>
        <div style={{ fontSize: '.8125rem', color: '#6B7280', marginBottom: '.75rem' }}>Add a funder once the MoU is signed. Capitated funders bypass patient payment.</div>
        {funders.map(f => (
          <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '.5rem 0', borderBottom: '1px solid #F3F4F6', fontSize: '.875rem', color: NAVY }}>
            <div><strong>{f.name}</strong> <span style={{ color: '#6B7280', fontSize: '.75rem' }}>({f.funding_source})</span></div>
            <div style={{ color: f.active ? '#166534' : '#9CA3AF', fontSize: '.75rem', fontWeight: 600 }}>{f.active ? 'Active' : 'Inactive'}</div>
          </div>
        ))}
        {funders.length === 0 && <div style={{ color: '#9CA3AF', fontSize: '.875rem', marginBottom: '.75rem' }}>No funders yet.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '.5rem', marginTop: '.75rem' }}>
          <input type="text" value={funderForm.name} onChange={e => setFunderForm(f => ({ ...f, name: e.target.value }))} placeholder="Funder name" style={inputStyle} />
          <select value={funderForm.funding_source} onChange={e => setFunderForm(f => ({ ...f, funding_source: e.target.value }))} style={inputStyle}>
            <option value="pho_capitated">PHO capitated</option>
            <option value="employer_paid">Employer paid</option>
            <option value="patient_paid">Patient paid</option>
          </select>
        </div>
        <button onClick={addFunder} disabled={busy} style={{ ...btnStyle, marginTop: '.5rem' }}>Add funder</button>
      </div>
    </div>
  )
}
