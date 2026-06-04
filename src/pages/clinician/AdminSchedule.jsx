import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { DAY_SHORT, WEEK_ORDER, fmtTime, fmtDate, getWeekDates, getNZT, timeInRange } from '../../lib/schedule'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'

// Compute providers available on a given date
function computeDayProviders(dateStr, dow, schedules, shifts, providers) {
  const dayShifts   = (shifts    || []).filter(s => s.shift_date === dateStr)
  const unavailIds  = new Set(dayShifts.filter(s => s.shift_type !== 'available').map(s => s.provider_id))
  const extraAvail  = dayShifts.filter(s => s.shift_type === 'available')
  const recurring   = (schedules || []).filter(s => s.day_of_week === dow && s.is_active && !unavailIds.has(s.provider_id))

  const provMap = Object.fromEntries((providers || []).map(p => [p.id, p]))

  const slots = [
    ...extraAvail.map(s => ({ ...s, source: 'oneoff' })),
    ...recurring.map(s => ({ ...s, source: 'recurring' })),
  ]

  return slots.map(s => ({
    ...s,
    provider: provMap[s.provider_id],
    start: s.start_time?.slice(0,5),
    end:   s.end_time?.slice(0,5),
  })).filter(s => s.provider)
}

// Check next N days for coverage gaps
function findGaps(schedules, shifts, days = 14) {
  const gaps = []
  for (let i = 0; i < days; i++) {
    const ref = new Date()
    ref.setUTCDate(ref.getUTCDate() + i)
    const nzt = getNZT(ref)
    const dow = WEEK_ORDER.indexOf(nzt.dayOfWeek) >= 0 ? nzt.dayOfWeek : nzt.dayOfWeek
    const slots = computeDayProviders(nzt.date, nzt.dayOfWeek, schedules, shifts, [])
    // A gap = no recurring schedules OR all recurring providers marked unavailable
    const hasRecurring = (schedules || []).some(s => s.day_of_week === nzt.dayOfWeek && s.is_active)
    const dayShifts    = (shifts || []).filter(s => s.shift_date === nzt.date)
    const hasExtraAvail = dayShifts.some(s => s.shift_type === 'available')
    const allBlocked    = hasRecurring && (schedules || [])
      .filter(s => s.day_of_week === nzt.dayOfWeek && s.is_active)
      .every(s => dayShifts.some(ds => ds.provider_id === s.provider_id && ds.shift_type !== 'available'))

    if (!hasRecurring && !hasExtraAvail) {
      gaps.push(nzt.date)
    } else if (allBlocked && !hasExtraAvail) {
      gaps.push(nzt.date)
    }
  }
  return gaps
}

// ── Provider chip ─────────────────────────────────────────────────────────────

function ProviderChip({ slot, onTap }) {
  const p = slot.provider
  const color = p?.color || TEAL
  const initials = p ? `${p.first_name[0]}${p.last_name[0]}` : '?'
  return (
    <button
      onClick={() => onTap(slot)}
      style={{ display:'flex', alignItems:'center', gap:5, background:color+'18', border:`1px solid ${color}40`, borderRadius:99, padding:'3px 9px 3px 5px', cursor:'pointer', marginBottom:3, whiteSpace:'nowrap', minHeight:32 }}
    >
      <div style={{ width:22, height:22, borderRadius:'50%', background:color, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:'.6875rem', fontWeight:700, flexShrink:0 }}>
        {initials}
      </div>
      <span style={{ fontFamily:FF, fontSize:'.75rem', fontWeight:600, color }}>
        {fmtTime(slot.start)}–{fmtTime(slot.end)}
      </span>
      {slot.source === 'oneoff' && (
        <span style={{ fontSize:'.5625rem', fontWeight:700, color, opacity:.7 }}>★</span>
      )}
    </button>
  )
}

// ── Day card ──────────────────────────────────────────────────────────────────

function DayCard({ dateStr, dow, schedules, shifts, providers, today, onSlotTap }) {
  const slots = computeDayProviders(dateStr, dow, schedules, shifts, providers)
  const isPast = dateStr < today
  const isToday = dateStr === today
  const noCoverage = slots.length === 0

  return (
    <div style={{
      background: isToday ? '#F0F9FA' : 'white',
      borderRadius: 12,
      border: `1.5px solid ${isToday ? TEAL : noCoverage ? '#FECACA' : '#E2E8F0'}`,
      padding: '.75rem',
      opacity: isPast ? 0.55 : 1,
      flexShrink: 0,
    }}>
      {/* Day header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'.5rem' }}>
        <div>
          <span style={{ fontFamily:FF, fontWeight:800, fontSize:'.8125rem', color: isToday ? TEAL : NAVY }}>
            {DAY_SHORT[dow]}
          </span>
          <span style={{ fontFamily:FF, fontSize:'.75rem', color:'#9CA3AF', marginLeft:5 }}>
            {new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-NZ', { day:'numeric', month:'short', timeZone:'Pacific/Auckland' })}
          </span>
        </div>
        {isToday && <span style={{ background:TEAL, color:'white', fontSize:'.5625rem', fontWeight:700, padding:'2px 6px', borderRadius:99 }}>TODAY</span>}
      </div>

      {/* Slots or gap */}
      {noCoverage ? (
        <div style={{ display:'flex', alignItems:'center', gap:5, background:'#FEF2F2', borderRadius:8, padding:'5px 8px' }}>
          <span style={{ fontSize:'.75rem' }}>⚠️</span>
          <span style={{ fontFamily:FF, fontSize:'.75rem', fontWeight:700, color:'#DC2626' }}>No coverage</span>
        </div>
      ) : (
        <div>
          {slots.map((slot, i) => (
            <ProviderChip key={`${slot.provider_id}-${i}`} slot={slot} onTap={onSlotTap} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Slot detail sheet ─────────────────────────────────────────────────────────

function SlotDetail({ slot, onClose }) {
  if (!slot) return null
  const p = slot.provider
  const color = p?.color || TEAL
  return (
    <div
      onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:400, display:'flex', alignItems:'flex-end' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width:'100%', background:'white', borderRadius:'20px 20px 0 0', padding:'1.5rem 1.25rem', paddingBottom:'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <div style={{ width:40, height:4, borderRadius:2, background:'#E2E8F0', margin:'0 auto 1.25rem' }} />
        <div style={{ display:'flex', alignItems:'center', gap:'1rem', marginBottom:'1rem' }}>
          <div style={{ width:52, height:52, borderRadius:'50%', background:color, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:700, fontSize:'1.125rem', flexShrink:0 }}>
            {p ? `${p.first_name[0]}${p.last_name[0]}` : '?'}
          </div>
          <div>
            <div style={{ fontWeight:700, color:NAVY, fontSize:'1.0625rem', fontFamily:FF }}>
              {p ? `${p.first_name} ${p.last_name}` : 'Unknown'}
            </div>
            <div style={{ fontSize:'.875rem', color:'#6B7280', fontFamily:FF, marginTop:2 }}>
              {fmtDate(slot.shift_date || slot.date)}
            </div>
          </div>
        </div>

        <div style={{ background:'#F8FAFC', borderRadius:10, padding:'1rem', marginBottom:'1rem' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'.5rem' }}>
            <span style={{ fontFamily:FF, fontSize:'.875rem', color:'#6B7280' }}>Hours</span>
            <span style={{ fontFamily:FF, fontSize:'.875rem', fontWeight:700, color:NAVY }}>{fmtTime(slot.start)} – {fmtTime(slot.end)}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontFamily:FF, fontSize:'.875rem', color:'#6B7280' }}>Type</span>
            <span style={{ fontFamily:FF, fontSize:'.875rem', fontWeight:600, color }}>
              {slot.source === 'oneoff' ? 'One-off shift ★' : 'Recurring'}
            </span>
          </div>
          {slot.notes && (
            <div style={{ marginTop:'.5rem', paddingTop:'.5rem', borderTop:'1px solid #E2E8F0' }}>
              <span style={{ fontFamily:FF, fontSize:'.875rem', color:'#6B7280' }}>Notes: </span>
              <span style={{ fontFamily:FF, fontSize:'.875rem', color:NAVY }}>{slot.notes}</span>
            </div>
          )}
        </div>

        <button onClick={onClose} style={{ width:'100%', background:NAVY, color:'white', border:'none', borderRadius:12, padding:'15px', fontFamily:FF, fontWeight:700, fontSize:'1rem', cursor:'pointer', minHeight:54 }}>
          Close
        </button>
      </div>
    </div>
  )
}

// ── Coverage alerts ───────────────────────────────────────────────────────────

function CoverageAlerts({ schedules, shifts }) {
  const gaps = findGaps(schedules, shifts, 14)
  if (!gaps.length) return (
    <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:12, padding:'1rem', display:'flex', alignItems:'center', gap:'.75rem' }}>
      <span style={{ fontSize:'1.25rem' }}>✅</span>
      <div style={{ fontFamily:FF }}>
        <div style={{ fontWeight:700, color:'#065F46', fontSize:'.9375rem' }}>Full coverage</div>
        <div style={{ fontSize:'.8125rem', color:'#059669' }}>All days covered for the next 14 days</div>
      </div>
    </div>
  )

  return (
    <div style={{ background:'#FEF2F2', border:'1.5px solid #FECACA', borderRadius:12, padding:'1rem' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'.75rem', marginBottom:'.875rem' }}>
        <span style={{ fontSize:'1.25rem' }}>⚠️</span>
        <div style={{ fontFamily:FF }}>
          <div style={{ fontWeight:700, color:'#991B1B', fontSize:'.9375rem' }}>
            {gaps.length} coverage gap{gaps.length > 1 ? 's' : ''} (next 14 days)
          </div>
          <div style={{ fontSize:'.8125rem', color:'#DC2626' }}>No provider scheduled on these dates</div>
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:'.375rem' }}>
        {gaps.map(d => (
          <div key={d} style={{ background:'white', borderRadius:8, padding:'7px 12px', fontFamily:FF, fontSize:'.875rem', color:'#991B1B', fontWeight:600 }}>
            {fmtDate(d)}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminSchedule({ embedded = false }) {
  const navigate = useNavigate()
  const [weekRef, setWeekRef]     = useState(new Date())
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [allData, setAllData]     = useState(null) // for coverage alerts (2-week lookahead)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const weekParam = getNZT(weekRef).date
      const res = await apiFetch(`/api/schedule?type=week&week=${weekParam}`)
      const json = await res.json()
      setData(json)
    } catch {}
    setLoading(false)
  }, [weekRef])

  useEffect(() => { load() }, [load])

  // Load all schedules + upcoming shifts for 14-day gap analysis
  useEffect(() => {
    apiFetch('/api/schedule?type=all')
      .then(r => r.json())
      .then(d => setAllData(d))
      .catch(() => {})
  }, [])

  function prevWeek() {
    const d = new Date(weekRef)
    d.setUTCDate(d.getUTCDate() - 7)
    setWeekRef(d)
  }

  function nextWeek() {
    const d = new Date(weekRef)
    d.setUTCDate(d.getUTCDate() + 7)
    setWeekRef(d)
  }

  function goToday() { setWeekRef(new Date()) }

  const today = getNZT().date

  // Build week label e.g. "19–25 May 2026"
  let weekLabel = ''
  if (data?.weekDates?.length === 7) {
    const first = new Date(data.weekDates[0] + 'T12:00:00Z')
    const last  = new Date(data.weekDates[6] + 'T12:00:00Z')
    const opts = { day:'numeric', month:'short', timeZone:'Pacific/Auckland' }
    const sameMonth = first.getMonth() === last.getMonth()
    weekLabel = sameMonth
      ? `${first.toLocaleDateString('en-NZ',{day:'numeric',timeZone:'Pacific/Auckland'})}–${last.toLocaleDateString('en-NZ',{...opts,year:'numeric'})}`
      : `${first.toLocaleDateString('en-NZ',opts)} – ${last.toLocaleDateString('en-NZ',{...opts,year:'numeric'})}`
  }

  const isCurrentWeek = data?.weekDates?.includes(today)

  const content = (
    <div style={{ padding:'1rem', fontFamily:FF }}>

      {/* Display-only note */}
      <div style={{ background:'#EFF9F9', border:'1px solid #0B6E7640', borderRadius:10, padding:'.75rem 1rem', marginBottom:'1rem', display:'flex', alignItems:'flex-start', gap:'.625rem' }}>
        <span style={{ fontSize:'1rem', flexShrink:0, marginTop:1 }}>ℹ️</span>
        <span style={{ fontFamily:FF, fontSize:'.8125rem', color:TEAL, lineHeight:1.5 }}>
          Provider schedules are for planning purposes only. The clinic is open <strong>8am – 8pm daily</strong> regardless of provider schedules.
        </span>
      </div>

      {/* Week navigator */}
      <div style={{ display:'flex', alignItems:'center', gap:'.5rem', marginBottom:'1rem' }}>
        <button onClick={prevWeek} style={{ background:'white', border:'1.5px solid #E2E8F0', color:NAVY, borderRadius:10, padding:'9px 14px', fontFamily:FF, fontWeight:700, fontSize:'1rem', cursor:'pointer', minHeight:44, flexShrink:0 }}>‹</button>
        <div style={{ flex:1, textAlign:'center' }}>
          <div style={{ fontWeight:700, color:NAVY, fontSize:'.9375rem' }}>{weekLabel || 'Loading…'}</div>
          {isCurrentWeek && <div style={{ fontSize:'.75rem', color:TEAL, fontWeight:600 }}>Current week</div>}
        </div>
        <button onClick={nextWeek} style={{ background:'white', border:'1.5px solid #E2E8F0', color:NAVY, borderRadius:10, padding:'9px 14px', fontFamily:FF, fontWeight:700, fontSize:'1rem', cursor:'pointer', minHeight:44, flexShrink:0 }}>›</button>
      </div>

      {!isCurrentWeek && (
        <button onClick={goToday} style={{ width:'100%', background:'white', border:'1.5px solid #E2E8F0', color:TEAL, borderRadius:10, padding:'10px', fontFamily:FF, fontWeight:600, fontSize:'.875rem', cursor:'pointer', marginBottom:'1rem', minHeight:42 }}>
          ← Back to current week
        </button>
      )}

      {/* Coverage alerts */}
      {allData && (
        <div style={{ marginBottom:'.875rem' }}>
          <CoverageAlerts schedules={allData.schedules} shifts={allData.shifts} />
        </div>
      )}

      {/* 7-day grid */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'3rem' }}><div className="spinner" style={{ borderColor:'rgba(11,110,118,.15)', borderTopColor:TEAL }} /></div>
      ) : !data ? (
        <div style={{ textAlign:'center', padding:'2rem', color:'#9CA3AF', fontSize:'.875rem' }}>Failed to load schedule</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'.625rem' }}>
          {data.weekDates.map((dateStr, i) => {
            const dow = WEEK_ORDER[i] // Mon=1,Tue=2,...,Sun=0
            return (
              <DayCard
                key={dateStr}
                dateStr={dateStr}
                dow={dow}
                schedules={data.schedules}
                shifts={data.shifts}
                providers={data.providers}
                today={today}
                onSlotTap={slot => setSelectedSlot({ ...slot, date: dateStr })}
              />
            )
          })}
        </div>
      )}

      {/* Provider legend */}
      {data?.providers?.length > 0 && (
        <div style={{ marginTop:'1rem', background:'white', borderRadius:12, padding:'1rem', border:'1px solid #E2E8F0' }}>
          <div style={{ fontWeight:700, color:NAVY, fontSize:'.8125rem', marginBottom:'.625rem' }}>Providers</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'.5rem' }}>
            {data.providers.map(p => (
              <div key={p.id} style={{ display:'flex', alignItems:'center', gap:5, background:(p.color||TEAL)+'18', borderRadius:99, padding:'4px 10px 4px 5px' }}>
                <div style={{ width:20, height:20, borderRadius:'50%', background:p.color||TEAL, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:'.625rem', fontWeight:700, flexShrink:0 }}>
                  {p.first_name[0]}{p.last_name[0]}
                </div>
                <span style={{ fontFamily:FF, fontSize:'.75rem', fontWeight:600, color:p.color||TEAL }}>{p.first_name} {p.last_name}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop:'.625rem', fontSize:'.6875rem', color:'#9CA3AF', fontFamily:FF }}>★ = one-off shift override</div>
        </div>
      )}
    </div>
  )

  if (embedded) return (
    <>
      {content}
      <SlotDetail slot={selectedSlot} onClose={() => setSelectedSlot(null)} />
    </>
  )

  return (
    <div style={{ minHeight:'100dvh', background:'#F7F5F0', fontFamily:FF }}>
      <div style={{ background:NAVY, padding:'.875rem 1.25rem', display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:'calc(.875rem + env(safe-area-inset-top, 0px))' }}>
        <button onClick={() => navigate('/admin')} style={{ background:'none', border:'none', color:'rgba(255,255,255,.7)', fontSize:'1.25rem', cursor:'pointer', minWidth:44, minHeight:44, display:'flex', alignItems:'center' }}>‹</button>
        <span style={{ fontFamily:'Cormorant Garamond,Georgia,serif', fontStyle:'italic', color:'#D4EEF0', fontSize:'1.3rem' }}>Schedule</span>
        <div style={{ width:44 }} />
      </div>
      {content}
      <SlotDetail slot={selectedSlot} onClose={() => setSelectedSlot(null)} />
    </div>
  )
}
