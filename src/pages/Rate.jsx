import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { patientUpdateConsultation, patientGetConsultation } from '../lib/supabase'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF = 'Plus Jakarta Sans, sans-serif'

export default function Rate() {
  const { id } = useParams()
  const [consult, setConsult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [alreadyRated, setAlreadyRated] = useState(false)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const data = await patientGetConsultation(id)
        if (!data) { setNotFound(true); setLoading(false); return }
        setConsult(data)
        if (data.rating) { setAlreadyRated(true); setRating(data.rating) }
      } catch { setNotFound(true) }
      setLoading(false)
    }
    load()
  }, [id])

  async function submit() {
    if (!rating) return
    setSubmitting(true)
    try {
      await patientUpdateConsultation(id, {
        rating,
        rating_comment: comment.trim() || null,
        rated_at: new Date().toISOString(),
      })
      setSubmitted(true)
    } catch (e) { console.error(e) }
    setSubmitting(false)
  }

  const dateStr = consult?.created_at
    ? new Date(consult.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  const starLabel = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent']

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FF }}>
      <div style={{ color: '#9CA3AF' }}>Loading…</div>
    </div>
  )

  if (notFound) return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FF }}>
      <div style={{ textAlign: 'center', color: '#6B7280' }}>Consultation not found.</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: FF }}>
      <div style={{ background: NAVY, padding: '.875rem 1.5rem', textAlign: 'center' }}>
        <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.5rem' }}>Tere Health</span>
      </div>

      <div style={{ maxWidth: 480, margin: '3rem auto', padding: '0 1.25rem' }}>
        <div style={{ background: 'white', borderRadius: 16, padding: '2rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}>

          {submitted || alreadyRated ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: NAVY, marginBottom: '.5rem' }}>
                {alreadyRated && !submitted ? 'Already submitted' : 'Thank you!'}
              </h2>
              <p style={{ color: '#6B7280', fontSize: '.9375rem', lineHeight: 1.6 }}>
                {alreadyRated && !submitted
                  ? `You've already rated this consultation.`
                  : `Your feedback helps us improve care for rural communities.`}
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: '1rem' }}>
                {[1,2,3,4,5].map(s => (
                  <span key={s} style={{ fontSize: '1.75rem', color: s <= rating ? '#F59E0B' : '#E5E7EB' }}>★</span>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: NAVY, margin: '0 0 .375rem' }}>
                  How was your consultation?
                </h1>
                {consult.provider_display_name && (
                  <p style={{ color: '#6B7280', fontSize: '.875rem', margin: 0 }}>
                    with {consult.provider_display_name}{dateStr ? ` on ${dateStr}` : ''}
                  </p>
                )}
              </div>

              {/* Stars */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: '.5rem' }}>
                {[1,2,3,4,5].map(s => (
                  <button key={s}
                    onClick={() => setRating(s)}
                    onMouseEnter={() => setHovered(s)}
                    onMouseLeave={() => setHovered(0)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', fontSize: '2.5rem', lineHeight: 1, color: s <= (hovered || rating) ? '#F59E0B' : '#E5E7EB', transition: 'color .1s' }}>
                    ★
                  </button>
                ))}
              </div>

              <div style={{ textAlign: 'center', height: '1.25rem', marginBottom: '1.5rem', fontSize: '.875rem', fontWeight: 600, color: TEAL }}>
                {starLabel[hovered || rating] || ''}
              </div>

              {/* Comment */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '.8125rem', fontWeight: 600, color: '#374151', marginBottom: '.5rem' }}>
                  Any comments? <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</span>
                </label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={3}
                  placeholder="Tell us about your experience…"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontFamily: FF, fontSize: '.9375rem', lineHeight: 1.6, resize: 'vertical', outline: 'none', color: '#1A2A33' }}
                />
              </div>

              <button
                onClick={submit}
                disabled={!rating || submitting}
                style={{ width: '100%', padding: '.875rem', borderRadius: 99, border: 'none', fontFamily: FF, fontWeight: 700, fontSize: '1rem', cursor: rating ? 'pointer' : 'default', background: rating ? TEAL : '#E2E8F0', color: rating ? 'white' : '#9CA3AF', transition: 'all .2s' }}>
                {submitting ? 'Submitting…' : 'Submit rating'}
              </button>

              <div style={{ fontSize: '.75rem', color: '#9CA3AF', textAlign: 'center', marginTop: '.875rem' }}>
                Your feedback is anonymous and used only to improve our service.
              </div>
            </>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '.75rem', color: '#9CA3AF' }}>
          Tere Health · terehealth.co.nz
        </div>
      </div>
    </div>
  )
}
