// Admin > ACC tab — filterable claims list, per-claim audit-bundle viewer,
// per-claim PDF export, bulk CSV export of the filtered set.
//
// Every "View bundle" click prompts for a reason (reused from
// PhiRevealGate.ReasonPicker) which server-side audit-logs the access.

import React, { useEffect, useMemo, useState } from 'react'
import {
  listAccClaimsAdmin,
  getAccAuditBundle,
  downloadAccAuditBundlePdf,
  addAccCommunication,
} from '../../lib/supabase'
import { ReasonPicker } from './PhiRevealGate'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF = 'Plus Jakarta Sans, sans-serif'

const STATUSES = ['pending', 'submitted', 'simulated', 'invoiced', 'paid', 'declined']

const statusPill = (s) => {
  const map = {
    pending:   { bg: '#F3F4F6', fg: '#374151' },
    submitted: { bg: '#DBEAFE', fg: '#1E40AF' },
    simulated: { bg: '#FEF3C7', fg: '#92400E' },
    invoiced:  { bg: '#EDE9FE', fg: '#5B21B6' },
    paid:      { bg: '#D1FAE5', fg: '#065F46' },
    declined:  { bg: '#FEE2E2', fg: '#991B1B' },
  }
  const { bg, fg } = map[s] || { bg: '#F3F4F6', fg: '#374151' }
  return { background: bg, color: fg, padding: '2px 8px', borderRadius: 6, fontSize: '.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.02em' }
}

const nzDate = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: 'short', year: '2-digit' }) } catch { return String(iso) }
}
const nzDateTime = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return String(iso) }
}
const dollars = (cents) => (Number.isFinite(cents) ? `$${(cents / 100).toFixed(2)}` : '—')

const inp = { padding: '.5rem .625rem', border: '1px solid #E2E8F0', borderRadius: 6, fontFamily: FF, fontSize: '.8125rem', outline: 'none' }
const lbl = { fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }

export default function AccClaimsSection() {
  const [claims, setClaims]           = useState([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)

  // Filters
  const [status, setStatus]           = useState('')
  const [from, setFrom]               = useState('')
  const [to, setTo]                   = useState('')
  const [minAmount, setMinAmount]     = useState('')
  const [patientNhi, setPatientNhi]   = useState('')

  // Reason-picker + bundle modal state
  const [pendingClaim, setPendingClaim] = useState(null) // claim currently prompting for reason
  const [pendingAction, setPendingAction] = useState(null) // 'json' | 'pdf'
  const [bundle, setBundle]             = useState(null)
  const [bundleLoading, setBundleLoading] = useState(false)

  async function refresh() {
    setLoading(true); setError(null)
    try {
      const rows = await listAccClaimsAdmin({
        status: status || undefined,
        from:   from   || undefined,
        to:     to     || undefined,
        minAmountCents: minAmount ? Math.round(parseFloat(minAmount) * 100) : undefined,
        patientNhi: patientNhi.trim() || undefined,
        limit: 500,
      })
      setClaims(rows)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }
  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [])

  const summary = useMemo(() => {
    const total = claims.length
    const totalCents = claims.reduce((a, c) => a + (c.amount_claimed || 0), 0)
    const paidCents  = claims.reduce((a, c) => a + (c.amount_paid    || 0), 0)
    return { total, totalCents, paidCents }
  }, [claims])

  function handleViewBundle(claim) { setPendingClaim(claim); setPendingAction('json') }
  function handleDownloadPdf(claim) { setPendingClaim(claim); setPendingAction('pdf') }

  async function onReasonConfirm({ reason, reason_notes }) {
    const claim = pendingClaim
    const action = pendingAction
    setPendingClaim(null); setPendingAction(null)
    if (!claim || !action) return
    if (action === 'json') {
      setBundleLoading(true)
      try {
        const b = await getAccAuditBundle(claim.id, { reason, reasonNotes: reason_notes })
        setBundle(b)
      } catch (e) { alert('Bundle fetch failed: ' + e.message) }
      setBundleLoading(false)
    } else {
      try {
        const blob = await downloadAccAuditBundlePdf(claim.id, { reason, reasonNotes: reason_notes })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `acc-audit-${claim.claim_number || claim.id}.pdf`
        document.body.appendChild(a); a.click(); a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 5000)
      } catch (e) { alert('PDF export failed: ' + e.message) }
    }
  }

  function exportCsv() {
    const header = ['claim_number', 'invoice_number', 'status', 'service_code', 'amount_claimed_nzd', 'amount_paid_nzd', 'patient_nhi', 'patient_name', 'provider_hpi', 'provider_name', 'submitted_at', 'paid_at', 'created_at', 'consultation_id']
    const rows = claims.map(c => [
      c.claim_number, c.invoice_number, c.status, c.service_code,
      (c.amount_claimed || 0) / 100, (c.amount_paid || 0) / 100,
      c.patient_nhi, c.patient_name, c.provider_hpi, c.provider_name,
      c.submitted_at, c.paid_at, c.created_at, c.consultation_id,
    ].map(v => v == null ? '' : String(v).replace(/"/g, '""')))
    const csv = [header, ...rows].map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${v}"` : v).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `acc-claims-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  return (
    <div style={{ fontFamily: FF }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, color: NAVY, fontSize: '1.125rem', fontWeight: 800 }}>ACC claims</h3>
          <div style={{ fontSize: '.8125rem', color: '#6B7280', marginTop: 2 }}>
            Filter, view, and export per-claim audit evidence bundles.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportCsv} disabled={!claims.length}
            style={{ background: 'white', color: NAVY, border: '1px solid #E2E8F0', padding: '.5rem .875rem', borderRadius: 8, fontFamily: FF, fontSize: '.8125rem', fontWeight: 700, cursor: claims.length ? 'pointer' : 'default' }}>
            Export CSV ({claims.length})
          </button>
          <button onClick={refresh} disabled={loading}
            style={{ background: TEAL, color: 'white', border: 'none', padding: '.5rem .875rem', borderRadius: 8, fontFamily: FF, fontSize: '.8125rem', fontWeight: 700, cursor: loading ? 'default' : 'pointer' }}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: '1rem' }}>
        <div style={{ background: '#F7F5F0', borderRadius: 10, padding: '.75rem .875rem' }}>
          <div style={lbl}>Claims</div>
          <div style={{ fontSize: '1.125rem', color: NAVY, fontWeight: 800 }}>{summary.total}</div>
        </div>
        <div style={{ background: '#F7F5F0', borderRadius: 10, padding: '.75rem .875rem' }}>
          <div style={lbl}>Total claimed</div>
          <div style={{ fontSize: '1.125rem', color: NAVY, fontWeight: 800 }}>{dollars(summary.totalCents)}</div>
        </div>
        <div style={{ background: '#F7F5F0', borderRadius: 10, padding: '.75rem .875rem' }}>
          <div style={lbl}>Paid</div>
          <div style={{ fontSize: '1.125rem', color: '#059669', fontWeight: 800 }}>{dollars(summary.paidCents)}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, padding: '.875rem 1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          <div>
            <label style={lbl}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...inp, width: '100%' }}>
              <option value="">All</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ ...inp, width: '100%' }} />
          </div>
          <div>
            <label style={lbl}>To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ ...inp, width: '100%' }} />
          </div>
          <div>
            <label style={lbl}>Min amount (NZD)</label>
            <input type="number" step="0.01" min="0" value={minAmount} onChange={e => setMinAmount(e.target.value)} placeholder="0.00" style={{ ...inp, width: '100%' }} />
          </div>
          <div>
            <label style={lbl}>Patient NHI</label>
            <input value={patientNhi} onChange={e => setPatientNhi(e.target.value)} placeholder="e.g. ABC1234" style={{ ...inp, width: '100%' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button onClick={refresh} style={{ width: '100%', background: NAVY, color: 'white', border: 'none', padding: '.5rem .75rem', borderRadius: 6, fontFamily: FF, fontSize: '.8125rem', fontWeight: 700, cursor: 'pointer' }}>
              Apply filters
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      {error && (
        <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '.75rem 1rem', borderRadius: 8, fontSize: '.8125rem', marginBottom: '.75rem' }}>
          {error}
        </div>
      )}
      <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8125rem' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', textAlign: 'left' }}>
                <th style={{ padding: '.625rem .75rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Claim #</th>
                <th style={{ padding: '.625rem .75rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Status</th>
                <th style={{ padding: '.625rem .75rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Patient</th>
                <th style={{ padding: '.625rem .75rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Provider</th>
                <th style={{ padding: '.625rem .75rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Code</th>
                <th style={{ padding: '.625rem .75rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '.625rem .75rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Created</th>
                <th style={{ padding: '.625rem .75rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}></th>
              </tr>
            </thead>
            <tbody>
              {!claims.length && !loading && (
                <tr><td colSpan={8} style={{ padding: '1.5rem', textAlign: 'center', color: '#9CA3AF' }}>No claims match those filters.</td></tr>
              )}
              {claims.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '.625rem .75rem', color: NAVY, fontWeight: 700 }}>{c.claim_number || '—'}</td>
                  <td style={{ padding: '.625rem .75rem' }}><span style={statusPill(c.status)}>{c.status || '—'}</span></td>
                  <td style={{ padding: '.625rem .75rem' }}>
                    <div style={{ color: NAVY }}>{c.patient_name || '—'}</div>
                    <div style={{ fontSize: '.6875rem', color: '#6B7280' }}>{c.patient_nhi || '—'}</div>
                  </td>
                  <td style={{ padding: '.625rem .75rem' }}>
                    <div style={{ color: NAVY }}>{c.provider_name || '—'}</div>
                    <div style={{ fontSize: '.6875rem', color: '#6B7280' }}>HPI {c.provider_hpi || '—'}</div>
                  </td>
                  <td style={{ padding: '.625rem .75rem', color: '#374151' }}>{c.service_code || '—'}</td>
                  <td style={{ padding: '.625rem .75rem', textAlign: 'right', color: NAVY, fontWeight: 700 }}>{dollars(c.amount_claimed)}</td>
                  <td style={{ padding: '.625rem .75rem', color: '#374151' }}>{nzDate(c.created_at)}</td>
                  <td style={{ padding: '.625rem .75rem', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button onClick={() => handleViewBundle(c)} style={{ background: 'white', border: '1px solid #E2E8F0', color: NAVY, padding: '.375rem .625rem', borderRadius: 6, fontFamily: FF, fontSize: '.75rem', fontWeight: 700, cursor: 'pointer', marginRight: 6 }}>View bundle</button>
                    <button onClick={() => handleDownloadPdf(c)} style={{ background: TEAL, border: 'none', color: 'white', padding: '.375rem .625rem', borderRadius: 6, fontFamily: FF, fontSize: '.75rem', fontWeight: 700, cursor: 'pointer' }}>PDF</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reason picker (reused from PhiRevealGate) */}
      <ReasonPicker
        open={!!pendingClaim}
        subject={pendingClaim ? `ACC claim ${pendingClaim.claim_number || pendingClaim.id} · ${pendingClaim.patient_name || pendingClaim.patient_nhi || ''}` : ''}
        onCancel={() => { setPendingClaim(null); setPendingAction(null) }}
        onConfirm={onReasonConfirm}
      />

      {/* Bundle modal (JSON view) */}
      {bundle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,43,69,.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
          <div style={{ background: 'white', borderRadius: 14, width: '100%', maxWidth: 900, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 800, color: NAVY, fontSize: '1rem' }}>ACC audit bundle · {bundle.claim?.claim_number}</div>
                <div style={{ fontSize: '.75rem', color: '#6B7280' }}>Exported {nzDateTime(bundle.generated_at)} by {bundle.generated_by?.name} · reason: {bundle.reason}</div>
              </div>
              <button onClick={() => setBundle(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#9CA3AF', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '1rem 1.25rem', overflowY: 'auto', flex: 1 }}>
              <BundleView bundle={bundle} />
            </div>
            <div style={{ padding: '.75rem 1.25rem', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setBundle(null)} style={{ background: 'white', border: '1px solid #E2E8F0', color: NAVY, padding: '.5rem 1rem', borderRadius: 8, fontFamily: FF, fontSize: '.8125rem', fontWeight: 700, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}
      {bundleLoading && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(255,255,255,.75)', zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: FF, color: NAVY, fontWeight: 700 }}>Assembling bundle…</div>
        </div>
      )}
    </div>
  )
}

function BundleView({ bundle }) {
  const c = bundle.claim || {}
  const consult = bundle.consultation || {}
  const p = bundle.patient || {}
  const pv = bundle.provider || {}
  const kv = (k, v) => (
    <div style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px dashed #F1F5F9' }}>
      <div style={{ minWidth: 140, color: '#6B7280', fontSize: '.75rem', fontWeight: 700, textTransform: 'uppercase' }}>{k}</div>
      <div style={{ color: NAVY, fontSize: '.8125rem', wordBreak: 'break-word' }}>{v || '—'}</div>
    </div>
  )
  const H = ({ children }) => <div style={{ color: NAVY, fontWeight: 800, marginTop: '1rem', marginBottom: '.5rem', fontSize: '.9375rem' }}>{children}</div>
  const tic = bundle.time_in_care
  const fin = bundle.financials
  return (
    <div>
      {(tic || fin) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: '1rem' }}>
          {tic && (
            <div style={{ background: '#F7F5F0', padding: '.5rem .75rem', borderRadius: 8 }}>
              <div style={{ fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase' }}>Days in care</div>
              <div style={{ fontSize: '1.125rem', color: NAVY, fontWeight: 800 }}>{tic.days_in_care}</div>
              <div style={{ fontSize: '.6875rem', color: tic.is_discharged ? '#059669' : '#D97706' }}>{tic.is_discharged ? 'discharged' : 'open episode'}</div>
            </div>
          )}
          {fin && (
            <>
              <div style={{ background: '#F7F5F0', padding: '.5rem .75rem', borderRadius: 8 }}>
                <div style={{ fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase' }}>Billed</div>
                <div style={{ fontSize: '1.125rem', color: NAVY, fontWeight: 800 }}>{dollars(fin.total_billed_cents)}</div>
                {fin.claims_on_episode > 1 && <div style={{ fontSize: '.6875rem', color: '#6B7280' }}>{fin.claims_on_episode} claims</div>}
              </div>
              <div style={{ background: '#F7F5F0', padding: '.5rem .75rem', borderRadius: 8 }}>
                <div style={{ fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase' }}>Paid</div>
                <div style={{ fontSize: '1.125rem', color: '#059669', fontWeight: 800 }}>{dollars(fin.total_paid_cents)}</div>
              </div>
              {fin.delta_cents > 0 && (
                <div style={{ background: '#FFFBEB', padding: '.5rem .75rem', borderRadius: 8 }}>
                  <div style={{ fontSize: '.6875rem', color: '#92400E', fontWeight: 700, textTransform: 'uppercase' }}>Outstanding</div>
                  <div style={{ fontSize: '1.125rem', color: '#D97706', fontWeight: 800 }}>{dollars(fin.delta_cents)}</div>
                  {fin.days_outstanding != null && <div style={{ fontSize: '.6875rem', color: '#92400E' }}>{fin.days_outstanding} days</div>}
                </div>
              )}
            </>
          )}
        </div>
      )}
      <H>Claim</H>
      {kv('Claim #', c.claim_number)}
      {kv('Invoice #', c.invoice_number)}
      {kv('Status', c.status)}
      {kv('Service code', c.service_code)}
      {kv('Amount claimed', dollars(c.amount_claimed))}
      {kv('Amount paid', c.amount_paid != null ? dollars(c.amount_paid) : '—')}
      {kv('Submitted', nzDateTime(c.submitted_at))}
      {kv('Paid', nzDateTime(c.paid_at))}
      {c.decline_reason && kv('Decline reason', c.decline_reason)}

      <H>Patient</H>
      {kv('Name', [p.first_name, p.last_name].filter(Boolean).join(' ') || c.patient_name)}
      {kv('NHI', p.nhi || c.patient_nhi)}
      {kv('DOB', nzDate(p.dob))}
      {kv('Phone', p.phone)}
      {kv('Email', p.email)}

      <H>Treating provider</H>
      {kv('Name', [pv.first_name, pv.last_name].filter(Boolean).join(' ') || c.provider_name)}
      {kv('HPI-CPN', pv.hpi_number || c.provider_hpi)}
      {kv('ACC #', pv.acc_provider_number)}

      <H>Injury coding & consent</H>
      {kv('Injury date', nzDate(consult.acc_injury_date))}
      {kv('Read code', consult.acc_read_code)}
      {kv('Body part', consult.acc_body_part)}
      {kv('Employer', consult.acc_employer)}
      {kv('Mechanism', consult.acc_injury_details)}
      {kv('Consent obtained', nzDateTime(consult.acc_consent_obtained_at))}
      {!consult.acc_consent_obtained_at && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', padding: '.5rem .75rem', borderRadius: 6, color: '#92400E', fontSize: '.75rem', marginTop: 6 }}>
          ⚠ No discrete consent timestamp (predates 2026-09-02 rollout). Consent referenced in clinical notes.
        </div>
      )}

      {(consult.rehab_plan || consult.rtw_status || consult.discharge_summary) && (
        <>
          <H>Treatment plan & discharge</H>
          {consult.rehab_plan && (
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '.5rem .75rem', fontSize: '.8125rem', marginBottom: 6 }}>
              <div style={{ color: NAVY, fontWeight: 700, marginBottom: 4 }}>Rehab plan</div>
              {Array.isArray(consult.rehab_plan.goals) && consult.rehab_plan.goals.length > 0 && (
                <div style={{ color: '#374151' }}>Goals: {consult.rehab_plan.goals.join(' · ')}</div>
              )}
              {consult.rehab_plan.plan && <div style={{ color: '#374151' }}>Plan: {consult.rehab_plan.plan}</div>}
              {consult.rehab_plan.review_cycle_weeks && <div style={{ color: '#6B7280' }}>Review every {consult.rehab_plan.review_cycle_weeks} weeks · next {nzDate(consult.rehab_plan.next_review_at)}</div>}
            </div>
          )}
          {consult.rtw_status && (
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '.5rem .75rem', fontSize: '.8125rem', marginBottom: 6 }}>
              <div style={{ color: NAVY, fontWeight: 700, marginBottom: 4 }}>Return to work</div>
              <div style={{ color: '#374151' }}>Status: {consult.rtw_status.status} · Hours/wk: {consult.rtw_status.hours_per_week ?? '—'} · Target: {nzDate(consult.rtw_status.target_date)}</div>
              {consult.rtw_status.restrictions && <div style={{ color: '#6B7280' }}>Restrictions: {consult.rtw_status.restrictions}</div>}
            </div>
          )}
          {consult.discharge_summary && (
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '.5rem .75rem', fontSize: '.8125rem', marginBottom: 6 }}>
              <div style={{ color: NAVY, fontWeight: 700, marginBottom: 4 }}>Discharge summary</div>
              <div style={{ color: '#374151' }}>Status: {consult.discharge_summary.status} · {nzDate(consult.discharge_summary.discharge_date)}</div>
              {consult.discharge_summary.referred_to && <div style={{ color: '#6B7280' }}>Referred to: {consult.discharge_summary.referred_to}</div>}
              {consult.discharge_summary.summary_text && <div style={{ color: '#374151', marginTop: 4 }}>{consult.discharge_summary.summary_text}</div>}
            </div>
          )}
        </>
      )}

      <H>Related consults on this claim ({bundle.related_consults?.length || 0})</H>
      {(!bundle.related_consults?.length) ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>None — this is the only consult filed on this claim.</div> : bundle.related_consults.map(rc => (
        <div key={rc.id} style={{ padding: '6px 0', borderBottom: '1px dashed #F1F5F9', fontSize: '.8125rem' }}>
          <div style={{ color: NAVY, fontWeight: 700 }}>{nzDate(rc.created_at)} · {rc.consultation_type || '—'} · {rc.acc_read_code || '—'}</div>
          <div style={{ color: '#6B7280', fontSize: '.75rem' }}>{String(rc.chief_complaint || '').slice(0, 160)}</div>
        </div>
      ))}

      <H>Outcome measures ({bundle.outcome_measures?.length || 0})</H>
      {(!bundle.outcome_measures?.length) ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>No structured measures recorded.</div> : bundle.outcome_measures.map(m => (
        <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '160px 200px 1fr', gap: 8, padding: '4px 0', borderBottom: '1px dashed #F1F5F9', fontSize: '.8125rem' }}>
          <div style={{ color: '#6B7280' }}>{nzDateTime(m.recorded_at)}</div>
          <div style={{ color: TEAL, fontWeight: 700 }}>{m.measure_type}</div>
          <div style={{ color: NAVY }}>{m.value_numeric != null ? m.value_numeric : m.value_text || '—'}</div>
        </div>
      ))}

      <H>Case-manager comms ({bundle.communications?.length || 0})</H>
      <AccCommsAdder claim={bundle.claim} />
      {(!bundle.communications?.length) ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem', marginTop: 8 }}>None recorded.</div> : bundle.communications.slice(0, 20).map(cm => (
        <div key={cm.id} style={{ padding: '6px 0', borderBottom: '1px dashed #F1F5F9', fontSize: '.8125rem' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: '#6B7280' }}>{nzDateTime(cm.occurred_at)}</span>
            <span style={{ color: cm.direction === 'inbound' ? '#059669' : '#7C3AED', fontWeight: 700, fontSize: '.6875rem' }}>{(cm.direction || '').toUpperCase()}</span>
            <span style={{ color: '#6B7280', fontSize: '.6875rem' }}>{cm.channel}</span>
            <span style={{ color: NAVY, fontWeight: 600 }}>{cm.subject || '(no subject)'}</span>
          </div>
          {cm.body && <div style={{ color: '#374151', fontSize: '.75rem', marginTop: 3 }}>{String(cm.body).slice(0, 240)}</div>}
        </div>
      ))}

      <H>Peer review ({bundle.peer_reviews?.length || 0}) — <span style={{ fontSize: '.75rem', fontWeight: 400, color: '#6B7280' }}>Admin → Quality → Peer review sampling</span></H>
      {(!bundle.peer_reviews?.length) ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>Not sampled for peer review.</div> : bundle.peer_reviews.map(pr => (
        <div key={pr.id} style={{ padding: '6px 0', borderBottom: '1px dashed #F1F5F9', fontSize: '.8125rem' }}>
          <div style={{ color: NAVY, fontWeight: 700 }}>{nzDateTime(pr.reviewed_at)} · {pr.reviewer_name || '—'}</div>
          <div style={{ color: TEAL, fontSize: '.75rem' }}>Agreement: {pr.agreement || '—'} · Sample: {pr.sample_reason || '—'}</div>
          {pr.notes && <div style={{ color: '#374151', marginTop: 4 }}>{pr.notes}</div>}
        </div>
      ))}

      <H>Status timeline</H>
      {(!bundle.timeline?.length) ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>No events.</div> : bundle.timeline.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '160px 180px 1fr', gap: 8, padding: '6px 0', borderBottom: '1px dashed #F1F5F9', fontSize: '.8125rem' }}>
          <div style={{ color: '#6B7280' }}>{nzDateTime(r.at)}</div>
          <div style={{ color: TEAL, fontWeight: 700 }}>{r.event}</div>
          <div style={{ color: NAVY }}>{r.detail}</div>
        </div>
      ))}

      <H>Prescriptions ({bundle.prescriptions?.length || 0})</H>
      {(!bundle.prescriptions?.length) ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>None linked.</div> : bundle.prescriptions.map(rx => (
        <div key={rx.id} style={{ padding: '6px 0', borderBottom: '1px dashed #F1F5F9', fontSize: '.8125rem' }}>
          <div style={{ color: NAVY, fontWeight: 700 }}>{rx.drug_name}{rx.strength ? ` ${rx.strength}` : ''} {rx.controlled && <span style={{ color: '#DC2626' }}>[CONTROLLED]</span>}</div>
          <div style={{ color: '#6B7280', fontSize: '.75rem' }}>{rx.dose_instructions} · qty {rx.quantity ?? '—'} · status {rx.status} · {nzDate(rx.created_at)}</div>
        </div>
      ))}

      <H>Radiology referrals ({bundle.radiology_referrals?.length || 0})</H>
      {(!bundle.radiology_referrals?.length) ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>None linked.</div> : bundle.radiology_referrals.map(r => (
        <div key={r.id} style={{ padding: '6px 0', borderBottom: '1px dashed #F1F5F9', fontSize: '.8125rem' }}>
          <div style={{ color: NAVY, fontWeight: 700 }}>{r.modality} · {r.region} · {r.urgency}</div>
          <div style={{ color: '#6B7280', fontSize: '.75rem' }}>{r.clinical_details} · status {r.status} · {nzDate(r.created_at)}</div>
        </div>
      ))}

      <H>ACC response</H>
      {c.raw_response ? (
        <pre style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '.75rem', fontSize: '.75rem', overflow: 'auto', maxHeight: 220 }}>
          {typeof c.raw_response === 'string' ? c.raw_response : JSON.stringify(c.raw_response, null, 2)}
        </pre>
      ) : <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>No response recorded.</div>}

      <H>Audit trail ({bundle.audit_trail?.length || 0})</H>
      {(!bundle.audit_trail?.length) ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>No accesses recorded.</div> : bundle.audit_trail.map((a, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '160px 180px 1fr', gap: 8, padding: '4px 0', borderBottom: '1px dashed #F1F5F9', fontSize: '.75rem' }}>
          <div style={{ color: '#6B7280' }}>{nzDateTime(a.created_at)}</div>
          <div style={{ color: NAVY, fontWeight: 700 }}>{a.event_type}</div>
          <div style={{ color: '#374151' }}>{a.provider_name} ({a.provider_role}) {a.reason && `· ${a.reason}`}</div>
        </div>
      ))}
    </div>
  )
}

function AccCommsAdder({ claim }) {
  const [open, setOpen] = useState(false)
  const [direction, setDirection] = useState('inbound')
  const [channel, setChannel] = useState('email')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function save() {
    if (!subject.trim() && !body.trim()) { setMsg('Add a subject or body'); return }
    setBusy(true); setMsg(null)
    try {
      await addAccCommunication({
        claim_id:     claim.id,
        claim_number: claim.claim_number,
        direction, channel,
        subject:      subject.trim() || null,
        body:         body.trim() || null,
      })
      setMsg('Logged. Refresh the bundle to see it.')
      setSubject(''); setBody('')
      setOpen(false)
    } catch (e) { setMsg('Error: ' + e.message) }
    setBusy(false)
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      style={{ background: 'white', border: `1px dashed ${TEAL}`, color: TEAL, padding: '.375rem .75rem', borderRadius: 6, fontFamily: FF, fontSize: '.75rem', fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
      + Log a case-manager communication
    </button>
  )

  return (
    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '.75rem', marginBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
        <select value={direction} onChange={e => setDirection(e.target.value)} style={inp}>
          <option value="inbound">Inbound (ACC → us)</option>
          <option value="outbound">Outbound (us → ACC)</option>
        </select>
        <select value={channel} onChange={e => setChannel(e.target.value)} style={inp}>
          <option value="email">Email</option>
          <option value="phone">Phone</option>
          <option value="letter">Letter</option>
          <option value="portal">Portal</option>
          <option value="webhook">Webhook</option>
          <option value="other">Other</option>
        </select>
      </div>
      <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject (e.g. Request for further clinical info)" style={{ ...inp, marginBottom: 6, width: '100%', boxSizing: 'border-box' }} />
      <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} placeholder="Body / summary of what was communicated" style={{ ...inp, width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
        <button onClick={save} disabled={busy} style={{ background: TEAL, color: 'white', border: 'none', padding: '.375rem .75rem', borderRadius: 6, fontFamily: FF, fontSize: '.75rem', fontWeight: 700, cursor: 'pointer' }}>
          {busy ? 'Saving…' : 'Log'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'white', color: '#374151', border: '1px solid #E2E8F0', padding: '.375rem .75rem', borderRadius: 6, fontFamily: FF, fontSize: '.75rem', cursor: 'pointer' }}>
          Cancel
        </button>
        {msg && <span style={{ fontSize: '.75rem', color: msg.startsWith('Error') ? '#DC2626' : '#059669' }}>{msg}</span>}
      </div>
    </div>
  )
}
