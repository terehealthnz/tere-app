// AccIcd10Picker — searchable picker for the ACC ICD-10 codeset
// (HL7 NZ http://hl7.org.nz/fhir/CodeSystem/acc-icd10, 12,494 codes).
//
// Rendered on ACC-eligible consults. Provider picks the code that gets
// sent to ACC on ACC45 lodgement — the AI extraction is shown as a
// one-click "Recommended" chip at the top, but the provider always
// makes the final choice.
//
// Codeset is lazy-loaded from /acc-icd10-codes.json on first open (~888 KB,
// cached for the tab's lifetime). Keeps it out of the main bundle.

import React, { useEffect, useMemo, useRef, useState } from 'react'

let codesCache = null   // module-scoped cache: shared across all pickers
let loadingPromise = null

async function loadAccCodes() {
  if (codesCache) return codesCache
  if (loadingPromise) return loadingPromise
  loadingPromise = fetch('/acc-icd10-codes.json')
    .then(r => { if (!r.ok) throw new Error(`Failed to load ACC codes: ${r.status}`); return r.json() })
    .then(list => { codesCache = Array.isArray(list) ? list : []; return codesCache })
    .catch(e => { console.error('[AccIcd10Picker]', e); return [] })
    .finally(() => { loadingPromise = null })
  return loadingPromise
}

export default function AccIcd10Picker({
  value,               // current code string (e.g. 'S9340') or null
  label,               // current description string
  recommendedCode,     // AI-recommended code (from clinical_impression extraction)
  recommendedLabel,    // AI-recommended description
  onPick,              // (code, description) => void — fires when provider selects
}) {
  const [codes, setCodes] = useState(codesCache)
  const [loading, setLoading] = useState(!codesCache)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (codesCache) return
    setLoading(true)
    loadAccCodes().then(list => { setCodes(list); setLoading(false) })
  }, [])

  // Close dropdown on outside click.
  useEffect(() => {
    if (!open) return
    function onDoc(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const matches = useMemo(() => {
    if (!codes || codes.length === 0) return []
    const term = q.trim().toLowerCase()
    if (term.length < 2) return []
    // Rank: exact code match first, code prefix next, then substring in display.
    const upper = term.toUpperCase()
    const codeExact = codes.filter(c => c.code === upper)
    const codePrefix = codes.filter(c => c.code.startsWith(upper) && c.code !== upper).slice(0, 20)
    const displayMatch = codes.filter(c =>
      !c.code.startsWith(upper) && c.display.toLowerCase().includes(term)
    ).slice(0, 40)
    return [...codeExact, ...codePrefix, ...displayMatch].slice(0, 30)
  }, [q, codes])

  const isRecommended = recommendedCode && value === recommendedCode
  const hasCurrent = !!value

  return (
    <div ref={wrapRef} style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      {/* Current pick */}
      {hasCurrent && (
        <div style={{
          padding: '10px 12px', background: '#F0FDF4', border: '1.5px solid #86EFAC',
          borderRadius: 8, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '.75rem', color: '#065F46', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              ACC ICD-10 selected{isRecommended ? ' (AI-recommended)' : ''}
            </div>
            <div style={{ fontSize: '.9375rem', fontWeight: 600, color: '#064E3B', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <code style={{ background: 'white', padding: '1px 6px', borderRadius: 4, fontSize: '.8125rem' }}>{value}</code>
              {' — '}{label || '—'}
            </div>
          </div>
          <button type="button" onClick={() => { onPick(null, null); setQ(''); setOpen(true) }}
            style={{ background: 'white', border: '1px solid #86EFAC', color: '#065F46', padding: '4px 10px', borderRadius: 6, fontSize: '.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Change
          </button>
        </div>
      )}

      {/* AI recommendation (only when not already selected) */}
      {!hasCurrent && recommendedCode && (
        <button type="button" onClick={() => onPick(recommendedCode, recommendedLabel)}
          style={{
            display: 'block', width: '100%', padding: '10px 12px',
            background: '#FEF3C7', border: '1.5px solid #FCD34D', borderRadius: 8,
            marginBottom: 6, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
          }}>
          <div style={{ fontSize: '.75rem', color: '#92400E', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            💡 AI-recommended — tap to accept
          </div>
          <div style={{ fontSize: '.9375rem', fontWeight: 600, color: '#78350F', marginTop: 2 }}>
            <code style={{ background: 'white', padding: '1px 6px', borderRadius: 4, fontSize: '.8125rem' }}>{recommendedCode}</code>
            {' — '}{recommendedLabel || '—'}
          </div>
        </button>
      )}

      {/* Search — always available so provider can override */}
      <input
        type="text"
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={loading ? 'Loading ACC codes…' : 'Search ACC ICD-10 by code or description…'}
        disabled={loading}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '10px 12px',
          border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: '.9375rem',
          fontFamily: 'inherit', outline: 'none',
        }}
      />

      {/* Results dropdown */}
      {open && q.trim().length >= 2 && (
        <div style={{
          marginTop: 4, background: 'white', border: '1px solid #E2E8F0', borderRadius: 8,
          maxHeight: 320, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,.08)',
        }}>
          {matches.length === 0 && (
            <div style={{ padding: '12px 14px', fontSize: '.875rem', color: '#6B7280' }}>
              No ACC codes match "{q}". Try the injury type (e.g. "ankle sprain") or a partial code (e.g. "S93").
            </div>
          )}
          {matches.map(c => (
            <button key={c.code} type="button" onClick={() => { onPick(c.code, c.display); setQ(''); setOpen(false) }}
              style={{
                display: 'block', width: '100%', padding: '8px 12px', background: 'white', border: 'none',
                borderBottom: '1px solid #F1F5F9', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
              }}>
              <div style={{ fontSize: '.875rem', color: '#0D2B45' }}>
                <code style={{ background: '#F1F5F9', padding: '1px 6px', borderRadius: 4, fontSize: '.75rem', marginRight: 6 }}>{c.code}</code>
                {c.display}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
