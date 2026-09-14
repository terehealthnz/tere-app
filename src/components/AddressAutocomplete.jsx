// NZ address autocomplete backed by /api/address-search (which proxies
// OpenStreetMap Nominatim server-side).
//
// Drop-in replacement for a plain <input> when you want a searchable
// address field. Debounced typeahead, keyboard nav, OSM attribution
// footer. Free — no API key or billing.

import React from 'react'

const MIN_CHARS = 3
const DEBOUNCE_MS = 400

export default function AddressAutocomplete({
  value = '',
  onChange,
  onSelect,
  placeholder = 'Start typing your address…',
  disabled = false,
  required = false,
  id,
  style,
  inputStyle,
}) {
  const [query, setQuery] = React.useState(value)
  const [suggestions, setSuggestions] = React.useState([])
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [focus, setFocus] = React.useState(-1)
  const wrapRef = React.useRef(null)
  const timerRef = React.useRef(null)

  // Sync from parent-controlled value
  React.useEffect(() => {
    if (typeof value === 'string' && value !== query) setQuery(value)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Debounced fetch
  React.useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (query.trim().length < MIN_CHARS) {
      setSuggestions([])
      setLoading(false)
      return
    }
    setLoading(true)
    timerRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/address-search?q=${encodeURIComponent(query.trim())}`)
        const body = await r.json().catch(() => ({}))
        setSuggestions(Array.isArray(body.results) ? body.results : [])
      } catch { setSuggestions([]) }
      setLoading(false)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timerRef.current)
  }, [query])

  // Close on outside click
  React.useEffect(() => {
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function select(s) {
    const display = s.display_name
    setQuery(display)
    setOpen(false)
    setFocus(-1)
    onChange?.(display)
    onSelect?.(s)
  }

  function onKeyDown(e) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocus(f => Math.min(f + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocus(f => Math.max(f - 1, -1))
    } else if (e.key === 'Enter' && focus >= 0) {
      e.preventDefault()
      select(suggestions[focus])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const baseInputStyle = {
    width: '100%',
    padding: '.5rem .75rem',
    border: '1.5px solid #E2E8F0',
    borderRadius: 6,
    fontSize: '.9rem',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    ...(inputStyle || {}),
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...(style || {}) }}>
      <input
        id={id}
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); onChange?.(e.target.value); setOpen(true); setFocus(-1) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        autoComplete="street-address"
        style={baseInputStyle}
      />
      {open && (loading || suggestions.length > 0) && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 2px)',
          left: 0,
          right: 0,
          background: 'white',
          border: '1px solid #E2E8F0',
          borderRadius: 6,
          boxShadow: '0 4px 14px rgba(0,0,0,0.10)',
          zIndex: 100,
          maxHeight: 320,
          overflowY: 'auto',
        }}>
          {loading && suggestions.length === 0 && (
            <div style={{ padding: '.6rem .75rem', color: '#6B7280', fontSize: '.85rem' }}>Searching…</div>
          )}
          {suggestions.map((s, i) => (
            <div
              key={s.place_id}
              onMouseDown={(e) => { e.preventDefault(); select(s) }}
              onMouseEnter={() => setFocus(i)}
              style={{
                padding: '.55rem .75rem',
                fontSize: '.875rem',
                cursor: 'pointer',
                background: i === focus ? '#F0F9FA' : 'white',
                borderBottom: '1px solid #F1F5F9',
                lineHeight: 1.4,
              }}>
              {s.display_name}
            </div>
          ))}
          <div style={{
            padding: '.3rem .75rem',
            fontSize: '.7rem',
            color: '#9CA3AF',
            fontStyle: 'italic',
            background: '#FAFAFA',
            borderTop: '1px solid #F1F5F9',
          }}>
            Address suggestions © OpenStreetMap contributors
          </div>
        </div>
      )}
    </div>
  )
}
