// Tere Chat — internal provider/admin chat (Slack-lite v2).
//
// Left sidebar: # General + 1:1 DM threads. Right pane: messages + composer
// bound to the selected thread. DM plumbing (schema + endpoints) shipped in
// 2026-08-12_team_dms.sql + api/_team-messages.js; this file exposes it.
//
// Unread accounting:
//   - Per-thread badge in the sidebar (channel + each DM)
//   - Top-level tab badge via useTereChatUnread — server sums channel + DM
//     unread in the GET / response.

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { isUS } from '../../lib/region'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const TEAL_LIGHT = '#D4EEF0'
const FF = 'Plus Jakarta Sans, sans-serif'
const SIDEBAR_WIDTH = 240

const CHANNEL = { kind: 'channel' }

// Renders a message body with @mentions highlighted teal.
function renderBody(body) {
  const parts = String(body || '').split(/(@[a-z][a-z0-9._-]*)/gi)
  return parts.map((p, i) => p.startsWith('@')
    ? <span key={i} style={{ color: TEAL, fontWeight: 700, background: '#EFF9F9', padding: '1px 4px', borderRadius: 4 }}>{p}</span>
    : <React.Fragment key={i}>{p}</React.Fragment>
  )
}

export function useTereChatUnread(pollMs = 30000) {
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    let alive = true
    async function tick() {
      try {
        const r = await apiFetch('/api/team-messages')
        const d = await r.json()
        if (alive) setUnread(d?.unread_count || 0)
      } catch {}
    }
    tick()
    const iv = setInterval(tick, pollMs)
    return () => { alive = false; clearInterval(iv) }
  }, [pollMs])
  return unread
}

export default function TereChatTab({ onRead }) {
  const navigate = useNavigate()
  const meId = sessionStorage.getItem('providerId')

  const [selected, setSelected] = useState(CHANNEL)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [attachedPatient, setAttachedPatient] = useState(null)
  const [sending, setSending] = useState(false)
  const [providers, setProviders] = useState([])
  const [showMentionMenu, setShowMentionMenu] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [showPatientPicker, setShowPatientPicker] = useState(false)
  const [patientSearch, setPatientSearch] = useState('')
  const [patientResults, setPatientResults] = useState([])

  const [dmThreads, setDmThreads] = useState([])
  const [channelUnread, setChannelUnread] = useState(0)
  const [showNewDm, setShowNewDm] = useState(false)
  const [newDmFilter, setNewDmFilter] = useState('')

  const listRef = useRef(null)
  const textareaRef = useRef(null)

  // Load the currently-selected thread's messages.
  const loadCurrent = useCallback(async () => {
    try {
      const url = selected.kind === 'dm'
        ? `/api/team-messages?thread=${selected.id}`
        : '/api/team-messages'
      const r = await apiFetch(url)
      const d = await r.json()
      setMessages(Array.isArray(d?.messages) ? d.messages : [])
      if (selected.kind === 'channel') setChannelUnread(d?.channel_unread || 0)
    } catch {}
    setLoading(false)
  }, [selected])

  // Load the DM thread list for the sidebar.
  const loadDmThreads = useCallback(async () => {
    try {
      const r = await apiFetch('/api/team-messages?action=list-dms')
      const d = await r.json()
      setDmThreads(Array.isArray(d?.threads) ? d.threads : [])
    } catch {}
  }, [])

  useEffect(() => {
    setLoading(true)
    loadCurrent()
  }, [loadCurrent])

  useEffect(() => { loadDmThreads() }, [loadDmThreads])

  useEffect(() => {
    const iv = setInterval(() => { loadCurrent(); loadDmThreads() }, 15000)
    return () => clearInterval(iv)
  }, [loadCurrent, loadDmThreads])

  // Mark selected thread read whenever we open it or a new message lands.
  useEffect(() => {
    const url = selected.kind === 'dm'
      ? `/api/team-messages?action=mark-read&thread=${selected.id}`
      : '/api/team-messages?action=mark-read'
    apiFetch(url, { method: 'POST' })
      .then(() => { if (onRead) onRead() })
      .catch(() => {})
  }, [selected, messages.length, onRead])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages.length])

  // Provider list — powers both @mention autocomplete and the new-DM picker.
  useEffect(() => {
    (async () => {
      try {
        const { supabase } = await import('../../lib/supabase')
        const { data } = await supabase
          .from('providers')
          .select('id, first_name, last_name, is_admin, is_provider, color')
          .eq('is_active', true)
          .order('first_name')
        setProviders(data || [])
      } catch {}
    })()
  }, [])

  function onDraftChange(e) {
    const val = e.target.value
    setDraft(val)
    const cursor = e.target.selectionStart
    const before = val.slice(0, cursor)
    const m = before.match(/@([a-z][a-z0-9._-]*)$/i)
    if (m) {
      setMentionFilter(m[1].toLowerCase())
      setShowMentionMenu(true)
    } else {
      setShowMentionMenu(false)
    }
  }

  function insertMention(p) {
    const first = String(p.first_name || '').toLowerCase()
    const val = draft.replace(/@([a-z][a-z0-9._-]*)$/i, `@${first} `)
    setDraft(val)
    setShowMentionMenu(false)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  async function send() {
    if (!draft.trim() || sending) return
    setSending(true)
    try {
      const r = await apiFetch('/api/team-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: draft.trim(),
          patient_ref: attachedPatient?.id || null,
          patient_name: attachedPatient?.name || null,
          dm_thread_id: selected.kind === 'dm' ? selected.id : null,
        }),
      })
      if (r.ok) {
        setDraft('')
        setAttachedPatient(null)
        await loadCurrent()
        if (selected.kind === 'dm') await loadDmThreads()
      } else {
        const d = await r.json().catch(() => ({}))
        alert(d?.error || 'Failed to send')
      }
    } catch (e) {
      alert('Network error sending message')
    }
    setSending(false)
  }

  async function searchPatients(q) {
    setPatientSearch(q)
    if (!q || q.length < 2) { setPatientResults([]); return }
    try {
      const r = await apiFetch(`/api/patients?search=${encodeURIComponent(q)}&limit=10`)
      const d = await r.json()
      setPatientResults(Array.isArray(d?.patients) ? d.patients : [])
    } catch { setPatientResults([]) }
  }

  async function startDm(recipient) {
    try {
      const r = await apiFetch('/api/team-messages?action=start-dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: recipient.id }),
      })
      const d = await r.json()
      if (!r.ok || !d?.thread_id) {
        alert(d?.error || 'Could not start DM')
        return
      }
      setSelected({
        kind: 'dm',
        id: d.thread_id,
        counterpart: {
          id: recipient.id,
          name: `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim() || 'Unknown',
          color: recipient.color || TEAL,
          is_active: true,
        },
      })
      setShowNewDm(false)
      setNewDmFilter('')
      await loadDmThreads()
    } catch { alert('Network error starting DM') }
  }

  const mentionMatches = mentionFilter
    ? providers.filter(p => String(p.first_name || '').toLowerCase().startsWith(mentionFilter)).slice(0, 6)
    : providers.slice(0, 6)

  const newDmMatches = providers
    .filter(p => p.id !== meId)
    .filter(p => {
      if (!newDmFilter) return true
      const q = newDmFilter.toLowerCase()
      return `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase().includes(q)
    })

  const isDm = selected.kind === 'dm'
  const headerTitle = isDm ? selected.counterpart.name : '# General'
  const composerPlaceholder = isDm
    ? `Message ${selected.counterpart.name.split(' ')[0] || 'them'}… (Shift+Enter for newline)`
    : 'Message the team… (Shift+Enter for newline, @ to mention)'

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: '60vh', fontFamily: FF, background: 'white' }}>

      {/* ─── Sidebar ───────────────────────────────────────────────────── */}
      <aside style={{ width: SIDEBAR_WIDTH, borderRight: '1px solid #E2E8F0', background: '#F8FAFC', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ padding: '1rem 1rem .5rem', fontWeight: 700, color: NAVY, fontSize: '.95rem' }}>💬 Tere Chat</div>

        <div style={sectionLabelStyle}>Channels</div>
        <button onClick={() => setSelected(CHANNEL)} style={sidebarRowStyle(!isDm)}>
          <span style={{ flex: 1, textAlign: 'left' }}># General</span>
          {channelUnread > 0 && <UnreadBadge n={channelUnread} />}
        </button>

        <div style={{ ...sectionLabelStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Direct Messages</span>
          <button onClick={() => setShowNewDm(true)}
            title="Start a new DM"
            style={{ background: 'none', border: 'none', color: TEAL, cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700, padding: '0 4px', lineHeight: 1 }}>+</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {dmThreads.length === 0 ? (
            <div style={{ padding: '.5rem 1rem', fontSize: '.75rem', color: '#94A3B8', fontStyle: 'italic' }}>
              No DMs yet. Tap + to start one.
            </div>
          ) : dmThreads.map(t => {
            const active = isDm && selected.id === t.id
            const unread = t.unread_count || 0
            return (
              <button key={t.id}
                onClick={() => setSelected({ kind: 'dm', id: t.id, counterpart: t.counterpart })}
                style={sidebarRowStyle(active)}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: t.counterpart.color || TEAL, color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '.6rem', fontWeight: 700, flexShrink: 0 }}>
                  {(t.counterpart.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('')}
                </span>
                <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: unread > 0 ? 700 : 500 }}>
                  {t.counterpart.name}
                  {!t.counterpart.is_active && <span style={{ marginLeft: 4, color: '#94A3B8', fontSize: '.7rem', fontStyle: 'italic' }}>(inactive)</span>}
                </span>
                {unread > 0 && <UnreadBadge n={unread} />}
              </button>
            )
          })}
        </div>
      </aside>

      {/* ─── Main pane ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #E2E8F0', background: 'white' }}>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            {isDm && (
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: selected.counterpart.color || TEAL, color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem', fontWeight: 700 }}>
                {(selected.counterpart.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('')}
              </span>
            )}
            <span>{headerTitle}</span>
          </div>
          <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginTop: 2 }}>
            {isDm
              ? 'Direct message · only the two of you can see this.'
              : 'Team channel · everyone can see this. Use @firstname to notify a colleague.'}
          </div>
        </div>

        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', background: '#F8FAFC' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#9CA3AF', padding: '2rem' }}>Loading…</div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9CA3AF', padding: '2rem', fontSize: '.9rem' }}>
              No messages yet. Say hi.
            </div>
          ) : messages.map(m => {
            const mine = m.author_id === meId
            const deleted = !!m.deleted_at
            return (
              <div key={m.id} style={{ marginBottom: '.75rem', display: 'flex', gap: '.625rem', opacity: deleted ? .45 : 1 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: mine ? TEAL : '#94A3B8', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '.75rem', flexShrink: 0 }}>
                  {(m.author_name || '?').split(' ').map(w => w[0]).slice(0, 2).join('')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.75rem', color: '#6B7280', marginBottom: 2 }}>
                    <strong style={{ color: NAVY }}>{m.author_name}</strong>
                    {m.author_role && <span style={{ marginLeft: 6, background: '#EEF2FF', color: '#4338CA', padding: '1px 6px', borderRadius: 99, fontSize: '.625rem', fontWeight: 700 }}>{m.author_role}</span>}
                    <span style={{ marginLeft: 8 }}>{new Date(m.created_at).toLocaleString('en-NZ', { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })}</span>
                    {m.edited_at && <span style={{ marginLeft: 6, color: '#9CA3AF', fontStyle: 'italic' }}>(edited)</span>}
                  </div>
                  <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, padding: '.5rem .75rem', fontSize: '.875rem', color: NAVY, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                    {deleted ? <em style={{ color: '#9CA3AF' }}>[deleted]</em> : renderBody(m.body)}
                    {!deleted && m.patient_ref && (
                      <button onClick={() => navigate(`/clinician/patient/${m.patient_ref}`)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, background: TEAL_LIGHT, color: NAVY, border: 'none', padding: '3px 10px', borderRadius: 99, fontSize: '.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: FF }}>
                        📋 {m.patient_name || 'View patient'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ borderTop: '1px solid #E2E8F0', background: 'white', padding: '.75rem 1rem', position: 'relative' }}>
          {attachedPatient && (
            <div style={{ background: TEAL_LIGHT, borderRadius: 8, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: '.75rem', color: NAVY, fontWeight: 700 }}>
              📋 {attachedPatient.name}
              <button onClick={() => setAttachedPatient(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: '.875rem', padding: 0 }}>×</button>
            </div>
          )}

          {showMentionMenu && mentionMatches.length > 0 && (
            <div style={{ position: 'absolute', bottom: '100%', left: '1rem', background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,.08)', overflow: 'hidden', maxWidth: 260, zIndex: 10 }}>
              {mentionMatches.map(p => (
                <button key={p.id} onClick={() => insertMention(p)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '.5rem .75rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FF, fontSize: '.8125rem', color: NAVY, textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: p.color || TEAL, color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '.625rem', fontWeight: 700 }}>
                    {(p.first_name || '?')[0]}{(p.last_name || '?')[0]}
                  </span>
                  <span style={{ fontWeight: 600 }}>{p.first_name} {p.last_name}</span>
                  {p.is_admin && <span style={{ marginLeft: 'auto', color: '#4338CA', fontSize: '.625rem', fontWeight: 700 }}>admin</span>}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <button onClick={() => setShowPatientPicker(true)}
              style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontSize: '.875rem', color: '#475569', flexShrink: 0 }}
              title="Attach a patient chart link">📋</button>
            <textarea ref={textareaRef} value={draft} onChange={onDraftChange}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !showMentionMenu) { e.preventDefault(); send() } }}
              placeholder={composerPlaceholder}
              rows={2}
              style={{ flex: 1, border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '.5rem .75rem', fontFamily: FF, fontSize: '.875rem', resize: 'vertical', outline: 'none', minHeight: 42 }} />
            <button onClick={send} disabled={sending || !draft.trim()}
              style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 10, padding: '.5rem 1rem', fontWeight: 700, fontSize: '.875rem', cursor: sending || !draft.trim() ? 'not-allowed' : 'pointer', opacity: sending || !draft.trim() ? .5 : 1, fontFamily: FF, flexShrink: 0 }}>
              {sending ? '…' : 'Send'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Patient picker modal (attaches a chart link) ───────────────── */}
      {showPatientPicker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setShowPatientPicker(false) }}>
          <div style={{ background: 'white', borderRadius: 14, maxWidth: 480, width: '100%', maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ fontWeight: 700, color: NAVY, marginBottom: '.5rem' }}>Attach patient</div>
              <input autoFocus value={patientSearch} onChange={e => searchPatients(e.target.value)}
                placeholder={isUS() ? 'Search by name…' : 'Search by name or NHI…'}
                style={{ width: '100%', padding: '.5rem .75rem', border: '1.5px solid #E2E8F0', borderRadius: 8, fontFamily: FF, fontSize: '.875rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {patientResults.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: '#9CA3AF', fontSize: '.875rem' }}>
                  {patientSearch.length < 2 ? 'Type at least 2 characters to search.' : 'No matches.'}
                </div>
              ) : patientResults.map(p => (
                <button key={p.id} onClick={() => {
                  setAttachedPatient({ id: p.id, name: `${p.first_name} ${p.last_name}` })
                  setShowPatientPicker(false); setPatientSearch(''); setPatientResults([])
                }}
                  style={{ display: 'block', width: '100%', padding: '.75rem 1rem', background: 'none', border: 'none', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', fontFamily: FF, textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <div style={{ fontWeight: 700, color: NAVY, fontSize: '.875rem' }}>{p.first_name} {p.last_name}</div>
                  <div style={{ fontSize: '.75rem', color: '#6B7280' }}>{p.date_of_birth || 'DOB unknown'}{!isUS() && p.nhi ? ` · NHI ${p.nhi}` : ''}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── New DM picker modal ───────────────────────────────────────── */}
      {showNewDm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowNewDm(false); setNewDmFilter('') } }}>
          <div style={{ background: 'white', borderRadius: 14, maxWidth: 380, width: '100%', maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ fontWeight: 700, color: NAVY, marginBottom: '.5rem' }}>Start a direct message</div>
              <input autoFocus value={newDmFilter} onChange={e => setNewDmFilter(e.target.value)}
                placeholder="Search by name…"
                style={{ width: '100%', padding: '.5rem .75rem', border: '1.5px solid #E2E8F0', borderRadius: 8, fontFamily: FF, fontSize: '.875rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {newDmMatches.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: '#9CA3AF', fontSize: '.875rem' }}>
                  No matches.
                </div>
              ) : newDmMatches.map(p => (
                <button key={p.id} onClick={() => startDm(p)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '.75rem 1rem', background: 'none', border: 'none', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', fontFamily: FF, textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: p.color || TEAL, color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '.75rem', fontWeight: 700 }}>
                    {(p.first_name || '?')[0]}{(p.last_name || '?')[0]}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: NAVY, fontSize: '.875rem' }}>{p.first_name} {p.last_name}</div>
                    {p.is_admin && <div style={{ fontSize: '.65rem', color: '#4338CA', fontWeight: 700 }}>admin</div>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const sectionLabelStyle = {
  padding: '.75rem 1rem .25rem',
  fontSize: '.65rem',
  color: '#94A3B8',
  textTransform: 'uppercase',
  letterSpacing: '.05em',
  fontWeight: 700,
}

function sidebarRowStyle(active) {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '.5rem 1rem',
    background: active ? TEAL_LIGHT : 'none',
    border: 'none',
    borderLeft: active ? `3px solid ${TEAL}` : '3px solid transparent',
    cursor: 'pointer',
    fontFamily: FF,
    fontSize: '.85rem',
    color: NAVY,
    textAlign: 'left',
  }
}

function UnreadBadge({ n }) {
  return (
    <span style={{
      background: TEAL, color: 'white', fontSize: '.6rem', fontWeight: 700,
      minWidth: 18, padding: '2px 6px', borderRadius: 99, textAlign: 'center', lineHeight: 1.2,
    }}>{n > 99 ? '99+' : n}</span>
  )
}
