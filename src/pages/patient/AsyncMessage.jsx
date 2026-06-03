import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { getConsultation, supabase } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

const NAVY  = '#0D2B45'
const TEAL  = '#0B6E76'
const TEAL_L = '#D4EEF0'
const FF    = 'Plus Jakarta Sans, sans-serif'

const CARD_STYLE = {
  style: {
    base: { fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '16px', color: '#1A2A33', '::placeholder': { color: '#9CA3AF' } },
    invalid: { color: '#DC2626' },
  },
}

const REQUEST_OPTIONS = [
  'Medical advice and information',
  'Prescription',
  'Repeat prescription',
  'Imaging request (X-ray, ultrasound, CT)',
  'Specialist referral letter',
  'Medical certificate / sick note',
  'ACC claim assistance',
]

function estimateDeadline() {
  const now = new Date()
  // NZ DST: UTC+13 Oct–Mar, UTC+12 Apr–Sep
  const utcMonth = now.getUTCMonth()
  const nzOffsetMs = (utcMonth >= 9 || utcMonth <= 2) ? 13 * 3600000 : 12 * 3600000
  const nzDate = new Date(now.getTime() + nzOffsetMs)
  const day = nzDate.getUTCDay()
  const h   = nzDate.getUTCHours()
  const inBH = day >= 1 && day <= 5 && h >= 8 && h < 18

  if (inBH) {
    const dlH = h + 4
    if (dlH < 18) {
      const ampm = dlH < 12 ? 'am' : 'pm'
      const dlMin = String(nzDate.getUTCMinutes()).padStart(2, '0')
      return `By ${dlH % 12 || 12}:${dlMin}${ampm} today (NZ time)`
    }
    return 'By 6pm today (NZ time)'
  }
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  let nextDay = (day + 1) % 7, daysAhead = 1
  while (nextDay === 0 || nextDay === 6) { nextDay = (nextDay + 1) % 7; daysAhead++ }
  return `By 10am ${daysAhead === 1 ? 'tomorrow' : dayNames[nextDay]} (NZ time)`
}

function formatDeadline(iso) {
  if (!iso) return ''
  const TZ = 'Pacific/Auckland'
  const d = new Date(iso)
  const t = d.toLocaleTimeString('en-NZ', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
  const dlDay  = d.toLocaleDateString('en-CA', { timeZone: TZ })
  const nowDay = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const tomDay = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: TZ })
  if (dlDay === nowDay) return `By ${t} today`
  if (dlDay === tomDay) return `By ${t} tomorrow`
  return `By ${t} ${d.toLocaleDateString('en-NZ', { timeZone: TZ, weekday: 'long' })}`
}

// ── Payment step (Stripe Elements hooks require this to be a child of Elements) ──

function PaymentStep({ consultationId, onSuccess, onBack }) {
  const stripe   = useStripe()
  const elements = useElements()
  const [acknowledged, setAcknowledged] = useState(false)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')
  const clientSecretRef = useRef(null)
  const [csReady, setCsReady] = useState(false)

  useEffect(() => {
    apiFetch('/api/async-consult', {
      method: 'POST',
      body: JSON.stringify({ action: 'create_intent', consultationId }),
    })
      .then(r => r.json())
      .then(d => { if (d.clientSecret) { clientSecretRef.current = d.clientSecret; setCsReady(true) } else setPayError('Could not initialise payment. Please try again.') })
      .catch(() => setPayError('Could not initialise payment. Please try again.'))
  }, [consultationId])

  async function handlePay(e) {
    e.preventDefault()
    if (!acknowledged || !stripe || !elements || !clientSecretRef.current) return
    setPaying(true); setPayError('')
    const card = elements.getElement(CardElement)
    const { error, paymentIntent } = await stripe.confirmCardPayment(
      clientSecretRef.current,
      { payment_method: { card } }
    )
    if (error) { setPayError(error.message); setPaying(false); return }
    onSuccess(paymentIntent.id)
  }

  const email = sessionStorage.getItem('triage_email') || ''

  return (
    <div style={{ background: NAVY, minHeight: '100dvh', fontFamily: FF, padding: 'calc(2rem + env(safe-area-inset-top)) 1.25rem 2rem' }}>
      <div style={{ maxWidth: 460, margin: '0 auto' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: TEAL_L, cursor: 'pointer', fontSize: '.875rem', padding: 0, marginBottom: '1.5rem', fontFamily: FF }}>
          ← Back
        </button>
        <h2 style={{ color: 'white', fontWeight: 800, fontSize: '1.375rem', margin: '0 0 .5rem' }}>Review and pay</h2>
        <p style={{ color: 'rgba(212,238,240,.6)', fontSize: '.875rem', margin: '0 0 1.5rem' }}>Your card will be saved now but <strong style={{ color: 'rgba(212,238,240,.9)' }}>not charged until your provider responds</strong>.</p>

        {/* Payment notice */}
        <div style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 16, padding: '1.25rem', marginBottom: '1.25rem', fontSize: '.875rem', color: 'rgba(212,238,240,.8)', lineHeight: 1.7 }}>
          <div style={{ fontWeight: 700, color: 'white', marginBottom: '.75rem', fontSize: '.9375rem' }}>📋 How message consultations work</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.625rem' }}>
            {[
              ['💳', 'Consultation fee: $25', 'Your card is saved now and charged only when your provider sends their response. No charge if they don\'t respond.'],
              ['📞', 'Your provider may request a call', 'If your concern needs a live assessment, they\'ll contact you. An additional fee applies for video ($65) or phone ($45) — you\'ll always confirm first.'],
              ['⏱️', 'Response time', 'We aim to respond within 24 hours. During business hours (Mon–Fri 8am–6pm NZ time) responses are often faster.'],
              ['⚠️', 'Not for emergencies', 'If your condition worsens while waiting, call 111 or visit your nearest emergency department immediately.'],
              ['🏥', 'ACC-eligible injury?', 'If your concern is injury-related and ACC-eligible, your provider will lodge an ACC claim. Your $25 message fee counts as your ACC co-payment — total Tere charges: $62.50 ($37.50 ACC + $25 co-payment).'],
            ].map(([icon, title, desc]) => (
              <div key={title} style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: 2 }}>{icon}</span>
                <div><strong style={{ color: 'white' }}>{title}.</strong> {desc}</div>
              </div>
            ))}
          </div>
          {email && (
            <div style={{ marginTop: '.875rem', paddingTop: '.875rem', borderTop: '1px solid rgba(255,255,255,.1)', color: 'rgba(212,238,240,.6)', fontSize: '.8125rem' }}>
              📧 Your response will be sent to <strong style={{ color: TEAL_L }}>{email}</strong>
            </div>
          )}
        </div>

        {/* Card input */}
        <div style={{ background: 'white', borderRadius: 14, padding: '1rem 1.25rem', marginBottom: '1rem' }}>
          {csReady ? (
            <CardElement options={CARD_STYLE} />
          ) : payError ? (
            <div style={{ color: '#DC2626', fontSize: '.875rem' }}>{payError}</div>
          ) : (
            <div style={{ color: '#9CA3AF', fontSize: '.875rem' }}>Loading payment…</div>
          )}
        </div>

        {/* Acknowledgement */}
        <label style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-start', cursor: 'pointer', marginBottom: '1.25rem' }}>
          <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)}
            style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, accentColor: TEAL }} />
          <span style={{ color: 'rgba(212,238,240,.75)', fontSize: '.8125rem', lineHeight: 1.6 }}>
            I understand my card will be saved now and charged $25 only when my provider responds, that they may request a video or phone call, and that this service is not for emergencies.
          </span>
        </label>

        {payError && <div style={{ color: '#FCA5A5', fontSize: '.875rem', marginBottom: '.75rem' }}>{payError}</div>}

        <button
          onClick={handlePay}
          disabled={!acknowledged || paying || !csReady}
          style={{ width: '100%', background: acknowledged && csReady ? TEAL : 'rgba(255,255,255,.15)', color: 'white', border: 'none', borderRadius: 14, padding: '16px', fontWeight: 700, fontSize: '1.0625rem', cursor: acknowledged && csReady ? 'pointer' : 'not-allowed', fontFamily: FF, opacity: paying ? 0.7 : 1, marginBottom: '1rem' }}
        >
          {paying ? 'Processing…' : 'Save card and send message →'}
        </button>

        <button onClick={onBack} style={{ width: '100%', background: 'none', border: '1px solid rgba(255,255,255,.2)', color: 'rgba(212,238,240,.6)', borderRadius: 14, padding: '12px', fontFamily: FF, cursor: 'pointer', fontSize: '.875rem' }}>
          Cancel — go back
        </button>
      </div>
    </div>
  )
}

// ── Main inner component ───────────────────────────────────────────────────────

function AsyncMessageInner() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [phase, setPhase] = useState('loading')
  const [consult, setConsult] = useState(null)
  const [confirmedDeadline, setConfirmedDeadline] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [visible, setVisible] = useState(false)

  // Form fields
  const [symptomDetail, setSymptomDetail]           = useState('')
  const [progression, setProgression]               = useState('')
  const [prevTreatment, setPrevTreatment]           = useState('')
  const [prevEpisodes, setPrevEpisodes]             = useState('')
  const [prevEpisodesDetail, setPrevEpisodesDetail] = useState('')
  const [dailyImpact, setDailyImpact]               = useState('')
  const [photos, setPhotos]                         = useState([])  // File objects
  const [photoUrls, setPhotoUrls]                   = useState([])  // Uploaded URLs
  const [requests, setRequests]                     = useState([])
  const [urgency, setUrgency]                       = useState('')
  const [formError, setFormError]                   = useState('')
  const [uploading, setUploading]                   = useState(false)
  const photoInputRef = useRef(null)
  const paymentIntentIdRef = useRef(null)

  useEffect(() => { setTimeout(() => setVisible(true), 60) }, [])

  // Load consultation + run suitability check
  useEffect(() => {
    async function init() {
      try { const c = await getConsultation(id); setConsult(c) } catch {}
      try {
        const complaint = sessionStorage.getItem('triage_complaint') || ''
        const res = await apiFetch('/api/async-consult', {
          method: 'POST', body: JSON.stringify({ action: 'check_suitability', complaint }),
        })
        const { suitable } = await res.json()
        setPhase(suitable ? 'form' : 'emergency')
      } catch { setPhase('form') }
    }
    init()
  }, [id])

  const anim = (delay = '0s') => ({
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(16px)',
    transition: `opacity 0.5s ${delay}, transform 0.5s ${delay}`,
  })

  function toggleRequest(r) {
    setRequests(rs => rs.includes(r) ? rs.filter(x => x !== r) : [...rs, r])
  }

  async function handleFormNext() {
    if (!symptomDetail.trim() || symptomDetail.trim().length < 20) {
      setFormError('Please describe your symptoms in more detail.'); return
    }
    if (!progression) { setFormError('Please select how your symptoms have changed.'); return }
    if (!dailyImpact) { setFormError('Please select how this is affecting you.'); return }
    if (!urgency)     { setFormError('Please select how urgent you feel this is.'); return }
    setFormError('')

    // Upload photos
    setUploading(true)
    const urls = []
    for (let i = 0; i < Math.min(photos.length, 3); i++) {
      try {
        const file = photos[i]
        const ext = file.name.split('.').pop() || 'jpg'
        const path = `${id}/${Date.now()}_${i}.${ext}`
        const { error } = await supabase.storage.from('async-photos').upload(path, file, { contentType: file.type })
        if (!error) {
          const { data: { publicUrl } } = supabase.storage.from('async-photos').getPublicUrl(path)
          urls.push(publicUrl)
        }
      } catch {}
    }
    setPhotoUrls(urls)
    setUploading(false)
    setPhase('payment')
  }

  async function handlePaymentSuccess(paymentIntentId) {
    paymentIntentIdRef.current = paymentIntentId
    setSubmitting(true); setSubmitError('')
    try {
      const res = await apiFetch('/api/async-consult', {
        method: 'POST',
        body: JSON.stringify({
          action: 'submit', consultationId: id,
          paymentIntentId,
          symptomDetail,
          symptomProgression: progression,
          dailyImpact,
          photoUrls,
          requests,
          urgency,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Submit failed')
      setConfirmedDeadline(data.deadline)
      setPhase('confirm')
    } catch {
      setSubmitError(`Payment taken but we had trouble saving your message. Please email hello@terehealth.co.nz with ref: ${id.slice(0, 8).toUpperCase()}`)
      setPhase('submit_error')
    } finally {
      setSubmitting(false)
    }
  }

  const firstName = consult?.patient_first_name || sessionStorage.getItem('triage_first_name') || ''
  const complaint = consult?.chief_complaint || sessionStorage.getItem('triage_complaint') || ''
  const refId = id ? id.slice(0, 8).toUpperCase() : ''

  // ── Loading ────────────────────────────────────────────────────────────────
  if (phase === 'loading') return (
    <div style={{ background: NAVY, minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FF }}>
      <div style={{ textAlign: 'center', color: 'rgba(212,238,240,.6)' }}>
        <div className="spinner" style={{ borderColor: 'rgba(11,110,118,.3)', borderTopColor: TEAL, margin: '0 auto 1rem' }} />
        Checking your concern…
      </div>
    </div>
  )

  // ── Emergency ──────────────────────────────────────────────────────────────
  if (phase === 'emergency') return (
    <div style={{ background: '#1A0A0A', minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.25rem', fontFamily: FF }}>
      <div style={{ maxWidth: 400, textAlign: 'center', ...anim() }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚨</div>
        <h2 style={{ color: 'white', fontWeight: 800, fontSize: '1.5rem', margin: '0 0 1rem', lineHeight: 1.2 }}>
          This concern needs immediate attention
        </h2>
        <p style={{ color: 'rgba(255,200,200,.8)', lineHeight: 1.7, marginBottom: '2rem' }}>
          Based on your symptoms, a message consultation is not appropriate. Please seek care immediately.
        </p>
        <a href="tel:111" style={{ display: 'block', background: '#DC2626', color: 'white', textDecoration: 'none', borderRadius: 14, padding: '18px 24px', fontWeight: 800, fontSize: '1.25rem', marginBottom: '1rem', letterSpacing: '.02em' }}>
          📞 Call 111 Now
        </a>
        <a href="https://healthpoint.co.nz" target="_blank" rel="noreferrer"
          style={{ display: 'block', background: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.8)', textDecoration: 'none', borderRadius: 14, padding: '14px', fontWeight: 600, fontSize: '.9375rem', marginBottom: '2rem' }}>
          Find nearest emergency department →
        </a>
        <p style={{ color: 'rgba(255,200,200,.5)', fontSize: '.8125rem' }}>
          Do not wait for a message response. If you believe your concern is non-urgent,{' '}
          <button onClick={() => setPhase('intro')} style={{ background: 'none', border: 'none', color: 'rgba(255,200,200,.7)', cursor: 'pointer', textDecoration: 'underline', fontFamily: FF, fontSize: '.8125rem' }}>
            continue anyway
          </button>
        </p>
      </div>
    </div>
  )

  // ── Form ───────────────────────────────────────────────────────────────────
  if (phase === 'form') {
    const labelStyle = { fontSize: '.85rem', fontWeight: 700, color: NAVY, display: 'block', marginBottom: '.5rem' }
    const radioStyle = (active) => ({
      padding: '.65rem .9rem', border: `1.5px solid ${active ? TEAL : '#E5E7EB'}`,
      borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.625rem',
      background: active ? '#EFF9F9' : 'white', transition: 'all .12s',
    })

    return (
      <div style={{ background: '#F7F5F0', minHeight: '100dvh', fontFamily: FF }}>
        <div style={{ background: NAVY, padding: 'calc(.875rem + env(safe-area-inset-top)) 1.25rem .875rem', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: '1.1rem', padding: 0, lineHeight: 1 }}>←</button>
          <span style={{ color: TEAL_L, fontWeight: 700, fontSize: '1rem' }}>Message consultation</span>
          <span style={{ marginLeft: 'auto', background: 'rgba(255,255,255,.12)', color: 'rgba(212,238,240,.9)', fontSize: '.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 99 }}>$25</span>
        </div>

        <div style={{ maxWidth: 520, margin: '0 auto', padding: '1.5rem 1.25rem 4rem' }}>
          <p style={{ color: '#6B7280', fontSize: '.875rem', margin: '0 0 1.5rem', lineHeight: 1.6 }}>
            A few more details so your provider can give you the best response.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.375rem' }}>

            {/* Symptom detail */}
            <div>
              <label style={labelStyle}>Describe your symptoms in detail *</label>
              <textarea value={symptomDetail} onChange={e => setSymptomDetail(e.target.value)} rows={5}
                placeholder="When did it start? How does it feel? What makes it better or worse? Any other relevant details…"
                style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #E5E7EB', borderRadius: 12, padding: '.75rem .9rem', fontSize: '1rem', fontFamily: FF, color: NAVY, resize: 'vertical', outline: 'none', lineHeight: 1.6 }} />
            </div>

            {/* Progression */}
            <div>
              <label style={labelStyle}>How have your symptoms changed? *</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                {['Getting worse', 'Staying the same', 'Getting better', 'Comes and goes'].map(opt => (
                  <label key={opt} style={radioStyle(progression === opt)}>
                    <input type="radio" name="progression" value={opt} checked={progression === opt}
                      onChange={() => setProgression(opt)} style={{ accentColor: TEAL }} />
                    <span style={{ fontSize: '.9375rem', color: NAVY, fontWeight: progression === opt ? 600 : 400 }}>{opt}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Daily impact */}
            <div>
              <label style={labelStyle}>How is this affecting your daily life? *</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                {['Minor inconvenience — managing fine', 'Affecting work or normal activities', 'Unable to work or do normal activities', 'Keeping me awake at night'].map(opt => (
                  <label key={opt} style={radioStyle(dailyImpact === opt)}>
                    <input type="radio" name="dailyImpact" value={opt} checked={dailyImpact === opt}
                      onChange={() => setDailyImpact(opt)} style={{ accentColor: TEAL }} />
                    <span style={{ fontSize: '.875rem', color: NAVY, fontWeight: dailyImpact === opt ? 600 : 400 }}>{opt}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Photo upload */}
            <div>
              <label style={labelStyle}>Photos (optional)</label>
              <p style={{ color: '#6B7280', fontSize: '.8125rem', margin: '0 0 .625rem', lineHeight: 1.5 }}>
                If your concern is visible (skin, wound, swelling) please attach a photo — this helps your provider significantly.
              </p>
              <input ref={photoInputRef} type="file" accept="image/*" multiple
                style={{ display: 'none' }}
                onChange={e => {
                  const files = Array.from(e.target.files || []).slice(0, 3)
                  setPhotos(files)
                }} />
              <button type="button" onClick={() => photoInputRef.current?.click()}
                style={{ background: 'white', border: '1.5px dashed #D1D5DB', borderRadius: 12, padding: '.875rem', width: '100%', cursor: 'pointer', fontFamily: FF, color: '#6B7280', fontSize: '.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', boxSizing: 'border-box' }}>
                📷 {photos.length > 0 ? `${photos.length} photo${photos.length > 1 ? 's' : ''} selected` : 'Add photos'}
              </button>
              {photos.length > 0 && (
                <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem', flexWrap: 'wrap' }}>
                  {photos.map((f, i) => (
                    <div key={i} style={{ fontSize: '.75rem', color: TEAL, background: '#EFF9F9', borderRadius: 8, padding: '4px 8px' }}>{f.name}</div>
                  ))}
                </div>
              )}
            </div>

            {/* What they want */}
            <div>
              <label style={labelStyle}>What are you hoping your provider can help with?</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                {REQUEST_OPTIONS.map(opt => {
                  const checked = requests.includes(opt)
                  return (
                    <label key={opt} style={{ ...radioStyle(checked), cursor: 'pointer' }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleRequest(opt)} style={{ accentColor: TEAL }} />
                      <span style={{ fontSize: '.9rem', color: NAVY, fontWeight: checked ? 600 : 400 }}>{opt}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Urgency */}
            <div>
              <label style={labelStyle}>How urgent do you feel this is? *</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                {['Can wait for next business day', 'Would like a response today if possible', 'Quite urgent — within a few hours'].map(opt => (
                  <label key={opt} style={radioStyle(urgency === opt)}>
                    <input type="radio" name="urgency" value={opt} checked={urgency === opt}
                      onChange={() => setUrgency(opt)} style={{ accentColor: TEAL }} />
                    <span style={{ fontSize: '.875rem', color: NAVY, fontWeight: urgency === opt ? 600 : 400 }}>{opt}</span>
                  </label>
                ))}
              </div>
            </div>

            {formError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '.875rem', color: '#DC2626', fontSize: '.875rem' }}>
                {formError}
              </div>
            )}

            <button onClick={handleFormNext} disabled={uploading}
              style={{ width: '100%', background: TEAL, color: 'white', border: 'none', borderRadius: 14, padding: '18px', fontWeight: 700, fontSize: '1.0625rem', cursor: 'pointer', fontFamily: FF, opacity: uploading ? 0.7 : 1 }}>
              {uploading ? 'Uploading photos…' : 'Continue to payment →'}
            </button>

          </div>
        </div>
      </div>
    )
  }

  // ── Payment ────────────────────────────────────────────────────────────────
  if (phase === 'payment') return (
    <PaymentStep
      consultationId={id}
      onSuccess={handlePaymentSuccess}
      onBack={() => setPhase('form')}
    />
  )

  // ── Submit error ───────────────────────────────────────────────────────────
  if (phase === 'submit_error') return (
    <div style={{ background: '#F7F5F0', minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: FF }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '.75rem' }}>⚠️</div>
        <h2 style={{ color: NAVY, fontWeight: 700, marginBottom: '.75rem' }}>Something went wrong</h2>
        <p style={{ color: '#6B7280', lineHeight: 1.7 }}>{submitError}</p>
      </div>
    </div>
  )

  // ── Confirm ────────────────────────────────────────────────────────────────
  if (phase === 'confirm') {
    const email = consult?.patient_email || sessionStorage.getItem('triage_email') || ''
    const phone = consult?.patient_phone || sessionStorage.getItem('triage_phone') || ''

    return (
      <div style={{ background: NAVY, minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'calc(2rem + env(safe-area-inset-top)) 1.25rem calc(2rem + env(safe-area-inset-bottom))', fontFamily: FF }}>
        <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: '1rem', ...anim() }}>

          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#059669', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem', margin: '0 auto .875rem', boxShadow: '0 0 0 12px rgba(5,150,105,.15)' }}>
              ✓
            </div>
            <h2 style={{ color: 'white', fontWeight: 800, fontSize: '1.5rem', margin: '0 0 .5rem' }}>Message sent to your provider</h2>
            {firstName && (
              <p style={{ color: 'rgba(212,238,240,.65)', fontSize: '.9375rem', margin: 0, lineHeight: 1.6 }}>
                Kia ora {firstName}, your message has been received and will be reviewed by one of our registered health providers.
              </p>
            )}
          </div>

          {[
            { icon: '⏱️', title: 'Expected response', body: "Typically within 24 hours — we'll notify you by email and text when ready." },
            email && { icon: '📧', title: 'Watch your inbox', body: `Your response will be sent to ${email}. Check your spam folder too.` },
            phone && { icon: '📞', title: 'You may be contacted', body: `If your provider needs more information or determines a call is needed, they'll contact you at ${phone}.` },
            { icon: '🚨', title: 'If you get worse', body: "Don't wait — call 111 or go to your nearest emergency department immediately." },
          ].filter(Boolean).map(({ icon, title, body }) => (
            <div key={title} style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, padding: '1rem 1.125rem', display: 'flex', gap: '.875rem', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.25rem', flexShrink: 0, marginTop: 1 }}>{icon}</span>
              <div>
                <div style={{ fontWeight: 700, color: 'white', fontSize: '.9rem', marginBottom: '.3rem' }}>{title}</div>
                <div style={{ color: 'rgba(212,238,240,.65)', fontSize: '.8125rem', lineHeight: 1.5 }}>{body}</div>
              </div>
            </div>
          ))}

          <div style={{ textAlign: 'center', color: 'rgba(212,238,240,.35)', fontSize: '.75rem', paddingTop: '.25rem' }}>
            Reference: {refId}
          </div>

          <button onClick={() => window.location.href = '/'}
            style={{ width: '100%', background: TEAL, color: 'white', border: 'none', borderRadius: 14, padding: '16px', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', fontFamily: FF, marginTop: '.25rem' }}>
            Done →
          </button>
        </div>
      </div>
    )
  }

  return null
}

export default function AsyncMessage() {
  return (
    <Elements stripe={stripePromise}>
      <AsyncMessageInner />
    </Elements>
  )
}
