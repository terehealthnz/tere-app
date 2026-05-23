import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { DAY_SHORT, WEEK_ORDER, fmtTime, fmtDate, getWeekDates, getNZT } from '../../lib/schedule'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'

const SHIFT_COLORS = {
  available:   { bg:'#D1FAE5', fg:'#065F46', label:'Available' },
  unavailable: { bg:'#FEE2E2', fg:'#991B1B', label:'Unavailable' },
  leave:       { bg:'#FEF3C7', fg:'#92400E', label:'Leave' },
}

const DEFAULT_SCHEDULE = WEEK_ORDER.map(dow => ({
  day_of_week: dow,
  is_active:   false,
  start_time:  '09:00',
  end_time:    '17:00',
}))

// ── Recurring schedule editor ─────────────────────────────────────────────────

function RecurringEditor({ providerId, onSaved }) {
  const [days, setDays]       = useState(DEFAULT_SCHEDULE)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!providerId) return
    apiFetch(`/api/schedule?type=my&providerId=${providerId}`)
      .then(r => r.json())
      .then(({ schedules }) => {
        setDays(WEEK_ORDER.map(dow => {
          const rec = schedules.find(s => s.day_of_week === dow)
          return rec
            ? { day_of_week: dow, is_active: rec.is_active, start_time: rec.start_time.slice(0,5), end_time: rec.end_time.slice(0,5) }
            : { day_of_week: dow, is_active: false, start_time: '09:00', end_time: '17:00' }
        }))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [providerId])

  function setDay(dow, field, value) {
    setDays(ds => ds.map(d => d.day_of_week === dow ? { ...d, [field]: value } : d))
  }

  async function save() {
    setSaving(true)
    try {
      await apiFetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-recurring', providerId, days }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved?.()
    } catch {}
    setSaving(false)
  }

  if (loading) return <div style={{ textAlign:'center', padding:'1.5rem', color:'#9CA3AF' }}>Loading…</div>

  return (
    <div>
      {days.map(d => {
        const dayLabel = DAY_SHORT[d.day_of_week]
        return (
          <div key={d.day_of_week} style={{ display:'flex', alignItems:'center', gap:'.75rem', padding:'.75rem 0', borderBottom:'1px solid #F3F4F6' }}>
            {/* Day name + toggle */}
            <button
              onClick={() => setDay(d.day_of_week, 'is_active', !d.is_active)}
              style={{ display:'flex', alignItems:'center', gap:8, background:'none', border:'none', cursor:'pointer', padding:0, minWidth:80, minHeight:44 }}
            >
              <div style={{ width:40, height:24, borderRadius:12, background:d.is_active?TEAL:'#D1D5DB', position:'relative', transition:'background .15s', flexShrink:0 }}>
                <div style={{ position:'absolute', top:3, left:d.is_active?19:3, width:18, height:18, borderRadius:'50%', background:'white', transition:'left .15s', boxShadow:'0 1px 3px rgba(0,0,0,.2)' }} />
              </div>
              <span style={{ fontFamily:FF, fontWeight:700, fontSize:'.875rem', color:d.is_active?NAVY:'#9CA3AF', minWidth:30 }}>{dayLabel}</span>
            </button>

            {/* Time inputs */}
            {d.is_active ? (
              <div style={{ display:'flex', alignItems:'center', gap:'.5rem', flex:1 }}>
                <input
                  type="time"
                  value={d.start_time}
                  onChange={e => setDay(d.day_of_week, 'start_time', e.target.value)}
                  style={{ flex:1, border:'1.5px solid #E2E8F0', borderRadius:8, padding:'8px 10px', fontFamily:FF, fontSize:'.9375rem', outline:'none', minHeight:44 }}
                />
                <span style={{ color:'#9CA3AF', fontSize:'.8125rem' }}>to</span>
                <input
                  type="time"
                  value={d.end_time}
                  onChange={e => setDay(d.day_of_week, 'end_time', e.target.value)}
                  style={{ flex:1, border:'1.5px solid #E2E8F0', borderRadius:8, padding:'8px 10px', fontFamily:FF, fontSize:'.9375rem', outline:'none', minHeight:44 }}
                />
              </div>
            ) : (
              <span style={{ flex:1, color:'#9CA3AF', fontSize:'.875rem', fontFamily:FF }}>Off</span>
            )}
          </div>
        )
      })}

      <button
        onClick={save}
        disabled={saving}
        style={{ width:'100%', background:saving?'#9CA3AF':TEAL, color:'white', border:'none', borderRadius:10, padding:'14px', fontFamily:FF, fontWeight:700, fontSize:'1rem', cursor:'pointer', minHeight:52, marginTop:'1rem' }}
      >
        {saving ? 'Saving…' : saved ? '✓ Schedule saved' : 'Save recurring schedule'}
      </button>
    </div>
  )
}

// ── Add shift form ────────────────────────────────────────────────────────────

function AddShiftForm({ providerId, onAdded, onCancel }) {
  const today = getNZT().date
  const [form, setForm] = useState({ shift_date: today, start_time:'09:00', end_time:'17:00', shift_type:'available', notes:'' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  async function save() {
    if (!form.shift_date) { setError('Please select a date'); return }
    setSaving(true); setError('')
    try {
      const res = await apiFetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-shift', providerId, ...form }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to save'); setSaving(false); return }
      onAdded?.()
    } catch { setError('Connection error') }
    setSaving(false)
  }

  const inp = { width:'100%', boxSizing:'border-box', border:'1.5px solid #E2E8F0', borderRadius:8, padding:'10px 12px', fontFamily:FF, fontSize:'.9375rem', outline:'none', marginBottom:'.75rem' }

  return (
    <div style={{ background:'white', borderRadius:12, padding:'1.25rem', border:'1px solid #E2E8F0', marginBottom:'.875rem' }}>
      <div style={{ fontWeight:700, color:NAVY, marginBottom:'1rem', fontSize:'.9375rem' }}>Add one-off shift</div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.625rem', marginBottom:'.625rem' }}>
        <div>
          <label style={{ display:'block', fontSize:'.75rem', fontWeight:600, color:'#6B7280', marginBottom:4 }}>Date</label>
          <input type="date" value={form.shift_date} min={today} onChange={e => setForm(f => ({...f, shift_date:e.target.value}))} style={{ ...inp, marginBottom:0 }} />
        </div>
        <div>
          <label style={{ display:'block', fontSize:'.75rem', fontWeight:600, color:'#6B7280', marginBottom:4 }}>Type</label>
          <select value={form.shift_type} onChange={e => setForm(f => ({...f, shift_type:e.target.value}))} style={{ ...inp, marginBottom:0 }}>
            <option value="available">Available</option>
            <option value="leave">Leave</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </div>
      </div>

      {form.shift_type === 'available' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.625rem', marginBottom:'.625rem' }}>
          <div>
            <label style={{ display:'block', fontSize:'.75rem', fontWeight:600, color:'#6B7280', marginBottom:4 }}>Start time</label>
            <input type="time" value={form.start_time} onChange={e => setForm(f => ({...f, start_time:e.target.value}))} style={{ ...inp, marginBottom:0 }} />
          </div>
          <div>
            <label style={{ display:'block', fontSize:'.75rem', fontWeight:600, color:'#6B7280', marginBottom:4 }}>End time</label>
            <input type="time" value={form.end_time} onChange={e => setForm(f => ({...f, end_time:e.target.value}))} style={{ ...inp, marginBottom:0 }} />
          </div>
        </div>
      )}

      <input value={form.notes} onChange={e => setForm(f => ({...f, notes:e.target.value}))} placeholder="Notes (optional)" style={inp} />

      {error && <div style={{ background:'#FEF2F2', color:'#DC2626', borderRadius:8, padding:'8px 12px', fontSize:'.875rem', marginBottom:'.75rem' }}>{error}</div>}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.5rem' }}>
        <button onClick={onCancel} style={{ background:'white', border:'1.5px solid #E2E8F0', color:'#6B7280', borderRadius:10, padding:'12px', fontFamily:FF, fontWeight:600, cursor:'pointer', minHeight:48 }}>Cancel</button>
        <button onClick={save} disabled={saving} style={{ background:TEAL, border:'none', color:'white', borderRadius:10, padding:'12px', fontFamily:FF, fontWeight:700, cursor:'pointer', minHeight:48, opacity:saving?0.6:1 }}>
          {saving ? 'Saving…' : 'Add shift'}
        </button>
      </div>
    </div>
  )
}

// ── This week preview ─────────────────────────────────────────────────────────

function WeekPreview({ providerId }) {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!providerId) return
    apiFetch(`/api/schedule?type=my&providerId=${providerId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [providerId])

  useEffect(() => { load() }, [load])

  if (loading) return null
  if (!data) return null

  const weekDates = getWeekDates()
  const today = getNZT().date

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'.375rem' }}>
      {weekDates.map(dateStr => {
        const nztDay = new Date(dateStr + 'T12:00:00Z')
        const dow = [1,2,3,4,5,6,0][weekDates.indexOf(dateStr)] // Mon=1...Sun=0

        // One-off shift today?
        const shift = (data.shifts || []).find(s => s.shift_date === dateStr)
        // Recurring?
        const rec   = (data.schedules || []).find(s => s.day_of_week === dow && s.is_active)
        const isPast = dateStr < today

        let label = '—'
        let color = '#9CA3AF'
        let dot   = '#D1D5DB'

        if (shift) {
          const c = SHIFT_COLORS[shift.shift_type]
          label = shift.shift_type === 'available'
            ? `${fmtTime(shift.start_time)} – ${fmtTime(shift.end_time)}`
            : c.label
          color = c.fg
          dot = c.fg
        } else if (rec) {
          label = `${fmtTime(rec.start_time)} – ${fmtTime(rec.end_time)}`
          color = TEAL
          dot = TEAL
        }

        return (
          <div key={dateStr} style={{ display:'flex', alignItems:'center', gap:'.875rem', padding:'.5rem .75rem', borderRadius:8, background:dateStr===today?'#F0F9FA':'transparent', opacity:isPast?0.5:1 }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:dot, flexShrink:0 }} />
            <span style={{ fontFamily:FF, fontWeight:600, color:dateStr===today?TEAL:NAVY, fontSize:'.875rem', minWidth:80 }}>
              {nztDay.toLocaleDateString('en-NZ', { weekday:'short', day:'numeric', month:'short', timeZone:'Pacific/Auckland' })}
            </span>
            <span style={{ fontFamily:FF, fontSize:'.875rem', color }}>{label}</span>
            {shift && <span style={{ marginLeft:'auto', background:SHIFT_COLORS[shift.shift_type].bg, color:SHIFT_COLORS[shift.shift_type].fg, fontSize:'.6875rem', fontWeight:700, padding:'2px 7px', borderRadius:99 }}>One-off</span>}
          </div>
        )
      })}
    </div>
  )
}

// ── Upcoming shifts list ──────────────────────────────────────────────────────

function ShiftsList({ providerId, otherProviders, refreshKey, onRefresh }) {
  const [shifts, setShifts]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [offering, setOffering]   = useState(null)
  const [offerTo, setOfferTo]     = useState('')
  const [sendingOffer, setSendingOffer] = useState(false)
  const [deleting, setDeleting]   = useState(null)

  useEffect(() => {
    if (!providerId) return
    setLoading(true)
    apiFetch(`/api/schedule?type=my&providerId=${providerId}`)
      .then(r => r.json())
      .then(d => { setShifts(d.shifts || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [providerId, refreshKey])

  async function deleteShift(id) {
    setDeleting(id)
    await apiFetch(`/api/schedule?id=${id}&type=shift`, { method: 'DELETE' })
    setShifts(ss => ss.filter(s => s.id !== id))
    setDeleting(null)
    onRefresh?.()
  }

  async function offerShift(shiftId) {
    if (!offerTo) return
    setSendingOffer(true)
    await apiFetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'offer-shift', shiftId, offeredTo: offerTo }),
    })
    setOffering(null); setOfferTo('')
    setSendingOffer(false)
    onRefresh?.()
  }

  if (loading) return <div style={{ color:'#9CA3AF', fontSize:'.875rem', padding:'.5rem' }}>Loading…</div>

  if (!shifts.length) return (
    <div style={{ textAlign:'center', padding:'1.5rem', color:'#9CA3AF', fontSize:'.875rem' }}>No upcoming one-off shifts</div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'.625rem' }}>
      {shifts.map(s => {
        const c = SHIFT_COLORS[s.shift_type]
        return (
          <div key={s.id} style={{ background:'white', borderRadius:10, padding:'1rem', border:'1px solid #E2E8F0' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'.75rem', marginBottom: offering===s.id ? '.875rem' : 0 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, color:NAVY, fontSize:'.875rem' }}>{fmtDate(s.shift_date)}</div>
                <div style={{ fontSize:'.8125rem', color:'#6B7280', marginTop:2 }}>
                  {s.shift_type === 'available'
                    ? `${fmtTime(s.start_time)} – ${fmtTime(s.end_time)}`
                    : c.label}
                  {s.notes && <span> · {s.notes}</span>}
                </div>
              </div>
              <span style={{ background:c.bg, color:c.fg, fontSize:'.6875rem', fontWeight:700, padding:'2px 8px', borderRadius:99 }}>{c.label}</span>
              {s.shift_type === 'available' && otherProviders?.length > 0 && (
                <button onClick={() => setOffering(offering === s.id ? null : s.id)} style={{ background:'none', border:'1px solid #E2E8F0', color:'#6B7280', borderRadius:8, padding:'5px 10px', cursor:'pointer', fontSize:'.75rem', fontFamily:FF, minHeight:36 }}>
                  Offer
                </button>
              )}
              <button onClick={() => deleteShift(s.id)} disabled={deleting===s.id} style={{ background:'none', border:'none', color:'#DC2626', cursor:'pointer', fontSize:'1.1rem', minWidth:36, minHeight:44, display:'flex', alignItems:'center', justifyContent:'center' }}>
                {deleting===s.id ? '…' : '×'}
              </button>
            </div>

            {offering === s.id && (
              <div style={{ display:'flex', gap:'.5rem' }}>
                <select value={offerTo} onChange={e => setOfferTo(e.target.value)} style={{ flex:1, border:'1.5px solid #E2E8F0', borderRadius:8, padding:'9px 10px', fontFamily:FF, fontSize:'.875rem', outline:'none' }}>
                  <option value="">Select provider…</option>
                  {otherProviders.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
                </select>
                <button onClick={() => offerShift(s.id)} disabled={!offerTo || sendingOffer} style={{ background:TEAL, border:'none', color:'white', borderRadius:8, padding:'9px 14px', fontFamily:FF, fontWeight:700, cursor:'pointer', minHeight:44, opacity:!offerTo?0.5:1 }}>
                  {sendingOffer ? '…' : 'Send'}
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Shift offers inbox ────────────────────────────────────────────────────────

function OffersInbox({ providerId }) {
  const [offers, setOffers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [responding, setResponding] = useState(null)

  useEffect(() => {
    if (!providerId) return
    apiFetch(`/api/schedule?type=offers&providerId=${providerId}`)
      .then(r => r.json())
      .then(d => { setOffers(d.offers || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [providerId])

  async function respond(shiftId, response) {
    setResponding(shiftId + response)
    await apiFetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'respond-offer', shiftId, response, responderId: providerId }),
    })
    setOffers(os => os.filter(o => o.id !== shiftId))
    setResponding(null)
  }

  if (loading || !offers.length) return null

  return (
    <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:12, padding:'1.25rem', marginBottom:'.875rem' }}>
      <div style={{ fontWeight:700, color:'#92400E', marginBottom:'.875rem', fontSize:'.9375rem' }}>
        📬 Shift offers ({offers.length})
      </div>
      {offers.map(o => {
        const from = o.providers ? `${o.providers.first_name} ${o.providers.last_name}` : 'A colleague'
        return (
          <div key={o.id} style={{ background:'white', borderRadius:8, padding:'.875rem', marginBottom:'.5rem', border:'1px solid #E2E8F0' }}>
            <div style={{ fontWeight:600, color:NAVY, fontSize:'.875rem', marginBottom:'.25rem' }}>{fmtDate(o.shift_date)}</div>
            <div style={{ fontSize:'.8125rem', color:'#6B7280', marginBottom:'.75rem' }}>
              {fmtTime(o.start_time)} – {fmtTime(o.end_time)} · Offered by {from}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.5rem' }}>
              <button onClick={() => respond(o.id, 'declined')} disabled={!!responding} style={{ background:'#FEF2F2', color:'#DC2626', border:'1px solid #FECACA', borderRadius:8, padding:'10px', fontFamily:FF, fontWeight:600, cursor:'pointer', minHeight:44 }}>
                {responding===o.id+'declined' ? '…' : 'Decline'}
              </button>
              <button onClick={() => respond(o.id, 'accepted')} disabled={!!responding} style={{ background:'#F0FDF4', color:'#059669', border:'1px solid #BBF7D0', borderRadius:8, padding:'10px', fontFamily:FF, fontWeight:700, cursor:'pointer', minHeight:44 }}>
                {responding===o.id+'accepted' ? '…' : '✓ Accept'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ProviderSchedule({ embedded = false }) {
  const navigate = useNavigate()
  const providerId  = sessionStorage.getItem('providerId')
  const displayName = sessionStorage.getItem('providerDisplayName') || 'Provider'

  const [section, setSection]   = useState('week')   // 'week' | 'recurring' | 'shifts'
  const [showAddShift, setShowAddShift] = useState(false)
  const [otherProviders, setOtherProviders] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    import('../../lib/supabase').then(({ supabase }) => {
      supabase.from('providers').select('id, first_name, last_name').eq('is_active', true).eq('is_provider', true)
        .then(({ data }) => {
          setOtherProviders((data||[]).filter(p => p.id !== providerId))
        }).catch(() => {})
    })
  }, [providerId])

  const content = (
    <div style={{ padding:'1rem', fontFamily:FF }}>

      {/* Offers inbox */}
      <OffersInbox providerId={providerId} />

      {/* Section tabs */}
      <div style={{ display:'flex', gap:6, marginBottom:'1rem' }}>
        {[['week','This week'],['recurring','Recurring'],['shifts','One-off']].map(([id, label]) => (
          <button key={id} onClick={() => setSection(id)} style={{ flex:1, padding:'9px 6px', borderRadius:10, border:'1.5px solid', fontFamily:FF, fontWeight:700, fontSize:'.8125rem', cursor:'pointer', borderColor:section===id?TEAL:'#E2E8F0', background:section===id?TEAL:'white', color:section===id?'white':'#6B7280' }}>
            {label}
          </button>
        ))}
      </div>

      {/* This week preview */}
      {section === 'week' && (
        <div style={{ background:'white', borderRadius:12, padding:'1.25rem', border:'1px solid #E2E8F0' }}>
          <div style={{ fontWeight:700, color:NAVY, marginBottom:'1rem', fontSize:'.9375rem' }}>
            This week — {displayName.split(' ')[0]}
          </div>
          <WeekPreview providerId={providerId} />
          <button onClick={() => { setShowAddShift(true); setSection('shifts') }} style={{ width:'100%', background:TEAL, color:'white', border:'none', borderRadius:10, padding:'13px', fontFamily:FF, fontWeight:700, fontSize:'.9375rem', cursor:'pointer', minHeight:52, marginTop:'1rem' }}>
            + Add one-off shift
          </button>
        </div>
      )}

      {/* Recurring schedule editor */}
      {section === 'recurring' && (
        <div style={{ background:'white', borderRadius:12, padding:'1.25rem', border:'1px solid #E2E8F0' }}>
          <div style={{ fontWeight:700, color:NAVY, marginBottom:'.375rem', fontSize:'.9375rem' }}>Recurring schedule</div>
          <div style={{ fontSize:'.8125rem', color:'#6B7280', marginBottom:'1rem' }}>Repeats every week. Toggle days on/off and set hours.</div>
          <RecurringEditor providerId={providerId} onSaved={() => setRefreshKey(k => k+1)} />
        </div>
      )}

      {/* One-off shifts */}
      {section === 'shifts' && (
        <>
          {showAddShift ? (
            <AddShiftForm
              providerId={providerId}
              onAdded={() => { setShowAddShift(false); setRefreshKey(k => k+1) }}
              onCancel={() => setShowAddShift(false)}
            />
          ) : (
            <button onClick={() => setShowAddShift(true)} style={{ width:'100%', background:TEAL, color:'white', border:'none', borderRadius:12, padding:'14px', fontFamily:FF, fontWeight:700, fontSize:'1rem', cursor:'pointer', minHeight:52, marginBottom:'1rem' }}>
              + Add one-off shift
            </button>
          )}
          <div style={{ background:'white', borderRadius:12, padding:'1.25rem', border:'1px solid #E2E8F0' }}>
            <div style={{ fontWeight:700, color:NAVY, marginBottom:'1rem', fontSize:'.9375rem' }}>Upcoming one-off shifts</div>
            <ShiftsList
              providerId={providerId}
              otherProviders={otherProviders}
              refreshKey={refreshKey}
              onRefresh={() => setRefreshKey(k => k+1)}
            />
          </div>
        </>
      )}
    </div>
  )

  if (embedded) return content

  return (
    <div style={{ minHeight:'100vh', background:'#F7F5F0', fontFamily:FF }}>
      <div style={{ background:NAVY, padding:'.875rem 1.25rem', display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:'max(.875rem, env(safe-area-inset-top))' }}>
        <button onClick={() => navigate('/provider')} style={{ background:'none', border:'none', color:'rgba(255,255,255,.7)', fontSize:'1.25rem', cursor:'pointer', minWidth:44, minHeight:44, display:'flex', alignItems:'center' }}>‹</button>
        <span style={{ fontFamily:'Cormorant Garamond,Georgia,serif', fontStyle:'italic', color:'#D4EEF0', fontSize:'1.3rem' }}>My Schedule</span>
        <div style={{ width:44 }} />
      </div>
      {content}
    </div>
  )
}
