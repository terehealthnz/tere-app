import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getActiveConsultations, subscribeToQueue } from '../../lib/supabase'
import { CONSULT_TYPE_LABELS } from '../../lib/consultationType'
import { apiFetch } from '../../lib/api'

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
  const { supabase } = await import('../../lib/supabase')
  const today = new Date()
  today.setHours(0,0,0,0)
  const { data } = await supabase
    .from('consultations')
    .select('*')
    .eq('status', 'complete')
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: false })
  return data || []
}

function NotesGroup({ title, color, rows, navigate, onFlag }) {
  if (!rows.length) return null
  const dot = { width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.75rem' }}>
        <div style={dot} />
        <span style={{ fontWeight: 700, fontSize: '.9375rem' }}>{title}</span>
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
      const { supabase } = await import('../../lib/supabase')
      const { data, error: err } = await supabase
        .from('consultations')
        .select('id, created_at, patient_first_name, patient_last_name, chief_complaint, acc_eligible, notes_flagged, notes_finalised, notes_finalised_at, notes_draft, clinical_notes, outcome, follow_up_days')
        .eq('status', 'complete')
        .order('created_at', { ascending: false })
        .limit(200)
      if (err) throw err
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
      const { supabase } = await import('../../lib/supabase')
      await supabase.from('consultations').update({ notes_flagged: flagged }).eq('id', id)
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

function MessagesTab() {
  const navigate = useNavigate()
  const [rows, setRows] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [responding, setResponding] = React.useState(null)
  const [responseText, setResponseText] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [sent, setSent] = React.useState({})

  async function load() {
    setLoading(true)
    try {
      const { supabase } = await import('../../lib/supabase')
      const { data } = await supabase
        .from('consultations')
        .select('*')
        .eq('consultation_type', 'message')
        .in('status', ['waiting', 'in_progress'])
        .order('created_at', { ascending: true })
      setRows(data || [])
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  async function sendResponse(consultation) {
    setSending(true)
    try {
      const { supabase } = await import('../../lib/supabase')
      const providerId = sessionStorage.getItem('providerId')
      const providerDisplay = sessionStorage.getItem('providerDisplayName')
      await supabase.from('consultations').update({
        status: 'complete',
        clinical_notes: {
          S: consultation.chief_complaint,
          O: `Medical history: ${consultation.medical_history || 'nil'}\nMedications: ${consultation.medications || 'nil'}\nAllergies: ${consultation.patient_allergies || 'nil'}`,
          A: '',
          P: responseText,
        },
        notes_finalised: true,
        notes_finalised_at: new Date().toISOString(),
        outcome: 'message_response',
        provider_display_name: providerDisplay || null,
        ...(providerId ? { provider_id: providerId } : {}),
      }).eq('id', consultation.id)

      // Capture the payment hold (message consultations use manual capture)
      if (consultation.payment_intent_id) {
        try {
          await apiFetch('/api/capture-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentIntentId: consultation.payment_intent_id }),
          })
        } catch (e) { console.error('Payment capture error:', e) }
      }

      // Try to send email response
      try {
        await apiFetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: consultation.patient_email,
            name: `${consultation.patient_first_name} ${consultation.patient_last_name}`,
            notes: { A: '', P: responseText },
            actions: [],
            consult: consultation,
          })
        })
      } catch {}

      setSent(s => ({ ...s, [consultation.id]: true }))
      setRows(rs => rs.filter(r => r.id !== consultation.id))
      setResponding(null)
      setResponseText('')
    } catch(e) { console.error(e) }
    setSending(false)
  }

  React.useEffect(() => { load() }, [])

  if (loading) return <div style={{ textAlign:'center', padding:'3rem' }}><div className="spinner" /></div>

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem' }}>
        <h1 style={{ marginBottom:0 }}>Message consultations</h1>
        <button onClick={load} style={{ background:'var(--teal-light)', border:'none', color:'var(--teal)', padding:'8px 16px', borderRadius:'var(--radius-sm)', cursor:'pointer', fontFamily:'Plus Jakarta Sans,sans-serif', fontWeight:600, fontSize:'.875rem' }}>↻ Refresh</button>
      </div>

      {rows.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:'3rem' }}>
          <div style={{ fontSize:'2.5rem', marginBottom:'1rem' }}>💬</div>
          <h3>No pending messages</h3>
          <p>Message consultations awaiting response will appear here.</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          {rows.map(c => (
            <div key={c.id} className="card card-sm" style={{ borderLeft:'4px solid #D97706' }}>
              <div style={{ display:'flex', alignItems:'start', justifyContent:'space-between', gap:'1rem', marginBottom:'.75rem' }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'.375rem' }}>
                    <h3>{c.patient_first_name} {c.patient_last_name}</h3>
                    <TypeBadge type="message" />
                    {c.acc_eligible === 'yes' && <span className="badge badge-info">ACC</span>}
                  </div>
                  <div style={{ fontSize:'.8125rem', color:'var(--muted)' }}>{timeAgo(c.created_at)} · {c.patient_email}</div>
                </div>
                <button onClick={() => setResponding(responding === c.id ? null : c.id)}
                  className="btn btn-primary btn-sm">
                  {responding === c.id ? 'Cancel' : 'Respond'}
                </button>
              </div>

              <div style={{ background:'var(--bg)', borderRadius:'var(--radius-sm)', padding:'.875rem', marginBottom:'.75rem' }}>
                <div style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'var(--muted)', marginBottom:'.375rem' }}>Chief complaint</div>
                <div style={{ fontSize:'.9375rem', lineHeight:1.6 }}>{c.chief_complaint}</div>
              </div>

              {(c.medical_history || c.medications || c.patient_allergies) && (
                <div style={{ display:'flex', gap:'1rem', flexWrap:'wrap', marginBottom:'.75rem' }}>
                  {c.medical_history && <div style={{ fontSize:'.8125rem', color:'var(--muted)' }}><strong>Hx:</strong> {c.medical_history}</div>}
                  {c.medications && <div style={{ fontSize:'.8125rem', color:'var(--muted)' }}><strong>Meds:</strong> {c.medications}</div>}
                  {c.patient_allergies && <div style={{ fontSize:'.8125rem', color:'var(--danger)' }}><strong>Allergies:</strong> {c.patient_allergies}</div>}
                </div>
              )}

              {responding === c.id && (
                <div style={{ borderTop:'1px solid var(--border)', paddingTop:'.875rem' }}>
                  <div style={{ fontSize:'.8125rem', fontWeight:600, color:'var(--text)', marginBottom:'.5rem' }}>Your response</div>
                  <textarea
                    value={responseText}
                    onChange={e => setResponseText(e.target.value)}
                    rows={6}
                    placeholder="Type your clinical response here. This will be emailed to the patient and saved to their record."
                    style={{ width:'100%', boxSizing:'border-box', border:'1.5px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'.75rem', fontFamily:'Plus Jakarta Sans,sans-serif', fontSize:'.9375rem', resize:'vertical', lineHeight:1.6, outline:'none' }}
                  />
                  <button
                    onClick={() => sendResponse(c)}
                    disabled={sending || !responseText.trim()}
                    className="btn btn-primary"
                    style={{ marginTop:'.75rem', width:'100%' }}>
                    {sending ? 'Sending…' : 'Send response & complete consultation'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ApprovalsTab({ onBadgeChange }) {
  const [items, setItems] = React.useState({ prescriptions: [], referrals: [], acc: [] })
  const [loading, setLoading] = React.useState(true)
  const [migrationError, setMigrationError] = React.useState(false)
  const [states, setStates] = React.useState({})

  async function load() {
    try {
      const { supabase } = await import('../../lib/supabase')
      const [rxRes, refRes, accRes] = await Promise.all([
        supabase.from('prescriptions').select('*').eq('approval_status', 'pending_approval').order('created_at'),
        supabase.from('radiology_referrals').select('*').eq('approval_status', 'pending_approval').order('created_at'),
        supabase.from('consultations')
          .select('id, created_at, patient_first_name, patient_last_name, patient_email, acc_draft, provider_id, provider_display_name')
          .eq('acc_approval_status', 'pending_approval')
          .order('created_at'),
      ])
      if (rxRes.error?.code === '42P01') { setMigrationError(true); setLoading(false); return }
      const loaded = { prescriptions: rxRes.data || [], referrals: refRes.data || [], acc: accRes.data || [] }
      setItems(loaded)
      onBadgeChange?.(loaded.prescriptions.length + loaded.referrals.length + loaded.acc.length)
      setMigrationError(false)
    } catch(e) { console.error(e); setMigrationError(true) }
    setLoading(false)
  }

  React.useEffect(() => { load() }, [])
  React.useEffect(() => { const t = setInterval(load, 15000); return () => clearInterval(t) }, [])

  const getState = id => states[id] || {}
  const patchState = (id, patch) => setStates(s => ({ ...s, [id]: { ...(s[id] || {}), ...patch } }))

  async function act(type, id, action) {
    const st = getState(id)
    patchState(id, { saving: true, error: null })
    try {
      const res = await apiFetch('/api/approve-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action, type, id,
          supervisorId: sessionStorage.getItem('providerId'),
          supervisorName: sessionStorage.getItem('providerDisplayName'),
          ...(action === 'modify' ? { modifications: st.mods || {} } : {}),
          ...(action === 'reject' ? { rejectionReason: st.reason || '' } : {}),
        })
      })
      const data = await res.json()
      if (data.ok) {
        await load()
        setStates(s => { const n = { ...s }; delete n[id]; return n })
      } else {
        patchState(id, { saving: false, error: data.error || 'Action failed' })
      }
    } catch(e) {
      patchState(id, { saving: false, error: e.message })
    }
  }

  function renderActionButtons(type, id, hasModify) {
    const st = getState(id)
    const mods = st.mods || {}
    if (st.mode === 'reject') return (
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        <button onClick={() => act(type, id, 'reject')} disabled={st.saving || !st.reason}
          style={{ background: '#DC2626', color: 'white', border: 'none', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '.8125rem', fontFamily: 'Plus Jakarta Sans,sans-serif' }}>
          {st.saving ? 'Rejecting…' : 'Confirm rejection'}
        </button>
        <button onClick={() => patchState(id, { mode: null, reason: '' })} disabled={st.saving}
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: '.8125rem', fontFamily: 'Plus Jakarta Sans,sans-serif' }}>
          Cancel
        </button>
      </div>
    )
    if (st.mode === 'modify') return (
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        <button onClick={() => act(type, id, 'modify')} disabled={st.saving || !Object.keys(mods).length}
          style={{ background: 'var(--success)', color: 'white', border: 'none', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '.8125rem', fontFamily: 'Plus Jakarta Sans,sans-serif' }}>
          {st.saving ? 'Sending…' : '✓ Send modified'}
        </button>
        <button onClick={() => patchState(id, { mode: null, mods: {} })} disabled={st.saving}
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: '.8125rem', fontFamily: 'Plus Jakarta Sans,sans-serif' }}>
          Cancel
        </button>
      </div>
    )
    return (
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        <button onClick={() => act(type, id, 'approve')} disabled={st.saving}
          style={{ background: 'var(--success)', color: 'white', border: 'none', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '.8125rem', fontFamily: 'Plus Jakarta Sans,sans-serif' }}>
          {st.saving ? 'Sending…' : '✓ Approve & Send'}
        </button>
        {hasModify && (
          <button onClick={() => patchState(id, { mode: 'modify' })} disabled={st.saving}
            style={{ background: '#FEF3C7', color: '#92400E', border: 'none', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '.8125rem', fontFamily: 'Plus Jakarta Sans,sans-serif' }}>
            ✎ Modify
          </button>
        )}
        <button onClick={() => patchState(id, { mode: 'reject' })} disabled={st.saving}
          style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '.8125rem', fontFamily: 'Plus Jakarta Sans,sans-serif' }}>
          ✕ Reject
        </button>
      </div>
    )
  }

  function renderRejectBox(id, placeholder) {
    const st = getState(id)
    if (st.mode !== 'reject') return null
    return (
      <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 'var(--radius-sm)', padding: '.875rem', marginBottom: '.875rem' }}>
        <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#991B1B', marginBottom: '.5rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Rejection reason</div>
        <textarea value={st.reason || ''} onChange={e => patchState(id, { reason: e.target.value })}
          rows={3} placeholder={placeholder}
          style={{ width: '100%', boxSizing: 'border-box', padding: '.625rem', border: '1.5px solid #FECACA', borderRadius: 6, fontFamily: 'Plus Jakarta Sans,sans-serif', fontSize: '.875rem', resize: 'vertical' }} />
      </div>
    )
  }

  function renderUrgencyBadge(createdAt) {
    const mins = Math.floor((Date.now() - new Date(createdAt)) / 60000)
    if (mins <= 30) return null
    return (
      <span style={{ background: '#FEE2E2', color: '#DC2626', fontSize: '.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, marginLeft: 'auto' }}>
        {mins}m pending
      </span>
    )
  }

  const totalPending = items.prescriptions.length + items.referrals.length + items.acc.length

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem' }}><div className="spinner" /></div>

  if (migrationError) return (
    <div className="card" style={{ textAlign: 'center', padding: '2rem', borderColor: '#FECACA' }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '.75rem' }}>⚠️</div>
      <h3 style={{ marginBottom: '.5rem' }}>Migration required</h3>
      <p style={{ fontSize: '.875rem', color: 'var(--muted)' }}>
        Run <code>supabase-supervisor-migration.sql</code> to enable the approvals workflow.
      </p>
    </div>
  )

  if (totalPending === 0) return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <h1 style={{ marginBottom: 0 }}>Pending approvals</h1>
        <button onClick={load} style={{ background: 'var(--teal-light)', border: 'none', color: 'var(--teal)', padding: '8px 16px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans,sans-serif', fontWeight: 600, fontSize: '.875rem' }}>↻ Refresh</button>
      </div>
      <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✓</div>
        <h3>No pending approvals</h3>
        <p>Prescriptions, referrals, and ACC claims drafted by non-prescribing providers will appear here.</p>
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ marginBottom: '.25rem' }}>Pending approvals</h1>
          <p style={{ fontSize: '.875rem' }}>{totalPending} item{totalPending !== 1 ? 's' : ''} awaiting your review</p>
        </div>
        <button onClick={load} style={{ background: 'var(--teal-light)', border: 'none', color: 'var(--teal)', padding: '8px 16px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans,sans-serif', fontWeight: 600, fontSize: '.875rem' }}>↻ Refresh</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {items.prescriptions.map(rx => {
          const st = getState(rx.id)
          const mods = st.mods || {}
          return (
            <div key={rx.id} className="card card-sm" style={{ borderLeft: `4px solid ${Math.floor((Date.now() - new Date(rx.created_at)) / 60000) > 30 ? '#DC2626' : '#7C3AED'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem' }}>
                <span style={{ fontWeight: 700, fontSize: '1rem' }}>{rx.patient_name}</span>
                <span style={{ background: '#EDE9FE', color: '#7C3AED', fontSize: '.6875rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>Prescription</span>
                {renderUrgencyBadge(rx.created_at)}
              </div>
              <div style={{ fontSize: '.8125rem', color: 'var(--muted)', marginBottom: '.75rem' }}>
                Drafted by <strong>{rx.drafted_by_name || rx.provider_name}</strong> · {timeAgo(rx.created_at)}
              </div>
              {st.mode === 'modify' ? (
                <div style={{ background: '#FFF7ED', border: '1.5px solid #FED7AA', borderRadius: 'var(--radius-sm)', padding: '.875rem', marginBottom: '.875rem' }}>
                  <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#92400E', marginBottom: '.625rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Modify prescription</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
                    {[['Drug','drug',rx.drug],['Dose','dose',rx.dose],['Quantity','quantity',rx.quantity],['Repeats','repeats',rx.repeats||0]].map(([lbl,key,def]) => (
                      <div key={key}>
                        <label style={{ fontSize: '.75rem', color: 'var(--muted)', display: 'block', marginBottom: 2 }}>{lbl}</label>
                        <input value={mods[key] !== undefined ? mods[key] : def}
                          onChange={e => patchState(rx.id, { mods: { ...mods, [key]: e.target.value } })}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px', border: '1.5px solid var(--border)', borderRadius: 6, fontFamily: 'Plus Jakarta Sans,sans-serif', fontSize: '.875rem' }} />
                      </div>
                    ))}
                    <div style={{ gridColumn: '1/-1' }}>
                      <label style={{ fontSize: '.75rem', color: 'var(--muted)', display: 'block', marginBottom: 2 }}>Directions</label>
                      <textarea value={mods.directions !== undefined ? mods.directions : rx.directions}
                        onChange={e => patchState(rx.id, { mods: { ...mods, directions: e.target.value } })}
                        rows={2} style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px', border: '1.5px solid var(--border)', borderRadius: 6, fontFamily: 'Plus Jakarta Sans,sans-serif', fontSize: '.875rem', resize: 'vertical' }} />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: '.875rem', marginBottom: '.875rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.375rem .75rem', fontSize: '.875rem' }}>
                    <div><span style={{ color: 'var(--muted)' }}>Drug:</span> <strong>{rx.drug}</strong></div>
                    <div><span style={{ color: 'var(--muted)' }}>Dose:</span> {rx.dose}</div>
                    <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--muted)' }}>Directions:</span> {rx.directions}</div>
                    <div><span style={{ color: 'var(--muted)' }}>Qty:</span> {rx.quantity}</div>
                    <div><span style={{ color: 'var(--muted)' }}>Repeats:</span> {rx.repeats || 0}</div>
                    {rx.pharmacy_name && <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--muted)' }}>Pharmacy:</span> {rx.pharmacy_name}</div>}
                  </div>
                </div>
              )}
              {renderRejectBox(rx.id, 'Explain why this prescription cannot be approved as drafted…')}
              {st.error && <div className="alert alert-danger" style={{ marginBottom: '.75rem' }}>{st.error}</div>}
              {renderActionButtons('prescription', rx.id, true)}
            </div>
          )
        })}

        {items.referrals.map(ref => {
          const st = getState(ref.id)
          const mods = st.mods || {}
          return (
            <div key={ref.id} className="card card-sm" style={{ borderLeft: `4px solid ${Math.floor((Date.now() - new Date(ref.created_at)) / 60000) > 30 ? '#DC2626' : '#92400E'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem' }}>
                <span style={{ fontWeight: 700, fontSize: '1rem' }}>{ref.patient_name}</span>
                <span style={{ background: '#FEF3C7', color: '#92400E', fontSize: '.6875rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>Referral</span>
                {renderUrgencyBadge(ref.created_at)}
              </div>
              <div style={{ fontSize: '.8125rem', color: 'var(--muted)', marginBottom: '.75rem' }}>
                Drafted by <strong>{ref.drafted_by_name || ref.provider_name}</strong> · {timeAgo(ref.created_at)}
              </div>
              {st.mode === 'modify' ? (
                <div style={{ background: '#FFF7ED', border: '1.5px solid #FED7AA', borderRadius: 'var(--radius-sm)', padding: '.875rem', marginBottom: '.875rem' }}>
                  <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#92400E', marginBottom: '.625rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Modify referral</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
                    {[['Investigation','investigation',ref.investigation],['Body part','body_part',ref.body_part||''],['Urgency','urgency',ref.urgency||'Routine']].map(([lbl,key,def]) => (
                      <div key={key}>
                        <label style={{ fontSize: '.75rem', color: 'var(--muted)', display: 'block', marginBottom: 2 }}>{lbl}</label>
                        <input value={mods[key] !== undefined ? mods[key] : def}
                          onChange={e => patchState(ref.id, { mods: { ...mods, [key]: e.target.value } })}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px', border: '1.5px solid var(--border)', borderRadius: 6, fontFamily: 'Plus Jakarta Sans,sans-serif', fontSize: '.875rem' }} />
                      </div>
                    ))}
                    <div style={{ gridColumn: '1/-1' }}>
                      <label style={{ fontSize: '.75rem', color: 'var(--muted)', display: 'block', marginBottom: 2 }}>Clinical indication</label>
                      <textarea value={mods.clinical_indication !== undefined ? mods.clinical_indication : (ref.clinical_indication || '')}
                        onChange={e => patchState(ref.id, { mods: { ...mods, clinical_indication: e.target.value } })}
                        rows={2} style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px', border: '1.5px solid var(--border)', borderRadius: 6, fontFamily: 'Plus Jakarta Sans,sans-serif', fontSize: '.875rem', resize: 'vertical' }} />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: '.875rem', marginBottom: '.875rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.375rem .75rem', fontSize: '.875rem' }}>
                    <div><span style={{ color: 'var(--muted)' }}>Investigation:</span> <strong>{ref.investigation}</strong></div>
                    {ref.body_part && <div><span style={{ color: 'var(--muted)' }}>Body part:</span> {ref.body_part}</div>}
                    <div><span style={{ color: 'var(--muted)' }}>Urgency:</span> {ref.urgency || 'Routine'}</div>
                    {ref.clinical_indication && <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--muted)' }}>Indication:</span> {ref.clinical_indication}</div>}
                    {ref.facility_name && <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--muted)' }}>Facility:</span> {ref.facility_name}</div>}
                  </div>
                </div>
              )}
              {renderRejectBox(ref.id, 'Explain why this referral cannot be approved as drafted…')}
              {st.error && <div className="alert alert-danger" style={{ marginBottom: '.75rem' }}>{st.error}</div>}
              {renderActionButtons('referral', ref.id, true)}
            </div>
          )
        })}

        {items.acc.map(c => {
          const st = getState(c.id)
          const draft = c.acc_draft || {}
          return (
            <div key={c.id} className="card card-sm" style={{ borderLeft: `4px solid ${Math.floor((Date.now() - new Date(c.created_at)) / 60000) > 30 ? '#DC2626' : 'var(--success)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem' }}>
                <span style={{ fontWeight: 700, fontSize: '1rem' }}>{c.patient_first_name} {c.patient_last_name}</span>
                <span style={{ background: '#D1FAE5', color: '#065F46', fontSize: '.6875rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>ACC Claim</span>
                {renderUrgencyBadge(c.created_at)}
              </div>
              <div style={{ fontSize: '.8125rem', color: 'var(--muted)', marginBottom: '.75rem' }}>
                Drafted by <strong>{c.provider_display_name || 'Provider'}</strong> · {timeAgo(c.created_at)}
              </div>
              {Object.keys(draft).length > 0 && (
                <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: '.875rem', marginBottom: '.875rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.375rem .75rem', fontSize: '.875rem' }}>
                    {draft.cause && <div><span style={{ color: 'var(--muted)' }}>Cause:</span> {draft.cause}</div>}
                    {draft.bodyPart && <div><span style={{ color: 'var(--muted)' }}>Body part:</span> {draft.bodyPart}</div>}
                    {draft.diagnosisCode && <div><span style={{ color: 'var(--muted)' }}>Dx code:</span> {draft.diagnosisCode}</div>}
                    {draft.injuryDate && <div><span style={{ color: 'var(--muted)' }}>Injury date:</span> {draft.injuryDate}</div>}
                  </div>
                </div>
              )}
              {renderRejectBox(c.id, 'Explain why this ACC claim cannot be approved…')}
              {st.error && <div className="alert alert-danger" style={{ marginBottom: '.75rem' }}>{st.error}</div>}
              {renderActionButtons('acc', c.id, false)}
            </div>
          )
        })}
      </div>
    </div>
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
  const [approvalBadge, setApprovalBadge] = useState(0)
  const isSupervisor = sessionStorage.getItem('providerIsSupervisor') === 'true'

  const load = useCallback(async () => {
    try {
      const data = await getActiveConsultations()
      setConsultations(data)
    } catch {
      setConsultations([{
        id: 'demo-1',
        patient_first_name: 'James', patient_last_name: 'Taitoko',
        chief_complaint: 'Right ankle injury', patient_location: 'Pelorus Sound',
        acc_eligible: 'yes', status: 'vitals_complete',
        created_at: new Date(Date.now() - 4*60000).toISOString(),
        vitals: { hr: 88, rr: 16 },
      }])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    getTodaysConsultations().then(setTodaysConsults)
    // Load this provider's availability + referral badge
    const pid = sessionStorage.getItem('providerId')
    if (pid) {
      import('../../lib/supabase').then(({ supabase }) => {
        supabase.from('providers').select('is_available').eq('id', pid).single()
          .then(({ data }) => { if (data) setProvIsAvail(data.is_available) })
          .catch(() => {})
        supabase.from('radiology_referrals')
          .select('id', { count: 'exact', head: true })
          .eq('provider_id', pid)
          .not('referral_status', 'eq', 'result_received')
          .not('referral_status', 'eq', 'dna')
          .then(({ count }) => { if (count != null) setReferralBadge(count) })
          .catch(() => {})
      })
    }
    if (isSupervisor) {
      import('../../lib/supabase').then(({ supabase }) => {
        Promise.all([
          supabase.from('prescriptions').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending_approval'),
          supabase.from('radiology_referrals').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending_approval'),
          supabase.from('consultations').select('id', { count: 'exact', head: true }).eq('acc_approval_status', 'pending_approval'),
        ]).then(([rx, ref, acc]) => {
          setApprovalBadge((rx.count || 0) + (ref.count || 0) + (acc.count || 0))
        }).catch(() => {})
      })
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
      const { supabase } = await import('../../lib/supabase')
      const newVal = !provIsAvail
      await supabase.from('providers').update({ is_available: newVal }).eq('id', pid)
      setProvIsAvail(newVal)
    } catch {}
    setSavingProvAvail(false)
  }

  async function dismissConsult(id) {
    try {
      const { supabase } = await import('../../lib/supabase')
      await supabase.from('consultations').update({ status: 'expired' }).eq('id', id)
      setConsultations(cs => cs.filter(c => c.id !== id))
    } catch(e) { console.error(e) }
  }

  async function startConsult(consult) {
    setJoiningId(consult.id)
    try {
      const { supabase } = await import('../../lib/supabase')
      const providerId = sessionStorage.getItem('providerId')
      const providerDisplay = sessionStorage.getItem('providerDisplayName')
      await supabase.from('consultations')
        .update({
          status: 'vitals_requested',
          vitals_requested_at: new Date().toISOString(),
          ...(providerId ? { provider_id: providerId } : {}),
          ...(providerDisplay ? { provider_display_name: providerDisplay } : {}),
        })
        .eq('id', consult.id)
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
          <button onClick={() => { sessionStorage.clear(); navigate('/clinician') }}
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

      <div className="container-wide" style={{paddingTop:'1.75rem',paddingBottom:'3rem'}}>

        {/* Per-provider availability toggle */}
        {sessionStorage.getItem('providerId') && (
          <div style={{background:'white',borderRadius:'var(--radius-sm)',border:'2px solid ' + (provIsAvail ? 'var(--success)' : '#D1D5DB'),padding:'1rem 1.25rem',marginBottom:'1rem',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'1rem',flexWrap:'wrap'}}>
            <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
              <div style={{width:12,height:12,borderRadius:'50%',background:provIsAvail ? 'var(--success)' : '#D1D5DB',flexShrink:0}} />
              <div>
                <div style={{fontWeight:700,fontSize:'.9375rem'}}>{provIsAvail ? 'You are available for patients' : 'You are currently unavailable'}</div>
                <div style={{fontSize:'.8125rem',color:'var(--muted)'}}>Your availability status shown to patients</div>
              </div>
            </div>
            <button onClick={toggleProviderAvail} disabled={savingProvAvail}
              style={{background:provIsAvail ? 'var(--danger)' : 'var(--success)',color:'white',border:'none',padding:'8px 18px',borderRadius:'8px',fontWeight:700,fontSize:'.9375rem',cursor:'pointer',fontFamily:'Plus Jakarta Sans,sans-serif',whiteSpace:'nowrap'}}>
              {savingProvAvail ? 'Saving…' : provIsAvail ? 'Set unavailable' : 'Set available'}
            </button>
          </div>
        )}

        {/* Tab switcher */}
        <div style={{display:'flex',gap:4,marginBottom:'1.25rem',background:'white',borderRadius:'var(--radius-sm)',padding:4,border:'1px solid var(--border)',width:'fit-content'}}>
          {[
            ['queue','Queue'],
            ['messages','💬 Messages'],
            ['notes','Notes'],
            ...(isSupervisor ? [['approvals', approvalBadge > 0 ? `Approvals (${approvalBadge})` : 'Approvals']] : []),
          ].map(([t,label]) => (
            <button key={t} onClick={() => setDashTab(t)}
              style={{padding:'7px 20px',borderRadius:'6px',border:'none',cursor:'pointer',fontFamily:'Plus Jakarta Sans,sans-serif',fontWeight:600,fontSize:'.875rem',transition:'all .15s',background:dashTab===t?'var(--navy)':'transparent',color:dashTab===t?'white':t==='approvals'&&approvalBadge>0?'#DC2626':'var(--muted)'}}>
              {label}
            </button>
          ))}
        </div>

        {dashTab === 'messages' && <MessagesTab />}

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
            <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
              {consultations.filter(c => c.consultation_type !== 'message').map(c => {
                const st = statusLabel(c.status)
                const v = c.vitals
                return (
                  <div key={c.id} className="card card-sm" style={{borderLeft:'4px solid ' + st.color}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:'1rem',alignItems:'start'}}>
                      <div>
                        <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'.375rem'}}>
                          <h3>{c.patient_first_name} {c.patient_last_name}</h3>
                          <span style={{background:st.color+'20',color:st.color,fontSize:'.75rem',fontWeight:700,padding:'2px 8px',borderRadius:'99px'}}>{st.label}</span>
                          <TypeBadge type={c.consultation_type || 'video'} />
                          {c.acc_eligible === 'yes' && <span className="badge badge-info">ACC</span>}
                        </div>
                        <p style={{fontSize:'.9375rem',color:'var(--text)',marginBottom:'.375rem',lineHeight:1.5}}>{c.chief_complaint}</p>
                        <div style={{display:'flex',gap:'1rem',flexWrap:'wrap'}}>
                          <span style={{fontSize:'.8125rem',color:'var(--muted)'}}>📍 {c.patient_location}</span>
                          <span style={{fontSize:'.8125rem',color:'var(--muted)'}}>🕒 {timeAgo(c.created_at)}</span>
                          {v && !v.skipped && <>
                            {v.hr && <span style={{fontSize:'.8125rem',color:'var(--success)',fontWeight:600}}>❤️ {v.hr} bpm</span>}
                            {v.rr && <span style={{fontSize:'.8125rem',color:'var(--teal)',fontWeight:600}}>🫁 {v.rr} br/min</span>}
                          </>}
                        </div>
                      </div>
                      <div style={{display:'flex',gap:'.5rem'}}>
                        <button className="btn btn-primary btn-sm" disabled={joiningId === c.id} onClick={() => startConsult(c)}>
                          {joiningId === c.id ? 'Starting…' : 'Start →'}
                        </button>
                        <button onClick={() => dismissConsult(c.id)}
                          style={{background:'none',border:'1px solid #FECACA',color:'#DC2626',padding:'6px 10px',borderRadius:'var(--radius-sm)',cursor:'pointer',fontSize:'.75rem',fontWeight:600,fontFamily:'Plus Jakarta Sans,sans-serif'}}>
                          ✕
                        </button>
                      </div>
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
        {dashTab === 'approvals' && isSupervisor && <ApprovalsTab onBadgeChange={setApprovalBadge} />}

      </div>
    </div>
  )
}
