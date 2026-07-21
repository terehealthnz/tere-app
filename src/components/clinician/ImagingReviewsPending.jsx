// Cross-provider pending imaging review queue. Retrospective QI: reviewer
// receives the radiology report by email (outside Tere), then opens the panel
// to log their assessment and fire the standard/custom patient email.
//
// Any active provider can review any referral (peer-review, not restricted to
// ordering clinician). Rendered inside AdminApp Dashboard and ProviderApp Queue.

import React, { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../../lib/api'
import ImagingReviewPanel from './ImagingReviewPanel.jsx'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'

function daysAgo(d) {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

export default function ImagingReviewsPending() {
  const [reviews, setReviews]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [openId, setOpenId]     = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/imaging-reviews')
      const data = await res.json()
      setReviews((data.reviews || []).filter(r => !r.reviewed_at))
    } catch { setReviews([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const iv = setInterval(load, 60000)
    return () => clearInterval(iv)
  }, [load])

  const openReview = reviews.find(r => r.id === openId) || null

  if (loading) return null
  if (!reviews.length) return null

  return (
    <>
      <div style={{ background:'white', borderRadius:12, border:'1px solid #DBEAFE', overflow:'hidden', marginTop:'.75rem', fontFamily:FF }}>
        <div style={{ padding:'.875rem 1rem', borderBottom:'1px solid #EFF6FF', background:'#EFF6FF' }}>
          <span style={{ fontWeight:700, color:'#1E40AF', fontSize:'.9375rem' }}>🩻 Imaging reviews pending ({reviews.length})</span>
          <div style={{ fontSize:'.75rem', color:'#1D4ED8', marginTop:2 }}>Radiology reports received by email — any provider can sign off.</div>
        </div>
        {reviews.map((r, i) => {
          const ref = r.referral || {}
          const label = [ref.investigation, ref.body_part].filter(Boolean).join(' — ')
          return (
            <button key={r.id} onClick={() => setOpenId(r.id)}
              style={{ width:'100%', textAlign:'left', background:'white', border:'none', borderBottom:i<reviews.length-1?'1px solid #F1F5F9':'none', padding:'.875rem 1rem', cursor:'pointer', fontFamily:FF, minHeight:56 }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'.75rem' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, color:NAVY, fontSize:'.875rem' }}>{ref.patient_name || 'Unknown patient'}</div>
                  <div style={{ fontSize:'.75rem', color:'#6B7280', marginTop:2 }}>{label || 'Investigation not recorded'}</div>
                  <div style={{ fontSize:'.7rem', color:'#9CA3AF', marginTop:1 }}>
                    Ordered by {ref.drafted_by_name || ref.provider_name || 'unknown'} · {daysAgo(ref.created_at || r.created_at)}
                  </div>
                </div>
                <span style={{ background:'#DBEAFE', color:'#1E40AF', fontSize:'.625rem', fontWeight:700, padding:'2px 8px', borderRadius:99, flexShrink:0 }}>REVIEW</span>
              </div>
            </button>
          )
        })}
      </div>

      {openReview && (
        <ImagingReviewPanel
          review={openReview}
          onClose={() => setOpenId(null)}
          onSubmitted={() => { setOpenId(null); load() }}
        />
      )}
    </>
  )
}
