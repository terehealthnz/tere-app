import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { submitJobApplication, uploadCvFile } from '../lib/supabase'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF = 'Plus Jakarta Sans, sans-serif'

const MAX_CV_BYTES = 5 * 1024 * 1024

export default function CareersApply() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const jobId = params.get('job') || null

  const [job, setJob] = useState(null)
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    cover_note: '', source: '',
  })
  const [cvFile, setCvFile] = useState(null)
  const [cvError, setCvError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Fetch the target job title if a job=<id> is present — public read via /api.
    if (!jobId) return
    fetch(`/api/job-listings`)
      .then(r => r.ok ? r.json() : { listings: [] })
      .then(({ listings }) => {
        const found = (listings || []).find(l => l.id === jobId)
        if (found) setJob(found)
      })
      .catch(() => {})
  }, [jobId])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function onFile(e) {
    const f = e.target.files?.[0]
    if (!f) { setCvFile(null); return }
    setCvError('')
    if (f.size > MAX_CV_BYTES) {
      setCvError('CV must be under 5 MB.')
      setCvFile(null)
      return
    }
    const ok = /pdf|word|officedocument/i.test(f.type) || /\.(pdf|docx?|doc)$/i.test(f.name)
    if (!ok) {
      setCvError('CV must be a PDF or Word document.')
      setCvFile(null)
      return
    }
    setCvFile(f)
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
      setError('Please fill in name and email.')
      return
    }
    setSubmitting(true)
    try {
      let cv_url = null, cv_filename = null
      if (cvFile) {
        const up = await uploadCvFile(cvFile, form.email)
        cv_url = up.url
        cv_filename = up.filename
      }
      const { ok, error: err, id } = await submitJobApplication({
        ...form,
        job_listing_id: jobId,
        cv_url, cv_filename,
      })
      if (!ok) throw new Error(err || 'Application submission failed.')
      setSubmitted(true)
    } catch (e) {
      setError(e.message || 'Application submission failed. Please try again or email us directly.')
    } finally {
      setSubmitting(false)
    }
  }

  const shell = { minHeight:'100dvh', background:'#F0F2F5', fontFamily:FF }
  const nav   = { background:NAVY, padding:'.875rem 1.5rem', display:'flex', alignItems:'center', gap:'1rem' }
  const brand = { fontFamily:'Cormorant Garamond, serif', fontStyle:'italic', color:'#D4EEF0', fontSize:'1.3rem' }
  const card  = { background:'white', borderRadius:16, padding:'2rem', border:'1px solid #E2E8F0', boxShadow:'0 4px 24px rgba(0,0,0,.06)' }
  const label = { display:'block', fontSize:'.8125rem', fontWeight:600, color:'#374151', marginBottom:'.375rem' }
  const input = { width:'100%', boxSizing:'border-box', padding:'10px 12px', border:'1.5px solid #E2E8F0', borderRadius:8, fontFamily:FF, fontSize:'.9375rem', color:'#1A2A33', outline:'none' }
  const primary = (disabled) => ({
    width:'100%', padding:'.875rem', borderRadius:99, border:'none',
    fontFamily:FF, fontWeight:700, fontSize:'1rem',
    cursor: disabled ? 'default' : 'pointer',
    background: disabled ? '#E2E8F0' : TEAL,
    color: disabled ? '#9CA3AF' : 'white',
    transition:'all .2s',
  })

  if (submitted) {
    return (
      <div style={shell}>
        <div style={nav}><Link to="/" style={brand}>Tere Health</Link></div>
        <div style={{ maxWidth:520, margin:'3rem auto', padding:'0 1.25rem' }}>
          <div style={card}>
            <div style={{ textAlign:'center', padding:'1rem 0' }}>
              <div style={{ fontSize:'3rem', marginBottom:'1rem' }}>✓</div>
              <h1 style={{ fontSize:'1.5rem', fontWeight:700, color:NAVY, margin:'0 0 .5rem' }}>
                Application received
              </h1>
              <p style={{ color:'#6B7280', fontSize:'.9375rem', lineHeight:1.6, margin:'0 0 1.5rem' }}>
                Ngā mihi, {form.first_name}. We'll review your application and get back to you within a week or so.
              </p>
              <Link to="/careers" style={{ display:'inline-block', padding:'.6rem 1.25rem', borderRadius:99, background:'#F1F5F9', color:NAVY, fontFamily:FF, fontWeight:600, fontSize:'.9rem', textDecoration:'none' }}>
                ← Back to careers
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={shell}>
      <div style={nav}>
        <Link to="/" style={{ ...brand, textDecoration:'none' }}>Tere</Link>
        <span style={{ color:'rgba(255,255,255,.4)', fontSize:'.8125rem' }}>Careers</span>
      </div>

      <div style={{ maxWidth:640, margin:'2.5rem auto', padding:'0 1.25rem' }}>
        <div style={{ marginBottom:'1.25rem' }}>
          <Link to="/careers" style={{ color:'#6B7280', fontSize:'.875rem', textDecoration:'none' }}>← Back to careers</Link>
        </div>

        <div style={card}>
          <h1 style={{ fontSize:'1.5rem', fontWeight:700, color:NAVY, margin:'0 0 .375rem' }}>
            {job ? `Apply — ${job.title}` : 'Apply to Tere Health'}
          </h1>
          <p style={{ color:'#6B7280', fontSize:'.9375rem', margin:'0 0 1.5rem' }}>
            {job?.location ? `${job.location}. ` : ''}Tell us about yourself. We aim to reply within a week.
          </p>

          <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
              <div>
                <label style={label}>First name*</label>
                <input style={input} value={form.first_name} onChange={e => set('first_name', e.target.value)} autoComplete="given-name" required />
              </div>
              <div>
                <label style={label}>Last name*</label>
                <input style={input} value={form.last_name} onChange={e => set('last_name', e.target.value)} autoComplete="family-name" required />
              </div>
            </div>

            <div>
              <label style={label}>Email*</label>
              <input style={input} type="email" value={form.email} onChange={e => set('email', e.target.value)} autoComplete="email" required />
            </div>

            <div>
              <label style={label}>Phone <span style={{ color:'#9CA3AF', fontWeight:400 }}>(optional)</span></label>
              <input style={input} value={form.phone} onChange={e => set('phone', e.target.value)} autoComplete="tel" />
            </div>

            <div>
              <label style={label}>Cover note</label>
              <textarea rows={5}
                style={{ ...input, resize:'vertical', lineHeight:1.55 }}
                value={form.cover_note}
                onChange={e => set('cover_note', e.target.value)}
                placeholder="Why Tere? What are you excited about? Anything else we should know."
              />
            </div>

            <div>
              <label style={label}>CV / résumé <span style={{ color:'#9CA3AF', fontWeight:400 }}>(PDF or Word, ≤5 MB)</span></label>
              <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={onFile}
                style={{ display:'block', fontSize:'.875rem', color:'#374151' }}
              />
              {cvFile && !cvError && (
                <div style={{ color:TEAL, fontSize:'.8125rem', marginTop:'.375rem' }}>
                  ✓ {cvFile.name} ({(cvFile.size / 1024).toFixed(0)} KB)
                </div>
              )}
              {cvError && <div style={{ color:'#DC2626', fontSize:'.8125rem', marginTop:'.375rem' }}>{cvError}</div>}
            </div>

            <div>
              <label style={label}>How did you hear about us? <span style={{ color:'#9CA3AF', fontWeight:400 }}>(optional)</span></label>
              <input style={input} value={form.source} onChange={e => set('source', e.target.value)} placeholder="e.g. LinkedIn, colleague, MCNZ newsletter" />
            </div>

            {error && (
              <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', color:'#B91C1C', padding:'.75rem 1rem', borderRadius:8, fontSize:'.875rem' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={submitting || !!cvError} style={primary(submitting || !!cvError)}>
              {submitting ? 'Submitting…' : 'Submit application'}
            </button>

            <p style={{ color:'#9CA3AF', fontSize:'.75rem', textAlign:'center', margin:0, lineHeight:1.5 }}>
              We store your application securely and use it only for hiring at Tere Health.<br />
              Prefer email? <a href="mailto:terehealthnz@gmail.com" style={{ color:TEAL, textDecoration:'none' }}>terehealthnz@gmail.com</a>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
