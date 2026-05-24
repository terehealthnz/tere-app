import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getConsultation, subscribeToQueue } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'

export default function WaitingRoom() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('waiting')
  const [providerName, setProviderName] = useState(null)
  const consultationId = sessionStorage.getItem('consultationId')
  const pushFiredRef = useRef(false)

  async function cancelConsultation() {
    try {
      const { supabase } = await import('../../lib/supabase')
      await supabase.from('consultations').update({ status: 'cancelled' }).eq('id', consultationId)
      // Release payment hold
      const paymentIntentId = sessionStorage.getItem('paymentIntentId')
      if (paymentIntentId) {
        await apiFetch('/api/cancel-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId })
        })
      }
    } catch {}
    sessionStorage.clear()
    navigate('/triage')
  }

  // Fire push notification to all available providers once when patient enters queue
  useEffect(() => {
    if (!consultationId || consultationId.startsWith('demo') || pushFiredRef.current) return
    pushFiredRef.current = true
    getConsultation(consultationId).then(c => {
      apiFetch('/api/push-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'new_patient',
          consultationId,
          patientName: `${c.patient_first_name || ''} ${c.patient_last_name || ''}`.trim(),
          chiefComplaint: c.chief_complaint || '',
          accEligible: c.acc_eligible === 'yes',
        }),
      }).catch(() => {})
    }).catch(() => {})
  }, [consultationId])

  useEffect(() => {
    const poll = async () => {
      if (!consultationId || consultationId.startsWith('demo')) return
      try {
        const consult = await getConsultation(consultationId)
        if (!consult) return
        if (consult.provider_display_name) setProviderName(consult.provider_display_name)
        // Provider has requested vitals - go scan
        if (consult.status === 'vitals_requested') {
          navigate('/vitals')
          return
        }
        // Clinician has admitted patient — join call
        if (consult.daily_room_url && ['ready','in_progress'].includes(consult.status)) {
          navigate('/call')
          return
        }
      } catch {}
    }

    poll()
    const interval = setInterval(poll, 4000)

    const sub = subscribeToQueue(({ new: row }) => {
      if (row?.id !== consultationId) return
      if (row.status === 'vitals_requested') {
        navigate('/vitals')
      } else if (row.daily_room_url && ['ready','in_progress'].includes(row.status)) {
        navigate('/call')
      }
    })

    return () => { clearInterval(interval); sub?.unsubscribe?.() }
  }, [consultationId, navigate])

  return (
    <div className="page">
      <nav className="navbar">
        <span className="navbar-brand">Tere</span>
      </nav>
      <div className="container" style={{paddingTop:'2.5rem',paddingBottom:'3rem',textAlign:'center'}}>
        <div className="card">
          <div className="spinner" style={{marginBottom:'1.5rem'}} />
          <h2 style={{marginBottom:'.5rem'}}>{providerName ? `${providerName} will be with you shortly` : 'Your clinician will be with you shortly'}</h2>
          <p style={{marginBottom:'1.5rem',lineHeight:1.7}}>
            Please keep this screen open. Your clinician will ask you to scan your vital signs when they are ready for you.
            This usually takes 2–5 minutes.
          </p>
          <div style={{background:'var(--bg)',borderRadius:'var(--radius-sm)',padding:'1rem',marginBottom:'1.5rem',fontSize:'.875rem',lineHeight:1.7}}>
            <strong style={{display:'block',marginBottom:'.25rem'}}>While you wait</strong>
            Sit somewhere comfortable with good lighting on your face. You will need your phone camera for a 30-second vital signs scan.
          </div>
          <button onClick={cancelConsultation}
            style={{background:'none',border:'none',color:'var(--muted)',fontSize:'.8125rem',cursor:'pointer',textDecoration:'underline',display:'block',width:'100%',textAlign:'center'}}>
            Cancel and start over
          </button>
        </div>
        <div style={{marginTop:'1.25rem',display:'flex',flexDirection:'column',gap:'.375rem'}}>
          <p style={{fontSize:'.8125rem',color:'var(--muted)',margin:0}}>
            Emergency? Call <strong>111</strong> immediately.
          </p>
          <p style={{fontSize:'.8125rem',color:'var(--muted)',margin:0}}>
            Mental health crisis? Call or text <strong>1737</strong> (free, 24/7).
          </p>
        </div>
      </div>
    </div>
  )
}
