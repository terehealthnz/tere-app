// StructuredHistoryCard — generic add/edit/delete list card for patient
// structured history sections (allergens, medications, conditions).
//
// Props:
//   title       — section header (e.g. "🩹 Structured allergies")
//   rows        — array of row objects (parent owns state)
//   fields      — [{ key, label, placeholder, kind: 'text'|'date'|'select',
//                   options?: [{value, label}], required?: bool }]
//                 Used both to render each row (primary/secondary preview)
//                 and to build the add-row form.
//   primaryKey  — field key used as the big top-line text for each row
//   summarise   — (row) => string used as the secondary line (dose/frequency
//                 for meds, reaction for allergens, etc.). Optional.
//   statusBadge — (row) => { label, color, bg } | null. Optional pill.
//   onAdd       — async (patch) => void.  Throws on error.
//   onDelete    — async (id)     => void.  Throws on error.
//   emptyText   — string shown when rows is empty. Default "None recorded".
//   emptyPrompt — string shown above the add form. Default "Add a row"
//
// Keeps the parent lean — ClinicianPatient just passes rows + handlers,
// no per-section boilerplate for the add form or list rendering.

import React, { useState } from 'react'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'

export default function StructuredHistoryCard({
  title,
  rows = [],
  fields = [],
  primaryKey,
  summarise,
  statusBadge,
  onAdd,
  onDelete,
  emptyText = 'None recorded',
  emptyPrompt = 'Add a row',
  color,     // optional accent (allergies want red)
  bg,        // optional card background tint
  borderColor,
}) {
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState({})
  const [err, setErr] = useState('')

  const cardBg     = bg || 'white'
  const cardBorder = borderColor || '#E2E8F0'

  async function submitAdd() {
    setErr('')
    const missing = fields.filter(f => f.required && !String(draft[f.key] || '').trim())
    if (missing.length > 0) { setErr(`Missing: ${missing.map(f => f.label).join(', ')}`); return }
    setSaving(true)
    try {
      await onAdd(draft)
      setDraft({}); setAdding(false)
    } catch (e) {
      setErr(e.message || 'Add failed')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ background: cardBg, borderRadius: 12, padding: '1rem 1.125rem', marginBottom: '.75rem', border: `1.5px solid ${cardBorder}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: rows.length > 0 || adding ? '.75rem' : '.5rem' }}>
        <div style={{ fontWeight: 700, color: color || NAVY, fontSize: '.9375rem' }}>{title}</div>
        {!adding && (
          <button onClick={() => setAdding(true)} style={{ background: 'transparent', border: 'none', color: TEAL, fontFamily: FF, fontSize: '.8125rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
            + Add
          </button>
        )}
      </div>

      {rows.length === 0 && !adding && (
        <div style={{ fontSize: '.875rem', color: '#9CA3AF', fontStyle: 'italic' }}>{emptyText}</div>
      )}

      {rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          {rows.map(row => {
            const badge = typeof statusBadge === 'function' ? statusBadge(row) : null
            return (
              <div key={row.id} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '.625rem .75rem', display: 'flex', alignItems: 'flex-start', gap: '.5rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: NAVY, fontSize: '.875rem' }}>{row[primaryKey] || '—'}</span>
                    {badge && (
                      <span style={{ background: badge.bg, color: badge.color, fontSize: '.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>{badge.label}</span>
                    )}
                  </div>
                  {typeof summarise === 'function' && (
                    <div style={{ fontSize: '.75rem', color: '#6B7280', marginTop: 2 }}>{summarise(row)}</div>
                  )}
                  {row.notes && (
                    <div style={{ fontSize: '.75rem', color: '#9CA3AF', fontStyle: 'italic', marginTop: 2 }}>{row.notes}</div>
                  )}
                </div>
                <button
                  onClick={async () => {
                    if (!window.confirm(`Delete "${row[primaryKey]}"?`)) return
                    try { await onDelete(row.id) }
                    catch (e) { alert(`Delete failed: ${e.message}`) }
                  }}
                  title="Delete"
                  style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: '.875rem', padding: '.125rem .375rem', flexShrink: 0 }}
                >✕</button>
              </div>
            )
          })}
        </div>
      )}

      {adding && (
        <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 8, padding: '.75rem', marginTop: rows.length > 0 ? '.75rem' : 0 }}>
          <div style={{ fontSize: '.75rem', fontWeight: 700, color: NAVY, marginBottom: '.5rem', textTransform: 'uppercase', letterSpacing: '.03em' }}>{emptyPrompt}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.375rem' }}>
            {fields.map(f => (
              <div key={f.key}>
                <label style={{ display: 'block', fontSize: '.6875rem', color: '#6B7280', fontWeight: 600, marginBottom: 2 }}>
                  {f.label}{f.required ? ' *' : ''}
                </label>
                {f.kind === 'select' ? (
                  <select value={draft[f.key] || ''} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '.4rem .5rem', border: '1px solid #D1D5DB', borderRadius: 6, fontFamily: FF, fontSize: '.8125rem', background: 'white' }}>
                    <option value="">Select…</option>
                    {(f.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input type={f.kind === 'date' ? 'date' : 'text'} value={draft[f.key] || ''} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
                    placeholder={f.placeholder || ''}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '.4rem .5rem', border: '1px solid #D1D5DB', borderRadius: 6, fontFamily: FF, fontSize: '.8125rem' }} />
                )}
              </div>
            ))}
            {err && <div style={{ fontSize: '.75rem', color: '#DC2626', marginTop: 2 }}>{err}</div>}
            <div style={{ display: 'flex', gap: '.375rem', marginTop: '.375rem' }}>
              <button onClick={submitAdd} disabled={saving}
                style={{ flex: 1, background: TEAL, color: 'white', border: 'none', padding: '.5rem', borderRadius: 6, fontFamily: FF, fontWeight: 700, fontSize: '.8125rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .5 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => { setAdding(false); setDraft({}); setErr('') }} disabled={saving}
                style={{ background: 'white', color: '#6B7280', border: '1px solid #D1D5DB', padding: '.5rem 1rem', borderRadius: 6, fontFamily: FF, fontWeight: 600, fontSize: '.8125rem', cursor: saving ? 'not-allowed' : 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
