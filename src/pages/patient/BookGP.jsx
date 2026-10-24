import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import NamePicker from '../../components/NamePicker'
import DobPicker from '../../components/DobPicker'
import PhonePicker from '../../components/PhonePicker'

const TEAL = '#0B6E76'
const NAVY = '#0D2B45'
const FF = 'Plus Jakarta Sans, sans-serif'

function fmtSlot(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })
  } catch { return iso }
}

export default function BookGP() {
  const navigate = useNavigate()
  const [stage, setStage] = useState('loading')
  const [gps, setGps] = useState([])
  const [slot, setSlot] = useState(null)
  const [selectedGp, setSelectedGp] = useState(null)
  const [providerSlots, setProviderSlots] = useState([])
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [lookupCode, setLookupCode] = useState('')
  const [lookupDob, setLookupDob] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/gp-slots?action=list_gps')
      .then(r => r.status === 404 ? { gps: null } : r.json())
      .then(d => {
        if (d.gps === null) { setStage('disabled'); return }
        setGps(d.gps || [])
        setStage('fork')
      })
      .catch(() => setStage('disabled'))
  }, [])

  async function pickNextAvailable() {
    setErr(''); setBusy(true)
    try {
      const r = await fetch('/api/gp-slots?action=next_available')
      const d = await r.json()
      if (!d.slot) { setErr('No slots available in the next few days. Try a specific GP.'); return }
      setSlot(d.slot)
      setStage('details')
    } finally { setBusy(false) }
  }

  async function openProviderPicker() {
    setStage('provider_list')
  }

  async function pickProvider(gp) {
    setSelectedGp(gp)
    setBusy(true); setErr('')
    try {
      const from = new Date().toISOString()
      const to = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString()
      const r = await fetch(`/api/gp-slots?action=by_provider&provider_id=${gp.id}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      const d = await r.json()
      setProviderSlots(d.slots || [])
      setStage('provider_slots')
    } finally { setBusy(false) }
  }

  function chooseProviderSlot(s) {
    setSlot({ ...s, provider_id: selectedGp.id, provider_display_name: selectedGp.display_name })
    setStage('details')
  }

  async function submitBooking() {
    setErr('')
    if (!name || !dob || !email) { setErr('Please fill all required fields.'); return }
    const parts = name.trim().split(/\s+/)
    if (parts.length < 2) { setErr('Please enter first and last name.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/gp-book', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          appointment_id: slot.id,
          patient_first: parts[0],
          patient_last: parts.slice(1).join(' '),
          patient_dob: dob,
          patient_email: email,
          patient_phone: phone,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Could not complete booking.'); return }
      sessionStorage.setItem('consultationId', d.consultation_id)
      sessionStorage.setItem('tere_booking_code', d.booking_code)
      sessionStorage.setItem('tere_booking_slot', d.slot_start)
      navigate(`/triage?booking=${encodeURIComponent(d.booking_token)}`)
    } finally { setBusy(false) }
  }

  async function submitLookup() {
    setErr('')
    if (!lookupCode || !lookupDob) { setErr('Enter your 6-digit code and date of birth.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/gp-booking-lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ booking_code: lookupCode.trim(), patient_dob: lookupDob }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Booking not found. Check code and DOB.'); return }
      sessionStorage.setItem('consultationId', d.consultation_id)
      sessionStorage.setItem('tere_booking_slot', d.slot_start)
      navigate('/triage')
    } finally { setBusy(false) }
  }

  const Shell = ({ children }) => (
    <div style={{ minHeight: '100vh', background: '#F7F5F0', fontFamily: FF, padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 540, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', color: TEAL, fontSize: '1.75rem', fontWeight: 400 }}>Tere Health</div>
          <div style={{ color: '#6B7280', fontSize: '.875rem', marginTop: 4 }}>Scheduled GP appointments</div>
        </div>
        {children}
      </div>
    </div>
  )

  if (stage === 'loading') return <Shell><div style={{ textAlign: 'center', color: '#6B7280', padding: '3rem' }}>Loading...</div></Shell>

  if (stage === 'disabled') return (
    <Shell>
      <div style={{ background: 'white', borderRadius: 12, padding: '2rem', boxShadow: '0 2px 10px rgba(13,43,69,.06)', textAlign: 'center' }}>
        <div style={{ fontSize: '1.125rem', fontWeight: 700, color: NAVY, marginBottom: '.75rem' }}>Scheduled GP bookings are not yet live.</div>
        <div style={{ color: '#6B7280', lineHeight: 1.6, fontSize: '.9375rem' }}>If you need urgent care now, visit <a href="https://terehealth.co.nz" style={{ color: TEAL, fontWeight: 600 }}>terehealth.co.nz</a> to see a doctor straight away.</div>
      </div>
    </Shell>
  )

  if (stage === 'fork') return (
    <Shell>
      <div style={{ background: 'white', borderRadius: 12, padding: '2rem', boxShadow: '0 2px 10px rgba(13,43,69,.06)' }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: NAVY, textAlign: 'center', marginBottom: '.5rem' }}>Welcome to Tere</div>
        <div style={{ color: '#6B7280', textAlign: 'center', marginBottom: '2rem', fontSize: '.9375rem' }}>Do you need to make a booking, or do you already have one?</div>
        <button onClick={pickNextAvailable} disabled={busy} style={{ display: 'block', width: '100%', background: TEAL, color: 'white', border: 'none', padding: '1rem', borderRadius: 10, fontSize: '1rem', fontWeight: 700, cursor: 'pointer', marginBottom: '.75rem', fontFamily: FF }}>Make a booking</button>
        <button onClick={() => setStage('lookup')} disabled={busy} style={{ display: 'block', width: '100%', background: 'white', color: NAVY, border: `2px solid ${NAVY}`, padding: '1rem', borderRadius: 10, fontSize: '1rem', fontWeight: 700, cursor: 'pointer', fontFamily: FF }}>I already have a booking</button>
        {err && <div style={{ marginTop: '1rem', padding: '.75rem', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, color: '#991B1B', fontSize: '.875rem' }}>{err}</div>}
      </div>
    </Shell>
  )

  if (stage === 'provider_list') return (
    <Shell>
      <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', boxShadow: '0 2px 10px rgba(13,43,69,.06)' }}>
        <button onClick={() => setStage('fork')} style={{ background: 'none', border: 'none', color: TEAL, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: '1rem', fontFamily: FF }}>&lt; back</button>
        <div style={{ fontSize: '1.125rem', fontWeight: 700, color: NAVY, marginBottom: '1rem' }}>Choose a GP</div>
        {gps.length === 0 && <div style={{ color: '#6B7280' }}>No GPs available right now.</div>}
        {gps.map(g => (
          <button key={g.id} onClick={() => pickProvider(g)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'white', border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '1rem', marginBottom: '.5rem', cursor: 'pointer', fontFamily: FF, fontSize: '.9375rem', fontWeight: 600, color: NAVY }}>
            {g.display_name}
            <div style={{ color: '#6B7280', fontSize: '.8125rem', fontWeight: 400, marginTop: 2 }}>{g.provider_type || 'GP'}</div>
          </button>
        ))}
      </div>
    </Shell>
  )

  if (stage === 'provider_slots') return (
    <Shell>
      <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', boxShadow: '0 2px 10px rgba(13,43,69,.06)' }}>
        <button onClick={() => setStage('provider_list')} style={{ background: 'none', border: 'none', color: TEAL, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: '1rem', fontFamily: FF }}>&lt; back</button>
        <div style={{ fontSize: '1.125rem', fontWeight: 700, color: NAVY, marginBottom: '.25rem' }}>{selectedGp?.display_name}</div>
        <div style={{ color: '#6B7280', fontSize: '.8125rem', marginBottom: '1rem' }}>Pick a slot</div>
        {providerSlots.length === 0 && <div style={{ color: '#6B7280' }}>No open slots in the next two weeks.</div>}
        {providerSlots.map(s => (
          <button key={s.id} onClick={() => chooseProviderSlot(s)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'white', border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '.75rem 1rem', marginBottom: '.375rem', cursor: 'pointer', fontFamily: FF, fontSize: '.9375rem', color: NAVY }}>
            {fmtSlot(s.slot_start)}
          </button>
        ))}
      </div>
    </Shell>
  )

  if (stage === 'details') return (
    <Shell>
      <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', boxShadow: '0 2px 10px rgba(13,43,69,.06)' }}>
        <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: '.75rem 1rem', marginBottom: '1rem' }}>
          <div style={{ fontSize: '.75rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Slot held</div>
          <div style={{ color: NAVY, fontWeight: 600, marginTop: 4 }}>{slot?.provider_display_name}</div>
          <div style={{ color: '#374151', marginTop: 2, fontSize: '.9375rem' }}>{fmtSlot(slot?.slot_start)}</div>
        </div>
        <button onClick={pickNextAvailable} style={{ background: 'none', border: 'none', color: TEAL, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: '1rem', fontFamily: FF, fontSize: '.8125rem' }}>&lt; pick a different slot</button>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: NAVY, marginBottom: '.75rem' }}>Your details</div>
        <NamePicker value={name} onChange={setName} style={{ marginBottom: '.75rem' }} />
        <div style={{ marginBottom: '.75rem' }}><DobPicker value={dob} onChange={setDob} /></div>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" style={{ width: '100%', padding: '.6rem .75rem', border: '1.5px solid #E2E8F0', borderRadius: 8, marginBottom: '.75rem', fontFamily: FF, fontSize: '.95rem', boxSizing: 'border-box' }} />
        <div style={{ marginBottom: '1rem' }}><PhonePicker value={phone} onChange={setPhone} /></div>
        {err && <div style={{ marginBottom: '.75rem', padding: '.625rem', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, color: '#991B1B', fontSize: '.8125rem' }}>{err}</div>}
        <button onClick={submitBooking} disabled={busy} style={{ display: 'block', width: '100%', background: TEAL, color: 'white', border: 'none', padding: '1rem', borderRadius: 10, fontSize: '1rem', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: FF }}>{busy ? 'Booking...' : 'Confirm booking'}</button>
      </div>
    </Shell>
  )

  if (stage === 'lookup') return (
    <Shell>
      <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', boxShadow: '0 2px 10px rgba(13,43,69,.06)' }}>
        <button onClick={() => setStage('fork')} style={{ background: 'none', border: 'none', color: TEAL, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: '1rem', fontFamily: FF }}>&lt; back</button>
        <div style={{ fontSize: '1.125rem', fontWeight: 700, color: NAVY, marginBottom: '.75rem' }}>Find your booking</div>
        <div style={{ color: '#6B7280', fontSize: '.875rem', marginBottom: '1rem', lineHeight: 1.5 }}>Enter the 6-digit code you received when you booked, plus your date of birth.</div>
        <input type="text" value={lookupCode} onChange={e => setLookupCode(e.target.value)} placeholder="6-digit code" maxLength={6} style={{ width: '100%', padding: '.6rem .75rem', border: '1.5px solid #E2E8F0', borderRadius: 8, marginBottom: '.75rem', fontFamily: FF, fontSize: '.95rem', boxSizing: 'border-box', letterSpacing: '.1em' }} />
        <div style={{ marginBottom: '1rem' }}><DobPicker value={lookupDob} onChange={setLookupDob} /></div>
        {err && <div style={{ marginBottom: '.75rem', padding: '.625rem', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, color: '#991B1B', fontSize: '.8125rem' }}>{err}</div>}
        <button onClick={submitLookup} disabled={busy} style={{ display: 'block', width: '100%', background: TEAL, color: 'white', border: 'none', padding: '1rem', borderRadius: 10, fontSize: '1rem', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: FF }}>{busy ? 'Looking up...' : 'Continue'}</button>
      </div>
    </Shell>
  )

  return null
}
