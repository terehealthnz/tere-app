// CreateProviderTaskModal — admin-only modal fired from ClinicianPatient to
// queue a task against a prior completed consultation.
//
// Clinical safety rule: the parent-consult picker only shows this patient's
// completed consults with at least one prescription on file. Server double-
// checks + rejects stale parents (>12 months) and parents without an Rx when
// task_type is represcribe_request.
//
// Primary use case: represcribe_request — admin receives a patient call ("my
// GP wants me on the same meds for another month"), creates a task against the
// consult where the Rx was first written, provider actions it from the inbox.

import React, { useEffect, useMemo, useState } from 'react'
import { providerTasksApi, getPatientConsultations, getPatientPrescriptions } from '../../lib/supabase'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const AMBER = '#D97706'
const FF   = 'Plus Jakarta Sans, sans-serif'

const TASK_TYPES = [
  { value: 'represcribe_request', label: 'Represcribe request' },
  { value: 'review_result',       label: 'Review lab / imaging result' },
  { value: 'countersign_referral',label: 'Countersign referral' },
  { value: 'patient_callback',    label: 'Patient callback' },
  { value: 'other',               label: 'Other' },
]

const WARN_DAYS  = 90
const BLOCK_DAYS = 365

function daysSince(ts) {
  if (!ts) return 0
  return Math.round((Date.now() - new Date(ts).getTime()) / 86400000)
}

export default function CreateProviderTaskModal({ patient, onClose, onDone, defaultParentConsultId = null, defaultBody = '' }) {
  const [taskType,  setTaskType]  = useState('represcribe_request')
  const [title,     setTitle]     = useState('')
  const [body,      setBody]      = useState(defaultBody || '')
  const [priority,  setPriority]  = useState('normal')
  const [parentId,  setParentId]  = useState(defaultParentConsultId)

  const [consults,  setConsults]  = useState([])
  const [rxByConsult, setRxByConsult] = useState({})  // { consultation_id: [rx, rx] }
  const [loading,   setLoading]   = useState(true)
  const [loadErr,   setLoadErr]   = useState(null)

  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState(null)

  // Load this patient's prior consults + prescriptions once on open.
  // Picker only shows consults that have at least one Rx attached.
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [consultsRaw, rxRaw] = await Promise.all([
          getPatientConsultations(patient.id).catch(() => []),
          getPatientPrescriptions(patient.id).catch(() => []),
        ])
        if (cancelled) return
        const rxMap = {}
        for (const r of rxRaw || []) {
          const cid = r.consultation_id
          if (!cid) continue
          ;(rxMap[cid] = rxMap[cid] || []).push(r)
        }
        setRxByConsult(rxMap)
        // Only completed consults — exclude in_progress / waiting / cancelled drafts
        const completed = (consultsRaw || [])
          .filter(c => c.status === 'complete')
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        setConsults(completed)
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        setLoadErr(e.message || 'Failed to load consultations')
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [patient?.id])

  // Picker filter: for represcribe_request, only consults with ≥1 Rx.
  const pickable = useMemo(() => {
    if (taskType === 'represcribe_request') {
      return consults.filter(c => (rxByConsult[c.id] || []).length > 0)
    }
    return consults
  }, [consults, rxByConsult, taskType])

  // Suggested title based on task type + most-recent Rx (for represcribe)
  useEffect(() => {
    if (title) return  // don't overwrite admin's typing
    if (taskType === 'represcribe_request' && parentId) {
      const rx = (rxByConsult[parentId] || [])[0]
      if (rx?.drug) setTitle(`Please represcribe: ${rx.drug}`)
    } else if (taskType === 'review_result' && parentId) {
      setTitle('Please review result')
    } else if (taskType === 'patient_callback' && parentId) {
      setTitle('Please call patient back')
    }
    // deliberately NOT a dep on `title` so this only fires when parent/type change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskType, parentId])

  const parentConsult = useMemo(
    () => consults.find(c => c.id === parentId) || null,
    [consults, parentId]
  )
  const parentAgeDays = parentConsult ? daysSince(parentConsult.created_at) : 0
  const parentWarn    = parentAgeDays > WARN_DAYS && parentAgeDays <= BLOCK_DAYS
  const parentBlock   = parentAgeDays > BLOCK_DAYS

  const canSubmit =
    !submitting && !loading && !parentBlock &&
    parentId && title.trim().length >= 2 &&
    (taskType !== 'represcribe_request' || (rxByConsult[parentId] || []).length > 0)

  async function submit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true); setError(null)
    try {
      const { task, age_warn } = await providerTasksApi.create({
        patient_id: patient.id,
        parent_consultation_id: parentId,
        task_type: taskType,
        title: title.trim(),
        body: body.trim() || null,
        priority,
      })
      onDone?.(task, { age_warn })
      onClose?.()
    } catch (err) {
      setError(err.message || 'Failed to create task')
      setSubmitting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(13,43,69,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: FF }}>
      <form onSubmit={submit} style={{ background: 'white', borderRadius: 16, maxWidth: 520, width: '100%', padding: '1.5rem', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ fontWeight: 800, color: NAVY, fontSize: '1.1rem', marginBottom: 4 }}>Create provider task</div>
        <div style={{ fontSize: '.8rem', color: '#6B7280', marginBottom: 16 }}>
          <strong>{patient.first_name} {patient.last_name}</strong>
          {patient.nhi && <> · NHI {patient.nhi}</>}
        </div>

        {loadErr && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '.5rem .75rem', borderRadius: 8, fontSize: '.8125rem', marginBottom: 12 }}>
            {loadErr}
          </div>
        )}

        {/* Task type */}
        <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 700, color: NAVY, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Task type</label>
        <select value={taskType} onChange={e => { setTaskType(e.target.value); setParentId(null); setTitle('') }}
          style={{ width: '100%', padding: '.5rem .625rem', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: '.875rem', marginBottom: 14, fontFamily: FF }}>
          {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>

        {/* Parent consult picker */}
        <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 700, color: NAVY, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Attach to prior consultation
          {taskType === 'represcribe_request' && <span style={{ color: '#6B7280', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> · must have a prior Rx</span>}
        </label>
        {loading ? (
          <div style={{ fontSize: '.8125rem', color: '#6B7280', marginBottom: 14 }}>Loading consultations…</div>
        ) : pickable.length === 0 ? (
          <div style={{ background: '#FEF3C7', color: '#92400E', padding: '.625rem .75rem', borderRadius: 8, fontSize: '.8125rem', marginBottom: 14 }}>
            {taskType === 'represcribe_request'
              ? 'No prior completed consults with a prescription on file. Represcribe tasks need a parent consult that already has an Rx. If this patient has no prior Rx, route through a new consult instead.'
              : 'No prior completed consults on file for this patient.'}
          </div>
        ) : (
          <select value={parentId || ''} onChange={e => setParentId(e.target.value || null)} required
            style={{ width: '100%', padding: '.5rem .625rem', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: '.875rem', marginBottom: 6, fontFamily: FF }}>
            <option value="">— pick a prior consult —</option>
            {pickable.map(c => {
              const age = daysSince(c.created_at)
              const rxCount = (rxByConsult[c.id] || []).length
              const d = new Date(c.created_at).toLocaleDateString('en-NZ')
              const complaint = (c.chief_complaint || '').slice(0, 50)
              return (
                <option key={c.id} value={c.id} disabled={age > BLOCK_DAYS}>
                  {d} ({age}d ago) · {complaint}{rxCount > 0 ? ` · ${rxCount} Rx` : ''}{age > BLOCK_DAYS ? ' — TOO OLD' : ''}
                </option>
              )
            })}
          </select>
        )}

        {parentWarn && (
          <div style={{ background: '#FEF3C7', color: '#92400E', padding: '.5rem .75rem', borderRadius: 8, fontSize: '.75rem', marginBottom: 12 }}>
            ⚠ Parent consult is {parentAgeDays} days old. Consider whether a fresh clinical assessment is needed.
          </div>
        )}
        {parentBlock && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '.5rem .75rem', borderRadius: 8, fontSize: '.75rem', marginBottom: 12 }}>
            ✕ Parent consult is {parentAgeDays} days old — too stale to represcribe against. Create a new consultation.
          </div>
        )}

        {/* Title */}
        <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 700, color: NAVY, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 }}>Title</label>
        <input type="text" value={title} onChange={e => setTitle(e.target.value)} required maxLength={200}
          placeholder="e.g. Please represcribe metformin 500mg"
          style={{ width: '100%', padding: '.5rem .625rem', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: '.875rem', marginBottom: 14, fontFamily: FF }} />

        {/* Body */}
        <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 700, color: NAVY, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Notes (optional)</label>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} maxLength={4000}
          placeholder="Any extra context the provider needs"
          style={{ width: '100%', padding: '.5rem .625rem', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: '.875rem', marginBottom: 14, fontFamily: FF, resize: 'vertical' }} />

        {/* Priority */}
        <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 700, color: NAVY, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Priority</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {['normal', 'urgent'].map(p => (
            <button key={p} type="button" onClick={() => setPriority(p)}
              style={{
                flex: 1, padding: '.5rem', borderRadius: 8, border: priority === p ? `2px solid ${p === 'urgent' ? AMBER : TEAL}` : '1px solid #D1D5DB',
                background: priority === p ? (p === 'urgent' ? '#FEF3C7' : '#D4EEF0') : 'white',
                fontSize: '.8125rem', fontWeight: 700, color: priority === p ? (p === 'urgent' ? AMBER : TEAL) : '#6B7280',
                cursor: 'pointer', fontFamily: FF, textTransform: 'capitalize',
              }}>
              {p === 'urgent' ? '🚨 Urgent' : p}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '.5rem .75rem', borderRadius: 8, fontSize: '.8125rem', marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onClose} disabled={submitting}
            style={{ flex: 1, padding: '.625rem', borderRadius: 8, border: '1px solid #D1D5DB', background: 'white', fontWeight: 700, color: '#6B7280', cursor: 'pointer', fontFamily: FF }}>
            Cancel
          </button>
          <button type="submit" disabled={!canSubmit}
            style={{ flex: 2, padding: '.625rem', borderRadius: 8, border: 'none', background: canSubmit ? TEAL : '#9CA3AF', fontWeight: 700, color: 'white', cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: FF }}>
            {submitting ? 'Creating…' : 'Create task'}
          </button>
        </div>
      </form>
    </div>
  )
}
