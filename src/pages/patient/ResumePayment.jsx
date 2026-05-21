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
        sessionStorage.setItem('consultationId', id)
        sessionStorage.setItem('accEligible', c?.acc_eligible || 'no')

        // Check 15 minute window
        const notifiedAt = c?.waitlist_notified_at
        if (notifiedAt) {
          const elapsed = (Date.now() - new Date(notifiedAt)) / 60000
          if (elapsed > 15) {
            navigate('/?expired=1')
            return
          }
        }
        navigate('/payment')
      } catch(e) {
        console.error(e)
        navigate('/')
      }
    }
    resume()
  }, [id, navigate])

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <div style={{ textAlign:'center' }}>
        <div className="spinner spinner-lg" style={{ margin:'0 auto 1rem' }}></div>
        <p style={{ color:'var(--muted)' }}>Getting you sorted…</p>
      </div>
    </div>
  )
}