// Per-patient access-history modal — shows every audit_logs row where
// patient_ref matches the given NHI (or consultation_id belongs to this
// patient, best-effort). Available to admins, providers, and supervisors
// via a button on the patient chart.
//
// The point: patients (via a Right-6 request), regulators, or internal
// quality reviews can answer "who has looked at this chart, when, and why."

import React, { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF = 'Plus Jakarta Sans, sans-serif'

const REASON_LABEL = {
  billing_dispute: '💳 Billing dispute',
  complaint_investigation: '⚠️ Complaint',
  quality_audit: '📊 Audit',
  support_ticket_response: '🎫 Support',
  patient_request: '👤 Patient request',
  clinical_care: '🩺 Clinical care',
  other: '💬 Other',
}
const ROLE_COLOR = { admin: '#7C3AED', billing_admin: '#F97316', supervisor: '#059669', provider: '#0B6E76' }

const nzDateTime = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return String(iso) }
}

export default function PatientAccessHistoryModal({ open, onClose, patientNhi, patientName }) {
  const [logs, setLogs]     = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [days, setDays]       = useState(90)

  useEffect(() => {
    if (!open || !patientNhi) return
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      try {
        const from = new Date()
        from.setDate(from.getDate() - days)
        const params = new URLSearchParams({
          limit: '500',
          patient_ref: patientNhi,
          from: from.toISOString(),
        })
        const res = await apiFetch('/api/audit?' + params.toString())
        const { logs } = await res.json()
        if (!cancelled) setLogs(Array.isArray(logs) ? logs : [])
      } catch (e) {
        if (!cancelled) setError(e.message)
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [open, patientNhi, days])

  const byProvider = useMemo(() => {
    const map = new Map()
    for (const l of logs) {
      const k = l.provider_id || l.provider_name || 'unknown'
      if (!map.has(k)) map.set(k, { name: l.provider_name || '—', role: l.provider_role, count: 0, latest: l.created_at })
      const entry = map.get(k)
      entry.count += 1
      if (new Date(l.created_at) > new Date(entry.latest)) entry.latest = l.created_at
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [logs])

  function exportCsv() {
    const header = ['created_at', 'event_type', 'provider_name', 'provider_role', 'consultation_id', 'resource_type', 'resource_id', 'reason', 'reason_notes', 'ip']
    const rows = logs.map(l => header.map(k => (l[k] == null ? '' : String(l[k]).replace(/"/g, '""'))))
    const csv = [header, ...rows].map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${v}"` : v).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `patient-access-${patientNhi}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  // Patient-friendly export — for HDC Right 6(f) requests where the patient
  // asks for a copy of who has accessed their record. Redacts internal
  // metadata (IPs, user agents, resource IDs, reason_notes) that could
  // expose case references or internal identifiers. Keeps: date, event,
  // provider role (not name — patient doesn't need to know Tere-internal
  // provider names beyond their treating clinician), and reason category.
  function exportPatientReport() {
    const header = ['Date', 'What happened', 'Accessed by (role)', 'Purpose']
    const rows = logs.map(l => [
      new Date(l.created_at).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      (l.event_type || '').replace(/_/g, ' '),
      l.provider_role ? l.provider_role.replace(/_/g, ' ') : '—',
      l.reason ? (REASON_LABEL[l.reason] || l.reason).replace(/^[^\w]+ /, '') : (l.provider_role === 'provider' ? 'clinical care' : '—'),
    ])
    const csv = [header, ...rows].map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${v}"` : v).join(',')).join('\n')
    const preamble = [
      `Access history for NHI ${patientNhi}${patientName ? ` (${patientName})` : ''}`,
      `Generated ${new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })} · Tere Health Limited · HPI-O G11238-E`,
      `This report is provided under Right 6(f) of the Code of Health and Disability Services Consumers' Rights and section IPP6 of the Privacy Act 2020.`,
      `Every access shown was recorded automatically at the time it occurred.`,
      '',
    ].join('\n')
    const blob = new Blob([preamble + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `access-history-for-patient-${patientNhi}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,43,69,.7)', zIndex: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, fontFamily: FF }}>
      <div style={{ background: 'white', borderRadius: 14, width: '100%', maxWidth: 820, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 800, color: NAVY, fontSize: '1rem' }}>Access history</div>
            <div style={{ fontSize: '.75rem', color: '#6B7280', marginTop: 2 }}>
              {patientName ? `${patientName} · ` : ''}NHI {patientNhi || '—'} · every recorded touch on this chart in the last {days} days
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#9CA3AF', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: '.75rem 1.25rem', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.75rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase' }}>Range</span>
          {[7, 30, 90, 365].map(d => (
            <button key={d} onClick={() => setDays(d)}
              style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${days === d ? TEAL : '#E2E8F0'}`, background: days === d ? '#EFF9F9' : 'white', color: days === d ? TEAL : '#374151', fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' }}>
              {d === 365 ? '1y' : `${d}d`}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <button onClick={exportPatientReport} disabled={!logs.length}
            title="Redacted patient-facing CSV — for HDC Right 6(f) requests"
            style={{ padding: '4px 12px', background: 'white', color: NAVY, border: '1px solid #E2E8F0', borderRadius: 6, fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: logs.length ? 'pointer' : 'default', opacity: logs.length ? 1 : 0.5 }}>
            Report for patient
          </button>
          <button onClick={exportCsv} disabled={!logs.length}
            title="Full internal CSV with all metadata"
            style={{ padding: '4px 12px', background: '#0B6E76', color: 'white', border: 'none', borderRadius: 6, fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: logs.length ? 'pointer' : 'default', opacity: logs.length ? 1 : 0.5 }}>
            Full CSV
          </button>
        </div>

        <div style={{ padding: '1rem 1.25rem', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '.5rem .75rem', borderRadius: 6, fontSize: '.75rem', marginBottom: '.75rem' }}>{error}</div>
          )}

          {/* By-provider summary */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '.75rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
              Accessed by {byProvider.length} {byProvider.length === 1 ? 'person' : 'people'}
            </div>
            {!byProvider.length ? (
              <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>No recorded accesses in this range.</div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {byProvider.map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '.375rem .625rem', background: '#F8FAFC', borderRadius: 6, fontSize: '.8125rem' }}>
                    <span style={{ color: NAVY, fontWeight: 700 }}>{p.name}</span>
                    {p.role && (
                      <span style={{ background: (ROLE_COLOR[p.role] || '#94A3B8') + '20', color: ROLE_COLOR[p.role] || '#94A3B8', fontSize: '.6875rem', fontWeight: 700, padding: '1px 7px', borderRadius: 99, textTransform: 'uppercase' }}>
                        {p.role}
                      </span>
                    )}
                    <span style={{ flex: 1 }} />
                    <span style={{ color: '#6B7280', fontSize: '.75rem' }}>{p.count} {p.count === 1 ? 'access' : 'accesses'}</span>
                    <span style={{ color: '#9CA3AF', fontSize: '.75rem' }}>last {nzDateTime(p.latest)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Full timeline */}
          <div style={{ fontSize: '.75rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Timeline ({logs.length})</div>
          {loading ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#9CA3AF' }}>Loading…</div>
          ) : !logs.length ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#9CA3AF' }}>No events.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {logs.map(l => (
                <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '150px 200px 1fr auto', gap: 8, padding: '.5rem .625rem', background: '#FAFAFA', border: '1px solid #F3F4F6', borderRadius: 6, fontSize: '.75rem' }}>
                  <span style={{ color: '#6B7280' }}>{nzDateTime(l.created_at)}</span>
                  <span style={{ color: TEAL, fontWeight: 700 }}>{l.event_type}</span>
                  <span style={{ color: NAVY }}>
                    {l.provider_name || '—'}
                    {l.provider_role && (
                      <span style={{ marginLeft: 6, background: (ROLE_COLOR[l.provider_role] || '#94A3B8') + '20', color: ROLE_COLOR[l.provider_role] || '#94A3B8', fontSize: '.6875rem', fontWeight: 700, padding: '0px 6px', borderRadius: 99, textTransform: 'uppercase' }}>
                        {l.provider_role}
                      </span>
                    )}
                    {l.reason && (
                      <span style={{ marginLeft: 6, background: '#FEF3C7', color: '#78350F', fontSize: '.6875rem', fontWeight: 600, padding: '0px 6px', borderRadius: 99 }}>
                        {REASON_LABEL[l.reason] || l.reason}
                      </span>
                    )}
                    {l.reason_notes && <div style={{ color: '#374151', marginTop: 2, whiteSpace: 'pre-wrap' }}>{l.reason_notes}</div>}
                  </span>
                  <span style={{ color: '#9CA3AF', fontSize: '.6875rem', textAlign: 'right' }}>
                    {l.resource_type ? `${l.resource_type}` : ''}
                    {l.consultation_id ? <div>consult {String(l.consultation_id).slice(0, 8)}…</div> : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '.75rem 1.25rem', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '.6875rem', color: '#9CA3AF' }}>Every access recorded here is signed against the actor's provider account (HIPC Rule 5 / Privacy Act 2020 IPP5).</span>
          <button onClick={onClose} style={{ background: 'white', border: '1px solid #E2E8F0', color: NAVY, padding: '.5rem 1rem', borderRadius: 8, fontFamily: FF, fontSize: '.8125rem', fontWeight: 700, cursor: 'pointer' }}>Close</button>
        </div>
      </div>
    </div>
  )
}
