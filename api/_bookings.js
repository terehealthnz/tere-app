// Bookings API — scheduled appointments with reservation fee
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const TZ = 'Pacific/Auckland'
const SLOT_MIN = 20
const BUFFER_MIN = 20
const WALK_IN_RATIO = 0.30
const APP_URL = process.env.VITE_APP_URL || 'https://tere.co.nz'
const RESEND_KEY = process.env.RESEND_API_KEY
const FROM = 'Tere Health <hello@terehealth.co.nz>'

function getNZDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' }).format(d)
}

function nzDisplay(dateStr, timeStr, opts = {}) {
  const d = new Date(`${dateStr}T${timeStr}:00+12:00`)
  const defaults = { timeZone: TZ, weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }
  return d.toLocaleString('en-NZ', { ...defaults, ...opts })
}

function generateSlots(startTime, endTime, providerId, providerName) {
  if (!startTime || !endTime) return []
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  const startMin = sh * 60 + sm
  const endMin   = eh * 60 + em
  const effectiveEnd = endMin - BUFFER_MIN
  const all = []
  for (let m = startMin; m + SLOT_MIN <= effectiveEnd; m += SLOT_MIN) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0')
    const mm = String(m % 60).padStart(2, '0')
    all.push({ time: `${hh}:${mm}`, providerId, providerName })
  }
  return all.slice(0, Math.floor(all.length * (1 - WALK_IN_RATIO)))
}

async function getSlotsForDate(supabase, dateStr) {
  const dow = new Date(dateStr + 'T12:00:00Z').getDay()
  const today = getNZDate()
  if (dateStr <= today) return []

  const [sr, fr, br] = await Promise.allSettled([
    supabase.from('provider_schedules').select('provider_id,start_time,end_time').eq('day_of_week', dow).eq('is_active', true),
    supabase.from('provider_shifts').select('provider_id,start_time,end_time').eq('shift_date', dateStr),
    supabase.from('bookings').select('appointment_time,provider_id').eq('appointment_date', dateStr).not('status','eq','cancelled'),
  ])

  const schedules = sr.value?.data || []
  const shifts    = fr.value?.data || []
  const booked    = new Set((br.value?.data || []).map(b => `${b.provider_id}:${b.appointment_time}`))

  const pids = [...new Set([...schedules.map(s => s.provider_id), ...shifts.map(s => s.provider_id)])]
  const provMap = {}
  if (pids.length) {
    const { data: provs } = await supabase.from('providers').select('id,first_name,last_name').in('id', pids)
    for (const p of provs || []) provMap[p.id] = `${p.first_name} ${p.last_name}`
  }

  const slots = []
  const done  = new Set()
  for (const s of shifts) {
    done.add(s.provider_id)
    if (!s.start_time || !s.end_time) continue
    for (const sl of generateSlots(s.start_time, s.end_time, s.provider_id, provMap[s.provider_id] || 'Provider')) {
      if (!booked.has(`${sl.providerId}:${sl.time}`)) slots.push(sl)
    }
  }
  for (const s of schedules) {
    if (done.has(s.provider_id)) continue
    for (const sl of generateSlots(s.start_time, s.end_time, s.provider_id, provMap[s.provider_id] || 'Provider')) {
      if (!booked.has(`${sl.providerId}:${sl.time}`)) slots.push(sl)
    }
  }
  slots.sort((a, b) => a.time.localeCompare(b.time))
  return slots
}

async function sendEmail(to, subject, html) {
  if (!RESEND_KEY || !to) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', Authorization:`Bearer ${RESEND_KEY}` },
    body: JSON.stringify({ from: FROM, replyTo: 'terehealthnz@gmail.com', to, subject, html }),
  }).catch(() => {})
}

async function sendSMS(to, message) {
  if (!to) return
  fetch(`${APP_URL}/api/sms`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'x-tere-api-key': process.env.TERE_API_KEY || '' },
    body: JSON.stringify({ to, message, type: 'booking' }),
  }).catch(() => {})
}

function bookingEmailHtml(b, body) {
  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1A2A33">
<p style="font-size:1.5rem;font-family:Georgia,serif;font-style:italic;color:#0D2B45">Tere Health</p>
${body}
<p style="margin-top:1.5rem;color:#6B7280;font-size:.875rem">Ngā mihi,<br><strong>Tere Health</strong><br><a href="https://tere.co.nz" style="color:#0B6E76">tere.co.nz</a></p>
</div>`
}

async function refundBooking(booking) {
  if (!booking.reservation_fee_payment_intent_id || booking.reservation_fee_refunded) return false
  try {
    await stripe.refunds.create({ payment_intent: booking.reservation_fee_payment_intent_id })
    return true
  } catch { return false }
}

export default async function handler(req, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  // ── GET ───────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { action, date, id, provider_id, status, limit: lim } = req.query

    // Calendar: slot counts for next 14 days
    if (action === 'calendar') {
      const today = getNZDate()
      const dates = {}
      for (let i = 1; i <= 14; i++) {
        const d = new Date(Date.now() + i * 86400000)
        const dateStr = getNZDate(d)
        const slots = await getSlotsForDate(supabase, dateStr)
        dates[dateStr] = slots.length
      }
      return res.status(200).json({ dates })
    }

    // Slots for a specific date
    if (action === 'slots') {
      if (!date) return res.status(400).json({ error: 'Missing date' })
      const slots = await getSlotsForDate(supabase, date)
      return res.status(200).json({ slots })
    }

    // Booking detail
    if (action === 'detail') {
      if (!id) return res.status(400).json({ error: 'Missing id' })
      const { data, error } = await supabase.from('bookings').select('*').eq('id', id).single()
      if (error || !data) return res.status(404).json({ error: 'Not found' })
      return res.status(200).json({ booking: data })
    }

    // Admin/provider list
    if (action === 'list') {
      let q = supabase.from('bookings').select('*').order('appointment_datetime', { ascending: true })
      if (date) {
        const end = new Date(date); end.setDate(end.getDate() + 7)
        q = q.gte('appointment_date', date).lt('appointment_date', getNZDate(end))
      } else {
        q = q.gte('appointment_date', getNZDate())
      }
      if (status) q = q.eq('status', status)
      if (provider_id) q = q.eq('provider_id', provider_id)
      q = q.limit(parseInt(lim) || 100)
      const { data, error } = await q
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ bookings: data || [] })
    }

    // Next 3 public available slots (landing page)
    if (action === 'upcoming') {
      const results = []
      for (let i = 1; i <= 14 && results.length < 3; i++) {
        const dateStr = getNZDate(new Date(Date.now() + i * 86400000))
        const slots = await getSlotsForDate(supabase, dateStr)
        for (const sl of slots) {
          if (results.length >= 3) break
          results.push({ date: dateStr, ...sl })
        }
      }
      return res.status(200).json({ slots: results })
    }

    return res.status(400).json({ error: 'Invalid action' })
  }

  // ── POST ──────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { action } = req.body

    // Create $15 reservation payment intent
    if (action === 'create_reservation_intent') {
      try {
        const pi = await stripe.paymentIntents.create({
          amount: 1500, currency: 'nzd',
          description: 'Tere Health — appointment reservation fee',
        })
        return res.status(200).json({ clientSecret: pi.client_secret })
      } catch (e) { return res.status(500).json({ error: e.message }) }
    }

    // Create booking (after Stripe payment confirmed)
    if (action === 'create') {
      const { patient_name, patient_dob, patient_phone, patient_email, patient_returning,
              provider_id, provider_name, appointment_date, appointment_time,
              consultation_type, reason, reservation_fee_payment_intent_id } = req.body

      if (!patient_name || !patient_phone || !appointment_date || !appointment_time) {
        return res.status(400).json({ error: 'Missing required fields' })
      }

      // Verify Stripe payment succeeded
      if (reservation_fee_payment_intent_id) {
        try {
          const pi = await stripe.paymentIntents.retrieve(reservation_fee_payment_intent_id)
          if (pi.status !== 'succeeded') return res.status(402).json({ error: 'Payment not completed' })
        } catch (e) { return res.status(402).json({ error: 'Could not verify payment' }) }
      }

      // Check slot still available
      const { count } = await supabase.from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('appointment_date', appointment_date)
        .eq('appointment_time', appointment_time)
        .eq('provider_id', provider_id)
        .not('status', 'eq', 'cancelled')
      if (count > 0) return res.status(409).json({ error: 'Slot no longer available — please choose another time' })

      // Build datetime (NZ local, assume UTC+13 for NZDT which covers most of calendar year)
      const appointment_datetime = new Date(`${appointment_date}T${appointment_time}:00+13:00`).toISOString()

      const { data, error } = await supabase.from('bookings').insert({
        patient_name, patient_dob: patient_dob || null, patient_phone, patient_email: patient_email || null,
        patient_returning: !!patient_returning, provider_id: provider_id || null, provider_name: provider_name || null,
        appointment_date, appointment_time, appointment_datetime, consultation_type: consultation_type || 'video',
        reason: reason || null, reservation_fee_payment_intent_id: reservation_fee_payment_intent_id || null,
        reservation_fee_paid: !!reservation_fee_payment_intent_id, status: 'confirmed',
      }).select().single()
      if (error) return res.status(500).json({ error: error.message })

      const displayDate = nzDisplay(appointment_date, appointment_time)
      const cancelDeadline = new Date(new Date(`${appointment_date}T${appointment_time}:00+13:00`).getTime() - 24*60*60*1000)
        .toLocaleString('en-NZ', { timeZone: TZ, weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })

      // Confirmation email
      if (patient_email) {
        await sendEmail(patient_email, `Appointment confirmed — ${displayDate}`,
          bookingEmailHtml(data, `<p>Kia ora ${patient_name.split(' ')[0]},</p>
<p>Your <strong>${consultation_type === 'video' ? 'video' : 'phone'} appointment</strong> with <strong>${provider_name || 'your provider'}</strong> on <strong>${displayDate}</strong> is confirmed. Your <strong>$15 reservation fee</strong> has been charged.</p>
<p>Your full consultation fee (<strong>${consultation_type === 'video' ? '$65' : '$45'}</strong>) will be charged separately on the day. Join your appointment at: <a href="${APP_URL}/booking/join/${data.id}" style="color:#0B6E76">${APP_URL}/booking/join/${data.id}</a></p>
<p><strong>Free cancellation until ${cancelDeadline}.</strong> After that, the $15 reservation fee is non-refundable.<br>To cancel: <a href="${APP_URL}/booking/cancel/${data.id}" style="color:#0B6E76">tere.co.nz/booking/cancel/${data.id}</a></p>`))
      }

      // SMS confirmation
      sendSMS(patient_phone, `Appointment confirmed: ${consultation_type === 'video' ? 'Video' : 'Phone'} on ${displayDate}. Join at ${APP_URL}/booking/join/${data.id}`)

      // Notify admin
      fetch(`${APP_URL}/api/push-notify`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'x-tere-api-key': process.env.TERE_API_KEY || '' },
        body: JSON.stringify({ type:'new_booking', title:'New appointment booked', body:`${patient_name} — ${displayDate}` }),
      }).catch(() => {})

      return res.status(200).json({ ok: true, booking: data })
    }

    // Cancel booking
    if (action === 'cancel') {
      const { id, reason: cancelReason, cancelled_by = 'patient' } = req.body
      if (!id) return res.status(400).json({ error: 'Missing id' })

      const { data: booking } = await supabase.from('bookings').select('*').eq('id', id).single()
      if (!booking) return res.status(404).json({ error: 'Booking not found' })
      if (booking.status === 'cancelled') return res.status(409).json({ error: 'Already cancelled' })

      const apptTime = new Date(`${booking.appointment_date}T${booking.appointment_time}:00+13:00`)
      const hoursUntil = (apptTime - Date.now()) / 3600000
      const shouldRefund = cancelled_by !== 'patient' || hoursUntil > 24

      let refunded = false
      if (shouldRefund) refunded = await refundBooking(booking)

      await supabase.from('bookings').update({
        status: 'cancelled', cancellation_reason: cancelReason || null,
        cancelled_at: new Date().toISOString(), cancelled_by,
        reservation_fee_refunded: refunded,
      }).eq('id', id)

      // Email patient
      if (booking.patient_email) {
        const displayDate = nzDisplay(booking.appointment_date, booking.appointment_time)
        await sendEmail(booking.patient_email, 'Your Tere Health appointment has been cancelled',
          bookingEmailHtml(booking, `<p>Kia ora ${booking.patient_name.split(' ')[0]},</p>
<p>Your appointment on <strong>${displayDate}</strong> has been cancelled.</p>
${refunded ? '<p>Your <strong>$15 reservation fee has been refunded</strong> and should appear on your card within 5–10 business days.</p>' : '<p>As this was cancelled within 24 hours, the <strong>$15 reservation fee is non-refundable</strong>.</p>'}
<p>To book a new appointment: <a href="${APP_URL}/book" style="color:#0B6E76">${APP_URL}/book</a></p>`))
      }

      // SMS cancellation notice
      sendSMS(booking.patient_phone, `Your Tere Health appointment on ${nzDisplay(booking.appointment_date, booking.appointment_time)} has been cancelled.${refunded ? ' Your $15 reservation fee has been refunded.' : ''}`)

      return res.status(200).json({ ok: true, refunded })
    }

    // Reschedule booking
    if (action === 'reschedule') {
      const { id, new_date, new_time, provider_id } = req.body
      if (!id || !new_date || !new_time) return res.status(400).json({ error: 'Missing fields' })

      const { data: original } = await supabase.from('bookings').select('*').eq('id', id).single()
      if (!original) return res.status(404).json({ error: 'Booking not found' })

      // Check new slot available
      const { count } = await supabase.from('bookings')
        .select('*', { count:'exact', head:true })
        .eq('appointment_date', new_date).eq('appointment_time', new_time)
        .eq('provider_id', provider_id || original.provider_id)
        .not('status', 'eq', 'cancelled')
      if (count > 0) return res.status(409).json({ error: 'Slot not available' })

      // Cancel original, create new booking
      await supabase.from('bookings').update({ status:'cancelled', cancellation_reason:'rescheduled', cancelled_at:new Date().toISOString(), cancelled_by:'patient' }).eq('id', id)

      const new_datetime = new Date(`${new_date}T${new_time}:00+13:00`).toISOString()
      const { data: newBooking, error } = await supabase.from('bookings').insert({
        ...original, id: undefined, status:'confirmed',
        appointment_date: new_date, appointment_time: new_time,
        appointment_datetime: new_datetime,
        provider_id: provider_id || original.provider_id,
        cancellation_reason: null, cancelled_at: null, cancelled_by: null,
        provider_change_notified_at: null, patient_response: null,
        reminder_24h_sent: false, reminder_1h_sent: false,
        reschedule_of: id, created_at: new Date().toISOString(),
      }).select().single()
      if (error) return res.status(500).json({ error: error.message })

      if (original.patient_email) {
        const displayDate = nzDisplay(new_date, new_time)
        await sendEmail(original.patient_email, `Appointment rescheduled — ${displayDate}`,
          bookingEmailHtml(original, `<p>Kia ora ${original.patient_name.split(' ')[0]},</p>
<p>Your appointment has been rescheduled to <strong>${displayDate}</strong>. No additional fee — your $15 reservation fee transfers to the new slot.</p>
<p>Join your appointment: <a href="${APP_URL}/booking/join/${newBooking.id}" style="color:#0B6E76">${APP_URL}/booking/join/${newBooking.id}</a></p>`))
      }

      return res.status(200).json({ ok: true, booking: newBooking })
    }

    // Notify patients of a schedule change for a provider
    if (action === 'notify_schedule_change') {
      const { provider_id, affected_dates } = req.body
      if (!provider_id || !affected_dates?.length) return res.status(400).json({ error: 'Missing fields' })

      const { data: affected } = await supabase.from('bookings')
        .select('*').eq('provider_id', provider_id).in('appointment_date', affected_dates)
        .eq('status', 'confirmed').is('provider_change_notified_at', null)

      let notified = 0
      for (const b of affected || []) {
        if (!b.patient_email) continue
        const displayDate = nzDisplay(b.appointment_date, b.appointment_time)
        await sendEmail(b.patient_email, 'Your Tere Health appointment has changed',
          bookingEmailHtml(b, `<p>Kia ora ${b.patient_name.split(' ')[0]},</p>
<p>Your appointment on <strong>${displayDate}</strong> has been affected by a provider schedule change. Please choose one of the following options:</p>
<p><a href="${APP_URL}/booking/change/${b.id}" style="display:inline-block;background:#0B6E76;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;margin-right:8px;font-weight:700">Reschedule →</a>
<a href="${APP_URL}/booking/cancel/${b.id}?reason=schedule_change" style="display:inline-block;background:white;border:2px solid #0B6E76;color:#0B6E76;padding:9px 20px;border-radius:8px;text-decoration:none;font-weight:700">Request refund</a></p>
<p style="color:#6B7280;font-size:.875rem">Please respond within 48 hours. If we don't hear from you, your $15 reservation fee will be automatically refunded.</p>`))

        await supabase.from('bookings').update({ provider_change_notified_at: new Date().toISOString() }).eq('id', b.id)
        notified++
      }

      return res.status(200).json({ ok: true, notified })
    }

    // Mark booking complete/no-show (provider action)
    if (action === 'mark_complete' || action === 'mark_no_show') {
      const { id } = req.body
      if (!id) return res.status(400).json({ error: 'Missing id' })
      const { error } = await supabase.from('bookings')
        .update({ status: action === 'mark_complete' ? 'completed' : 'no_show' }).eq('id', id)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    // Cron: send reminder emails (24h and 1h)
    if (action === 'send_reminders') {
      const now = new Date()
      const in24h = new Date(now.getTime() + 24*60*60*1000)
      const in25h = new Date(now.getTime() + 25*60*60*1000)
      const in60m = new Date(now.getTime() + 60*60*1000)
      const in65m = new Date(now.getTime() + 65*60*1000)

      const [r24, r1h] = await Promise.allSettled([
        supabase.from('bookings').select('*')
          .eq('status', 'confirmed').eq('reminder_24h_sent', false)
          .gte('appointment_datetime', in24h.toISOString())
          .lte('appointment_datetime', in25h.toISOString()),
        supabase.from('bookings').select('*')
          .eq('status', 'confirmed').eq('reminder_1h_sent', false)
          .gte('appointment_datetime', in60m.toISOString())
          .lte('appointment_datetime', in65m.toISOString()),
      ])

      let sent24h = 0, sent1h = 0
      for (const b of r24.value?.data || []) {
        if (!b.patient_email) continue
        const displayDate = nzDisplay(b.appointment_date, b.appointment_time)
        await sendEmail(b.patient_email, `Reminder: your appointment is tomorrow at ${b.appointment_time}`,
          bookingEmailHtml(b, `<p>Kia ora ${b.patient_name.split(' ')[0]},</p>
<p>Just a reminder — your <strong>${b.consultation_type === 'video' ? 'video' : 'phone'} appointment</strong> with ${b.provider_name || 'your provider'} is <strong>tomorrow at ${b.appointment_time}</strong>.</p>
<p>Your full consultation fee (${ b.consultation_type === 'video' ? '$65' : '$45'}) will be charged when you join.</p>
<p><a href="${APP_URL}/booking/join/${b.id}" style="display:inline-block;background:#0B6E76;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Join appointment →</a></p>
<p>Need to cancel? <a href="${APP_URL}/booking/cancel/${b.id}" style="color:#0B6E76">Cancel here</a> (note: less than 24h notice — reservation fee non-refundable)</p>`))
        await supabase.from('bookings').update({ reminder_24h_sent: true }).eq('id', b.id)
        sent24h++
      }
      for (const b of r1h.value?.data || []) {
        if (!b.patient_email) continue
        await sendEmail(b.patient_email, `Your appointment is in 1 hour — join now`,
          bookingEmailHtml(b, `<p>Kia ora ${b.patient_name.split(' ')[0]},</p>
<p>Your <strong>${b.consultation_type === 'video' ? 'video' : 'phone'} appointment</strong> with ${b.provider_name || 'your provider'} starts at <strong>${b.appointment_time}</strong> — in about 1 hour.</p>
<p><a href="${APP_URL}/booking/join/${b.id}" style="display:inline-block;background:#059669;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:1.1rem">Join now →</a></p>`))
        await supabase.from('bookings').update({ reminder_1h_sent: true }).eq('id', b.id)
        sent1h++
      }

      return res.status(200).json({ ok: true, sent24h, sent1h })
    }

    // Cron: auto-refund bookings with no response after 48h
    if (action === 'auto_refund_no_response') {
      const cutoff = new Date(Date.now() - 48*60*60*1000).toISOString()
      const { data: pending } = await supabase.from('bookings')
        .select('*').eq('status', 'confirmed')
        .lte('provider_change_notified_at', cutoff)
        .is('patient_response', null)
        .not('provider_change_notified_at', 'is', null)

      let refunded = 0
      for (const b of pending || []) {
        const r = await refundBooking(b)
        await supabase.from('bookings').update({
          status: 'cancelled', cancelled_by: 'system',
          cancellation_reason: 'schedule_change_no_response',
          cancelled_at: new Date().toISOString(),
          reservation_fee_refunded: r, patient_response: 'no_response',
        }).eq('id', b.id)
        if (r && b.patient_email) {
          const displayDate = nzDisplay(b.appointment_date, b.appointment_time)
          await sendEmail(b.patient_email, 'Your $15 reservation fee has been refunded',
            bookingEmailHtml(b, `<p>Kia ora ${b.patient_name.split(' ')[0]},</p>
<p>We didn't hear back about your affected appointment on <strong>${displayDate}</strong>. Your <strong>$15 reservation fee has been automatically refunded</strong> and should appear within 5–10 business days.</p>
<p>To book a new appointment: <a href="${APP_URL}/book" style="color:#0B6E76">${APP_URL}/book</a></p>`))
        }
        refunded++
      }

      return res.status(200).json({ ok: true, refunded })
    }

    return res.status(400).json({ error: 'Invalid action' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
