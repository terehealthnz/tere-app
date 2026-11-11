// PHO rural GP coverage — all server logic.
//
// Covers: provider shift self-serve, public slot availability + booking,
// PHO coordinator schedule grid + patient history, consultation creation
// into the scheduled pipeline.
//
// Auth model (mixed — not in AUTH_REQUIRED_ROUTES in handler.js, this
// endpoint gates per-action):
//   PUBLIC  — practice info, available slots, patient-side booking
//   PROVIDER — list/create/cancel own shifts
//   PHO COORD — schedule grid + book-on-behalf + patient history,
//               scoped to their pho_contract_id
//   ADMIN — sees everything; also only path to edit practice records
//
// Schema reference: supabase/2026-11-11_pho_rural_gp.sql

import { createClient } from '@supabase/supabase-js'
import { guardProviderOptional } from './_auth.js'

const sb = () => createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const BOOKING_HORIZON_DAYS = 28  // 4 weeks per Patrick 2026-11-10
const VALID_SLOT_MINUTES = [15, 20, 30]

// ── Helpers ──────────────────────────────────────────────────────────────

// Generate the slot times inside a shift at the shift's cadence, up to
// end_at - slot_minutes (i.e. the last slot fits fully inside the shift).
function slotsInShift(shift) {
  const slots = []
  const start = new Date(shift.start_at).getTime()
  const end   = new Date(shift.end_at).getTime()
  const inc   = shift.slot_minutes * 60 * 1000
  for (let t = start; t + inc <= end; t += inc) {
    slots.push(new Date(t).toISOString())
  }
  return slots
}

// Format an ISO timestamp in NZ-local day+time for display in audit logs.
function nzStr(iso) {
  return new Date(iso).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'medium', timeStyle: 'short' })
}

export default async function handler(req, res) {
  const supabase = sb()
  const auth = await guardProviderOptional(req, res)  // null when no session; doesn't short-circuit
  const method = req.method
  const action = req.query.action || req.body?.action

  try {
    // ── PUBLIC: list active practices ─────────────────────────────────────
    if (method === 'GET' && action === 'practices') {
      const { data } = await supabase.from('rural_practices')
        .select('id,name,slug,phone,address,pho_contract_id,pho_contracts(name,slug)')
        .eq('active', true).order('name')
      return res.status(200).json({ practices: data || [] })
    }

    // ── PUBLIC: single practice by slug (for /gp/[slug] landing) ──────────
    if (method === 'GET' && action === 'practice') {
      const slug = String(req.query.slug || '').trim().toLowerCase()
      if (!slug) return res.status(400).json({ error: 'slug required' })
      const { data } = await supabase.from('rural_practices')
        .select('id,name,slug,phone,address,pho_contract_id,pho_contracts(name,slug,per_consult_fee)')
        .eq('slug', slug).eq('active', true).maybeSingle()
      if (!data) return res.status(404).json({ error: 'Practice not found' })
      return res.status(200).json({ practice: data })
    }

    // ── PUBLIC: available slots for a practice over the next 28 days ─────
    // Generates all slot times from active shifts, subtracts any already-
    // booked (status NOT cancelled/abandoned, booking_type='scheduled').
    // Also excludes slots in the past (safety net; UI should also hide).
    if (method === 'GET' && action === 'available_slots') {
      const slug = String(req.query.practice || '').trim().toLowerCase()
      if (!slug) return res.status(400).json({ error: 'practice slug required' })

      const { data: practice } = await supabase.from('rural_practices')
        .select('id').eq('slug', slug).eq('active', true).maybeSingle()
      if (!practice) return res.status(404).json({ error: 'Practice not found' })

      const now   = new Date()
      const until = new Date(Date.now() + BOOKING_HORIZON_DAYS * 86400 * 1000)

      const [{ data: shifts }, { data: taken }] = await Promise.all([
        supabase.from('provider_rural_shifts')
          .select('id,provider_id,rural_practice_id,start_at,end_at,slot_minutes,providers(first_name,last_name,credential)')
          .eq('rural_practice_id', practice.id)
          .is('cancelled_at', null)
          .gte('end_at', now.toISOString())
          .lte('start_at', until.toISOString())
          .order('start_at'),
        supabase.from('consultations')
          .select('assigned_provider_id,scheduled_for')
          .eq('rural_practice_id', practice.id).eq('booking_type', 'scheduled')
          .not('status', 'in', '("cancelled","abandoned")')
          .gte('scheduled_for', now.toISOString())
          .lte('scheduled_for', until.toISOString()),
      ])

      // Build a fast lookup: provider_id|iso → taken
      const takenSet = new Set()
      for (const t of (taken || [])) {
        if (t.assigned_provider_id && t.scheduled_for) {
          takenSet.add(`${t.assigned_provider_id}|${new Date(t.scheduled_for).toISOString()}`)
        }
      }

      const nowMs = now.getTime()
      const slots = []
      for (const sh of (shifts || [])) {
        const prov = sh.providers || {}
        for (const iso of slotsInShift(sh)) {
          if (new Date(iso).getTime() <= nowMs) continue
          if (takenSet.has(`${sh.provider_id}|${iso}`)) continue
          slots.push({
            start: iso,
            minutes: sh.slot_minutes,
            provider_name: `${prov.first_name || ''} ${prov.last_name || ''}`.trim() || 'Tere GP',
            provider_credential: prov.credential || null,
            shift_id: sh.id,
          })
        }
      }
      return res.status(200).json({ slots, horizon_days: BOOKING_HORIZON_DAYS })
    }

    // ── PUBLIC: book a slot (patient self-booking from /gp/[slug]/book) ──
    // Also used by PHO coordinator + practice staff (same server validation;
    // they go through a different UI but hit the same endpoint). For PHO
    // coord bookings we additionally stamp booked_by for audit.
    if (method === 'POST' && action === 'book') {
      const {
        practice_slug,
        slot_start,
        patient_first_name, patient_last_name, patient_dob,
        patient_phone, patient_email, patient_nhi,
        reason, language,
      } = req.body || {}

      if (!practice_slug || !slot_start) return res.status(400).json({ error: 'practice_slug + slot_start required' })
      if (!patient_first_name || !patient_last_name) return res.status(400).json({ error: 'patient name required' })
      if (!patient_phone) return res.status(400).json({ error: 'patient phone required for SMS reminder' })

      // Find practice
      const { data: practice } = await supabase.from('rural_practices')
        .select('id,name,pho_contract_id').eq('slug', practice_slug).eq('active', true).maybeSingle()
      if (!practice) return res.status(404).json({ error: 'Practice not found' })

      const slotIso = new Date(slot_start).toISOString()
      const slotMs  = new Date(slotIso).getTime()
      if (!Number.isFinite(slotMs) || slotMs <= Date.now()) {
        return res.status(400).json({ error: 'Slot is in the past or invalid' })
      }
      if (slotMs > Date.now() + BOOKING_HORIZON_DAYS * 86400 * 1000) {
        return res.status(400).json({ error: `Slot is beyond the ${BOOKING_HORIZON_DAYS}-day booking horizon` })
      }

      // Find the shift that covers this slot — determines assigned_provider
      // and validates the slot is inside an active (uncancelled) shift.
      const { data: shifts } = await supabase.from('provider_rural_shifts')
        .select('id,provider_id,start_at,end_at,slot_minutes')
        .eq('rural_practice_id', practice.id)
        .is('cancelled_at', null)
        .lte('start_at', slotIso)
        .gt('end_at', slotIso)
      const shift = (shifts || []).find(sh => {
        // Validate the slot falls exactly on a cadence boundary of this shift
        const shiftStart = new Date(sh.start_at).getTime()
        const diff = slotMs - shiftStart
        return diff >= 0 && diff % (sh.slot_minutes * 60 * 1000) === 0 &&
               slotMs + sh.slot_minutes * 60 * 1000 <= new Date(sh.end_at).getTime()
      })
      if (!shift) return res.status(409).json({ error: 'Slot no longer available — provider shift changed. Pick another slot.' })

      // Resolve patient — upsert by NHI if provided, else by phone
      let patientId = null
      if (patient_nhi) {
        const { data: existing } = await supabase.from('patients').select('id').eq('nhi', patient_nhi).maybeSingle()
        if (existing) patientId = existing.id
      }
      if (!patientId && patient_phone) {
        const { data: existing } = await supabase.from('patients').select('id').eq('phone', patient_phone).maybeSingle()
        if (existing) patientId = existing.id
      }
      if (!patientId) {
        const { data: created, error: createErr } = await supabase.from('patients').insert({
          first_name: patient_first_name, last_name: patient_last_name,
          dob: patient_dob || null, phone: patient_phone, email: patient_email || null,
          nhi: patient_nhi || null,
          preferred_language: language || 'en',
        }).select('id').single()
        if (createErr) { console.error('[pho-rural] patient create failed:', createErr); return res.status(500).json({ error: 'Could not create patient record' }) }
        patientId = created.id
      }

      // Create the scheduled consultation. UNIQUE (assigned_provider_id,
      // scheduled_for) WHERE scheduled catches races at DB level.
      const insert = {
        patient_id: patientId,
        provider_id: shift.provider_id,                 // tentative; same as assigned
        assigned_provider_id: shift.provider_id,
        rural_practice_id: practice.id,
        scheduled_for: slotIso,
        booking_type: 'scheduled',
        status: 'scheduled',                            // new status; UI handles
        chief_complaint: reason || null,
        preferred_language: language || 'en',
        fee_tier: 'pho_rural',                          // payroll segregation
        payment_test_mode: false,
        is_practice: false,
        patient_first_name, patient_last_name,
        patient_phone, patient_email: patient_email || null,
      }
      const { data: consult, error: consultErr } = await supabase.from('consultations')
        .insert(insert).select('id').single()
      if (consultErr) {
        // Race-condition case — another booker got this slot in the gap
        if (String(consultErr.code) === '23505' || /duplicate/i.test(consultErr.message || '')) {
          return res.status(409).json({ error: 'That slot was just taken by another booking. Please pick a different time.' })
        }
        console.error('[pho-rural] consultation create failed:', consultErr)
        return res.status(500).json({ error: 'Could not create appointment' })
      }

      return res.status(200).json({
        ok: true, consultation_id: consult.id,
        scheduled_for: slotIso, scheduled_for_nz: nzStr(slotIso),
        practice: practice.name,
      })
    }

    // ── AUTHED paths below — require provider session ─────────────────────
    if (!auth?.provider) return res.status(401).json({ error: 'Login required' })
    const me = auth.provider

    // ── PROVIDER: list my shifts (next 4 weeks + any past uncancelled) ────
    if (method === 'GET' && action === 'my_shifts') {
      const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString()
      const { data } = await supabase.from('provider_rural_shifts')
        .select('id,rural_practice_id,start_at,end_at,slot_minutes,cancelled_at,notes,rural_practices(name,slug)')
        .eq('provider_id', me.id)
        .gte('start_at', since)
        .order('start_at')
      return res.status(200).json({ shifts: data || [] })
    }

    // ── PROVIDER: create a shift ──────────────────────────────────────────
    if (method === 'POST' && action === 'create_shift') {
      const { rural_practice_id, start_at, end_at, slot_minutes, notes } = req.body || {}
      if (!rural_practice_id || !start_at || !end_at) return res.status(400).json({ error: 'rural_practice_id + start_at + end_at required' })
      if (!VALID_SLOT_MINUTES.includes(Number(slot_minutes))) return res.status(400).json({ error: `slot_minutes must be one of ${VALID_SLOT_MINUTES.join(', ')}` })
      if (new Date(end_at).getTime() <= new Date(start_at).getTime()) return res.status(400).json({ error: 'end_at must be after start_at' })

      // Overlap guard — reject if provider already has a shift overlapping
      // this window at the same practice (different practices may run in
      // parallel but the same practice can't have two overlapping shifts).
      const { data: overlap } = await supabase.from('provider_rural_shifts')
        .select('id').eq('provider_id', me.id).eq('rural_practice_id', rural_practice_id)
        .is('cancelled_at', null)
        .lt('start_at', end_at).gt('end_at', start_at).limit(1)
      if (overlap && overlap.length) return res.status(409).json({ error: 'You already have a shift at this practice that overlaps this window' })

      const { data, error } = await supabase.from('provider_rural_shifts').insert({
        provider_id: me.id, rural_practice_id, start_at, end_at,
        slot_minutes: Number(slot_minutes), notes: notes || null,
      }).select('id').single()
      if (error) { console.error('[pho-rural] create_shift failed:', error); return res.status(500).json({ error: 'Could not create shift' }) }
      return res.status(200).json({ ok: true, shift_id: data.id })
    }

    // ── PROVIDER: cancel own shift (soft-cancel, preserves audit) ─────────
    // Blocks if any non-cancelled booking falls inside this shift —
    // provider must reschedule those patients first.
    if (method === 'POST' && action === 'cancel_shift') {
      const { shift_id } = req.body || {}
      if (!shift_id) return res.status(400).json({ error: 'shift_id required' })
      const { data: shift } = await supabase.from('provider_rural_shifts')
        .select('id,provider_id,rural_practice_id,start_at,end_at').eq('id', shift_id).maybeSingle()
      if (!shift) return res.status(404).json({ error: 'Shift not found' })
      if (shift.provider_id !== me.id && !me.is_admin) return res.status(403).json({ error: 'Can only cancel your own shifts' })

      const { data: bookings } = await supabase.from('consultations')
        .select('id').eq('assigned_provider_id', shift.provider_id).eq('rural_practice_id', shift.rural_practice_id)
        .eq('booking_type', 'scheduled')
        .not('status', 'in', '("cancelled","abandoned")')
        .gte('scheduled_for', shift.start_at).lt('scheduled_for', shift.end_at).limit(1)
      if (bookings && bookings.length) return res.status(409).json({ error: 'This shift has booked patients. Reschedule or cancel their appointments first.' })

      const { error } = await supabase.from('provider_rural_shifts')
        .update({ cancelled_at: new Date().toISOString() }).eq('id', shift_id)
      if (error) { console.error('[pho-rural] cancel_shift failed:', error); return res.status(500).json({ error: 'Could not cancel shift' }) }
      return res.status(200).json({ ok: true })
    }

    // ── PHO COORD: schedule grid for their PHO (date range) ───────────────
    // Returns every scheduled consult in the coord's pho_contract_id across
    // all practices, plus practice + provider + patient summaries.
    if (method === 'GET' && action === 'coord_schedule') {
      if (!me.is_pho_coordinator && !me.is_admin) return res.status(403).json({ error: 'PHO coordinator role required' })
      const phoId = me.is_admin ? (req.query.pho_contract_id || me.pho_contract_id) : me.pho_contract_id
      if (!phoId) return res.status(400).json({ error: 'pho_contract_id required' })

      const from = req.query.from || new Date().toISOString()
      const to   = req.query.to   || new Date(Date.now() + BOOKING_HORIZON_DAYS * 86400 * 1000).toISOString()

      // Practices in this PHO → then consults in any of them
      const { data: practices } = await supabase.from('rural_practices').select('id,name,slug').eq('pho_contract_id', phoId)
      const practiceIds = (practices || []).map(p => p.id)
      if (!practiceIds.length) return res.status(200).json({ consultations: [], practices: [] })

      const { data: consults } = await supabase.from('consultations')
        .select('id,scheduled_for,status,rural_practice_id,assigned_provider_id,chief_complaint,patient_first_name,patient_last_name,patient_phone,providers:assigned_provider_id(first_name,last_name,credential)')
        .in('rural_practice_id', practiceIds)
        .eq('booking_type', 'scheduled')
        .gte('scheduled_for', from).lte('scheduled_for', to)
        .order('scheduled_for')

      return res.status(200).json({ consultations: consults || [], practices })
    }

    // ── PHO COORD: patient history (past consults in their PHO) ───────────
    // Scoped: coord only sees history for patients who have had a consult
    // in one of their PHO's practices. Returns demographics + past
    // scheduled-consult summaries (NO clinical note content).
    if (method === 'GET' && action === 'patient_history') {
      if (!me.is_pho_coordinator && !me.is_admin) return res.status(403).json({ error: 'PHO coordinator role required' })
      const patientId = req.query.patient_id
      const phoId = me.is_admin ? (req.query.pho_contract_id || me.pho_contract_id) : me.pho_contract_id
      if (!patientId) return res.status(400).json({ error: 'patient_id required' })
      if (!phoId)     return res.status(400).json({ error: 'pho_contract_id required' })

      // Gate — does this patient have any consult in a practice under my PHO?
      const { data: practices } = await supabase.from('rural_practices').select('id').eq('pho_contract_id', phoId)
      const practiceIds = (practices || []).map(p => p.id)
      if (!practiceIds.length) return res.status(403).json({ error: 'No practices in scope' })

      const { data: scoped } = await supabase.from('consultations')
        .select('id').eq('patient_id', patientId).in('rural_practice_id', practiceIds).limit(1)
      if (!scoped?.length) return res.status(403).json({ error: 'Patient not in your PHO scope' })

      const [{ data: patient }, { data: history }] = await Promise.all([
        supabase.from('patients').select('id,first_name,last_name,dob,phone,email,nhi').eq('id', patientId).single(),
        supabase.from('consultations')
          .select('id,created_at,scheduled_for,status,chief_complaint,rural_practice_id,assigned_provider_id,rural_practices(name),providers:assigned_provider_id(first_name,last_name)')
          .eq('patient_id', patientId)
          .in('rural_practice_id', practiceIds)
          .order('created_at', { ascending: false }).limit(50),
      ])

      return res.status(200).json({ patient, history: history || [] })
    }

    // ── PHO COORD: search patient by NHI/phone/name for booking ───────────
    if (method === 'GET' && action === 'coord_patient_search') {
      if (!me.is_pho_coordinator && !me.is_admin) return res.status(403).json({ error: 'PHO coordinator role required' })
      const phoId = me.is_admin ? (req.query.pho_contract_id || me.pho_contract_id) : me.pho_contract_id
      const q = String(req.query.q || '').trim()
      if (!q) return res.status(400).json({ error: 'q required' })

      const { data: practices } = await supabase.from('rural_practices').select('id').eq('pho_contract_id', phoId)
      const practiceIds = (practices || []).map(p => p.id)
      if (!practiceIds.length) return res.status(200).json({ patients: [] })

      // Patients with at least one consult in PHO scope matching the query
      // (NHI exact, phone exact, or case-insensitive name prefix).
      const orFilter = `nhi.eq.${q},phone.eq.${q},first_name.ilike.${q}%,last_name.ilike.${q}%`
      const { data: candidates } = await supabase.from('patients').select('id,first_name,last_name,dob,phone,nhi').or(orFilter).limit(20)
      const candIds = (candidates || []).map(p => p.id)
      if (!candIds.length) return res.status(200).json({ patients: [] })

      const { data: inScope } = await supabase.from('consultations')
        .select('patient_id').in('patient_id', candIds).in('rural_practice_id', practiceIds)
      const inScopeIds = new Set((inScope || []).map(c => c.patient_id))

      return res.status(200).json({ patients: (candidates || []).filter(p => inScopeIds.has(p.id)) })
    }

    // ── ADMIN: create/edit rural practice ─────────────────────────────────
    if (method === 'POST' && action === 'upsert_practice') {
      if (!me.is_admin) return res.status(403).json({ error: 'Admin only' })
      const { id, pho_contract_id, name, slug, gp_email, phone, address, booking_access_code, active } = req.body || {}
      if (!pho_contract_id || !name || !slug) return res.status(400).json({ error: 'pho_contract_id + name + slug required' })
      const row = { pho_contract_id, name, slug: String(slug).toLowerCase(), gp_email, phone, address, booking_access_code, active: active !== false }
      let out
      if (id) {
        const { data, error } = await supabase.from('rural_practices').update(row).eq('id', id).select('id').single()
        if (error) { console.error('[pho-rural] upsert_practice failed:', error); return res.status(500).json({ error: 'Could not save practice' }) }
        out = data
      } else {
        const { data, error } = await supabase.from('rural_practices').insert(row).select('id').single()
        if (error) { console.error('[pho-rural] upsert_practice failed:', error); return res.status(500).json({ error: 'Could not create practice' }) }
        out = data
      }
      return res.status(200).json({ ok: true, id: out.id })
    }

    return res.status(400).json({ error: `Unknown action "${action}" for method ${method}` })
  } catch (e) {
    console.error('[pho-rural] handler error:', e)
    return res.status(500).json({ error: 'Server error' })
  }
}
