import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { subscribeToQueue, updateConsultation, getCompleteSince, getAllCompleteConsultations } from '../../lib/supabase'
import { CONSULT_TYPE_LABELS } from '../../lib/consultationType'
import { apiFetch } from '../../lib/api'
import TereChatTab, { useTereChatUnread } from './TereChatTab.jsx'
import ProviderInbox from '../../pages/clinician/ProviderInbox.jsx'
import ProviderEarnings from '../../pages/clinician/ProviderEarnings.jsx'

function useClinicianAuth() {
  const navigate = useNavigate()
  useEffect(() => {
    if (!sessionStorage.getItem('clinicianAuth')) navigate('/clinician')
  }, [navigate])
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60) return diff + 's ago'
  if (diff < 3600) return Math.floor(diff/60) + 'm ago'
  return Math.floor(diff/3600) + 'h ago'
}

function statusLabel(status) {
  const map = {
    waiting:          { label: 'Waiting',        color: 'var(--warning)'    },
    vitals_requested: { label: 'Vitals pending', color: 'var(--teal-light)' },
    vitals_complete:  { label: 'Vitals ready',   color: 'var(--teal)'       },
    ready:            { label: 'Ready',           color: 'var(--success)'    },
    in_progress:      { label: 'In progress',    color: '#7C3AED'           },
  }
  return map[status] || { label: status, color: 'var(--muted)' }
}

async function getTodaysConsultations() {
  const today = new Date()
  today.setHours(0,0,0,0)
  return getCompleteSince(today.toISOString(), '*')
}

function NotesGroup({ title, color, rows, navigate, onFlag }) {
  if (!rows.length) return null
  const dot = { width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.75rem' }}>
        <div style={dot} />
        <span style={{ fontWeight: 700, fontSize: '.9375rem', color: 'var(--navy)' }}>{title}</span>
        <span style={{ background: color + '20', color, fontSize: '.75rem', fontWeight: 700, padding: '1px 8px', borderRadius: 99 }}>{rows.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.625rem' }}>
        {rows.map(c => {
          const soap = c.clinical_notes || c.notes_draft || {}
          const preview = (soap.S || '').slice(0, 100)
          return (
            <div key={c.id} style={{ background: 'white', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', borderLeft: `4px solid ${color}`, padding: '1rem 1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '.25rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '.9375rem' }}>{c.patient_first_name} {c.patient_last_name}</span>
                    {c.acc_eligible === 'yes' && <span className="badge badge-info">ACC</span>}
                    {c.notes_flagged && <span style={{ background: '#FEE2E2', color: '#DC2626', fontSize: '.6875rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99 }}>FLAGGED</span>}
                    {c.follow_up_days && <span style={{ background: '#FEF3C7', color: '#92400E', fontSize: '.6875rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99 }}>↻ {c.follow_up_days}d</span>}
                  </div>
                  <div style={{ fontSize: '.875rem', color: 'var(--muted)', marginBottom: '.375rem' }}>
                    {new Date(c.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })} · {c.chief_complaint}
                  </div>
                  {preview && <div style={{ fontSize: '.8125rem', color: 'var(--text)', lineHeight: 1.5, fontStyle: 'italic', borderLeft: '2px solid var(--border)', paddingLeft: '.625rem' }}>{preview}{soap.S?.length > 100 ? '…' : ''}</div>}
                  {c.outcome && <div style={{ fontSize: '.75rem', color: 'var(--teal)', fontWeight: 600, marginTop: '.375rem' }}>Outcome: {c.outcome.replace(/_/g, ' ')}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.375rem', alignItems: 'flex-end' }}>
                  <button onClick={() => navigate(`/clinician/notes/${c.id}`)}
                    style={{ background: 'var(--navy)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: '.8125rem', fontWeight: 600, fontFamily: 'Plus Jakarta Sans,sans-serif', whiteSpace: 'nowrap' }}>
                    View notes
                  </button>
                  <button onClick={() => onFlag(c.id, !c.notes_flagged)}
                    style={{ background: 'none', border: `1px solid ${c.notes_flagged ? '#9CA3AF' : '#FECACA'}`, color: c.notes_flagged ? '#9CA3AF' : '#DC2626', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: '.75rem', fontFamily: 'Plus Jakarta Sans,sans-serif', whiteSpace: 'nowrap' }}>
                    {c.notes_flagged ? 'Remove flag' : 'Flag'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function NotesTab({ navigate }) {
  const [rows, setRows] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await getAllCompleteConsultations(200)
      setRows(data || [])
      setError(false)
    } catch (e) {
      // Columns may not exist yet — migration needed
      setError(true)
    }
    setLoading(false)
  }

  async function toggleFlag(id, flagged) {
    try {
      await updateConsultation(id, { notes_flagged: flagged })
      setRows(rs => rs.map(r => r.id === id ? { ...r, notes_flagged: flagged } : r))
    } catch {}
  }

  React.useEffect(() => { load() }, [])

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem' }}><div className="spinner" /></div>

  if (error) return (
    <div className="card" style={{ textAlign: 'center', padding: '2rem', borderColor: '#FECACA' }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '.75rem' }}>⚠️</div>
      <h3 style={{ marginBottom: '.5rem' }}>Migration required</h3>
      <p style={{ fontSize: '.875rem', color: 'var(--muted)', marginBottom: '1rem' }}>
        Run <code>supabase-notes-migration.sql</code> in the Supabase dashboard to enable notes management.
      </p>
      <a href="https://supabase.com/dashboard/project/xynwqfbnwpkyvovxdone/sql" target="_blank" rel="noreferrer"
        style={{ background: 'var(--teal)', color: 'white', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', fontSize: '.875rem', fontWeight: 600 }}>
        Open SQL editor →
      </a>
    </div>
  )

  const flagged = rows.filter(r => r.notes_flagged)
  const pending = rows.filter(r => !r.notes_flagged && !r.notes_finalised)
  const complete = rows.filter(r => !r.notes_flagged && r.notes_finalised)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <h1 style={{ marginBottom: 0 }}>Clinical notes</h1>
        <button onClick={load} style={{ background: 'var(--teal-light)', border: 'none', color: 'var(--teal)', padding: '8px 16px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans,sans-serif', fontWeight: 600, fontSize: '.875rem' }}>
          ↻ Refresh
        </button>
      </div>
      {!flagged.length && !pending.length && !complete.length && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📋</div>
          <h3>No completed consultations yet</h3>
          <p>Notes from completed consultations will appear here.</p>
        </div>
      )}
      <NotesGroup title="Flagged for review" color="#DC2626" rows={flagged} navigate={navigate} onFlag={toggleFlag} />
      <NotesGroup title="Pending completion" color="#D97706" rows={pending} navigate={navigate} onFlag={toggleFlag} />
      <NotesGroup title="Completed notes"    color="#059669" rows={complete} navigate={navigate} onFlag={toggleFlag} />
    </div>
  )
}

function TypeBadge({ type }) {
  const cfg = CONSULT_TYPE_LABELS[type] || CONSULT_TYPE_LABELS.video
  const colors = { video:'#0B6E76', phone:'#7C3AED', message:'#D97706' }
  const c = colors[type] || colors.video
  return (
    <span style={{ background: c + '18', color: c, fontSize: '.6875rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99, whiteSpace: 'nowrap' }}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

// Baseline pinned tabs shown to every provider on first load. Providers
// can pin/unpin any tab via the More ▾ dropdown; their choices are stored
// in localStorage under DASH_PIN_KEY (per-browser, not per-account).
// v2 bump forces a defaults reset for existing users after we pinned
// Earnings and dropped the dead Messages tab.
const DASH_PIN_KEY   = 'dashPinnedTabs.v2'
const DEFAULT_PINNED = ['queue', 'tere-chat', 'inbox', 'earnings']

function DashTabSwitcher({ dashTab, setDashTab, teamBadge, isSupervisor, isRMO }) {
  const allTabs = useMemo(() => {
    const t = [
      ['queue',     'Queue'],
      ['tere-chat', teamBadge > 0 ? `💬 Tere Chat (${teamBadge})` : '💬 Tere Chat'],
      ['inbox',     '📥 Inbox'],
      ['earnings',  '💰 Earnings'],
      ['notes',     'Notes'],
      ['licenses',  '🪪 State licenses'],
    ]
    if (isSupervisor) t.push(['supervision',    'Supervision'])
    if (isRMO)        t.push(['my-supervision', 'My supervision'])
    return t
  }, [teamBadge, isSupervisor, isRMO])

  const [pinned, setPinned] = useState(() => {
    try {
      const raw = localStorage.getItem(DASH_PIN_KEY)
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr) && arr.length > 0) return arr
      }
    } catch {}
    return DEFAULT_PINNED
  })
  const [menuOpen,      setMenuOpen]      = useState(false)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  function togglePin(id) {
    setPinned(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      try { localStorage.setItem(DASH_PIN_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }
  function resetPinned() {
    setPinned(DEFAULT_PINNED)
    try { localStorage.setItem(DASH_PIN_KEY, JSON.stringify(DEFAULT_PINNED)) } catch {}
  }

  const primary  = allTabs.filter(([id]) => pinned.includes(id))
  const overflow = allTabs.filter(([id]) => !pinned.includes(id))

  // If the active tab lives in overflow, surface it in primary so the user
  // sees where they are without hunting through the dropdown.
  const activeInOverflow = overflow.find(([id]) => id === dashTab)
  const primaryToRender  = activeInOverflow ? [...primary, activeInOverflow] : primary

  const tabBtn = (id, label) => (
    <button key={id} onClick={() => setDashTab(id)}
      style={{padding:'7px 20px',borderRadius:'6px',border:'none',cursor:'pointer',fontFamily:'Plus Jakarta Sans,sans-serif',fontWeight:600,fontSize:'.875rem',transition:'all .15s',background:dashTab===id?'var(--navy)':'transparent',color:dashTab===id?'white':'var(--muted)'}}>
      {label}
    </button>
  )

  return (
    <>
      <div style={{display:'flex',gap:4,marginBottom:'1.25rem',background:'white',borderRadius:'var(--radius-sm)',padding:4,border:'1px solid var(--border)',width:'fit-content',flexWrap:'wrap',alignItems:'center'}}>
        {primaryToRender.map(([id, label]) => tabBtn(id, label))}
        <div ref={menuRef} style={{position:'relative'}}>
          <button onClick={() => setMenuOpen(v => !v)}
            style={{padding:'7px 14px',borderRadius:'6px',border:'none',cursor:'pointer',fontFamily:'Plus Jakarta Sans,sans-serif',fontWeight:600,fontSize:'.875rem',background:'transparent',color:'var(--muted)'}}>
            More ▾
          </button>
          {menuOpen && (
            <div style={{position:'absolute',top:'calc(100% + 4px)',left:0,minWidth:200,background:'white',border:'1px solid var(--border)',borderRadius:8,boxShadow:'0 6px 20px rgba(0,0,0,.08)',padding:4,zIndex:20}}>
              {overflow.length === 0 && (
                <div style={{padding:'8px 12px',fontSize:'.8rem',color:'var(--muted)'}}>All tabs pinned</div>
              )}
              {overflow.map(([id, label]) => (
                <button key={id} onClick={() => { setDashTab(id); setMenuOpen(false) }}
                  style={{display:'block',width:'100%',textAlign:'left',padding:'8px 12px',borderRadius:6,border:'none',background:'transparent',cursor:'pointer',fontFamily:'Plus Jakarta Sans,sans-serif',fontSize:'.875rem',color:'var(--navy)'}}>
                  {label}
                </button>
              ))}
              <div style={{borderTop:'1px solid var(--border)',margin:'4px 0'}} />
              <button onClick={() => { setCustomizeOpen(true); setMenuOpen(false) }}
                style={{display:'block',width:'100%',textAlign:'left',padding:'8px 12px',borderRadius:6,border:'none',background:'transparent',cursor:'pointer',fontFamily:'Plus Jakarta Sans,sans-serif',fontSize:'.8rem',color:'var(--muted)'}}>
                ⚙ Customize tabs…
              </button>
            </div>
          )}
        </div>
      </div>

      {customizeOpen && (
        <div onClick={() => setCustomizeOpen(false)}
          style={{position:'fixed',inset:0,zIndex:200,background:'rgba(13,43,69,.55)',display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
          <div onClick={(e) => e.stopPropagation()}
            style={{background:'white',borderRadius:14,maxWidth:420,width:'100%',padding:'1.5rem',fontFamily:'Plus Jakarta Sans,sans-serif'}}>
            <div style={{fontWeight:800,fontSize:'1.05rem',color:'var(--navy)',marginBottom:6}}>Customize dashboard tabs</div>
            <div style={{fontSize:'.85rem',color:'var(--muted)',marginBottom:14}}>
              Pick which tabs appear directly in your tab bar. Everything else stays available under More ▾.
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
              {allTabs.map(([id, label]) => (
                <label key={id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:8,border:'1px solid var(--border)',cursor:'pointer',background:pinned.includes(id)?'rgba(11,110,118,.06)':'white'}}>
                  <input type="checkbox" checked={pinned.includes(id)} onChange={() => togglePin(id)}
                    style={{accentColor:'var(--teal)',cursor:'pointer'}} />
                  <span style={{fontSize:'.9rem',color:'var(--navy)',fontWeight:600}}>{label}</span>
                </label>
              ))}
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'space-between'}}>
              <button onClick={resetPinned}
                style={{background:'transparent',border:'1px solid var(--border)',color:'var(--muted)',padding:'.55rem 1rem',borderRadius:8,cursor:'pointer',fontFamily:'Plus Jakarta Sans,sans-serif',fontWeight:600,fontSize:'.85rem'}}>
                Reset to default
              </button>
              <button onClick={() => setCustomizeOpen(false)}
                style={{background:'var(--navy)',color:'white',border:'none',padding:'.55rem 1.25rem',borderRadius:8,cursor:'pointer',fontFamily:'Plus Jakarta Sans,sans-serif',fontWeight:700,fontSize:'.9rem'}}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function Dashboard() {
  useClinicianAuth()
  const navigate = useNavigate()
  const [dashTab, setDashTab]              = useState('queue')
  const [consultations, setConsultations] = useState([])
  const [loading, setLoading]             = useState(true)
  const [joiningId, setJoiningId]         = useState(null)
  const [todaysConsults, setTodaysConsults] = useState([])
  const [provIsAvail, setProvIsAvail]     = useState(false)
  const [savingProvAvail, setSavingProvAvail] = useState(false)
  const [referralBadge, setReferralBadge] = useState(0)
  const teamBadge = useTereChatUnread()
  const [nowTick, setNowTick]             = useState(Date.now())
  const isSupervisor = sessionStorage.getItem('providerIsSupervisor') === 'true'
  const isRMO = sessionStorage.getItem('providerType') === 'rmo'

  // Cooldown countdown ticker. Only runs while at least one consult is in
  // cooldown; otherwise idle. The patient only ever gets two SMSes: the
  // first at ring start and the second when the provider starts attempt 2.
  useEffect(() => {
    const hasCooldown = consultations.some(c => c.cooldown_until && new Date(c.cooldown_until) > new Date())
    if (!hasCooldown) return
    const t = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [consultations])

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/get-queue')
      if (!res.ok) throw new Error('queue fetch failed')
      const { consultations: data } = await res.json()
      setConsultations(data || [])
    } catch (e) {
      console.error('Queue load error:', e)
      setConsultations([])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    getTodaysConsultations().then(setTodaysConsults)
    // Load this provider's availability + referral badge
    const pid = sessionStorage.getItem('providerId')
    if (pid) {
      // Route through the auth-gated /api/providers endpoint — anon reads
      // on `providers` were revoked in the 2026-08-09 RLS lockdown.
      apiFetch(`/api/providers?id=${encodeURIComponent(pid)}&columns=is_available`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.provider) setProvIsAvail(d.provider.is_available) })
        .catch(() => {})
      import('../../lib/supabase').then(({ getRadiologyReferralCount }) =>
        getRadiologyReferralCount({ filter: 'active', provider_id: pid })
          .then(c => setReferralBadge(c))
          .catch(() => {})
      )
    }
    const interval = setInterval(() => {
      load()
      getTodaysConsultations().then(setTodaysConsults)
    }, 15000)
    const sub = subscribeToQueue(() => load())
    return () => { clearInterval(interval); sub?.unsubscribe?.() }
  }, [load])

  async function toggleProviderAvail() {
    const pid = sessionStorage.getItem('providerId')
    if (!pid) return
    setSavingProvAvail(true)
    try {
      const newVal = !provIsAvail
      const res = await apiFetch('/api/set-provider-avail', {
        method: 'POST',
        body: JSON.stringify({ providerId: pid, isAvailable: newVal }),
      })
      if (!res.ok) throw new Error('Failed')
      setProvIsAvail(newVal)
    } catch (e) { console.error('toggleProviderAvail error:', e) }
    setSavingProvAvail(false)
  }

  async function dismissConsult(id) {
    try {
      await updateConsultation(id, { status: 'expired' })
      setConsultations(cs => cs.filter(c => c.id !== id))
    } catch(e) { console.error(e) }
  }

  async function startConsult(consult) {
    const isMessage = consult.consultation_type === 'message' || consult.consultation_subtype === 'async_message'
    if (isMessage) {
      navigate('/provider/notes/' + consult.id)
      return
    }
    setJoiningId(consult.id)
    try {
      const providerId = sessionStorage.getItem('providerId')
      const providerDisplay = sessionStorage.getItem('providerDisplayName')
      await updateConsultation(consult.id, {
        status: 'vitals_requested',
        vitals_requested_at: new Date().toISOString(),
        ...(providerId ? { provider_id: providerId } : {}),
        ...(providerDisplay ? { provider_display_name: providerDisplay } : {}),
      })
      navigate('/clinician/consult/' + consult.id)
    } catch { navigate('/clinician/consult/' + consult.id) }
    finally { setJoiningId(null) }
  }

  return (
    <div className="page">
      <nav className="navbar">
        <span className="navbar-brand">Tere</span>
        <div className="navbar-right">
          <span style={{color:'rgba(255,255,255,.5)',fontSize:'.875rem'}}>{sessionStorage.getItem('providerDisplayName') || 'Clinician'}</span>
          <button onClick={() => { localStorage.removeItem('tere_portal'); sessionStorage.clear(); navigate('/clinician') }}
            style={{background:'rgba(255,255,255,.1)',border:'none',color:'rgba(255,255,255,.7)',padding:'6px 12px',borderRadius:'6px',cursor:'pointer',fontSize:'.8125rem'}}>
            Sign out
          </button>
          {sessionStorage.getItem('providerIsAdmin') === 'true' && (
            <button onClick={() => navigate('/clinician/admin')}
              style={{background:'rgba(255,255,255,.1)',border:'none',color:'rgba(255,255,255,.7)',padding:'6px 12px',borderRadius:'6px',cursor:'pointer',fontSize:'.8125rem',position:'relative'}}>
              Admin
              {referralBadge > 0 && (
                <span style={{position:'absolute',top:-6,right:-6,background:'#DC2626',color:'white',fontSize:'.625rem',fontWeight:700,padding:'1px 5px',borderRadius:99,minWidth:16,textAlign:'center'}}>
                  {referralBadge}
                </span>
              )}
            </button>
          )}
        </div>
      </nav>

      <div className="container-wide" style={{paddingTop:'1.75rem',paddingBottom:'3rem',background:'var(--bg)',minHeight:'calc(100dvh - 56px)'}}>

        {/* Per-provider availability toggle */}
        {sessionStorage.getItem('providerId') && (
          <div style={{background:'white',borderRadius:'var(--radius-sm)',border:'2px solid ' + (provIsAvail ? 'var(--success)' : '#D1D5DB'),padding:'1rem 1.25rem',marginBottom:'1rem',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'1rem',flexWrap:'wrap'}}>
            <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
              <div style={{width:12,height:12,borderRadius:'50%',background:provIsAvail ? 'var(--success)' : '#D1D5DB',flexShrink:0}} />
              <div>
                <div style={{fontWeight:700,fontSize:'.9375rem'}}>{provIsAvail ? "You're online — taking patients" : "You're offline"}</div>
                <div style={{fontSize:'.8125rem',color:'var(--muted)'}}>Toggle to open or close your queue</div>
              </div>
            </div>
            <button onClick={toggleProviderAvail} disabled={savingProvAvail}
              style={{background:provIsAvail ? 'var(--danger)' : 'var(--success)',color:'white',border:'none',padding:'8px 18px',borderRadius:'8px',fontWeight:700,fontSize:'.9375rem',cursor:'pointer',fontFamily:'Plus Jakarta Sans,sans-serif',whiteSpace:'nowrap'}}>
              {savingProvAvail ? 'Saving…' : provIsAvail ? 'Go offline' : 'Go online'}
            </button>
          </div>
        )}

        {/* Tab switcher — baseline pinned tabs on the left, everything else
            behind a "More ▾" dropdown. Providers can pin/unpin any tab via
            the "Customize tabs" menu item; the pinned set is persisted per
            browser in localStorage. */}
        <DashTabSwitcher
          dashTab={dashTab}
          setDashTab={setDashTab}
          teamBadge={teamBadge}
          isSupervisor={isSupervisor}
          isRMO={isRMO}
        />

        {dashTab === 'tere-chat' && <TereChatTab />}

        {dashTab === 'queue' && (<>
          {/* Queue header */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1rem'}}>
            <div>
              <h1 style={{marginBottom:'.25rem'}}>Patient queue</h1>
              <p style={{fontSize:'.875rem'}}>Updates every 15 seconds</p>
            </div>
            <button onClick={load} style={{background:'var(--teal-light)',border:'none',color:'var(--teal)',padding:'8px 16px',borderRadius:'var(--radius-sm)',cursor:'pointer',fontFamily:'Plus Jakarta Sans,sans-serif',fontWeight:600,fontSize:'.875rem'}}>
              ↻ Refresh
            </button>
          </div>

          {loading ? (
            <div style={{textAlign:'center',padding:'3rem'}}><div className="spinner" /></div>
          ) : consultations.filter(c => c.consultation_type !== 'message').length === 0 ? (
            <div className="card" style={{textAlign:'center',padding:'3rem'}}>
              <div style={{fontSize:'2.5rem',marginBottom:'1rem'}}>✓</div>
              <h3>No patients waiting</h3>
              <p>New consultations will appear here automatically.</p>
            </div>
          ) : (
            <div className="card" style={{padding:0,overflow:'hidden'}}>
              {/* Header row */}
              <div style={{display:'grid',gridTemplateColumns:'2fr 2fr 1fr 1fr auto',gap:'1rem',padding:'.625rem 1rem',background:'#F8FAFC',borderBottom:'1px solid var(--border)',fontSize:'.75rem',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.05em'}}>
                <span>Patient</span><span>Complaint</span><span>Type</span><span>Waiting</span><span></span>
              </div>
              {consultations.filter(c => c.consultation_type !== 'message').map((c, i, arr) => {
                const st = statusLabel(c.status)
                const v = c.vitals
                const currentPid = sessionStorage.getItem('providerId')
                const isProviderLock = c.provider_id && c.provider_id !== currentPid
                // Cooldown: patient didn't join the first ring — row is
                // clickable for nobody for the 5-min window. See
                // supabase-no-show-migration.sql.
                const cooldownUntil = c.cooldown_until ? new Date(c.cooldown_until) : null
                const isCooldown = cooldownUntil && cooldownUntil > new Date(nowTick)
                const cooldownSecs = isCooldown ? Math.max(0, Math.round((cooldownUntil - nowTick) / 1000)) : 0
                const isLocked = isProviderLock || isCooldown
                const attemptNum = c.join_attempts || 0
                const isSecondAttempt = attemptNum >= 1 && !c.patient_joined_at
                const isLast = i === arr.length - 1
                return (
                  <div
                    key={c.id}
                    onClick={() => { if (!isLocked) navigate(`/clinician/patient/${c.id}`) }}
                    style={{
                      display:'grid', gridTemplateColumns:'2fr 2fr 1fr 1fr auto',
                      gap:'1rem', padding:'.75rem 1rem',
                      borderBottom: isLast ? 'none' : '1px solid #F3F4F6',
                      background: isLocked ? '#F3F4F6' : 'white',
                      opacity: isLocked ? 0.65 : 1,
                      cursor: isLocked ? 'not-allowed' : 'pointer',
                      alignItems: 'center',
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => { if (!isLocked) e.currentTarget.style.background = '#F0F9FA' }}
                    onMouseLeave={e => { e.currentTarget.style.background = isLocked ? '#F3F4F6' : 'white' }}
                  >
                    <div>
                      <div style={{fontWeight:700,fontSize:'.9375rem',color:'var(--text)'}}>
                        {c.patient_first_name} {c.patient_last_name}
                      </div>
                      <div style={{display:'flex',gap:'.5rem',marginTop:2,flexWrap:'wrap',alignItems:'center'}}>
                        <span style={{background:st.color+'20',color:st.color,fontSize:'.7rem',fontWeight:700,padding:'1px 7px',borderRadius:99}}>{st.label}</span>
                        {c.acc_eligible === 'yes' && <span className="badge badge-info" style={{fontSize:'.7rem'}}>ACC</span>}
                        {isProviderLock && <span style={{fontSize:'.7rem',color:'#6B7280'}}>🔒 {c.provider_display_name || 'In use'}</span>}
                        {isCooldown && (
                          <span style={{background:'#FEF3C7',color:'#92400E',fontSize:'.7rem',fontWeight:700,padding:'1px 7px',borderRadius:99}}>
                            🕐 Retry in {String(Math.floor(cooldownSecs/60)).padStart(1,'0')}:{String(cooldownSecs%60).padStart(2,'0')}
                          </span>
                        )}
                        {!isCooldown && isSecondAttempt && (
                          <span style={{background:'#FEE2E2',color:'#991B1B',fontSize:'.7rem',fontWeight:700,padding:'1px 7px',borderRadius:99}}>
                            2nd attempt
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{fontSize:'.875rem',color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {c.chief_complaint || '—'}
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:4}}>
                      <TypeBadge type={c.consultation_type || 'video'} />
                      {v && !v.skipped && v.hr && <span style={{fontSize:'.75rem',color:'var(--success)',fontWeight:600,marginLeft:4}}>❤️ {v.hr}</span>}
                    </div>
                    <div style={{fontSize:'.8125rem',color:'var(--muted)'}}>{timeAgo(c.created_at)}</div>
                    <div onClick={e => e.stopPropagation()} style={{ display:'flex', gap:6, alignItems:'center' }}>
                      {!isLocked && (
                        <button
                          onClick={() => navigate('/provider/consult/' + c.id)}
                          disabled={joiningId === c.id}
                          style={{ background:'#0B6E76', border:'none', color:'white', padding:'6px 14px', borderRadius:6, cursor: joiningId === c.id ? 'wait' : 'pointer', fontSize:'.8125rem', fontWeight:700, fontFamily:'Plus Jakarta Sans,sans-serif', whiteSpace:'nowrap' }}>
                          {c.consultation_type === 'video' ? '📹 Start call' : '📞 Start call'}
                        </button>
                      )}
                      {!isLocked && (
                        <button onClick={() => dismissConsult(c.id)}
                          style={{background:'none',border:'1px solid #FECACA',color:'#DC2626',padding:'4px 8px',borderRadius:6,cursor:'pointer',fontSize:'.75rem',fontWeight:600,fontFamily:'Plus Jakarta Sans,sans-serif'}}>
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Daily summary */}
          <div style={{marginTop:'2rem'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1rem'}}>
              <div>
                <h2 style={{fontSize:'1.125rem',marginBottom:'.125rem'}}>Today's consultations</h2>
                <p style={{fontSize:'.875rem'}}>{new Date().toLocaleDateString('en-NZ',{weekday:'long',day:'numeric',month:'long'})}</p>
              </div>
              <div style={{background:'var(--navy)',color:'white',borderRadius:'var(--radius-sm)',padding:'.5rem 1rem',fontSize:'1.25rem',fontWeight:700}}>{todaysConsults.length}</div>
            </div>
            {todaysConsults.length === 0 ? (
              <div style={{background:'white',borderRadius:'var(--radius-sm)',padding:'1.25rem',border:'1px solid var(--border)',textAlign:'center',color:'var(--muted)'}}>
                No completed consultations today yet.
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:'.625rem'}}>
                {todaysConsults.map(c => {
                  const acts = c.clinical_notes?.actions || []
                  return (
                    <div key={c.id} style={{background:'white',borderRadius:'var(--radius-sm)',padding:'1rem 1.25rem',border:'1px solid var(--border)',display:'grid',gridTemplateColumns:'1fr auto',gap:'1rem',alignItems:'center'}}>
                      <div>
                        <div style={{fontWeight:600,marginBottom:'.25rem'}}>{c.patient_first_name} {c.patient_last_name}{c.acc_eligible==='yes'&&<span className="badge badge-info" style={{marginLeft:'8px'}}>ACC</span>}</div>
                        <div style={{fontSize:'.875rem',color:'var(--muted)',marginBottom:'.25rem'}}>{c.chief_complaint}</div>
                        <div style={{display:'flex',gap:'.75rem',flexWrap:'wrap'}}>
                          {acts.filter(a=>a.type==='prescription').length > 0 && <span style={{fontSize:'.8125rem',color:'#5B21B6',fontWeight:600}}>💊 Rx</span>}
                          {acts.filter(a=>a.type==='radiology').length > 0 && <span style={{fontSize:'.8125rem',color:'#92400E',fontWeight:600}}>🩻 Imaging</span>}
                          {acts.filter(a=>a.type==='acc45').length > 0 && <span style={{fontSize:'.8125rem',color:'var(--success)',fontWeight:600}}>✓ ACC</span>}
                          {c.clinical_notes?.A && <span style={{fontSize:'.8125rem',color:'var(--text)'}}>Dx: {c.clinical_notes.A.slice(0,60)}</span>}
                        </div>
                      </div>
                      <div style={{fontSize:'.8125rem',color:'var(--muted)',whiteSpace:'nowrap'}}>{new Date(c.created_at).toLocaleTimeString('en-NZ',{hour:'2-digit',minute:'2-digit'})}</div>
                    </div>
                  )
                })}
                <div style={{background:'var(--navy)',borderRadius:'var(--radius-sm)',padding:'1rem 1.25rem',display:'flex',gap:'2rem',flexWrap:'wrap'}}>
                  <div style={{color:'rgba(255,255,255,.4)',fontSize:'.75rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',width:'100%',marginBottom:'.25rem'}}>Day total</div>
                  {[
                    ['Consultations', todaysConsults.length],
                    ['Prescriptions', todaysConsults.reduce((s,c)=>s+(c.clinical_notes?.actions||[]).filter(a=>a.type==='prescription').length,0)],
                    ['Imaging', todaysConsults.reduce((s,c)=>s+(c.clinical_notes?.actions||[]).filter(a=>a.type==='radiology').length,0)],
                    ['ACC claims', todaysConsults.reduce((s,c)=>s+(c.clinical_notes?.actions||[]).filter(a=>a.type==='acc45').length,0)],
                  ].map(([label,count]) => (
                    <div key={label}>
                      <div style={{fontSize:'1.25rem',fontWeight:700,color:'#C8A882'}}>{count}</div>
                      <div style={{fontSize:'.75rem',color:'rgba(255,255,255,.5)'}}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>)}

        {dashTab === 'notes' && <NotesTab navigate={navigate} />}
        {dashTab === 'licenses' && (
          <div style={{ marginTop: 8 }}>
            <button onClick={() => navigate('/clinician/state-licenses')}
              style={{ background: 'var(--navy)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 8, fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, fontSize: '.9rem', cursor: 'pointer' }}>
              Open state licenses →
            </button>
            <p style={{ marginTop: '.75rem', fontSize: '.85rem', color: 'var(--muted)' }}>
              Add / view your US state licenses. Once approved by admin, you'll be able to see patients from those states.
            </p>
          </div>
        )}
        {dashTab === 'inbox' && <ProviderInbox embedded />}
        {dashTab === 'earnings' && <ProviderEarnings embedded />}
        {dashTab === 'supervision' && isSupervisor && <SupervisionReviewsTab navigate={navigate} />}
        {dashTab === 'my-supervision' && isRMO && <RMOSupervisionSelfTab />}

      </div>
    </div>
  )
}

// SupervisionReviewsTab — supervisor's log of scheduled review meetings
// with each RMO. MCNZ requires documented evidence that regular review
// meetings occur at the agreed cadence; this is the audit trail. There
// is no per-consult countersign flow — the meeting log is the only
// supervision artefact.
// eslint-disable-next-line no-unused-vars
function SupervisionReviewsTab({ navigate }) {
  const [rmos, setRmos]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [showLog, setShowLog]   = useState(true)
  const [logRmo, setLogRmo]     = useState('')
  const [logDuration, setLogDuration] = useState('')
  const [logConcerns, setLogConcerns] = useState('')
  const [logActions, setLogActions]   = useState('')
  const [logResult, setLogResult]     = useState(null)
  const [reviews, setReviews]         = useState([])

  const loadRmos = useCallback(async () => {
    try {
      const res = await apiFetch('/api/supervision?action=list_rmos')
      if (res.ok) {
        const { rmos: r } = await res.json()
        setRmos(r || [])
      }
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { loadRmos() }, [loadRmos])

  const loadReviews = useCallback(async (rmoId) => {
    if (!rmoId) { setReviews([]); return }
    const res = await apiFetch(`/api/supervision?action=reviews&rmoId=${rmoId}`)
    if (res.ok) { const { reviews: rv } = await res.json(); setReviews(rv || []) }
  }, [])
  useEffect(() => { loadReviews(logRmo) }, [logRmo, loadReviews])

  async function submitLog(e) {
    e.preventDefault()
    if (!logRmo) return
    setLogResult(null)
    const res = await apiFetch('/api/supervision', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'log_review', rmoId: logRmo,
        meeting_duration_min: logDuration ? Number(logDuration) : null,
        concerns_raised: logConcerns.trim() || null,
        actions_agreed: logActions.trim() || null,
        cases_reviewed: [],
      }),
    })
    if (res.ok) {
      setLogResult('logged'); setLogConcerns(''); setLogActions(''); setLogDuration('')
      loadReviews(logRmo)
    } else {
      const j = await res.json().catch(() => ({}))
      setLogResult('error: ' + (j.error || res.status))
    }
  }

  if (loading) return <div style={{padding:'1.25rem',color:'var(--muted)'}}>Loading…</div>

  if (rmos.length === 0) {
    return (
      <div style={{padding:'1.25rem',color:'var(--muted)'}}>
        No RMOs assigned to you yet. RMOs are set up in the admin panel by giving them <code>provider_type = 'rmo'</code> and <code>supervisor_id = &lt;your provider id&gt;</code>.
      </div>
    )
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>
      <div style={{background:'#F0F9FA',border:'1px solid #BAE6E9',borderRadius:12,padding:'.875rem 1.125rem',fontSize:'.8125rem',color:'#0B4F5A',lineHeight:1.6}}>
        <strong>MCNZ supervision reviews.</strong> Log every scheduled meeting with each RMO — weekly for the first 3 months, fortnightly thereafter. This log is the audit trail MCNZ can request during a scope review. There is no per-consult countersign flow.
      </div>

      <div className="card" style={{padding:'1rem 1.25rem'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'.75rem'}}>
          <div style={{fontSize:'.75rem',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.05em'}}>Log review meeting</div>
          <button onClick={() => setShowLog(v => !v)}
            style={{background:'none',border:'none',color:'#0B6E76',fontSize:'.8125rem',fontWeight:700,cursor:'pointer'}}>
            {showLog ? '× Close' : '+ New review log'}
          </button>
        </div>
        {showLog && (
          <form onSubmit={submitLog} style={{display:'flex',flexDirection:'column',gap:'.625rem'}}>
            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:'.5rem'}}>
              <select value={logRmo} onChange={e => setLogRmo(e.target.value)} required
                style={{padding:'.5rem .75rem',border:'1.5px solid var(--border)',borderRadius:8,fontFamily:'Plus Jakarta Sans,sans-serif',fontSize:'.875rem'}}>
                <option value=''>— Select RMO —</option>
                {rmos.map(r => <option key={r.id} value={r.id}>{r.display_name || `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.id.slice(0,8)}</option>)}
              </select>
              <input type='number' min='5' max='240' value={logDuration} onChange={e => setLogDuration(e.target.value)} placeholder='Minutes'
                style={{padding:'.5rem .75rem',border:'1.5px solid var(--border)',borderRadius:8,fontFamily:'Plus Jakarta Sans,sans-serif',fontSize:'.875rem'}} />
            </div>
            <textarea value={logConcerns} onChange={e => setLogConcerns(e.target.value)} rows={2} placeholder='Concerns raised (near-miss, prescribing patterns, escalation delays…)'
              style={{padding:'.5rem .75rem',border:'1.5px solid var(--border)',borderRadius:8,fontFamily:'Plus Jakarta Sans,sans-serif',fontSize:'.875rem',resize:'vertical'}} />
            <textarea value={logActions} onChange={e => setLogActions(e.target.value)} rows={2} placeholder='Actions agreed (learning plan, follow-up review, scope changes…)'
              style={{padding:'.5rem .75rem',border:'1.5px solid var(--border)',borderRadius:8,fontFamily:'Plus Jakarta Sans,sans-serif',fontSize:'.875rem',resize:'vertical'}} />
            <div style={{display:'flex',gap:'.5rem',alignItems:'center'}}>
              <button type='submit' style={{background:'#0B6E76',color:'white',border:'none',padding:'8px 18px',borderRadius:8,fontSize:'.8125rem',fontWeight:700,cursor:'pointer',fontFamily:'Plus Jakarta Sans,sans-serif'}}>Save review</button>
              {logResult === 'logged' && <span style={{color:'#065F46',fontSize:'.75rem',fontWeight:600}}>✓ Logged</span>}
              {logResult && logResult.startsWith('error') && <span style={{color:'#B91C1C',fontSize:'.75rem'}}>{logResult}</span>}
            </div>
          </form>
        )}
      </div>

      {logRmo && (
        <div className="card" style={{padding:'1rem 1.25rem'}}>
          <div style={{fontSize:'.75rem',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'.75rem'}}>Meeting history ({reviews.length})</div>
          {reviews.length === 0 ? (
            <div style={{color:'var(--muted)',fontSize:'.875rem',padding:'.5rem 0'}}>No meetings logged with this RMO yet.</div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:'.5rem'}}>
              {reviews.map(rv => (
                <div key={rv.id} style={{border:'1px solid #E2E8F0',borderRadius:10,padding:'.625rem .875rem',fontSize:'.8125rem'}}>
                  <div style={{display:'flex',gap:'.75rem',alignItems:'center',marginBottom:'.25rem'}}>
                    <strong>{new Date(rv.meeting_date).toLocaleDateString('en-NZ',{day:'numeric',month:'short',year:'numeric'})}</strong>
                    {rv.meeting_duration_min && <span style={{color:'var(--muted)'}}>{rv.meeting_duration_min} min</span>}
                  </div>
                  {rv.concerns_raised && <div style={{marginTop:2}}><span style={{color:'var(--muted)'}}>Concerns:</span> {rv.concerns_raised}</div>}
                  {rv.actions_agreed && <div style={{marginTop:2}}><span style={{color:'var(--muted)'}}>Actions:</span> {rv.actions_agreed}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// RMOSupervisionSelfTab — the RMO's own view of their supervision setup.
// Shows the supervisor's name + contact + the review meeting log so far.
// Read-only from the RMO's side. Fetches via /api/supervision and
// /api/providers.
function RMOSupervisionSelfTab() {
  const [supervisor, setSupervisor] = useState(null)
  const [reviews, setReviews]       = useState([])
  const [loading, setLoading]       = useState(true)
  const selfId       = sessionStorage.getItem('providerId')
  const supervisorId = sessionStorage.getItem('providerSupervisorId')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [supRes, revRes] = await Promise.all([
          supervisorId ? apiFetch(`/api/providers?id=${supervisorId}&columns=id,first_name,last_name,credential,specialty,email`) : Promise.resolve(null),
          apiFetch(`/api/supervision?action=reviews&rmoId=${selfId}`),
        ])
        if (cancelled) return
        if (supRes?.ok) { const { provider } = await supRes.json(); setSupervisor(provider) }
        if (revRes.ok) { const { reviews: rv } = await revRes.json(); setReviews(rv || []) }
      } finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [selfId, supervisorId])

  if (loading) return <div style={{padding:'1.25rem',color:'var(--muted)'}}>Loading…</div>

  return (
    <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>
      <div style={{background:'#F0F9FA',border:'1px solid #BAE6E9',borderRadius:12,padding:'.875rem 1.125rem',fontSize:'.8125rem',color:'#0B4F5A',lineHeight:1.6}}>
        <strong>MCNZ supervision.</strong> You are practising under a supervised scope. Contact your supervisor by phone (text or voice call) for any clinical question that falls outside your agreed scope. See the plan document filed with MCNZ for the details.
      </div>

      <div className="card" style={{padding:'1rem 1.25rem'}}>
        <div style={{fontSize:'.75rem',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'.75rem'}}>Your supervisor</div>
        {supervisor ? (
          <div style={{display:'flex',flexDirection:'column',gap:'.375rem'}}>
            <div style={{fontSize:'1rem',fontWeight:700,color:'var(--text)'}}>
              {supervisor.credential ? `${supervisor.credential} ` : ''}{supervisor.first_name} {supervisor.last_name}
            </div>
            {supervisor.specialty && <div style={{fontSize:'.8125rem',color:'var(--muted)'}}>{supervisor.specialty}</div>}
            {supervisor.email && (
              <div style={{fontSize:'.8125rem'}}>
                <span style={{color:'var(--muted)'}}>Email: </span>
                <a href={`mailto:${supervisor.email}`} style={{color:'#0B6E76',textDecoration:'none',fontWeight:600}}>{supervisor.email}</a>
              </div>
            )}
            <div style={{fontSize:'.75rem',color:'var(--muted)',marginTop:6,paddingTop:6,borderTop:'1px solid #F1F5F9'}}>
              Your supervisor's mobile is on the signed supervision plan you filed with MCNZ — save it in your phone.
            </div>
          </div>
        ) : (
          <div style={{color:'var(--muted)',fontSize:'.875rem'}}>No supervisor on file. Contact admin.</div>
        )}
      </div>

      <div className="card" style={{padding:'1rem 1.25rem'}}>
        <div style={{fontSize:'.75rem',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'.75rem'}}>Review meeting log ({reviews.length})</div>
        {reviews.length === 0 ? (
          <div style={{color:'var(--muted)',fontSize:'.875rem',padding:'.5rem 0'}}>No review meetings logged yet. Your supervisor records these on their end.</div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:'.5rem'}}>
            {reviews.map(rv => (
              <div key={rv.id} style={{border:'1px solid #E2E8F0',borderRadius:10,padding:'.625rem .875rem',fontSize:'.8125rem'}}>
                <div style={{display:'flex',gap:'.75rem',alignItems:'center',marginBottom:'.25rem'}}>
                  <strong>{new Date(rv.meeting_date).toLocaleDateString('en-NZ',{day:'numeric',month:'short',year:'numeric'})}</strong>
                  {rv.meeting_duration_min && <span style={{color:'var(--muted)'}}>{rv.meeting_duration_min} min</span>}
                </div>
                {rv.concerns_raised && <div style={{marginTop:2}}><span style={{color:'var(--muted)'}}>Concerns:</span> {rv.concerns_raised}</div>}
                {rv.actions_agreed && <div style={{marginTop:2}}><span style={{color:'var(--muted)'}}>Actions agreed:</span> {rv.actions_agreed}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
