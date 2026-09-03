// ACC provider widgets — rendered on ClinicianPatient chart when the consult
// has been converted to ACC. Lets the treating provider write into the
// discrete fields the audit bundle expects: rehab_plan, outcome measures,
// discharge_summary, rtw_status. Also renders any existing data.
//
// Kept intentionally compact — one accordion per section, expand-to-edit.

import React, { useEffect, useState } from 'react'
import { updateConsultation, listAccOutcomeMeasures, addAccOutcomeMeasure, deleteAccOutcomeMeasure, generateAccCert } from '../../lib/supabase'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const AMBER = '#D97706'
const FF = 'Plus Jakarta Sans, sans-serif'

const inp = { padding: '.5rem .625rem', border: '1.5px solid #E2E8F0', borderRadius: 6, fontFamily: FF, fontSize: '.875rem', outline: 'none', width: '100%', boxSizing: 'border-box' }
const lbl = { display: 'block', fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }

const MEASURE_TYPES = [
  { value: 'pain_score_0_10',        label: 'Pain score (0–10)', min: 0, max: 10 },
  { value: 'function_score_0_100',   label: 'Function score (0–100)', min: 0, max: 100 },
  { value: 'rtw_percent',            label: 'RTW %', min: 0, max: 100 },
  { value: 'range_of_motion_degrees',label: 'Range of motion (°)', min: 0, max: 360 },
  { value: 'grip_strength_kg',       label: 'Grip strength (kg)', min: 0, max: 200 },
  { value: 'other_numeric',          label: 'Other (numeric)' },
  { value: 'other_text',             label: 'Other (text)' },
]

function Section({ title, badge, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, marginBottom: '.75rem', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', padding: '.75rem 1rem', background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontFamily: FF, fontSize: '.9375rem', fontWeight: 700, color: NAVY, textAlign: 'left' }}>
        <span>{title}{badge && <span style={{ marginLeft: 8, background: '#F0FDFA', color: TEAL, padding: '2px 8px', borderRadius: 99, fontSize: '.6875rem' }}>{badge}</span>}</span>
        <span style={{ color: '#9CA3AF' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={{ padding: '0 1rem 1rem' }}>{children}</div>}
    </div>
  )
}

export default function AccConsultWidgets({ consult, onSaved }) {
  const providerId = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('providerId') : null

  // Only render if the consult is ACC-billed.
  if (!consult || (!consult.acc_converted_at && !consult.is_acc && !consult.acc_claim_number)) {
    return null
  }

  // ── Rehab plan ─────────────────────────────────────────────────────────────
  const rp = consult.rehab_plan || {}
  const [goals, setGoals]           = useState(Array.isArray(rp.goals) ? rp.goals.join('\n') : (rp.goals || ''))
  const [plan, setPlan]             = useState(rp.plan || '')
  const [reviewWeeks, setReviewWeeks] = useState(rp.review_cycle_weeks || '')
  const [nextReview, setNextReview] = useState(rp.next_review_at ? String(rp.next_review_at).slice(0, 10) : '')
  const [savingRp, setSavingRp]     = useState(false)

  async function saveRehabPlan() {
    setSavingRp(true)
    try {
      const goalArr = goals.split('\n').map(s => s.trim()).filter(Boolean)
      await updateConsultation(consult.id, {
        rehab_plan: {
          goals: goalArr,
          plan: plan.trim() || null,
          review_cycle_weeks: reviewWeeks ? parseInt(reviewWeeks) : null,
          next_review_at: nextReview ? new Date(nextReview + 'T00:00:00').toISOString() : null,
          updated_at: new Date().toISOString(),
          updated_by_provider_id: providerId,
        },
      })
      onSaved?.()
    } catch (e) { alert('Save failed: ' + e.message) }
    setSavingRp(false)
  }

  // ── RTW status ─────────────────────────────────────────────────────────────
  const rw = consult.rtw_status || {}
  const [rwStatus, setRwStatus]         = useState(rw.status || '')
  const [rwHours, setRwHours]           = useState(rw.hours_per_week ?? '')
  const [rwRestrictions, setRwRestrictions] = useState(rw.restrictions || '')
  const [rwTarget, setRwTarget]         = useState(rw.target_date ? String(rw.target_date).slice(0, 10) : '')
  const [savingRw, setSavingRw]         = useState(false)

  async function saveRtw() {
    setSavingRw(true)
    try {
      await updateConsultation(consult.id, {
        rtw_status: {
          status: rwStatus || null,
          hours_per_week: rwHours !== '' ? Number(rwHours) : null,
          restrictions: rwRestrictions.trim() || null,
          target_date: rwTarget ? new Date(rwTarget + 'T00:00:00').toISOString() : null,
          recorded_by_provider_id: providerId,
          recorded_at: new Date().toISOString(),
        },
      })
      onSaved?.()
    } catch (e) { alert('Save failed: ' + e.message) }
    setSavingRw(false)
  }

  // ── Discharge summary ──────────────────────────────────────────────────────
  const ds = consult.discharge_summary || {}
  const [dsStatus, setDsStatus]         = useState(ds.status || '')
  const [dsSummary, setDsSummary]       = useState(ds.summary_text || '')
  const [dsDate, setDsDate]             = useState(ds.discharge_date ? String(ds.discharge_date).slice(0, 10) : new Date().toISOString().slice(0, 10))
  const [dsReferred, setDsReferred]     = useState(ds.referred_to || '')
  const [savingDs, setSavingDs]         = useState(false)

  async function saveDischarge() {
    if (!dsStatus) { alert('Please select a discharge status.'); return }
    setSavingDs(true)
    try {
      await updateConsultation(consult.id, {
        discharge_summary: {
          status: dsStatus,
          summary_text: dsSummary.trim() || null,
          discharge_date: dsDate ? new Date(dsDate + 'T00:00:00').toISOString() : new Date().toISOString(),
          referred_to: dsReferred.trim() || null,
          discharged_by_provider_id: providerId,
        },
      })
      onSaved?.()
    } catch (e) { alert('Save failed: ' + e.message) }
    setSavingDs(false)
  }

  // ── Outcome measures ───────────────────────────────────────────────────────
  const [measures, setMeasures]     = useState([])
  const [loadingMeasures, setLoadingMeasures] = useState(false)
  const [newType, setNewType]       = useState('pain_score_0_10')
  const [newValue, setNewValue]     = useState('')
  const [newNotes, setNewNotes]     = useState('')
  const [addingMeasure, setAddingMeasure] = useState(false)

  async function loadMeasures() {
    setLoadingMeasures(true)
    try {
      const rows = await listAccOutcomeMeasures({ consultationId: consult.id })
      setMeasures(rows)
    } catch { setMeasures([]) }
    setLoadingMeasures(false)
  }
  useEffect(() => { loadMeasures() /* eslint-disable-next-line */ }, [consult.id])

  async function addMeasure() {
    if (!newType) return
    const isText = newType === 'other_text'
    if (!isText && (newValue === '' || Number.isNaN(Number(newValue)))) { alert('Enter a numeric value.'); return }
    setAddingMeasure(true)
    try {
      await addAccOutcomeMeasure({
        consultationId: consult.id,
        measureType:    newType,
        valueNumeric:   isText ? null : Number(newValue),
        valueText:      isText ? newValue : null,
        notes:          newNotes.trim() || null,
      })
      setNewValue(''); setNewNotes('')
      await loadMeasures()
    } catch (e) { alert('Add failed: ' + e.message) }
    setAddingMeasure(false)
  }

  async function removeMeasure(id) {
    if (!confirm('Remove this outcome measure? This is an audit-logged action.')) return
    try {
      await deleteAccOutcomeMeasure(id)
      await loadMeasures()
    } catch (e) { alert('Delete failed: ' + e.message) }
  }

  // ── Support person (HDC Right 8) ────────────────────────────────────────────
  const [supportPresent, setSupportPresent] = useState(!!consult.support_person_present)
  const [supportName, setSupportName]       = useState(consult.support_person_name || '')
  const [savingSupport, setSavingSupport]   = useState(false)

  async function saveSupport() {
    setSavingSupport(true)
    try {
      await updateConsultation(consult.id, {
        support_person_present: supportPresent,
        support_person_name: supportName.trim() || null,
      })
      onSaved?.()
    } catch (e) { alert('Save failed: ' + e.message) }
    setSavingSupport(false)
  }

  return (
    <div style={{ marginBottom: '1rem', fontFamily: FF }}>
      <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '.625rem .875rem', fontSize: '.8125rem', color: '#92400E', marginBottom: '.75rem' }}>
        <strong>⚡ ACC consult</strong> — capture rehab plan, outcome measures, and discharge summary. Everything here surfaces in the ACC audit bundle.
      </div>

      {/* Rehab plan */}
      <Section title="Rehab plan" badge={consult.rehab_plan ? 'captured' : null} defaultOpen={!consult.rehab_plan}>
        <div style={{ display: 'grid', gap: '.5rem' }}>
          <div>
            <label style={lbl}>Goals (one per line)</label>
            <textarea value={goals} onChange={e => setGoals(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} placeholder="e.g. Return to work at 50% by week 4&#10;Pain <3/10 within 2 weeks" />
          </div>
          <div>
            <label style={lbl}>Plan / interventions</label>
            <textarea value={plan} onChange={e => setPlan(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} placeholder="e.g. Home exercise programme, ice/heat, NSAIDs prn, review in 2 weeks" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
            <div>
              <label style={lbl}>Review cycle (weeks)</label>
              <input type="number" min="1" max="52" value={reviewWeeks} onChange={e => setReviewWeeks(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Next review date</label>
              <input type="date" value={nextReview} onChange={e => setNextReview(e.target.value)} style={inp} />
            </div>
          </div>
          <button onClick={saveRehabPlan} disabled={savingRp}
            style={{ padding: '.5rem 1rem', background: TEAL, color: 'white', border: 'none', borderRadius: 6, fontFamily: FF, fontSize: '.8125rem', fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start' }}>
            {savingRp ? 'Saving…' : 'Save rehab plan'}
          </button>
        </div>
      </Section>

      {/* Return-to-work */}
      <Section title="Return-to-work status" badge={consult.rtw_status ? 'captured' : null}>
        <div style={{ display: 'grid', gap: '.5rem' }}>
          <div>
            <label style={lbl}>Status</label>
            <select value={rwStatus} onChange={e => setRwStatus(e.target.value)} style={inp}>
              <option value="">Not specified</option>
              <option value="full">Full — normal duties</option>
              <option value="partial">Partial — modified duties</option>
              <option value="off_work">Off work</option>
              <option value="returned">Returned to work</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
            <div>
              <label style={lbl}>Hours per week</label>
              <input type="number" min="0" max="80" value={rwHours} onChange={e => setRwHours(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Target return date</label>
              <input type="date" value={rwTarget} onChange={e => setRwTarget(e.target.value)} style={inp} />
            </div>
          </div>
          <div>
            <label style={lbl}>Restrictions</label>
            <input value={rwRestrictions} onChange={e => setRwRestrictions(e.target.value)} placeholder="e.g. No lifting >5kg, no ladders" style={inp} />
          </div>
          <button onClick={saveRtw} disabled={savingRw}
            style={{ padding: '.5rem 1rem', background: TEAL, color: 'white', border: 'none', borderRadius: 6, fontFamily: FF, fontSize: '.8125rem', fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start' }}>
            {savingRw ? 'Saving…' : 'Save RTW status'}
          </button>
        </div>
      </Section>

      {/* Outcome measures */}
      <Section title="Outcome measures" badge={measures.length ? `${measures.length} recorded` : null}>
        {loadingMeasures ? (
          <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>Loading…</div>
        ) : (
          <>
            {measures.length > 0 && (
              <div style={{ marginBottom: '.75rem' }}>
                {measures.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '.375rem .625rem', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, marginBottom: 4, fontSize: '.8125rem' }}>
                    <span style={{ color: TEAL, fontWeight: 700, minWidth: 160 }}>{MEASURE_TYPES.find(t => t.value === m.measure_type)?.label || m.measure_type}</span>
                    <span style={{ color: NAVY, fontWeight: 700 }}>{m.value_numeric != null ? m.value_numeric : m.value_text}</span>
                    <span style={{ flex: 1, color: '#6B7280', fontSize: '.75rem' }}>{new Date(m.recorded_at).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    <button onClick={() => removeMeasure(m.id)} style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: '.75rem' }}>Remove</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ background: '#F0FDFA', border: '1px solid #A7D4D8', borderRadius: 6, padding: '.625rem .75rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '.5rem', marginBottom: '.5rem' }}>
                <div>
                  <label style={lbl}>Measure</label>
                  <select value={newType} onChange={e => setNewType(e.target.value)} style={inp}>
                    {MEASURE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Value</label>
                  <input value={newValue} onChange={e => setNewValue(e.target.value)}
                    type={newType === 'other_text' ? 'text' : 'number'}
                    min={MEASURE_TYPES.find(t => t.value === newType)?.min}
                    max={MEASURE_TYPES.find(t => t.value === newType)?.max}
                    style={inp} />
                </div>
              </div>
              <div style={{ marginBottom: '.5rem' }}>
                <label style={lbl}>Notes (optional)</label>
                <input value={newNotes} onChange={e => setNewNotes(e.target.value)} style={inp} />
              </div>
              <button onClick={addMeasure} disabled={addingMeasure}
                style={{ padding: '.375rem .875rem', background: TEAL, color: 'white', border: 'none', borderRadius: 6, fontFamily: FF, fontSize: '.75rem', fontWeight: 700, cursor: 'pointer' }}>
                {addingMeasure ? 'Adding…' : '+ Add measure'}
              </button>
            </div>
          </>
        )}
      </Section>

      {/* Discharge */}
      <Section title="Discharge summary" badge={consult.discharge_summary ? 'discharged' : null}>
        <div style={{ display: 'grid', gap: '.5rem' }}>
          <div>
            <label style={lbl}>Discharge status</label>
            <select value={dsStatus} onChange={e => setDsStatus(e.target.value)} style={inp}>
              <option value="">Select…</option>
              <option value="resolved">Resolved — no further treatment needed</option>
              <option value="referred">Referred to another provider</option>
              <option value="lost_to_followup">Lost to follow-up</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
            <div>
              <label style={lbl}>Discharge date</label>
              <input type="date" value={dsDate} onChange={e => setDsDate(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Referred to (if applicable)</label>
              <input value={dsReferred} onChange={e => setDsReferred(e.target.value)} placeholder="e.g. Orthopaedic surgeon, GP" style={inp} />
            </div>
          </div>
          <div>
            <label style={lbl}>Summary</label>
            <textarea value={dsSummary} onChange={e => setDsSummary(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} placeholder="Clinical outcome, current function, handover instructions" />
          </div>
          <button onClick={saveDischarge} disabled={savingDs}
            style={{ padding: '.5rem 1rem', background: AMBER, color: 'white', border: 'none', borderRadius: 6, fontFamily: FF, fontSize: '.8125rem', fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start' }}>
            {savingDs ? 'Saving…' : 'Discharge patient from ACC episode'}
          </button>
        </div>
      </Section>

      {/* ACC certificates (WC / RTW / ACC46) */}
      <Section title="Generate ACC certificate">
        <AccCertGenerator consult={consult} />
      </Section>

      {/* Support person (HDC Right 8) */}
      <Section title="Support person (HDC Right 8)" badge={consult.support_person_present ? 'yes' : null}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', border: `1.5px solid ${supportPresent ? TEAL : '#E2E8F0'}`, borderRadius: 6, background: supportPresent ? '#F0FDFA' : 'white', cursor: 'pointer', marginBottom: '.5rem' }}>
          <input type="checkbox" checked={supportPresent} onChange={e => setSupportPresent(e.target.checked)} style={{ marginTop: 2 }} />
          <div>
            <div style={{ fontSize: '.8125rem', fontWeight: 700, color: supportPresent ? TEAL : NAVY }}>Patient had a support person present</div>
            <div style={{ fontSize: '.6875rem', color: '#6B7280', marginTop: 2 }}>HDC Code Right 8 — right to a support person of their choice.</div>
          </div>
        </label>
        {supportPresent && (
          <div style={{ marginBottom: '.5rem' }}>
            <label style={lbl}>Name / relationship</label>
            <input value={supportName} onChange={e => setSupportName(e.target.value)} placeholder="e.g. Wife (Sarah)" style={inp} />
          </div>
        )}
        <button onClick={saveSupport} disabled={savingSupport}
          style={{ padding: '.5rem 1rem', background: TEAL, color: 'white', border: 'none', borderRadius: 6, fontFamily: FF, fontSize: '.8125rem', fontWeight: 700, cursor: 'pointer' }}>
          {savingSupport ? 'Saving…' : 'Save'}
        </button>
      </Section>
    </div>
  )
}

function AccCertGenerator({ consult }) {
  const rw = consult.rtw_status || {}
  const [certType, setCertType] = useState('weekly_compensation')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)

  const today = new Date().toISOString().slice(0, 10)
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const [unfitFrom, setUnfitFrom] = useState(today)
  const [unfitTo,   setUnfitTo]   = useState(in7Days)
  const [unfitReason, setUnfitReason] = useState(consult.acc_injury_details || '')
  const [rtwFrom, setRtwFrom] = useState(today)
  const [hoursPerWeek, setHoursPerWeek] = useState(rw.hours_per_week ?? 20)
  const [restrictions, setRestrictions] = useState(rw.restrictions || '')
  const [targetFullRtw, setTargetFullRtw] = useState(rw.target_date?.slice(0, 10) || in7Days)
  const [sendToPatient, setSendToPatient] = useState(true)

  async function handleGenerate() {
    setBusy(true); setStatus(null)
    try {
      const payload = { certType, consultationId: consult.id, sendToPatient }
      if (certType === 'weekly_compensation') Object.assign(payload, { unfitFrom, unfitTo, unfitReason })
      if (certType === 'return_to_work')      Object.assign(payload, { rtwFrom, hoursPerWeek, restrictions, targetFullRtw })
      const data = await generateAccCert(payload)
      const bytes = Uint8Array.from(atob(data.pdf_base64), c => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = data.filename
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      setStatus(data.email?.sent ? `Emailed to ${data.email.to} + downloaded` : 'Downloaded')
    } catch (e) { setStatus('Error: ' + e.message) }
    setBusy(false)
  }

  return (
    <div style={{ display: 'grid', gap: '.5rem' }}>
      <div>
        <label style={lbl}>Certificate type</label>
        <select value={certType} onChange={e => setCertType(e.target.value)} style={inp}>
          <option value="weekly_compensation">Medical Certificate — Weekly Compensation (off work)</option>
          <option value="return_to_work">Return-to-Work Certificate</option>
          <option value="acc46">ACC46 Injury Summary</option>
        </select>
      </div>

      {certType === 'weekly_compensation' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
            <div><label style={lbl}>Unfit from</label><input type="date" value={unfitFrom} onChange={e => setUnfitFrom(e.target.value)} style={inp} /></div>
            <div><label style={lbl}>Unfit to</label><input type="date" value={unfitTo} onChange={e => setUnfitTo(e.target.value)} style={inp} /></div>
          </div>
          <div>
            <label style={lbl}>Clinical reason</label>
            <textarea value={unfitReason} onChange={e => setUnfitReason(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} />
          </div>
        </>
      )}

      {certType === 'return_to_work' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
            <div><label style={lbl}>RTW from</label><input type="date" value={rtwFrom} onChange={e => setRtwFrom(e.target.value)} style={inp} /></div>
            <div><label style={lbl}>Hours per week</label><input type="number" min="0" max="80" value={hoursPerWeek} onChange={e => setHoursPerWeek(Number(e.target.value))} style={inp} /></div>
          </div>
          <div><label style={lbl}>Target full RTW date</label><input type="date" value={targetFullRtw} onChange={e => setTargetFullRtw(e.target.value)} style={inp} /></div>
          <div>
            <label style={lbl}>Restrictions</label>
            <textarea value={restrictions} onChange={e => setRestrictions(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} />
          </div>
        </>
      )}

      {certType === 'acc46' && (
        <div style={{ background: '#F0F9FA', border: '1px solid #A7D4D8', padding: '.625rem .75rem', borderRadius: 6, fontSize: '.75rem', color: '#0D2B45' }}>
          ACC46 pulls examination/assessment/plan from this consult's clinical notes + outcome measures automatically. No extra fields needed.
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.8125rem', color: '#374151' }}>
        <input type="checkbox" checked={sendToPatient} onChange={e => setSendToPatient(e.target.checked)} /> Email a copy to the patient
      </label>

      <button onClick={handleGenerate} disabled={busy}
        style={{ padding: '.5rem 1rem', background: TEAL, color: 'white', border: 'none', borderRadius: 6, fontFamily: FF, fontSize: '.8125rem', fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start' }}>
        {busy ? 'Generating…' : 'Generate + download PDF'}
      </button>

      {status && (
        <div style={{ fontSize: '.75rem', color: status.startsWith('Error') ? '#DC2626' : '#059669' }}>{status}</div>
      )}
    </div>
  )
}
