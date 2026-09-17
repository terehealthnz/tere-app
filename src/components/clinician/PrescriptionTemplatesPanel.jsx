// Admin > Compliance > Prescription Templates (task #229).
//
// CRUD surface for the clinic-wide curated prescription library (the
// shared_prescription_templates table, distinct from per-provider
// favourites in prescription_templates). Providers pick from these
// via the "📋 Clinic templates" picker in PrescribeModal.
//
// Only admins reach this component — Admin.jsx already gates the page
// behind providerIsAdmin. The API endpoint re-enforces admin-only
// writes so a compromised session-storage flag can't bypass.

import React, { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'

const card = { background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #E2E8F0', marginBottom: '1rem', fontFamily: FF }
const inp  = { padding: '.5rem .625rem', border: '1px solid #E2E8F0', borderRadius: 6, fontFamily: FF, fontSize: '.8125rem', width: '100%', boxSizing: 'border-box' }
const lbl  = { fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }
const btnPrimary = { padding: '6px 14px', background: TEAL, color: 'white', border: 'none', borderRadius: 6, fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' }
const btnGhost   = { padding: '4px 10px', background: 'white', color: NAVY, border: '1px solid #E2E8F0', borderRadius: 6, fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' }
const btnDanger  = { padding: '4px 10px', background: 'white', color: '#DC2626', border: '1px solid #FCA5A5', borderRadius: 6, fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' }

// Mirror of the modal's controlled vocabulary so admins pick from the
// same list — avoids drift between what the modal accepts and what an
// admin can seed.
const FREQ_OPTS = ['', 'OD', 'BD', 'TDS', 'QID', 'nocte', 'Q4H', 'Q6H', 'Q8H', 'PRN', 'STAT', 'weekly']
const FORM_OPTS = ['', 'tablets', 'capsules', 'oral suspension', 'oral liquid', 'drops', 'ear drops', 'cream', 'ointment', 'inhaler', 'suppository', 'patch', 'injection']
const ROUTE_OPTS = ['', 'oral', 'topical', 'inhaled', 'nasal', 'ophthalmic', 'otic', 'rectal', 'sublingual']

const EMPTY_FORM = {
  name: '', condition: '', drug_name: '',
  default_strength: '', default_form: '', default_dose: '', default_route: '',
  default_frequency: '', default_duration: '', default_quantity: '',
  default_repeats: 0, default_directions: '', safety_net_text: '',
  is_paediatric: false, weight_based_dose: '', controlled_drug: false,
  is_active: true, source: '',
}

export default function PrescriptionTemplatesPanel() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState(null)   // template row being edited, or {} for new
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function refresh() {
    setLoading(true)
    try {
      const q = showInactive ? '?includeInactive=1' : ''
      const res = await apiFetch('/api/prescription-templates' + q)
      const data = await res.json().catch(() => ({ templates: [] }))
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setRows(data.templates || [])
    } catch (e) { setRows([]); setErr(e.message) }
    setLoading(false)
  }
  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [showInactive])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.condition || '').toLowerCase().includes(q) ||
      (r.drug_name || '').toLowerCase().includes(q),
    )
  }, [rows, filter])

  function startNew() {
    setErr(null)
    setEditing({ ...EMPTY_FORM })
  }
  function startEdit(row) {
    setErr(null)
    setEditing({
      ...EMPTY_FORM,
      ...row,
      // jsonb column serialised for the textarea — provider edits raw
      // JSON, we parse on save. Keeps the admin surface minimal.
      weight_based_dose: row.weight_based_dose ? JSON.stringify(row.weight_based_dose, null, 2) : '',
    })
  }
  function cancelEdit() { setEditing(null); setErr(null) }

  async function save() {
    if (!editing) return
    setBusy(true); setErr(null)
    try {
      const payload = { ...editing }
      // Parse weight_based_dose from raw JSON text; empty → null.
      if (payload.weight_based_dose && typeof payload.weight_based_dose === 'string') {
        const s = payload.weight_based_dose.trim()
        if (!s) payload.weight_based_dose = null
        else {
          try { payload.weight_based_dose = JSON.parse(s) }
          catch { throw new Error('weight_based_dose must be valid JSON (or empty)') }
        }
      } else if (payload.weight_based_dose === '') {
        payload.weight_based_dose = null
      }
      // Coerce numeric-ish fields.
      payload.default_repeats = Number(payload.default_repeats) || 0

      const isNew = !editing.id
      const res = await apiFetch('/api/prescription-templates', {
        method: isNew ? 'POST' : 'PATCH',
        body: JSON.stringify(isNew ? payload : { ...payload, id: editing.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setEditing(null)
      await refresh()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  async function toggleActive(row) {
    try {
      const res = await apiFetch('/api/prescription-templates', {
        method: 'PATCH',
        body: JSON.stringify({ id: row.id, is_active: !row.is_active }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed')
      await refresh()
    } catch (e) { alert('Failed: ' + e.message) }
  }

  async function remove(row) {
    if (!confirm(`Delete "${row.name}"? This is a hard delete — the retire path is deactivate. Continue?`)) return
    try {
      const res = await apiFetch(`/api/prescription-templates?id=${encodeURIComponent(row.id)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Delete failed')
      await refresh()
    } catch (e) { alert('Failed: ' + e.message) }
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '.75rem' }}>
        <div>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '1rem' }}>Prescription Templates</div>
          <div style={{ fontSize: '.75rem', color: '#6B7280' }}>
            Clinic-wide curated starter prescriptions by condition. Distinct from provider ⭐ favourites.
            Providers pick from active templates in the Prescribe modal.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input placeholder="Filter…" value={filter} onChange={e => setFilter(e.target.value)}
                 style={{ ...inp, width: 160 }} />
          <button onClick={() => setShowInactive(v => !v)}
            style={{ ...btnGhost, borderColor: showInactive ? TEAL : '#E2E8F0', color: showInactive ? TEAL : NAVY, background: showInactive ? '#EFF9F9' : 'white' }}>
            {showInactive ? 'Showing all' : 'Active only'}
          </button>
          <button onClick={startNew} style={btnPrimary}>+ New template</button>
        </div>
      </div>

      {err && !editing && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '.5rem .75rem', borderRadius: 6, fontSize: '.75rem', marginBottom: '.75rem' }}>
          {err}
        </div>
      )}

      {editing && (
        <TemplateEditor
          value={editing}
          onChange={setEditing}
          onSave={save}
          onCancel={cancelEdit}
          busy={busy}
          err={err}
        />
      )}

      {loading ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>Loading…</div>
       : !filtered.length ? (
         <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>
           {rows.length === 0 ? 'No templates yet. Click "+ New template" to add the first, or apply the seed migration.' : `No templates match "${filter}".`}
         </div>
       ) : (
         <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8125rem' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', textAlign: 'left' }}>
                <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Name</th>
                <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Condition</th>
                <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Drug</th>
                <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Flags</th>
                <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Active</th>
                <th style={{ padding: '6px 8px' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid #F1F5F9', opacity: r.is_active ? 1 : 0.55 }}>
                  <td style={{ padding: '6px 8px', color: NAVY, fontWeight: 700 }}>{r.name}</td>
                  <td style={{ padding: '6px 8px', color: '#374151' }}>{r.condition}</td>
                  <td style={{ padding: '6px 8px', color: TEAL, fontWeight: 600 }}>
                    {r.drug_name}
                    {r.default_strength && <span style={{ color: '#6B7280', fontWeight: 400 }}> {r.default_strength}</span>}
                  </td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    {r.is_paediatric && <span style={{ background:'#DBEAFE', color:'#1E40AF', fontSize:'.65rem', fontWeight:700, padding:'1px 6px', borderRadius:99, marginRight:4 }}>Paeds</span>}
                    {r.controlled_drug && <span style={{ background:'#FEE2E2', color:'#991B1B', fontSize:'.65rem', fontWeight:700, padding:'1px 6px', borderRadius:99 }}>Controlled</span>}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <button onClick={() => toggleActive(r)}
                      style={{ background: r.is_active ? '#DCFCE7' : '#F3F4F6', color: r.is_active ? '#065F46' : '#6B7280', border:'none', borderRadius:99, padding:'2px 10px', fontSize:'.65rem', fontWeight:700, cursor:'pointer', fontFamily: FF }}>
                      {r.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button onClick={() => startEdit(r)} style={{ ...btnGhost, marginRight: 4 }}>Edit</button>
                    <button onClick={() => remove(r)} style={btnDanger}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Editor form ─────────────────────────────────────────────────────────────

function TemplateEditor({ value, onChange, onSave, onCancel, busy, err }) {
  const set = (k, v) => onChange({ ...value, [k]: v })
  const isNew = !value.id

  return (
    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '1rem', marginBottom: '1rem' }}>
      <div style={{ fontSize: '.9375rem', fontWeight: 700, color: NAVY, marginBottom: '.75rem' }}>
        {isNew ? 'New template' : `Edit — ${value.name || '(unnamed)'}`}
      </div>

      {err && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '.5rem .75rem', borderRadius: 6, fontSize: '.75rem', marginBottom: '.75rem' }}>
          {err}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>Name <span style={{color:'#DC2626'}}>*</span></label>
          <input value={value.name} onChange={e => set('name', e.target.value)} style={inp}
                 placeholder='e.g. "Acute otitis media (paeds) — amoxicillin"' />
        </div>
        <div>
          <label style={lbl}>Condition / indication <span style={{color:'#DC2626'}}>*</span></label>
          <input value={value.condition} onChange={e => set('condition', e.target.value)} style={inp}
                 placeholder="e.g. Uncomplicated UTI, adult female" />
        </div>
        <div>
          <label style={lbl}>Generic drug name <span style={{color:'#DC2626'}}>*</span></label>
          <input value={value.drug_name} onChange={e => set('drug_name', e.target.value)} style={inp}
                 placeholder="e.g. nitrofurantoin (match NZF monograph name where possible)" />
        </div>
        <div>
          <label style={lbl}>Strength</label>
          <input value={value.default_strength || ''} onChange={e => set('default_strength', e.target.value)} style={inp} placeholder="e.g. 500mg" />
        </div>
        <div>
          <label style={lbl}>Form</label>
          <select value={value.default_form || ''} onChange={e => set('default_form', e.target.value)} style={inp}>
            {FORM_OPTS.map(v => <option key={v} value={v}>{v || '— select —'}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Dose</label>
          <input value={value.default_dose || ''} onChange={e => set('default_dose', e.target.value)} style={inp} placeholder="e.g. 1 tablet" />
        </div>
        <div>
          <label style={lbl}>Route</label>
          <select value={value.default_route || ''} onChange={e => set('default_route', e.target.value)} style={inp}>
            {ROUTE_OPTS.map(v => <option key={v} value={v}>{v || '— select —'}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Frequency</label>
          <select value={value.default_frequency || ''} onChange={e => set('default_frequency', e.target.value)} style={inp}>
            {FREQ_OPTS.map(v => <option key={v} value={v}>{v || '— select —'}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Duration</label>
          <input value={value.default_duration || ''} onChange={e => set('default_duration', e.target.value)} style={inp} placeholder='e.g. "5 days", "single dose", "ongoing"' />
        </div>
        <div>
          <label style={lbl}>Quantity</label>
          <input value={value.default_quantity || ''} onChange={e => set('default_quantity', e.target.value)} style={inp} placeholder="e.g. 15 capsules" />
        </div>
        <div>
          <label style={lbl}>Repeats (0-12)</label>
          <input type="number" min={0} max={12} value={value.default_repeats ?? 0} onChange={e => set('default_repeats', e.target.value)} style={inp} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>Directions / counsel</label>
          <textarea rows={3} value={value.default_directions || ''} onChange={e => set('default_directions', e.target.value)}
                    style={{ ...inp, resize: 'vertical' }}
                    placeholder="Instructions the pharmacist and patient see on the label." />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>Safety-net text</label>
          <textarea rows={3} value={value.safety_net_text || ''} onChange={e => set('safety_net_text', e.target.value)}
                    style={{ ...inp, resize: 'vertical' }}
                    placeholder="Return-if-worse wording. Appended to the provider's directions when template is applied." />
        </div>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '.8125rem', color: NAVY, fontWeight: 600 }}>
            <input type="checkbox" checked={!!value.is_paediatric} onChange={e => set('is_paediatric', e.target.checked)} />
            Paediatric template
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '.8125rem', color: '#991B1B', fontWeight: 600 }}>
            <input type="checkbox" checked={!!value.controlled_drug} onChange={e => set('controlled_drug', e.target.checked)} />
            Controlled drug (excluded from picker)
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '.8125rem', color: NAVY, fontWeight: 600 }}>
            <input type="checkbox" checked={!!value.is_active} onChange={e => set('is_active', e.target.checked)} />
            Active
          </label>
        </div>
        {value.is_paediatric && (
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Weight-based dose (JSON — optional guidance)</label>
            <textarea rows={4}
              value={typeof value.weight_based_dose === 'string' ? value.weight_based_dose : JSON.stringify(value.weight_based_dose || '', null, 2)}
              onChange={e => set('weight_based_dose', e.target.value)}
              style={{ ...inp, resize: 'vertical', fontFamily: 'ui-monospace, Menlo, monospace' }}
              placeholder='{"mg_per_kg_per_dose": 15, "max_mg_per_dose": 500, "notes": "…"}' />
            <div style={{ fontSize: '.7rem', color: '#6B7280', marginTop: 4 }}>
              Rendered to providers as guidance text — no auto-calculation yet (task #229 non-goal).
            </div>
          </div>
        )}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>Source / provenance (optional)</label>
          <input value={value.source || ''} onChange={e => set('source', e.target.value)} style={inp}
                 placeholder="e.g. BPAC 2024 CAP guideline / NZF 171 / local protocol" />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: '1rem' }}>
        <button onClick={onSave} disabled={busy} style={btnPrimary}>
          {busy ? 'Saving…' : isNew ? 'Create template' : 'Save changes'}
        </button>
        <button onClick={onCancel} disabled={busy} style={btnGhost}>Cancel</button>
      </div>
    </div>
  )
}
