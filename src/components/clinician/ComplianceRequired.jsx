import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProviderCompliance, uploadProviderCompliancePdf, fileToBase64 } from '../../lib/supabase'

// Hard-block page for providers whose compliance_completed_at is null.
// The provider cannot reach the sandbox — or anything else — until they
// upload BOTH:
//   - a current APC (Annual Practising Certificate) with number + expiry
//   - a current Medical Indemnity certificate with insurer + policy no. + expiry
//
// Both expiries must be today or later. Server auto-stamps
// compliance_completed_at when the trailing upload lands. This page then
// bounces to the dashboard.
//
// No skip. No "come back later". This is the equivalent of the MFA gate
// — you complete it once, or you don't practise on Tere Health.

export default function ComplianceRequired() {
  const navigate = useNavigate()
  const providerId   = typeof window !== 'undefined' ? sessionStorage.getItem('providerId') : null
  const providerName = typeof window !== 'undefined' ? sessionStorage.getItem('providerDisplayName') : ''
  const isAdmin      = typeof window !== 'undefined' ? sessionStorage.getItem('providerIsAdmin') === 'true' : false

  const [loading, setLoading] = useState(true)
  const [state, setState] = useState(null)  // { completed_at, apc, medical_indemnity }
  const [errorMsg, setErrorMsg] = useState('')

  const refresh = useCallback(async () => {
    if (!providerId) return
    try {
      const c = await getProviderCompliance(providerId)
      setState(c)
      if (c?.completed_at) {
        sessionStorage.setItem('providerComplianceCompleted', 'true')
        navigate(isAdmin ? '/clinician/admin' : '/clinician/dashboard')
      }
    } catch (e) {
      setErrorMsg(e.message || 'Could not load compliance status.')
    } finally {
      setLoading(false)
    }
  }, [providerId, isAdmin, navigate])

  useEffect(() => {
    if (!providerId) { navigate('/clinician'); return }
    refresh()
  }, [providerId, navigate, refresh])

  return (
    <div style={{
      minHeight:'100dvh', background:'#0D2B45', color:'white',
      display:'flex', alignItems:'flex-start', justifyContent:'center',
      fontFamily:'Plus Jakarta Sans, sans-serif', padding:'2.5rem 1.25rem',
    }}>
      <div style={{ width:'100%', maxWidth:720 }}>
        <div style={{ textAlign:'center', marginBottom:'1.5rem' }}>
          <div style={{ fontFamily:'Cormorant Garamond, Georgia, serif', fontSize:'2.5rem', fontStyle:'italic', color:'#D4EEF0', letterSpacing:'.08em' }}>
            Tere
          </div>
        </div>
        <div style={{ background:'#B45309', color:'white', borderRadius:12, padding:'1rem 1.25rem', marginBottom:'1.25rem', fontWeight:700, fontSize:'.9375rem', textAlign:'center' }}>
          📋 Compliance documents required
        </div>
        <p style={{ color:'rgba(255,255,255,.85)', fontSize:'.9375rem', lineHeight:1.65, marginBottom:'.75rem' }}>
          Kia ora {providerName || 'there'} — before you can access the sandbox or see any patient, we need two documents on file:
        </p>
        <ol style={{ color:'rgba(255,255,255,.85)', fontSize:'.9rem', lineHeight:1.7, margin:'0 0 1.5rem', paddingLeft:'1.25rem' }}>
          <li>Your current <strong>Annual Practising Certificate (APC)</strong> — number + expiry + PDF.</li>
          <li>Your current <strong>Medical Indemnity</strong> certificate — insurer + policy number + expiry + PDF.</li>
        </ol>
        <p style={{ color:'rgba(255,255,255,.55)', fontSize:'.8125rem', lineHeight:1.6, marginBottom:'1.5rem' }}>
          Both must be current (expiry today or later). Provisional or pending APCs are not accepted — please upload only after the physical certificate has landed. Any admin at Tere can verify these separately before unlocking patient access.
        </p>

        {loading && (
          <div style={{ color:'rgba(255,255,255,.7)', fontSize:'.9rem', textAlign:'center', padding:'2rem' }}>
            Loading…
          </div>
        )}

        {errorMsg && (
          <div style={{ background:'#7F1D1D', color:'white', padding:'.75rem 1rem', borderRadius:8, marginBottom:'1rem', fontSize:'.85rem' }}>
            {errorMsg}
          </div>
        )}

        {!loading && state && (
          <>
            <UploadCard
              kind="apc"
              title="Annual Practising Certificate (APC)"
              status={state.apc}
              onUploaded={refresh}
            />
            <div style={{ height:'1rem' }} />
            <UploadCard
              kind="mi"
              title="Medical Indemnity certificate"
              status={state.medical_indemnity}
              onUploaded={refresh}
            />
            <p style={{ color:'rgba(255,255,255,.4)', fontSize:'.75rem', textAlign:'center', marginTop:'2rem', lineHeight:1.6 }}>
              This page cannot be dismissed. Once both documents are uploaded and current, you'll be taken to your dashboard automatically. If you need to change your mind about joining Tere, close this tab and email hello@terehealth.co.nz.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// APC needs: number, expiry, PDF.
// MI  needs: insurer, policy number, expiry, PDF.
function UploadCard({ kind, title, status, onUploaded }) {
  const isApc = kind === 'apc'
  const alreadyUploaded = !!status?.uploaded_at
  const todayIso = new Date().toISOString().slice(0, 10)
  const currentExpiryValid = status?.expiry_date && status.expiry_date >= todayIso

  const [apcNumber,      setApcNumber]      = useState(status?.number || '')
  const [apcExpiryDate,  setApcExpiryDate]  = useState(status?.expiry_date || '')
  const [miInsurer,      setMiInsurer]      = useState(status?.insurer || '')
  const [miPolicyNumber, setMiPolicyNumber] = useState(status?.policy_number || '')
  const [miExpiryDate,   setMiExpiryDate]   = useState(status?.expiry_date || '')

  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const fileInputRef = useRef(null)

  const canSubmit = !!file && (
    isApc
      ? (apcNumber.trim().length >= 2 && !!apcExpiryDate && apcExpiryDate >= todayIso)
      : (miInsurer.trim().length >= 2 && miPolicyNumber.trim().length >= 2 && !!miExpiryDate && miExpiryDate >= todayIso)
  )

  async function submit() {
    if (!canSubmit || uploading) return
    setUploading(true); setErr(''); setMsg('')
    try {
      const pdfBase64 = await fileToBase64(file)
      const payload = isApc
        ? { kind, pdfBase64, pdfName: file.name, apcNumber: apcNumber.trim(), apcExpiryDate }
        : { kind, pdfBase64, pdfName: file.name, miInsurer: miInsurer.trim(), miPolicyNumber: miPolicyNumber.trim(), miExpiryDate }
      await uploadProviderCompliancePdf(payload)
      setMsg('Uploaded.')
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      onUploaded?.()
    } catch (e) {
      setErr(e.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const stateBadge = alreadyUploaded && currentExpiryValid
    ? { color:'#065F46', bg:'#D1FAE5', label:'ON FILE' }
    : alreadyUploaded && !currentExpiryValid
      ? { color:'#B45309', bg:'#FEF3C7', label:'EXPIRED — RE-UPLOAD' }
      : { color:'#B91C1C', bg:'#FEE2E2', label:'MISSING' }

  return (
    <div style={{ background:'white', color:'#0D2B45', borderRadius:12, padding:'1.25rem 1.5rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', gap:12, flexWrap:'wrap' }}>
        <div style={{ fontWeight:700, fontSize:'1rem' }}>{title}</div>
        <span style={{ padding:'3px 10px', fontSize:'.7rem', fontWeight:700, letterSpacing:'.03em', textTransform:'uppercase', color:stateBadge.color, background:stateBadge.bg, borderRadius:99 }}>
          {stateBadge.label}
        </span>
      </div>

      {isApc ? (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:'1rem' }}>
          <Field label="APC number">
            <input value={apcNumber} onChange={e => setApcNumber(e.target.value)} placeholder="e.g. 12345" style={inp} />
          </Field>
          <Field label="Expiry date">
            <input type="date" value={apcExpiryDate} onChange={e => setApcExpiryDate(e.target.value)} min={todayIso} style={inp} />
          </Field>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:'1rem' }}>
          <Field label="Insurer">
            <input value={miInsurer} onChange={e => setMiInsurer(e.target.value)} placeholder="e.g. MPS, MAS, Berkshire" style={inp} />
          </Field>
          <Field label="Policy number">
            <input value={miPolicyNumber} onChange={e => setMiPolicyNumber(e.target.value)} placeholder="Policy # / Cert #" style={inp} />
          </Field>
          <Field label="Expiry date">
            <input type="date" value={miExpiryDate} onChange={e => setMiExpiryDate(e.target.value)} min={todayIso} style={inp} />
          </Field>
        </div>
      )}

      <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', marginBottom:8 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={e => setFile(e.target.files?.[0] || null)}
          style={{ fontSize:'.85rem' }}
        />
        <button
          onClick={submit}
          disabled={!canSubmit || uploading}
          style={{
            background: canSubmit && !uploading ? '#0B6E76' : '#94A3B8',
            color:'white', border:'none', borderRadius:8,
            padding:'.5rem 1rem', fontWeight:700, fontSize:'.85rem',
            cursor: canSubmit && !uploading ? 'pointer' : 'not-allowed',
            fontFamily:'inherit',
          }}>
          {uploading ? 'Uploading…' : (alreadyUploaded ? 'Replace' : 'Upload')}
        </button>
      </div>

      {err && <div style={{ color:'#B91C1C', fontSize:'.8rem', marginTop:4 }}>{err}</div>}
      {msg && <div style={{ color:'#065F46', fontSize:'.8rem', marginTop:4 }}>{msg}</div>}
      {!file && !err && !msg && (
        <div style={{ color:'#6B7280', fontSize:'.75rem', marginTop:4 }}>PDF only. Max 4&nbsp;MB.</div>
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <span style={{ fontSize:'.7rem', textTransform:'uppercase', letterSpacing:'.05em', color:'#6B7280', fontWeight:700 }}>{label}</span>
      {children}
    </label>
  )
}

const inp = {
  border:'1.5px solid #E2E8F0', borderRadius:8,
  padding:'.5rem .6rem', fontSize:'.9rem', fontFamily:'inherit',
  boxSizing:'border-box', width:'100%',
}
