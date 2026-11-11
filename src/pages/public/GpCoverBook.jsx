// Patient-facing slot picker + booking form for /gp/[slug]/book.
//
// Three steps:
//   1. Pick a date + slot from available times
//   2. Enter patient info (name, DOB, NHI, phone, email, reason, language)
//   3. Confirm — creates scheduled consultation via /api/pho-rural?action=book
//
// On success, shows confirmation screen with the appointment time + SMS
// reminder notice. Patient will receive the SMS join link 15 min before
// their appointment (TODO: wire the reminder cron — phase 2).

import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const CREAM = '#F7F5F0'
const FF = 'Plus Jakarta Sans, sans-serif'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'mi', label: 'Te Reo Māori' },
  { code: 'sm', label: 'Gagana Sāmoa' },
  { code: 'zh', label: '中文' },
  { code: 'nl', label: 'Nederlands' },
]

function fmtDay(iso) {
  return new Date(iso).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })
}
function dayKey(iso) {
  return new Date(iso).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function GpCoverBook() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [practice, setPractice] = useState(null)
  const [slots, setSlots] = useState(null)
  const [step, setStep] = useState(1)  // 1=slot, 2=info, 3=confirm, 4=done
  const [chosen, setChosen] = useState(null)
  const [form, setForm] = useState({
    first_name: '', last_name: '', dob: '', nhi: '', phone: '', email: '',
    reason: '', language: 'en',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [booked, setBooked] = useState(null)

  useEffect(() => {
    (async () => {
      try {
        const [r1, r2] = await Promise.all([
          apiFetch(`/api/pho-rural?action=practice&slug=${encodeURIComponent(slug)}`),
          apiFetch(`/api/pho-rural?action=available_slots&practice=${encodeURIComponent(slug)}`),
        ])
        const [j1, j2] = await Promise.all([r1.json(), r2.json()])
        if (!r1.ok) throw new Error(j1.error || 'Practice not found')
        setPractice(j1.practice)
        setSlots(j2.slots || [])
      } catch (e) { setError(e.message); setSlots([]) }
    })()
  }, [slug])

  // Group slots by day for the picker UI
  const slotsByDay = useMemo(() => {
    const m = new Map()
    for (const s of (slots || [])) {
      const k = dayKey(s.start)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(s)
    }
    return m
  }, [slots])

  async function submitBooking() {
    setError(''); setBusy(true)
    try {
      const r = await apiFetch('/api/pho-rural', {
        method: 'POST',
        body: JSON.stringify({
          action: 'book',
          practice_slug: slug,
          slot_start: chosen.start,
          patient_first_name: form.first_name.trim(),
          patient_last_name:  form.last_name.trim(),
          patient_dob:   form.dob || null,
          patient_nhi:   form.nhi.trim().toUpperCase() || null,
          patient_phone: form.phone.trim(),
          patient_email: form.email.trim() || null,
          reason: form.reason.trim() || null,
          language: form.language,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Booking failed')
      setBooked(j)
      setStep(4)
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  if (!practice || slots === null) {
    return <div style={{ minHeight: '100dvh', background: CREAM, fontFamily: FF, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280' }}>Loading…</div>
  }

  return (
    <div style={{ minHeight: '100dvh', background: CREAM, fontFamily: FF }}>
      <nav style={{ background: NAVY, color: 'white', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button onClick={() => step > 1 && step < 4 ? setStep(step - 1) : navigate(`/gp/${slug}`)}
          style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.4rem', cursor: 'pointer', padding: 0 }}>←</button>
        <div>
          <div style={{ fontSize: '.75rem', color: 'rgba(212,238,240,0.7)' }}>{practice.name} GP Cover</div>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>
            {step === 1 && 'Pick a time'}
            {step === 2 && 'Your details'}
            {step === 3 && 'Confirm appointment'}
            {step === 4 && 'Appointment booked'}
          </div>
        </div>
      </nav>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: '1.5rem 1.25rem' }}>
        {/* STEP 1: slot picker */}
        {step === 1 && (
          <>
            {slotsByDay.size === 0 && (
              <div style={{ background: 'white', border: '1px dashed #E2E8F0', borderRadius: 12, padding: '2rem', textAlign: 'center', color: '#6B7280' }}>
                No appointment times are open right now. Please check back later or phone the practice.
              </div>
            )}
            {Array.from(slotsByDay.entries()).map(([day, daySlots]) => (
              <div key={day} style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '.875rem', fontWeight: 700, color: NAVY, marginBottom: '.5rem' }}>{day}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '.5rem' }}>
                  {daySlots.map(s => (
                    <button key={s.start} onClick={() => { setChosen(s); setStep(2) }}
                      style={{ background: 'white', border: '1px solid #D4EEF0', borderRadius: 10, padding: '.65rem .4rem', fontFamily: FF, fontWeight: 600, fontSize: '.875rem', cursor: 'pointer', color: NAVY }}>
                      <div>{fmtTime(s.start)}</div>
                      <div style={{ fontSize: '.6875rem', color: '#6B7280', fontWeight: 500 }}>{s.minutes} min</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {/* STEP 2: patient info */}
        {step === 2 && (
          <>
            <div style={{ background: '#F0F9FA', border: '1px solid #D4EEF0', borderRadius: 10, padding: '.85rem 1rem', color: NAVY, fontSize: '.875rem', marginBottom: '1rem' }}>
              <b>{fmtDay(chosen.start)}</b> at <b>{fmtTime(chosen.start)}</b> · with {chosen.provider_name}{chosen.provider_credential ? ` (${chosen.provider_credential})` : ''}
            </div>

            <Field label="First name"  required value={form.first_name} on={v => setForm(f => ({ ...f, first_name: v }))} />
            <Field label="Last name"   required value={form.last_name}  on={v => setForm(f => ({ ...f, last_name: v }))} />
            <Field label="Date of birth" type="date" value={form.dob}   on={v => setForm(f => ({ ...f, dob: v }))} />
            <Field label="NHI number"  placeholder="e.g. ZZZ0032"       value={form.nhi} on={v => setForm(f => ({ ...f, nhi: v }))} />
            <Field label="Mobile phone" required type="tel" placeholder="02x xxx xxxx" value={form.phone} on={v => setForm(f => ({ ...f, phone: v }))} />
            <Field label="Email"       type="email" placeholder="you@example.co.nz" value={form.email} on={v => setForm(f => ({ ...f, email: v }))} />
            <Field label="Reason for visit" multiline value={form.reason} on={v => setForm(f => ({ ...f, reason: v }))} />

            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <div style={{ fontSize: '.8125rem', fontWeight: 600, color: '#374151', marginBottom: '.3rem' }}>Preferred language</div>
              <select value={form.language} onChange={e => setForm({ ...form, language: e.target.value })}
                style={{ width: '100%', padding: '.65rem .75rem', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: '.9375rem', fontFamily: FF, background: 'white' }}>
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </label>

            <button onClick={() => {
              if (!form.first_name.trim() || !form.last_name.trim() || !form.phone.trim()) { setError('Name and phone are required'); return }
              setError(''); setStep(3)
            }}
              style={{ width: '100%', background: TEAL, color: 'white', border: 'none', borderRadius: 10, padding: '.85rem', fontFamily: FF, fontWeight: 700, fontSize: '1rem', cursor: 'pointer', marginTop: '.5rem' }}>
              Continue
            </button>
            {error && <div style={{ color: '#991B1B', fontSize: '.8125rem', marginTop: '.75rem', textAlign: 'center' }}>{error}</div>}
          </>
        )}

        {/* STEP 3: confirm */}
        {step === 3 && (
          <>
            <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '1.25rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: NAVY, marginBottom: '.75rem' }}>Confirm your appointment</div>
              <Row label="When"     v={`${fmtDay(chosen.start)} · ${fmtTime(chosen.start)}`} />
              <Row label="With"     v={`${chosen.provider_name}${chosen.provider_credential ? ' · ' + chosen.provider_credential : ''}`} />
              <Row label="Practice" v={practice.name} />
              <Row label="Patient"  v={`${form.first_name} ${form.last_name}${form.dob ? ' · DOB ' + form.dob : ''}`} />
              <Row label="Phone"    v={form.phone} />
              {form.email && <Row label="Email" v={form.email} />}
              {form.nhi   && <Row label="NHI"   v={form.nhi.toUpperCase()} />}
              {form.reason && <Row label="Reason" v={form.reason} />}
            </div>

            <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, padding: '.85rem 1rem', fontSize: '.8125rem', color: '#78350F', lineHeight: 1.5, marginBottom: '1rem' }}>
              You'll get an SMS with the join link about 15 minutes before your appointment. The call is via video on your phone or computer. If you need to cancel, phone the practice.
            </div>

            <button onClick={submitBooking} disabled={busy}
              style={{ width: '100%', background: TEAL, color: 'white', border: 'none', borderRadius: 10, padding: '.85rem', fontFamily: FF, fontWeight: 700, fontSize: '1rem', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
              {busy ? 'Booking…' : 'Confirm appointment'}
            </button>
            {error && <div style={{ color: '#991B1B', fontSize: '.8125rem', marginTop: '.75rem', textAlign: 'center' }}>{error}</div>}
          </>
        )}

        {/* STEP 4: done */}
        {step === 4 && booked && (
          <div style={{ background: 'white', border: '1px solid #D4EEF0', borderRadius: 12, padding: '2rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '.75rem' }}>✓</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: NAVY, marginBottom: '.5rem' }}>Appointment booked</div>
            <div style={{ color: '#4B5563', fontSize: '.9375rem', marginBottom: '1.5rem' }}>
              <b>{booked.scheduled_for_nz}</b><br/>at {booked.practice}
            </div>
            <div style={{ background: '#F0F9FA', borderRadius: 10, padding: '.85rem 1rem', fontSize: '.8125rem', color: NAVY, textAlign: 'left', marginBottom: '1.25rem' }}>
              We'll text {form.phone} about 15 minutes before to join the video call. Keep an eye on your phone.
            </div>
            <button onClick={() => navigate(`/gp/${slug}`)}
              style={{ background: 'white', color: NAVY, border: `2px solid ${NAVY}`, borderRadius: 10, padding: '.75rem 1.5rem', fontFamily: FF, fontWeight: 700, fontSize: '.9375rem', cursor: 'pointer' }}>
              Done
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

function Field({ label, value, on, required, type = 'text', placeholder, multiline }) {
  return (
    <label style={{ display: 'block', marginBottom: '.75rem' }}>
      <div style={{ fontSize: '.8125rem', fontWeight: 600, color: '#374151', marginBottom: '.3rem' }}>
        {label}{required && <span style={{ color: '#DC2626' }}> *</span>}
      </div>
      {multiline
        ? <textarea rows={3} value={value} onChange={e => on(e.target.value)} placeholder={placeholder}
            style={{ width: '100%', padding: '.65rem .75rem', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: '.9375rem', fontFamily: FF, resize: 'vertical' }} />
        : <input type={type} value={value} onChange={e => on(e.target.value)} placeholder={placeholder}
            style={{ width: '100%', padding: '.65rem .75rem', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: '.9375rem', fontFamily: FF }} />}
    </label>
  )
}

function Row({ label, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '.4rem 0', borderBottom: '1px solid #F3F4F6', fontSize: '.875rem' }}>
      <span style={{ color: '#6B7280' }}>{label}</span>
      <span style={{ color: NAVY, fontWeight: 600, textAlign: 'right' }}>{v}</span>
    </div>
  )
}
