import React, { useState, useEffect } from 'react'
import { supabase, saveClinicSchedule } from '../../lib/supabase'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const DEFAULT_SLOTS = DAYS.map(d => ({ day: d, enabled: false, open: '09:00', close: '17:00' }))

export async function getScheduleSlots() {
  const { data } = await supabase.from('schedule').select('*').eq('id',1).single()
  if (!data?.slots || data.slots === '[]' || data.slots === '') return DEFAULT_SLOTS
  try { return JSON.parse(data.slots) } catch { return DEFAULT_SLOTS }
}

export async function saveScheduleSlots(slots) {
  await saveClinicSchedule({ slots: JSON.stringify(slots) })
}

export async function getUseSchedule() {
  const { data } = await supabase.from('availability').select('use_schedule').eq('id',1).single()
  return data?.use_schedule || false
}

export async function setUseSchedule(val) {
  await saveClinicSchedule({ use_schedule: val })
}

export function shouldBeOpen(slots) {
  const now = new Date()
  const dayName = DAYS[now.getDay() === 0 ? 6 : now.getDay() - 1]
  const slot = slots.find(s => s.day === dayName)
  if (!slot?.enabled) return false
  const [oh, om] = slot.open.split(':').map(Number)
  const [ch, cm] = slot.close.split(':').map(Number)
  const nowMins = now.getHours() * 60 + now.getMinutes()
  return nowMins >= oh * 60 + om && nowMins < ch * 60 + cm
}

export default function ScheduleEditor({ onSaved }) {
  const [slots, setSlots] = useState(DEFAULT_SLOTS)
  const [useSchedule, setUseScheduleState] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getScheduleSlots().then(setSlots)
    getUseSchedule().then(setUseScheduleState)
  }, [])

  function toggleDay(i) { setSlots(s => s.map((sl,idx) => idx===i ? {...sl, enabled: !sl.enabled} : sl)) }
  function setTime(i, field, val) { setSlots(s => s.map((sl,idx) => idx===i ? {...sl, [field]: val} : sl)) }

  async function save() {
    setSaving(true)
    await saveScheduleSlots(slots)
    await setUseSchedule(useSchedule)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    if (onSaved) onSaved(slots, useSchedule)
  }

  const inp = { padding: '6px 8px', border: '1px solid #E2E8F0', borderRadius: 6, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.875rem', color: '#1A2A33', outline: 'none', width: 90 }
  const btn = { background: '#0B6E76', color: 'white', border: 'none', padding: '9px 20px', borderRadius: 8, fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 600, fontSize: '.9375rem', cursor: 'pointer' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: useSchedule ? '#F0FDF4' : '#F8FAFC', borderRadius: 8, marginBottom: '1.25rem', border: `1px solid ${useSchedule ? '#BBF7D0' : '#E2E8F0'}` }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '.9375rem', color: useSchedule ? '#065F46' : '#1A2A33' }}>{useSchedule ? '✓ Auto schedule active' : 'Auto schedule disabled'}</div>
          <div style={{ fontSize: '.8125rem', color: '#6B7280', marginTop: 2 }}>{useSchedule ? 'Clinic opens and closes automatically.' : 'Clinic is controlled manually via the toggle above.'}</div>
        </div>
        <div onClick={() => setUseScheduleState(u => !u)} style={{ width: 52, height: 28, borderRadius: 14, cursor: 'pointer', position: 'relative', transition: 'background .2s', background: useSchedule ? '#059669' : '#D1D5DB', flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: 3, left: useSchedule ? 27 : 3, width: 22, height: 22, borderRadius: '50%', background: 'white', transition: 'left .2s' }} />
        </div>
      </div>

      <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden', marginBottom: '1.25rem' }}>
        {slots.map((slot, i) => (
          <div key={slot.day} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '.875rem 1rem', borderBottom: i < 6 ? '1px solid #F3F4F6' : 'none', background: slot.enabled ? 'white' : '#FAFAFA', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minWidth: 120 }}>
              <input type="checkbox" checked={slot.enabled} onChange={() => toggleDay(i)} style={{ width: 16, height: 16, accentColor: '#0B6E76', cursor: 'pointer' }} />
              <span style={{ fontWeight: slot.enabled ? 600 : 400, color: slot.enabled ? '#1A2A33' : '#9CA3AF', fontSize: '.9375rem' }}>{slot.day}</span>
            </label>
            {slot.enabled ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="time" value={slot.open} onChange={e => setTime(i,'open',e.target.value)} style={inp} />
                <span style={{ color: '#6B7280', fontSize: '.875rem' }}>to</span>
                <input type="time" value={slot.close} onChange={e => setTime(i,'close',e.target.value)} style={inp} />
              </div>
            ) : (
              <span style={{ fontSize: '.875rem', color: '#C4C9CF' }}>Closed</span>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button style={btn} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save schedule'}</button>
        {saved && <span style={{ fontSize: '.8125rem', color: '#059669', fontWeight: 600 }}>✓ Saved</span>}
      </div>
      <div style={{ fontSize: '.8125rem', color: '#9CA3AF', marginTop: '.75rem', lineHeight: 1.5 }}>When auto schedule is on, the clinic opens and closes automatically. You can still override manually.</div>
    </div>
  )
}
