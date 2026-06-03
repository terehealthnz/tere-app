import React, { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getConsultation } from '../../lib/supabase'

export default function ResumePayment() {
  const { id } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    async function resume() {
      try {
        const c = await getConsultation(id)

        // Check 15 minute window
        const notifiedAt = c?.waitlist_notified_at
        if (notifiedAt) {
          const elapsed = (Date.now() - new Date(notifiedAt)) / 60000
          if (elapsed > 15) {
            navigate('/?expired=1')
            return
          }
        }

        // Restore full session so payment page has all context
        sessionStorage.setItem('consultationId', id)
        sessionStorage.setItem('accEligible', c?.acc_eligible || 'no')
        sessionStorage.setItem('consultationType', c?.consultation_type || 'video')
        sessionStorage.setItem('patientName', `${c?.patient_first_name || ''} ${c?.patient_last_name || ''}`.trim())
        sessionStorage.setItem('patientEmail', c?.patient_email || '')
        sessionStorage.setItem('triage_complaint', c?.chief_complaint || '')
        sessionStorage.setItem('patient_language', c?.patient_language || 'en')
        if (c?.consultation_type) sessionStorage.setItem('paymentAmount', '')
        navigate('/payment')
      } catch(e) {
        console.error(e)
        navigate('/triage')
      }
    }
    resume()
  }, [id, navigate])

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100dvh' }}>
      <div style={{ textAlign:'center' }}>
        <div className="spinner spinner-lg" style={{ margin:'0 auto 1rem' }}></div>
        <p style={{ color:'var(--muted)' }}>Getting you sorted…</p>
      </div>
    </div>
  )
}