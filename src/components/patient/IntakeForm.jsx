import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createConsultation } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'

const RED_FLAGS = [
  'Chest pain or pressure',
  'Difficulty breathing or shortness of breath',
  'Signs of stroke: facial drooping, arm weakness, or speech difficulty',
  'Severe head injury or loss of consciousness',
  'Major bleeding that will not stop',
  'Severe allergic reaction: throat swelling or difficulty breathing',
  'Child who is unresponsive or having a seizure',
]

const LOCATIONS = [
  'Marlborough Sounds','Havelock','Picton','Blenheim rural',
  'Pelorus Sound','Queen Charlotte Sound','Kenepuru Sound',
  'Nelson / Tasman rural','West Coast','Canterbury rural',
  'Northland','Coromandel','East Coast / Gisborne',
  "Hawke's Bay rural",'Whanganui rural','Other rural area',
]

export default function IntakeForm() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [accVerifying, setAccVerifying] = useState(false)
  const [accResult, setAccResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    firstName:'', lastName:'', nhi:'', dob:'', phone:'', email:'', location:'', pharmacy:'',
    complaint:'', duration:'', redFlag:'',
    accEligible:'', employer:'', injuryDate:'', injuryDetails:'',
    recordingConsent: false, accConsent: false,
  })

  const set = (k, v) => setForm(f => ({...f, [k]: v}))
  const val = e => {
    let v = e.target.value
    if (e.target.name === 'phone') v = v.replace(/[^\d+]/g, '')
    if (e.target.name === 'nhi')   v = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)
    set(e.target.name, v)
  }

  const NHI_RE = /^[A-Z]{3}\d{2}(\d{2}|[A-Z]{2})$/
  const nhiValid = !form.nhi || NHI_RE.test(form.nhi)

  if (form.redFlag === 'yes') return (
    <div className="page" style={{background:'#FEE2E2'}}>
      <div className="container" style={{paddingTop:'3rem'}}>
        <div className="card" style={{borderLeft:'6px solid #DC2626'}}>
          <h1 style={{color:'#991B1B',marginBottom:'.75rem'}}>Call 111 now</h1>
          <p style={{color:'#7F1D1D',marginBottom:'1.25rem',lineHeight:1.7}}>
            Your symptoms require emergency services immediately.
            <strong> Do not wait for a Tere consultation.</strong>
          </p>
          <a href="tel:111" className="btn btn-danger btn-full" style={{fontSize:'1.125rem',padding:'1rem',textAlign:'center'}}>
            📞 Call 111
          </a>
          <button onClick={() => set('redFlag','')} className="btn btn-secondary btn-full" style={{marginTop:'.75rem'}}>
            My symptoms are different — go back
          </button>
        </div>
      </div>
    </div>
  )

  async function verifyACC() {
    if (form.accEligible !== 'yes') return
    setAccVerifying(true)
    try {
      const res = await apiFetch('/api/verify-acc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaint: form.complaint,
          injuryDetails: form.injuryDetails,
          injuryDate: form.injuryDate,
          employer: form.employer
        })
      })
      const data = await res.json()
      setAccResult(data)
      sessionStorage.setItem('accAssessment', JSON.stringify(data))
    } catch (e) { console.error(e) }
    setAccVerifying(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    await verifyACC()
    if (!form.recordingConsent) { setError('Please confirm recording consent to continue.'); return }
    setLoading(true); setError('')
    try {
      const consult = await createConsultation(form)
      sessionStorage.setItem('consultationId', consult.id)
      sessionStorage.setItem('consultationData', JSON.stringify(form))
      sessionStorage.setItem('accEligible', form.accEligible)
      navigate('/payment')
    } catch (err) {
      console.error(err)
      // For dev/demo without Supabase: store locally and continue
      const mockId = 'demo-' + Date.now()
      sessionStorage.setItem('consultationId', mockId)
      sessionStorage.setItem('consultationData', JSON.stringify(form))
      sessionStorage.setItem('accEligible', form.accEligible)
      navigate('/payment')
    } finally {
      setLoading(false)
    }
  }

  const steps = ['Your details','Chief complaint','ACC details','Consent']

  return (
    <div className="page">
      <nav className="navbar">
        <span className="navbar-brand">Tere</span>
        <span style={{color:'rgba(255,255,255,.5)',fontSize:'.875rem',fontStyle:'italic'}}>He tere, he ora</span>
      </nav>

      <div className="container" style={{paddingTop:'1.75rem',paddingBottom:'3rem'}}>
        {/* Step indicators */}
        <div style={{display:'flex',alignItems:'center',marginBottom:'1.5rem',gap:'4px'}}>
          {steps.map((t,i) => (
            <React.Fragment key={i}>
              <div style={{display:'flex',alignItems:'center',gap:'6px',flex:1}}>
                <div style={{
                  width:26,height:26,borderRadius:'50%',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:'.75rem',fontWeight:700,flexShrink:0,
                  background: i+1<step ? 'var(--success)' : i+1===step ? 'var(--teal)' : 'var(--border)',
                  color: i+1<=step ? 'white' : 'var(--muted)',
                }}>
                  {i+1 < step ? '✓' : i+1}
                </div>
                {i < steps.length-1 && (
                  <div style={{flex:1,height:2,background: i+1<step ? 'var(--success)' : 'var(--border)'}} />
                )}
              </div>
            </React.Fragment>
          ))}
        </div>

        <div className="card">
          <h2 style={{marginBottom:'1.25rem'}}>{steps[step-1]}</h2>
          <form onSubmit={handleSubmit}>

            {step === 1 && <>
              <div className="form-row">
                <div className="form-group">
                  <label>First name</label>
                  <input name="firstName" value={form.firstName} onChange={val} required placeholder="Aroha" />
                </div>
                <div className="form-group">
                  <label>Last name</label>
                  <input name="lastName" value={form.lastName} onChange={val} required placeholder="Smith" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>NHI number</label>
                  <input name="nhi" value={form.nhi} onChange={val} required placeholder="ZZZ0016" maxLength={7} autoComplete="off" style={!nhiValid ? {borderColor:'#DC2626'} : {}} />
                  {!nhiValid && <div style={{color:'#DC2626',fontSize:'.75rem',marginTop:3}}>Format: 3 letters + 4 characters (e.g. ZZZ0016)</div>}
                </div>
                <div className="form-group">
                  <label>Date of birth</label>
                  <input name="dob" type="date" value={form.dob} onChange={val} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Mobile number</label>
                  <input name="phone" type="tel" value={form.phone} onChange={val} required placeholder="0210000000" autoComplete="tel" inputMode="tel" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Email</label>
                  <input name="email" type="email" value={form.email} onChange={val} required placeholder="you@example.com" />
                </div>
                <div className="form-group">
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Your location</label>
                  <select name="location" value={form.location} onChange={val} required>
                    <option value="">Select area…</option>
                    {LOCATIONS.map(l => <option key={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Preferred pharmacy</label>
                <input name="pharmacy" value={form.pharmacy} onChange={val} required placeholder="e.g. Havelock Pharmacy" />
              </div>
            </>}

            {step === 2 && <>
              <div className="alert alert-warning">
                <strong>Emergency symptoms?</strong>
                If you have any of the following, call 111 immediately.
              </div>
              <div className="form-group">
                <label>Do you have any of these symptoms right now?</label>
                <div style={{display:'flex',flexDirection:'column',gap:'.625rem',margin:'.75rem 0 1rem'}}>
                  {RED_FLAGS.map(flag => (
                    <label key={flag} style={{display:'flex',alignItems:'flex-start',gap:'.625rem',fontWeight:400,cursor:'pointer',fontSize:'.9375rem',color:'#374151'}}>
                      <input type="radio" name="redFlag" value="yes" onChange={() => set('redFlag','yes')}
                        style={{width:'auto',marginTop:'3px',flexShrink:0}} />
                      {flag}
                    </label>
                  ))}
                  <label style={{display:'flex',alignItems:'center',gap:'.625rem',fontWeight:600,cursor:'pointer',marginTop:'.25rem',color:'var(--success)'}}>
                    <input type="radio" name="redFlag" value="no" onChange={() => set('redFlag','no')} required
                      style={{width:'auto',flexShrink:0}} />
                    None of the above
                  </label>
                </div>
              </div>
              {form.redFlag === 'no' && <>
                <div className="form-group">
                  <label>What is the main problem today?</label>
                  <textarea name="complaint" value={form.complaint} onChange={val} required rows={3}
                    placeholder="e.g. I twisted my ankle this morning and cannot put weight on it..." />
                </div>
                <div className="form-group">
                  <label>How long have you had this problem?</label>
                  <select name="duration" value={form.duration} onChange={val} required>
                    <option value="">Select…</option>
                    <option>Less than 1 hour</option><option>1–6 hours</option>
                    <option>6–24 hours</option><option>1–3 days</option>
                    <option>More than 3 days</option>
                  </select>
                </div>
              </>}
            </>}

            {step === 3 && <>
              <div className="form-group">
                <label>Is this an injury or accident?</label>
                <select name="accEligible" value={form.accEligible} onChange={val} required>
                  <option value="">Select…</option>
                  <option value="yes">Yes — injury or accident (ACC may apply)</option>
                  <option value="no">No — illness or other concern</option>
                  <option value="unsure">Not sure</option>
                </select>
              </div>
              {accVerifying && (
                <div style={{padding:'.875rem',background:'#F0F9FA',borderRadius:'var(--radius-sm)',border:'1px solid var(--teal-light)',marginBottom:'1rem',fontSize:'.9375rem',color:'var(--teal)'}}>
                  🔍 Verifying ACC eligibility…
                </div>
              )}
              {accResult && (
                <div style={{padding:'.875rem',borderRadius:'var(--radius-sm)',marginBottom:'1rem',fontSize:'.875rem',
                  background: accResult.verdict==='ELIGIBLE'?'#F0FDF4':accResult.verdict==='FLAGGED'?'#FEF2F2':'#FEF3C7',
                  border: accResult.verdict==='ELIGIBLE'?'1px solid #BBF7D0':accResult.verdict==='FLAGGED'?'1px solid #FECACA':'1px solid #FDE68A'
                }}>
                  <div style={{fontWeight:700,marginBottom:'.25rem',
                    color: accResult.verdict==='ELIGIBLE'?'#065F46':accResult.verdict==='FLAGGED'?'#991B1B':'#92400E'
                  }}>
                    {accResult.verdict==='ELIGIBLE'?'✓ Likely ACC-eligible':accResult.verdict==='FLAGGED'?'⚠ Possible eligibility concern':'ℹ Further assessment needed'}
                  </div>
                  <div style={{lineHeight:1.6}}>{accResult.reasoning}</div>
                </div>
              )}
              {form.accEligible === 'yes' && <>
                <div className="alert alert-success">
                  <strong>ACC eligible</strong>
                  Your consultation and related imaging may be funded by ACC. We will lodge the claim for you.
                </div>
                <div className="form-group">
                  <label>Employer <span className="label-opt">(if work-related)</span></label>
                  <input name="employer" value={form.employer} onChange={val} placeholder="Company name" />
                </div>
                <div className="form-group">
                  <label>Date of injury</label>
                  <input name="injuryDate" type="date" value={form.injuryDate} onChange={val} />
                </div>
                <div className="form-group">
                  <label>How did the injury happen?</label>
                  <textarea name="injuryDetails" value={form.injuryDetails} onChange={val} rows={2}
                    placeholder="e.g. Fell from ladder on boat..." />
                </div>
                <div className="alert alert-info">
                  Your doctor will obtain your formal ACC45 consent at the start of your consultation.
                </div>
              </>}
            </>}

            {step === 4 && <>
              <div className="alert alert-info" style={{marginBottom:'1.25rem'}}>
                <strong>Your consultation</strong>
                Video consultation with an MCNZ-registered Emergency Medicine physician.
                Please read and confirm the following before we start.
              </div>

              <div style={{background:'#F0F9FA',border:'1.5px solid var(--teal-light)',borderRadius:'var(--radius-sm)',padding:'1rem',marginBottom:'1rem'}}>
                <label style={{display:'flex',alignItems:'flex-start',gap:'.75rem',cursor:'pointer',fontWeight:400}}>
                  <input type="checkbox" checked={form.recordingConsent}
                    onChange={e => set('recordingConsent', e.target.checked)}
                    style={{width:'18px',height:'18px',marginTop:'2px',flexShrink:0,accentColor:'var(--teal)'}} />
                  <span style={{fontSize:'.9375rem',lineHeight:1.6}}>
                    <strong>I consent to this consultation being recorded and transcribed</strong> by Tere's AI documentation system to generate clinical notes. The recording is not retained after processing.
                  </span>
                </label>
              </div>

              <div style={{background:'#F8FAFC',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'1rem',marginBottom:'1rem',fontSize:'.875rem',color:'var(--muted)',lineHeight:1.6}}>
                <strong style={{color:'var(--text)',display:'block',marginBottom:'.375rem'}}>Privacy</strong>
                Your health information is stored by Tere Health Limited under the Privacy Act 2020 and Health Information Privacy Code 2020. It is shared only with your treating clinician, your GP (with permission), and ACC (if a claim is lodged).
              </div>

              <div style={{background:'#F8FAFC',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'1rem',fontSize:'.875rem',color:'var(--muted)',lineHeight:1.6}}>
                <strong style={{color:'var(--text)',display:'block',marginBottom:'.375rem'}}>Telehealth limitations</strong>
                If your clinician determines that your condition cannot be adequately assessed by video, they will direct you to in-person care. Call 111 for emergencies — do not use Tere.
              </div>

              {error && <div className="alert alert-danger" style={{marginTop:'1rem'}}>{error}</div>}
            </>}

            <div style={{display:'flex',gap:'.75rem',marginTop:'1.5rem'}}>
              {step > 1 && (
                <button type="button" className="btn btn-secondary" onClick={() => {setError('');setStep(s=>s-1)}}>
                  Back
                </button>
              )}
              {step < 4 ? (
                <button type="button" className="btn btn-primary" style={{flex:1}}
                  onClick={() => {
                    if (step===2 && !form.redFlag) { setError('Please answer the emergency question above.'); return }
                    setError(''); setStep(s=>s+1)
                  }}>
                  Continue
                </button>
              ) : (
                <button type="submit" className="btn btn-primary" style={{flex:1}} disabled={loading || !form.recordingConsent}>
                  {loading ? 'Starting…' : 'Start my consultation'}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
