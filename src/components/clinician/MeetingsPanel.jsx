// Admin → Meetings tab. Create / list / admit / join business video meetings
// with external partners (PHOs, employers, insurers, workforce agencies).
//
// Separate surface from Careers interviews — different workflow, no applicant
// pipeline. Reuses the LiveKit video room via /api/business-meetings host_token
// → opens MeetingHostRoom in a new tab.

import { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'

const card = {
  background:'white', border:'1px solid #E2E8F0', borderRadius:10,
  padding:'1.25rem', marginBottom:'1rem',
}
const btnPrimary = {
  background:TEAL, color:'white', border:'none', borderRadius:8,
  padding:'10px 16px', fontSize:'.9rem', fontWeight:700, cursor:'pointer',
  fontFamily:'Plus Jakarta Sans, sans-serif',
}
const btnGhost = {
  background:'white', color:TEAL, border:`1.5px solid ${TEAL}`, borderRadius:8,
  padding:'8px 12px', fontSize:'.85rem', fontWeight:700, cursor:'pointer',
  fontFamily:'Plus Jakarta Sans, sans-serif',
}
const btnDanger = {
  background:'white', color:'#991B1B', border:'1.5px solid #FECACA', borderRadius:8,
  padding:'8px 12px', fontSize:'.85rem', fontWeight:700, cursor:'pointer',
  fontFamily:'Plus Jakarta Sans, sans-serif',
}

export default function MeetingsPanel() {
  const [meetings, setMeetings] = useState([])
  const [origin, setOrigin]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [busy, setBusy] = useState({})

  async function refresh() {
    try {
      const res = await apiFetch('/api/business-meetings')
      const body = await res.json().catch(() => ({}))
      if (res.ok) {
        setMeetings(body.meetings || [])
        setOrigin(body.originForGuestLink || window.location.origin)
      }
    } finally { setLoading(false) }
  }

  useEffect(() => {
    refresh()
    // Poll every 15s so admin sees knock state without manual refresh.
    const iv = setInterval(refresh, 15_000)
    return () => clearInterval(iv)
  }, [])

  async function act(action, id) {
    if (busy[id]) return
    setBusy(b => ({ ...b, [id]: true }))
    try {
      await apiFetch(`/api/business-meetings?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      await refresh()
    } finally {
      setBusy(b => { const n = { ...b }; delete n[id]; return n })
    }
  }

  async function joinAsHost(m) {
    if (busy[m.id]) return
    // IMPORTANT: open the tab synchronously inside the click handler.
    // Safari (and Chrome, increasingly) blocks window.open() after an
    // intervening `await` because the call is no longer attributable to
    // a direct user gesture. We open about:blank now, flip its location
    // once the token comes back. `noopener` is omitted on purpose so we
    // keep a handle on the window; the host-room page doesn't talk back.
    const tab = window.open('about:blank', '_blank')
    if (!tab) {
      window.alert('Pop-ups are blocked. Allow pop-ups for this site and click Join as host again.')
      return
    }
    // Render a placeholder immediately so the user doesn't stare at a
    // blank tab while the token mints.
    try {
      tab.document.write('<title>Loading meeting…</title><div style="font-family:system-ui;padding:40px;color:#374151">Preparing your video room…</div>')
    } catch {}
    setBusy(b => ({ ...b, [m.id]: true }))
    try {
      const res = await apiFetch('/api/business-meetings?action=host_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: m.id }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        try { tab.close() } catch {}
        window.alert(body.error || 'Could not open the room.')
        return
      }
      if (body.mock) {
        try { tab.close() } catch {}
        window.alert('LiveKit not configured — demo mode only.')
        return
      }
      const params = new URLSearchParams({
        token:     body.token,
        serverUrl: body.serverUrl,
        title:     m.title || 'Meeting',
        guest:     m.guest_name || '',
      })
      tab.location.href = `/meeting-host?${params.toString()}`
      // Refresh to show "in_progress"
      setTimeout(refresh, 500)
    } catch (e) {
      try { tab.close() } catch {}
      window.alert('Could not open the room: ' + (e?.message || 'unknown error'))
    } finally {
      setBusy(b => { const n = { ...b }; delete n[m.id]; return n })
    }
  }

  function copyLink(m) {
    const url = `${origin}/meet/${m.guest_join_token || ''}`
    // guest_join_token isn't in the list response for privacy — the server
    // omits it. Instead, do a tiny lookup via the create response path:
    // we stash the token at the moment of creation (see CreateMeetingModal).
    // For older meetings, prompt the admin to use the knock state as signal.
    navigator.clipboard?.writeText(url).catch(() => {})
  }

  const knocking = meetings.filter(m => m.admission_status === 'knocking' && m.status !== 'cancelled')
  const upcoming = meetings.filter(m => (m.status === 'scheduled' || m.status === 'in_progress') && m.admission_status !== 'knocking')
  const recent   = meetings.filter(m => m.status === 'completed' || m.status === 'cancelled')

  return (
    <>
      <div style={card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
          <div>
            <div style={{ fontSize:'1.1rem', fontWeight:700, color:NAVY }}>📅 Business meetings</div>
            <div style={{ fontSize:'.85rem', color:'#6B7280' }}>Branded video rooms for partners (PHOs, employers, insurers).</div>
          </div>
          <button onClick={() => setShowCreate(true)} style={btnPrimary}>+ New meeting</button>
        </div>
      </div>

      {knocking.length > 0 && (
        <div style={{ ...card, background:'#FEF3C7', border:'2px solid #F59E0B' }}>
          <div style={{ fontSize:'.95rem', fontWeight:700, color:'#78350F', marginBottom:'.75rem' }}>
            🚪 {knocking.length} guest{knocking.length > 1 ? 's' : ''} waiting to be let in
          </div>
          {knocking.map(m => (
            <KnockRow key={m.id} m={m} busy={!!busy[m.id]} onAdmit={() => act('admit', m.id)} onDeny={() => act('deny', m.id)} onJoin={() => joinAsHost(m)} />
          ))}
        </div>
      )}

      <div style={card}>
        <div style={{ fontSize:'.95rem', fontWeight:700, color:NAVY, marginBottom:'.75rem' }}>Upcoming &amp; in-progress</div>
        {loading ? (
          <div style={{ color:'#9CA3AF', fontSize:'.9rem' }}>Loading…</div>
        ) : upcoming.length === 0 ? (
          <div style={{ color:'#9CA3AF', fontSize:'.9rem' }}>No upcoming meetings. Click <strong>+ New meeting</strong> to create one.</div>
        ) : (
          upcoming.map(m => (
            <MeetingRow key={m.id} m={m} origin={origin} busy={!!busy[m.id]} onJoin={() => joinAsHost(m)} onCancel={() => act('cancel', m.id)} />
          ))
        )}
      </div>

      {recent.length > 0 && (
        <div style={card}>
          <div style={{ fontSize:'.95rem', fontWeight:700, color:NAVY, marginBottom:'.75rem' }}>Recent</div>
          {recent.slice(0, 15).map(m => (
            <div key={m.id} style={{ fontSize:'.85rem', color:'#6B7280', padding:'8px 0', borderTop:'1px solid #F1F5F9' }}>
              <span style={{ fontWeight:600, color:NAVY }}>{m.title}</span> · {m.guest_name}
              {m.scheduled_at && <> · {new Date(m.scheduled_at).toLocaleString('en-NZ', { timeZone:'Pacific/Auckland', dateStyle:'short', timeStyle:'short' })}</>}
              · <span style={{ textTransform:'capitalize' }}>{m.status}</span>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateMeetingModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); refresh() }} />}
    </>
  )
}

function KnockRow({ m, busy, onAdmit, onDeny, onJoin }) {
  const knockedAgo = m.guest_knocked_at ? Math.round((Date.now() - new Date(m.guest_knocked_at).getTime()) / 1000) : null
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderTop:'1px solid #FDE68A', gap:12, flexWrap:'wrap' }}>
      <div style={{ flex:1, minWidth:200 }}>
        <div style={{ fontSize:'.95rem', fontWeight:700, color:NAVY }}>{m.guest_name} <span style={{ color:'#78350F', fontWeight:600 }}>wants to join</span></div>
        <div style={{ fontSize:'.8rem', color:'#78350F', marginTop:2 }}>{m.title}{knockedAgo != null && ` · knocked ${knockedAgo}s ago`}</div>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={onAdmit} disabled={busy} style={btnPrimary}>✓ Admit</button>
        <button onClick={onJoin}  disabled={busy} style={btnGhost}>Join as host</button>
        <button onClick={onDeny}  disabled={busy} style={btnDanger}>Deny</button>
      </div>
    </div>
  )
}

function MeetingRow({ m, origin, busy, onJoin, onCancel }) {
  const when = m.scheduled_at ? new Date(m.scheduled_at).toLocaleString('en-NZ', { timeZone:'Pacific/Auckland', dateStyle:'medium', timeStyle:'short' }) : 'Ad-hoc'
  return (
    <div style={{ padding:'12px 0', borderTop:'1px solid #F1F5F9' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'start', gap:12, flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:200 }}>
          <div style={{ fontSize:'.95rem', fontWeight:700, color:NAVY }}>{m.title}</div>
          <div style={{ fontSize:'.8rem', color:'#6B7280', marginTop:2 }}>
            {m.guest_name}{m.guest_organisation ? ` · ${m.guest_organisation}` : ''}
            {m.guest_email ? ` · ${m.guest_email}` : ''}
          </div>
          <div style={{ fontSize:'.8rem', color:'#6B7280', marginTop:2 }}>
            🗓 {when} · {m.duration_minutes || 30} min
            {m.status === 'in_progress' && <span style={{ marginLeft:8, color:'#065F46', fontWeight:700 }}>● IN PROGRESS</span>}
            {m.host_display_name && ` · host: ${m.host_display_name}`}
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onJoin} disabled={busy} style={btnPrimary}>🎥 Join as host</button>
          <button onClick={onCancel} disabled={busy} style={btnDanger}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function CreateMeetingModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '', guestName: '', guestEmail: '', guestOrganisation: '',
    scheduledAt: '', durationMinutes: 30, sendInvite: true, notes: '',
  })
  const [saving, setSaving]   = useState(false)
  const [created, setCreated] = useState(null)   // { guestJoinUrl } once saved
  const [err, setErr]         = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function submit() {
    if (!form.title.trim() || !form.guestName.trim()) {
      setErr('Title and guest name are required.'); return
    }
    setSaving(true); setErr('')
    try {
      const body = {
        title:              form.title.trim(),
        guestName:          form.guestName.trim(),
        guestEmail:         form.guestEmail.trim() || null,
        guestOrganisation:  form.guestOrganisation.trim() || null,
        scheduledAt:        form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
        durationMinutes:    form.durationMinutes,
        notes:              form.notes.trim() || null,
        sendInvite:         form.sendInvite && !!form.guestEmail.trim(),
      }
      const res  = await apiFetch('/api/business-meetings?action=create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(data.error || 'Could not create meeting.'); return }
      setCreated({ guestJoinUrl: data.guestJoinUrl, inviteSent: body.sendInvite })
    } finally { setSaving(false) }
  }

  if (created) {
    return (
      <Modal onClose={onCreated}>
        <h3 style={{ fontSize:'1.1rem', fontWeight:700, color:NAVY, marginBottom:12 }}>✓ Meeting created</h3>
        {created.inviteSent && <div style={{ color:'#065F46', fontSize:'.9rem', marginBottom:12 }}>Invite email sent to {form.guestEmail} with .ics attached.</div>}
        <div style={{ fontSize:'.85rem', color:'#6B7280', marginBottom:6 }}>Guest join link (copy if you need to resend manually):</div>
        <div style={{ background:'#F1F5F9', border:'1px solid #CBD5E1', padding:'10px 12px', borderRadius:6, fontSize:'.8rem', fontFamily:'monospace', wordBreak:'break-all', color:TEAL, marginBottom:12 }}>{created.guestJoinUrl}</div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={() => navigator.clipboard?.writeText(created.guestJoinUrl)} style={btnGhost}>📋 Copy link</button>
          <button onClick={onCreated} style={btnPrimary}>Done</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal onClose={onClose}>
      <h3 style={{ fontSize:'1.1rem', fontWeight:700, color:NAVY, marginBottom:12 }}>New business meeting</h3>
      <Field label="Meeting title *" value={form.title} onChange={v => set('title', v)} placeholder="e.g. Marlborough PHO — pilot kickoff" />
      <Field label="Guest name *" value={form.guestName} onChange={v => set('guestName', v)} placeholder="e.g. Mike Killick" />
      <Field label="Guest email" type="email" value={form.guestEmail} onChange={v => set('guestEmail', v)} placeholder="guest@example.com" />
      <Field label="Guest organisation" value={form.guestOrganisation} onChange={v => set('guestOrganisation', v)} placeholder="e.g. Triple O" />
      <div style={{ display:'flex', gap:10 }}>
        <div style={{ flex:2 }}>
          <Field label="Scheduled time" type="datetime-local" value={form.scheduledAt} onChange={v => set('scheduledAt', v)} />
        </div>
        <div style={{ flex:1 }}>
          <Field label="Duration (min)" type="number" value={String(form.durationMinutes)} onChange={v => set('durationMinutes', parseInt(v) || 30)} />
        </div>
      </div>
      <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:'.85rem', color:'#374151', margin:'8px 0 16px' }}>
        <input type="checkbox" checked={form.sendInvite} onChange={e => set('sendInvite', e.target.checked)} />
        Email the guest a branded invite with .ics attachment {!form.guestEmail && <span style={{ color:'#9CA3AF' }}>(needs email)</span>}
      </label>
      {err && <div style={{ color:'#991B1B', fontSize:'.85rem', marginBottom:12 }}>{err}</div>}
      <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
        <button onClick={onClose} style={btnGhost}>Cancel</button>
        <button onClick={submit} disabled={saving} style={btnPrimary}>{saving ? 'Creating…' : 'Create meeting'}</button>
      </div>
    </Modal>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div style={{ marginBottom:10 }}>
      <label style={{ display:'block', fontSize:'.8rem', fontWeight:600, color:'#374151', marginBottom:4 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width:'100%', padding:'10px 12px', border:'1px solid #CBD5E1', borderRadius:6, fontSize:'.9rem', fontFamily:'Plus Jakarta Sans, sans-serif', boxSizing:'border-box' }} />
    </div>
  )
}

function Modal({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(13,43,69,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'white', borderRadius:12, padding:'1.5rem', maxWidth:520, width:'100%', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 24px rgba(0,0,0,.15)' }}>
        {children}
      </div>
    </div>
  )
}
