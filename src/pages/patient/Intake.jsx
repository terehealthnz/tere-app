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
    patient_phone: '', patient_location: '',
    chief_complaint: '',
    is_acc: false,
    acc_injury_description: '', acc_employer: '', acc_injury_date: '',
    recording_consent: false,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const validate = () => {
    const e = {}
    if (!form.patient_name.trim())     e.patient_name    = 'Required'
    if (!form.patient_dob)             e.patient_dob     = 'Required'
    if (!form.patient_location)        e.patient_location= 'Required'
    if (!form.chief_complaint.trim())  e.chief_complaint = 'Required — describe what happened or what\'s wrong'
    if (form.is_acc && !form.acc_injury_description.trim())
                                       e.acc_injury_description = 'Required for ACC claims'
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
                  placeholder="021 000 0000" autoComplete="tel" />
              </div>
            </div>

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
                  <div className="form-row">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">
                        Employer <span className="optional">(if work injury)</span>
                      </label>
                      <input className="form-input" value={form.acc_employer}
                        onChange={e => set('acc_employer', e.target.value)}
                        placeholder="Company name" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Date of injury</label>
                      <input type="date" className="form-input" value={form.acc_injury_date}
                        onChange={e => set('acc_injury_date', e.target.value)}
                        max={new Date().toISOString().split('T')[0]} />
                    </div>
                  </div>
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
