// Tere Chat — internal provider/admin channel (Slack-lite v1).
//
// Single shared channel. Text messages. @mention any active provider
// (matched against firstname / firstnamelastname). Optional patient chart
// reference renders as a clickable pill linking to /clinician/patient/<id>.
// Unread count = messages posted after the caller's last_read_at,
// exposed via useTereChatUnread for the nav badge.

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const TEAL_LIGHT = '#D4EEF0'
const FF = 'Plus Jakarta Sans, sans-serif'

// Renders a message body with @mentions highlighted teal. Naive parser —
// matches the server-side regex.
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
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [attachedPatient, setAttachedPatient] = useState(null)  // { id, name } | null
  const [sending, setSending] = useState(false)
  const [providers, setProviders] = useState([])
  const [showMentionMenu, setShowMentionMenu] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [showPatientPicker, setShowPatientPicker] = useState(false)
  const [patientSearch, setPatientSearch] = useState('')
  const [patientResults, setPatientResults] = useState([])
  const listRef = useRef(null)
  const textareaRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/api/team-messages')
      const d = await r.json()
      setMessages(Array.isArray(d?.messages) ? d.messages : [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Poll for new messages every 15s (v1: no realtime).
  useEffect(() => {
    const iv = setInterval(load, 15000)
    return () => clearInterval(iv)
  }, [load])

  // Mark read on mount + when new messages arrive after the user's view.
  useEffect(() => {
    apiFetch('/api/team-messages?action=mark-read', { method: 'POST' })
      .then(() => { if (onRead) onRead() })
      .catch(() => {})
  }, [messages.length, onRead])

  // Autoscroll to bottom on load / new messages.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages.length])

  // Load providers once for @mention autocomplete.
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
    // Detect @mention-in-progress at cursor.
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
        }),
      })
      if (r.ok) {
        setDraft('')
        setAttachedPatient(null)
        await load()
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

  const mentionMatches = mentionFilter
    ? providers.filter(p => String(p.first_name || '').toLowerCase().startsWith(mentionFilter)).slice(0, 6)
    : providers.slice(0, 6)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '60vh', fontFamily: FF }}>
      {/* Header */}
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #E2E8F0', background: 'white' }}>
        <div style={{ fontWeight: 700, color: NAVY, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>💬 Tere Chat</span>
          <span style={{ fontSize: '.75rem', fontWeight: 500, color: '#6B7280' }}>· team channel</span>
        </div>
        <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginTop: 2 }}>
          Internal only. Not part of any patient record. Use @firstname to notify a colleague.
        </div>
      </div>

      {/* Message list */}
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

      {/* Composer */}
      <div style={{ borderTop: '1px solid #E2E8F0', background: 'white', padding: '.75rem 1rem', position: 'relative' }}>
        {attachedPatient && (
          <div style={{ background: TEAL_LIGHT, borderRadius: 8, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: '.75rem', color: NAVY, fontWeight: 700 }}>
            📋 {attachedPatient.name}
            <button onClick={() => setAttachedPatient(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: '.875rem', padding: 0 }}>×</button>
          </div>
        )}

        {/* @mention menu */}
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
            placeholder="Message the team… (Shift+Enter for newline, @ to mention)"
            rows={2}
            style={{ flex: 1, border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '.5rem .75rem', fontFamily: FF, fontSize: '.875rem', resize: 'vertical', outline: 'none', minHeight: 42 }} />
          <button onClick={send} disabled={sending || !draft.trim()}
            style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 10, padding: '.5rem 1rem', fontWeight: 700, fontSize: '.875rem', cursor: sending || !draft.trim() ? 'not-allowed' : 'pointer', opacity: sending || !draft.trim() ? .5 : 1, fontFamily: FF, flexShrink: 0 }}>
            {sending ? '…' : 'Send'}
          </button>
        </div>
      </div>

      {/* Patient picker modal */}
      {showPatientPicker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setShowPatientPicker(false) }}>
          <div style={{ background: 'white', borderRadius: 14, maxWidth: 480, width: '100%', maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ fontWeight: 700, color: NAVY, marginBottom: '.5rem' }}>Attach patient</div>
              <input autoFocus value={patientSearch} onChange={e => searchPatients(e.target.value)}
                placeholder="Search by name or NHI…"
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
                  <div style={{ fontSize: '.75rem', color: '#6B7280' }}>{p.date_of_birth || 'DOB unknown'}{p.nhi ? ` · NHI ${p.nhi}` : ''}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
