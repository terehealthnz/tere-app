import React, { useState, useEffect, useRef, Suspense, lazy } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { getPatientConsultations, updatePatient, createPatient, getConsultation, updateConsultation, getPatient, getPatientPrescriptions, getPatientDocuments, uploadPatientDocument, deletePatientDocument, patientAllergensApi, patientMedicationsApi, patientConditionsApi } from '../../lib/supabase'
import EncounterActionBar from '../../components/clinician/EncounterActionBar'
import StructuredHistoryCard from '../../components/clinician/StructuredHistoryCard'
import SendBackToQueueModal from '../../components/clinician/SendBackToQueueModal'
import PatientAccessHistoryModal from '../../components/clinician/PatientAccessHistoryModal'
import AccConsultWidgets from '../../components/clinician/AccConsultWidgets'
import SupportPersonPrompt from '../../components/clinician/SupportPersonPrompt'
import IdVerificationPanel from '../../components/clinician/IdVerificationPanel'
import ChildSafeguardingPanel from '../../components/clinician/ChildSafeguardingPanel'
import ConsultBreakGlassPrompt from '../../components/clinician/ConsultBreakGlassPrompt'
// Lazy-load ProviderConsult only when a call actually starts — keeps
// LiveKit + tereScribe out of the ClinicianPatient initial bundle. Mounted
// in popupMode so it renders as the floating widget on top of the chart.
const ProviderConsult = lazy(() => import('./ProviderConsult'))
// Notes popup (task #218) — same lazy pattern. Provider clicks Complete
// Encounter and the notes modal appears on top of the chart.
const ProviderNotes = lazy(() => import('./ProviderNotes'))

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
  const [imaging, setImaging]     = useState([])
  const [hl7Reports, setHl7Reports] = useState([])
  const [radReferrals, setRadReferrals] = useState([])
  const [pastRx, setPastRx]       = useState([])
  const [documents, setDocuments] = useState([])
  const [allergens, setAllergens]     = useState([])
  const [medications, setMedications] = useState([])
  const [conditions, setConditions]   = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadFile, setUploadFile]   = useState(null)
  const [editField, setEditField] = useState(null) // 'medications' | 'allergies' | 'history'
  const [editValue, setEditValue] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [callError, setCallError] = useState(null)
  // When set, mounts <ProviderConsult popupMode /> which shows the floating
  // call widget on top of the chart. Setting to null unmounts it and ends
  // the call session (task #216).
  const [activeCall, setActiveCall] = useState(null)
  // When set, opens the ProviderNotes modal on top of the chart. Fired by
  // Complete Encounter (from the static bar OR from the post-call overlay
  // inside the call popup). Setting to null unmounts and returns focus.
  const [activeNotes, setActiveNotes] = useState(null)
  // Admin-only: send this patient back into the provider queue with a reason.
  // Fires SendBackToQueueModal, which handles reopen vs waiver + notification.
  const [sendBackOpen, setSendBackOpen] = useState(false)
  const [accessHistoryOpen, setAccessHistoryOpen] = useState(false)
  // Break-glass gate (task #414). When getConsultation throws with
  // requires_break_glass=true, we store the enriched context here and mount
  // ConsultBreakGlassPrompt. On grant we re-invoke the loader.
  const [breakGlass, setBreakGlass] = useState(null)
  const [loadAttempt, setLoadAttempt] = useState(0)

  const displayName = sessionStorage.getItem('providerDisplayName') || 'Provider'
  const providerId  = sessionStorage.getItem('providerId')
  const isAdmin     = sessionStorage.getItem('providerIsAdmin') === 'true'
  const lockedRef   = useRef(false)

  useEffect(() => {
    if (!sessionStorage.getItem('clinicianAuth')) navigate('/clinician')
  }, [navigate])

  // Pre-load supabase client so we can use it synchronously in cleanup
  async function unlock() {
    if (!lockedRef.current) return
    lockedRef.current = false
    try {
      await updateConsultation(id, {
        status: 'waiting', provider_display_name: null, provider_id: null,
      })
    } catch {}
  }

  // Unlock on unmount (catches browser back button and tab close)
  useEffect(() => {
    return () => {
      if (!lockedRef.current) return
      lockedRef.current = false
      updateConsultation(id, {
        status: 'waiting', provider_display_name: null, provider_id: null,
      }).catch(() => {})
    }
  }, [id, providerId])

  useEffect(() => {
    async function load() {
      try {
        let data
        try {
          data = await getConsultation(id)
        } catch (e) {
          if (e && e.requires_break_glass) {
            setBreakGlass({
              consultationId:  e.consultation_id || id,
              patientName:     e.patient_name || null,
              consultStatus:   e.consultation_status || null,
              consultCreated:  e.consultation_created || null,
            })
            setLoading(false)
            return
          }
          throw e
        }
        setBreakGlass(null)
        setConsult(data)
        // Audit: this provider just opened this chart. Providers get direct
        // clinical-care access (no PhiRevealGate reason prompt), but we still
        // want a record of who viewed which chart when. Fire-and-forget.
        try {
          apiFetch('/api/audit-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action:          'consult_opened',
              consultation_id: id,
              patient_ref:     data?.patient_nhi || null,
              resource_type:   'consultation',
              resource_id:     id,
              metadata:        { source: 'ClinicianPatient' },
            }),
          }).catch(() => {})
        } catch {}
        // Lock the consultation so other providers see it as being reviewed.
        // Note: since we now read then write via API, there's a small race window
        // if two providers open the same consult at the same second. Acceptable
        // for a soft lock — the queue re-syncs on realtime updates.
        if (data && ['vitals_complete', 'ready'].includes(data.status)) {
          try {
            await updateConsultation(id, {
              status: 'reviewing', provider_display_name: displayName, provider_id: providerId,
            })
            lockedRef.current = true
            setConsult(c => ({ ...c, status: 'reviewing' }))
          } catch {}
        }
        if (data?.patient_id) {
          const [pt, pastConsults, imagingRes, rx, docs, allg, meds, conds, hl7Res] = await Promise.all([
            getPatient(data.patient_id).catch(() => null),
            getPatientConsultations(data.patient_id),
            apiFetch(`/api/radiology-reports?patient_id=${encodeURIComponent(data.patient_id)}`)
              .then(r => r.json()).catch(() => ({ reports: [] })),
            getPatientPrescriptions(data.patient_id).catch(() => []),
            getPatientDocuments(data.patient_id).catch(() => []),
            patientAllergensApi.list(data.patient_id).catch(() => []),
            patientMedicationsApi.list(data.patient_id).catch(() => []),
            patientConditionsApi.list(data.patient_id).catch(() => []),
            apiFetch(`/api/provider-inbox?patient_id=${encodeURIComponent(data.patient_id)}`)
              .then(r => r.json()).catch(() => ({ messages: [] })),
          ])
          setPatient(pt || null)
          setHistory(pastConsults.filter(c => c.id !== id))
          setImaging(Array.isArray(imagingRes?.reports) ? imagingRes.reports : [])
          setPastRx(Array.isArray(rx) ? rx : [])
          setDocuments(Array.isArray(docs) ? docs : [])
          setAllergens(Array.isArray(allg) ? allg : [])
          setMedications(Array.isArray(meds) ? meds : [])
          setConditions(Array.isArray(conds) ? conds : [])
          setHl7Reports(Array.isArray(hl7Res?.messages) ? hl7Res.messages : [])
          // Radiology referrals ordered by any Tere provider for this patient.
          // Filtered by NHI on the server since radiology_referrals doesn't
          // have a patient_id FK yet (it uses NHI + name + DOB for matching).
          const nhi = pt?.nhi || data?.patient_nhi
          if (nhi) {
            apiFetch(`/api/radiology-referrals?patient_nhi=${encodeURIComponent(nhi)}&columns=id,created_at,investigation,urgency,clinical_indication,referral_status,approval_status,provider_name,result_received_at`)
              .then(r => r.json())
              .then(d => setRadReferrals(Array.isArray(d?.referrals) ? d.referrals : []))
              .catch(() => setRadReferrals([]))
          } else {
            setRadReferrals([])
          }
        }
      } catch {} finally { setLoading(false) }
    }
    if (id) { setLoading(true); load() }
  }, [id, loadAttempt])

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

  if (breakGlass) return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', flexDirection: 'column', gap: '1rem', fontFamily: FF, padding: '2rem', textAlign: 'center', background: '#F7F5F0' }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: NAVY }}>🚨 Off-queue chart</div>
        <div style={{ maxWidth: 420, fontSize: '.875rem', color: '#374151', lineHeight: 1.5 }}>
          This chart isn't in your active queue. Provide a break-glass justification to open it, or return to the queue.
        </div>
        <button onClick={() => navigate('/provider')} style={{ background: 'white', color: NAVY, border: '1px solid #E2E8F0', borderRadius: 99, padding: '.75rem 1.5rem', fontWeight: 700, cursor: 'pointer', fontFamily: FF }}>
          ← Back to Queue
        </button>
      </div>
      <ConsultBreakGlassPrompt
        open
        consultationId={breakGlass.consultationId}
        patientName={breakGlass.patientName}
        consultStatus={breakGlass.consultStatus}
        consultCreated={breakGlass.consultCreated}
        onCancel={() => navigate('/provider')}
        onGranted={() => setLoadAttempt(n => n + 1)}
      />
    </>
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
  // Callable includes 'waiting' (patient in room, hasn't run vitals) and
  // 'vitals_requested' (vitals prompt fired, still capturing). Previously the
  // Start-call button was hidden until vitals came back, but for phone-only
  // Playwright / low-camera-quality patients the vitals step can be skipped,
  // and providers still need to be able to open the call.
  const isCallable = ['waiting', 'vitals_requested', 'vitals_complete', 'ready', 'reviewing'].includes(consult.status)
  const isMessage = consult.consultation_type === 'message'

  return (
    <div style={{ minHeight: '100dvh', background: '#F7F5F0', fontFamily: FF }}>
      {/* Active call popup — mounted only when Call has been initiated.
          ProviderConsult(popupMode) renders as an invisible container that
          hosts LiveKit + FloatingCallWidget; the widget itself is
          position:fixed so it floats over the chart with the chart
          remaining fully interactive. onEnd fires on hangup, disconnect,
          Return to queue, or Complete Encounter — always unmounts the
          popup and keeps the provider on this patient page. */}
      {activeCall && (
        <Suspense fallback={null}>
          <ProviderConsult
            popupMode
            consultationId={id}
            onEnd={(result) => {
              setActiveCall(null)
              // Complete Encounter clicked in post-call overlay → open the
              // notes modal on this page (task #218) with the transcript +
              // actions the call surface accumulated. Everything stays on
              // the patient page — no navigation.
              if (result?.complete) {
                setActiveNotes({ actions: result.actions || [], transcript: result.transcript || '', callNotes: result.callNotes || '' })
              }
            }}
            onCapture={async (blob) => {
              // Video screenshot from the widget's 📸 button. Prompt for title,
              // ensure a patient row exists (lazy-create like the PMH cards),
              // upload as source='video_capture', prepend to the docs list.
              const title = window.prompt('Capture title (e.g. "Rash on left forearm"):', `Video capture ${new Date().toLocaleString('en-NZ')}`)
              if (!title) return
              try {
                let pid = patient?.id
                if (!pid) {
                  const pat = await createPatient({
                    firstName: consult.patient_first_name, lastName: consult.patient_last_name,
                    dob: consult.patient_dob, phone: consult.patient_phone,
                    email: consult.patient_email, nhi: consult.patient_nhi,
                  })
                  pid = pat?.id
                  if (pid) { await updateConsultation(id, { patient_id: pid }); setPatient(pat); setConsult(c => c ? { ...c, patient_id: pid } : c) }
                }
                if (!pid) throw new Error('Could not create/link patient record')
                const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' })
                const doc = await uploadPatientDocument({ patientId: pid, title, file, source: 'video_capture' })
                setDocuments(docs => [doc, ...docs])
              } catch (e) {
                alert(`Capture upload failed: ${e.message}`)
              }
            }}
          />
        </Suspense>
      )}
      {activeNotes && (
        <Suspense fallback={null}>
          <ProviderNotes
            popupMode
            consultationId={id}
            onEnd={() => setActiveNotes(null)}
          />
        </Suspense>
      )}
      {/* Header */}
      <div style={{ background: NAVY, paddingTop: 'calc(.875rem + env(safe-area-inset-top))', paddingBottom: '.875rem', paddingLeft: '1.25rem', paddingRight: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button onClick={async () => {
          if (activeCall && !window.confirm('You have a call in progress. Leaving this page will end the call. Continue?')) return
          await unlock(); navigate('/provider')
        }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: '1.375rem', padding: 0, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center' }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Cormorant Garamond,Georgia,serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.1rem' }}>Tere</div>
          <div style={{ color: 'rgba(255,255,255,.55)', fontSize: '.75rem' }}>Patient details</div>
        </div>
        {isAdmin && patient?.id && (
          <button onClick={() => setSendBackOpen(true)}
            style={{ background: 'rgba(255,255,255,.12)', color: 'white', border: '1px solid rgba(255,255,255,.25)', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: FF, fontWeight: 700, fontSize: '.75rem', whiteSpace: 'nowrap' }}>
            🔁 Send to queue
          </button>
        )}
      </div>

      {sendBackOpen && patient && (
        <SendBackToQueueModal
          patient={patient}
          onClose={() => setSendBackOpen(false)}
          onDone={() => { /* toast + refresh could go here later */ }}
        />
      )}

      <PatientAccessHistoryModal
        open={accessHistoryOpen}
        onClose={() => setAccessHistoryOpen(false)}
        patientNhi={consult?.patient_nhi}
        patientName={[consult?.patient_first_name, consult?.patient_last_name].filter(Boolean).join(' ')}
      />

      {consult && <SupportPersonPrompt consult={consult} onDone={async () => {
        try { const fresh = await getConsultation(id); if (fresh) setConsult(fresh) } catch {}
      }} />}

      <div style={{ padding: '1.25rem 1rem calc(11rem + env(safe-area-inset-bottom))', maxWidth: 640, margin: '0 auto' }}>

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

        {/* Patient identity verification (task #426) — provider attests
            person on camera matches NHI holder. Recorded per consult. */}
        <IdVerificationPanel
          consult={consult}
          onUpdated={async () => {
            try {
              const fresh = await getConsultation(id)
              if (fresh) setConsult(fresh)
            } catch {}
          }}
        />

        {/* Child safeguarding pathway (task #434) — required consenting-adult
            capture when patient is <18, plus a safeguarding-concern flag for
            any age patient. Runbook: docs/regulatory/child-safeguarding-oranga-tamariki-runbook.md */}
        <ChildSafeguardingPanel
          consult={consult}
          onUpdated={async () => {
            try {
              const fresh = await getConsultation(id)
              if (fresh) setConsult(fresh)
            } catch {}
          }}
        />

        {/* ACC widgets — only render when consult is ACC-billed. Populates
            the discrete fields the ACC audit bundle reads. */}
        <AccConsultWidgets
          consult={consult}
          onSaved={async () => {
            try {
              const fresh = await getConsultation(id)
              if (fresh) setConsult(fresh)
            } catch {}
          }}
        />

        {/* Patient info */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '.875rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem' }}>Patient information</div>
            {consult.patient_nhi && (
              <button onClick={() => setAccessHistoryOpen(true)}
                title="See who has accessed this patient's chart"
                style={{ background: 'white', border: '1px solid #E2E8F0', color: NAVY, padding: '4px 10px', borderRadius: 6, fontFamily: FF, fontSize: '.75rem', fontWeight: 700, cursor: 'pointer' }}>
                🔍 Access history
              </button>
            )}
          </div>
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
            <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem', marginBottom: '.875rem' }}>Estimated Vitals</div>
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

        {/* Vitals trend — combines current consult + past encounters, sorted
            newest first. Only rows that captured at least one vital appear.
            Simple table for spotting BP / HR / SpO₂ drift over time. */}
        {(() => {
          const rows = [
            ...(v && !v.skipped && (v.hr || v.rr || v.spo2 || v.bp || v.temperature) ? [{ date: consult.created_at, v, current: true }] : []),
            ...history
              .filter(c => c.vitals && !c.vitals.skipped && (c.vitals.hr || c.vitals.rr || c.vitals.spo2 || c.vitals.bp || c.vitals.temperature))
              .map(c => ({ date: c.created_at, v: c.vitals, current: false })),
          ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 12)
          if (rows.length < 2) return null
          return (
            <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '.875rem' }}>
              <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem', marginBottom: '.75rem' }}>
                Estimated Vitals trend <span style={{ fontWeight: 400, color: '#9CA3AF', fontSize: '.75rem' }}>· last {rows.length} encounter{rows.length === 1 ? '' : 's'}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8125rem', fontFamily: 'ui-monospace, Menlo, monospace', minWidth: 380 }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      <th style={{ textAlign: 'left', padding: '.5rem .625rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>Date</th>
                      <th style={{ textAlign: 'right', padding: '.5rem .625rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>HR</th>
                      <th style={{ textAlign: 'right', padding: '.5rem .625rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>RR</th>
                      <th style={{ textAlign: 'right', padding: '.5rem .625rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>SpO₂</th>
                      <th style={{ textAlign: 'right', padding: '.5rem .625rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>BP</th>
                      <th style={{ textAlign: 'right', padding: '.5rem .625rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>Temp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #F1F5F9', background: r.current ? '#F0F9FA' : 'transparent' }}>
                        <td style={{ padding: '.5rem .625rem', color: NAVY, fontFamily: FF, fontSize: '.75rem', whiteSpace: 'nowrap' }}>
                          {new Date(r.date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: '2-digit' })}
                          {r.current && <span style={{ marginLeft: 4, background: TEAL, color: 'white', fontSize: '.5625rem', fontWeight: 700, padding: '1px 5px', borderRadius: 99, verticalAlign: 'middle' }}>NOW</span>}
                        </td>
                        <td style={{ padding: '.5rem .625rem', textAlign: 'right', color: r.v.hr ? '#059669' : '#D1D5DB' }}>{r.v.hr || '—'}</td>
                        <td style={{ padding: '.5rem .625rem', textAlign: 'right', color: r.v.rr ? TEAL : '#D1D5DB' }}>{r.v.rr || '—'}</td>
                        <td style={{ padding: '.5rem .625rem', textAlign: 'right', color: r.v.spo2 ? '#7C3AED' : '#D1D5DB' }}>{r.v.spo2 ? `${r.v.spo2}%` : '—'}</td>
                        <td style={{ padding: '.5rem .625rem', textAlign: 'right', color: r.v.bp ? NAVY : '#D1D5DB' }}>{r.v.bp || '—'}</td>
                        <td style={{ padding: '.5rem .625rem', textAlign: 'right', color: r.v.temperature ? '#DC2626' : '#D1D5DB' }}>{r.v.temperature ? `${r.v.temperature}°` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: '.6875rem', color: '#9CA3AF', marginTop: '.5rem' }}>
                Newest first. Highlighted row = current encounter. SpO₂ shown for readings above the confidence threshold; camera-based BP is experimental and not clinically validated.
              </div>
            </div>
          )
        })()}

        {/* Structured patient history (task #223). Renders alongside the
            free-text EditableCards above during the transition. Once every
            patient has been reviewed and either structured-out or the
            free-text explicitly kept, a follow-up will remove the legacy
            EditableCards. All three sections lazy-create the patients row
            on first add if none exists (same pattern as EditableCard). */}
        {(() => {
          async function ensurePid() {
            if (patient?.id) return patient.id
            const pat = await createPatient({
              firstName: consult.patient_first_name, lastName: consult.patient_last_name,
              dob: consult.patient_dob, phone: consult.patient_phone,
              email: consult.patient_email, nhi: consult.patient_nhi,
            })
            if (!pat?.id) throw new Error('Could not create/link patient record')
            await updateConsultation(id, { patient_id: pat.id })
            setPatient(pat)
            setConsult(c => c ? { ...c, patient_id: pat.id } : c)
            return pat.id
          }
          return <>
            <StructuredHistoryCard
              title="🩹 Structured allergens"
              rows={allergens}
              primaryKey="allergen"
              summarise={r => [r.allergen_type, r.reaction, r.reaction_severity && `severity: ${r.reaction_severity}`].filter(Boolean).join(' · ')}
              statusBadge={r => r.is_active === false ? { label: 'Inactive', color: '#6B7280', bg: '#F3F4F6' } : null}
              fields={[
                { key: 'allergen', label: 'Allergen', placeholder: 'e.g. Amoxicillin, Peanuts', required: true },
                { key: 'allergen_type', label: 'Type', kind: 'select', options: [
                    { value: 'drug', label: 'Drug' }, { value: 'food', label: 'Food' },
                    { value: 'environmental', label: 'Environmental' }, { value: 'other', label: 'Other' },
                  ] },
                { key: 'reaction', label: 'Reaction', placeholder: 'e.g. Rash, Anaphylaxis' },
                { key: 'reaction_severity', label: 'Severity', kind: 'select', options: [
                    { value: 'mild', label: 'Mild' }, { value: 'moderate', label: 'Moderate' },
                    { value: 'severe', label: 'Severe' }, { value: 'life_threatening', label: 'Life-threatening' },
                  ] },
                { key: 'onset_date', label: 'Onset date', kind: 'date' },
                { key: 'notes', label: 'Notes' },
              ]}
              color="#991B1B" bg="#FEF2F2" borderColor="#FECACA"
              emptyText="No structured allergens"
              emptyPrompt="Add an allergen"
              onAdd={async (draft) => {
                const pid = await ensurePid()
                const row = await patientAllergensApi.create({ patientId: pid, ...draft })
                setAllergens(rows => [row, ...rows])
              }}
              onDelete={async (rowId) => {
                await patientAllergensApi.remove(rowId)
                setAllergens(rows => rows.filter(r => r.id !== rowId))
              }}
            />

            <StructuredHistoryCard
              title="💊 Structured current medications"
              rows={medications}
              primaryKey="drug"
              summarise={r => [r.dose, r.frequency, r.route, r.indication && `for ${r.indication}`].filter(Boolean).join(' · ')}
              statusBadge={r => r.is_active === false ? { label: 'Discontinued', color: '#6B7280', bg: '#F3F4F6' } : null}
              fields={[
                { key: 'drug', label: 'Drug', placeholder: 'e.g. Losartan', required: true },
                { key: 'dose', label: 'Dose', placeholder: 'e.g. 50mg' },
                { key: 'frequency', label: 'Frequency', placeholder: 'e.g. mane, nocte, BD, TDS PRN' },
                { key: 'route', label: 'Route', placeholder: 'e.g. oral, topical, inhaled' },
                { key: 'indication', label: 'Indication', placeholder: 'e.g. Hypertension' },
                { key: 'prescribed_by', label: 'Prescribed by', placeholder: 'e.g. Dr Bloggs, Nelson GP' },
                { key: 'started_date', label: 'Started', kind: 'date' },
                { key: 'notes', label: 'Notes' },
              ]}
              emptyText="No structured medications"
              emptyPrompt="Add a medication"
              onAdd={async (draft) => {
                const pid = await ensurePid()
                const row = await patientMedicationsApi.create({ patientId: pid, ...draft })
                setMedications(rows => [row, ...rows])
              }}
              onDelete={async (rowId) => {
                await patientMedicationsApi.remove(rowId)
                setMedications(rows => rows.filter(r => r.id !== rowId))
              }}
            />

            <StructuredHistoryCard
              title="🩺 Structured medical history"
              rows={conditions}
              primaryKey="condition"
              summarise={r => [r.icd10_code, r.onset_date && `dx ${r.onset_date}`, r.resolved_date && `resolved ${r.resolved_date}`].filter(Boolean).join(' · ')}
              statusBadge={r => {
                const map = {
                  active:       { label: 'Active',       color: '#065F46', bg: '#D1FAE5' },
                  resolved:     { label: 'Resolved',     color: '#6B7280', bg: '#F3F4F6' },
                  in_remission: { label: 'In remission', color: '#0369A1', bg: '#DBEAFE' },
                  suspected:    { label: 'Suspected',    color: '#92400E', bg: '#FEF3C7' },
                }
                return map[r.status] || null
              }}
              fields={[
                { key: 'condition', label: 'Condition', placeholder: 'e.g. Type 2 Diabetes', required: true },
                { key: 'icd10_code', label: 'ICD-10 code', placeholder: 'e.g. E11.9' },
                { key: 'status', label: 'Status', kind: 'select', options: [
                    { value: 'active', label: 'Active' }, { value: 'resolved', label: 'Resolved' },
                    { value: 'in_remission', label: 'In remission' }, { value: 'suspected', label: 'Suspected' },
                  ] },
                { key: 'onset_date', label: 'Onset date', kind: 'date' },
                { key: 'resolved_date', label: 'Resolved date', kind: 'date' },
                { key: 'notes', label: 'Notes' },
              ]}
              emptyText="No structured conditions"
              emptyPrompt="Add a condition"
              onAdd={async (draft) => {
                const pid = await ensurePid()
                const row = await patientConditionsApi.create({ patientId: pid, ...draft })
                setConditions(rows => [row, ...rows])
              }}
              onDelete={async (rowId) => {
                await patientConditionsApi.remove(rowId)
                setConditions(rows => rows.filter(r => r.id !== rowId))
              }}
            />
          </>
        })()}

        {/* Past prescriptions across all this patient's consults. Renders
            always (with "None on record" when empty) so the provider has an
            unmissable prescribing-history reference before writing a new Rx. */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '.875rem' }}>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>💊 Past prescriptions{pastRx.length > 0 ? ` (${pastRx.length})` : ''}</span>
          </div>
          {pastRx.length === 0 ? (
            <div style={{ fontSize: '.875rem', color: '#9CA3AF', fontStyle: 'italic' }}>None on record</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              {pastRx.map(r => (
                <div key={r.id} style={{ background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0', padding: '.75rem .875rem', fontSize: '.8125rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', marginBottom: 3 }}>
                    <div style={{ fontWeight: 700, color: NAVY }}>{r.drug_name || r.drug || 'Unnamed drug'}{r.dose ? ` · ${r.dose}` : ''}</div>
                    <div style={{ color: '#6B7280', flexShrink: 0 }}>{r.created_at ? new Date(r.created_at).toLocaleDateString('en-NZ') : ''}</div>
                  </div>
                  {r.directions && <div style={{ color: '#374151', marginBottom: 3 }}>{r.directions}</div>}
                  <div style={{ display: 'flex', gap: '.75rem', fontSize: '.75rem', color: '#6B7280', flexWrap: 'wrap' }}>
                    {r.quantity && <span>Qty: {r.quantity}</span>}
                    {r.repeats != null && <span>Repeats: {r.repeats}</span>}
                    {r.pharmacy_name && <span>→ {r.pharmacy_name}</span>}
                    {r.delivery_status && <span>· {r.delivery_status}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Provider files & clinical photos — anything the provider uploaded
            (manual upload) or captured mid-call (📸 button on the FloatingCallWidget).
            Distinct from Patient uploads below, which are patient-portal-side
            (not yet built). Both live in patient_documents, differentiated by
            the source column. */}
        {(() => {
          const providerDocs = documents.filter(d => (d.source || 'provider_upload') !== 'patient_upload')
          const patientDocs  = documents.filter(d => d.source === 'patient_upload')
          return <>
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '.875rem' }}>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem', marginBottom: '.75rem' }}>
            📎 Provider files &amp; clinical photos{providerDocs.length > 0 ? ` (${providerDocs.length})` : ''}
          </div>
          {providerDocs.length === 0 ? (
            <div style={{ fontSize: '.875rem', color: '#9CA3AF', fontStyle: 'italic', marginBottom: '.75rem' }}>None on file</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', marginBottom: '.75rem' }}>
              {providerDocs.map(d => (
                <div key={d.id} style={{ background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0', padding: '.75rem .875rem', fontSize: '.8125rem', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</div>
                    {d.description && <div style={{ color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.description}</div>}
                    <div style={{ fontSize: '.6875rem', color: '#9CA3AF', marginTop: 2 }}>
                      {d.file_name || 'file'} · {d.uploaded_by_name || 'Unknown'} · {d.created_at ? new Date(d.created_at).toLocaleDateString('en-NZ') : ''}
                    </div>
                  </div>
                  <a href={d.file_url} target="_blank" rel="noopener noreferrer"
                    style={{ background: 'white', border: `1.5px solid ${TEAL}`, color: TEAL, padding: '.375rem .75rem', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: '.75rem', flexShrink: 0, fontFamily: FF }}>
                    View
                  </a>
                  <button onClick={async () => {
                    if (!window.confirm(`Delete "${d.title}"? This can't be undone.`)) return
                    try { await deletePatientDocument(d.id); setDocuments(docs => docs.filter(x => x.id !== d.id)) }
                    catch (e) { alert(`Delete failed: ${e.message}`) }
                  }} title="Delete" style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', padding: '.25rem .5rem', fontSize: '.875rem', flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>
          )}
          {/* Upload widget */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', paddingTop: '.75rem', borderTop: '1px dashed #E2E8F0' }}>
            <input type="text" value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} placeholder="Document title (e.g. FBC 4 Aug 2026)"
              style={{ padding: '.5rem .75rem', border: '1.5px solid #E5E7EB', borderRadius: 8, fontFamily: FF, fontSize: '.875rem' }} />
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
              <input type="file" onChange={e => setUploadFile(e.target.files?.[0] || null)}
                accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,.doc,.docx,.txt"
                style={{ flex: 1, fontFamily: FF, fontSize: '.8125rem' }} />
              <button
                disabled={uploading || !uploadFile || !uploadTitle.trim()}
                onClick={async () => {
                  setUploading(true)
                  try {
                    let pid = patient?.id
                    if (!pid) {
                      // Lazy-create patient row just like the PMH cards do.
                      const pat = await createPatient({
                        firstName: consult.patient_first_name, lastName: consult.patient_last_name,
                        dob: consult.patient_dob, phone: consult.patient_phone,
                        email: consult.patient_email, nhi: consult.patient_nhi,
                      })
                      pid = pat?.id
                      if (pid) { await updateConsultation(id, { patient_id: pid }); setPatient(pat); setConsult(c => c ? { ...c, patient_id: pid } : c) }
                    }
                    if (!pid) throw new Error('Could not create/link patient record')
                    const doc = await uploadPatientDocument({ patientId: pid, title: uploadTitle.trim(), file: uploadFile })
                    setDocuments(docs => [doc, ...docs])
                    setUploadTitle(''); setUploadFile(null)
                  } catch (e) {
                    alert(`Upload failed: ${e.message}`)
                  } finally { setUploading(false) }
                }}
                style={{ background: TEAL, color: 'white', border: 'none', padding: '.5rem 1rem', borderRadius: 8, fontWeight: 700, fontSize: '.8125rem', cursor: (uploading || !uploadFile || !uploadTitle.trim()) ? 'not-allowed' : 'pointer', opacity: (uploading || !uploadFile || !uploadTitle.trim()) ? .5 : 1, fontFamily: FF }}>
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>
            <div style={{ fontSize: '.6875rem', color: '#9CA3AF' }}>PDF, image, or Word — max 20MB</div>
          </div>
        </div>

        {/* Patient uploads — reserved for the future patient-portal upload
            channel. Renders empty state for now so providers know it exists
            and can distinguish "patient hasn't sent anything" from "we don't
            have this feature yet". Populated once patient-side upload lands. */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '.875rem' }}>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem', marginBottom: '.75rem' }}>
            📥 Patient uploads{patientDocs.length > 0 ? ` (${patientDocs.length})` : ''}
          </div>
          {patientDocs.length === 0 ? (
            <div style={{ fontSize: '.875rem', color: '#9CA3AF', fontStyle: 'italic' }}>No patient uploads yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              {patientDocs.map(d => (
                <div key={d.id} style={{ background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0', padding: '.75rem .875rem', fontSize: '.8125rem', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</div>
                    {d.description && <div style={{ color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.description}</div>}
                    <div style={{ fontSize: '.6875rem', color: '#9CA3AF', marginTop: 2 }}>
                      {d.file_name || 'file'} · {d.created_at ? new Date(d.created_at).toLocaleDateString('en-NZ') : ''}
                    </div>
                  </div>
                  <a href={d.file_url} target="_blank" rel="noopener noreferrer"
                    style={{ background: 'white', border: `1.5px solid ${TEAL}`, color: TEAL, padding: '.375rem .75rem', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: '.75rem', flexShrink: 0, fontFamily: FF }}>
                    View
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
        </>
        })()}

        {/* Past Tere consultations */}
        {history.length > 0 && (
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '.875rem' }}>
            <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem', marginBottom: '1rem' }}>
              Past Tere consultations ({history.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              {history.map(c => {
                const cv = c.vitals
                const vitalsParts = cv && !cv.skipped ? [
                  cv.hr && `HR ${cv.hr}`,
                  cv.rr && `RR ${cv.rr}`,
                  cv.spo2 && `SpO₂ ${cv.spo2}%`,
                  cv.bp && `BP ${cv.bp}`,
                  cv.temperature && `T ${cv.temperature}°`,
                ].filter(Boolean) : []
                return (
                  <button key={c.id} onClick={() => setNoteModal(c)}
                    style={{ background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0', padding: '.875rem 1rem', cursor: 'pointer', textAlign: 'left', fontFamily: FF, display: 'flex', alignItems: 'center', gap: '1rem', width: '100%' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '.8125rem', fontWeight: 600, color: NAVY, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.chief_complaint}</div>
                      <div style={{ fontSize: '.75rem', color: '#6B7280' }}>
                        {new Date(c.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {c.provider_display_name ? ` · ${c.provider_display_name}` : ''}
                      </div>
                      {vitalsParts.length > 0 && (
                        <div style={{ fontSize: '.6875rem', color: '#059669', marginTop: 3, fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: '.02em' }}>
                          {vitalsParts.join(' · ')}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                      {c.prescription_issued && <span style={{ background: '#EFF9F9', color: TEAL, fontSize: '.625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99 }}>Rx</span>}
                      {c.referral_issued && <span style={{ background: '#F5F3FF', color: '#7C3AED', fontSize: '.625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99 }}>Xr</span>}
                      {c.notes_final && <span style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>→</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Radiology referrals ordered — pending / in-flight Tere-issued
            referrals (not yet reported). Filtered on the server by patient
            NHI; renders nothing if the patient has no NHI recorded. */}
        {(() => {
          const active = radReferrals.filter(r => r.referral_status !== 'result_received' && r.referral_status !== 'cancelled' && r.referral_status !== 'dna')
          return (
            <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '.875rem' }}>
              <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem', marginBottom: '.75rem' }}>
                📋 Radiology referrals ordered{active.length > 0 ? ` (${active.length} pending)` : ''}
              </div>
              {active.length === 0 ? (
                <div style={{ fontSize: '.8125rem', color: '#9CA3AF', fontStyle: 'italic' }}>No pending radiology referrals for this patient.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                  {active.map(r => {
                    const urgent = r.urgency === 'urgent' || r.urgency === 'critical'
                    return (
                      <div key={r.id} style={{ background: urgent ? '#FEF2F2' : '#F8FAFC', borderRadius: 10, border: `1px solid ${urgent ? '#FECACA' : '#E2E8F0'}`, padding: '.75rem .875rem', fontSize: '.8125rem' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                          <span style={{ fontWeight: 700, color: NAVY }}>{r.investigation || 'Radiology referral'}</span>
                          {urgent && <span style={{ background: '#DC2626', color: 'white', fontSize: '.625rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99, textTransform: 'uppercase' }}>{r.urgency}</span>}
                          <span style={{ background: '#EFF9F9', color: TEAL, fontSize: '.625rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99, textTransform: 'uppercase' }}>{r.referral_status || 'pending'}</span>
                        </div>
                        {r.clinical_indication && (
                          <div style={{ color: '#374151', fontSize: '.75rem', marginBottom: 3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{r.clinical_indication}</div>
                        )}
                        <div style={{ color: '#6B7280', fontSize: '.6875rem' }}>
                          Ordered {new Date(r.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {r.provider_name ? ` · ${r.provider_name}` : ''}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {radReferrals.length === 0 && !patient?.nhi && (
                <div style={{ fontSize: '.6875rem', color: '#9CA3AF', marginTop: '.5rem' }}>
                  (Referral lookup uses NHI — add an NHI to the patient record to see any referrals on file.)
                </div>
              )}
            </div>
          )
        })()}

        {/* HL7 reports on file — inbound messages filed to this patient's chart.
            Filed automatically at receive time when PID-3 NHI matches an existing
            patient (see api/_hl7-inbound.js), or manually by a provider from the
            inbox. Click a row to open the full message viewer. */}
        {hl7Reports.length > 0 && (
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '.875rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem' }}>
                📨 Lab & referral reports ({hl7Reports.length})
              </div>
              <button onClick={() => navigate('/clinician/inbox')}
                style={{ background: 'transparent', color: TEAL, border: 'none', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                All inbox →
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              {hl7Reports.map(m => {
                const title = m.obr_4_service_id || m.msh_9_message_type || 'HL7 report'
                const auto = !m.filed_by_provider_id
                return (
                  <button key={m.id} onClick={() => navigate(`/clinician/inbox?id=${m.id}`)}
                    style={{ background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0', padding: '.875rem 1rem', cursor: 'pointer', textAlign: 'left', fontFamily: FF, display: 'flex', alignItems: 'center', gap: '1rem', width: '100%' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '.8125rem', fontWeight: 700, color: NAVY, marginBottom: 2, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span>{title}</span>
                        {m.has_pdf && <span style={{ fontSize: '.75rem' }}>📄</span>}
                      </div>
                      <div style={{ fontSize: '.6875rem', color: '#6B7280' }}>
                        {new Date(m.received_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {m.msh_4_sending_facility ? ` · ${m.msh_4_sending_facility}` : ''}
                        {' · '}
                        {auto ? 'Auto-filed (NHI match)' : 'Filed by provider'}
                      </div>
                    </div>
                    <span style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>→</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Imaging on file — auto-attached radiology reports (NHI-matched via Bedrock in _telnyx-inbound-fax.js).
            Renders even when empty so providers see the section exists and know where reports will appear. */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '.875rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: imaging.length > 0 ? '1rem' : 0 }}>
            <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem' }}>
              🩻 Imaging on file{imaging.length > 0 ? ` (${imaging.length})` : ''}
            </div>
            {imaging.length > 0 && (
              <button onClick={() => navigate('/clinician/reports')}
                style={{ background: 'transparent', color: TEAL, border: 'none', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                All reports →
              </button>
            )}
          </div>
          {imaging.length === 0 ? (
            <div style={{ fontSize: '.8125rem', color: '#9CA3AF', fontStyle: 'italic', marginTop: '.5rem' }}>No imaging reports on file for this patient.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              {imaging.map(r => {
                const urgent = r.urgency === 'critical' || r.urgency === 'urgent'
                const needsSignoff = r.status === 'matched'
                return (
                  <button key={r.id} onClick={() => navigate(`/clinician/reports?id=${r.id}`)}
                    style={{ background: urgent ? '#FEF2F2' : '#F8FAFC', borderRadius: 10, border: `1px solid ${urgent ? '#FECACA' : '#E2E8F0'}`, padding: '.875rem 1rem', cursor: 'pointer', textAlign: 'left', fontFamily: FF, display: 'flex', alignItems: 'center', gap: '1rem', width: '100%' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '.8125rem', fontWeight: 700, color: NAVY, marginBottom: 2, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span>{r.study_type || 'Radiology report'}{r.body_part ? ` — ${r.body_part}` : ''}</span>
                        {urgent && (
                          <span style={{ background: r.urgency === 'critical' ? '#DC2626' : '#F59E0B', color: 'white', fontSize: '.625rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                            {r.urgency}
                          </span>
                        )}
                      </div>
                      {r.clinical_impression && (
                        <div style={{ fontSize: '.75rem', color: '#374151', marginBottom: 3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {r.clinical_impression}
                        </div>
                      )}
                      <div style={{ fontSize: '.6875rem', color: '#6B7280' }}>
                        {new Date(r.received_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {r.sender_name ? ` · ${r.sender_name}` : ''}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, display: 'flex', gap: 6, alignItems: 'center' }}>
                      {needsSignoff && (
                        <span style={{ background: '#FEF3C7', color: '#78350F', fontSize: '.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>
                          NEEDS SIGN-OFF
                        </span>
                      )}
                      {r.status === 'reviewed' && (
                        <span style={{ background: '#DCFCE7', color: '#065F46', fontSize: '.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>
                          REVIEWED
                        </span>
                      )}
                      <span style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>→</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

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

        {/* ── Internal notes ─────────────────────────────────────────────
            Visually and semantically separated from the patient's clinical
            record above. These are Tere's internal working notes (cross-consult
            reminders, scheduling / billing context) and are NOT part of the
            patient's health record. On a HIPC information request we release
            the clinical record above; internal notes are subject to a
            separate assessment. */}
        {(() => {
          async function saveNote(field, value) {
            setSavingEdit(true)
            try {
              let pat = patient
              if (!pat) {
                pat = await createPatient({
                  firstName: consult.patient_first_name,
                  lastName: consult.patient_last_name,
                  dob: consult.patient_dob,
                  phone: consult.patient_phone,
                  email: consult.patient_email,
                  nhi: consult.patient_nhi,
                })
                if (pat?.id) {
                  await updateConsultation(id, { patient_id: pat.id })
                  setConsult(c => c ? { ...c, patient_id: pat.id } : c)
                }
              }
              if (!pat?.id) throw new Error('Could not create/link patient record')
              await updatePatient(pat.id, { [field]: value })
              setPatient(p => ({ ...(p || pat), [field]: value }))
            } catch (e) {
              console.error('[internal-notes] save failed:', e?.message)
            }
            setSavingEdit(false)
            setEditField(null)
          }
          function NoteCard({ fieldKey, label, bg, borderColor, value }) {
            const isEditing = editField === fieldKey
            return (
              <div style={{ background: bg, borderRadius: 12, border: `1px solid ${borderColor}`, padding: '1rem 1.15rem', marginBottom: '.625rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.5rem' }}>
                  <div style={{ fontWeight: 700, color: NAVY, fontSize: '.875rem' }}>{label}</div>
                  <button onClick={() => { setEditField(isEditing ? null : fieldKey); setEditValue(value || '') }}
                    style={{ background: 'none', border: 'none', color: TEAL, fontSize: '.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: FF }}>
                    {isEditing ? 'Cancel' : 'Edit'}
                  </button>
                </div>
                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <textarea value={editValue} onChange={e => setEditValue(e.target.value)} rows={4}
                      style={{ width: '100%', padding: '.5rem .625rem', border: '1.5px solid #D1D5DB', borderRadius: 8, fontFamily: FF, fontSize: '.875rem', resize: 'vertical', boxSizing: 'border-box' }} />
                    <button onClick={() => saveNote(fieldKey, editValue)} disabled={savingEdit}
                      style={{ alignSelf: 'flex-end', background: TEAL, color: 'white', border: 'none', borderRadius: 8, padding: '6px 14px', fontWeight: 700, fontSize: '.8125rem', cursor: 'pointer', fontFamily: FF, opacity: savingEdit ? .6 : 1 }}>
                      {savingEdit ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: '.875rem', color: NAVY, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{value || <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>None recorded</span>}</div>
                )}
              </div>
            )
          }
          return (
            <>
              {/* Divider band — deliberately different visual language
                  from the clinical cards above so it reads as "different
                  thing" rather than "another card". */}
              <div style={{ margin: '2rem 0 1rem', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                <div style={{ flex: 1, height: 1, background: '#CBD5E1' }} />
                <div style={{ fontSize: '.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#64748B' }}>Internal notes · not part of patient record</div>
                <div style={{ flex: 1, height: 1, background: '#CBD5E1' }} />
              </div>
              <div style={{ background: '#F1F5F9', borderRadius: 14, border: '1px dashed #94A3B8', padding: '1rem 1.15rem 1.15rem', marginBottom: '.875rem' }}>
                <div style={{ fontSize: '.75rem', color: '#475569', lineHeight: 1.5, marginBottom: '.75rem' }}>
                  These notes are for Tere internal use (cross-consult reminders, scheduling / billing context, provider handover). They are not surfaced to the patient, and are subject to a separate release assessment on any HIPC information request.
                </div>
                <NoteCard fieldKey="doctor_notes" label="🩺 Doctor notes (cross-consult)" bg="white" borderColor="#A7D4D8" value={patient?.doctor_notes} />
                <NoteCard fieldKey="admin_notes" label="🗒️ Admin notes (scheduling / billing)" bg="white" borderColor="#CBD5E1" value={patient?.admin_notes} />
              </div>
            </>
          )
        })()}
      </div>

      {/* Bottom action bar — three-button encounter workflow.
          Call → server checks patient heartbeat → LiveKit if online, phone bridge if not.
          No Answer → increment counter (feeds no-show flow).
          Complete Encounter → transition to notes; only path that closes the encounter.
          Rendered whenever the consult isn't a message consult (message has its own UI
          below), including after the encounter is completed — the bar must be static so
          providers don't lose access to actions on reload or status transitions. */}
      {!isMessage && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid #E2E8F0', padding: '1rem', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: '.5rem', maxWidth: 640, margin: '0 auto' }}>
          {callError && (
            <div style={{ background:'#FEE2E2', border:'1px solid #FCA5A5', color:'#991B1B', borderRadius:8, padding:'.6rem .75rem', fontSize:'.85rem', fontFamily:FF }}>
              {callError} <button onClick={() => setCallError(null)} style={{ background:'none', border:'none', color:'#991B1B', fontWeight:700, cursor:'pointer', marginLeft:8 }}>Dismiss</button>
            </div>
          )}
          <EncounterActionBar
            consultationId={id}
            onCall={async (channel) => {
              setCallError(null)
              await unlock()
              const body = channel === 'livekit'
                ? { consultationId: id, providerId, providerName: displayName }
                : { consultationId: id, providerId, providerName: displayName, forcePhone: true }
              try {
                const r = await apiFetch('/api/initiate-call', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                })
                if (!r.ok) {
                  const err = await r.json().catch(() => ({}))
                  setCallError(`Call could not start: ${err.error || `HTTP ${r.status}`}`)
                  return
                }
              } catch (e) {
                setCallError(`Call could not start: ${e.message}`)
                return
              }
              // Mount ProviderConsult in popupMode instead of navigating.
              // Locked to this page: leaving unmounts the popup and ends
              // the session (endCall runs on LiveKit disconnect).
              setActiveCall({ channel, startedAt: Date.now() })
            }}
            onComplete={() => {
              // Static-bar Complete Encounter: open the notes popup here on
              // the patient page instead of navigating to /provider/notes/:id.
              setActiveNotes({ actions: [], transcript: '', callNotes: '' })
            }}
            onNoAnswer={async (res) => {
              // Server dismisses the patient after the 3rd no-answer. On dismiss:
              // release the lock, alert the provider (so they know the SMS fired
              // and the patient is out of their queue), and return to the queue.
              if (res?.dismissed) {
                await unlock()
                const msg = res.smsSent
                  ? "Patient dismissed after 3 no-answer attempts. They've been texted an invitation to start a new consult."
                  : "Patient dismissed after 3 no-answer attempts. SMS was NOT sent (no phone number on file or delivery failed). Follow up manually if needed."
                alert(msg)
                navigate('/provider')
              }
            }}
          />
          <button onClick={async () => { await unlock(); navigate('/provider') }} style={{ background: 'white', border: '1.5px solid #D1D5DB', color: '#6B7280', borderRadius: 10, padding: '.6rem', fontWeight: 600, fontSize: '.85rem', cursor: 'pointer', fontFamily: FF }}>
            ← Back to queue
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
