// Schedule CRUD — recurring schedules + one-off shifts
import { createClient } from '@supabase/supabase-js'

const TZ = 'Pacific/Auckland'
const DAY_LONG = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

function getNZT(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit', hour12: false,
  })
  const p = {}
  fmt.formatToParts(date).forEach(x => { p[x.type] = x.value })
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    dayOfWeek: DAY_LONG.indexOf(new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday:'long' }).format(date)),
  }
}

function getWeekDates(ref = new Date()) {
  const nzt = getNZT(ref)
  const [y, mo, d] = nzt.date.split('-').map(Number)
  const dow = nzt.dayOfWeek
  const toMon = dow === 0 ? -6 : 1 - dow
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(Date.UTC(y, mo - 1, d + toMon + i))
    return getNZT(dt).date
  })
}

export default async function handler(req, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  // ── GET ─────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { type, providerId, week } = req.query

    // Provider's own schedule: GET ?type=my&providerId=xxx
    if (type === 'my') {
      if (!providerId) return res.status(400).json({ error: 'providerId required' })
      const today = getNZT().date
      const [schRes, shiftRes] = await Promise.all([
        supabase.from('provider_schedules').select('*').eq('provider_id', providerId).order('day_of_week'),
        supabase.from('provider_shifts').select('*').eq('provider_id', providerId).gte('shift_date', today).order('shift_date').limit(50),
      ])
      return res.json({ schedules: schRes.data || [], shifts: shiftRes.data || [] })
    }

    // Admin weekly view: GET ?type=week&week=2026-05-19  (optional, defaults to current week)
    if (type === 'week') {
      const refDate = week ? new Date(week + 'T12:00:00Z') : new Date()
      const weekDates = getWeekDates(refDate)
      const [schRes, shiftRes, provRes] = await Promise.all([
        supabase.from('provider_schedules').select('*').eq('is_active', true),
        supabase.from('provider_shifts').select('*').in('shift_date', weekDates),
        supabase.from('providers').select('id, first_name, last_name, color').eq('is_active', true).eq('is_provider', true),
      ])
      return res.json({
        weekDates,
        schedules: schRes.data || [],
        shifts: shiftRes.data || [],
        providers: provRes.data || [],
      })
    }

    // All schedules + upcoming shifts (for next-available calc)
    if (type === 'all') {
      const today = getNZT().date
      const [schRes, shiftRes] = await Promise.all([
        supabase.from('provider_schedules').select('*').eq('is_active', true),
        supabase.from('provider_shifts').select('*').gte('shift_date', today).order('shift_date').limit(100),
      ])
      return res.json({ schedules: schRes.data || [], shifts: shiftRes.data || [] })
    }

    // Shift offer inbox: GET ?type=offers&providerId=xxx
    if (type === 'offers') {
      if (!providerId) return res.status(400).json({ error: 'providerId required' })
      const { data } = await supabase
        .from('provider_shifts')
        .select('*, providers!provider_id(first_name, last_name, color)')
        .eq('offered_to', providerId)
        .eq('offer_status', 'pending')
        .gte('shift_date', getNZT().date)
      return res.json({ offers: data || [] })
    }

    return res.status(400).json({ error: 'Invalid type' })
  }

  // ── POST ────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { action, ...data } = req.body || {}

    // Upsert recurring schedule for one provider (replaces all their days)
    if (action === 'save-recurring') {
      const { providerId, days } = data
      if (!providerId || !Array.isArray(days)) return res.status(400).json({ error: 'Invalid payload' })

      // Delete existing, then insert new
      await supabase.from('provider_schedules').delete().eq('provider_id', providerId)
      const inserts = days
        .filter(d => d.is_active)
        .map(d => ({
          provider_id: providerId,
          day_of_week: d.day_of_week,
          start_time:  d.start_time,
          end_time:    d.end_time,
          is_active:   true,
        }))
      if (inserts.length) {
        const { error } = await supabase.from('provider_schedules').insert(inserts)
        if (error) return res.status(500).json({ error: error.message })
      }
      return res.json({ ok: true })
    }

    // Add one-off shift
    if (action === 'add-shift') {
      const { providerId, shift_date, start_time, end_time, shift_type, notes } = data
      if (!providerId || !shift_date) return res.status(400).json({ error: 'Invalid payload' })
      const { data: row, error } = await supabase.from('provider_shifts').insert({
        provider_id: providerId,
        shift_date,
        start_time:  start_time || '09:00',
        end_time:    end_time   || '17:00',
        shift_type:  shift_type || 'available',
        notes:       notes || null,
      }).select().single()
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ ok: true, shift: row })
    }

    // Offer shift to another provider
    if (action === 'offer-shift') {
      const { shiftId, offeredTo } = data
      const { error } = await supabase.from('provider_shifts').update({
        is_offered: true, offered_to: offeredTo, offer_status: 'pending',
      }).eq('id', shiftId)
      if (error) return res.status(500).json({ error: error.message })
      // Push notify the recipient
      try {
        const { data: shift } = await supabase.from('provider_shifts').select('*, providers!provider_id(first_name,last_name)').eq('id', shiftId).single()
        if (shift) {
          await fetch(`${process.env.NEXT_PUBLIC_URL || 'https://tere.co.nz'}/api/push-notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-tere-api-key': process.env.TERE_API_KEY || '' },
            body: JSON.stringify({
              type: 'shift_offer',
              providerId: offeredTo,
              fromName: `${shift.providers?.first_name} ${shift.providers?.last_name}`,
              shiftDate: shift.shift_date,
              startTime: shift.start_time,
              endTime: shift.end_time,
            }),
          }).catch(() => {})
        }
      } catch {}
      return res.json({ ok: true })
    }

    // Respond to shift offer (accept/decline)
    if (action === 'respond-offer') {
      const { shiftId, response, responderId } = data
      if (!['accepted','declined'].includes(response)) return res.status(400).json({ error: 'Invalid response' })
      const updates = { offer_status: response }
      if (response === 'accepted') {
        // Transfer shift ownership to responder
        updates.provider_id = responderId
        updates.is_offered = false
        updates.offered_to = null
      }
      const { error } = await supabase.from('provider_shifts').update(updates).eq('id', shiftId)
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ ok: true })
    }

    // Set/clear admin manual override
    if (action === 'set-override') {
      const { override } = data
      await supabase.from('availability').update({ manual_override: !!override }).eq('id', 1)
      return res.json({ ok: true })
    }

    return res.status(400).json({ error: 'Unknown action' })
  }

  // ── DELETE ──────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id, type } = req.query
    if (!id) return res.status(400).json({ error: 'id required' })
    const table = type === 'recurring' ? 'provider_schedules' : 'provider_shifts'
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true })
  }

  res.status(405).json({ error: 'Method not allowed' })
}
