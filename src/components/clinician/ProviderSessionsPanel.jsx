import React, { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '../../lib/api'

const FF = 'Plus Jakarta Sans, sans-serif'

function fmtDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-NZ', {
      day:'2-digit', month:'short', year:'numeric',
      hour:'2-digit', minute:'2-digit',
    })
  } catch { return iso }
}

function duration(startedAt, endedAt) {
  if (!startedAt) return '—'
  const start = new Date(startedAt).getTime()
  const end   = endedAt ? new Date(endedAt).getTime() : Date.now()
  const ms = Math.max(0, end - start)
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function EndReasonBadge({ reason, active }) {
  if (active) {
    return <span style={{ fontSize:11, fontWeight:700, color:'#065F46', background:'#D1FAE5', padding:'2px 8px', borderRadius:99 }}>● ONLINE</span>
  }
  const styles = {
    logout:         { bg:'#E0E7FF', fg:'#3730A3', label:'Logout' },
    idle_timeout:   { bg:'#FEF3C7', fg:'#92400E', label:'Idle' },
    inferred_stale: { bg:'#F3F4F6', fg:'#6B7280', label:'Stale' },
    admin_revoke:   { bg:'#FEE2E2', fg:'#991B1B', label:'Revoked' },
  }
  const s = styles[reason] || { bg:'#F3F4F6', fg:'#6B7280', label: reason || '—' }
  return <span style={{ fontSize:11, fontWeight:700, color:s.fg, background:s.bg, padding:'2px 8px', borderRadius:99 }}>{s.label}</span>
}

function shortUa(ua) {
  if (!ua) return '—'
  const s = String(ua)
  // Cheap parsing: yank the platform + first browser token
  const m = s.match(/\(([^)]+)\)/)?.[1] || ''
  const platform = m.split(';')[0]?.trim() || ''
  const browser  = s.match(/(Chrome|Firefox|Safari|Edg)\/[\d.]+/)?.[0] || ''
  return [platform, browser].filter(Boolean).join(' · ') || s.slice(0, 40)
}

export default function ProviderSessionsPanel() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeOnly, setActiveOnly] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const qs = new URLSearchParams({ limit: '200' })
      if (activeOnly) qs.set('active', '1')
      const r = await apiFetch(`/api/provider-sessions?${qs.toString()}`)
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`)
      setSessions(data.sessions || [])
    } catch (e) {
      setErr(e.message || 'Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }, [activeOnly])

  useEffect(() => { load() }, [load])

  const activeCount = sessions.filter(s => !s.ended_at).length

  return (
    <div style={{ background:'white', border:'1px solid #E5E7EB', borderRadius:12, padding:16, marginBottom:16, fontFamily:FF }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, gap:12, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color:'#0D2B45' }}>Provider sessions</div>
          <div style={{ fontSize:12, color:'#6B7280', marginTop:2 }}>
            {activeCount} currently online · {sessions.length - activeCount} ended shown
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <label style={{ fontSize:13, color:'#374151', display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
            <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} />
            Active only
          </label>
          <button onClick={load} disabled={loading}
            style={{ background:'#0B6E76', color:'white', border:'none', borderRadius:6, padding:'6px 14px', fontSize:13, fontWeight:600, cursor:loading?'wait':'pointer' }}>
            {loading ? '…' : 'Refresh'}
          </button>
        </div>
      </div>

      {err && <div style={{ fontSize:13, color:'#991B1B', background:'#FEE2E2', padding:'8px 12px', borderRadius:6, marginBottom:12 }}>{err}</div>}

      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ textAlign:'left', color:'#6B7280', borderBottom:'1px solid #E5E7EB' }}>
              <th style={{ padding:'8px 6px' }}>Provider</th>
              <th style={{ padding:'8px 6px' }}>Started</th>
              <th style={{ padding:'8px 6px' }}>Ended</th>
              <th style={{ padding:'8px 6px' }}>Duration</th>
              <th style={{ padding:'8px 6px' }}>Status</th>
              <th style={{ padding:'8px 6px' }}>MFA</th>
              <th style={{ padding:'8px 6px' }}>IP</th>
              <th style={{ padding:'8px 6px' }}>Device</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map(s => {
              const p = s.providers || {}
              const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || s.provider_id?.slice(0, 8)
              const role = p.is_admin ? 'Admin' : p.is_supervisor ? 'Supervisor' : 'Provider'
              return (
                <tr key={s.id} style={{ borderBottom:'1px solid #F3F4F6' }}>
                  <td style={{ padding:'8px 6px' }}>
                    <div style={{ fontWeight:600, color:'#0D2B45' }}>{name}</div>
                    <div style={{ fontSize:11, color:'#6B7280' }}>{role}</div>
                  </td>
                  <td style={{ padding:'8px 6px', color:'#374151' }}>{fmtDate(s.started_at)}</td>
                  <td style={{ padding:'8px 6px', color:'#374151' }}>{fmtDate(s.ended_at)}</td>
                  <td style={{ padding:'8px 6px', color:'#374151' }}>{duration(s.started_at, s.ended_at)}</td>
                  <td style={{ padding:'8px 6px' }}><EndReasonBadge reason={s.end_reason} active={!s.ended_at} /></td>
                  <td style={{ padding:'8px 6px' }}>
                    {s.mfa_used
                      ? <span title="MFA verified at login" style={{ color:'#065F46', fontWeight:700 }}>✓</span>
                      : <span title="No MFA used" style={{ color:'#9CA3AF' }}>—</span>}
                  </td>
                  <td style={{ padding:'8px 6px', color:'#6B7280', fontFamily:'monospace', fontSize:12 }}>{s.ip || '—'}</td>
                  <td style={{ padding:'8px 6px', color:'#6B7280', fontSize:12 }}>{shortUa(s.user_agent)}</td>
                </tr>
              )
            })}
            {!loading && sessions.length === 0 && (
              <tr><td colSpan={8} style={{ padding:24, textAlign:'center', color:'#9CA3AF' }}>No sessions match this filter</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
