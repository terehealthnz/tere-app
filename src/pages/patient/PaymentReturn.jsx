// Windcave return handler. Windcave redirects here after the patient
// completes the Hosted Payment Page:
//   /payment-return?consultationId=X&status=approved|declined|cancelled
//
// Runs in one of two modes:
//
// (A) Inside the Windcave iframe on /payment.
//     We're embedded — the parent Payment.jsx component is listening
//     for a postMessage. Send the outcome and render a minimal spinner;
//     parent will query authoritative status and navigate.
//
// (B) Top-level (patient bookmarked the URL, reopened tab, iframe
//     failed to break out, or Windcave enabled iframe was denied).
//     Do the full flow ourselves: query Windcave for authoritative
//     status, then navigate to /waiting on approval.
//
// The status query param is a hint (not authoritative) either way.
// The FPRN webhook is the source-of-truth outcome recorded on the
// consultation row (payment_status).

import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getPatientConsult } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'

function inIframe() {
  try { return window.self !== window.top } catch { return true }
}

export default function PaymentReturn() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [state, setState] = useState({ loading: true, approved: null, error: null, embedded: false })

  const consultationId = params.get('consultationId') || sessionStorage.getItem('consultationId')
  const hintedStatus   = params.get('status') // approved | declined | cancelled

  useEffect(() => {
    const embedded = inIframe()

    // Mode A — inside the Payment.jsx iframe. Delegate to parent.
    if (embedded) {
      setState({ loading: true, approved: null, error: null, embedded: true })
      try {
        window.parent.postMessage(
          { type: 'tere-windcave', status: hintedStatus, consultationId },
          window.location.origin,
        )
      } catch { /* parent may be cross-origin somehow; fall through */ }
      return
    }

    // Mode B — top-level. Do the full verify flow.
    let cancelled = false
    ;(async () => {
      if (!consultationId) {
        if (!cancelled) setState({ loading: false, approved: false, error: 'Missing consultation reference — please start over.', embedded: false })
        return
      }
      let consult = null
      try { consult = await getPatientConsult(consultationId) } catch {}
      const sessionId = consult?.payment_intent_id

      if (!sessionId) {
        if (!cancelled) setState({ loading: false, approved: false, error: 'Payment session missing — please try again.', embedded: false })
        return
      }

      try {
        const r = await apiFetch(`/api/windcave-query?sessionId=${encodeURIComponent(sessionId)}`)
        const data = await r.json()
        if (cancelled) return
        if (data.approved) {
          setState({ loading: false, approved: true, error: null, embedded: false })
          setTimeout(() => navigate('/waiting', { replace: true }), 1500)
        } else {
          setState({ loading: false, approved: false, error: hintedStatus === 'cancelled' ? 'Payment cancelled.' : 'Payment was not approved. Please try again with a different card.', embedded: false })
        }
      } catch (e) {
        if (!cancelled) setState({ loading: false, approved: false, error: 'Could not verify payment. If you were charged, please contact support.', embedded: false })
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultationId])

  // Embedded mode: keep the DOM minimal so the parent's UI shows through.
  // The parent Payment.jsx already renders its own spinner + status while
  // it verifies + navigates; this iframe just needs to send the message
  // and get out of the way.
  if (state.embedded) return (
    <div style={{ background: 'white', minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Plus Jakarta Sans, sans-serif', color: '#6B7280' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto .75rem' }} />
        <div style={{ fontSize: '.875rem' }}>Finishing up…</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100dvh', background: '#F7F5F0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <div style={{ background: 'white', borderRadius: 16, padding: '2.5rem 2rem', maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
        {state.loading && (
          <>
            <div className="spinner" style={{ margin: '0 auto 1rem' }} />
            <div style={{ color: '#6B7280' }}>Confirming your payment…</div>
          </>
        )}
        {!state.loading && state.approved && (
          <>
            <div style={{ fontSize: '2.5rem', marginBottom: '.75rem' }}>✅</div>
            <h2 style={{ color: NAVY, fontWeight: 700, marginBottom: '.5rem' }}>Payment confirmed</h2>
            <p style={{ color: '#374151' }}>Taking you to the waiting room…</p>
          </>
        )}
        {!state.loading && state.approved === false && (
          <>
            <div style={{ fontSize: '2.5rem', marginBottom: '.75rem' }}>⚠️</div>
            <h2 style={{ color: NAVY, fontWeight: 700, marginBottom: '.5rem' }}>Payment not completed</h2>
            <p style={{ color: '#374151', marginBottom: '1.5rem' }}>{state.error}</p>
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => navigate('/payment')}
                style={{ background: TEAL, color: 'white', border: 'none', padding: '10px 20px', borderRadius: 99, fontWeight: 700, cursor: 'pointer', fontSize: '.9375rem' }}>
                Try again
              </button>
              <button onClick={() => navigate('/contact?source=payment_failed')}
                style={{ background: 'white', color: TEAL, border: `2px solid ${TEAL}`, padding: '10px 20px', borderRadius: 99, fontWeight: 700, cursor: 'pointer', fontSize: '.9375rem' }}>
                Contact support
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
