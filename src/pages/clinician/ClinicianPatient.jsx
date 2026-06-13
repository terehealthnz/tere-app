import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { getPatientConsultations, updatePatient } from '../../lib/supabase'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'

function InfoRow({ label, value }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: '.625rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: '.9375rem', color: NAVY, lineHeight: 1.5 }}>{value}</div>
    </div>
  )
}

export default function ClinicianPatient() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [consult, setConsult]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [starting, setStarting]   = useState(false)
  const [patient, setPatient]     = useState(null)
  const [history, setHistory]     = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [noteModal, setNoteModal] = useState(null) // holds a past consultation record
  const [editField, setEditField] = useState(null) // 'medications' | 'allergies' | 'history'
  const [editValue, setEditValue] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const displayName = sessionStorage.getItem('providerDisplayName') || 'Provider'
  const providerId  = sessionStorage.getItem('providerId')
  const lockedRef   = useRef(false)
  const sbRef       = useRef(null)

  useEffect(() => {
    if (!sessionStorage.getItem('clinicianAuth')) navigate('/clinician')
  }, [navigate])

  // Pre-load supabase client so we can use it synchronously in cleanup
  useEffect(() => {
    import('../../lib/supabase').then(m => { sbRef.current = m.supabase })
  }, [])

  async function unlock() {
    if (!lockedRef.current || !sbRef.current) return
    lockedRef.current = false
    await sbRef.current.from('consultations')
      .update({ status: 'waiting', provider_display_name: null, provider_id: null })
      .eq('id', id)
      .eq('status', 'reviewing')
      .eq('provider_id', providerId)
  }

  // Unlock on unmount (catches browser back button and tab close)
  useEffect(() => {
    return () => {
      if (!lockedRef.current || !sbRef.current) return
      lockedRef.current = false
      sbRef.current.from('consultations')
        .update({ status: 'waiting', provider_display_name: null, provider_id: null })
        .eq('id', id)
        .eq('status', 'reviewing')
        .eq('provider_id', providerId)
        .then(() => {})
    }
  }, [id, providerId])

  useEffect(() => {
    async function load() {
      try {
        const { supabase } = await import('../../lib/supabase')
        if (!sbRef.current) sbRef.current = supabase
        const { data } = await supabase.from('consultations').select('*').eq('id', id).single()
        setConsult(data)
        // Lock the consultation so other providers see it as being reviewed
        if (data && ['vitals_complete', 'ready'].includes(data.status)) {
          const { error } = await supabase.from('consultations')
            .update({ status: 'reviewing', provider_display_name: displayName, provider_id: providerId })
            .eq('id', id)
            .in('status', ['vitals_complete', 'ready'])
          if (!error) { lockedRef.current = true; setConsult(c => ({ ...c, status: 'reviewing' })) }
        }
        if (data?.patient_id) {
          const [{ data: pt }, pastConsults] = await Promise.all([
            supabase.from('patients').select('*').eq('id', data.patient_id).single(),
            getPatientConsultations(data.patient_id, 10),
          ])
          setPatient(pt || null)
          setHistory(pastConsults.filter(c => c.id !== id))
        }
      } catch {} finally { setLoading(false) }
    }
    if (id) load()
  }, [id])

  async function startCall() {
    if (!consult) return
    setStarting(true)
    try {
      await apiFetch('/api/initiate-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultationId: id, providerId, providerName: displayName }),
      })
    } catch {}
    navigate(`/provider/consult/${id}`)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: '#F7F5F0' }}>
      <div className="spinner" />
    </div>
  )

  if (!consult) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', flexDirection: 'column', gap: '1rem', fontFamily: FF, padding: '2rem', textAlign: 'center' }}>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: NAVY }}>Patient not found</div>
      <button onClick={() => navigate('/provider')} style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 99, padding: '.75rem 1.5rem', fontWeight: 700, cursor: 'pointer', fontFamily: FF }}>
        ← Back to Queue
      </button>
    </div>
  )

  const v = consult.vitals
  const typeIcon = consult.consultation_type === 'phone' ? '📞' : consult.consultation_type === 'message' ? '💬' : '📹'
  const isCallable = ['vitals_complete', 'ready', 'reviewing'].includes(consult.status)
  const isMessage = consult.consultation_type === 'message'

  return (
    <div style={{ minHeight: '100dvh', background: '#F7F5F0', fontFamily: FF }}>
      {/* Header */}
      <div style={{ background: NAVY, paddingTop: 'calc(.875rem + env(safe-area-inset-top))', paddingBottom: '.875rem', paddingLeft: '1.25rem', paddingRight: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button onClick={async () => { await unlock(); navigate('/provider') }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: '1.375rem', padding: 0, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center' }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Cormorant Garamond,Georgia,serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.1rem' }}>Tere</div>
          <div style={{ color: 'rgba(255,255,255,.55)', fontSize: '.75rem' }}>Patient details</div>
        </div>
      </div>

      <div style={{ padding: '1.25rem 1rem 6rem', maxWidth: 640, margin: '0 auto' }}>

        {/* Name + type */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '.875rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '.75rem' }}>
            <div>
              <div style={{ fontSize: '1.375rem', fontWeight: 700, color: NAVY, marginBottom: '.25rem' }}>
                {consult.patient_first_name} {consult.patient_last_name}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ background: '#EFF9F9', color: TEAL, fontSize: '.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>
                  {typeIcon} {consult.consultation_type}
                </span>
                {consult.acc_eligible === 'yes' && (
                  <span style={{ background: '#D4EEF0', color: TEAL, fontSize: '.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>✓ ACC</span>
                )}
                <span style={{ background: '#F3F4F6', color: '#6B7280', fontSize: '.6875rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99 }}>
                  {consult.status}
                </span>
              </div>
            </div>
          </div>

          {/* Chief complaint */}
          <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '1rem', borderLeft: `3px solid ${TEAL}` }}>
            <div style={{ fontSize: '.625rem', fontWeight: 700, color: TEAL, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.375rem' }}>Chief Complaint</div>
            <div style={{ fontSize: '.9375rem', color: NAVY, lineHeight: 1.6 }}>{consult.chief_complaint}</div>
          </div>
        </div>

        {/* Patient info */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '.875rem' }}>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem', marginBottom: '1rem' }}>Patient information</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <InfoRow label="Date of birth" value={consult.patient_dob ? new Date(consult.patient_dob).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' }) : null} />
            <InfoRow label="NHI" value={consult.patient_nhi} />
            <InfoRow label="Phone" value={consult.patient_phone} />
            <InfoRow label="Email" value={consult.patient_email} />
            <InfoRow label="Location" value={consult.patient_location} />
            <InfoRow label="GP" value={consult.gp_name ? `${consult.gp_name}${consult.gp_clinic ? ` — ${consult.gp_clinic}` : ''}` : null} />
            {consult.patient_allergies && consult.patient_allergies !== 'None' && (
              <div style={{ gridColumn: '1 / -1', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '.75rem 1rem' }}>
                <div style={{ fontSize: '.625rem', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.25rem' }}>⚠ Allergies</div>
                <div style={{ fontSize: '.9375rem', color: '#991B1B', fontWeight: 600 }}>{consult.patient_allergies}</div>
              </div>
            )}
            {consult.medications && (
              <div style={{ gridColumn: '1 / -1' }}>
                <InfoRow label="Current medications" value={consult.medications} />
              </div>
            )}
            {consult.medical_history && (
              <div style={{ gridColumn: '1 / -1' }}>
                <InfoRow label="Medical history" value={consult.medical_history} />
              </div>
            )}
          </div>
        </div>

        {/* Vitals */}
        {v && !v.skipped && (v.hr || v.rr || v.spo2) && (
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '.875rem' }}>
            <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem', marginBottom: '.875rem' }}>Vital signs</div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              {v.hr  && <div style={{ background: '#F0FDF4', borderRadius: 10, padding: '.75rem 1.25rem', textAlign: 'center' }}><div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669' }}>{v.hr}</div><div style={{ fontSize: '.6875rem', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>bpm</div></div>}
              {v.rr  && <div style={{ background: '#EFF9F9', borderRadius: 10, padding: '.75rem 1.25rem', textAlign: 'center' }}><div style={{ fontSize: '1.5rem', fontWeight: 700, color: TEAL }}>{v.rr}</div><div style={{ fontSize: '.6875rem', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>resp/min</div></div>}
              {v.spo2 ? (
                <div style={{ background: '#F5F3FF', borderRadius: 10, padding: '.75rem 1.25rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#7C3AED' }}>~{v.spo2}%</div>
                  <div style={{ fontSize: '.6875rem', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>SpO₂</div>
                  <div style={{ fontSize: '.625rem', color: '#9CA3AF', marginTop: 2 }}>camera est.</div>
                </div>
              ) : (
                <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '.75rem 1.25rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '.875rem', color: '#9CA3AF' }}>SpO₂ N/A</div>
                  <div style={{ fontSize: '.625rem', color: '#9CA3AF', marginTop: 2 }}>use oximeter if needed</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Editable patient record (medications / allergies / history from patients table) */}
        {patient && (() => {
          async function saveEdit(field, value) {
            setSavingEdit(true)
            const map = { medications: 'current_medications', allergies: 'allergies', history: 'medical_history' }
            try {
              await updatePatient(patient.id, { [map[field]]: value })
              setPatient(p => ({ ...p, [map[field]]: value }))
            } catch {}
            setSavingEdit(false)
            setEditField(null)
          }

          function EditableCard({ fieldKey, label, color, bg, borderColor, value }) {
            const isEditing = editField === fieldKey
            return (
              <div style={{ background: bg || 'white', borderRadius: 16, border: `1px solid ${borderColor || '#E2E8F0'}`, padding: '1.25rem', marginBottom: '.875rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.75rem' }}>
                  <div style={{ fontWeight: 700, color: color || NAVY, fontSize: '.9375rem' }}>{label}</div>
                  <button onClick={() => { setEditField(isEditing ? null : fieldKey); setEditValue(value || '') }}
                    style={{ background: 'none', border: 'none', color: TEAL, fontSize: '.8125rem', fontWeight: 600, cursor: 'pointer', fontFamily: FF }}>
                    {isEditing ? 'Cancel' : 'Edit'}
                  </button>
                </div>
                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <textarea
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      rows={4}
                      style={{ width: '100%', padding: '.625rem .75rem', border: '1.5px solid #D1D5DB', borderRadius: 8, fontFamily: FF, fontSize: '.9rem', resize: 'vertical', boxSizing: 'border-box' }}
                    />
                    <button onClick={() => saveEdit(fieldKey, editValue)} disabled={savingEdit}
                      style={{ alignSelf: 'flex-end', background: TEAL, color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: '.875rem', cursor: 'pointer', fontFamily: FF, opacity: savingEdit ? .6 : 1 }}>
                      {savingEdit ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: '.9375rem', color: color || NAVY, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{value || <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>None recorded</span>}</div>
                )}
              </div>
            )
          }

          return (
            <>
              <EditableCard fieldKey="allergies" label="⚠ Allergies" color="#991B1B" bg="#FEF2F2" borderColor="#FECACA" value={patient.allergies} />
              <EditableCard fieldKey="medications" label="Current medications" value={patient.current_medications} />
              <EditableCard fieldKey="history" label="Medical history" value={patient.medical_history} />
            </>
          )
        })()}

        {/* Past Tere consultations */}
        {history.length > 0 && (
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '.875rem' }}>
            <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem', marginBottom: '1rem' }}>
              Past Tere consultations ({history.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              {history.map(c => (
                <button key={c.id} onClick={() => setNoteModal(c)}
                  style={{ background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0', padding: '.875rem 1rem', cursor: 'pointer', textAlign: 'left', fontFamily: FF, display: 'flex', alignItems: 'center', gap: '1rem', width: '100%' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.8125rem', fontWeight: 600, color: NAVY, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.chief_complaint}</div>
                    <div style={{ fontSize: '.75rem', color: '#6B7280' }}>
                      {new Date(c.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {c.provider_display_name ? ` · ${c.provider_display_name}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                    {c.prescription_issued && <span style={{ background: '#EFF9F9', color: TEAL, fontSize: '.625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99 }}>Rx</span>}
                    {c.referral_issued && <span style={{ background: '#F5F3FF', color: '#7C3AED', fontSize: '.625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99 }}>Xr</span>}
                    {c.notes_final && <span style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>→</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Note detail modal */}
        {noteModal && (() => {
          let parsed = null
          try { parsed = typeof noteModal.notes_final === 'string' ? JSON.parse(noteModal.notes_final) : noteModal.notes_final } catch {}
          const actions = parsed?.actions || []
          const rxItems = actions.filter(a => a.type === 'prescription')
          const xrItems = actions.filter(a => a.type === 'radiology')
          const s = parsed?.sections || {}
          return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,43,69,.7)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
              onClick={e => { if (e.target === e.currentTarget) setNoteModal(null) }}>
              <div style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 640, maxHeight: '90dvh', display: 'flex', flexDirection: 'column' }}>
                {/* Modal header */}
                <div style={{ padding: '1.25rem 1.25rem .75rem', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '.75rem', color: '#6B7280', marginBottom: '.25rem' }}>
                        {new Date(noteModal.created_at).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                        {noteModal.provider_display_name ? ` · ${noteModal.provider_display_name}` : ''}
                      </div>
                      <div style={{ fontWeight: 700, color: NAVY, fontSize: '1rem', lineHeight: 1.4 }}>{noteModal.chief_complaint}</div>
                    </div>
                    <button onClick={() => setNoteModal(null)} style={{ background: '#F3F4F6', border: 'none', borderRadius: 99, width: 32, height: 32, cursor: 'pointer', fontSize: '1rem', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                  </div>
                  {/* Rx / Xr badges */}
                  {(rxItems.length > 0 || xrItems.length > 0) && (
                    <div style={{ display: 'flex', gap: 6, marginTop: '.75rem', flexWrap: 'wrap' }}>
                      {rxItems.map((rx, i) => (
                        <span key={i} style={{ background: '#EFF9F9', color: TEAL, fontSize: '.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 99 }}>
                          Rx: {rx.medication || rx.drug || rx.name || 'Prescription'}
                        </span>
                      ))}
                      {xrItems.map((xr, i) => (
                        <span key={i} style={{ background: '#F5F3FF', color: '#7C3AED', fontSize: '.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 99 }}>
                          Xr: {xr.type_of_scan || xr.body_part || xr.name || 'Radiology'}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Outcome + work capacity */}
                  {parsed?.outcome && (
                    <div style={{ display: 'flex', gap: 6, marginTop: rxItems.length || xrItems.length ? '.375rem' : '.75rem', flexWrap: 'wrap' }}>
                      <span style={{ background: '#F0FDF4', color: '#059669', fontSize: '.75rem', fontWeight: 600, padding: '3px 10px', borderRadius: 99 }}>
                        {parsed.outcome.replace(/_/g, ' ')}
                      </span>
                      {parsed.workCapacity && parsed.workCapacity !== 'fit' && (
                        <span style={{ background: '#FEF3C7', color: '#D97706', fontSize: '.75rem', fontWeight: 600, padding: '3px 10px', borderRadius: 99 }}>
                          {parsed.workCapacity}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {/* Modal body — scrollable */}
                <div style={{ overflowY: 'auto', padding: '1rem 1.25rem 2rem', flex: 1 }}>
                  {parsed?.noteText ? (
                    <div style={{ fontSize: '.875rem', color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{parsed.noteText}</div>
                  ) : parsed ? (
                    [
                      { key: 'presentingHistory', label: 'Presenting history' },
                      { key: 'mdm', label: 'Medical decision making' },
                      { key: 'plan', label: 'Plan' },
                      { key: 'socialHistory', label: 'Social history' },
                    ].filter(({ key }) => s[key]).map(({ key, label }) => (
                      <div key={key} style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#9CA3AF', marginBottom: '.375rem' }}>{label}</div>
                        <div style={{ fontSize: '.875rem', color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{s[key]}</div>
                      </div>
                    ))
                  ) : noteModal.notes_final ? (
                    <div style={{ fontSize: '.875rem', color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{noteModal.notes_final}</div>
                  ) : (
                    <div style={{ color: '#9CA3AF', fontStyle: 'italic', textAlign: 'center', padding: '2rem' }}>No finalised notes for this visit</div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Bottom action bar */}
      {isCallable && !isMessage && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid #E2E8F0', padding: '1rem', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))', display: 'flex', gap: '.75rem', maxWidth: 640, margin: '0 auto' }}>
          <button onClick={async () => { await unlock(); navigate('/provider') }} style={{ background: 'white', border: '1.5px solid #D1D5DB', color: '#6B7280', borderRadius: 12, padding: '14px 20px', fontWeight: 600, fontSize: '.9375rem', cursor: 'pointer', fontFamily: FF }}>
            ← Back
          </button>
          <button
            onClick={startCall}
            disabled={starting}
            style={{ flex: 1, background: starting ? '#9CA3AF' : TEAL, color: 'white', border: 'none', borderRadius: 12, padding: '14px', fontWeight: 700, fontSize: '1rem', cursor: starting ? 'not-allowed' : 'pointer', fontFamily: FF, minHeight: 56 }}
          >
            {starting ? 'Connecting…' : consult.consultation_type === 'phone' ? '📞 Start phone call' : '📹 Start video call'}
          </button>
        </div>
      )}

      {/* Message consultation — open in full notes view */}
      {isCallable && isMessage && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid #E2E8F0', padding: '1rem', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))', maxWidth: 640, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: '.75rem' }}>
            <button onClick={async () => { await unlock(); navigate('/provider') }} style={{ background: 'white', border: '1.5px solid #D1D5DB', color: '#6B7280', borderRadius: 12, padding: '12px 16px', fontWeight: 600, fontSize: '.9375rem', cursor: 'pointer', fontFamily: FF }}>
              ← Back
            </button>
            <button
              onClick={() => navigate(`/provider/notes/${id}`)}
              style={{ flex: 1, background: TEAL, color: 'white', border: 'none', borderRadius: 12, padding: '12px', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', fontFamily: FF, minHeight: 56 }}
            >
              💬 Review &amp; respond
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
