// Anon GET endpoints for the GP booking page.
//   action=list_gps        -> bookable GPs (no PHI, no slot data)
//   action=next_available  -> earliest open slot across all bookable GPs
//   action=by_provider     -> open slots for one GP in a date window
//
// All flag-gated. When gp_scheduled_booking_enabled is off we return 404 so
// the surface isn't advertised at all.

import { createClient } from '@supabase/supabase-js'
import { isFlagEnabled } from './_flags-server.js'

function admin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

export default async function handler(req, res) {
  if (!(await isFlagEnabled('gp_scheduled_booking_enabled', { default: false }))) {
    return res.status(404).json({ error: 'Not found' })
  }

  const action = req.query?.action
  const supabase = admin()

  if (action === 'list_gps') {
    const { data, error } = await supabase
      .from('providers')
      .select('id, display_name, provider_type, photo_url')
      .eq('can_work_gp', true)
      .order('display_name', { ascending: true })
    if (error) return res.status(500).json({ error: 'Server error' })
    return res.status(200).json({ gps: data || [] })
  }

  if (action === 'next_available') {
    const fromIso = req.query?.from
      ? new Date(req.query.from).toISOString()
      : new Date().toISOString()
    const { data, error } = await supabase
      .from('appointments_gp')
      .select('id, provider_id, slot_start, slot_end, providers:provider_id(display_name)')
      .eq('booking_status', 'available')
      .gt('slot_start', fromIso)
      .order('slot_start', { ascending: true })
      .limit(1)
    if (error) return res.status(500).json({ error: 'Server error' })
    const row = (data || [])[0]
    if (!row) return res.status(200).json({ slot: null })
    return res.status(200).json({
      slot: {
        id: row.id,
        provider_id: row.provider_id,
        provider_display_name: row.providers?.display_name || '',
        slot_start: row.slot_start,
        slot_end: row.slot_end,
      },
    })
  }

  if (action === 'by_provider') {
    const providerId = req.query?.provider_id
    const from = req.query?.from
    const to = req.query?.to
    if (!providerId || !from || !to) return res.status(400).json({ error: 'provider_id, from, to required' })
    const { data, error } = await supabase
      .from('appointments_gp')
      .select('id, slot_start, slot_end')
      .eq('provider_id', providerId)
      .eq('booking_status', 'available')
      .gte('slot_start', new Date(from).toISOString())
      .lte('slot_start', new Date(to).toISOString())
      .order('slot_start', { ascending: true })
    if (error) return res.status(500).json({ error: 'Server error' })
    return res.status(200).json({ slots: data || [] })
  }

  return res.status(400).json({ error: 'Unknown action' })
}
