import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getConsultation } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'

// Ensure the consultation is in 'waiting' status — guards against the case
// where the patient paid while technically 'waitlisted' (RLS blocked the
// client-side promotion in Waitlisted.jsx), leaving them invisible to providers.
async function ensureWaiting(consultationId) {
  if (!consultationId || consultationId.startsWith('demo')) return
  try {
    await apiFetch('/api/confirm-waiting', {
      method: 'POST',
      body: JSON.stringify({ consultationId }),
    })
  } catch {}
}

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

  // Ensure consultation is promoted to 'waiting' (guards against RLS-blocked client-side update)
  useEffect(() => {
    ensureWaiting(consultationId)
  }, [consultationId])

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
    if (!consultationId || consultationId.startsWith('demo')) return

    function handleStatusChange(status, providerDisplayName) {
      if (providerDisplayName) setProviderName(providerDisplayName)
      if (status === 'vitals_requested') { navigate('/vitals'); return }
      if (['ready', 'in_progress'].includes(status)) { navigate('/call'); return }
    }

    const poll = async () => {
      try {
        const consult = await getConsultation(consultationId)
        if (!consult) return
        handleStatusChange(consult.status, consult.provider_display_name)
      } catch {}
    }

    poll()
    const interval = setInterval(poll, 4000)

    // Per-consultation realtime subscription (filtered) — faster than polling
    let channel
    ;(async () => {
      const { supabase } = await import('../../lib/supabase')
      channel = supabase
        .channel(`consult-patient-${consultationId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'consultations',
          filter: `id=eq.${consultationId}`,
        }, ({ new: row }) => {
          handleStatusChange(row.status, row.provider_display_name)
        })
        .subscribe()
    })()

    return () => {
      clearInterval(interval)
      channel?.unsubscribe?.()
    }
  }, [consultationId, navigate])

  const patientName = (sessionStorage.getItem('patientName') || '').split(' ')[0] || null

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(160deg, #0D2B45 0%, #0a2038 60%, #061525 100%)',
      fontFamily: 'Plus Jakarta Sans, sans-serif',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <style>{`
        @keyframes sonar {
          0%   { transform: scale(1);   opacity: .5; }
          100% { transform: scale(2.6); opacity: 0; }
        }
        @keyframes sonar2 {
          0%   { transform: scale(1);   opacity: .35; }
          100% { transform: scale(2.1); opacity: 0; }
        }
        @keyframes pulse-core {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.06); }
        }
        @keyframes dots {
          0%,80%,100% { opacity: .2; transform: translateY(0); }
          40%          { opacity: 1;  transform: translateY(-5px); }
        }
      `}</style>

      {/* Header */}
      <div style={{padding:'1.25rem 1.5rem', paddingTop:'calc(1.25rem + env(safe-area-inset-top, 0px))'}}>
        <div style={{fontFamily:'Cormorant Garamond, serif', fontStyle:'italic', color:'rgba(212,238,240,.8)', fontSize:'1.3rem'}}>Tere</div>
      </div>

      {/* Main content */}
      <div style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'2rem 1.5rem', textAlign:'center'}}>

        {/* Sonar animation */}
        <div style={{position:'relative', width:100, height:100, marginBottom:'2.5rem'}}>
          <div style={{position:'absolute', inset:0, borderRadius:'50%', border:'1.5px solid rgba(11,110,118,.6)', animation:'sonar 2.4s ease-out infinite'}} />
          <div style={{position:'absolute', inset:0, borderRadius:'50%', border:'1.5px solid rgba(11,110,118,.45)', animation:'sonar2 2.4s ease-out .8s infinite'}} />
          <div style={{
            position:'absolute', inset:0,
            borderRadius:'50%',
            background:'linear-gradient(135deg, #0B6E76, #0a5a62)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:'2.25rem',
            animation:'pulse-core 3s ease-in-out infinite',
            boxShadow:'0 0 40px rgba(11,110,118,.4)',
          }}>🩺</div>
        </div>

        {/* Greeting */}
        {patientName && (
          <div style={{color:'rgba(212,238,240,.55)', fontSize:'.9375rem', marginBottom:'.375rem', letterSpacing:'.02em'}}>
            Kia ora, {patientName}
          </div>
        )}

        <h1 style={{color:'white', fontSize:'1.5rem', fontWeight:700, margin:'0 0 .625rem', lineHeight:1.25}}>
          {providerName ? `${providerName} will be with you shortly` : 'Your doctor will be with you shortly'}
        </h1>

        <p style={{color:'rgba(255,255,255,.5)', fontSize:'.9375rem', lineHeight:1.7, maxWidth:320, margin:'0 0 2.25rem'}}>
          Keep this screen open. Your doctor will call you when they're ready — usually within 2–5 minutes.
        </p>

        {/* Animated waiting dots */}
        <div style={{display:'flex', gap:7, marginBottom:'2.5rem'}}>
          {[0,1,2].map(i => (
            <div key={i} style={{
              width:9, height:9, borderRadius:'50%', background:'#0B6E76',
              animation:`dots 1.4s ${i * .22}s ease-in-out infinite`,
            }} />
          ))}
        </div>

        {/* Steps */}
        <div style={{display:'flex', alignItems:'center', gap:0, marginBottom:'2.5rem'}}>
          {[
            { label:'In queue', done:true },
            { label:'Vitals', done:false },
            { label:'Consult', done:false },
          ].map((step, i, arr) => (
            <React.Fragment key={step.label}>
              <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:5}}>
                <div style={{
                  width:28, height:28, borderRadius:'50%',
                  background: step.done ? '#0B6E76' : 'rgba(255,255,255,.08)',
                  border: step.done ? 'none' : '1.5px solid rgba(255,255,255,.2)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:'.75rem', color: step.done ? 'white' : 'rgba(255,255,255,.3)',
                  fontWeight:700,
                }}>
                  {step.done ? '✓' : i + 1}
                </div>
                <span style={{fontSize:'.6875rem', color: step.done ? 'rgba(212,238,240,.8)' : 'rgba(255,255,255,.3)', whiteSpace:'nowrap'}}>
                  {step.label}
                </span>
              </div>
              {i < arr.length - 1 && (
                <div style={{width:36, height:1, background:'rgba(255,255,255,.12)', margin:'0 4px', marginBottom:18}} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Prep tip */}
        <div style={{
          background:'rgba(255,255,255,.05)',
          border:'1px solid rgba(255,255,255,.1)',
          borderRadius:14,
          padding:'1rem 1.25rem',
          maxWidth:340,
          marginBottom:'2rem',
          textAlign:'left',
        }}>
          <div style={{color:'rgba(212,238,240,.7)', fontSize:'.8125rem', fontWeight:700, marginBottom:'.375rem', display:'flex', alignItems:'center', gap:6}}>
            <span>💡</span> While you wait
          </div>
          <div style={{color:'rgba(255,255,255,.45)', fontSize:'.8125rem', lineHeight:1.7}}>
            Find somewhere with good lighting on your face. You'll need your camera for a quick 30-second vital signs scan when your doctor is ready.
          </div>
        </div>

        {/* Cancel */}
        <button onClick={cancelConsultation}
          style={{background:'none', border:'none', color:'rgba(255,255,255,.25)', fontSize:'.8125rem', cursor:'pointer', textDecoration:'underline', padding:0, fontFamily:'Plus Jakarta Sans, sans-serif'}}>
          Cancel and start over
        </button>
      </div>

      {/* Footer */}
      <div style={{padding:'1.25rem 1.5rem', paddingBottom:'max(1.25rem, env(safe-area-inset-bottom))', textAlign:'center', borderTop:'1px solid rgba(255,255,255,.06)'}}>
        <div style={{color:'rgba(255,255,255,.25)', fontSize:'.75rem', lineHeight:1.8}}>
          Emergency? Call <a href="tel:111" style={{color:'#ef4444', fontWeight:700, textDecoration:'none'}}>111</a> immediately
          &nbsp;·&nbsp;
          Mental health: call or text <a href="tel:1737" style={{color:'rgba(255,255,255,.4)', textDecoration:'none'}}>1737</a>
        </div>
      </div>
    </div>
  )
}
