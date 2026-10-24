// Admin surface for GP scheduling config. All actions require an admin
// provider. Toggles per-provider queue participation and generates slot
// rows for the appointments_gp table.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

function requireAdmin(auth) {
  const p = auth.provider
  return !!(p && (p.is_admin || p.is_supervisor))
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return
  if (!requireAdmin(auth)) return res.status(403).json({ error: 'Admin only' })

  const supabase = admin()
  const action = req.method === 'GET' ? req.query?.action : (req.body?.action)

  if (req.method === 'GET' && action === 'list') {
    const [providers, funders, slotCounts] = await Promise.all([
      supabase.from('providers').select('id, display_name, provider_type, can_work_acute, can_work_gp').order('display_name', { ascending: true }),
      supabase.from('funders').select('id, name, funding_source, active, created_at').order('created_at', { ascending: false }),
      supabase.from('appointments_gp').select('provider_id, booking_status'),
    ])
    const slotTotals = {}
    for (const r of (slotCounts.data || [])) {
      const key = r.provider_id
      if (!slotTotals[key]) slotTotals[key] = { available: 0, confirmed: 0, cancelled: 0 }
      if (r.booking_status === 'available') slotTotals[key].available++
      else if (r.booking_status === 'confirmed' || r.booking_status === 'held') slotTotals[key].confirmed++
      else if (r.booking_status === 'cancelled' || r.booking_status === 'no_show') slotTotals[key].cancelled++
    }
    return res.status(200).json({
      providers: providers.data || [],
      funders: funders.data || [],
      slot_totals: slotTotals,
    })
  }

  if (req.method === 'POST' && action === 'toggle_queue') {
    const { provider_id, can_work_acute, can_work_gp } = req.body || {}
    if (!provider_id) return res.status(400).json({ error: 'provider_id required' })
    const patch = {}
    if (typeof can_work_acute === 'boolean') patch.can_work_acute = can_work_acute
    if (typeof can_work_gp === 'boolean') patch.can_work_gp = can_work_gp
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' })
    const { error } = await supabase.from('providers').update(patch).eq('id', provider_id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'POST' && action === 'generate_slots') {
    const { provider_id, from_date, to_date, days_of_week, start_time, end_time, duration_minutes } = req.body || {}
    if (!provider_id || !from_date || !to_date || !start_time || !end_time || !duration_minutes) {
      return res.status(400).json({ error: 'provider_id, from_date, to_date, start_time, end_time, duration_minutes required' })
    }
    const dow = Array.isArray(days_of_week) ? days_of_week.map(Number) : [1,2,3,4,5]
    const dur = Number(duration_minutes)
    const rows = []
    const from = new Date(`${from_date}T00:00:00+13:00`)
    const to = new Date(`${to_date}T23:59:59+13:00`)
    const [startH, startM] = String(start_time).split(':').map(Number)
    const [endH, endM] = String(end_time).split(':').map(Number)
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      if (!dow.includes(d.getDay())) continue
      const base = new Date(d)
      base.setHours(startH, startM, 0, 0)
      const dayEnd = new Date(d)
      dayEnd.setHours(endH, endM, 0, 0)
      for (let t = new Date(base); t.getTime() + dur * 60000 <= dayEnd.getTime(); t = new Date(t.getTime() + dur * 60000)) {
        const slotEnd = new Date(t.getTime() + dur * 60000)
        rows.push({ provider_id, slot_start: t.toISOString(), slot_end: slotEnd.toISOString(), booking_status: 'available', created_via: 'admin_manual' })
      }
    }
    if (!rows.length) return res.status(200).json({ ok: true, inserted: 0 })
    const { error, count } = await supabase.from('appointments_gp').upsert(rows, { onConflict: 'provider_id,slot_start', ignoreDuplicates: true, count: 'exact' })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true, inserted: count ?? rows.length })
  }

  if (req.method === 'POST' && action === 'cancel_slot') {
    const { appointment_id, reason } = req.body || {}
    if (!appointment_id) return res.status(400).json({ error: 'appointment_id required' })
    const { data: existing } = await supabase.from('appointments_gp').select('consultation_id, booking_status').eq('id', appointment_id).maybeSingle()
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.consultation_id) return res.status(409).json({ error: 'Slot has an attached consultation. Cancel the consultation first.' })
    const { error } = await supabase.from('appointments_gp').update({ booking_status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_reason: reason || null }).eq('id', appointment_id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'POST' && action === 'add_funder') {
    const { name, funding_source } = req.body || {}
    if (!name || !funding_source) return res.status(400).json({ error: 'name and funding_source required' })
    const { data, error } = await supabase.from('funders').insert({ name: String(name).trim(), funding_source }).select('*').single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true, funder: data })
  }

  return res.status(400).json({ error: 'Unknown action' })
}
