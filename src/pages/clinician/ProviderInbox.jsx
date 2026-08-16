// /clinician/inbox — inbound HL7 messages routed to the current provider
// (lab results, referrals, GP letters received via Medical-Objects Capricorn).
//
// Reads /api/provider-inbox and renders a monospace view of the parsed
// message plus any PDF attachments as inline embeds via short-lived signed
// URLs from Supabase Storage.

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Courier New", monospace'

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return s + 's ago'
  if (s < 3600) return Math.floor(s / 60) + 'm ago'
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'
  return Math.floor(s / 86400) + 'd ago'
}

function StatusPill({ status, unread }) {
  const map = {
    received:     { bg: '#DBEAFE', color: '#1E40AF', label: 'Received' },
    needs_review: { bg: '#FEF3C7', color: '#92400E', label: 'Needs review' },
    processed:    { bg: '#D1FAE5', color: '#065F46', label: 'Processed' },
    rejected:     { bg: '#FEE2E2', color: '#991B1B', label: 'Rejected' },
    error:        { bg: '#FEE2E2', color: '#991B1B', label: 'Error' },
  }
  const m = map[status] || map.received
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: m.bg, color: m.color, padding: '2px 8px', borderRadius: 99,
      fontSize: '.7rem', fontWeight: 700, letterSpacing: '.02em', textTransform: 'uppercase',
    }}>
      {unread && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#DC2626' }} />}
      {m.label}
    </span>
  )
}

function MessageRow({ msg, onOpen }) {
  const unread = !msg.read_by_provider_at
  const patient = [msg.patient_first_name, msg.patient_last_name].filter(Boolean).join(' ') || '—'
  return (
    <button onClick={() => onOpen(msg.id)} style={{
      width: '100%', textAlign: 'left', background: 'white',
      border: '1px solid #E2E8F0', borderRadius: 10, padding: '.85rem 1rem',
      display: 'flex', gap: '.75rem', alignItems: 'center', cursor: 'pointer',
      fontFamily: FF,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: unread ? 700 : 600, color: NAVY, fontSize: '.95rem' }}>{patient}</span>
          <span style={{ color: '#6B7280', fontSize: '.8rem' }}>· {msg.msh_9_message_type || '?'}</span>
          {msg.msh_4_sending_facility && (
            <span style={{ color: '#6B7280', fontSize: '.8rem' }}>· from {msg.msh_4_sending_facility}</span>
          )}
          {msg.has_pdf && <span style={{ fontSize: '.75rem' }}>📄</span>}
        </div>
        {msg.obr_3_1_filler_order && (
          <div style={{ marginTop: 2, color: '#4B5563', fontSize: '.8rem', fontFamily: MONO }}>
            OBR-3.1 {msg.obr_3_1_filler_order}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right' }}>
        <StatusPill status={msg.status} unread={unread} />
        <div style={{ marginTop: 3, color: '#6B7280', fontSize: '.75rem' }}>{timeAgo(msg.received_at)}</div>
      </div>
    </button>
  )
}

function MessageView({ id, onClose, onChanged, embedded = false }) {
  const [msg, setMsg]   = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await apiFetch(`/api/provider-inbox?id=${id}`)
        const j = await res.json()
        if (cancelled) return
        if (!res.ok) throw new Error(j.error || 'Load failed')
        setMsg(j.message)
        // Auto mark-as-read on open.
        if (j.message && !j.message.read_by_provider_at) {
          try {
            await apiFetch(`/api/provider-inbox?id=${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ read_by_provider_at: new Date().toISOString() }),
            })
            onChanged?.()
          } catch {}
        }
      } catch (e) { if (!cancelled) setError(String(e.message || e)) }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  async function archive() {
    if (busy) return
    setBusy(true)
    try {
      const res = await apiFetch(`/api/provider-inbox?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived_at: new Date().toISOString() }),
      })
      if (!res.ok) throw new Error('Archive failed')
      onChanged?.()
      onClose()
    } catch (e) { setError(String(e.message || e)) }
    finally     { setBusy(false) }
  }

  if (error) {
    return (
      <div style={{ padding: '1rem', color: '#991B1B' }}>{error}
        <button onClick={onClose} style={{ marginLeft: 12 }}>Close</button>
      </div>
    )
  }
  if (!msg) return <div style={{ padding: '1rem', color: '#6B7280' }}>Loading…</div>

  const s = msg.parsed_summary || {}
  const patient = [msg.patient_first_name, msg.patient_last_name].filter(Boolean).join(' ') || 'Unknown patient'

  return (
    <div style={{ padding: embedded ? '.5rem 0 1rem' : '1.25rem 1.5rem 3rem', background: embedded ? 'transparent' : '#F7F5F0', minHeight: embedded ? 'auto' : '100dvh', fontFamily: FF }}>
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '1rem' }}>
        <button onClick={onClose} style={backBtn}>← Back to inbox</button>
        <button onClick={archive} disabled={busy} style={{ ...backBtn, marginLeft: 'auto' }}>
          {busy ? '…' : 'Archive'}
        </button>
      </div>

      <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.6rem' }}>
          <StatusPill status={msg.status} unread={false} />
          <span style={{ fontWeight: 700, color: NAVY, fontSize: '1.15rem' }}>{patient}</span>
          {msg.patient_dob && <span style={{ color: '#4B5563', fontSize: '.85rem' }}>· DOB {msg.patient_dob}</span>}
          {msg.patient_pid_3 && <span style={{ color: '#4B5563', fontSize: '.85rem' }}>· PID {msg.patient_pid_3}</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 4, columnGap: 12, fontSize: '.85rem', color: '#4B5563' }}>
          <div>Message type</div><div><code style={{ fontFamily: MONO }}>{msg.msh_9_message_type} · v{msg.msh_12_version}</code></div>
          <div>From</div><div>{msg.msh_4_sending_facility || '—'}</div>
          <div>OBR-3.1 filler</div><div style={{ fontFamily: MONO }}>{msg.obr_3_1_filler_order || '—'}</div>
          <div>OBR-4 service</div><div>{msg.obr_4_service_id || '—'}</div>
          <div>Received</div><div>{new Date(msg.received_at).toLocaleString()}</div>
          <div>Ack sent</div><div><code style={{ fontFamily: MONO }}>MSA|{msg.ack_msa_1}</code>{msg.ack_msa_3_error ? ` · ${msg.ack_msa_3_error}` : ''}</div>
        </div>
      </div>

      {s.obx && s.obx.length > 0 && (
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, color: NAVY, marginBottom: '.6rem' }}>Results / observations (OBX)</div>
          <table style={{ width: '100%', fontSize: '.85rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6B7280', fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                <th style={{ padding: '4px 8px 4px 0' }}>Test</th>
                <th style={{ padding: '4px 8px' }}>Value</th>
                <th style={{ padding: '4px 8px' }}>Units</th>
                <th style={{ padding: '4px 8px' }}>Ref</th>
                <th style={{ padding: '4px 8px' }}>Flag</th>
              </tr>
            </thead>
            <tbody>
              {s.obx.map((o, i) => (
                <tr key={i} style={{ borderTop: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '5px 8px 5px 0', fontFamily: MONO }}>{o.identifier}</td>
                  <td style={{ padding: '5px 8px', fontFamily: MONO }}>{o.value}</td>
                  <td style={{ padding: '5px 8px', color: '#6B7280' }}>{o.units}</td>
                  <td style={{ padding: '5px 8px', color: '#6B7280' }}>{o.refRange}</td>
                  <td style={{ padding: '5px 8px', color: o.abnormal ? '#991B1B' : '#6B7280', fontWeight: o.abnormal ? 700 : 400 }}>{o.abnormal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {s.notes && s.notes.length > 0 && (
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, color: NAVY, marginBottom: '.5rem' }}>Notes (NTE)</div>
          <div style={{ fontFamily: MONO, fontSize: '.82rem', whiteSpace: 'pre-wrap', color: '#374151' }}>
            {s.notes.join('\n')}
          </div>
        </div>
      )}

      {msg.attachments && msg.attachments.length > 0 && (
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, color: NAVY, marginBottom: '.6rem' }}>Attachments</div>
          {msg.attachments.map(a => (
            <div key={a.id} style={{ marginBottom: '.75rem' }}>
              <div style={{ fontSize: '.85rem', color: '#374151', marginBottom: 4 }}>
                {a.filename || `OBX-${a.obx_index}`} · {a.content_type} · {Math.round((a.size_bytes || 0) / 1024)} KB
              </div>
              {a.signed_url && (
                <>
                  <a href={a.signed_url} target="_blank" rel="noopener noreferrer" style={{ color: TEAL, textDecoration: 'underline', fontSize: '.85rem', fontWeight: 600 }}>
                    Open in new tab ↗
                  </a>
                  {a.content_type === 'application/pdf' && (
                    <iframe title={a.filename || `attachment ${a.obx_index}`} src={a.signed_url}
                      style={{ width: '100%', height: 640, border: '1px solid #E5E7EB', borderRadius: 8, marginTop: 8 }} />
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <details style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '.75rem 1rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700, color: NAVY }}>Raw HL7 (for debugging)</summary>
        <pre style={{ marginTop: '.5rem', fontFamily: MONO, fontSize: '.78rem', color: '#374151', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {msg.raw_message}
        </pre>
      </details>
    </div>
  )
}

export default function ProviderInbox({ embedded = false }) {
  const navigate = useNavigate()
  const [rows, setRows]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)
  const [openId, setOpenId] = useState(null)

  useEffect(() => {
    // Standalone route enforces its own auth redirect; when embedded the
    // parent (Dashboard) has already guarded.
    if (!embedded && !sessionStorage.getItem('clinicianAuth')) {
      navigate('/clinician?redirect=/clinician/inbox'); return
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await apiFetch('/api/provider-inbox')
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Load failed')
      setRows(j.messages || [])
    } catch (e) { setError(String(e.message || e)) }
    finally     { setLoading(false) }
  }

  if (openId) {
    return <MessageView id={openId} onClose={() => setOpenId(null)} onChanged={load} embedded={embedded} />
  }

  const list = (
    <>
      {loading && <div style={{ textAlign: 'center', color: '#6B7280' }}>Loading…</div>}
      {error && <div style={{ color: '#991B1B', background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '.75rem 1rem', marginBottom: '1rem', fontSize: '.9rem' }}>{error}</div>}
      {!loading && !rows.length && (
        <div style={{ background: 'white', border: '1px dashed #D1D5DB', borderRadius: 12, padding: '2rem', textAlign: 'center', color: '#6B7280', fontSize: '.9rem' }}>
          No inbound messages routed to you.
        </div>
      )}
      <div style={{ display: 'grid', gap: '.6rem' }}>
        {rows.map(m => <MessageRow key={m.id} msg={m} onOpen={setOpenId} />)}
      </div>
    </>
  )

  if (embedded) {
    return (
      <div style={{ padding: '.5rem 0 1rem', fontFamily: FF }}>
        {list}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#F7F5F0', fontFamily: FF }}>
      <div style={{ background: NAVY, color: 'white', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button onClick={() => navigate(-1)}
          style={{ background: 'rgba(255,255,255,.1)', border: 'none', color: 'white', borderRadius: 6, padding: '6px 12px', fontSize: '.8125rem', cursor: 'pointer' }}>
          ← Back
        </button>
        <div style={{ fontWeight: 700, fontSize: '1.0625rem' }}>Inbox — inbound results & referrals</div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem 1.25rem 3rem' }}>
        {list}
      </div>
    </div>
  )
}

const backBtn = {
  background: 'white', color: NAVY, border: '1px solid #E5E7EB',
  borderRadius: 8, padding: '.5rem 1rem', fontFamily: FF,
  fontWeight: 600, fontSize: '.85rem', cursor: 'pointer',
}
