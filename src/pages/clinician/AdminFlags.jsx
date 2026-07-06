// Feature flag admin panel — list / toggle / edit / delete flags.
// Server-side writes go through /api/flags PUT (guardProvider + is_admin).

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { invalidateFlags } from '../../lib/featureFlags'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'

export default function AdminFlags() {
  const navigate = useNavigate()
  const [flags, setFlags] = useState([])
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [savingKey, setSavingKey] = useState(null)

  // Redirect to login if no clinician session (matches other admin pages).
  useEffect(() => {
    if (!sessionStorage.getItem('clinicianAuth')) {
      navigate('/clinician?redirect=/clinician/admin/flags')
    }
  }, [navigate])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [flagsRes, provsRes] = await Promise.all([
        apiFetch('/api/flags'),
        apiFetch('/api/providers?filter=active-full'),
      ])
      if (flagsRes.ok) { const { flags } = await flagsRes.json(); setFlags(flags || []) }
      if (provsRes.ok) { const { providers } = await provsRes.json(); setProviders(providers || []) }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function updateFlag(key, patch) {
    setSavingKey(key)
    try {
      const res = await apiFetch(`/api/flags?key=${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      })
      if (res.ok) {
        const { flag } = await res.json()
        setFlags(fs => fs.map(f => f.key === key ? flag : f))
        invalidateFlags()
      }
    } catch {}
    setSavingKey(null)
  }

  async function createFlag() {
    if (!newKey.trim()) return
    await updateFlag(newKey.trim(), { enabled: false, description: newDesc.trim() })
    // Reload to include the freshly-created row
    load()
    setNewKey(''); setNewDesc(''); setShowNew(false)
  }

  async function removeFlag(key) {
    if (!confirm(`Delete flag "${key}"? Any code checking it will silently fall back to off.`)) return
    setSavingKey(key)
    try {
      await apiFetch(`/api/flags?key=${encodeURIComponent(key)}`, { method: 'DELETE' })
      setFlags(fs => fs.filter(f => f.key !== key))
      invalidateFlags()
    } catch {}
    setSavingKey(null)
  }

  function providerName(id) {
    const p = providers.find(x => x.id === id)
    return p ? `${p.first_name} ${p.last_name || ''}`.trim() : id.slice(0, 8)
  }

  const nav = { background:'#0D2B45', padding:'.875rem 1.5rem', display:'flex', alignItems:'center', justifyContent:'space-between' }
  const card = { background:'white', borderRadius:12, padding:'1.25rem', border:'1px solid #E2E8F0', marginBottom:'.75rem' }

  return (
    <div style={{ minHeight:'100dvh', background:'#F0F2F5', fontFamily:FF }}>
      <nav style={nav}>
        <div style={{ display:'flex', alignItems:'center', gap:'1.5rem' }}>
          <span onClick={() => navigate('/admin')} style={{ fontFamily:'Cormorant Garamond, serif', fontStyle:'italic', color:'#D4EEF0', fontSize:'1.3rem', cursor:'pointer' }}>Tere</span>
          <span style={{ color:'rgba(255,255,255,.4)', fontSize:'.8125rem' }}>Admin · Feature flags</span>
        </div>
        <button onClick={() => navigate('/admin')}
          style={{ background:'rgba(255,255,255,.1)', border:'none', color:'rgba(255,255,255,.9)', padding:'8px 14px', borderRadius:6, cursor:'pointer', fontSize:'.9rem' }}>← Admin</button>
      </nav>

      <div style={{ maxWidth:820, margin:'0 auto', padding:'2rem 1.5rem 3rem' }}>
        <h1 style={{ fontSize:'1.5rem', fontWeight:700, color:NAVY, marginBottom:'.25rem' }}>Feature flags</h1>
        <p style={{ fontSize:'.9375rem', color:'#6B7280', marginBottom:'1.5rem' }}>
          Runtime switches for risky changes. Ship with the flag off, turn it on for yourself, then everyone.
        </p>

        {loading ? (
          <div style={{ color:'#6B7280', padding:'2rem', textAlign:'center' }}>Loading…</div>
        ) : (
          <>
            {flags.length === 0 && (
              <div style={{ ...card, textAlign:'center', color:'#6B7280' }}>
                No flags yet. Create one with a key that matches what you'll check in code (e.g., <code>new_scribe_ui</code>).
              </div>
            )}
            {flags.map(f => (
              <div key={f.key} style={card}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'1rem', marginBottom:'.5rem' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:'monospace', fontSize:'.9rem', color:NAVY, fontWeight:600 }}>{f.key}</div>
                    {f.description && <div style={{ fontSize:'.85rem', color:'#6B7280', marginTop:'.25rem' }}>{f.description}</div>}
                  </div>
                  <label style={{ display:'flex', alignItems:'center', gap:'.5rem', cursor:'pointer', whiteSpace:'nowrap' }}>
                    <input type="checkbox" checked={!!f.enabled}
                      disabled={savingKey === f.key}
                      onChange={e => updateFlag(f.key, { enabled: e.target.checked })} />
                    <span style={{ fontSize:'.9rem', color: f.enabled ? '#059669' : '#6B7280', fontWeight:600 }}>
                      {f.enabled ? 'ON for everyone' : 'OFF'}
                    </span>
                  </label>
                </div>
                <div style={{ fontSize:'.8rem', color:'#6B7280', marginTop:'.75rem', paddingTop:'.75rem', borderTop:'1px solid #F1F5F9' }}>
                  <strong>Provider allowlist</strong> — when non-empty, ONLY these providers see the feature (bypasses on/off).
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'.35rem', marginTop:'.5rem' }}>
                  {providers.filter(p => p.is_provider || p.is_admin).map(p => {
                    const on = (f.provider_allowlist || []).includes(p.id)
                    return (
                      <button key={p.id}
                        disabled={savingKey === f.key}
                        onClick={() => {
                          const cur = f.provider_allowlist || []
                          const next = on ? cur.filter(x => x !== p.id) : [...cur, p.id]
                          updateFlag(f.key, { provider_allowlist: next })
                        }}
                        style={{
                          padding:'.35rem .7rem', borderRadius:99, cursor:'pointer',
                          border:`1.5px solid ${on ? TEAL : '#E2E8F0'}`,
                          background: on ? TEAL + '18' : 'white',
                          color: on ? TEAL : '#6B7280',
                          fontFamily:FF, fontSize:'.8rem', fontWeight:600,
                        }}>
                        {p.first_name} {p.last_name?.charAt(0) || ''}
                      </button>
                    )
                  })}
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'.75rem' }}>
                  <button onClick={() => removeFlag(f.key)} disabled={savingKey === f.key}
                    style={{ background:'none', border:'none', color:'#B91C1C', fontSize:'.8rem', fontWeight:600, cursor:'pointer' }}>
                    Delete flag
                  </button>
                </div>
              </div>
            ))}

            {showNew ? (
              <div style={card}>
                <div style={{ fontWeight:700, color:NAVY, marginBottom:'.75rem' }}>Create a new flag</div>
                <input type="text" placeholder="flag_key (snake_case)" value={newKey}
                  onChange={e => setNewKey(e.target.value.replace(/[^a-zA-Z0-9_]/g, '_'))}
                  style={{ width:'100%', padding:'.6rem .9rem', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:'.9rem', marginBottom:'.5rem', boxSizing:'border-box', fontFamily:'monospace' }} />
                <textarea placeholder="Short description (what the flag gates)" value={newDesc}
                  onChange={e => setNewDesc(e.target.value)} rows={2}
                  style={{ width:'100%', padding:'.6rem .9rem', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:'.9rem', boxSizing:'border-box', fontFamily:FF, resize:'vertical' }} />
                <div style={{ display:'flex', gap:'.5rem', justifyContent:'flex-end', marginTop:'.75rem' }}>
                  <button onClick={() => { setShowNew(false); setNewKey(''); setNewDesc('') }}
                    style={{ background:'none', border:'1.5px solid #E2E8F0', padding:'.5rem 1rem', borderRadius:8, cursor:'pointer', color:'#6B7280', fontWeight:600 }}>Cancel</button>
                  <button onClick={createFlag} disabled={!newKey.trim()}
                    style={{ background:TEAL, color:'white', border:'none', padding:'.5rem 1rem', borderRadius:8, cursor:'pointer', fontWeight:600 }}>Create</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowNew(true)}
                style={{ background:'white', color:TEAL, border:`2px dashed ${TEAL}`, padding:'.75rem 1.25rem', borderRadius:10, cursor:'pointer', fontFamily:FF, fontWeight:600, width:'100%' }}>
                + New flag
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
