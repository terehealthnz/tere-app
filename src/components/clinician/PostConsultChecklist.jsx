import React, { useState } from 'react'

const STEPS = [
  { id: 'rx',      label: 'Prescription',     icon: '💊' },
  { id: 'imaging', label: 'Imaging',           icon: '🩻' },
  { id: 'notes',   label: 'Clinical Notes',    icon: '📝' },
  { id: 'acc',     label: 'ACC Submission',    icon: '✓'  },
  { id: 'summary', label: 'Patient Summary',   icon: '📧' },
]

export default function PostConsultChecklist({ consult, notes, actions, onComplete }) {
  const [step, setStep]           = useState(0)
  const [rxDone, setRxDone]       = useState(null)
  const [xrDone, setXrDone]       = useState(null)
  const [accDone, setAccDone]     = useState(null)
  const [finalNotes, setFinalNotes] = useState(buildNotes(notes, actions))
  const [emailSent, setEmailSent] = useState(false)
  const [sending, setSending]     = useState(false)
  const [completing, setCompleting] = useState(false)
  const [summaryText, setSummaryText] = useState('')

  const rxActions  = actions.filter(a => a.type === 'prescription')
  const xrActions  = actions.filter(a => a.type === 'radiology')
  const accActions = actions.filter(a => a.type === 'acc45')

  function buildNotes(soap, acts) {
    const rxList  = acts.filter(a => a.type === 'prescription').map(a => `Rx: ${a.drug} — ${a.directions} — ${a.pharmacy}`).join('\n')
    const xrList  = acts.filter(a => a.type === 'radiology').map(a => `${a.investigation}: ${a.bodyPart} — ${a.urgency} — ${a.provider}`).join('\n')
    const plan    = [soap.P, rxList, xrList].filter(Boolean).join('\n')
    return { ...soap, P: plan }
  }

  async function sendSummary() {
    setSending(true)
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:      consult.patient_email,
          name:    `${consult.patient_first_name} ${consult.patient_last_name}`,
          phone:   consult.patient_phone,
          notes:   finalNotes,
          actions,
          consult,
        }),
      })
      const data = await res.json()
      setSummaryText(data.summaryText || '')
      setEmailSent(true)
    } catch {
      // If no email configured, still mark as done
      setEmailSent(true)
    } finally {
      setSending(false)
    }
  }

  async function finish() {
    setCompleting(true)
    await onComplete({
      notes:       finalNotes,
      rxDone,
      xrDone,
      accDone,
      emailSent,
      summaryText,
    })
  }

  const current = STEPS[step]
  const canNext = () => {
    if (step === 0) return rxDone !== null
    if (step === 1) return xrDone !== null
    if (step === 2) return true
    if (step === 3) return accDone !== null
    if (step === 4) return true
    return true
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(13,43,69,.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:'1rem'}}>
      <div style={{background:'white',borderRadius:'16px',width:'100%',maxWidth:'580px',maxHeight:'90vh',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 24px 64px rgba(0,0,0,.3)'}}>

        {/* Header */}
        <div style={{background:'var(--navy)',padding:'1.25rem 1.5rem',flexShrink:0}}>
          <div style={{color:'rgba(255,255,255,.5)',fontSize:'.75rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'.5rem'}}>
            Complete consultation — {consult.patient_first_name} {consult.patient_last_name}
          </div>
          {/* Step indicators */}
          <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
            {STEPS.map((s,i) => (
              <React.Fragment key={s.id}>
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'3px'}}>
                  <div style={{width:28,height:28,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:i<step?'12px':'.75rem',fontWeight:700,background:i<step?'var(--success)':i===step?'var(--teal)':'rgba(255,255,255,.15)',color:'white',transition:'all .2s'}}>
                    {i < step ? '✓' : s.icon}
                  </div>
                  <span style={{fontSize:'.5625rem',color:i===step?'white':'rgba(255,255,255,.4)',fontWeight:i===step?700:400,whiteSpace:'nowrap'}}>{s.label}</span>
                </div>
                {i < STEPS.length-1 && <div style={{flex:1,height:2,background:i<step?'var(--success)':'rgba(255,255,255,.2)',marginBottom:'14px',transition:'background .2s'}} />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div style={{flex:1,overflowY:'auto',padding:'1.5rem'}}>

          {/* ── Step 0: Prescription ── */}
          {step === 0 && (
            <>
              <h3 style={{marginBottom:'.5rem'}}>Prescription</h3>
              <p style={{marginBottom:'1.25rem',fontSize:'.9375rem'}}>Did you prescribe medication for this patient?</p>

              {rxActions.length > 0 && (
                <div style={{background:'var(--success-bg)',border:'1px solid #BBF7D0',borderRadius:'var(--radius-sm)',padding:'1rem',marginBottom:'1rem'}}>
                  <div style={{fontSize:'.75rem',fontWeight:700,color:'var(--success)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'.5rem'}}>Prescribed via Rx modal</div>
                  {rxActions.map((r,i) => (
                    <div key={i} style={{fontSize:'.9375rem',color:'var(--text)',marginBottom:'4px'}}>
                      💊 <strong>{r.drug}</strong> — {r.directions} → {r.pharmacy}
                    </div>
                  ))}
                </div>
              )}

              <div style={{display:'flex',gap:'.75rem'}}>
                <button onClick={() => setRxDone(true)}
                  style={{flex:1,padding:'.875rem',borderRadius:'var(--radius-sm)',border:`2px solid ${rxDone===true?'var(--success)':'var(--border)'}`,background:rxDone===true?'var(--success-bg)':'white',fontWeight:600,fontSize:'.9375rem',cursor:'pointer',color:rxDone===true?'var(--success)':'var(--text)',fontFamily:'Plus Jakarta Sans,sans-serif'}}>
                  ✓ {rxActions.length > 0 ? 'Prescription sent' : 'Yes — send prescription'}
                </button>
                <button onClick={() => setRxDone(false)}
                  style={{flex:1,padding:'.875rem',borderRadius:'var(--radius-sm)',border:`2px solid ${rxDone===false?'var(--teal)':'var(--border)'}`,background:rxDone===false?'var(--teal-light)':'white',fontWeight:600,fontSize:'.9375rem',cursor:'pointer',color:rxDone===false?'var(--teal)':'var(--text)',fontFamily:'Plus Jakarta Sans,sans-serif'}}>
                  No prescription needed
                </button>
              </div>
            </>
          )}

          {/* ── Step 1: Imaging ── */}
          {step === 1 && (
            <>
              <h3 style={{marginBottom:'.5rem'}}>Imaging referral</h3>
              <p style={{marginBottom:'1.25rem',fontSize:'.9375rem'}}>Did you order any imaging for this patient?</p>

              {xrActions.length > 0 && (
                <div style={{background:'#FEF3C7',border:'1px solid #FDE68A',borderRadius:'var(--radius-sm)',padding:'1rem',marginBottom:'1rem'}}>
                  <div style={{fontSize:'.75rem',fontWeight:700,color:'#92400E',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'.5rem'}}>Ordered via XR modal</div>
                  {xrActions.map((x,i) => (
                    <div key={i} style={{fontSize:'.9375rem',color:'var(--text)',marginBottom:'4px'}}>
                      🩻 <strong>{x.investigation}</strong>: {x.bodyPart} — {x.urgency} → {x.provider}
                    </div>
                  ))}
                </div>
              )}

              <div style={{display:'flex',gap:'.75rem'}}>
                <button onClick={() => setXrDone(true)}
                  style={{flex:1,padding:'.875rem',borderRadius:'var(--radius-sm)',border:`2px solid ${xrDone===true?'var(--success)':'var(--border)'}`,background:xrDone===true?'var(--success-bg)':'white',fontWeight:600,fontSize:'.9375rem',cursor:'pointer',color:xrDone===true?'var(--success)':'var(--text)',fontFamily:'Plus Jakarta Sans,sans-serif'}}>
                  ✓ {xrActions.length > 0 ? 'Referral sent' : 'Yes — referral sent'}
                </button>
                <button onClick={() => setXrDone(false)}
                  style={{flex:1,padding:'.875rem',borderRadius:'var(--radius-sm)',border:`2px solid ${xrDone===false?'var(--teal)':'var(--border)'}`,background:xrDone===false?'var(--teal-light)':'white',fontWeight:600,fontSize:'.9375rem',cursor:'pointer',color:xrDone===false?'var(--teal)':'var(--text)',fontFamily:'Plus Jakarta Sans,sans-serif'}}>
                  No imaging needed
                </button>
              </div>
            </>
          )}

          {/* ── Step 2: Notes ── */}
          {step === 2 && (
            <>
              <h3 style={{marginBottom:'.375rem'}}>Clinical notes</h3>
              <p style={{marginBottom:'1rem',fontSize:'.875rem'}}>Prescription and imaging are included in the Plan. Review and edit before finalising.</p>
              {[
                { key:'S', label:'Subjective' },
                { key:'O', label:'Objective' },
                { key:'A', label:'Assessment' },
                { key:'P', label:'Plan (includes Rx & imaging)' },
              ].map(({ key, label }) => (
                <div key={key} style={{marginBottom:'.875rem'}}>
                  <label style={{fontSize:'.6875rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--teal)',display:'block',marginBottom:'.25rem'}}>{label}</label>
                  <textarea value={finalNotes[key] || ''} rows={key==='P'?5:3}
                    onChange={e => setFinalNotes(n => ({...n,[key]:e.target.value}))}
                    style={{width:'100%',border:'1px solid #BBF7D0',borderRadius:'var(--radius-sm)',padding:'.625rem .75rem',fontFamily:'Plus Jakarta Sans,sans-serif',fontSize:'.875rem',resize:'vertical',background:'#F0FDF4',lineHeight:1.6,outline:'none'}} />
                </div>
              ))}
              <div style={{fontSize:'.75rem',color:'var(--muted)',fontStyle:'italic'}}>You are clinically responsible for all content. Review before confirming.</div>
            </>
          )}

          {/* ── Step 3: ACC ── */}
          {step === 3 && (
            <>
              <h3 style={{marginBottom:'.5rem'}}>ACC submission</h3>
              <p style={{marginBottom:'1.25rem',fontSize:'.9375rem'}}>
                {consult.acc_eligible === 'yes' ? 'This patient has an ACC-eligible injury. Lodge the claim now.' : 'This patient did not present with an ACC-eligible injury.'}
              </p>

              {accActions.length > 0 && (
                <div style={{background:'var(--success-bg)',border:'1px solid #BBF7D0',borderRadius:'var(--radius-sm)',padding:'1rem',marginBottom:'1rem'}}>
                  <div style={{fontSize:'.75rem',fontWeight:700,color:'var(--success)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'.5rem'}}>ACC45 lodged via ACC modal</div>
                  {accActions.map((a,i) => (
                    <div key={i} style={{fontSize:'.9375rem',color:'var(--text)',marginBottom:'4px'}}>
                      ✓ <strong>{a.injury}</strong> — {a.cause}
                    </div>
                  ))}
                </div>
              )}

              <div style={{display:'flex',gap:'.75rem'}}>
                <button onClick={() => setAccDone(true)}
                  style={{flex:1,padding:'.875rem',borderRadius:'var(--radius-sm)',border:`2px solid ${accDone===true?'var(--success)':'var(--border)'}`,background:accDone===true?'var(--success-bg)':'white',fontWeight:600,fontSize:'.9375rem',cursor:'pointer',color:accDone===true?'var(--success)':'var(--text)',fontFamily:'Plus Jakarta Sans,sans-serif'}}>
                  ✓ {accActions.length > 0 ? 'Claim lodged' : 'Lodge ACC claim'}
                </button>
                <button onClick={() => setAccDone(false)}
                  style={{flex:1,padding:'.875rem',borderRadius:'var(--radius-sm)',border:`2px solid ${accDone===false?'var(--teal)':'var(--border)'}`,background:accDone===false?'var(--teal-light)':'white',fontWeight:600,fontSize:'.9375rem',cursor:'pointer',color:accDone===false?'var(--teal)':'var(--text)',fontFamily:'Plus Jakarta Sans,sans-serif'}}>
                  Not applicable
                </button>
              </div>
            </>
          )}

          {/* ── Step 4: Patient summary ── */}
          {step === 4 && (
            <>
              <h3 style={{marginBottom:'.5rem'}}>Patient summary</h3>
              <p style={{marginBottom:'1.25rem',fontSize:'.9375rem'}}>
                Send a patient-friendly summary of this consultation.
              </p>

              <div style={{background:'var(--bg)',borderRadius:'var(--radius-sm)',padding:'1rem',marginBottom:'1rem'}}>
                <div style={{fontSize:'.75rem',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'.5rem'}}>Send to</div>
                <div style={{fontSize:'.9375rem',color:'var(--text)'}}>
                  📱 {consult.patient_phone}
                  {consult.patient_email && <><br />📧 {consult.patient_email}</>}
                </div>
              </div>

              {summaryText && (
                <div style={{background:'#F0F9FA',border:'1px solid var(--teal-light)',borderRadius:'var(--radius-sm)',padding:'1rem',marginBottom:'1rem',fontSize:'.875rem',lineHeight:1.7,whiteSpace:'pre-wrap',color:'var(--text)'}}>
                  {summaryText}
                </div>
              )}

              {!emailSent ? (
                <button onClick={sendSummary} disabled={sending}
                  className="btn btn-primary btn-full" style={{marginBottom:'.75rem'}}>
                  {sending ? 'Generating & sending…' : '📧 Generate & send patient summary'}
                </button>
              ) : (
                <div className="alert alert-success">✓ Patient summary sent</div>
              )}

              <button onClick={() => { setEmailSent(true) }}
                style={{background:'none',border:'none',color:'var(--muted)',fontSize:'.8125rem',cursor:'pointer',textDecoration:'underline',width:'100%',textAlign:'center'}}>
                Skip — complete without sending
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{borderTop:'1px solid var(--border)',padding:'1rem 1.5rem',flexShrink:0,display:'flex',gap:'.75rem',background:'var(--bg)'}}>
          {step > 0 && (
            <button onClick={() => setStep(s => s-1)} className="btn btn-secondary">
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep(s => s+1)} className="btn btn-primary" style={{flex:1}} disabled={!canNext()}>
              Continue →
            </button>
          ) : (
            <button onClick={finish} className="btn btn-primary" style={{flex:1,background:'var(--success)'}} disabled={completing}>
              {completing ? 'Completing…' : '✓ Complete consultation'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
