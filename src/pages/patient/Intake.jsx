import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../../lib/supabase'

const LOCATIONS = [
  'Havelock', 'Pelorus Sound', 'Queen Charlotte Sound',
  'Kenepuru Sound', 'Picton', 'Rai Valley / Canvastown',
  'Nelson / Tasman', 'West Coast', 'Northland', 'Coromandel',
  'East Coast / Gisborne', "Hawke's Bay rural", 'Whanganui rural',
  'Canterbury rural', 'Otago rural', 'Southland', 'Other rural area'
]

export default function Intake() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [errors, setErrors]   = useState({})

  const [form, setForm] = useState({
    patient_name: '', patient_dob: '', patient_nhi: '',
    patient_phone: '', patient_address: '', patient_location: '',
    chief_complaint: '',
    is_acc: false, is_work_injury: false,
    acc_injury_description: '', acc_injury_date: '',
    acc_employment_status: '',
    acc_employer: '', acc_employer_address: '', acc_employer_phone: '',
    patient_weight_kg: '',
    recording_consent: false,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Weight is required for paediatric weight-based dosing calculations
  // (ages 2-14). Under 2 needs specialist input outside telehealth scope;
  // 15+ uses flat adult dosing. Prescribe modal auto-fills from this.
  const patientAge = form.patient_dob ? Math.floor((Date.now() - new Date(form.patient_dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null
  const requiresWeight = patientAge != null && patientAge >= 2 && patientAge <= 14

  const validate = () => {
    const e = {}
    if (!form.patient_name.trim())     e.patient_name    = 'Required'
    if (!form.patient_dob)             e.patient_dob     = 'Required'
    if (!form.patient_location)        e.patient_location= 'Required'
    if (!form.chief_complaint.trim())  e.chief_complaint = 'Required — describe what happened or what\'s wrong'
    // Physical address is required for ACC claims where NHI is missing (the
    // ACC45 needs enough identifiers to link the claimant to their file when
    // no NHI is available — name + DOB + address is the minimum set).
    if (form.is_acc && !form.patient_nhi.trim() && !form.patient_address.trim())
                                       e.patient_address = 'Required for ACC claims when NHI is not provided'
    if (form.is_acc && !form.acc_injury_description.trim())
                                       e.acc_injury_description = 'Required for ACC claims'
    if (form.is_acc && !form.acc_employment_status)
                                       e.acc_employment_status = 'Required for ACC claims'
    // Work injuries need enough employer detail for ACC to contact the
    // employer to verify the claim (Sched 1 of Accident Compensation Act).
    if (form.is_acc && form.is_work_injury) {
      if (!form.acc_employer.trim())         e.acc_employer         = 'Required for work-related injuries'
      if (!form.acc_employer_address.trim()) e.acc_employer_address = 'Required for work-related injuries'
      if (!form.acc_employer_phone.trim())   e.acc_employer_phone   = 'Required for work-related injuries'
    }
    // Paediatric weight for safe weight-based dosing (ages 2-14).
    if (requiresWeight) {
      const w = parseFloat(form.patient_weight_kg)
      if (!form.patient_weight_kg) e.patient_weight_kg = "Required for children's dosing"
      else if (isNaN(w) || w < 5 || w > 100) e.patient_weight_kg = 'Enter weight in kilograms (5-100 kg)'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      const consultation = await db.consultations.create({
        ...form,
        status: 'waiting',
        acc_injury_date: form.acc_injury_date || null,
      })
      navigate(`/triage/${consultation.id}`)
    } catch (err) {
      console.error(err)
      setErrors({ submit: 'Something went wrong. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-shell">
      <header className="page-header">
        <span className="page-logo">TERE</span>
      </header>

      <div className="page-content">
        {/* Progress */}
        <div className="steps">
          <div className="step-item">
            <div className="step-dot active">1</div>
            <span className="step-label active">Your details</span>
          </div>
          <div className="step-line"></div>
          <div className="step-item">
            <div className="step-dot todo">2</div>
            <span className="step-label">Safety check</span>
          </div>
          <div className="step-line"></div>
          <div className="step-item">
            <div className="step-dot todo">3</div>
            <span className="step-label">Vitals</span>
          </div>
          <div className="step-line"></div>
          <div className="step-item">
            <div className="step-dot todo">4</div>
            <span className="step-label">See doctor</span>
          </div>
        </div>

        <div className="card">
          <h1 style={{ fontSize: '1.4rem', marginBottom: '0.25rem' }}>
            Tell us about yourself
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            This helps your doctor prepare before the video call.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            {/* Personal details */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Full name</label>
                <input className={`form-input ${errors.patient_name ? 'error' : ''}`}
                  value={form.patient_name} onChange={e => set('patient_name', e.target.value)}
                  placeholder="Your full name" autoComplete="name" />
                {errors.patient_name && <p className="form-error">{errors.patient_name}</p>}
              </div>
              <div className="form-group">
                <label className="form-label">Date of birth</label>
                <input type="date" className={`form-input ${errors.patient_dob ? 'error' : ''}`}
                  value={form.patient_dob} onChange={e => set('patient_dob', e.target.value)}
                  max={new Date().toISOString().split('T')[0]} />
                {errors.patient_dob && <p className="form-error">{errors.patient_dob}</p>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  NHI number <span className="optional">(optional)</span>
                </label>
                <input className="form-input" value={form.patient_nhi}
                  onChange={e => set('patient_nhi', e.target.value.toUpperCase())}
                  placeholder="e.g. ZZZ0016" maxLength={7} />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Phone <span className="optional">(optional)</span>
                </label>
                <input type="tel" className="form-input" value={form.patient_phone}
                  onChange={e => set('patient_phone', e.target.value)}
                  autoComplete="tel"
                  placeholder="021 000 0000" autoComplete="tel" />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                Physical address {form.is_acc && !form.patient_nhi ? '' : <span className="optional">(optional)</span>}
              </label>
              <input className={`form-input ${errors.patient_address ? 'error' : ''}`}
                value={form.patient_address}
                onChange={e => set('patient_address', e.target.value)}
                placeholder="Street address, suburb, city, postcode"
                autoComplete="street-address" />
              {errors.patient_address && <p className="form-error">{errors.patient_address}</p>}
            </div>

            {/* Paediatric weight — required for weight-based dosing (ages 2-14).
                Auto-shown when DOB puts the patient in that band. Doctor's
                Prescribe modal pre-fills its paediatric dose calculator from
                this. Weight of an infant / adult uses different logic. */}
            {requiresWeight && (
              <div className="form-group">
                <label className="form-label">
                  Child's weight (kg)
                </label>
                <input type="number" min={5} max={100} step={0.1}
                  className={`form-input ${errors.patient_weight_kg ? 'error' : ''}`}
                  value={form.patient_weight_kg}
                  onChange={e => set('patient_weight_kg', e.target.value)}
                  placeholder="e.g. 22" />
                <p style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 4 }}>
                  Needed so the doctor can prescribe the right dose for {form.patient_name ? form.patient_name.split(' ')[0] : 'your child'}. If unsure, weigh them now on a bathroom scale.
                </p>
                {errors.patient_weight_kg && <p className="form-error">{errors.patient_weight_kg}</p>}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Your location</label>
              <select className={`form-select ${errors.patient_location ? 'error' : ''}`}
                value={form.patient_location} onChange={e => set('patient_location', e.target.value)}>
                <option value="">Select your area</option>
                {LOCATIONS.map(l => <option key={l}>{l}</option>)}
              </select>
              {errors.patient_location && <p className="form-error">{errors.patient_location}</p>}
            </div>

            <div className="form-group">
              <label className="form-label">What's brought you here today?</label>
              <textarea className={`form-textarea ${errors.chief_complaint ? 'error' : ''}`}
                value={form.chief_complaint} onChange={e => set('chief_complaint', e.target.value)}
                placeholder="Describe what happened or what's wrong. Include when it started and how severe it is."
                rows={4} />
              {errors.chief_complaint && <p className="form-error">{errors.chief_complaint}</p>}
            </div>

            {/* ACC section */}
            <div style={{
              background: 'var(--bg)', borderRadius: 'var(--radius)',
              padding: '1rem 1.25rem', marginBottom: '1.25rem'
            }}>
              <label className="form-check" style={{ marginBottom: form.is_acc ? '1rem' : 0 }}>
                <input type="checkbox" checked={form.is_acc}
                  onChange={e => set('is_acc', e.target.checked)} />
                <span className="form-check-label">
                  <strong>This is an injury</strong> — I want to lodge an ACC claim
                </span>
              </label>

              {form.is_acc && (
                <>
                  <div className="form-group" style={{ marginBottom: '0.875rem' }}>
                    <label className="form-label">How did the injury happen?</label>
                    <textarea className={`form-textarea ${errors.acc_injury_description ? 'error' : ''}`}
                      value={form.acc_injury_description}
                      onChange={e => set('acc_injury_description', e.target.value)}
                      placeholder="Describe exactly how the injury occurred, where, and what you were doing"
                      rows={3} />
                    {errors.acc_injury_description && <p className="form-error">{errors.acc_injury_description}</p>}
                  </div>
                  <div className="form-group" style={{ marginBottom: '0.875rem' }}>
                    <label className="form-label">Date of injury</label>
                    <input type="date" className="form-input" value={form.acc_injury_date}
                      onChange={e => set('acc_injury_date', e.target.value)}
                      max={new Date().toISOString().split('T')[0]} />
                  </div>

                  {/* ACC needs employment context to certify weekly compensation
                      or a fit-for-work cert. Required whenever this is an ACC
                      claim, not just for work-related injuries. */}
                  <div className="form-group" style={{ marginBottom: '0.875rem' }}>
                    <label className="form-label">Employment status</label>
                    <select className={`form-input ${errors.acc_employment_status ? 'error' : ''}`}
                      value={form.acc_employment_status}
                      onChange={e => set('acc_employment_status', e.target.value)}>
                      <option value="">Select…</option>
                      <option value="employed">Employed</option>
                      <option value="self_employed">Self-employed</option>
                      <option value="not_employed">Not currently employed</option>
                      <option value="student">Student</option>
                      <option value="retired">Retired</option>
                    </select>
                    {errors.acc_employment_status && <p className="form-error">{errors.acc_employment_status}</p>}
                  </div>

                  <label className="form-check" style={{ marginBottom: form.is_work_injury ? '1rem' : 0 }}>
                    <input type="checkbox" checked={form.is_work_injury}
                      onChange={e => set('is_work_injury', e.target.checked)} />
                    <span className="form-check-label">
                      <strong>This was a work-related injury</strong> — happened at work or during work duties
                    </span>
                  </label>

                  {form.is_work_injury && (
                    <>
                      <div className="form-group" style={{ marginBottom: '0.875rem' }}>
                        <label className="form-label">Employer name</label>
                        <input className={`form-input ${errors.acc_employer ? 'error' : ''}`}
                          value={form.acc_employer}
                          onChange={e => set('acc_employer', e.target.value)}
                          placeholder="Company name"
                          autoComplete="section-work organization" />
                        {errors.acc_employer && <p className="form-error">{errors.acc_employer}</p>}
                      </div>
                      <div className="form-group" style={{ marginBottom: '0.875rem' }}>
                        <label className="form-label">Employer address</label>
                        <input className={`form-input ${errors.acc_employer_address ? 'error' : ''}`}
                          value={form.acc_employer_address}
                          onChange={e => set('acc_employer_address', e.target.value)}
                          placeholder="Street address, suburb, city, postcode"
                          autoComplete="section-work street-address" />
                        {errors.acc_employer_address && <p className="form-error">{errors.acc_employer_address}</p>}
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Employer phone</label>
                        <input type="tel" className={`form-input ${errors.acc_employer_phone ? 'error' : ''}`}
                          value={form.acc_employer_phone}
                          onChange={e => set('acc_employer_phone', e.target.value)}
                          placeholder="03 000 0000"
                          autoComplete="section-work tel" />
                        {errors.acc_employer_phone && <p className="form-error">{errors.acc_employer_phone}</p>}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Recording consent */}
            <div className="alert alert-info" style={{ marginBottom: '1.25rem' }}>
              <span style={{ fontSize: '1.2rem' }}>🎙</span>
              <div>
                <strong>Tere Scribe — AI notes</strong>
                <p style={{ marginTop: 4, fontSize: '0.875rem' }}>
                  Your consultation can be recorded and automatically transcribed
                  to help your doctor write accurate notes. The recording is
                  deleted immediately after transcription.
                </p>
                <label className="form-check" style={{ marginTop: 8 }}>
                  <input type="checkbox" checked={form.recording_consent}
                    onChange={e => set('recording_consent', e.target.checked)} />
                  <span className="form-check-label">
                    I consent to recording and AI transcription
                  </span>
                </label>
              </div>
            </div>

            {errors.submit && (
              <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
                {errors.submit}
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-lg"
              style={{ width: '100%' }} disabled={loading}>
              {loading ? <><span className="spinner" style={{ width:18,height:18,borderWidth:2 }} /> Saving…</> : 'Continue →'}
            </button>

            <p style={{ textAlign:'center', fontSize:'0.78rem', color:'var(--muted)', marginTop:'1rem' }}>
              Your information is encrypted and used only for your care.
              Tere Health Limited — MCNZ registered Emergency Medicine physician.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
