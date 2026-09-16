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
  autoFocus = false,
  id,
  style,
  inputStyle,
}) {
  const [query, setQuery] = React.useState(value)
  const [suggestions, setSuggestions] = React.useState([])
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [focus, setFocus] = React.useState(-1)
  // Flip the dropdown above the input when there's not enough room below —
  // e.g. when the picker sits at the bottom of the triage chat viewport
  // and the suggestions would otherwise overflow the visible area.
  const [flipUp, setFlipUp] = React.useState(false)
  const [maxDropdownHeight, setMaxDropdownHeight] = React.useState(320)
  const wrapRef = React.useRef(null)
  const inputRef = React.useRef(null)
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

  // Auto-flip dropdown up when it would overflow the viewport downward.
  // Recomputed whenever the dropdown opens or suggestions change so the
  // decision reflects the current viewport (accounts for on-screen
  // keyboards + window resizes on mobile).
  React.useEffect(() => {
    if (!open) return
    const el = inputRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const viewportH = window.innerHeight || document.documentElement.clientHeight
    const spaceBelow = viewportH - rect.bottom
    const spaceAbove = rect.top
    const PREFERRED = 320
    const MIN = 120
    if (spaceBelow < MIN && spaceAbove > spaceBelow) {
      setFlipUp(true)
      setMaxDropdownHeight(Math.max(MIN, Math.min(PREFERRED, spaceAbove - 12)))
    } else {
      setFlipUp(false)
      setMaxDropdownHeight(Math.max(MIN, Math.min(PREFERRED, spaceBelow - 12)))
    }
  }, [open, suggestions.length])

  function select(s) {
    const display = s.display_name
    setQuery(display)
    setOpen(false)
    setFocus(-1)
    onChange?.(display)
    onSelect?.(s)
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown' && open && suggestions.length > 0) {
      e.preventDefault()
      setFocus(f => Math.min(f + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp' && open && suggestions.length > 0) {
      e.preventDefault()
      setFocus(f => Math.max(f - 1, -1))
    } else if (e.key === 'Enter') {
      // Enter with a highlighted suggestion → pick it. Enter with no
      // highlight → submit whatever the patient has typed (so they can
      // just type and press return without hunting through a dropdown).
      if (open && focus >= 0 && suggestions[focus]) {
        e.preventDefault()
        select(suggestions[focus])
      } else if (query.trim().length > 4) {
        e.preventDefault()
        setOpen(false)
        setFocus(-1)
        onChange?.(query)
        onSelect?.({ display_name: query, freeform: true })
      }
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
        ref={inputRef}
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
        autoFocus={autoFocus}
        style={baseInputStyle}
      />
      {open && (loading || suggestions.length > 0) && (
        <div style={{
          position: 'absolute',
          ...(flipUp ? { bottom: 'calc(100% + 2px)' } : { top: 'calc(100% + 2px)' }),
          left: 0,
          right: 0,
          background: 'white',
          border: '1px solid #E2E8F0',
          borderRadius: 6,
          boxShadow: '0 4px 14px rgba(0,0,0,0.10)',
          zIndex: 100,
          maxHeight: maxDropdownHeight,
          overflowY: 'auto',
        }}>
          {loading && suggestions.length === 0 && (
            <div style={{ padding: '.6rem .75rem', color: '#6B7280', fontSize: '.85rem' }}>Searching…</div>
          )}
          {/* Always offer "use what I typed" as an escape hatch so the patient
              doesn't have to pick from OSM suggestions — some addresses (new
              subdivisions, apartments) don't match cleanly. */}
          {query.trim().length > 4 && (
            <div
              onMouseDown={(e) => {
                e.preventDefault()
                setOpen(false); setFocus(-1)
                onChange?.(query)
                onSelect?.({ display_name: query, freeform: true })
              }}
              style={{
                padding: '.55rem .75rem',
                fontSize: '.875rem',
                cursor: 'pointer',
                background: '#F0F9FA',
                borderBottom: '1px solid #E2E8F0',
                lineHeight: 1.4,
                fontWeight: 600,
                color: '#0B6E76',
              }}>
              ✓ Use what I typed: <span style={{ fontWeight: 400 }}>“{query}”</span>
            </div>
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
