// /clinician/inbox — inbound HL7 messages routed to the current provider
// (lab results, referrals, GP letters received via Medical-Objects Capricorn).
//
// Reads /api/provider-inbox and renders a monospace view of the parsed
// message plus any PDF attachments as inline embeds via short-lived signed
// URLs from Supabase Storage.

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { parseHl7Display } from '../../lib/hl7Display'

// Render a string that may contain HL7 emphasis sentinels from decodeHl7Escapes
// (__HL7BOLD_START__ / __HL7BOLD_END__) into React nodes with real <strong>
// tags. Keeps the render escape-safe — no dangerouslySetInnerHTML needed.
function renderHl7Text(text) {
  const parts = String(text || '').split(/(__HL7BOLD_START__|__HL7BOLD_END__)/g)
  const out = []
  let bold = false
  parts.forEach((p, i) => {
    if (p === '__HL7BOLD_START__') { bold = true; return }
    if (p === '__HL7BOLD_END__')   { bold = false; return }
    if (!p) return
    out.push(bold ? <strong key={i}>{p}</strong> : <React.Fragment key={i}>{p}</React.Fragment>)
  })
  return out
}

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

  const patient = [msg.patient_first_name, msg.patient_last_name].filter(Boolean).join(' ') || 'Unknown patient'
  // Re-parse the raw message client-side to pick up display fields (dates,
  // OBR-4.2 label, OBR-25 corrected, LIT FT/PDF pairing) that live outside
  // parsed_summary. Belt-and-braces against older messages parsed before
  // 2026-08-19 when these fields were added — see [[project-tere-medical-objects]].
  const display = parseHl7Display(msg.raw_message || '')
  // For LIT (referral-copy / rendered report) messages the FT/TX text and the
  // ED (PDF) observation are the same content in two formats per HL7 standard.
  // Per Medical-Objects (Tony Cruice, 2026-08-19), the PDF should be preferred
  // as the primary display because its formatting is richer; the FT text is a
  // fallback for systems that can't render PDF.
  const litPdfAttachment = display.isLit
    ? (msg.attachments || []).find(a => a.content_type === 'application/pdf')
    : null
  // Suppress the attachment we already embedded as the LIT report body —
  // otherwise the PDF renders twice (once as the primary display, once
  // in the Attachments section below with its own iframe).
  const attachmentsToList = (msg.attachments || []).filter(a =>
    !(litPdfAttachment && a.id === litPdfAttachment.id)
  )
  // OBX rows to render in the results table: hide the FT/TX + ED pair for LIT
  // messages (they're rendered separately below as the report body).
  const obxTableRows = display.isLit
    ? display.obxRows.filter(o => o.valueType !== 'FT' && o.valueType !== 'TX' && o.valueType !== 'ED')
    : display.obxRows

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
          <div>Service</div><div>
            {display.obr4Label || msg.obr_4_service_id || '—'}
            {display.corrected && <span style={{ marginLeft: 8, color: '#991B1B', fontWeight: 700 }}>— (Corrected)</span>}
          </div>
          {display.orderingName && (<><div>Referred by</div><div>{display.orderingName}{display.orderingId ? <span style={{ color: '#6B7280' }}> · {display.orderingId}</span> : null}</div></>)}
          {display.dates.requested && (<><div>Requested date</div><div>{display.dates.requested}</div></>)}
          {display.dates.observation && (<><div>Effective / exam</div><div>{display.dates.observation}</div></>)}
          {display.dates.generated && (<><div>Generated date</div><div>{display.dates.generated}</div></>)}
          <div>Received</div><div>{new Date(msg.received_at).toLocaleString()}</div>
          <div>Ack sent</div><div><code style={{ fontFamily: MONO }}>MSA|{msg.ack_msa_1}</code>{msg.ack_msa_3_error ? ` · ${msg.ack_msa_3_error}` : ''}</div>
        </div>
      </div>

      {/* LIT (referral-copy) messages: prefer PDF over FT text as the primary
          display — PDF has richer formatting than the plaintext fallback. Per
          Medical-Objects (Tony Cruice, 2026-08-19). Only fall back to the
          FT text if no PDF attachment exists on the message. */}
      {display.isLit && litPdfAttachment && litPdfAttachment.signed_url && (
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, color: NAVY, marginBottom: '.6rem' }}>
            {display.obr4Label || 'Report'}
            {display.corrected && <span style={{ marginLeft: 8, color: '#991B1B' }}>— (Corrected)</span>}
          </div>
          <iframe title={litPdfAttachment.filename || 'Report PDF'}
            src={litPdfAttachment.signed_url}
            style={{ width: '100%', height: 800, border: '1px solid #E5E7EB', borderRadius: 8 }} />
          <div style={{ marginTop: 8, fontSize: '.8rem', color: '#6B7280' }}>
            <a href={litPdfAttachment.signed_url} target="_blank" rel="noopener noreferrer"
              style={{ color: TEAL, textDecoration: 'underline', fontWeight: 600 }}>
              Open PDF in new tab ↗
            </a>
          </div>
        </div>
      )}

      {display.isLit && !litPdfAttachment && display.litText && (
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, color: NAVY, marginBottom: '.6rem' }}>
            {display.obr4Label || 'Report'}
            {display.corrected && <span style={{ marginLeft: 8, color: '#991B1B' }}>— (Corrected)</span>}
            <span style={{ marginLeft: 8, fontSize: '.75rem', color: '#6B7280', fontWeight: 400 }}>· plaintext fallback (no PDF attached)</span>
          </div>
          <pre style={{ fontFamily: MONO, fontSize: '.85rem', color: '#111827', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
            {renderHl7Text(display.litText)}
          </pre>
        </div>
      )}

      {obxTableRows.length > 0 && (
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
              {obxTableRows.map((o, i) => (
                <tr key={i} style={{ borderTop: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '5px 8px 5px 0' }}>{o.identLabel || o.identifier}</td>
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

      {display.notesLines.length > 0 && (
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, color: NAVY, marginBottom: '.5rem' }}>Notes (NTE)</div>
          <div style={{ fontFamily: MONO, fontSize: '.82rem', color: '#374151' }}>
            {display.notesLines.map((line, i) => (
              <div key={i} style={{ padding: '1px 0', whiteSpace: 'pre-wrap' }}>
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {attachmentsToList.length > 0 && (
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, color: NAVY, marginBottom: '.6rem' }}>Attachments</div>
          {attachmentsToList.map(a => (
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
        <div style={{ marginTop: '.5rem', fontFamily: MONO, fontSize: '.78rem', color: '#374151' }}>
          {String(msg.raw_message || '').replace(/\r/g, '\n').split('\n').map((line, i) => (
            <div key={i} style={{ wordBreak: 'break-all', padding: '1px 0' }}>{line || ' '}</div>
          ))}
        </div>
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
