import React, { useState, useEffect, useCallback } from 'react'
import { getPatients, getPatient, getPatientConsultations, updatePatient, mergePatients } from '../../lib/supabase'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'

function Badge({ children, color = '#6B7280', bg = '#F3F4F6' }) {
  return (
    <span style={{ background: bg, color, fontSize: '.6875rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99, flexShrink: 0 }}>
      {children}
    </span>
  )
}

// Builds the ordered list of phases a visit passed through, using the
// timestamps that _are_ set (created_at, patient_joined_at, started_at,
// notes_finalised_at, completed_at) plus the current status to infer
// milestones that don't have their own column (e.g. "paid" only exists
// as a status transition from payment_pending → waiting). If the current
// status is one of the terminal-abandonment values (`payment_pending`,
// `abandoned`, `no_show`, `expired`) we tag the last-reached phase as
// where the patient dropped off.
function buildJourney(c) {
  const fmt = (t) => t ? new Date(t).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null
  const status = String(c.status || '').toLowerCase()
  const paid = !!(c.payment_amount && c.payment_amount > 0) || ['waiting','vitals_requested','vitals_complete','ready','in_progress','completed'].includes(status)
  const steps = [
    { key: 'triage',    label: 'Triage',    at: fmt(c.created_at) },
    { key: 'payment',   label: 'Payment',   at: paid ? '✓' : null },
    { key: 'waiting',   label: 'Waiting',   at: fmt(c.patient_joined_at) || (['waiting','vitals_requested','vitals_complete','ready','in_progress','completed'].includes(status) ? '✓' : null) },
    { key: 'consult',   label: 'In consult', at: fmt(c.started_at) || (status === 'in_progress' || status === 'completed' ? '✓' : null) },
    { key: 'completed', label: 'Completed', at: fmt(c.completed_at) || fmt(c.notes_finalised_at) },
  ]
  const reached = steps.map(s => !!s.at)
  const lastReachedIdx = reached.lastIndexOf(true)
  const isAbandoned = !reached[reached.length - 1] && ['draft','payment_pending','abandoned','no_show','expired'].includes(status)
  return { steps, lastReachedIdx, isAbandoned, status }
}

function JourneyTimeline({ consult }) {
  const { steps, lastReachedIdx, isAbandoned } = buildJourney(consult)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, flexWrap: 'wrap', margin: '.25rem 0 .5rem' }}>
      {steps.map((s, i) => {
        const reached = !!s.at
        const isStuck = isAbandoned && i === lastReachedIdx
        const dotColor = reached ? (isStuck ? '#DC2626' : '#0B6E76') : '#E2E8F0'
        return (
          <React.Fragment key={s.key}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 64 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, marginBottom: 4 }} />
              <div style={{ fontSize: '.6875rem', fontWeight: 700, color: reached ? '#374151' : '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.03em' }}>{s.label}</div>
              <div style={{ fontSize: '.6875rem', color: '#6B7280', marginTop: 1 }}>{s.at || '—'}</div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: '0 0 24px', height: 2, background: reached && steps[i + 1].at ? '#0B6E76' : '#E2E8F0', marginTop: 4 }} />
            )}
          </React.Fragment>
        )
      })}
      {isAbandoned && (
        <div style={{ fontSize: '.6875rem', fontWeight: 700, color: '#991B1B', background: '#FEE2E2', padding: '2px 7px', borderRadius: 99, alignSelf: 'center', marginLeft: '.5rem' }}>
          Abandoned at {steps[lastReachedIdx]?.label?.toLowerCase() || 'triage'}
        </div>
      )}
    </div>
  )
}

function EditableField({ label, value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(value || '')
  const [saving, setSaving]   = useState(false)

  async function save() {
    setSaving(true)
    await onSave(draft)
    setSaving(false)
    setEditing(false)
  }

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.25rem' }}>
        <div style={{ fontSize: '.625rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
        <button onClick={() => { setEditing(!editing); setDraft(value || '') }}
          style={{ background: 'none', border: 'none', color: TEAL, fontSize: '.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: FF }}>
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3}
            style={{ width: '100%', padding: '.5rem .625rem', border: '1.5px solid #D1D5DB', borderRadius: 7, fontFamily: FF, fontSize: '.875rem', resize: 'vertical', boxSizing: 'border-box' }} />
          <button onClick={save} disabled={saving}
            style={{ alignSelf: 'flex-end', background: TEAL, color: 'white', border: 'none', borderRadius: 7, padding: '6px 14px', fontWeight: 700, fontSize: '.8125rem', cursor: 'pointer', fontFamily: FF, opacity: saving ? .6 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      ) : (
        <div style={{ fontSize: '.9375rem', color: NAVY, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
          {value || <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>—</span>}
        </div>
      )}
    </div>
  )
}

function PatientProfile({ patientId, onClose, onMerge }) {
  const [patient, setPatient]   = useState(null)
  const [history, setHistory]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [mergeMode, setMergeMode]   = useState(false)
  const [mergeTarget, setMergeTarget] = useState('')
  const [merging, setMerging]   = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [pt, hist] = await Promise.all([
          getPatient(patientId),
          getPatientConsultations(patientId, 20),
        ])
        setPatient(pt)
        setHistory(hist)
      } catch {} finally { setLoading(false) }
    }
    load()
  }, [patientId])

  async function save(field, value) {
    await updatePatient(patientId, { [field]: value })
    setPatient(p => ({ ...p, [field]: value }))
  }

  async function doMerge() {
    if (!mergeTarget.trim()) return
    setMerging(true)
    try {
      await mergePatients(patientId, mergeTarget.trim())
      onMerge()
    } catch(e) { alert('Merge failed: ' + (e?.message || e)) }
    setMerging(false)
  }

  if (loading) return (
    <div style={{ padding: '3rem', textAlign: 'center', color: '#9CA3AF' }}>Loading…</div>
  )
  if (!patient) return (
    <div style={{ padding: '3rem', textAlign: 'center', color: '#9CA3AF' }}>Patient not found</div>
  )

  const dob = patient.date_of_birth
    ? new Date(patient.date_of_birth).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'

  return (
    <div style={{ fontFamily: FF }}>
      {/* Back button */}
      <button onClick={onClose}
        style={{ background: 'none', border: 'none', color: TEAL, fontSize: '.875rem', fontWeight: 600, cursor: 'pointer', fontFamily: FF, padding: '.25rem 0', marginBottom: '.75rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        ← Back to patients
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <div style={{ fontSize: '1.375rem', fontWeight: 700, color: NAVY }}>
            {patient.first_name} {patient.last_name}
          </div>
          <div style={{ fontSize: '.875rem', color: '#6B7280', marginTop: 2 }}>
            {dob}
            {patient.nhi ? ` · NHI: ${patient.nhi}` : ''}
            {patient.total_consultations ? ` · ${patient.total_consultations} visit${patient.total_consultations === 1 ? '' : 's'}` : ''}
          </div>
        </div>
      </div>

      {/* Badges */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {patient.research_consent && <Badge color="#065F46" bg="#D1FAE5">Research consent ✓</Badge>}
        {patient.preferred_language && patient.preferred_language !== 'en' && <Badge color={TEAL} bg="#EFF9F9">{patient.preferred_language.toUpperCase()}</Badge>}
        {patient.last_consultation_at && (
          <Badge color="#6B7280" bg="#F3F4F6">
            Last seen {new Date(patient.last_consultation_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
          </Badge>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Left column */}
        <div>
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem', marginBottom: '1rem' }}>Contact</div>
            <EditableField label="Phone"  value={patient.phone}  onSave={v => save('phone', v)} />
            <EditableField label="Email"  value={patient.email}  onSave={v => save('email', v)} />
            <EditableField label="NHI"    value={patient.nhi}    onSave={v => save('nhi', v)} />
          </div>

          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem', marginBottom: '1rem' }}>Healthcare</div>
            <EditableField label="GP"       value={patient.gp_name}     onSave={v => save('gp_name', v)} />
            <EditableField label="GP clinic" value={patient.gp_clinic}  onSave={v => save('gp_clinic', v)} />
            <EditableField label="Pharmacy" value={patient.pharmacy_name} onSave={v => save('pharmacy_name', v)} />
          </div>

          <div style={{ background: '#FEF2F2', borderRadius: 12, border: '1px solid #FECACA', padding: '1.25rem', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 700, color: '#991B1B', fontSize: '.9375rem', marginBottom: '1rem' }}>⚠ Allergies</div>
            <EditableField label="" value={patient.allergies} onSave={v => save('allergies', v)} />
          </div>
        </div>

        {/* Right column */}
        <div>
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem', marginBottom: '1rem' }}>Current medications</div>
            <EditableField label="" value={patient.current_medications} onSave={v => save('current_medications', v)} />
          </div>

          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem', marginBottom: '1rem' }}>Medical history</div>
            <EditableField label="" value={patient.medical_history} onSave={v => save('medical_history', v)} />
          </div>
        </div>
      </div>

      {/* Past consultations */}
      {history.length > 0 && (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem', marginBottom: '1rem' }}>
            Consultation history ({history.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            {history.map(c => (
              <div key={c.id} style={{ background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                <button onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  style={{ width: '100%', background: 'none', border: 'none', padding: '.75rem 1rem', cursor: 'pointer', textAlign: 'left', fontFamily: FF }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.75rem', marginBottom: '.5rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '.875rem', fontWeight: 600, color: NAVY, marginBottom: 2 }}>{c.chief_complaint || <span style={{ fontStyle: 'italic', color: '#9CA3AF' }}>No chief complaint captured</span>}</div>
                      <div style={{ fontSize: '.75rem', color: '#6B7280' }}>
                        {new Date(c.created_at).toLocaleString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        {c.provider_display_name ? ` · ${c.provider_display_name}` : ''}
                        {c.acc_read_code ? ` · ${c.acc_read_code}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {c.prescription_issued && <Badge color={TEAL} bg="#EFF9F9">Rx</Badge>}
                      {c.referral_issued && <Badge color="#7C3AED" bg="#F5F3FF">Ref</Badge>}
                      {c.gp_letter_sent_at && <Badge color="#065F46" bg="#D1FAE5">GP letter</Badge>}
                    </div>
                    <span style={{ color: '#9CA3AF', fontSize: '.75rem' }}>{expandedId === c.id ? '▲' : '▼'}</span>
                  </div>
                  <JourneyTimeline consult={c} />
                </button>
                {expandedId === c.id && c.notes_final && (
                  <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.04em', margin: '.5rem 0 .25rem' }}>Finalised notes</div>
                    <div style={{ fontSize: '.875rem', color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{c.notes_final}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Merge duplicates */}
      <div style={{ background: '#FFFBEB', borderRadius: 12, border: '1px solid #FDE68A', padding: '1.25rem', marginBottom: '1rem' }}>
        <div style={{ fontWeight: 700, color: '#92400E', fontSize: '.9375rem', marginBottom: '.5rem' }}>Merge duplicate records</div>
        <div style={{ fontSize: '.8125rem', color: '#78350F', marginBottom: '.75rem' }}>
          Merge another patient ID into this record. All their consultations will be reassigned here and the duplicate deleted.
        </div>
        {!mergeMode ? (
          <button onClick={() => setMergeMode(true)}
            style={{ background: '#F59E0B', color: 'white', border: 'none', borderRadius: 7, padding: '7px 14px', fontWeight: 700, fontSize: '.8125rem', cursor: 'pointer', fontFamily: FF }}>
            Merge patients…
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={mergeTarget}
              onChange={e => setMergeTarget(e.target.value)}
              placeholder="Secondary patient UUID to merge in"
              style={{ flex: 1, minWidth: 200, padding: '.5rem .75rem', border: '1.5px solid #FDE68A', borderRadius: 7, fontFamily: FF, fontSize: '.875rem' }}
            />
            <button onClick={doMerge} disabled={merging || !mergeTarget.trim()}
              style={{ background: '#DC2626', color: 'white', border: 'none', borderRadius: 7, padding: '7px 14px', fontWeight: 700, fontSize: '.8125rem', cursor: 'pointer', fontFamily: FF, opacity: merging ? .6 : 1 }}>
              {merging ? 'Merging…' : 'Confirm merge'}
            </button>
            <button onClick={() => { setMergeMode(false); setMergeTarget('') }}
              style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontFamily: FF, fontSize: '.875rem' }}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AdminPatients({ embedded }) {
  const [patients, setPatients]   = useState([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [offset, setOffset]       = useState(0)
  const [selected, setSelected]   = useState(null) // patient id
  const LIMIT = 25

  const load = useCallback(async (q = search, off = offset) => {
    setLoading(true)
    try {
      const { data, count } = await getPatients({ search: q, limit: LIMIT, offset: off })
      setPatients(data)
      setTotal(count)
    } catch {} finally { setLoading(false) }
  }, [search, offset])

  useEffect(() => { load() }, [])

  function handleSearch(e) {
    setSearch(e.target.value)
    setOffset(0)
    load(e.target.value, 0)
  }

  const card = { background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden' }

  if (selected) return (
    <div style={{ ...(embedded ? {} : { padding: '1.5rem', maxWidth: 1100, margin: '0 auto' }) }}>
      <PatientProfile
        patientId={selected}
        onClose={() => setSelected(null)}
        onMerge={() => { setSelected(null); load() }}
      />
    </div>
  )

  return (
    <div style={{ ...(embedded ? {} : { padding: '1.5rem', maxWidth: 1100, margin: '0 auto' }) }}>
      {/* Search + count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={handleSearch}
          placeholder="Search by name, phone, email or NHI…"
          style={{ flex: 1, minWidth: 220, padding: '.625rem .875rem', border: '1.5px solid #E2E8F0', borderRadius: 8, fontFamily: FF, fontSize: '.9rem', outline: 'none' }}
        />
        <div style={{ fontSize: '.875rem', color: '#6B7280', whiteSpace: 'nowrap' }}>
          {total.toLocaleString()} patient{total !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Table */}
      <div style={card}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#9CA3AF' }}>Loading…</div>
        ) : patients.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#9CA3AF' }}>
            {search ? 'No patients match that search.' : 'No patient records yet. Run supabase-patients-migration.sql to back-fill from existing consultations.'}
          </div>
        ) : (
          <>
            {/* Desktop table header */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1.1fr) minmax(0, .9fr) minmax(0, 1.1fr) minmax(0, .8fr) minmax(0, 1fr) minmax(0, .7fr)', columnGap: '1rem', padding: '.75rem 1.25rem', borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
              {['Name', 'DOB', 'NHI', 'Phone', 'Total visits', 'Last visit', 'Research'].map(h => (
                <div key={h} style={{ fontSize: '.6875rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</div>
              ))}
            </div>
            {patients.map(p => (
              <button key={p.id} onClick={() => setSelected(p.id)}
                style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1.1fr) minmax(0, .9fr) minmax(0, 1.1fr) minmax(0, .8fr) minmax(0, 1fr) minmax(0, .7fr)', columnGap: '1rem', padding: '1rem 1.25rem', borderBottom: '1px solid #F1F5F9', width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: FF, transition: 'background .1s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: NAVY, fontSize: '.9375rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.first_name} {p.last_name}</div>
                  <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.email || '—'}</div>
                </div>
                <div style={{ fontSize: '.875rem', color: '#374151', alignSelf: 'center', whiteSpace: 'nowrap' }}>
                  {p.date_of_birth ? new Date(p.date_of_birth).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                </div>
                <div style={{ fontSize: '.875rem', color: '#374151', alignSelf: 'center', whiteSpace: 'nowrap' }}>{p.nhi || '—'}</div>
                <div style={{ fontSize: '.875rem', color: '#374151', alignSelf: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.phone || '—'}</div>
                <div style={{ fontSize: '.875rem', color: '#374151', alignSelf: 'center', whiteSpace: 'nowrap' }}>{p.total_consultations || 0}</div>
                <div style={{ fontSize: '.875rem', color: '#374151', alignSelf: 'center', whiteSpace: 'nowrap' }}>
                  {p.last_consultation_at
                    ? new Date(p.last_consultation_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
                    : '—'}
                </div>
                <div style={{ alignSelf: 'center' }}>
                  {p.research_consent
                    ? <span style={{ background: '#D1FAE5', color: '#065F46', fontSize: '.6875rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>Yes</span>
                    : <span style={{ background: '#F3F4F6', color: '#9CA3AF', fontSize: '.6875rem', fontWeight: 600, padding: '2px 7px', borderRadius: 99 }}>No</span>}
                </div>
              </button>
            ))}

            {/* Pagination */}
            {total > LIMIT && (
              <div style={{ padding: '1rem 1.25rem', display: 'flex', gap: '.5rem', alignItems: 'center', justifyContent: 'flex-end', borderTop: '1px solid #F1F5F9' }}>
                <span style={{ fontSize: '.875rem', color: '#6B7280' }}>
                  {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
                </span>
                <button onClick={() => { const o = Math.max(0, offset - LIMIT); setOffset(o); load(search, o) }}
                  disabled={offset === 0}
                  style={{ background: 'none', border: '1.5px solid #E2E8F0', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: FF, fontSize: '.875rem', opacity: offset === 0 ? .4 : 1 }}>
                  ← Prev
                </button>
                <button onClick={() => { const o = offset + LIMIT; setOffset(o); load(search, o) }}
                  disabled={offset + LIMIT >= total}
                  style={{ background: 'none', border: '1.5px solid #E2E8F0', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: FF, fontSize: '.875rem', opacity: offset + LIMIT >= total ? .4 : 1 }}>
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
