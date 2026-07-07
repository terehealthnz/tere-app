// Appointments CRUD — booking, confirmation, cancellation
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const TZ = 'Pacific/Auckland'
const SLOT_MINUTES = 15

function getNZTDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' })
    .format(d)
}

function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY) }

export default async function handler(req, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  // ── GET ───────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { type, date, provider_id, status, limit: lim } = req.query

    // Available slots for a given date
    if (type === 'slots') {
      if (!date) return res.status(400).json({ error: 'Missing date' })

      // Get providers on duty that day (from schedules)
      const dayOfWeek = new Date(date + 'T12:00:00Z').getDay()
      const { data: schedules } = await supabase.from('provider_schedules')
        .select('provider_id, start_time, end_time')
        .eq('day_of_week', dayOfWeek).eq('is_active', true)

      const { data: shifts } = await supabase.from('provider_shifts')
        .select('provider_id, start_time, end_time, is_override')
        .eq('shift_date', date)

      // Get existing appointments on this date
      const { data: existing } = await supabase.from('appointments')
        .select('provider_id, slot_start, slot_end')
        .gte('slot_start', date + 'T00:00:00Z')
        .lte('slot_start', date + 'T23:59:59Z')
        .not('status', 'eq', 'cancelled')

      const bookedSlots = new Set((existing || []).map(a => a.slot_start))

      // Build slots
      const slots = []
      const processedProviders = new Set()

      // Shifts override schedules
      for (const shift of shifts || []) {
        processedProviders.add(shift.provider_id)
        if (!shift.start_time || !shift.end_time) continue
        generateSlots(date, shift.start_time, shift.end_time, shift.provider_id, bookedSlots, slots)
      }
      for (const sched of schedules || []) {
        if (processedProviders.has(sched.provider_id)) continue
        generateSlots(date, sched.start_time, sched.end_time, sched.provider_id, bookedSlots, slots)
      }

      // Get provider names
      const providerIds = [...new Set(slots.map(s => s.provider_id))]
      const { data: providers } = providerIds.length
        ? await supabase.from('providers').select('id,first_name,last_name,color').in('id', providerIds)
        : { data: [] }
      const provMap = {}
      for (const p of providers || []) provMap[p.id] = p

      return res.status(200).json({
        slots: slots.map(s => ({ ...s, provider: provMap[s.provider_id] }))
      })
    }

    // List appointments (admin view)
    if (type === 'list') {
      let q = supabase.from('appointments').select('*, providers(first_name,last_name,color)')
        .order('slot_start', { ascending: true })
      if (date) {
        q = q.gte('slot_start', date + 'T00:00:00Z').lte('slot_start', date + 'T23:59:59Z')
      } else {
        // Default: next 7 days
        const now = new Date().toISOString()
        const next7 = new Date(Date.now() + 7 * 86400000).toISOString()
        q = q.gte('slot_start', now).lte('slot_start', next7)
      }
      if (status) q = q.eq('status', status)
      if (provider_id) q = q.eq('provider_id', provider_id)
      q = q.limit(parseInt(lim) || 50)
      const { data, error } = await q
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ appointments: data || [] })
    }

    // Upcoming for a provider
    if (type === 'provider') {
      if (!provider_id) return res.status(400).json({ error: 'Missing provider_id' })
      const now = new Date().toISOString()
      const { data } = await supabase.from('appointments')
        .select('*').eq('provider_id', provider_id)
        .gte('slot_start', now).in('status', ['pending','confirmed'])
        .order('slot_start').limit(10)
      return res.status(200).json({ appointments: data || [] })
    }

    // Upcoming (legacy schema: appointment_date + slot_time). Admin panel.
    if (type === 'upcoming') {
      const today = new Date().toISOString().slice(0, 10)
      const { data } = await supabase.from('appointments')
        .select('*')
        .gte('appointment_date', today)
        .in('status', ['pending', 'confirmed'])
        .order('appointment_date').order('slot_time')
        .limit(50)
      return res.status(200).json({ appointments: data || [] })
    }

    // Today (legacy schema). Provider-scoped when provider_id present.
    if (type === 'today') {
      const today = new Date().toISOString().slice(0, 10)
      let q = supabase.from('appointments').select('*')
        .eq('appointment_date', today)
        .in('status', ['pending', 'confirmed'])
        .order('slot_time').limit(10)
      if (provider_id) q = q.eq('provider_id', provider_id)
      const { data } = await q
      return res.status(200).json({ appointments: data || [] })
    }

    // Reservation count in the last N days (analytics panel).
    // ?type=reservation_count&since=<iso>
    if (type === 'reservation_count') {
      const { since } = req.query
      const sinceIso = since || new Date(Date.now() - 30 * 86400000).toISOString()
      const { count } = await supabase.from('appointments')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', sinceIso)
        .not('reservation_payment_intent_id', 'is', null)
      return res.status(200).json({ count: count || 0 })
    }

    return res.status(400).json({ error: 'Invalid type' })
  }

  // ── POST ──────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { action } = req.body

    // Create $15 reservation fee payment intent (immediate capture)
    if (action === 'create_reservation_intent') {
      try {
        const paymentIntent = await getStripe().paymentIntents.create({
          amount: 1500,
          currency: 'nzd',
          description: 'Tere Health — appointment reservation fee',
        })
        return res.status(200).json({ clientSecret: paymentIntent.client_secret })
      } catch (e) {
        return res.status(500).json({ error: e.message })
      }
    }

    // Book an appointment (patient-initiated)
    if (action === 'book') {
      const { patient_first_name, patient_last_name, patient_email, patient_phone,
              patient_dob, patient_nhi, provider_id, slot_start, slot_end, reason,
              reservation_payment_intent_id } = req.body
      if (!patient_first_name || !slot_start || !slot_end) {
        return res.status(400).json({ error: 'Missing required fields' })
      }

      // Check slot is still available
      const { count } = await supabase.from('appointments')
        .select('*', { count:'exact', head:true })
        .eq('slot_start', slot_start)
        .eq('provider_id', provider_id)
        .not('status', 'eq', 'cancelled')
      if (count > 0) return res.status(409).json({ error: 'Slot already booked' })

      const { data, error } = await supabase.from('appointments').insert({
        patient_first_name, patient_last_name, patient_email, patient_phone,
        patient_dob, patient_nhi, provider_id, slot_start, slot_end,
        reason, status: 'pending',
      }).select().single()
      if (error) return res.status(500).json({ error: error.message })

      // Save reservation payment intent ID (requires migration: see supabase/reservation-fee-migration.sql)
      if (data?.id && reservation_payment_intent_id) {
        supabase.from('appointments')
          .update({ reservation_payment_intent_id })
          .eq('id', data.id)
          .then(() => {}).catch(() => {})
      }

      const slotStr = new Date(slot_start).toLocaleString('en-NZ', { timeZone: TZ, weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
      const cancelDeadline = new Date(new Date(slot_start).getTime() - 24*60*60*1000)
        .toLocaleString('en-NZ', { timeZone: TZ, weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })

      // Confirmation SMS to patient
      if (patient_phone) {
        try {
          await fetch(`${process.env.VITE_APP_URL || 'https://tere.co.nz'}/api/sms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-tere-api-key': process.env.TERE_API_KEY || '' },
            body: JSON.stringify({
              to: patient_phone, type: 'appointment_booked',
              message: `Your Tere Health appointment is confirmed for ${slotStr}. Your $15 reservation fee has been charged. Full consultation fee charged on the day. Free cancellation until ${cancelDeadline}.`
            })
          })
        } catch {}
      }

      // Confirmation email to patient
      if (patient_email && process.env.RESEND_API_KEY) {
        let providerName = 'your provider'
        if (provider_id) {
          const { data: prov } = await supabase.from('providers').select('first_name,last_name').eq('id', provider_id).single()
          if (prov) providerName = `Dr ${prov.first_name} ${prov.last_name}`
        }
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
          body: JSON.stringify({
            from: 'Tere Health <hello@terehealth.co.nz>',
            replyTo: 'terehealthnz@gmail.com',
            to: patient_email,
            subject: `Appointment confirmed — ${slotStr}`,
            html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1A2A33">
<p>Kia ora ${patient_first_name},</p>
<p>Your appointment with <strong>${providerName}</strong> on <strong>${slotStr}</strong> is confirmed. Your <strong>$15 reservation fee</strong> has been charged.</p>
<p>On the day of your appointment, your full consultation fee will be charged separately ($65 video / $45 phone).</p>
<p>Free cancellation until <strong>${cancelDeadline}</strong>. To cancel, please call us.</p>
<p style="margin-top:1.5rem">Ngā mihi,<br><strong>Tere Health</strong></p>
</div>`,
          })
        }).catch(() => {})
      }

      // Notify admin via push (best-effort)
      try {
        await fetch(`${process.env.VITE_APP_URL || 'https://tere.co.nz'}/api/push-notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-tere-api-key': process.env.TERE_API_KEY || '' },
          body: JSON.stringify({ type: 'new_appointment', title: 'New appointment booked', body: `${patient_first_name} ${patient_last_name}` })
        })
      } catch {}

      return res.status(200).json({ ok: true, appointment: data })
    }

    // Confirm / cancel / complete / no-show
    if (['confirm','cancel','complete','no_show'].includes(action)) {
      const { appointment_id } = req.body
      if (!appointment_id) return res.status(400).json({ error: 'Missing appointment_id' })
      const statusMap = { confirm:'confirmed', cancel:'cancelled', complete:'completed', no_show:'no_show' }
      const { error } = await supabase.from('appointments')
        .update({ status: statusMap[action] }).eq('id', appointment_id)
      if (error) return res.status(500).json({ error: error.message })

      // SMS patient on confirmation
      if (action === 'confirm') {
        const { data: appt } = await supabase.from('appointments').select('*').eq('id', appointment_id).single()
        if (appt?.patient_phone) {
          const slotStr = new Date(appt.slot_start).toLocaleString('en-NZ', { timeZone: TZ, weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
          try {
            await fetch(`${process.env.VITE_APP_URL || 'https://tere.co.nz'}/api/sms`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-tere-api-key': process.env.TERE_API_KEY || '' },
              body: JSON.stringify({ to: appt.patient_phone, type: 'appointment_confirmed',
                message: `Your Tere Health appointment on ${slotStr} is confirmed. Visit terehealth.co.nz when it's time.` })
            })
          } catch {}
        }
      }
      return res.status(200).json({ ok: true })
    }

    // Prescription template CRUD
    if (action === 'save_template') {
      const { provider_id, name, drug, dose, directions, quantity, repeats } = req.body
      const { data, error } = await supabase.from('prescription_templates')
        .insert({ provider_id, name, drug, dose, directions, quantity, repeats }).select().single()
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true, template: data })
    }

    if (action === 'delete_template') {
      const { template_id } = req.body
      const { error } = await supabase.from('prescription_templates').delete().eq('id', template_id)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    if (action === 'get_templates') {
      const { provider_id } = req.body
      const { data } = await supabase.from('prescription_templates')
        .select('*').eq('provider_id', provider_id).order('name')
      return res.status(200).json({ templates: data || [] })
    }

    return res.status(400).json({ error: 'Invalid action' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

function generateSlots(date, startTime, endTime, providerId, bookedSlots, slots) {
  if (!startTime || !endTime) return
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  const startMin = sh * 60 + sm
  const endMin   = eh * 60 + em
  for (let m = startMin; m + SLOT_MINUTES <= endMin; m += SLOT_MINUTES) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0')
    const mm = String(m % 60).padStart(2, '0')
    const eh2 = String(Math.floor((m + SLOT_MINUTES) / 60)).padStart(2, '0')
    const em2 = String((m + SLOT_MINUTES) % 60).padStart(2, '0')
    const slot_start = `${date}T${hh}:${mm}:00+12:00`
    const slot_end   = `${date}T${eh2}:${em2}:00+12:00`
    if (!bookedSlots.has(slot_start)) {
      slots.push({ provider_id: providerId, slot_start, slot_end, time: `${hh}:${mm}` })
    }
  }
}
